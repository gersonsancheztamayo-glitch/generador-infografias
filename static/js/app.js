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
  revisarAntes: true,
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

function render({ guardarHistorial = true } = {}) {
  datos.secciones ||= [];
  lienzo.innerHTML = Render.renderInfografia(datos, opciones);
  Render.ajustarTitulos(lienzo);
  ajustarEscala();
  guardarLocal();
  if (guardarHistorial) registrarHistorial();
}

/* ---------- deshacer (guarda los últimos 30 cambios) ---------- */
const historial = [];
function registrarHistorial() {
  const foto = JSON.stringify(datos);
  if (foto === historial.at(-1)) return;
  historial.push(foto);
  if (historial.length > 30) historial.shift();
  $("#btn-deshacer").disabled = historial.length < 2;
}
function deshacer() {
  if (historial.length < 2) return aviso("No hay más cambios para deshacer.", "info");
  historial.pop();
  datos = JSON.parse(historial.at(-1));
  render({ guardarHistorial: false });
  $("#btn-deshacer").disabled = historial.length < 2;
}
$("#btn-deshacer").addEventListener("click", deshacer);
document.addEventListener("keydown", (e) => {
  const escribiendo = e.target.closest("input, textarea, [contenteditable]");
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !escribiendo) {
    e.preventDefault();
    deshacer();
  }
});

function ajustarEscala() {
  const info = $("#infografia");
  if (!info) return;
  const ancho = info.offsetWidth;
  const disponible = marco.clientWidth;
  const k = Math.min(1, disponible / ancho);
  escala.style.transform = `scale(${k})`;
  escala.style.width = ancho + "px";
  marco.style.height = info.offsetHeight * k + "px";
  const ideal = ancho === 1080 ? 1620 : 1080; // proporción 2:3 o 3:2
  const larga = info.offsetHeight > ideal * 1.6;
  const dim = $("#dimensiones");
  dim.textContent = `${ancho} × ${info.offsetHeight} px` + (larga ? " · ⚠ muy larga para celular" : "");
  dim.className = `font-mono text-xs border rounded px-2 py-1 ${larga ? "bg-amber-50 border-amber-300 text-amber-800" : "bg-white border-slate-200"}`;
  dim.title = larga ? "Se leerá con letra pequeña en WhatsApp. Resume textos, quita secciones o usa formato horizontal." : "";
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
  else { guardarLocal(); registrarHistorial(); }
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
function leerImagen(archivo, maxLado = 1600, forzarJpeg = false) {
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
        const png = archivo.type === "image/png" && !forzarJpeg;
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
  else if (el.type === "checkbox") el.checked = !!opciones[clave];
  else el.value = opciones[clave];
  el.addEventListener(el.type === "text" ? "input" : "change", () => {
    if (el.type === "radio" && !el.checked) return;
    opciones[clave] = el.type === "checkbox" ? el.checked : el.value;
    if (el.type === "checkbox") guardarLocal();
    else render();
  });
});

/* ---------- generar con IA ---------- */
const texto = $("#texto");
const MAX = Number(texto.maxLength) || 8000;
const contador = () => ($("#contador").textContent = `${texto.value.length} / ${MAX}`);
texto.addEventListener("input", contador);
contador();

/* ---------- IA disponible en el servidor ---------- */
let IA = { ia: null, ia_nombre: null, gratis: false, max_imagenes: 4 };
fetch("/api/config").then((r) => r.json()).then((c) => {
  IA = c;
  const estado = $("#estado-api");
  if (c.ia === "gemini") {
    estado.innerHTML = "✅ Conectado a <b>Gemini</b> (gratis): lee tu texto y tus imágenes.<br>⚠ En el plan gratuito Google puede usar lo que envías para mejorar sus modelos: no subas datos de clientes.";
  } else if (c.ia === "claude") {
    estado.innerHTML = "✅ Conectado a <b>Claude</b> (API de pago por uso).";
  } else {
    estado.innerHTML = "🔒 «Generar» y «Revisar con IA» necesitan una API key. Gratis: crea una en <b>aistudio.google.com</b> y agrégala en Render → Environment como <b>GEMINI_API_KEY</b>. Mientras tanto usa tu Claude Pro 👇";
    $("#panel-pro").open = true;
    $("#btn-generar").classList.add("opacity-60");
  }
}).catch(() => {});

