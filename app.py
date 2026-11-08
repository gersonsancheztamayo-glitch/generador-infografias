"""
Generador de Infografías Técnicas
Backend Flask: convierte texto en sucio (y fotos de referencia) en un JSON estructurado
y revisa el contenido antes de exportar. IA: Gemini (gratis) o Claude; sin clave, modo copiar/pegar.
"""

import json
import logging
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()  # Lee .env en local (antes de importar ia.py). En Render se usan las variables del panel.

from flask import Flask, jsonify, render_template, request  # noqa: E402

import ia  # noqa: E402
import registro  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger("infografias")

MAX_INPUT_CHARS = int(os.getenv("MAX_INPUT_CHARS", "8000"))

BASE_DIR = Path(__file__).resolve().parent
app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 30 * 1024 * 1024  # 4 imágenes de referencia + texto

log.info("IA activa: %s", ia.NOMBRES.get(ia.proveedor(), "ninguna (modo copiar/pegar con Claude Pro)"))


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
# Contrato de datos: lo que la IA DEBE devolver (JSON Schema).
# Gemini lo recibe como "response_json_schema"; Claude como herramienta forzada.
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
                        "imagen": {
                            "type": "integer",
                            "description": "Número de la imagen de referencia (1, 2, 3…) que mejor ilustra esta "
                            "sección; 0 si ninguna encaja. No repitas el mismo número en dos secciones. Opcional.",
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
- Divide el contenido en 1 a 6 secciones temáticas (ideal: 3 o 4, para que se lea bien en el celular);
  cada una se numera automáticamente.
- Sé breve: las infografías se leen en segundos. Prefiere viñetas cortas a párrafos.
- Varía los colores de las secciones (azul, verde, morado, naranja…). Usa "rojo" solo para \
prohibiciones o errores.
- Usa "destacado" para la idea clave de la sección: "ok" para buenas prácticas, "error" para lo \
que NO se debe hacer, "alerta" para precauciones, "info" para datos.
- Usa "chips" solo si hay conceptos cortos que se lucen mejor como íconos.
- Usa "verificacion" si el texto implica un checklist final, e "importante" para prohibiciones \
o advertencias críticas. Si no aplican, omítelos.
- Si hay imágenes de referencia (capturas, fotos, infografías antiguas), extrae de ellas pasos, datos \
y advertencias. NUNCA copies datos personales de clientes que aparezcan en ellas (nombres, teléfonos \
personales, DNI, direcciones exactas, números de orden).
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
    return jsonify(status="ok", ia=ia.proveedor(),
                   modelo=ia._modelos_gemini[0] if ia.proveedor() == "gemini" else None)


@app.route("/api/config")
def config():
    """Le dice al navegador qué IA hay disponible para «Generar» y «Revisar»."""
    p = ia.proveedor()
    return jsonify(
        ia=p,
        ia_nombre=ia.NOMBRES.get(p),
        gratis=p == "gemini",
        max_caracteres=MAX_INPUT_CHARS,
        max_imagenes=ia.MAX_IMAGENES,
    )


# Ejemplo que se incluye en el prompt del modo sin API (muestra la estructura exacta)
EJEMPLO_JSON = {
    "titulo_linea1": "REGLAS CLAVE PARA",
    "titulo_linea2": "TENDIDOS EXTERNOS",
    "subtitulo": "Instalaciones seguras, estandarizadas y con calidad.",
    "secciones": [
        {
            "titulo": "RESPETA LA PRIORIDAD DE POSTES",
            "color": "azul",
            "icono": "poste",
            "descripcion": "Utiliza siempre el orden establecido.",
            "puntos": ["Primero los postes propios.", "Luego los autorizados."],
            "chips": [{"icono": "seguridad", "texto": "Mayor seguridad"}],
            "destacado": {"tipo": "error", "texto": "No utilizar postes no autorizados."},
        }
    ],
    "verificacion": {
        "titulo": "ANTES DE CERRAR, VERIFICA",
        "items": [{"icono": "poste", "texto": "Prioridad de postes"}, {"icono": "camara", "texto": "Evidencias"}],
    },
    "importante": [{"tipo": "no", "texto": "No considerar postes no autorizados."}],
    "lema": "La calidad comienza antes de llegar al cliente.",
}


def construir_prompt(texto: str) -> str:
    """Prompt completo para pegar en claude.ai (modo sin API)."""
    return f"""{SYSTEM_PROMPT}
FORMATO DE RESPUESTA (obligatorio):
Responde ÚNICAMENTE con un bloque de código ```json escrito directamente en el chat (no crees un artefacto,
un documento ni un archivo), sin ningún texto antes ni después.
Usa exactamente estos nombres de campos (este es solo un ejemplo de la estructura, no de su contenido):

```json
{json.dumps(EJEMPLO_JSON, ensure_ascii=False, indent=2)}
```

Reglas del JSON:
- "titulo_linea1" y "titulo_linea2": MAYÚSCULAS, máx. 24 caracteres cada una.
- "secciones": de 1 a 6. "titulo" en MAYÚSCULAS (máx. 32 caracteres), "puntos": máx. 5 de máx. 70 caracteres.
- "color": uno de {", ".join(COLORES)}.
- "icono" (en secciones, chips y verificación): uno de {", ".join(ICONOS)}.
- "destacado.tipo": ok, alerta, error o info.
- "importante[].tipo": "no" (prohibición) o "si" (obligación).
- Opcionales (omítelos si no aplican): "chips", "destacado", "verificacion", "importante".

Si junto a este mensaje hay imágenes adjuntas (capturas, fotos, infografías antiguas), úsalas como
fuente de contenido junto con el texto: extrae de ellas los pasos, datos y advertencias relevantes.

TEXTO A CONVERTIR:
<texto>
{texto}
</texto>"""


@app.route("/api/prompt", methods=["POST"])
def prompt():
    data = request.get_json(silent=True) or {}
    texto = (data.get("texto") or "").strip()
    if len(texto) > MAX_INPUT_CHARS:
        return jsonify(error=f"El texto supera el máximo de {MAX_INPUT_CHARS} caracteres."), 400
    # Sin texto también vale: el contenido puede venir solo de imágenes adjuntas en claude.ai
    return jsonify(prompt=construir_prompt(texto or "(Sin texto: usa el contenido de las imágenes adjuntas.)"))


@app.route("/api/generar", methods=["POST"])
def generar():
    data = request.get_json(silent=True) or {}
    texto = (data.get("texto") or "").strip()
    try:
        imagenes = ia.decodificar_imagenes(data.get("imagenes"))
        if not texto and not imagenes:
            return jsonify(error="Falta el contenido: pega un texto o agrega imágenes de referencia en el paso 1."), 400
        if len(texto) > MAX_INPUT_CHARS:
            return jsonify(error=f"El texto supera el máximo de {MAX_INPUT_CHARS} caracteres."), 400
        pedido = "Convierte este contenido en una infografía."
        if imagenes:
            pedido += (f" Usa también las {len(imagenes)} imagen(es) adjuntas (numeradas en orden desde 1): "
                       "extrae su contenido y, en cada sección, indica en «imagen» cuál la ilustra mejor.")
        pedido += f"\n\n<texto>\n{texto or '(Sin texto: usa solo las imágenes.)'}\n</texto>"
        resultado = ia.generar_json(SYSTEM_PROMPT, pedido, INFOGRAFIA_TOOL["input_schema"], imagenes, "generar_infografia",
                                    accion="generar")
    except ia.ErrorIA as e:
        return jsonify(error=e.mensaje), e.status
    return jsonify(resultado)


# --------------------------------------------------------------------------
# Revisión antes de exportar
# --------------------------------------------------------------------------
CATEGORIAS = ["ortografia", "siglas", "claridad", "longitud", "datos_sensibles", "coherencia"]


def campos_de_texto(d: dict) -> dict[str, tuple[str, int]]:
    """Aplana la infografía: {ruta: (texto, límite de caracteres)}. Las rutas coinciden con data-path del HTML."""
    campos: dict[str, tuple[str, int]] = {}

    def add(ruta, valor, limite):
        if isinstance(valor, str) and valor.strip():
            campos[ruta] = (valor.strip(), limite)

    add("titulo_linea1", d.get("titulo_linea1"), 24)
    add("titulo_linea2", d.get("titulo_linea2"), 24)
    add("subtitulo", d.get("subtitulo"), 90)
    for i, s in enumerate(d.get("secciones") or []):
        if not isinstance(s, dict):
            continue
        add(f"secciones.{i}.titulo", s.get("titulo"), 32)
        add(f"secciones.{i}.descripcion", s.get("descripcion"), 160)
        for j, p in enumerate(s.get("puntos") or []):
            add(f"secciones.{i}.puntos.{j}", p, 70)
        for j, c in enumerate(s.get("chips") or []):
            add(f"secciones.{i}.chips.{j}.texto", (c or {}).get("texto"), 45)
        add(f"secciones.{i}.destacado.texto", (s.get("destacado") or {}).get("texto"), 110)
    v = d.get("verificacion") or {}
    add("verificacion.titulo", v.get("titulo"), 40)
    for j, it in enumerate(v.get("items") or []):
        add(f"verificacion.items.{j}.texto", (it or {}).get("texto"), 45)
    for j, it in enumerate(d.get("importante") or []):
        add(f"importante.{j}.texto", (it or {}).get("texto"), 90)
    add("lema", d.get("lema"), 60)
    return campos


REVISION_SISTEMA = """Eres el editor final de infografías de capacitación para especialistas técnicos de \
campo de telecomunicaciones (FTTH, CTO/NAP, roseta, ONT, cable drop, OFSC, TCP, TCE). Revisas el texto \
JUSTO ANTES de publicarlo como imagen que se leerá en el celular.

Revisa cada campo y reporta SOLO problemas reales, de estas categorías:
- ortografia: faltas, tildes, puntuación, mayúsculas incorrectas.
- siglas: siglas escritas de forma distinta en la infografía (ej. "Ofsc" y "OFSC") o mal escritas.
- claridad: frases ambiguas, confusas o que un técnico podría malinterpretar.
- longitud: texto que supera su límite de caracteres; propone una versión más corta con el mismo sentido.
- datos_sensibles: datos personales de clientes (nombres, teléfonos personales, DNI, direcciones exactas, \
números de orden). Los números de soporte oficiales de la empresa NO son sensibles.
- coherencia: contradicciones entre secciones, ideas repetidas o una advertencia que no encaja.

Reglas:
- "sugerencia" es el texto COMPLETO de reemplazo del campo, listo para pegar. Mantén MAYÚSCULAS en los títulos.
- No cambies el significado, valores técnicos, metrajes, siglas válidas ni procedimientos. No inventes datos.
- No propongas cambios de puro estilo si el texto ya es correcto.
- Usa la ruta "general" solo para observaciones que no se arreglan editando un campo (ej. secciones \
repetidas); en ese caso deja "sugerencia" vacía.
- Máximo 12 observaciones, las más importantes primero.
- "puntaje" de 1 a 10 (10 = lista para publicar). "resumen": una frase en español."""


def esquema_revision(rutas: list[str]) -> dict:
    return {
        "type": "object",
        "properties": {
            "puntaje": {"type": "integer", "minimum": 1, "maximum": 10},
            "resumen": {"type": "string"},
            "observaciones": {
                "type": "array",
                "maxItems": 12,
                "items": {
                    "type": "object",
                    "properties": {
                        "ruta": {"type": "string", "enum": rutas + ["general"]},
                        "categoria": {"type": "string", "enum": CATEGORIAS},
                        "sugerencia": {"type": "string"},
                        "motivo": {"type": "string", "description": "Explicación breve (máx. 100 caracteres)."},
                    },
                    "required": ["ruta", "categoria", "sugerencia", "motivo"],
                },
            },
        },
        "required": ["puntaje", "resumen", "observaciones"],
    }


def pedido_revision(campos: dict) -> str:
    lineas = []
    for ruta, (texto, limite) in campos.items():
        marca = f" ⚠ EXCEDE ({len(texto)})" if len(texto) > limite else ""
        lineas.append(f"[{ruta}] (máx. {limite}{marca}) {texto}")
    return "Revisa estos campos de la infografía:\n\n" + "\n".join(lineas)


def limpiar_revision(r: dict, campos: dict) -> dict:
    """Descarta observaciones inválidas y añade el texto original de cada campo."""
    obs = []
    for o in (r.get("observaciones") or [])[:12]:
        if not isinstance(o, dict):
            continue
        ruta = o.get("ruta")
        sug = (o.get("sugerencia") or "").strip()
        cat = o.get("categoria") if o.get("categoria") in CATEGORIAS else "claridad"
        if ruta == "general":
            obs.append({"ruta": "general", "categoria": cat, "original": "", "sugerencia": "", "motivo": o.get("motivo", "")})
        elif ruta in campos and sug and sug != campos[ruta][0]:
            obs.append({"ruta": ruta, "categoria": cat, "original": campos[ruta][0], "sugerencia": sug,
                        "motivo": (o.get("motivo") or "").strip()})
    try:
        puntaje = max(1, min(10, int(r.get("puntaje", 8))))
    except (TypeError, ValueError):
        puntaje = 8
    return {"puntaje": puntaje, "resumen": (r.get("resumen") or "").strip(), "observaciones": obs}


@app.route("/api/revisar", methods=["POST"])
def revisar():
    datos = (request.get_json(silent=True) or {}).get("datos")
    if not isinstance(datos, dict):
        return jsonify(error="No llegó la infografía a revisar."), 400
    campos = campos_de_texto(datos)
    if not campos:
        return jsonify(error="La infografía no tiene textos para revisar."), 400
    try:
        r = ia.generar_json(REVISION_SISTEMA, pedido_revision(campos), esquema_revision(list(campos)), nombre="revision",
                           accion="revisar")
    except ia.ErrorIA as e:
        return jsonify(error=e.mensaje), e.status
    return jsonify(limpiar_revision(r, campos))


@app.route("/api/prompt-revision", methods=["POST"])
def prompt_revision():
    """Modo sin API: prompt para pegar en claude.ai y obtener la revisión."""
    datos = (request.get_json(silent=True) or {}).get("datos")
    campos = campos_de_texto(datos) if isinstance(datos, dict) else {}
    if not campos:
        return jsonify(error="La infografía no tiene textos para revisar."), 400
    ejemplo = {"puntaje": 8, "resumen": "Buena, con 2 detalles por corregir.",
               "observaciones": [{"ruta": next(iter(campos)), "categoria": "ortografia",
                                  "sugerencia": "TEXTO CORREGIDO COMPLETO", "motivo": "Falta una tilde."}]}
    texto = f"""{REVISION_SISTEMA}

FORMATO DE RESPUESTA (obligatorio): responde ÚNICAMENTE con un bloque ```json en el chat (sin artefactos ni
archivos), sin texto antes ni después. "ruta" debe ser exactamente una de las rutas entre corchetes o "general".
"categoria": una de {", ".join(CATEGORIAS)}. Ejemplo de estructura:

```json
{json.dumps(ejemplo, ensure_ascii=False, indent=2)}
```

{pedido_revision(campos)}"""
    return jsonify(prompt=texto)


@app.route("/api/limpiar-revision", methods=["POST"])
def limpiar_revision_pegada():
    """Valida una revisión pegada desde claude.ai igual que si viniera de la API."""
    body = request.get_json(silent=True) or {}
    datos, r = body.get("datos"), body.get("revision")
    if not isinstance(datos, dict) or not isinstance(r, dict):
        return jsonify(error="Datos incompletos."), 400
    return jsonify(limpiar_revision(r, campos_de_texto(datos)))


# --------------------------------------------------------------------------
# Registro y diagnóstico
# --------------------------------------------------------------------------
@app.route("/api/registro")
def ver_registro():
    return jsonify(eventos=registro.leer(150))


@app.route("/api/registro", methods=["DELETE"])
def borrar_registro():
    registro.limpiar()
    return jsonify(ok=True)


@app.route("/api/diagnostico", methods=["POST"])
def diagnostico():
    return jsonify(ia.diagnostico())


@app.errorhandler(500)
def error_interno(e):
    original = getattr(e, "original_exception", e)
    registro.registrar("error del servidor", False, f"{type(original).__name__}: {original}", ruta=request.path)
    return jsonify(error="Error interno del servidor. Mira el detalle en el Registro."), 500


# --------------------------------------------------------------------------
# Arranque local (en Render se usa gunicorn)
# --------------------------------------------------------------------------
if __name__ == "__main__":
    port = int(os.getenv("PORT", "5000"))
    app.run(host="0.0.0.0", port=port, debug=os.getenv("FLASK_DEBUG") == "1")
