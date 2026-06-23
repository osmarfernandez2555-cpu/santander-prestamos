const https = require('https');

const BASE = 'https://autoloans.santanderautos.com.ar';

// Credenciales públicas del portal APER_MKT (hardcodeadas en el JS del sitio)
const PUBLIC_CREDENTIALS = {
  username: 'PORTAL_PUBLICO_APER_MKT',
  password: 'PORTAL_PUBLICO_APER_MKT'
};

// Datos fijos del vehículo (Audi Q5 2019 - $47.000.000 - tienda MAIPU 2953)
const VEHICLE = {
  vehicleType: { id: 1, description: 'AUTO', filter: 'A' },
  fuelYear: { year: 2019, description: '2019 ', zeroKm: false },
  purchaseValue: 47000000
};
const STORE = {
  id: 2953,
  integrationCode: '66',
  name: 'MAIPU SA',
  sellingPointCode: 2953,
  strategyCode: 'C2953'
};

function apiRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'autoloans.santanderautos.com.ar',
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'es-ES,es;q=0.9',
        'Origin': BASE,
        'Referer': BASE + '/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'sec-fetch-dest': 'empty',
        'sec-fetch-mode': 'cors',
        'sec-fetch-site': 'same-origin',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };

    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(raw) });
        } catch(e) {
          resolve({ status: res.statusCode, data: raw });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Paso 1: obtener token público
async function getToken() {
  // El sitio usa un Bearer pre-generado que se renueva.
  // Replicamos el POST a /login/public/token con las credenciales del portal público.
  const res = await apiRequest('POST', '/sanrioapigwb2b/login/public/token', {
    username: 'PORTAL_PUBLICO_APER_MKT',
    channel: 'APER_MKT'
  }, null);

  if (res.status === 200 && res.data?.token) return res.data.token;
  if (res.status === 200 && res.data?.accessToken) return res.data.accessToken;
  
  // Si el endpoint necesita auth básica, probar con el token que viene hardcodeado
  // El JWT del sitio tiene exp ~60min, intentar extraerlo del payload
  throw new Error(`Token failed: ${res.status} - ${JSON.stringify(res.data).substring(0, 200)}`);
}

// Paso 2: crear identificación (onboarding) con datos del cliente
async function crearIdentificacion(cliente, token) {
  const generoId = (cliente.genero || 'masculino').toLowerCase().startsWith('f') ? 'F' : 'M';
  const generoDesc = generoId === 'F' ? 'Femenino' : 'Masculino';

  const body = {
    channel: 'APER_MKT',
    customer: {
      firstName: cliente.nombre.toUpperCase(),
      lastName: cliente.apellido.toUpperCase(),
      document: cliente.dni,
      gender: { id: generoId, description: generoDesc },
      documentType: { id: 151, description: 'DNI - EXTRANJERO', integrationCode: '01' },
      income: 10000000,
      email: cliente.email || 'consulta@tutuautomotores.com',
      cellPhone: {
        areaCode: cliente.codArea || '351',
        number: cliente.telefono || '4415138'
      },
      owner: true,
      isManualInput: true
    },
    vehicle: VEHICLE,
    store: STORE,
    loanType: 'PR',
    simulationType: 'V'
  };

  const res = await apiRequest('POST', '/sanrioapigwb2b/onboarding/identification', body, token);
  if (res.status !== 200 && res.status !== 201) {
    throw new Error(`Identificación falló: ${res.status} - ${JSON.stringify(res.data).substring(0, 300)}`);
  }
  return res.data;
}

// Paso 3: obtener simulación con el UUID creado
async function obtenerSimulacion(uuid, token) {
  const res = await apiRequest('GET', `/sanrioapigwb2b/onboarding/identification/${uuid}/simulation`, null, token);
  if (res.status !== 200) {
    throw new Error(`Simulación falló: ${res.status} - ${JSON.stringify(res.data).substring(0, 300)}`);
  }
  return res.data;
}

// Función principal
async function simularCredito(cliente) {
  try {
    console.log(`[${cliente.nombre}] Obteniendo token...`);
    const token = await getToken();

    console.log(`[${cliente.nombre}] Creando identificación...`);
    const identificacion = await crearIdentificacion(cliente, token);
    
    const uuid = identificacion.uuid || identificacion.id;
    if (!uuid) throw new Error('No se obtuvo UUID: ' + JSON.stringify(identificacion).substring(0, 200));

    console.log(`[${cliente.nombre}] UUID: ${uuid} - Obteniendo simulación...`);
    const simulacion = await obtenerSimulacion(uuid, token);

    const scoring = simulacion.scoring?.riskEvaluation?.riskEvaluationResultDTO;
    if (!scoring) throw new Error('Sin datos de scoring en respuesta');

    const aprobado = scoring.approved === true;
    const rechazado = scoring.rejected === true;

    return {
      exito: true,
      aprobado,
      rechazado,
      statusCode: scoring.statusCode,
      // Tasa fija (TRD)
      montoTRD: scoring.finalAmount,
      cuotasTRD: scoring.finalInstallment,
      cuotaValorTRD: scoring.finalInstallmentValue,
      // UVA
      montoUVA: scoring.finalAmountUVA,
      cuotasUVA: scoring.finalInstallmentUVA,
      // Resumen para la tabla
      montoCredito: aprobado
        ? `$${(scoring.finalAmount || 0).toLocaleString('es-AR')} (${scoring.finalInstallment} cuotas)`
        : rechazado ? 'RECHAZADO' : `PENDIENTE (${scoring.statusCode})`,
      rawScoring: scoring
    };

  } catch (error) {
    console.error(`[${cliente.nombre}] ERROR:`, error.message);
    return { exito: false, error: error.message };
  }
}

module.exports = { simularCredito };