/* ---------- imágenes de referencia (la IA las lee; no van en la infografía) ---------- */
let referencias = [];
function pintarReferencias() {
  $("#referencias").innerHTML = referencias.map((src, i) => `
    <div class="relative aspect-square rounded-lg overflow-hidden border border-slate-200 bg-slate-100">
      <img src="${src}" alt="Referencia ${i + 1}" class="w-full h-full object-cover">
      <button type="button" data-quitar-ref="${i}" title="Quitar"
        class="absolute top-1 right-1 w-6 h-6 rounded-full bg-black/60 hover:bg-black/80 text-white text-sm leading-none">×</button>
    </div>`).join("");
}
async function agregarReferencias(archivos) {
  const imagenes = [...archivos].filter((f) => /^image\/(png|jpeg|webp)$/.test(f.type));
  if (!imagenes.length) return aviso("Solo se aceptan imágenes JPG, PNG o WEBP.", "error");
  const libres = (IA.max_imagenes || 4) - referencias.length;
  if (libres <= 0) return aviso(`Ya tienes ${referencias.length} imágenes de referencia (máximo). Quita alguna primero.`, "error");
  for (const f of imagenes.slice(0, libres)) referencias.push(await leerImagen(f, 1600, true));
  pintarReferencias();
  if (imagenes.length > libres) aviso(`Solo se agregaron ${libres}: el máximo es ${IA.max_imagenes || 4} imágenes.`, "info");
}
$("#input-referencias").addEventListener("change", async (e) => {
  await agregarReferencias(e.target.files);
  e.target.value = "";
});
$("#referencias").addEventListener("click", (e) => {
  const b = e.target.closest("[data-quitar-ref]");
  if (!b) return;
  referencias.splice(Number(b.dataset.quitarRef), 1);
  pintarReferencias();
});
// Ctrl+V de una captura (fuera de la infografía) → imagen de referencia
document.addEventListener("paste", (e) => {
  if (e.target.closest?.("#lienzo, dialog")) return;
  const archivos = [...(e.clipboardData?.files || [])].filter((f) => f.type.startsWith("image/"));
  if (!archivos.length) return;
  e.preventDefault();
  agregarReferencias(archivos);
});
// Arrastrar y soltar sobre el paso 1
const zonaTexto = texto.closest("section");
zonaTexto.addEventListener("dragover", (e) => { e.preventDefault(); zonaTexto.classList.add("ring-2", "ring-blue-400"); });
zonaTexto.addEventListener("dragleave", () => zonaTexto.classList.remove("ring-2", "ring-blue-400"));
zonaTexto.addEventListener("drop", (e) => {
  e.preventDefault();
  zonaTexto.classList.remove("ring-2", "ring-blue-400");
  if (e.dataTransfer.files.length) agregarReferencias(e.dataTransfer.files);
});

/* Coloca las imágenes de referencia en las secciones: primero donde la IA indicó («imagen»),
   luego en orden en las secciones que sigan sin foto. Devuelve cuántas se colocaron. */
function colocarReferencias(crudo) {
  if (!referencias.length || !$("#usar-referencias").checked) return 0;
  const usadas = new Set();
  (crudo?.secciones || []).forEach((s, i) => {
    const n = Number(s?.imagen) - 1;
    if (datos.secciones[i] && n >= 0 && n < referencias.length && !usadas.has(n)) {
      datos.secciones[i]._img = referencias[n];
      usadas.add(n);
    }
  });
  const libres = referencias.map((_, n) => n).filter((n) => !usadas.has(n));
  datos.secciones.forEach((sec) => {
    if (!sec._img && libres.length) { sec._img = referencias[libres.shift()]; }
  });
  return referencias.length - libres.length;
}
const textoFotos = (n) => (n ? ` Se colocaron ${n} imagen(es) en las secciones: pasa el mouse por una sección para cambiarla o quitarla.` : "");

