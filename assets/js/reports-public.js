/* ============================================================
   reports-public.js — pinta los informes en el sitio público
   Los datos vienen de assets/js/data-source.js (planilla de Google).
   ============================================================ */

const CENTRO_COLORS = {
  CEER:    '#3a3aff',
  CEEIR:   '#4aa8ec',
  CEDHyS:  '#3f74e6',
  OPER:    '#e0564b',
  OPAL:    '#16b7c2',
  OPSA:    '#e07a3c',
  CIREN:   '#14bd92',
  'Cíclica': '#2fb8e6'
};

// Ruta a las subpáginas (funciona desde la raíz y desde /pages/)
const PAGES_BASE = /\/pages\/$/.test(location.pathname.replace(/[^/]*$/, '')) ? '' : 'pages/';
function informeUrl(id) { return `${PAGES_BASE}informe.html?id=${encodeURIComponent(id)}`; }

function formatMonthYear(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d)) return dateStr;
  return d.toLocaleDateString('es-AR', { year: 'numeric', month: 'long' });
}

function esc(text) {
  if (!text) return '';
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function spinner(msg = 'Cargando publicaciones...') {
  return `<div class="grid-state"><div class="grid-spinner"></div><p>${esc(msg)}</p></div>`;
}
function emptyState(msg) { return `<div class="grid-state">${esc(msg)}</div>`; }
function errorState(msg) { return `<div class="grid-state grid-state--error">${esc(msg)}</div>`; }

function noData() {
  return typeof CERData === 'undefined';
}

// ── Publicaciones de un centro en .publicaciones-grid ──
async function loadCentroPublicaciones(centroId, centroSlug) {
  const grid = document.querySelector('.publicaciones-grid');
  if (!grid) return;
  if (noData()) { grid.innerHTML = errorState('No se pudo cargar la fuente de datos.'); return; }
  grid.innerHTML = spinner();

  try {
    const reports = await CERData.getReports(centroId);
    if (!reports.length) { grid.innerHTML = emptyState('Todavía no hay publicaciones de este centro.'); return; }

    grid.innerHTML = reports.map(r => `
      <article class="publicacion-card">
        <div class="publicacion-meta">
          <span class="publicacion-date">${formatMonthYear(r.fecha)}</span>
          <span class="publicacion-type-${centroSlug}">${esc(r.tag)}</span>
        </div>
        <h3 class="publicacion-title">${esc(r.titulo)}</h3>
        ${r.descripcion ? `<p class="publicacion-excerpt">${esc(r.descripcion)}</p>` : ''}
        <a href="${informeUrl(r.id)}" class="publicacion-link-${centroSlug}">Ver informe <i class="fas fa-arrow-right"></i></a>
      </article>
    `).join('');
  } catch (e) {
    grid.innerHTML = errorState('Error al cargar publicaciones.');
  }
}

// ── Últimas 6 publicaciones de todos los centros ──
async function loadUltimasPublicaciones() {
  const grid = document.querySelector('.novedades-grid');
  if (!grid) return;
  if (noData()) { grid.innerHTML = errorState('No se pudo cargar la fuente de datos.'); return; }
  grid.innerHTML = spinner();

  try {
    const reports = (await CERData.getReports('all')).slice(0, 6);
    if (!reports.length) { grid.innerHTML = emptyState('Todavía no hay publicaciones.'); return; }

    grid.innerHTML = reports.map(r => `
      <article class="novedad-card novedad-card--plain">
        <div class="novedad-content">
          <div class="novedad-meta">
            <span class="novedad-date">${formatMonthYear(r.fecha)}</span>
            <span class="publicacion-type-${(r.centro || '').toLowerCase()}">${esc(r.centro)}</span>
          </div>
          <h3 class="novedad-title">${esc(r.titulo)}</h3>
          <p class="novedad-excerpt">${esc(
            r.descripcion
              ? (r.descripcion.length > 140 ? r.descripcion.slice(0, 140) + '…' : r.descripcion)
              : r.tag
          )}</p>
          <a href="${informeUrl(r.id)}" class="informe-link">Ver informe <i class="fas fa-arrow-right"></i></a>
        </div>
      </article>
    `).join('');
  } catch (e) {
    grid.innerHTML = errorState('Error al cargar publicaciones.');
  }
}

// ── Informes destacados ──
async function loadInformesDestacados() {
  const grid = document.querySelector('.informes-grid');
  if (!grid) return;
  if (noData()) { grid.innerHTML = errorState('No se pudo cargar la fuente de datos.'); return; }
  grid.innerHTML = spinner();

  try {
    let reports = await CERData.getFeatured();
    // Si nadie está marcado como destacado, mostramos los más recientes
    if (!reports.length) reports = (await CERData.getReports('all')).slice(0, 3);
    if (!reports.length) { grid.innerHTML = emptyState('Todavía no hay informes para destacar.'); return; }

    grid.innerHTML = reports.map(r => `
      <article class="informe-card">
        <div class="informe-meta">
          <span class="informe-date">${formatMonthYear(r.fecha)}</span>
          <span class="publicacion-type-${(r.centro || '').toLowerCase()}">${esc(r.centro)}</span>
        </div>
        <h3 class="informe-title">${esc(r.titulo)}</h3>
        <p class="informe-excerpt">${esc(r.descripcion || r.tag)}</p>
        <a href="${informeUrl(r.id)}" class="informe-link">Ver informe <i class="fas fa-arrow-right"></i></a>
      </article>
    `).join('');
  } catch (e) {
    grid.innerHTML = errorState('Error al cargar los informes.');
  }
}

// ── Miembros de un centro (la sección se oculta si no hay datos) ──
async function loadMiembros(centroId) {
  const section = document.querySelector('.miembros');
  if (!section) return;
  if (noData()) { section.style.display = 'none'; return; }

  try {
    const miembros = await CERData.getMiembros(centroId);
    if (!miembros.length) { section.style.display = 'none'; return; }

    section.style.display = '';
    const grid = section.querySelector('.miembros-grid');
    if (!grid) return;
    grid.innerHTML = miembros.map(m => `
      <div class="miembro-item">
        <h3 class="miembro-nombre">${esc(m.nombre)}</h3>
        <p class="miembro-cargo">${esc(m.cargo)}</p>
        <p class="miembro-descripcion">${esc(m.descripcion)}</p>
      </div>
    `).join('');
  } catch (e) {
    section.style.display = 'none';
  }
}

// Estilos de estado para las grillas
document.head.insertAdjacentHTML('beforeend', `<style>
  @keyframes cer-spin { to { transform: rotate(360deg); } }
  .grid-state { grid-column: 1/-1; text-align: center; padding: 3rem 1rem; color: var(--gray-500, #9494c0); }
  .grid-state--error { color: #f87171; }
  .grid-spinner {
    width: 34px; height: 34px; margin: 0 auto 1rem;
    border: 3px solid rgba(255,255,255,.12);
    border-top-color: var(--cer-cyan, #22d3ee);
    border-radius: 50%;
    animation: cer-spin .8s linear infinite;
  }
</style>`);
