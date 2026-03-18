// ============================================================
// reports-public.js — carga dinámica de informes desde la API
// ============================================================

const API_URL = 'https://script.google.com/macros/s/AKfycby6Lb2jHPHYs8jsuNxZpM9b6OBIcH5y6isw8WRBidPSIlpdTOarYzKv1dnueEpll12R/exec';

const CENTRO_COLORS = {
  CEER:   '#020995',
  CEEIR:  '#489bdc',
  CEDHyS: '#2850bd',
  OPER:   '#780000',
  OPAL:   '#006D77',
  OPSA:   '#a64319',
  CIREN:  '#014b3e'
};

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

// ── Carga las publicaciones de un centro en .publicaciones-grid ──
async function loadCentroPublicaciones(centroId, centroSlug) {
  const grid = document.querySelector('.publicaciones-grid');
  if (!grid) return;

  grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:#64748b;">
    <div class="loading-spinner" style="display:inline-block;width:36px;height:36px;border:3px solid rgba(0,0,0,.1);border-top-color:#3276f3;border-radius:50%;animation:spin .8s linear infinite;margin-bottom:1rem;"></div>
    <p>Cargando publicaciones...</p>
  </div>`;

  try {
    const res  = await fetch(`${API_URL}?action=getReports&centro=${encodeURIComponent(centroId)}`);
    const data = await res.json();

    if (!data.success || !data.reports.length) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:#64748b;">No hay publicaciones aún.</div>`;
      return;
    }

    grid.innerHTML = data.reports.map(r => `
      <div class="publicacion-card">
        <div class="publicacion-meta">
          <span class="publicacion-date">${formatMonthYear(r.fecha)}</span>
          <span class="publicacion-type-${centroSlug}">${esc(r.tag)}</span>
        </div>
        <h3 class="publicacion-title">${esc(r.titulo)}</h3>
        <a href="${r.pdf_url}" target="_blank" class="publicacion-link-${centroSlug}">
          Leer más <i class="fas fa-download"></i>
        </a>
      </div>
    `).join('');
  } catch (e) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:#ef4444;">Error al cargar publicaciones.</div>`;
  }
}

// ── Carga las últimas 6 publicaciones de todos los centros ──
async function loadUltimasPublicaciones() {
  const grid = document.querySelector('.novedades-grid');
  if (!grid) return;

  grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:#64748b;">
    <div style="display:inline-block;width:36px;height:36px;border:3px solid rgba(0,0,0,.1);border-top-color:#3276f3;border-radius:50%;animation:spin .8s linear infinite;margin-bottom:1rem;"></div>
    <p>Cargando publicaciones...</p>
  </div>`;

  try {
    const res  = await fetch(`${API_URL}?action=getReports&centro=all`);
    const data = await res.json();

    if (!data.success || !data.reports.length) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:#64748b;">No hay publicaciones aún.</div>`;
      return;
    }

    const reports = data.reports.slice(0, 6);
    const color   = r => CENTRO_COLORS[r.centro] || '#3276f3';

    grid.innerHTML = reports.map(r => `
      <div class="novedad-card">
        <a href="${r.pdf_url}" target="_blank">
          <div class="novedad-image" style="background:linear-gradient(135deg,${color(r)},${color(r)}99);display:flex;align-items:center;justify-content:center;min-height:160px;">
            <span style="color:rgba(255,255,255,.25);font-size:2rem;font-weight:800;letter-spacing:.05em;">${esc(r.centro)}</span>
          </div>
          <div class="novedad-content">
            <div class="novedad-date">${formatMonthYear(r.fecha)}</div>
            <h3 class="novedad-title">${esc(r.titulo)}</h3>
            <p class="novedad-excerpt">${esc(r.tag)}</p>
          </div>
        </a>
      </div>
    `).join('');
  } catch (e) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:#ef4444;">Error al cargar publicaciones.</div>`;
  }
}

// ── Carga los informes destacados ──
async function loadInformesDestacados() {
  const grid = document.querySelector('.informes-grid');
  if (!grid) return;

  try {
    const res  = await fetch(`${API_URL}?action=getFeatured`);
    const data = await res.json();

    if (!data.success || !data.reports.length) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:#64748b;">No hay informes destacados configurados aún.</div>`;
      return;
    }

    grid.innerHTML = data.reports.map(r => `
      <div class="informe-card">
        <div class="informe-meta">
          <span class="informe-date">${formatMonthYear(r.fecha)}</span>
          <span class="publicacion-type-${(r.centro||'').toLowerCase()}">${esc(r.centro)}</span>
        </div>
        <h3 class="informe-title">${esc(r.titulo)}</h3>
        <p class="informe-excerpt">${esc(r.tag)}</p>
        <a href="${r.pdf_url}" target="_blank" class="informe-link">Leer más <i class="fas fa-arrow-right"></i></a>
      </div>
    `).join('');
  } catch (e) {
    // Si falla silenciosamente, no rompemos la página
  }
}

// Spinner keyframes
document.head.insertAdjacentHTML('beforeend', `<style>@keyframes spin{to{transform:rotate(360deg)}}</style>`);
