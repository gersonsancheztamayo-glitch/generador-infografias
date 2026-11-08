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
import time

import registro

log = logging.getLogger("infografias.ia")

_clave_cruda = os.getenv("GEMINI_API_KEY") or ""
GEMINI_API_KEY = _clave_cruda.strip()  # quita espacios o saltos de línea pegados por error
CLAVE_TENIA_ESPACIOS = _clave_cruda != GEMINI_API_KEY
GEMINI_MODEL = (os.getenv("GEMINI_MODEL") or "gemini-3.8-flash").strip()
# Si Google retira un modelo (error 404), se prueba el siguiente de esta lista automáticamente.
GEMINI_RESPALDO = ["gemini-3.8-flash", "gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-3.1-flash-lite"]
_modelos_gemini = list(dict.fromkeys([GEMINI_MODEL, *GEMINI_RESPALDO]))  # sin duplicados, en orden
ANTHROPIC_API_KEY = (os.getenv("ANTHROPIC_API_KEY") or "").strip()
CLAUDE_MODEL = os.getenv("CLAUDE_MODEL", "claude-sonnet-5-5")

MAX_IMAGENES = 4
MAX_BYTES_IMAGEN = 5 * 1024 * 1024
TIPOS_IMAGEN = {"image/jpeg", "image/png", "image/webp"}


class ErrorIA(Exception):
    """Error con un mensaje listo para mostrar al usuario."""

    def __init__(self, mensaje: str, status: int = 502, tecnico: str = ""):
        super().__init__(mensaje)
        self.mensaje = mensaje
        self.status = status
        self.tecnico = tecnico  # detalle técnico (solo para el Registro)


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
def generar_json(sistema: str, texto: str, esquema: dict, imagenes=None, nombre="responder", accion="ia") -> dict:
    """Llama a la IA disponible y deja constancia en el Registro (duración, modelo, errores)."""
    imagenes = imagenes or []
    p = proveedor()
    inicio = time.time()
    intentos: list[dict] = []
    extra = {"proveedor": NOMBRES.get(p, "ninguna"), "imagenes": len(imagenes), "caracteres": len(texto)}
    try:
        if p == "gemini":
            resultado = _gemini_json(sistema, texto, esquema, imagenes, intentos)
        elif p == "claude":
            intentos.append({"modelo": CLAUDE_MODEL})
            resultado = _claude_json(sistema, texto, esquema, imagenes, nombre)
        else:
            raise ErrorIA(MENSAJE_SIN_IA, 503, "No hay GEMINI_API_KEY ni ANTHROPIC_API_KEY configuradas.")
    except ErrorIA as e:
        registro.registrar(accion, False, e.mensaje, tecnico=e.tecnico, intentos=intentos,
                           segundos=round(time.time() - inicio, 1), **extra)
        raise
    registro.registrar(accion, True, "Respuesta recibida", intentos=intentos,
                       modelo=intentos[-1].get("modelo") if intentos else None,
                       segundos=round(time.time() - inicio, 1), **extra)
    return resultado


def _gemini_json(sistema, texto, esquema, imagenes, intentos):
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
            intentos.append({"modelo": modelo, "resultado": "ok"})
            break
        except gemini_errors.APIError as e:
            tecnico = f"{e.code} {e.status or ''}: {e.message}".strip()
            intentos.append({"modelo": modelo, "resultado": tecnico[:300]})
            log.warning("Error de Gemini (%s) %s", modelo, tecnico)
            msg = (e.message or "").lower()
            if e.code == 404 and len(_modelos_gemini) > 1:
                _modelos_gemini.pop(0)  # modelo retirado: se recuerda y se pasa al siguiente
                continue
            if e.code in (401, 403) or "api key" in msg or "api_key" in msg:
                raise ErrorIA("Google rechazó la GEMINI_API_KEY (no es válida o no tiene permiso). "
                              "Revísala en aistudio.google.com.", 500, tecnico)
            if e.code == 429:
                raise ErrorIA(
                    "Se alcanzó el límite gratuito de Gemini por ahora. Espera un minuto (o hasta mañana si es el "
                    "límite diario) o usa el modo copiar/pegar con Claude Pro.", 429, tecnico)
            if e.code == 404:
                raise ErrorIA("Ningún modelo de Gemini respondió. Revisa la variable GEMINI_MODEL en Render.",
                              500, tecnico)
            if e.code == 400:
                raise ErrorIA("Gemini rechazó la solicitud (400). Mira el detalle en el Registro.", 502, tecnico)
            raise ErrorIA("Gemini no respondió correctamente. Inténtalo de nuevo.", 502, tecnico)
        except Exception as e:  # sin conexión, tiempo agotado, etc.
            tecnico = f"{type(e).__name__}: {e}"
            intentos.append({"modelo": modelo, "resultado": tecnico[:300]})
            log.exception("Fallo de conexión con Gemini")
            raise ErrorIA("No se pudo conectar con Gemini. Inténtalo de nuevo en un momento.", 502, tecnico)

    try:
        return json.loads(r.text)
    except (TypeError, ValueError):
        raise ErrorIA("Gemini devolvió una respuesta incompleta. Inténtalo de nuevo.", 502,
                      f"Respuesta no JSON: {(r.text or '')[:300]!r}")


def diagnostico() -> dict:
    """Información para el botón «Probar conexión» (sin revelar la clave)."""
    info = {
        "proveedor": NOMBRES.get(proveedor()),
        "gemini_clave": bool(GEMINI_API_KEY),
        "gemini_clave_formato": (
            None if not GEMINI_API_KEY else
            "correcto (empieza con AIza)" if GEMINI_API_KEY.startswith("AIza") else
            "raro: las claves de Google AI Studio suelen empezar con «AIza»"
        ),
        "gemini_clave_largo": len(GEMINI_API_KEY),
        "gemini_clave_tenia_espacios": CLAVE_TENIA_ESPACIOS,
        "gemini_modelo_configurado": GEMINI_MODEL if GEMINI_API_KEY else None,
        "gemini_modelos_en_cola": _modelos_gemini if GEMINI_API_KEY else [],
        "claude_clave": bool(ANTHROPIC_API_KEY),
    }
    if not proveedor():
        info["prueba"] = {"ok": False, "mensaje": MENSAJE_SIN_IA}
        return info
    esquema = {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]}
    inicio = time.time()
    try:
        generar_json("Responde solo con el JSON pedido.", "Devuelve ok = true.", esquema, accion="prueba de conexión")
        info["prueba"] = {"ok": True, "mensaje": "La IA respondió correctamente.",
                          "modelo": _modelos_gemini[0] if proveedor() == "gemini" else CLAUDE_MODEL}
    except ErrorIA as e:
        info["prueba"] = {"ok": False, "mensaje": e.mensaje, "tecnico": e.tecnico}
    info["prueba"]["segundos"] = round(time.time() - inicio, 1)
    return info


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
    except anthropic.AuthenticationError as e:
        raise ErrorIA("La ANTHROPIC_API_KEY no es válida.", 500, str(e)[:300])
    except anthropic.RateLimitError as e:
        raise ErrorIA("Demasiadas solicitudes a Claude. Espera unos segundos.", 429, str(e)[:300])
    except anthropic.APIError as e:
        log.exception("Error de Claude")
        raise ErrorIA("Claude no respondió correctamente. Inténtalo de nuevo.", 502, str(e)[:300])

    bloque = next((b for b in r.content if b.type == "tool_use"), None)
    if bloque is None:
        raise ErrorIA("La IA no devolvió una estructura válida.", 502)
    return bloque.input
