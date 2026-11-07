/* =====================================================================
   LÓGICA DE LA PÁGINA: estado, IA, edición en vivo y exportación PNG
   ===================================================================== */

const EJEMPLO = {
  titulo_linea1: "BUENAS PRÁCTICAS",
  titulo_linea2: "EN LA ROSETA ÓPTICA",
  subtitulo: "Pequeños detalles, grandes resultados en cada instalación.",
  secciones: [
    {
      titulo: "Recorrido del cable drop",
      color: "azul",
      icono: "fibra",
      descripcion: "El drop ingresa por un solo sentido y se acomoda siguiendo las guías internas.",
      puntos: ["Reserva de 2 vueltas dentro de la roseta.", "Sin dobleces agudos en el cable.", "Usa las guías del recorrido interno."],
      destacado: { tipo: "ok", texto: "Una reserva ordenada evita averías y retrabajos." },
    },
    {
      titulo: "Fijación de equipos",
      color: "verde",
      icono: "herramienta",
      descripcion: "Los equipos deben quedar firmes, ordenados y con buen acabado.",
      puntos: ["Roseta fijada con pernos a la pared.", "ONT sobre una base, mueble o soporte."],
      chips: [
        { icono: "casa", texto: "Roseta con pernos" },
        { icono: "router", texto: "ONT sobre base" },
      ],
      destacado: { tipo: "alerta", texto: "Si el cliente no desea pernos, sugiere cinta doble contacto como última opción." },
    },
    {
      titulo: "Limpieza de conectores",
      color: "morado",
      icono: "limpieza",
      descripcion: "Limpia antes de conectar en CTO, NAP y roseta.",
      puntos: ["Acciona el limpiador hasta escuchar el clic.", "Mantén el capuchón cerrado después de usarlo."],
      destacado: { tipo: "error", texto: "No toques la férula ni apoyes el conector en superficies sucias." },
    },
  ],
  verificacion: {
    titulo: "Antes de cerrar la instalación",
    items: [
      { icono: "fibra", texto: "Reserva correcta" },
      { icono: "herramienta", texto: "Equipos fijados" },
      { icono: "medicion", texto: "Potencia medida" },
      { icono: "camara", texto: "Evidencias registradas" },
    ],
  },
  importante: [
    { tipo: "no", texto: "No dejar fibra esparcida en áreas comunes." },
    { tipo: "si", texto: "Mide la potencia en la roseta antes de cerrar." },
  ],
  lema: "La calidad comienza antes de llegar al cliente.",
};

const OPCIONES_DEFECTO = {
  formato: "vertical",
  distribucion: "auto",
  acento: "cian",
  fondo: "azul",
  etiqueta: "CHARLA DE 5 MINUTOS",
  firma1: "100%",
  firma2: "FIBRA POWER",
  calidad: "2",
  logo: "",
  cabecera: "",
};

/* ---------- estado ---------- */
const $ = (sel) => document.querySelector(sel);
const clonar = (o) => JSON.parse(JSON.stringify(o));
const sinPrivados = (k, v) => (k.startsWith("_") ? undefined : v); // quita fotos (_img) del JSON

function cargarLocal(clave, defecto) {
  try {
    const v = localStorage.getItem(clave);
    return v ? { ...defecto, ...JSON.parse(v) } : clonar(defecto);
  } catch {
    return clonar(defecto);
  }
}
function guardarLocal() {
  try {
    localStorage.setItem("infografia.datos", JSON.stringify(datos, sinPrivados));
    const { logo, cabecera, ...resto } = opciones; // las imágenes no se guardan (ocupan mucho)
    localStorage.setItem("infografia.opciones", JSON.stringify(resto));
  } catch { /* almacenamiento no disponible: no pasa nada */ }
}

let datos = cargarLocal("infografia.datos", EJEMPLO);
let opciones = cargarLocal("infografia.opciones", OPCIONES_DEFECTO);

/* ---------- render ---------- */
const lienzo = $("#lienzo");
const escala = $("#escala");
const marco = $("#marco");

function render() {
  datos.secciones ||= [];
  lienzo.innerHTML = Render.renderInfografia(datos, opciones);
  Render.ajustarTitulos(lienzo);
  ajustarEscala();
  guardarLocal();
}