/* ---------- generar con IA ---------- */
$("#btn-generar").addEventListener("click", async () => {
  const contenido = texto.value.trim();
  if (!IA.ia) {
    $("#panel-pro").open = true;
    return aviso("«Generar con IA» necesita una API key (gratis con Gemini: GEMINI_API_KEY en Render). Por ahora usa «¿Sin API? Usa tu Claude Pro» → Copiar prompt.", "error");
  }
  if (!contenido && !referencias.length) return aviso("Falta el contenido: pega un texto o agrega imágenes de referencia.", "error");

  const btn = $("#btn-generar");
  btn.disabled = true;
  btn.querySelector("span").textContent = "Generando…";
  const extra = referencias.length ? ` y ${referencias.length} imagen(es)` : "";
  aviso(`${IA.ia_nombre} está leyendo tu texto${extra}. Suele tardar entre 10 y 30 segundos.`);

  try {
    const r = await fetch("/api/generar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ texto: contenido, imagenes: referencias }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error || `Error ${r.status}`);
    datos = normalizar(json);
    const n = colocarReferencias(json);
    firmaRevisada = null;
    render();
    aviso("¡Listo! Corrige con un clic lo que quieras y pulsa «Revisar con IA» antes de descargar." + textoFotos(n), "ok");
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
    if (referencias.length)
      return aviso(`✅ Prompt copiado. En claude.ai pégalo y ADJUNTA tus ${referencias.length} imagen(es) de referencia (no se copian solas). Luego pega la respuesta abajo.`, "ok");
    aviso(
      contenido
        ? "✅ Prompt copiado. Ahora: abre claude.ai → pega (Ctrl+V) → envía. Puedes adjuntar imágenes de referencia. Luego copia toda la respuesta y pégala abajo."
        : "✅ Prompt copiado SIN texto: en claude.ai adjunta las imágenes de referencia (capturas, fotos, infografías) antes de enviar. Luego pega la respuesta abajo.",
      "ok"
    );
  } catch (err) {
    aviso("No se pudo copiar el prompt: " + err.message, "error");
  }
});

$("#btn-pegar").addEventListener("click", () => {
  const r = $("#respuesta").value.trim();
  if (!r) return aviso("Falta la respuesta de Claude: cópiala de claude.ai y pégala en el paso 3.", "error");
  let n = 0;
  try {
    const crudo = extraerJSON(r);
    datos = normalizar(crudo);
    n = colocarReferencias(crudo);
  } catch (err) {
    return aviso(`No pude leer la respuesta (${err.message}). Asegúrate de copiar la respuesta COMPLETA de Claude, incluido el bloque \`\`\`json.`, "error");
  }
  render();
  $("#respuesta").value = "";
  if (innerWidth < 1024) $("#marco").scrollIntoView({ behavior: "smooth" });
  aviso("✅ Infografía creada. Haz clic en los textos para corregirlos y pulsa «Descargar PNG»." + textoFotos(n), "ok");
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

$("#btn-descargar").addEventListener("click", () => {
  if (opciones.revisarAntes && firmaRevisada !== firma()) return abrirRevision({ paraDescargar: true });
  descargar();
});

async function descargar() {
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
}

/* =====================================================================
   REVISIÓN CON IA (antes de descargar)
   ===================================================================== */
const firma = () => JSON.stringify(datos, sinPrivados);
let firmaRevisada = null;

const dlg = $("#dlg-revision");
const escHTML = (t) => String(t ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

const CATEGORIAS = {
  ortografia:      { txt: "Ortografía",    cls: "bg-blue-100 text-blue-800" },
  siglas:          { txt: "Siglas",        cls: "bg-indigo-100 text-indigo-800" },
  claridad:        { txt: "Claridad",      cls: "bg-amber-100 text-amber-800" },
  longitud:        { txt: "Muy largo",     cls: "bg-orange-100 text-orange-800" },
  datos_sensibles: { txt: "Dato sensible", cls: "bg-red-100 text-red-800" },
  coherencia:      { txt: "Coherencia",    cls: "bg-violet-100 text-violet-800" },
};

function nombreCampo(ruta) {
  const p = ruta.split(".");
  const fijos = { titulo_linea1: "Título · línea 1", titulo_linea2: "Título · línea 2", subtitulo: "Subtítulo", lema: "Frase del pie", general: "General" };
  if (fijos[ruta]) return fijos[ruta];
  if (p[0] === "secciones") {
    const sec = `Sección ${+p[1] + 1}`;
    const parte = { titulo: "título", descripcion: "descripción", puntos: `punto ${+p[3] + 1}`, chips: `concepto ${+p[3] + 1}`, destacado: "mensaje destacado" }[p[2]];
    return `${sec} · ${parte}`;
  }
  if (p[0] === "verificacion") return p[1] === "titulo" ? "Checklist · título" : `Checklist · ítem ${+p[2] + 1}`;
  if (p[0] === "importante") return `Importante · aviso ${+p[1] + 1}`;
  return ruta;
}

function botonPie(texto, accion, estilo = "sec") {
  const estilos = {
    sec: "border border-slate-300 bg-white hover:bg-slate-50 text-slate-700",
    pri: "bg-[#6b3fd4] hover:bg-[#4a25a3] text-white",
    desc: "bg-[#f26b1d] hover:bg-[#c24d0c] text-white",
  };
  return `<button type="button" data-rev="${accion}" class="h-10 px-4 rounded-lg font-semibold text-sm ${estilos[estilo]}">${texto}</button>`;
}

let revisionActual = null;
let revisionParaDescargar = false;

function abrirRevision({ paraDescargar = false } = {}) {
  document.activeElement?.blur(); // guarda la edición en curso
  revisionParaDescargar = paraDescargar;
  revisionActual = null;
  $("#rev-puntaje").classList.add("hidden");
  if (!dlg.open) dlg.showModal();
  if (IA.ia) revisarConAPI();
  else mostrarModoManual();
}

async function revisarConAPI() {
  $("#rev-resumen").textContent = `${IA.ia_nombre} está revisando ortografía, siglas, claridad, longitud y datos sensibles…`;
  $("#rev-cuerpo").innerHTML = `<div class="flex items-center gap-3 py-10 justify-center text-slate-500">
      <span class="w-6 h-6 rounded-full border-4 border-violet-200 border-t-violet-600 animate-spin"></span> Revisando…</div>`;
  $("#rev-pie").innerHTML = botonPie("Cancelar", "cerrar") + (revisionParaDescargar ? botonPie("Descargar sin revisar", "descargar-sin", "desc") : "");
  try {
    const r = await fetch("/api/revisar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ datos: JSON.parse(firma()) }),
    });
    const json = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(json.error || `Error ${r.status}`);
    if (dlg.open) mostrarResultado(json);
  } catch (err) {
    $("#rev-resumen").textContent = "No se pudo completar la revisión.";
    $("#rev-cuerpo").innerHTML = `<p class="rounded-lg bg-red-50 border border-red-200 text-red-800 p-3">${escHTML(err.message)}</p>`;
    $("#rev-pie").innerHTML = botonPie("Cerrar", "cerrar") + botonPie("Revisar con Claude Pro", "manual") +
      (revisionParaDescargar ? botonPie("Descargar sin revisar", "descargar-sin", "desc") : "");
  }
}

function mostrarModoManual() {
  $("#rev-resumen").textContent = "Sin API key: haz la revisión gratis con tu Claude Pro.";
  $("#rev-cuerpo").innerHTML = `
    <div class="rounded-lg bg-amber-50 border border-amber-200 text-amber-900 p-3 text-[13px]">
      Para revisar en un clic, agrega una API key gratuita de Gemini: <b>aistudio.google.com</b> → «Get API key» →
      Render → Environment → <b>GEMINI_API_KEY</b>.
    </div>
    <ol class="list-decimal pl-5 space-y-1 text-slate-700">
      <li>Pulsa <b>Copiar prompt de revisión</b> y pégalo en un chat nuevo de claude.ai.</li>
      <li>Copia toda la respuesta de Claude y pégala aquí abajo.</li>
    </ol>
    <div class="flex gap-2">
      ${botonPie("📋 Copiar prompt de revisión", "copiar-rev", "pri")}
      <a href="https://claude.ai/new" target="_blank" rel="noopener" class="h-10 px-4 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 font-semibold text-sm flex items-center text-slate-700">Abrir claude.ai ↗</a>
    </div>
    <textarea id="rev-pegada" rows="5" class="w-full rounded-lg border border-slate-300 p-2 text-xs font-mono" placeholder="Pega aquí la respuesta de Claude"></textarea>`;
  $("#rev-pie").innerHTML = botonPie("Cancelar", "cerrar") +
    (revisionParaDescargar ? botonPie("Descargar sin revisar", "descargar-sin", "desc") : "") +
    botonPie("Ver revisión", "leer-pegada", "pri");
}

function mostrarResultado(r) {
  revisionActual = r;
  const badge = $("#rev-puntaje");
  badge.textContent = r.puntaje;
  badge.style.background = r.puntaje >= 9 ? "#13a150" : r.puntaje >= 7 ? "#f59e0b" : "#e02424";
  badge.title = "Puntaje de 1 a 10";
  badge.classList.remove("hidden");
  $("#rev-resumen").textContent = r.resumen || "";

  if (!r.observaciones.length) {
    firmaRevisada = firma();
    $("#rev-cuerpo").innerHTML = `<div class="text-center py-8">
        <div class="text-4xl mb-2">✅</div>
        <p class="font-semibold text-slate-800">No encontré problemas. La infografía está lista para publicar.</p></div>`;
    $("#rev-pie").innerHTML = botonPie("Cerrar", "cerrar") + botonPie("Descargar PNG", "descargar-sin", "desc");
    return;
  }

  $("#rev-cuerpo").innerHTML = r.observaciones.map((o, k) => {
    const cat = CATEGORIAS[o.categoria] || CATEGORIAS.claridad;
    const general = o.ruta === "general";
    return `
    <div class="rounded-xl border border-slate-200 p-3 ${general ? "bg-slate-50" : ""}">
      <div class="flex items-center gap-2 mb-2">
        ${general ? `<span class="w-4"></span>` : `<input type="checkbox" checked data-obs="${k}" class="w-4 h-4 rounded accent-violet-600" title="Aplicar esta corrección">`}
        <span class="text-[11px] font-bold uppercase rounded-full px-2 py-0.5 ${cat.cls}">${cat.txt}</span>
        <span class="text-xs font-semibold text-slate-500">${escHTML(nombreCampo(o.ruta))}</span>
      </div>
      ${general ? "" : `
      <div class="grid gap-1 pl-6">
        <p class="rounded-md bg-red-50 text-red-900 px-2 py-1 line-through decoration-red-400">${escHTML(o.original)}</p>
        <p class="rounded-md bg-green-50 text-green-900 px-2 py-1 font-medium" contenteditable="true" spellcheck="false" data-sug="${k}" title="Puedes editar la sugerencia antes de aplicarla">${escHTML(o.sugerencia)}</p>
      </div>`}
      <p class="text-xs text-slate-500 mt-1 pl-6">${escHTML(o.motivo)}</p>
    </div>`;
  }).join("") + `<p class="text-xs text-slate-400">Desmarca lo que no quieras cambiar. Puedes editar el texto verde antes de aplicar.</p>`;

  const hayAplicables = r.observaciones.some((o) => o.ruta !== "general");
  $("#rev-pie").innerHTML = botonPie("Cancelar", "cerrar") + (revisionParaDescargar
    ? botonPie("Descargar sin cambios", "descargar-sin", "sec") + (hayAplicables ? botonPie("Aplicar y descargar", "aplicar-descargar", "desc") : "")
    : (hayAplicables ? botonPie("Aplicar seleccionadas", "aplicar", "pri") : botonPie("Entendido", "visto", "pri")));
}

function aplicarSeleccionadas() {
  let n = 0;
  revisionActual.observaciones.forEach((o, k) => {
    if (o.ruta === "general" || !dlg.querySelector(`[data-obs="${k}"]`)?.checked) return;
    const nuevo = dlg.querySelector(`[data-sug="${k}"]`).innerText.replace(/\s+/g, " ").trim();
    if (!nuevo) return;
    asignarRuta(datos, o.ruta, nuevo);
    n++;
  });
  render();
  firmaRevisada = firma();
  return n;
}

dlg.addEventListener("click", async (e) => {
  if (e.target === dlg || e.target.closest("[data-cerrar]")) return dlg.close();
  const b = e.target.closest("[data-rev]");
  if (!b) return;
  switch (b.dataset.rev) {
    case "cerrar":
      return dlg.close();
    case "visto":
      firmaRevisada = firma();
      return dlg.close();
    case "manual":
      return mostrarModoManual();
    case "aplicar": {
      const n = aplicarSeleccionadas();
      dlg.close();
      return aviso(n ? `✅ Se aplicaron ${n} corrección(es).` : "No se aplicó ningún cambio.", "ok");
    }
    case "aplicar-descargar":
      aplicarSeleccionadas();
      dlg.close();
      return descargar();
    case "descargar-sin":
      firmaRevisada = firma();
      dlg.close();
      return descargar();
    case "copiar-rev":
      try {
        const r = await fetch("/api/prompt-revision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ datos: JSON.parse(firma()) }),
        });
        const json = await r.json();
        if (!r.ok) throw new Error(json.error);
        await copiarAlPortapapeles(json.prompt);
        b.textContent = "✅ Copiado: pégalo en claude.ai";
      } catch (err) {
        b.textContent = "No se pudo copiar: " + err.message;
      }
      return;
    case "leer-pegada": {
      const txt = $("#rev-pegada").value.trim();
      if (!txt) return $("#rev-pegada").focus();
      try {
        const rev = extraerJSON(txt);
        const r = await fetch("/api/limpiar-revision", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ datos: JSON.parse(firma()), revision: rev }),
        });
        const json = await r.json();
        if (!r.ok) throw new Error(json.error);
        mostrarResultado(json);
      } catch (err) {
        $("#rev-pegada").classList.add("border-red-400");
        $("#rev-resumen").textContent = `No pude leer la respuesta (${err.message}). Copia la respuesta completa de Claude.`;
      }
      return;
    }
  }
});

$("#btn-revisar").addEventListener("click", () => abrirRevision());

/* ---------- compartir (celular: WhatsApp, Telegram, etc.) ---------- */
const btnCompartir = $("#btn-compartir");
const puedeCompartir = !!navigator.canShare?.({ files: [new File([""], "x.png", { type: "image/png" })] });
btnCompartir.hidden = !puedeCompartir;
btnCompartir.addEventListener("click", async () => {
  btnCompartir.disabled = true;
  try {
    const canvas = await exportarPNG();
    const blob = await new Promise((ok) => canvas.toBlob(ok, "image/png"));
    await navigator.share({ files: [new File([blob], nombreArchivo(), { type: "image/png" })] });
  } catch (err) {
    if (err.name !== "AbortError") aviso("No se pudo compartir: " + err.message + ". Usa «Descargar PNG».", "error");
  } finally {
    btnCompartir.disabled = false;
  }
});

window.exportarPNG = exportarPNG; // útil para pruebas
document.fonts.ready.then(render);
render();
