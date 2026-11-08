/* =====================================================================
   RENDER DE LA INFOGRAFÍA
   Convierte el JSON (datos) + las opciones de diseño en HTML.
   Todo lo que lleva data-html2canvas-ignore NO aparece en el PNG.
   ===================================================================== */

const PALETA = {
  azul:    { c: "#1746d4", d: "#0d2a9a", s: "#e8f0ff", s2: "#f3f7ff", b: "#bcd3ff" },
  verde:   { c: "#13a150", d: "#0a7038", s: "#e4f7ec", s2: "#f2fbf6", b: "#ade4c5" },
  morado:  { c: "#6b3fd4", d: "#4a25a3", s: "#efe9ff", s2: "#f8f5ff", b: "#d4c6fb" },
  naranja: { c: "#f26b1d", d: "#c24d0c", s: "#fff0e6", s2: "#fff8f3", b: "#ffcfb0" },
  rojo:    { c: "#e02424", d: "#a51717", s: "#fdeaea", s2: "#fff6f6", b: "#f5bcbc" },
  celeste: { c: "#0ea5e9", d: "#0369a1", s: "#e3f5fd", s2: "#f2fafe", b: "#ade0f7" },
};
const ORDEN_COLORES = Object.keys(PALETA);

const DESTACADO = {
  ok:     { c: "#13a150", s: "#e6f7ed", b: "#ade4c5", t: "#0a5c2e", i: "_check" },
  alerta: { c: "#f59e0b", s: "#fff6e0", b: "#fbd78a", t: "#7a4a00", i: "alerta" },
  error:  { c: "#e02424", s: "#fdeaea", b: "#f5bcbc", t: "#8f1414", i: "_x" },
  info:   { c: "#1746d4", s: "#e8f0ff", b: "#bcd3ff", t: "#0d2a9a", i: "info" },
};

const ACENTOS = { cian: "#3fe3f8", naranja: "#ff7a1a", verde: "#43f0a6", amarillo: "#ffd43b" };

/* ---------- utilidades ---------- */
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));

/** SVG con color EXPLÍCITO (html2canvas no resuelve currentColor dentro de SVG). */
function icono(nombre, color = "#fff", size = 28, { sw = 2, fill = "none" } = {}) {
  const inner = (window.ICONOS && (ICONOS[nombre] || ICONOS.info)) || "";
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${fill}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" style="flex:none;display:block">${inner}</svg>`;
}

/** Texto editable con clic. `path` indica dónde guardar el cambio dentro de los datos. */
const ed = (path, valor, tag = "span", attrs = "") =>
  `<${tag} contenteditable="true" spellcheck="false" data-path="${path}" ${attrs}>${esc(valor)}</${tag}>`;

/** Imagen como fondo "cover" (html2canvas no soporta object-fit). */
const bg = (url) => `background-image:url('${url}');background-size:cover;background-position:center;background-repeat:no-repeat;`;

const vars = (p) => `--c:${p.c};--d:${p.d};--s:${p.s};--s2:${p.s2};--b:${p.b};`;

/* ---------- decoración de cabecera (casa + poste + cable) ---------- */
const svgImg = (svg, estilo) =>
  `<img alt="" class="absolute pointer-events-none" style="${estilo}" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}">`;

function decoCabecera(acento) {
  return svgImg(`
  <svg xmlns="http://www.w3.org/2000/svg" width="330" height="230" viewBox="0 0 330 230" fill="none">
    <path d="M150 92 C 205 62, 245 52, 296 46" stroke="${acento}" stroke-width="4" stroke-linecap="round"/>
    <path d="M150 104 C 210 86, 250 80, 296 78" stroke="${acento}" stroke-width="3" stroke-linecap="round" opacity=".55"/>
    <g transform="translate(18,70) scale(5.4)">${ICONOS.hogar.replace(/<(path|rect|circle|line)/g, `<$1 stroke="${acento}" stroke-width="1.15" stroke-linecap="round" stroke-linejoin="round" fill="none"`)}</g>
    <g transform="translate(240,16) scale(8.6)">${ICONOS.poste.replace(/<(path|rect|circle|line)/g, `<$1 stroke="${acento}" stroke-width=".8" stroke-linecap="round" stroke-linejoin="round" fill="none"`)}</g>
  </svg>`, "right:30px;top:28px;width:300px;height:209px;opacity:.95");
}