function ajustarEscala() {
  const info = $("#infografia");
  if (!info) return;
  const ancho = info.offsetWidth;
  const disponible = marco.clientWidth;
  const k = Math.min(1, disponible / ancho);
  escala.style.transform = `scale(${k})`;
  escala.style.width = ancho + "px";
  marco.style.height = info.offsetHeight * k + "px";
  $("#dimensiones").textContent = `${ancho} × ${info.offsetHeight} px`;
}
new ResizeObserver(ajustarEscala).observe(marco);

/* ---------- mensajes ---------- */
function aviso(texto, tipo = "info") {
  const el = $("#aviso");
  const estilos = {
    info: "bg-blue-50 text-blue-900 border-blue-200",
    ok: "bg-green-50 text-green-900 border-green-200",
    error: "bg-red-50 text-red-900 border-red-200",
  };
  el.className = `fixed z-50 bottom-4 left-4 right-4 sm:right-auto sm:max-w-md rounded-xl border px-4 py-3 text-sm shadow-lg cursor-pointer ${estilos[tipo]}`;
  el.title = "Clic para cerrar";
  el.textContent = texto;
  el.hidden = !texto;
}

$("#aviso").addEventListener("click", () => ($("#aviso").hidden = true));

/* ---------- normalizar: repara pequeños errores del JSON que devuelve la IA ---------- */
function extraerJSON(textoRespuesta) {
  let t = textoRespuesta.trim();
  const bloque = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (bloque) t = bloque[1];
  const ini = t.indexOf("{"), fin = t.lastIndexOf("}");
  if (ini === -1 || fin <= ini) throw new Error("no encontré ningún bloque JSON");
  t = t.slice(ini, fin + 1);
  try {
    return JSON.parse(t);
  } catch {
    // Reparaciones comunes: comillas tipográficas y comas sobrantes
    return JSON.parse(t.replace(/[\u201C\u201D]/g, '"').replace(/,\s*([}\]])/g, "$1"));
  }
}

function normalizar(d) {
  if (d && typeof d === "object" && !d.secciones && (d.infografia || d.data)) d = d.infografia || d.data;
  if (!d || !Array.isArray(d.secciones) || !d.secciones.length) throw new Error("falta la lista de secciones");
  const str = (v) => (typeof v === "string" ? v.trim() : v == null ? "" : String(v));
  const icono = (v) => (window.ICONOS[v] && !String(v).startsWith("_") ? v : "info");
  const lista = (v) => (Array.isArray(v) ? v : v ? [v] : []);
  const conTexto = (v) => (typeof v === "string" ? { texto: v } : v || {});

  if (!d.titulo_linea1 && d.titulo) {
    const p = str(d.titulo).split(/\s+/), m = Math.ceil(p.length / 2);
    d.titulo_linea1 = p.slice(0, m).join(" ");
    d.titulo_linea2 = p.slice(m).join(" ");
  }
  const out = {
    titulo_linea1: str(d.titulo_linea1).toUpperCase(),
    titulo_linea2: str(d.titulo_linea2).toUpperCase(),
    subtitulo: str(d.subtitulo),
    secciones: d.secciones.slice(0, 6).map((s, i) => {
      const sec = {
        titulo: str(s.titulo),
        color: Render.PALETA[s.color] ? s.color : Render.ORDEN_COLORES[i % Render.ORDEN_COLORES.length],
        icono: icono(s.icono),
        descripcion: str(s.descripcion),
        puntos: lista(s.puntos).map((p) => str(typeof p === "object" ? p.texto : p)).filter(Boolean),
      };
      const chips = lista(s.chips).map(conTexto).filter((c) => c.texto).map((c) => ({ icono: icono(c.icono), texto: str(c.texto) }));
      if (chips.length) sec.chips = chips;
      const dst = conTexto(s.destacado);
      if (dst.texto) sec.destacado = { tipo: Render.DESTACADO[dst.tipo] ? dst.tipo : "info", texto: str(dst.texto) };
      return sec;
    }),
    lema: str(d.lema),
  };
  const v = Array.isArray(d.verificacion) ? { titulo: "Antes de cerrar, verifica", items: d.verificacion } : d.verificacion;
  const items = lista(v?.items).map(conTexto).filter((c) => c.texto).map((c) => ({ icono: icono(c.icono), texto: str(c.texto) }));
  if (items.length) out.verificacion = { titulo: str(v.titulo) || "Antes de cerrar, verifica", items };
  const imp = lista(d.importante).map(conTexto).filter((c) => c.texto).map((c) => ({ tipo: c.tipo === "si" ? "si" : "no", texto: str(c.texto) }));
  if (imp.length) out.importante = imp;
  return out;
}

