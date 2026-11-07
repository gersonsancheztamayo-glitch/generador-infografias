"""
Generador de Infografías Técnicas
Backend Flask: recibe texto en sucio y lo convierte en JSON estructurado con Claude.
"""

import json
import logging
import os
import re
from pathlib import Path

import anthropic
from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request

# --------------------------------------------------------------------------
# Configuración
# --------------------------------------------------------------------------
load_dotenv()  # Lee el archivo .env en local. En Render se usan las variables del panel.

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("infografias")

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-5-5")
MAX_INPUT_CHARS = int(os.getenv("MAX_INPUT_CHARS", "8000"))

BASE_DIR = Path(__file__).resolve().parent
app = Flask(__name__)

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY) if ANTHROPIC_API_KEY else None
if client is None:
    log.warning("ANTHROPIC_API_KEY no está definida: /api/generar devolverá error 500.")


# --------------------------------------------------------------------------
# Íconos: la lista se lee de static/js/iconos.js (una sola fuente de verdad)
# --------------------------------------------------------------------------
def cargar_iconos() -> list[str]:
    js = (BASE_DIR / "static" / "js" / "iconos.js").read_text(encoding="utf-8")
    data = json.loads(js[js.index("{"): js.rindex("}") + 1])
    return sorted(k for k in data if not k.startswith("_"))  # "_x" = íconos internos de la UI


ICONOS = cargar_iconos()
COLORES = ["azul", "verde", "morado", "naranja", "rojo", "celeste"]

# --------------------------------------------------------------------------
# Contrato de datos: lo que Claude DEBE devolver.
# Usamos "tool use" forzado para garantizar un JSON válido con esta forma exacta.
# --------------------------------------------------------------------------
ITEM_ICONO = {
    "type": "object",
    "properties": {
        "icono": {"type": "string", "enum": ICONOS},
        "texto": {"type": "string", "description": "Máx. 45 caracteres."},
    },
    "required": ["icono", "texto"],
}

INFOGRAFIA_TOOL = {
    "name": "generar_infografia",
    "description": "Devuelve el contenido estructurado de una infografía técnica/operativa.",
    "input_schema": {
        "type": "object",
        "properties": {
            "titulo_linea1": {
                "type": "string",
                "description": "Primera línea del título, MAYÚSCULAS, máx. 24 caracteres. Ej: 'REGLAS CLAVE PARA'.",
            },
            "titulo_linea2": {
                "type": "string",
                "description": "Segunda línea del título (va resaltada en color), MAYÚSCULAS, máx. 24 caracteres. Ej: 'TENDIDOS EXTERNOS'.",
            },
            "subtitulo": {
                "type": "string",
                "description": "Frase motivadora u objetivo, máx. 90 caracteres.",
            },
            "secciones": {
                "type": "array",
                "minItems": 1,
                "maxItems": 6,
                "items": {
                    "type": "object",
                    "properties": {
                        "titulo": {
                            "type": "string",
                            "description": "MAYÚSCULAS, máx. 32 caracteres. Ej: 'ORDEN Y LIMPIEZA DE LA UNIDAD'.",
                        },
                        "color": {"type": "string", "enum": COLORES},
                        "icono": {"type": "string", "enum": ICONOS},
                        "descripcion": {
                            "type": "string",
                            "description": "1-2 frases, máx. 160 caracteres. Puede ir vacía.",
                        },
                        "puntos": {
                            "type": "array",
                            "maxItems": 5,
                            "items": {"type": "string"},
                            "description": "Viñetas con check, máx. 70 caracteres cada una.",
                        },
                        "chips": {
                            "type": "array",
                            "maxItems": 4,
                            "items": ITEM_ICONO,
                            "description": "Conceptos clave con ícono (ej. Respeto, Amabilidad). Opcional.",
                        },
                        "destacado": {
                            "type": "object",
                            "description": "Mensaje resaltado al pie de la sección. Opcional.",
                            "properties": {
                                "tipo": {"type": "string", "enum": ["ok", "alerta", "error", "info"]},
                                "texto": {"type": "string", "description": "Máx. 110 caracteres."},
                            },
                            "required": ["tipo", "texto"],
                        },
                    },
                    "required": ["titulo", "color", "icono", "descripcion", "puntos"],
                },
            },
            "verificacion": {
                "type": "object",
                "description": "Checklist final tipo 'Antes de cerrar, verifica…'. Opcional.",
                "properties": {
                    "titulo": {"type": "string", "description": "Máx. 40 caracteres."},
                    "items": {"type": "array", "minItems": 2, "maxItems": 5, "items": ITEM_ICONO},
                },
                "required": ["titulo", "items"],
            },
            "importante": {
                "type": "array",
                "maxItems": 3,
                "description": "Advertencias críticas o prohibiciones. Opcional.",
                "items": {
                    "type": "object",
                    "properties": {
                        "tipo": {"type": "string", "enum": ["no", "si"]},
                        "texto": {"type": "string", "description": "Máx. 90 caracteres."},
                    },
                    "required": ["tipo", "texto"],
                },
            },
            "lema": {
                "type": "string",
                "description": "Frase de cierre para la barra inferior, máx. 60 caracteres.",
            },
        },
        "required": ["titulo_linea1", "titulo_linea2", "subtitulo", "secciones", "lema"],
    },
}

SYSTEM_PROMPT = f"""Eres un diseñador instruccional experto en capacitaciones para especialistas \
técnicos de campo de telecomunicaciones (FTTH, CTO/NAP, roseta, ONT, cable drop, tendidos, OFSC, \
atención al cliente, seguridad y buenas prácticas).

Tu tarea: transformar el texto desordenado del usuario en el contenido de UNA infografía tipo \
"Charla de 5 minutos" / "Refuerzo semanal": clara, visual y fácil de leer en el celular.

Reglas:
- Español neutro de Perú, directo, en segunda persona ("Mantén", "Verifica", "Escala").
- Respeta los términos técnicos y siglas del texto tal como vienen (TCP, TCE, OFSC, NAP, ONT, etc.).
- No inventes datos (valores, metrajes, normas, teléfonos) que no estén en el texto.
- Divide el contenido en 1 a 6 secciones temáticas; cada una se numera automáticamente.
- Sé breve: las infografías se leen en segundos. Prefiere viñetas cortas a párrafos.
- Varía los colores de las secciones (azul, verde, morado, naranja…). Usa "rojo" solo para \
prohibiciones o errores.
- Usa "destacado" para la idea clave de la sección: "ok" para buenas prácticas, "error" para lo \
que NO se debe hacer, "alerta" para precauciones, "info" para datos.
- Usa "chips" solo si hay conceptos cortos que se lucen mejor como íconos.
- Usa "verificacion" si el texto implica un checklist final, e "importante" para prohibiciones \
o advertencias críticas. Si no aplican, omítelos.
- Elige íconos SOLO de esta lista: {", ".join(ICONOS)}.
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
            max_tokens=4000,
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

    return jsonify(bloque.input)


# --------------------------------------------------------------------------
# Arranque local (en Render se usa gunicorn)
# --------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG") == "1")
