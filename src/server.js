const express = require('express');
const cors = require('cors');
const path = require('path');
const { simularCredito } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Estado de las simulaciones en memoria
const resultados = new Map();
const cola = [];
let procesando = false;

// Procesar cola de a uno (para no saturar el sitio)
async function procesarCola() {
  if (procesando || cola.length === 0) return;
  procesando = true;

  while (cola.length > 0) {
    const { cliente, jobId } = cola.shift();
    
    resultados.set(jobId, { 
      ...cliente, 
      estado: 'procesando',
      inicio: new Date().toISOString()
    });

    console.log(`Procesando: ${cliente.nombre} ${cliente.apellido} (DNI: ${cliente.dni})`);
    
    const resultado = await simularCredito(cliente);
    
    // Extraer el monto más relevante
    let montoFinal = 'No encontrado';
    if (resultado.exito && resultado.montos.length > 0) {
      // Tomar el monto más grande encontrado (suele ser el préstamo máximo)
      const montosNumericos = resultado.montos
        .map(m => {
          const num = parseFloat(m.replace(/[^0-9]/g, ''));
          return { texto: m, valor: num };
        })
        .filter(m => m.valor > 100000) // Filtrar montos relevantes (>100k)
        .sort((a, b) => b.valor - a.valor);
      
      if (montosNumericos.length > 0) {
        montoFinal = montosNumericos[0].texto;
      }
    }

    resultados.set(jobId, {
      ...cliente,
      estado: resultado.exito ? 'completado' : 'error',
      montoCredito: montoFinal,
      todosMontos: resultado.montos,
      error: resultado.error || null,
      screenshot: resultado.screenshot,
      textoResultado: resultado.textoResultado,
      fin: new Date().toISOString()
    });

    // Esperar entre clientes para no saturar el sitio
    if (cola.length > 0) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }

  procesando = false;
}

// POST /api/simular - Agregar clientes a la cola
app.post('/api/simular', (req, res) => {
  const { clientes } = req.body;
  
  if (!clientes || !Array.isArray(clientes) || clientes.length === 0) {
    return res.status(400).json({ error: 'Se requiere un array de clientes' });
  }

  if (clientes.length > 20) {
    return res.status(400).json({ error: 'Máximo 20 clientes por vez' });
  }

  const jobs = clientes.map(cliente => {
    const jobId = `${cliente.dni}_${Date.now()}`;
    cola.push({ cliente, jobId });
    resultados.set(jobId, {
      ...cliente,
      estado: 'pendiente',
      creado: new Date().toISOString()
    });
    return { jobId, cliente: `${cliente.nombre} ${cliente.apellido}` };
  });

  // Iniciar procesamiento
  procesarCola();

  res.json({ 
    mensaje: `${jobs.length} cliente(s) agregados a la cola`,
    jobs 
  });
});

// GET /api/resultados - Ver todos los resultados
app.get('/api/resultados', (req, res) => {
  const todos = Array.from(resultados.entries()).map(([jobId, data]) => ({
    jobId,
    ...data,
    screenshot: data.screenshot ? '[imagen disponible]' : null
  }));
  res.json(todos);
});

// GET /api/resultados/:jobId - Ver resultado específico con screenshot
app.get('/api/resultados/:jobId', (req, res) => {
  const data = resultados.get(req.params.jobId);
  if (!data) return res.status(404).json({ error: 'Job no encontrado' });
  res.json(data);
});

// DELETE /api/resultados - Limpiar todos los resultados
app.delete('/api/resultados', (req, res) => {
  resultados.clear();
  res.json({ mensaje: 'Resultados limpiados' });
});

// GET /api/estado - Estado de la cola
app.get('/api/estado', (req, res) => {
  res.json({
    enCola: cola.length,
    procesando,
    totalResultados: resultados.size
  });
});

app.listen(PORT, () => {
  console.log(`🚗 Santander Checker corriendo en puerto ${PORT}`);
});