/* ---------- edición de textos (clic sobre la infografía) ---------- */
function asignarRuta(obj, ruta, valor) {
  const partes = ruta.split(".");
  let o = obj;
  for (let i = 0; i < partes.length - 1; i++) o = o[partes[i]];
  const ultima = partes.at(-1);

  if (valor !== "") { o[ultima] = valor; return false; }

  // Texto vacío → eliminar el elemento si es parte de una lista (o el destacado)
  if (/^\d+$/.test(ultima)) { o.splice(Number(ultima), 1); return true; }
  const padreRuta = partes.slice(0, -2);
  const indice = partes.at(-2);
  if (ultima === "texto" && /^\d+$/.test(indice)) {
    let lista = obj;
    for (const p of padreRuta) lista = lista[p];
    lista.splice(Number(indice), 1);
    return true;
  }
  if (ultima === "texto" && indice === "destacado") {
    let sec = obj;
    for (const p of padreRuta) sec = sec[p];
    delete sec.destacado;
    return true;
  }
  o[ultima] = valor;
  return true;
}

lienzo.addEventListener("focusout", (e) => {
  const el = e.target.closest("[data-path]");
  if (!el) return;
  const valor = el.innerText.replace(/\s+/g, " ").trim();
  const reRender = asignarRuta(datos, el.dataset.path, valor);
  if (reRender || el.closest(".fit")) render();
  else guardarLocal();
});

lienzo.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && e.target.matches("[data-path]")) {
    e.preventDefault();
    e.target.blur();
  }
});

// Pegar siempre como texto plano
lienzo.addEventListener("paste", (e) => {
  if (!e.target.closest("[data-path]")) return;
  e.preventDefault();
  document.execCommand("insertText", false, e.clipboardData.getData("text/plain"));
});

/* ---------- acciones sobre secciones ---------- */
let seccionFoto = null;

lienzo.addEventListener("click", (e) => {
  const btn = e.target.closest("[data-accion]");
  if (!btn) return;
  const i = Number(btn.dataset.i);
  const sec = datos.secciones[i];

  switch (btn.dataset.accion) {
    case "color": {
      const lista = Render.ORDEN_COLORES;
      sec.color = lista[(lista.indexOf(sec.color) + 1) % lista.length];
      break;
    }
    case "tipo-dest": {
      const tipos = Object.keys(Render.DESTACADO);
      sec.destacado.tipo = tipos[(tipos.indexOf(sec.destacado.tipo) + 1) % tipos.length];
      break;
    }
    case "foto":
      seccionFoto = i;
      $("#input-foto").click();
      return;
    case "quitar-foto":
      delete sec._img;
      break;
    case "subir":
      [datos.secciones[i - 1], datos.secciones[i]] = [datos.secciones[i], datos.secciones[i - 1]];
      break;
    case "bajar":
      [datos.secciones[i + 1], datos.secciones[i]] = [datos.secciones[i], datos.secciones[i + 1]];
      break;
    case "borrar":
      if (!confirm(`¿Eliminar la sección ${i + 1}?`)) return;
      datos.secciones.splice(i, 1);
      break;
    case "add-punto":
      (sec.puntos ||= []).push("Nuevo punto");
      break;
    default:
      return;
  }
  render();
});

