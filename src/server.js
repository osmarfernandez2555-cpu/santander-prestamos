const express = require('express');
const cors = require('cors');
const path = require('path');
const { simularCredito } = require('./scraper');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const resultados = new Map();
const cola = [];
let procesando = false;

async function procesarCola() {
  if (procesando || cola.length === 0) return;
  procesando = true;
  while (cola.length > 0) {
    const { cliente, jobId } = cola.shift();
    resultados.set(jobId, { ...cliente, estado: 'procesando', inicio: new Date().toISOString() });
    console.log(`Procesando: ${cliente.nombre} ${cliente.apellido}`);
    const resultado = await simularCredito(cliente);
    resultados.set(jobId, {
      ...cliente,
      estado: resultado.exito ? 'completado' : 'error',
      ...resultado,
      fin: new Date().toISOString()
    });
    if (cola.length > 0) await new Promise(r => setTimeout(r, 1500));
  }
  procesando = false;
}

app.post('/api/simular', (req, res) => {
  const { clientes } = req.body;
  if (!clientes || !Array.isArray(clientes) || clientes.length === 0)
    return res.status(400).json({ error: 'Se requiere array de clientes' });
  if (clientes.length > 20)
    return res.status(400).json({ error: 'Máximo 20 clientes' });

  const jobs = clientes.map(cliente => {
    const jobId = `${cliente.dni}_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
    cola.push({ cliente, jobId });
    resultados.set(jobId, { ...cliente, estado: 'pendiente', creado: new Date().toISOString() });
    return { jobId, cliente: `${cliente.nombre} ${cliente.apellido}` };
  });

  procesarCola();
  res.json({ mensaje: `${jobs.length} cliente(s) en cola`, jobs });
});

app.get('/api/resultados', (req, res) => {
  res.json(Array.from(resultados.values()));
});

app.get('/api/resultados/:jobId', (req, res) => {
  const entry = Array.from(resultados.entries()).find(([k]) => k === req.params.jobId);
  if (!entry) return res.status(404).json({ error: 'No encontrado' });
  res.json(entry[1]);
});

app.delete('/api/resultados', (req, res) => {
  resultados.clear();
  res.json({ mensaje: 'Limpiado' });
});

app.get('/api/estado', (req, res) => {
  res.json({ enCola: cola.length, procesando, totalResultados: resultados.size });
});

app.listen(PORT, () => console.log(`Santander Checker en puerto ${PORT}`));
