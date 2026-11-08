# Generador de Infografías

Herramienta web para convertir texto en sucio en infografías de capacitación técnica (estilo "Charla de 5 minutos") y descargarlas como PNG.

- **Backend:** Flask + API de Claude (`app.py`). Convierte el texto en un JSON estructurado.
- **Frontend:** HTML + Tailwind CSS (`templates/index.html`, `static/js/render.js`).
- **Exportación:** html2canvas-pro (`static/vendor/`) para generar el PNG en el navegador.

## Cómo funciona

1. **Contenido:** pega tu texto en sucio y, si quieres, hasta 4 **imágenes de referencia**
   (capturas, fotos, infografías antiguas; también con Ctrl+V o arrastrando). Pulsa **Generar con IA**.
2. **Diseño:** formato, colores, fotos por sección, logo. Clic en cualquier texto para corregirlo.
3. **Revisión con IA antes de descargar:** detecta faltas de ortografía, siglas inconsistentes,
   frases confusas, textos demasiado largos y datos de clientes. Eliges qué correcciones aplicar
   (y puedes editarlas). Si cambias algo después, la web vuelve a pedir revisión.

### ¿Qué IA usa?
| Configuración | Generar y revisar | Costo |
|---|---|---|
| `GEMINI_API_KEY` (recomendado) | En un clic, lee texto e imágenes | Gratis (plan gratuito de Google AI Studio) |
| `ANTHROPIC_API_KEY` | En un clic | Pago por uso |
| Ninguna clave | Copiar/pegar con tu Claude Pro | Gratis |

⚠ En el plan gratuito de Gemini, Google puede usar lo enviado para mejorar sus modelos.
No subas datos personales de clientes.

**Obtener la clave de Gemini:** https://aistudio.google.com → *Get API key* → *Create API key*.
Pégala en Render → tu servicio → *Environment* → `GEMINI_API_KEY`.

## Estructura

```
app.py                  Servidor Flask: generar, revisar, prompts del modo copiar/pegar
ia.py                   Conexión con Gemini (preferido) o Claude
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
| `GEMINI_API_KEY` | Clave gratuita de Google AI Studio (activa «Generar» y «Revisar con IA») | — |
| `GEMINI_MODEL` | Modelo de Gemini | `gemini-3.8-flash` (con respaldo automático) |
| `ANTHROPIC_API_KEY` | Alternativa de pago: API de Anthropic | — |
| `CLAUDE_MODEL` | Modelo de Claude | `claude-sonnet-5-5` |
| `MAX_INPUT_CHARS` | Máximo de caracteres del texto de entrada | `8000` |