/* ---------- imágenes (se reducen para no saturar la memoria) ---------- */
function leerImagen(archivo, maxLado = 1600) {
  return new Promise((ok, mal) => {
    const lector = new FileReader();
    lector.onerror = mal;
    lector.onload = () => {
      const img = new Image();
      img.onerror = mal;
      img.onload = () => {
        const k = Math.min(1, maxLado / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * k);
        c.height = Math.round(img.height * k);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        const png = archivo.type === "image/png";
        ok(c.toDataURL(png ? "image/png" : "image/jpeg", 0.9));
      };
      img.src = lector.result;
    };
    lector.readAsDataURL(archivo);
  });
}

$("#input-foto").addEventListener("change", async (e) => {
  const archivo = e.target.files[0];
  e.target.value = "";
  if (!archivo || seccionFoto === null) return;
  datos.secciones[seccionFoto]._img = await leerImagen(archivo);
  seccionFoto = null;
  render();
});

for (const campo of ["logo", "cabecera"]) {
  $(`#input-${campo}`).addEventListener("change", async (e) => {
    const archivo = e.target.files[0];
    e.target.value = "";
    if (!archivo) return;
    opciones[campo] = await leerImagen(archivo, campo === "logo" ? 600 : 1800);
    $(`#quitar-${campo}`).hidden = false;
    render();
  });
  $(`#quitar-${campo}`).addEventListener("click", (e) => {
    opciones[campo] = "";
    e.currentTarget.hidden = true;
    render();
  });
}

/* ---------- panel de opciones ---------- */
document.querySelectorAll("[data-opcion]").forEach((el) => {
  const clave = el.dataset.opcion;
  if (el.type === "radio") el.checked = opciones[clave] === el.value;
  else el.value = opciones[clave];
  el.addEventListener(el.type === "text" ? "input" : "change", () => {
    if (el.type === "radio" && !el.checked) return;
    opciones[clave] = el.value;
    render();
  });
});

/* ---------- generar con IA ---------- */
const texto = $("#texto");
const MAX = Number(texto.maxLength) || 8000;
const contador = () => ($("#contador").textContent = `${texto.value.length} / ${MAX}`);
texto.addEventListener("input", contador);
contador();

let hayAPI = false;
fetch("/api/config").then((r) => r.json()).then((c) => {
  hayAPI = c.api;
  $("#estado-api").textContent = hayAPI
    ? "✅ API de Anthropic conectada: genera en un clic (consume saldo de la API)."
    : "🔒 «Generar con IA» necesita una API key de Anthropic (ANTHROPIC_API_KEY en Render). Sin ella, usa los pasos 2 y 3: gratis con tu Claude Pro.";
}).catch(() => {});

$("#btn-generar").addEventListener("click", async () => {
  const contenido = texto.value.trim();
  if (!hayAPI)
    return aviso("Esta opción necesita una API key de Anthropic configurada en Render (variable ANTHROPIC_API_KEY). Por ahora usa el modo gratis: pulsa «Copiar prompt» (paso 2).", "error");
  if (!contenido) return aviso("Falta el texto: pégalo en el paso 1.", "error");

  const btn = $("#btn-generar");
  btn.disabled = true;
  btn.querySelector("span").textContent = "Generando…";
  aviso("La IA está ordenando tu contenido. Suele tardar entre 10 y 30 segundos.");

  try {
    const r = await fetch("/api/generar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: contenido }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error || `Error ${r.status}`);
    datos = normalizar(json);
    render();
    aviso("¡Listo! Haz clic en cualquier texto para corregirlo antes de descargar.", "ok");
  } catch (err) {
    aviso(err.message || "No se pudo generar la infografía.", "error");
  } finally {
    btn.disabled = false;
    btn.querySelector("span").textContent = "Generar con IA";
  }
});

async function copiarAlPortapapeles(t) {
  try {
    await navigator.clipboard.writeText(t);
  } catch {
    const ta = Object.assign(document.createElement("textarea"), { value: t });
    ta.style.cssText = "position:fixed;opacity:0";
    document.body.append(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    if (!ok) throw new Error("el navegador bloqueó el portapapeles");
  }
}

$("#btn-copiar").addEventListener("click", async () => {
  const contenido = texto.value.trim();
  try {
    const r = await fetch("/api/prompt", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: contenido }),
    });
    const json = await r.json();
    if (!r.ok) throw new Error(json.error);
    await copiarAlPortapapeles(json.prompt);
    aviso(
      contenido
        ? "✅ Prompt copiado. Ahora: abre claude.ai → pega (Ctrl+V) → envía. Puedes adjuntar imágenes de referencia. Luego copia toda la respuesta y pégala en el paso 3."
        : "✅ Prompt copiado SIN texto: en claude.ai adjunta las imágenes de referencia (capturas, fotos, infografías) antes de enviar. Luego pega la respuesta en el paso 3.",
      "ok"
    );
  } catch (err) {
    aviso("No se pudo copiar el prompt: " + err.message, "error");
  }
});

