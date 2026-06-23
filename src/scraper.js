const puppeteer = require('puppeteer');

const SIMULATION_URL = 'https://supermovilidad.com.ar/simulation/?interestedVehicle=fdbe017c-e481-4916-9222-4ad8ca7086dc&vehicleType=car';

async function getBrowser() {
  return puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    defaultViewport: { width: 1280, height: 900 }
  });
}

async function simularCredito(cliente) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36');
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    await page.goto(SIMULATION_URL, { waitUntil: 'networkidle0', timeout: 30000 });

    // Esperar hasta 20 segundos que desaparezca "Cargando..."
    await page.waitForFunction(
      () => !document.body.innerText.includes('Cargando...'),
      { timeout: 20000 }
    ).catch(() => console.log('Timeout esperando carga - continuando igual'));

    await new Promise(r => setTimeout(r, 2000));

    // === DIAGNÓSTICO: capturar todo el DOM ===
    const diagnostico = await page.evaluate(() => {
      // Todos los inputs
      const inputs = Array.from(document.querySelectorAll('input')).map(el => ({
        tag: 'input',
        type: el.type,
        name: el.name,
        id: el.id,
        placeholder: el.placeholder,
        autocomplete: el.autocomplete,
        className: el.className,
        ariaLabel: el.getAttribute('aria-label'),
        value: el.value
      }));

      // Todos los botones
      const botones = Array.from(document.querySelectorAll('button, [role="button"]')).map(el => ({
        texto: el.textContent.trim().substring(0, 80),
        type: el.type,
        className: el.className.substring(0, 50),
        disabled: el.disabled
      }));

      // Texto visible en la página
      const texto = document.body.innerText.substring(0, 2000);

      return { inputs, botones, texto };
    });

    const ss = await page.screenshot({ encoding: 'base64', fullPage: true });
    await browser.close();

    return {
      exito: false, // forzar modo diagnóstico para ver el detalle
      error: '=== DIAGNÓSTICO ===\n' +
        'INPUTS: ' + JSON.stringify(diagnostico.inputs, null, 2) + '\n\n' +
        'BOTONES: ' + JSON.stringify(diagnostico.botones, null, 2) + '\n\n' +
        'TEXTO: ' + diagnostico.texto,
      screenshot: `data:image/png;base64,${ss}`,
      diagnostico
    };

  } catch (error) {
    let ss = null;
    try { ss = await page.screenshot({ encoding: 'base64' }); } catch(e) {}
    await browser.close();
    return { exito: false, error: error.message, screenshot: ss ? `data:image/png;base64,${ss}` : null };
  }
}

module.exports = { simularCredito };
