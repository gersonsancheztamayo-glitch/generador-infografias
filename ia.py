"""
Conexión con los modelos de IA.

Orden de preferencia:
  1. Gemini  (GEMINI_API_KEY)     → plan gratuito de Google AI Studio.
  2. Claude  (ANTHROPIC_API_KEY)  → API de pago de Anthropic.
Si no hay ninguna clave, la web sigue funcionando con el modo copiar/pegar (Claude Pro).
"""

import base64
import json
import logging
import os
import re

log = logging.getLogger("infografias.ia")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.8-flash")
# Si Google retira un modelo (error 404), se prueba el siguiente de esta lista automáticamente.
GEMINI_RESPALDO = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.1-flash-lite"]
_modelos_gemini = list(dict.fromkeys([GEMINI_MODEL, *GEMINI_RESPALDO]))  # sin duplicados, en orden
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-5-5")

MAX_IMAGENES = 4
MAX_BYTES_IMAGEN = 5 * 1024 * 1024
TIPOS_IMAGEN = {"image/jpeg", "image/png", "image/webp"}


class ErrorIA(Exception):
    """Error con un mensaje listo para mostrar al usuario."""

    def __init__(self, mensaje: str, status: int = 502):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.status = status


# --------------------------------------------------------------------------
# Clientes (se crean solo si hay clave)
# --------------------------------------------------------------------------
_gemini = None
_claude = None

if GEMINI_API_KEY:
    from google import genai
    from google.genai import errors as gemini_errors
    from google.genai import types as gemini_types

    _gemini = genai.Client(api_key=GEMINI_API_KEY)

if ANTHROPIC_API_KEY:
    import anthropic

    _claude = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)


def proveedor() -> str | None:
    if _gemini:
        return "gemini"
    if _claude:
        return "claude"
    return None


NOMBRES = {"gemini": "Gemini", "claude": "Claude"}

MENSAJE_SIN_IA = (
    "Esta función necesita una API key de IA. La opción gratuita es Gemini: crea tu clave en "
    "aistudio.google.com → «Get API key» y agrégala en Render → Environment como GEMINI_API_KEY. "
    "Mientras tanto, usa el modo gratis con tu Claude Pro (copiar y pegar)."
)


# --------------------------------------------------------------------------
# Imágenes de referencia (llegan del navegador como data URL)
# --------------------------------------------------------------------------
def decodificar_imagenes(lista) -> list[tuple[str, bytes]]:
    if not lista:
        return []
    if not isinstance(lista, list):
        raise ErrorIA("Formato de imágenes no válido.", 400)
    if len(lista) > MAX_IMAGENES:
        raise ErrorIA(f"Máximo {MAX_IMAGENES} imágenes de referencia.", 400)
    salida = []
    for i, data_url in enumerate(lista, start=1):
        m = re.match(r"^data:(image/[a-z+]+);base64,(.+)$", str(data_url), re.S)
        if not m or m.group(1) not in TIPOS_IMAGEN:
            raise ErrorIA(f"La imagen {i} no es JPG, PNG ni WEBP.", 400)
        datos = base64.b64decode(m.group(2))
        if len(datos) > MAX_BYTES_IMAGEN:
            raise ErrorIA(f"La imagen {i} pesa más de 5 MB.", 400)
        salida.append((m.group(1), datos))
    return salida


# --------------------------------------------------------------------------
# Llamada genérica: devuelve un dict que cumple `esquema`
# --------------------------------------------------------------------------
def generar_json(sistema: str, texto: str, esquema: dict, imagenes=None, nombre="responder") -> dict:
    imagenes = imagenes or []
    p = proveedor()
    if p == "gemini":
        return _gemini_json(sistema, texto, esquema, imagenes)
    if p == "claude":
        return _claude_json(sistema, texto, esquema, imagenes, nombre)
    raise ErrorIA(MENSAJE_SIN_IA, 503)


def _gemini_json(sistema, texto, esquema, imagenes):
    partes = [gemini_types.Part.from_bytes(data=d, mime_type=t) for t, d in imagenes]
    partes.append(gemini_types.Part.from_text(text=texto))
    config = gemini_types.GenerateContentConfig(
        system_instruction=sistema,
        response_mime_type="application/json",
        response_json_schema=esquema,
        temperature=0.4,
    )
    while True:
        modelo = _modelos_gemini[0]
        try:
            r = _gemini.models.generate_content(model=modelo, contents=partes, config=config)
            break
        except gemini_errors.APIError as e:
            log.warning("Error de Gemini (%s) %s: %s", modelo, e.code, e.message)
            msg = (e.message or "").lower()
            if e.code == 404 and len(_modelos_gemini) > 1:
                _modelos_gemini.pop(0)  # modelo retirado: se recuerda y se pasa al siguiente
                log.warning("Modelo %s no disponible; probando %s", modelo, _modelos_gemini[0])
                continue
            if e.code in (401, 403) or "api key" in msg:
                raise ErrorIA("La GEMINI_API_KEY no es válida. Revísala en aistudio.google.com.", 500)
            if e.code == 429:
                raise ErrorIA(
                    "Se alcanzó el límite gratuito de Gemini por ahora. Espera un minuto (o hasta mañana si es el "
                    "límite diario) o usa el modo copiar/pegar con Claude Pro.", 429)
            if e.code == 404:
                raise ErrorIA("Ningún modelo de Gemini respondió. Revisa la variable GEMINI_MODEL en Render.", 500)
            raise ErrorIA("Gemini no respondió correctamente. Inténtalo de nuevo.", 502)

    try:
        return json.loads(r.text)
    except (TypeError, ValueError):
        log.warning("Respuesta de Gemini no es JSON: %r", (r.text or "")[:300])
        raise ErrorIA("Gemini devolvió una respuesta incompleta. Inténtalo de nuevo.", 502)


def _claude_json(sistema, texto, esquema, imagenes, nombre):
    contenido = [
        {"type": "image", "source": {"type": "base64", "media_type": t, "data": base64.b64encode(d).decode()}}
        for t, d in imagenes
    ]
    contenido.append({"type": "text", "text": texto})
    try:
        r = _claude.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=4000,
            system=sistema,
            tools=[{"name": nombre, "description": "Devuelve el resultado estructurado.", "input_schema": esquema}],
            tool_choice={"type": "tool", "name": nombre},
            messages=[{"role": "user", "content": contenido}],
        )
    except anthropic.AuthenticationError:
        raise ErrorIA("La ANTHROPIC_API_KEY no es válida.", 500)
    except anthropic.RateLimitError:
        raise ErrorIA("Demasiadas solicitudes a Claude. Espera unos segundos.", 429)
    except anthropic.APIError:
        log.exception("Error de Claude")
        raise ErrorIA("Claude no respondió correctamente. Inténtalo de nuevo.", 502)

    bloque = next((b for b in r.content if b.type == "tool_use"), None)
    if bloque is None:
        raise ErrorIA("La IA no devolvió una estructura válida.", 502)
    return bloque.input
