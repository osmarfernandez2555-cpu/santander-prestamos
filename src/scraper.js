const puppeteer = require('puppeteer');

// URL directa al simulador - evita tener que navegar y hacer click
const SIMULATION_URL = (vehicleId) => 
  `https://supermovilidad.com.ar/simulation/?interestedVehicle=${vehicleId}&vehicleType=car`;

const VEHICLE_ID = 'fdbe017c-e481-4916-9222-4ad8ca7086dc';

async function getBrowser() {
  return puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1280,900'
    ],
    defaultViewport: { width: 1280, height: 900 }
  });
}

async function typeInField(page, selector, value) {
  const el = await page.$(selector);
  if (!el) return false;
  await el.click({ clickCount: 3 });
  await el.press('Backspace');
  await el.type(String(value), { delay: 40 });
  return true;
}

async function waitForReact(page) {
  // Esperar que React hidrate y desaparezca el "Cargando..."
  await page.waitForFunction(
    () => !document.body.innerText.includes('Cargando...'),
    { timeout: 15000 }
  );
  await new Promise(r => setTimeout(r, 1000));
}

async function simularCredito(cliente) {
  const browser = await getBrowser();
  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
  );

  // Ocultar que es Puppeteer
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    // === PASO 1: Ir directo al simulador ===
    console.log(`[${cliente.nombre}] Abriendo simulador...`);
    await page.goto(SIMULATION_URL(VEHICLE_ID), { waitUntil: 'networkidle0', timeout: 30000 });

    // Esperar que React hidrate el formulario
    await waitForReact(page);
    console.log(`[${cliente.nombre}] Formulario cargado`);

    // Screenshot del estado inicial
    const ss0 = await page.screenshot({ encoding: 'base64' });

    // === PASO 2: Completar datos personales ===
    // Nombre - buscar por label o placeholder
    const inputNombre = await page.waitForSelector(
      'input[autocomplete="given-name"], input[name="firstName"], input[id*="nombre" i], input[placeholder*="Nombre" i], input[aria-label*="ombre" i]',
      { timeout: 10000 }
    );
    await inputNombre.click({ clickCount: 3 });
    await inputNombre.type(cliente.nombre, { delay: 40 });

    // Apellido
    await typeInField(page,
      'input[autocomplete="family-name"], input[name="lastName"], input[id*="apellido" i], input[placeholder*="Apellido" i]',
      cliente.apellido
    );

    // DNI
    await typeInField(page,
      'input[name*="dni" i], input[id*="dni" i], input[placeholder*="DNI" i], input[inputmode="numeric"][maxlength="8"], input[inputmode="numeric"][maxlength="9"]',
      cliente.dni
    );

    // Género - radio buttons
    const genero = (cliente.genero || 'masculino').toLowerCase();
    const generoTexto = genero.includes('fem') ? 'Femenino' : genero.includes('bin') ? 'no binario' : 'Masculino';
    
    await page.evaluate((texto) => {
      // Buscar radio por texto del label
      const labels = Array.from(document.querySelectorAll('label'));
      for (const label of labels) {
        if (label.textContent.trim().toLowerCase() === texto.toLowerCase()) {
          const input = label.querySelector('input[type="radio"]') ||
            document.getElementById(label.getAttribute('for'));
          if (input) { input.click(); return true; }
        }
      }
      // Buscar radio por value
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      const radio = radios.find(r => r.value.toLowerCase().includes(texto.substring(0, 4).toLowerCase()));
      if (radio) radio.click();
    }, generoTexto);

    // Cod área (si está vacío)
    const areaCampo = await page.$('input[name*="area" i], input[id*="area" i], input[placeholder*="área" i], input[placeholder*="Código" i]');
    if (areaCampo) {
      const val = await page.evaluate(el => el.value, areaCampo);
      if (!val || val === '') {
        await areaCampo.click({ clickCount: 3 });
        await areaCampo.type(cliente.codArea || '351', { delay: 40 });
      }
    }

    // Teléfono (si está vacío)
    const telCampo = await page.$('input[name*="phone" i], input[name*="telefono" i], input[id*="telefono" i], input[placeholder*="teléfono" i], input[placeholder*="Número" i]');
    if (telCampo) {
      const val = await page.evaluate(el => el.value, telCampo);
      if (!val || val === '') {
        await telCampo.click({ clickCount: 3 });
        await telCampo.type(cliente.telefono || '4415138', { delay: 40 });
      }
    }

    // Email
    await typeInField(page,
      'input[type="email"], input[name*="email" i], input[id*="email" i], input[placeholder*="mail" i]',
      cliente.email || 'consulta@tutuautomotores.com'
    );

    // Aceptar términos
    await page.evaluate(() => {
      document.querySelectorAll('input[type="checkbox"]').forEach(cb => {
        if (!cb.checked) cb.click();
      });
    });

    await new Promise(r => setTimeout(r, 500));

    // Click en "Confirmá sólo para simular"
    const clickSimular = await page.evaluate(() => {
      const all = Array.from(document.querySelectorAll('button, [role="button"]'));
      const btn = all.find(b => {
        const t = b.textContent.toLowerCase();
        return t.includes('solo para simular') || t.includes('sólo para simular') || t.includes('solo simular');
      });
      if (btn) { btn.click(); return btn.textContent.trim(); }

      // Fallback: segundo botón de la fila (el primero es "ser contactado")
      const btns = all.filter(b => b.textContent.toLowerCase().includes('simul'));
      if (btns.length > 0) { btns[btns.length - 1].click(); return btns[btns.length - 1].textContent.trim(); }
      return null;
    });

    console.log(`[${cliente.nombre}] Botón clickeado: ${clickSimular || 'no encontrado'}`);

    if (!clickSimular) {
      const ss = await page.screenshot({ encoding: 'base64' });
      throw new Error('No se encontró botón "Confirmá sólo para simular"');
    }

    // === PASO 3: Esperar y completar ingresos ===
    console.log(`[${cliente.nombre}] Esperando paso de ingresos...`);
    
    // Esperar que aparezca campo de ingresos
    try {
      await page.waitForSelector(
        'input[name*="ingreso" i], input[id*="ingreso" i], input[placeholder*="ingreso" i]',
        { timeout: 10000 }
      );
    } catch (e) {
      // Si no aparece campo de ingresos, capturar el estado actual
      const ss = await page.screenshot({ encoding: 'base64' });
      const texto = await page.evaluate(() => document.body.innerText.substring(0, 1000));
      console.log(`[${cliente.nombre}] Texto actual:`, texto.substring(0, 200));
      throw new Error('No apareció el campo de ingresos. Puede haber cambio en el flujo.');
    }

    await typeInField(page,
      'input[name*="ingreso" i], input[id*="ingreso" i], input[placeholder*="ingreso" i]',
      '10000000'
    );

    // Relación de dependencia: SÍ
    await page.evaluate(() => {
      const labels = Array.from(document.querySelectorAll('label'));
      // Buscar el label "Sí" dentro del contexto de relación de dependencia
      for (const label of labels) {
        const texto = label.textContent.trim();
        if (texto === 'Sí' || texto === 'Si') {
          const input = label.querySelector('input[type="radio"]') ||
            document.getElementById(label.getAttribute('for'));
          if (input) { input.click(); return; }
        }
      }
      // Fallback: primer radio Sí que encuentre
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      const radioSi = radios.find(r => {
        const lbl = r.closest('label') || document.querySelector(`label[for="${r.id}"]`);
        return lbl && (lbl.textContent.trim() === 'Sí' || lbl.textContent.trim() === 'Si');
      });
      if (radioSi) radioSi.click();
    });

    await new Promise(r => setTimeout(r, 300));

    // Click continuar
    await page.evaluate(() => {
      const btns = Array.from(document.querySelectorAll('button, [role="button"]'));
      const btn = btns.find(b => {
        const t = b.textContent.toLowerCase();
        return t.includes('continuar') || t.includes('calcular') || t.includes('siguiente') || t.includes('simular');
      });
      if (btn) btn.click();
    });

    // === PASO 4: Capturar resultado ===
    console.log(`[${cliente.nombre}] Esperando resultado final...`);
    await new Promise(r => setTimeout(r, 6000));

    const ss_final = await page.screenshot({ encoding: 'base64', fullPage: true });

    const resultado = await page.evaluate(() => {
      const texto = document.body.innerText;
      const montos = [];

      // Patrones argentinos: $ 12.000.000 / $12.000.000 / 12.000.000 pesos
      const patrones = [
        /\$\s*[\d]{1,3}(?:[.,]\d{3})+/g,
        /[\d]{1,3}(?:\.\d{3})+(?:,\d{2})?\s*(?:pesos)?/g,
        /hasta\s+\$?\s*[\d.,]+/gi,
        /prestamos?\s+\$?\s*[\d.,]+/gi,
        /monto[^:]*:\s*\$?\s*[\d.,]+/gi,
        /financiamos?\s+hasta\s+\$?\s*[\d.,]+/gi,
      ];

      for (const pat of patrones) {
        const matches = texto.match(pat);
        if (matches) montos.push(...matches.map(m => m.trim()));
      }

      // Buscar en elementos con clases de precio/monto
      document.querySelectorAll('[class*="amount" i], [class*="monto" i], [class*="price" i], [class*="total" i], [class*="valor" i], [class*="credito" i], [class*="result" i], h2, h3').forEach(el => {
        const t = el.textContent.trim();
        if (t.match(/\$/) && t.length < 100) montos.push(t);
      });

      return {
        montos: [...new Set(montos)].slice(0, 15),
        textoCompleto: texto.substring(0, 3000)
      };
    });

    await browser.close();

    return {
      exito: true,
      montos: resultado.montos,
      textoResultado: resultado.textoCompleto,
      screenshot: `data:image/png;base64,${ss_final}`,
      screenshotInicio: `data:image/png;base64,${ss0}`
    };

  } catch (error) {
    console.error(`[${cliente.nombre}] ERROR:`, error.message);
    let ss = null;
    try { ss = await page.screenshot({ encoding: 'base64', fullPage: false }); } catch(e) {}
    await browser.close();
    return {
      exito: false,
      error: error.message,
      screenshot: ss ? `data:image/png;base64,${ss}` : null
    };
  }
}

module.exports = { simularCredito };