/* ---------- distribución automática ---------- */
function resolverDistribucion(datos, op) {
  if (op.distribucion !== "auto") return op.distribucion;
  return candidatas(datos, op)[0];
}

/** Distribuciones a probar en modo automático (la web elige la que deja la letra más grande). */
function candidatas(datos, op) {
  const n = datos.secciones.length;
  if (op.formato === "horizontal") return n <= 4 ? ["columnas", "cuadricula"] : ["cuadricula", "columnas"];
  return n <= 2 ? ["lista"] : n === 3 ? ["lista", "columnas"] : ["cuadricula", "lista"];
}

/** Columnas de la cuadrícula: nunca tarjetas más angostas de ~480 px. */
function columnas(modo, n, h) {
  if (modo === "lista") return 1;
  if (modo === "cuadricula") return h ? (n === 4 ? 2 : 3) : 2;
  return Math.max(1, Math.min(n, h ? 4 : 3)); // "columnas": todas las secciones en una fila
}

/* ---------- piezas ---------- */
function htmlCabecera(d, op, ancho) {
  const acento = ACENTOS[op.acento] || ACENTOS.cian;
  const h = op.formato === "horizontal";
  const conFoto = !!op.cabecera;
  const anchoTexto = conFoto ? 0.48 : h ? 0.7 : 0.64;
  return `
  <header class="info-head relative overflow-hidden" style="padding:${h ? "34px 60px 58px" : "54px 60px 86px"}">
    ${conFoto
      ? `<div class="absolute top-0 h-full overflow-hidden" style="right:-120px;width:calc(42% + 120px);transform:skewX(-12deg);transform-origin:bottom left;border-left:8px solid rgba(255,255,255,.9)">
           <div class="absolute top-0 h-full" style="left:-90px;width:calc(100% + 90px);transform:skewX(12deg);transform-origin:bottom left;${bg(op.cabecera)}"></div>
         </div>`
      : decoCabecera(acento)}
    ${op.logo ? `<div class="absolute z-20 bg-white rounded-2xl shadow-lg flex items-center justify-center" style="top:30px;right:34px;padding:10px 16px;height:84px"><img src="${op.logo}" style="max-height:64px;max-width:200px"></div>` : ""}
    <div class="relative z-10" style="width:${Math.round(anchoTexto * 100)}%">
      ${op.etiqueta ? `
      <div class="info-pill inline-flex items-center gap-3 rounded-full text-white display font-extrabold uppercase" style="padding:8px 26px 8px 16px;font-size:calc(24px * var(--k,1));margin-bottom:22px">
        ${icono("tiempo", "#fff", 30, { sw: 2.4 })}<span>${esc(op.etiqueta)}</span>
      </div>` : ""}
      <h1 class="display font-black uppercase">
        <div class="info-title fit text-white" data-max="${h ? 80 : 96}">${ed("titulo_linea1", d.titulo_linea1)}</div>
        <div class="info-title fit" data-max="${h ? 80 : 96}" style="color:${acento}">${ed("titulo_linea2", d.titulo_linea2)}</div>
      </h1>
      ${ed("subtitulo", d.subtitulo, "p", `class="text-white font-semibold" style="font-size:calc(30px * var(--k,1));line-height:1.25;margin-top:18px;opacity:.96"`)}
    </div>
    ${svgImg(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="64" viewBox="0 0 1000 64" preserveAspectRatio="none"><path d="M0 64 L0 40 C 260 6, 620 70, 1000 8 L1000 64 Z" fill="${op.fondo === "claro" ? "#eef4ff" : "#1645d6"}"/></svg>`, "left:0;bottom:-1px;width:100%;height:64px")}
  </header>`;
}

function htmlPuntos(s, i) {
  if (!s.puntos?.length) return "";
  return `<ul class="flex flex-col" style="gap:12px;margin-top:14px">
    ${s.puntos.map((p, j) => `
      <li class="flex items-start" style="gap:14px;font-size:calc(25px * var(--k,1));line-height:1.3">
        <span class="chk">${icono("_check", "#fff", 22, { sw: 3.2 })}</span>
        ${ed(`secciones.${i}.puntos.${j}`, p, "span", `class="font-medium"`)}
      </li>`).join("")}
  </ul>`;
}

function htmlChips(s, i, enFila) {
  if (!s.chips?.length) return "";
  return `<div class="${enFila ? "grid" : "flex flex-col"}" style="gap:12px;${enFila ? "margin-top:18px;grid-template-columns:repeat(auto-fit,minmax(230px,1fr))" : ""}">
    ${s.chips.map((c, j) => `
      <div class="chip flex items-center" style="gap:14px;padding:10px 18px 10px 10px">
        <span class="chip-ic">${icono(c.icono, "#fff", 30)}</span>
        ${ed(`secciones.${i}.chips.${j}.texto`, c.texto, "span", `class="display font-extrabold" style="font-size:calc(23px * var(--k,1));line-height:1.15;color:var(--d)"`)}
      </div>`).join("")}
  </div>`;
}

function htmlDestacado(s, i) {
  if (!s.destacado?.texto) return "";
  const t = DESTACADO[s.destacado.tipo] || DESTACADO.info;
  return `<div class="dest flex items-center" style="--ds:${t.s};--db:${t.b};--dc:${t.c};gap:14px;padding:10px 20px 10px 10px;margin-top:18px">
    <span class="dest-ic" data-accion="tipo-dest" data-i="${i}" title="Clic: cambiar tipo">${icono(t.i, "#fff", 26, { sw: 3 })}</span>
    ${ed(`secciones.${i}.destacado.texto`, s.destacado.texto, "span", `class="font-bold" style="font-size:calc(23px * var(--k,1));line-height:1.25;color:${t.t}"`)}
  </div>`;
}

function htmlControlesSeccion(i, total, tieneFoto) {
  const b = (accion, ic, titulo, extra = "") =>
    `<button type="button" data-accion="${accion}" data-i="${i}" title="${titulo}" class="rounded-lg flex items-center justify-center" style="width:44px;height:44px" ${extra}>${icono(ic, "#1e3a8a", 24)}</button>`;
  return `<div class="ctrl absolute flex z-30" style="top:16px;right:16px;gap:8px" data-html2canvas-ignore>
    ${b("add-punto", "_plus", "Añadir punto")}
    ${b("foto", "_img", tieneFoto ? "Cambiar foto" : "Añadir foto")}
    ${tieneFoto ? b("quitar-foto", "_x", "Quitar foto") : ""}
    ${i > 0 ? b("subir", "_up", "Subir sección") : ""}
    ${i < total - 1 ? b("bajar", "_down", "Bajar sección") : ""}
    ${b("borrar", "_trash", "Eliminar sección")}
  </div>`;
}

function htmlSeccion(s, i, total, ancha) {
  const p = PALETA[s.color] || PALETA[ORDEN_COLORES[i % ORDEN_COLORES.length]];
  const foto = s._img;
  const chips = s.chips?.length;
  // En tarjetas anchas, la foto (o los conceptos) van a la derecha; si no hay, el texto ocupa todo.
  const lateral = ancha && (foto || chips)
    ? (foto ? `<div class="foto w-full h-full" style="min-height:230px;${bg(foto)}"></div>` : htmlChips(s, i, false))
    : "";

  return `
  <article class="sec relative" style="${vars(p)}border-radius:28px;padding:22px 28px 24px 20px">
    ${htmlControlesSeccion(i, total, !!foto)}
    <div class="relative flex items-center" style="min-height:92px;margin-bottom:12px">
      <div class="sec-ribbon display" style="font-size:${ancha ? 31 : 26}px">${ed(`secciones.${i}.titulo`, s.titulo)}</div>
      <div class="sec-num display" data-accion="color" data-i="${i}" title="Clic: cambiar color">${i + 1}</div>
    </div>
    ${!ancha && foto ? `<div class="foto w-full" style="height:230px;margin:2px 0 14px;${bg(foto)}"></div>` : ""}
    <div class="${lateral ? "grid" : ""}" style="${lateral ? "grid-template-columns:1fr 38%;gap:26px;align-items:start;" : ""}padding-left:8px">
      <div>
        ${s.descripcion ? ed(`secciones.${i}.descripcion`, s.descripcion, "p", `style="font-size:26px;line-height:1.3;font-weight:500"`) : ""}
        ${htmlPuntos(s, i)}
      </div>
      ${lateral ? `<div>${lateral}</div>` : ""}
    </div>
    ${!lateral && chips ? `<div style="padding-left:8px">${htmlChips(s, i, true)}</div>` : ""}
    <div style="padding-left:8px">${htmlDestacado(s, i)}</div>
  </article>`;
}

function htmlVerificacion(v) {
  if (!v?.items?.length) return "";
  return `
  <section class="verif flex items-center" style="border-radius:30px;padding:24px 30px;gap:28px">
    <div class="flex items-center" style="gap:18px;width:290px;flex:none">
      <span class="flex items-center justify-center rounded-full" style="width:88px;height:88px;background:#13a150;flex:none">${icono("_check", "#fff", 54, { sw: 3.2 })}</span>
      ${ed("verificacion.titulo", v.titulo, "span", `class="display font-extrabold uppercase" style="font-size:calc(28px * var(--k,1));line-height:1.1;color:#0a7038"`)}
    </div>
    <div class="grid flex-1" style="grid-template-columns:repeat(${v.items.length <= 4 ? v.items.length : 3},minmax(0,1fr));row-gap:18px">
      ${v.items.map((it, j) => `
        <div class="flex flex-col items-center text-center" style="padding:0 10px;${j % (v.items.length <= 4 ? 4 : 3) ? "border-left:2px solid #b5dfc8;" : ""}">
          <div class="relative" style="margin-bottom:10px">
            ${icono(it.icono, "#1746d4", 58, { sw: 1.7 })}
            <span class="absolute flex items-center justify-center rounded-full" style="right:-12px;bottom:-6px;width:28px;height:28px;background:#13a150;border:3px solid #fff">${icono("_check", "#fff", 15, { sw: 4 })}</span>
          </div>
          ${ed(`verificacion.items.${j}.texto`, it.texto, "span", `class="font-semibold" style="font-size:calc(21px * var(--k,1));line-height:1.2"`)}
        </div>`).join("")}
    </div>
  </section>`;
}

function htmlImportante(lista, op) {
  if (!lista?.length) return "";
  const apilar = op.formato !== "horizontal" && (lista.length > 2 || lista.some((it) => it.texto.length > 55));
  return `
  <section class="imp flex items-center" style="border-radius:30px;padding:22px 30px;gap:24px">
    <div class="flex ${apilar ? "flex-col text-center" : ""} items-center" style="gap:${apilar ? 6 : 16}px;flex:none;${apilar ? "width:200px" : ""}">
      ${icono("alerta", "#e02424", 76, { sw: 2.2 })}
      <span class="display font-black uppercase" style="font-size:calc(32px * var(--k,1));color:#d01c1c">Importante</span>
    </div>
    <div class="flex flex-1 ${apilar ? "flex-col" : ""}">
      ${lista.map((it, j) => `
        <div class="flex-1 flex items-center" style="gap:14px;${apilar ? `padding:12px 6px;${j ? "border-top:2px solid #f0b3b3;" : ""}` : `padding:0 18px;${j ? "border-left:2px solid #f0b3b3;" : ""}`}">
          ${it.tipo === "no" ? icono("prohibido", "#e02424", 46, { sw: 2.4 }) : icono("check", "#13a150", 46, { sw: 2.4 })}
          ${ed(`importante.${j}.texto`, it.texto, "span", `class="font-semibold" style="font-size:calc(22px * var(--k,1));line-height:1.25"`)}
        </div>`).join("")}
    </div>
  </section>`;
}

function htmlPie(d, op) {
  const acento = ACENTOS[op.acento] || ACENTOS.cian;
  return `
  <footer class="info-foot flex items-center text-white" style="padding:34px 60px;gap:36px">
    ${icono("casco", "#fff", 86, { sw: 1.5 })}
    <div style="width:3px;height:92px;background:rgba(255,255,255,.55)"></div>
    ${ed("lema", d.lema, "p", `class="flex-1 font-semibold" style="font-size:calc(34px * var(--k,1));line-height:1.25"`)}
    ${op.firma1 || op.firma2 ? `
      <div style="width:3px;height:92px;background:rgba(255,255,255,.55)"></div>
      <div class="flex items-center" style="gap:16px">
        ${icono("potencia", "none", 74, { sw: 0, fill: acento })}
        <div class="display font-black leading-none">
          <div style="font-size:calc(60px * var(--k,1))">${esc(op.firma1)}</div>
          <div style="font-size:calc(33px * var(--k,1));color:${acento};margin-top:4px">${esc(op.firma2)}</div>
        </div>
      </div>` : ""}
  </footer>`;
}

/* ---------- ensamblado ---------- */
function renderInfografia(datos, op) {
  const h = op.formato === "horizontal";
  const ancho = h ? 1620 : 1080;
  const alto = h ? 1080 : 1620;
  const modo = resolverDistribucion(datos, op);
  const n = datos.secciones.length;
  const cols = columnas(modo, n, h);
  const ancha = cols === 1 || (h && cols === 2); // tarjetas con espacio para texto + foto lado a lado
  const fondo = op.fondo === "claro" ? "#eef4ff" : "linear-gradient(180deg,#1645d6 0%,#0f36b8 100%)";

  return `
  <div id="infografia" class="info flex flex-col" data-ancho="${ancho}" data-alto="${alto}" data-k="1" style="width:${ancho}px;min-height:${alto}px;background:${fondo}">
    ${htmlCabecera(datos, op, ancho)}
    <main class="flex-1 flex flex-col justify-center" style="padding:${h ? "18px 40px 30px" : "10px 34px 34px"};gap:24px">
      <div class="grid" style="grid-template-columns:repeat(${cols},minmax(0,1fr));gap:22px;align-items:stretch">
        ${datos.secciones.map((s, i) => htmlSeccion(s, i, n, ancha)).join("")}
      </div>
      ${htmlVerificacion(datos.verificacion)}
      ${htmlImportante(datos.importante, op)}
    </main>
    ${htmlPie(datos, op)}
  </div>`;
}

/** Reduce el tamaño de letra de los títulos hasta que entren en su ancho. */
function ajustarTitulos(raiz) {
  raiz.querySelectorAll(".fit").forEach((el) => {
    let size = Number(el.dataset.max) || 90;
    el.style.fontSize = size + "px";
    el.style.whiteSpace = "nowrap";
    while (el.scrollWidth > el.clientWidth && size > 46) {
      size -= 2;
      el.style.fontSize = size + "px";
    }
    if (el.scrollWidth > el.clientWidth) el.style.whiteSpace = "normal"; // título muy largo: 2 renglones
  });
}

/**
 * Encaja la infografía en su formato (2:3 o 3:2) escalando TODO de forma proporcional:
 * se maqueta en un lienzo más ancho (ancho / k) y al exportar se reduce por k.
 * Así letra, íconos, cintas y espacios conservan sus proporciones, como en un afiche.
 */
function encajarEnFormato(raiz, activar = true, minimo = 0.66) {
  const info = raiz.querySelector("#infografia");
  if (!info) return 1;
  const ancho = Number(info.dataset.ancho);
  const alto = Number(info.dataset.alto);
  const aplicar = (k) => {
    info.style.width = Math.round(ancho / k) + "px";
    info.style.minHeight = Math.round(alto / k) + "px";
    info.dataset.k = k;
    ajustarTitulos(raiz);
  };
  let k = 1;
  aplicar(k);
  if (!activar) return k;
  while (info.offsetHeight * k > alto + 2 && k > minimo) {
    k = Math.max(minimo, Math.round((k - 0.03) * 100) / 100);
    aplicar(k);
  }
  return k;
}

window.Render = { renderInfografia, ajustarTitulos, encajarEnFormato, candidatas, PALETA, ORDEN_COLORES, DESTACADO, ACENTOS };
