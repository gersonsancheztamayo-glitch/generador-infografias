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
  el.className = `rounded-xl border px-4 py-3 text-sm ${estilos[tipo]}`;
  el.textContent = texto;
  el.hidden = !texto;
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

$("#btn-generar").addEventListener("click", async () => {
  const contenido = texto.value.trim();
  if (!contenido) return aviso("Pega o escribe primero el texto de la capacitación.", "error");

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
    datos = json;
    render();
    aviso("¡Listo! Haz clic en cualquier texto para corregirlo antes de descargar.", "ok");
  } catch (err) {
    aviso(err.message || "No se pudo generar la infografía.", "error");
  } finally {
    btn.disabled = false;
    btn.querySelector("span").textContent = "Generar con IA";
  }
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
    const nuevo = JSON.parse($("#json").value);
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
