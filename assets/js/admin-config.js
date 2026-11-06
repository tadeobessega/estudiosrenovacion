/* ============================================================
   admin-config.js: configuración y llamadas del panel
   Habla con la API del Worker (/api, base D1). Las escrituras
   viajan con el token de sesión que devuelve el login.
   ============================================================ */

const API_URL = (typeof window !== 'undefined' && window.CER_API) ? window.CER_API : '/api';

const CENTROS = [
  { id: 'CEER',    name: 'Centro de Estudios Económicos Renovación',            color: '#3a3aff' },
  { id: 'CEEIR',   name: 'Centro de Estudios Estratégicos Internacionales',     color: '#4aa8ec' },
  { id: 'CEDHyS',  name: 'Centro de Estudios en Derechos Humanos y Seguridad',  color: '#3f74e6' },
  { id: 'OPER',    name: 'Observatorio de Políticas Educativas',                color: '#e0564b' },
  { id: 'OPAL',    name: 'Observatorio para el Análisis Electoral',             color: '#16b7c2' },
  { id: 'OPSA',    name: 'Observatorio de Política Social Aplicada',            color: '#e07a3c' },
  { id: 'CIREN',   name: 'Centro de Estudios Científicos Renovación',           color: '#14bd92' }
];

let TAGS = ['Informe', 'Informe Especial', 'Análisis', 'Investigación', 'Documento de Trabajo', 'Policy Brief', 'Nota Técnica', 'Revista'];

function getCentroColor(id) { const c = CENTROS.find(c => c.id === id); return c ? c.color : '#64748b'; }
function getCentroName(id)  { const c = CENTROS.find(c => c.id === id); return c ? c.name  : id; }

function formatDate(s) {
  if (!s) return '';
  return new Date(s).toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });
}
function formatDateShort(s) {
  if (!s) return '';
  return new Date(s).toLocaleDateString('es-AR', { year: 'numeric', month: 'short' });
}

function checkAuth() {
  const user = JSON.parse(localStorage.getItem('adminUser') || 'null');
  if (!user || !user.token) { localStorage.removeItem('adminUser'); window.location.href = 'login.html'; return null; }
  return user;
}
function logout() {
  apiCall('logout').catch(() => {});
  localStorage.removeItem('adminUser');
  window.location.href = 'login.html';
}

function authHeaders() {
  const u = JSON.parse(localStorage.getItem('adminUser') || 'null');
  return u && u.token ? { Authorization: 'Bearer ' + u.token } : {};
}

async function handleAuthError(res, data) {
  // Sesión vencida: volvemos al login (salvo que ya estemos ahí).
  if (res.status === 401 && !/login\.html$/.test(location.pathname)) {
    localStorage.removeItem('adminUser');
    location.href = 'login.html';
  }
  return data;
}

async function apiCall(action, params = {}) {
  let res;
  try {
    res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ action, ...params })
    });
  } catch (e) {
    return { success: false, error: 'No se pudo conectar con el servidor.' };
  }
  let data;
  try { data = await res.json(); }
  catch (e) { return { success: false, error: 'Respuesta no válida del servidor.' }; }
  return handleAuthError(res, data);
}

async function uploadPDF(file) {
  const fd = new FormData();
  fd.append('action', 'uploadPDF');
  fd.append('file', file, file.name);
  try {
    const res = await fetch(API_URL, { method: 'POST', headers: authHeaders(), body: fd });
    const data = await res.json();
    return handleAuthError(res, data);
  } catch (e) {
    return { success: false, error: 'No se pudo subir el archivo.' };
  }
}

async function loadTagsFromConfig() {
  try {
    const res = await apiCall('getConfig', { key: 'tags' });
    if (res.success && res.value) TAGS = res.value.split(',').map(t => t.trim()).filter(Boolean);
  } catch (e) {}
  return TAGS;
}
async function loadCentrosFromConfig() {
  try {
    const res = await apiCall('getConfig', { key: 'centros' });
    if (res.success && res.value) return res.value.split(',').map(c => c.trim()).filter(Boolean);
  } catch (e) {}
  return CENTROS.map(c => c.id);
}

function showNotification(message, type = 'success') {
  document.querySelectorAll('.admin-notification').forEach(n => n.remove());
  const n = document.createElement('div');
  n.className = 'admin-notification';
  n.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i><span>${message}</span>`;
  n.style.cssText = `
    position:fixed;top:80px;right:1.5rem;padding:.875rem 1.25rem;
    border-radius:.5rem;display:flex;align-items:center;gap:.625rem;
    z-index:4000;animation:slideIn .25s ease;max-width:min(90vw,420px);
    background:${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#4b4bff'};
    color:#fff;font-weight:500;font-size:.9rem;
    box-shadow:0 8px 24px rgba(0,0,0,.35);font-family:Inter,sans-serif;`;
  document.body.appendChild(n);
  setTimeout(() => {
    n.style.transition = 'opacity .3s,transform .3s';
    n.style.opacity = '0'; n.style.transform = 'translateX(110%)';
    setTimeout(() => n.remove(), 320);
  }, 4000);
}
