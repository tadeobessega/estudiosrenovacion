const API_URL = 'https://script.google.com/macros/s/AKfycbzaKZ6XCEVxS5euoKX9xxqzScKSiJmNvd4XmP1rcpdhg94g6gCa_JxboUTAaj7JHKMK/exec';

const CENTROS = [
    { id: 'CEER', name: 'Centro de Estudios Económicos', color: '#020995' },
    { id: 'CEEIR', name: 'Centro de Estudios Estratégicos Internacionales', color: '#489bdc' },
    { id: 'CEDHyS', name: 'Centro de Estudios en Derechos Humanos y Seguridad', color: '#2850bd' },
    { id: 'OPER', name: 'Observatorio de Políticas Educativas', color: '#780000' },
    { id: 'OPAL', name: 'Observatorio para el Análisis Electoral', color: '#006D77' },
    { id: 'OPSA', name: 'Observatorio de Política Social Aplicada', color: '#a64319' },
    { id: 'CIREN', name: 'Centro de Estudios Científicos', color: '#014b3e' }
];

function getCentroColor(id) { const c = CENTROS.find(c => c.id === id); return c ? c.color : '#64748b'; }
function getCentroName(id) { const c = CENTROS.find(c => c.id === id); return c ? c.name : id; }

function formatDate(s) {
    if (!s) return '';
    return new Date(s).toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });
}
function formatDateShort(s) {
    if (!s) return '';
    return new Date(s).toLocaleDateString('es-AR', { year: 'numeric', month: 'short' });
}

function checkAuth() {
    const user = JSON.parse(localStorage.getItem('adminUser'));
    if (!user) { window.location.href = 'login.html'; return null; }
    return user;
}

function logout() {
    localStorage.removeItem('adminUser');
    window.location.href = 'login.html';
}

// Todas las llamadas normales: GET con query params (nunca dispara preflight)
async function apiCall(action, params = {}) {
    const qs = new URLSearchParams({ action, ...params });
    const res = await fetch(`${API_URL}?${qs}`);
    return res.json();
}

// Upload PDF: acción en la URL, datos en body como texto plano (sin Content-Type header)
// — "text/plain" es un "simple request" → sin preflight CORS
// — los datos van en e.postData.contents en Apps Script (evita el límite de tamaño de e.parameter)
async function uploadPDF(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const base64Data = reader.result.split(',')[1];
                const body = JSON.stringify({ fileName: file.name, fileData: base64Data });
                const res = await fetch(`${API_URL}?action=uploadPDF`, { method: 'POST', body });
                const text = await res.text();
                console.log('Respuesta del servidor:', text); // ← mirá esto en Console
                try {
                    resolve(JSON.parse(text));
                } catch {
                    resolve({ success: false, error: 'Respuesta inválida: ' + text.substring(0, 200) });
                }
            } catch (err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}
function showNotification(message, type = 'success') {
    document.querySelectorAll('.admin-notification').forEach(n => n.remove());
    const n = document.createElement('div');
    n.className = 'admin-notification';
    n.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i><span>${message}</span>`;
    n.style.cssText = `
    position:fixed;top:80px;right:1.5rem;padding:.875rem 1.25rem;
    border-radius:.5rem;display:flex;align-items:center;gap:.625rem;
    z-index:4000;animation:slideIn .25s ease;
    background:${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3276f3'};
    color:#fff;font-weight:500;font-size:.9rem;
    box-shadow:0 8px 24px rgba(0,0,0,.15);
    font-family:Inter,sans-serif;
  `;
    document.body.appendChild(n);
    setTimeout(() => {
        n.style.transition = 'opacity .3s,transform .3s';
        n.style.opacity = '0'; n.style.transform = 'translateX(110%)';
        setTimeout(() => n.remove(), 320);
    }, 3500);
}
