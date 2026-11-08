"""
Registro de eventos del servidor (para el apartado «Registro» de la web).

Se guarda en un archivo para que lo compartan todos los procesos de gunicorn.
En el plan gratuito de Render el archivo se borra cuando el servicio se duerme o se redespliega:
es un registro de diagnóstico, no un historial permanente. Nunca guarda claves ni el texto del usuario.
"""

import json
import os
import tempfile
import time
from pathlib import Path

ARCHIVO = Path(os.getenv("LOG_FILE", Path(tempfile.gettempdir()) / "infografias-registro.jsonl"))
MAX_LINEAS = 300


def registrar(accion: str, ok: bool, detalle: str = "", **extra) -> None:
    evento = {"t": time.time(), "origen": "servidor", "accion": accion, "ok": ok, "detalle": detalle[:500], **extra}
    try:
        with open(ARCHIVO, "a", encoding="utf-8") as f:
            f.write(json.dumps(evento, ensure_ascii=False) + "\n")
        # Recorta de vez en cuando para que no crezca sin límite
        if ARCHIVO.stat().st_size > 400_000:
            lineas = ARCHIVO.read_text(encoding="utf-8").splitlines()[-MAX_LINEAS:]
            ARCHIVO.write_text("\n".join(lineas) + "\n", encoding="utf-8")
    except OSError:
        pass


def leer(n: int = 100) -> list[dict]:
    try:
        lineas = ARCHIVO.read_text(encoding="utf-8").splitlines()[-n:]
    except OSError:
        return []
    eventos = []
    for linea in lineas:
        try:
            eventos.append(json.loads(linea))
        except ValueError:
            continue
    return eventos


def limpiar() -> None:
    try:
        ARCHIVO.unlink(missing_ok=True)
    except OSError:
        pass
