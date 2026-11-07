"""
Generador de Infografías Técnicas
Backend Flask: recibe texto en sucio y lo convierte en JSON estructurado con Claude.
"""

import os
import logging

from flask import Flask, jsonify, render_template, request
from dotenv import load_dotenv
import anthropic

# --------------------------------------------------------------------------
# Configuración
# --------------------------------------------------------------------------
load_dotenv()  # Lee el archivo .env en local. En Render se usan las variables del panel.

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("infografias")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-5-5")
MAX_INPUT_CHARS = int(os.getenv("MAX_INPUT_CHARS", "8000"))

app = Flask(__name__)

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None
if client is None:
    log.warning("ANTHROPIC_API_KEY no está definida: /api/generar devolverá error 500.")

# --------------------------------------------------------------------------
# Contrato de datos: lo que Claude DEBE devolver
# Usamos "tool use" forzado para garantizar un JSON válido con esta forma exacta.
# --------------------------------------------------------------------------
ICONOS_PERMITIDOS = [
    "cable", "fibra", "conector", "empalme", "herramienta", "medicion",
    "seguridad", "alerta", "check", "configuracion", "red", "antena",
    "servidor", "documento", "persona", "tiempo", "limpieza", "info",
]

INFOGRAFIA_TOOL = {
    "name": "generar_infografia",
    "description": "Devuelve el contenido estructurado de una infografía técnica/operativa.",
    "input_schema": {
        "type": "object",
        "properties": {
            "titulo": {
                "type": "string",
                "description": "Título principal, corto y en MAYÚSCULAS (máx. 60 caracteres).",
            },
            "subtitulo": {
                "type": "string",
                "description": "Una frase que explica el objetivo del procedimiento (máx. 120 caracteres).",
            },
            "pasos": {
                "type": "array",
                "minItems": 1,
                "maxItems": 8,
                "items": {
                    "type": "object",
                    "properties": {
                        "numero": {"type": "integer"},
                        "titulo": {"type": "string", "description": "Máx. 40 caracteres."},
                        "descripcion": {"type": "string", "description": "Máx. 180 caracteres."},
                        "icono": {"type": "string", "enum": ICONOS_PERMITIDOS},
                    },
                    "required": ["numero", "titulo", "descripcion", "icono"],
                },
            },
            "notas_importantes": {
                "type": "array",
                "maxItems": 3,
                "items": {"type": "string"},
                "description": "Advertencias o tips clave (máx. 100 caracteres cada uno).",
            },
            "pie": {
                "type": "string",
                "description": "Texto corto para la barra inferior (ej. área o norma de referencia).",
            },
        },
        "required": ["titulo", "subtitulo", "pasos", "notas_importantes", "pie"],
    },
}

SYSTEM_PROMPT = f"""Eres un diseñador instruccional experto en capacitaciones técnicas de \
telecomunicaciones y fibra óptica (FTTH, empalmes, OTDR, conectorización, seguridad en campo).

Tu tarea: transformar el texto desordenado del usuario en el contenido de UNA infografía clara.

Reglas:
- Escribe siempre en español neutro, con lenguaje técnico correcto pero directo.
- Ordena los pasos de forma lógica y secuencial; numéralos desde 1.
- Cada paso: título breve con verbo en infinitivo (ej. "Limpiar el conector") y una descripción concreta.
- Agrupa o resume si hay demasiado detalle: máximo 8 pasos.
- Elige el icono más representativo SOLO de esta lista: {", ".join(ICONOS_PERMITIDOS)}.
- No inventes datos técnicos (valores, normas, medidas) que no estén en el texto.
- Las notas importantes deben ser advertencias de seguridad o tips críticos, si existen.
"""

# --------------------------------------------------------------------------
# Rutas
# --------------------------------------------------------------------------
@app.route("/")
def index():
    return render_template("index.html")


@app.route("/health")
def health():
    """Endpoint ligero para que Render verifique que el servicio está vivo."""
    return jsonify(status="ok", modelo=CLAUDE_MODEL, api_key_configurada=client is not None)


@app.route("/api/generar", methods=["POST"])
def generar():
    if client is None:
        return jsonify(error="El servidor no tiene configurada la API key de Anthropic."), 500

    data = request.get_json(silent=True) or {}
    texto = (data.get("texto") or "").strip()

    if not texto:
        return jsonify(error="Debes enviar un texto para generar la infografía."), 400
    if len(texto) > MAX_INPUT_CHARS:
        return jsonify(error=f"El texto supera el máximo de {MAX_INPUT_CHARS} caracteres."), 400

    try:
        respuesta = client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=2000,
            system=SYSTEM_PROMPT,
            tools=[INFOGRAFIA_TOOL],
            tool_choice={"type": "tool", "name": INFOGRAFIA_TOOL["name"]},
            messages=[
                {
                    "role": "user",
                    "content": f"Convierte este texto en una infografía:\n\n<texto>\n{texto}\n</texto>",
                }
            ],
        )
    except anthropic.AuthenticationError:
        log.exception("API key inválida")
        return jsonify(error="La API key de Anthropic no es válida."), 500
    except anthropic.RateLimitError:
        return jsonify(error="Demasiadas solicitudes. Espera unos segundos e inténtalo de nuevo."), 429
    except anthropic.APIError:
        log.exception("Error llamando a la API de Anthropic")
        return jsonify(error="Error al comunicarse con la IA. Inténtalo de nuevo."), 502

    bloque = next((b for b in respuesta.content if b.type == "tool_use"), None)
    if bloque is None:
        return jsonify(error="La IA no devolvió una estructura válida."), 502

    infografia = bloque.input
    # Normaliza la numeración por si el modelo se salta algún número
    for i, paso in enumerate(infografia.get("pasos", []), start=1):
        paso["numero"] = i

    return jsonify(infografia)


# --------------------------------------------------------------------------
# Arranque local (en Render se usa gunicorn)
# --------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG") == "1")
