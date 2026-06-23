# 🚗 Santander Checker · Tutu Automotores

Herramienta para verificar automáticamente cuánto presta Santander Movilidad a cada cliente.

## ¿Cómo funciona?

1. Cargás una lista de clientes en formato CSV
2. El sistema abre el formulario de Santander por cada cliente automáticamente
3. Completa nombre, DNI, ingresa $10.000.000 de ingreso y relación de dependencia: Sí
4. Captura el monto del préstamo y lo muestra en la tabla

## Deploy en Railway

### Opción A: Desde GitHub (recomendado)

1. Subir este proyecto a GitHub
2. Entrar a [railway.app](https://railway.app)
3. "New Project" → "Deploy from GitHub repo"
4. Seleccionar el repo
5. Railway detecta el Dockerfile automáticamente
6. Esperar el deploy (~3-5 min la primera vez por Chromium)

### Opción B: Railway CLI

```bash
npm install -g @railway/cli
railway login
railway init
railway up
```

## Formato CSV de clientes

```
nombre,apellido,dni,genero,email,codArea,telefono
abel,fernandez,94659158,masculino,abel@gmail.com,370,4415138
maria,gonzalez,12345678,femenino,,351,
juan,perez,87654321,masculino,juan@gmail.com,351,5551234
```

**Campos obligatorios:** nombre, apellido, dni, genero  
**Campos opcionales:** email, codArea, telefono (se usan valores por defecto)

**Géneros válidos:** `masculino` · `femenino` · `no binario`

## Notas importantes

- Máximo 20 clientes por vez para no saturar el sitio
- Cada cliente tarda ~15-30 segundos
- Se procesa de a uno (no en paralelo)
- Los resultados quedan en memoria hasta que se limpian
- El screenshot de cada paso queda guardado para verificar

## Estructura del proyecto

```
santander-checker/
├── src/
│   ├── server.js    → API Express
│   └── scraper.js   → Lógica Puppeteer
├── public/
│   └── index.html   → Frontend
├── Dockerfile
├── railway.json
└── package.json
```
