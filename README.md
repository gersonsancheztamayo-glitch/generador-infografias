# Generador de Infografías

Herramienta web para convertir texto en sucio en infografías de capacitación técnica (estilo "Charla de 5 minutos") y descargarlas como PNG.

- **Backend:** Flask + API de Claude (`app.py`). Convierte el texto en un JSON estructurado.
- **Frontend:** HTML + Tailwind CSS (`templates/index.html`, `static/js/render.js`).
- **Exportación:** html2canvas-pro (`static/vendor/`) para generar el PNG en el navegador.

## Dos formas de generar el contenido

1. **Gratis con Claude Pro (sin API):** pega tu texto → «Copiar prompt» → pégalo en claude.ai
   (puedes adjuntar imágenes de referencia) → copia la respuesta → «Crear infografía».
   La web repara automáticamente errores menores de la respuesta.
2. **Con API (opcional):** añade `ANTHROPIC_API_KEY` en Render → Environment y se activa
   «Generar con IA» en un clic. Consume saldo de la API de Anthropic (se cobra aparte del plan Pro).

## Estructura

```
app.py                  Servidor Flask y llamada a Claude
templates/index.html    Página principal (panel + vista previa)
static/js/render.js     Dibuja la infografía a partir del JSON
static/js/app.js        Edición en vivo, llamada a la IA y descarga PNG
static/js/iconos.js     Íconos disponibles (Lucide)
static/css/src.css      Estilos fuente (Tailwind)
static/css/app.css      CSS compilado (no editar a mano)
static/fonts/           Montserrat e Inter (locales)
```

## Uso local

```bash
python -m venv venv
venv\Scripts\activate          # Mac/Linux: source venv/bin/activate
pip install -r requirements.txt
copy .env.example .env         # Mac/Linux: cp .env.example .env  → pon tu ANTHROPIC_API_KEY
python app.py                  # http://localhost:5000
```

## Cambiar estilos

Si editas `static/css/src.css` o usas clases de Tailwind nuevas, recompila el CSS (requiere Node.js):

```bash
npm install
npm run build:css
```

## Variables de entorno

| Variable | Descripción | Por defecto |
|---|---|---|
| `ANTHROPIC_API_KEY` | Clave de la API de Anthropic (opcional: activa «Generar con IA») | — |
| `CLAUDE_MODEL` | Modelo a usar | `claude-sonnet-5-5` |
| `MAX_INPUT_CHARS` | Máximo de caracteres del texto de entrada | `8000` |