$("#btn-pegar").addEventListener("click", () => {
  const r = $("#respuesta").value.trim();
  if (!r) return aviso("Falta la respuesta de Claude: cópiala de claude.ai y pégala en el paso 3.", "error");
  try {
    datos = normalizar(extraerJSON(r));
  } catch (err) {
    return aviso(`No pude leer la respuesta (${err.message}). Asegúrate de copiar la respuesta COMPLETA de Claude, incluido el bloque \`\`\`json.`, "error");
  }
  render();
  $("#respuesta").value = "";
  aviso("✅ Infografía creada. Haz clic en los textos para corregirlos, añade fotos si quieres y pulsa «Descargar PNG».", "ok");
});

$("#btn-add-seccion").addEventListener("click", () => {
  datos.secciones.push({
    titulo: "Nueva sección",
    color: Render.ORDEN_COLORES[datos.secciones.length % Render.ORDEN_COLORES.length],
    icono: "info",
    descripcion: "Escribe aquí la descripción.",
    puntos: ["Primer punto"],
    destacado: { tipo: "ok", texto: "Idea clave de la sección." },
  });
  render();
});

$("#btn-ejemplo").addEventListener("click", () => {
  datos = clonar(EJEMPLO);
  render();
  aviso("Se cargó el ejemplo.", "info");
});

/* ---------- editor JSON (avanzado) ---------- */
$("#panel-json").addEventListener("toggle", (e) => {
  if (e.target.open) $("#json").value = JSON.stringify(datos, sinPrivados, 2);
});
$("#btn-json").addEventListener("click", () => {
  try {
    const nuevo = normalizar(JSON.parse($("#json").value));
    // Conserva las fotos de las secciones por posición
    (nuevo.secciones || []).forEach((s, i) => { if (datos.secciones[i]?._img) s._img = datos.secciones[i]._img; });
    datos = nuevo;
    render();
    aviso("JSON aplicado.", "ok");
  } catch (err) {
    aviso("El JSON no es válido: " + err.message, "error");
  }
});

/* ---------- exportar PNG ---------- */
function nombreArchivo() {
  const base = `${datos.titulo_linea1 || ""} ${datos.titulo_linea2 || ""}`
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `infografia-${base || "sin-titulo"}.png`;
}

async function exportarPNG() {
  document.activeElement?.blur();
  await document.fonts.ready;
  const info = $("#infografia");
  const canvas = await html2canvas(info, {
    scale: Number(opciones.calidad) || 1,
    backgroundColor: null,
    useCORS: true,
    logging: false,
    width: info.offsetWidth,
    height: info.offsetHeight,
    windowWidth: info.offsetWidth + 100,
    // En la copia que se fotografía, quitamos la reducción de la vista previa
    onclone: (doc) => {
      const e = doc.getElementById("escala");
      e.style.transform = "none";
    },
  });
  return canvas;
}

$("#btn-descargar").addEventListener("click", async () => {
  const btn = $("#btn-descargar");
  btn.disabled = true;
  btn.querySelector("span").textContent = "Creando imagen…";
  try {
    const canvas = await exportarPNG();
    const blob = await new Promise((ok) => canvas.toBlob(ok, "image/png"));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = nombreArchivo();
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    aviso(`Imagen descargada (${canvas.width} × ${canvas.height} px).`, "ok");
  } catch (err) {
    console.error(err);
    aviso("No se pudo crear la imagen: " + err.message, "error");
  } finally {
    btn.disabled = false;
    btn.querySelector("span").textContent = "Descargar PNG";
  }
});

window.exportarPNG = exportarPNG; // útil para pruebas
document.fonts.ready.then(render);
render();
