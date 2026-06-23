const puppeteer = require('puppeteer');

const URL_BASE = 'https://supermovilidad.com.ar/cars-inventory/detail/fdbe017c-e481-4916-9222-4ad8ca7086dc';

async function simularCredito(cliente) {
  const browser = await puppeteer.launch({
    headless: 'new',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--window-size=1280,800'
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    console.log(`[${cliente.nombre}] Abriendo página...`);
    await page.goto(URL_BASE, { waitUntil: 'networkidle2', timeout: 30000 });

    // Buscar botón de simular crédito/préstamo
    console.log(`[${cliente.nombre}] Buscando botón de simulación...`);
    await page.waitForTimeout(2000);

    // Intentar hacer click en el botón de simular
    const botonSimular = await page.evaluate(() => {
      const botones = Array.from(document.querySelectorAll('button, a'));
      const boton = botones.find(b => 
        b.textContent.toLowerCase().includes('simul') || 
        b.textContent.toLowerCase().includes('crédito') ||
        b.textContent.toLowerCase().includes('financ') ||
        b.textContent.toLowerCase().includes('préstamo') ||
        b.textContent.toLowerCase().includes('cuota')
      );
      if (boton) {
        boton.click();
        return boton.textContent.trim();
      }
      return null;
    });

    if (!botonSimular) {
      // Buscar por links también
      await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href*="simul"], a[href*="credito"], a[href*="financ"]'));
        if (links[0]) links[0].click();
      });
    }

    await page.waitForTimeout(3000);

    // === PASO 1: COMPLETAR DATOS PERSONALES ===
    console.log(`[${cliente.nombre}] Completando datos personales...`);

    // Esperar que aparezca el formulario
    try {
      await page.waitForSelector('input[name*="nombre"], input[placeholder*="nombre"], input[id*="nombre"]', { timeout: 10000 });
    } catch (e) {
      // Intentar buscar cualquier input visible
      await page.waitForSelector('input[type="text"]', { timeout: 10000 });
    }

    // Limpiar y completar Nombre
    const campoNombre = await page.$('input[name*="nombre"], input[placeholder*="nombre"], input[id*="nombre"], input[aria-label*="ombre"]');
    if (campoNombre) {
      await campoNombre.click({ clickCount: 3 });
      await campoNombre.type(cliente.nombre, { delay: 50 });
    }

    // Apellido
    const campoApellido = await page.$('input[name*="apellido"], input[placeholder*="apellido"], input[id*="apellido"]');
    if (campoApellido) {
      await campoApellido.click({ clickCount: 3 });
      await campoApellido.type(cliente.apellido, { delay: 50 });
    }

    // DNI
    const campoDNI = await page.$('input[name*="dni"], input[placeholder*="dni"], input[id*="dni"], input[name*="documento"]');
    if (campoDNI) {
      await campoDNI.click({ clickCount: 3 });
      await campoDNI.type(cliente.dni, { delay: 50 });
    }

    // Género - seleccionar según el cliente
    const genero = (cliente.genero || 'masculino').toLowerCase();
    await page.evaluate((genero) => {
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      const radioGenero = radios.find(r => {
        const label = r.closest('label') || document.querySelector(`label[for="${r.id}"]`);
        return label && label.textContent.toLowerCase().includes(genero.substring(0, 4));
      });
      if (radioGenero) radioGenero.click();
    }, genero);

    // Cód. Área (ya viene completado pero por si acaso)
    const campoArea = await page.$('input[name*="area"], input[placeholder*="área"], input[id*="area"], input[name*="cod"]');
    if (campoArea) {
      const val = await page.evaluate(el => el.value, campoArea);
      if (!val) {
        await campoArea.click({ clickCount: 3 });
        await campoArea.type(cliente.codArea || '351', { delay: 50 });
      }
    }

    // Teléfono
    const campoTel = await page.$('input[name*="telefono"], input[name*="phone"], input[placeholder*="teléfono"], input[id*="telefono"]');
    if (campoTel) {
      const val = await page.evaluate(el => el.value, campoTel);
      if (!val) {
        await campoTel.click({ clickCount: 3 });
        await campoTel.type(cliente.telefono || '4415138', { delay: 50 });
      }
    }

    // Email
    const campoEmail = await page.$('input[type="email"], input[name*="email"], input[placeholder*="mail"]');
    if (campoEmail) {
      await campoEmail.click({ clickCount: 3 });
      await campoEmail.type(cliente.email || 'consulta@tutuautomotores.com', { delay: 50 });
    }

    // Aceptar términos y condiciones
    await page.evaluate(() => {
      const checkboxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
      checkboxes.forEach(cb => { if (!cb.checked) cb.click(); });
    });

    await page.waitForTimeout(500);

    // Click en "Confirmá sólo para simular"
    console.log(`[${cliente.nombre}] Haciendo click en simular...`);
    const clickado = await page.evaluate(() => {
      const botones = Array.from(document.querySelectorAll('button, input[type="submit"], a'));
      const boton = botones.find(b => 
        b.textContent.toLowerCase().includes('solo para simular') ||
        b.textContent.toLowerCase().includes('sólo para simular') ||
        b.textContent.toLowerCase().includes('solo simular')
      );
      if (boton) { boton.click(); return true; }
      
      // Si no encuentra ese botón, busca cualquier botón de continuar/confirmar
      const botonContinuar = botones.find(b => 
        b.textContent.toLowerCase().includes('continuar') ||
        b.textContent.toLowerCase().includes('confirmar') ||
        b.textContent.toLowerCase().includes('siguiente')
      );
      if (botonContinuar) { botonContinuar.click(); return true; }
      return false;
    });

    if (!clickado) {
      throw new Error('No se encontró botón de simulación');
    }

    // === PASO 2: COMPLETAR INGRESOS ===
    console.log(`[${cliente.nombre}] Esperando paso de ingresos...`);
    await page.waitForTimeout(3000);

    // Completar ingresos con 10.000.000
    const campoIngresos = await page.$('input[name*="ingreso"], input[placeholder*="ingreso"], input[id*="ingreso"]');
    if (campoIngresos) {
      await campoIngresos.click({ clickCount: 3 });
      await campoIngresos.type('10000000', { delay: 50 });
    }

    // Relación de dependencia: SI
    await page.evaluate(() => {
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      const radioSi = radios.find(r => {
        const label = r.closest('label') || document.querySelector(`label[for="${r.id}"]`);
        return label && (label.textContent.trim() === 'Sí' || label.textContent.trim() === 'Si');
      });
      if (radioSi) radioSi.click();
    });

    await page.waitForTimeout(500);

    // Cotitular: NO (ya viene seleccionado pero confirmar)
    await page.evaluate(() => {
      const radios = Array.from(document.querySelectorAll('input[type="radio"]'));
      // Buscar específicamente el radio de "No" para cotitular
      const labels = Array.from(document.querySelectorAll('label'));
      const labelCotitular = labels.find(l => l.textContent.toLowerCase().includes('cotitular'));
      if (labelCotitular) {
        const container = labelCotitular.closest('div, section, form');
        if (container) {
          const radioNo = Array.from(container.querySelectorAll('input[type="radio"]')).find(r => {
            const lbl = r.closest('label') || document.querySelector(`label[for="${r.id}"]`);
            return lbl && lbl.textContent.trim() === 'No';
          });
          if (radioNo) radioNo.click();
        }
      }
    });

    await page.waitForTimeout(500);

    // Click en Continuar
    console.log(`[${cliente.nombre}] Continuando...`);
    await page.evaluate(() => {
      const botones = Array.from(document.querySelectorAll('button, input[type="submit"]'));
      const boton = botones.find(b => 
        b.textContent.toLowerCase().includes('continuar') ||
        b.textContent.toLowerCase().includes('calcular') ||
        b.textContent.toLowerCase().includes('simular') ||
        b.textContent.toLowerCase().includes('siguiente')
      );
      if (boton) boton.click();
    });

    // === PASO 3: CAPTURAR RESULTADO ===
    console.log(`[${cliente.nombre}] Esperando resultado...`);
    await page.waitForTimeout(5000);

    // Capturar el monto del resultado
    const resultado = await page.evaluate(() => {
      const body = document.body.innerText;
      
      // Buscar patrones de monto: $X.XXX.XXX o similar
      const patrones = [
        /\$\s*[\d.,]+/g,
        /prestamos?\s+hasta\s+\$?\s*[\d.,]+/gi,
        /monto\s*:?\s*\$?\s*[\d.,]+/gi,
        /[\d.,]+\s*pesos/gi,
        /hasta\s+\$?\s*[\d.,]+/gi,
        /te\s+prestamos?\s+\$?\s*[\d.,]+/gi,
        /crédito\s+de\s+\$?\s*[\d.,]+/gi,
        /financiamos?\s+\$?\s*[\d.,]+/gi
      ];

      const montos = [];
      for (const patron of patrones) {
        const matches = body.match(patron);
        if (matches) montos.push(...matches);
      }

      // También buscar elementos con clases relacionadas a precio/monto
      const elemMontos = document.querySelectorAll('[class*="monto"], [class*="precio"], [class*="amount"], [class*="valor"], [class*="total"], [class*="credito"]');
      elemMontos.forEach(el => {
        if (el.textContent.trim()) montos.push(el.textContent.trim());
      });

      return {
        montos: montos.slice(0, 10),
        textoCompleto: body.substring(0, 2000)
      };
    });

    // Screenshot para debug
    const screenshot = await page.screenshot({ encoding: 'base64', fullPage: false });

    await browser.close();

    return {
      exito: true,
      montos: resultado.montos,
      textoResultado: resultado.textoCompleto,
      screenshot: `data:image/png;base64,${screenshot}`
    };

  } catch (error) {
    console.error(`[${cliente.nombre}] Error:`, error.message);
    
    let screenshot = null;
    try {
      screenshot = await page.screenshot({ encoding: 'base64' });
    } catch (e) {}
    
    await browser.close();
    
    return {
      exito: false,
      error: error.message,
      screenshot: screenshot ? `data:image/png;base64,${screenshot}` : null
    };
  }
}

module.exports = { simularCredito };
