const API_URL = 'https://script.google.com/macros/s/AKfycby6Lb2jHPHYs8jsuNxZpM9b6OBIcH5y6isw8WRBidPSIlpdTOarYzKv1dnueEpll12R/exec';

const CENTROS = [
    { id: 'CEER', name: 'Centro de Estudios Económicos', color: '#020995' },
    { id: 'CEEIR', name: 'Centro de Estudios Estratégicos Internacionales', color: '#489bdc' },
    { id: 'CEDHyS', name: 'Centro de Estudios en Derechos Humanos y Seguridad', color: '#2850bd' },
    { id: 'OPER', name: 'Observatorio de Políticas Educativas', color: '#780000' },
    { id: 'OPAL', name: 'Observatorio para el Análisis Electoral', color: '#006D77' },
    { id: 'OPSA', name: 'Observatorio de Política Social Aplicada', color: '#a64319' },
    { id: 'CIREN', name: 'Centro de Estudios Científicos', color: '#014b3e' }
];

const TAGS = [
    'Informe',
    'Informe Especial',
    'Análisis',
    'Investigación',
    'Documento de Trabajo',
    'Policy Brief',
    'Nota Técnica'
];

function getCentroColor(centroId) {
    const centro = CENTROS.find(c => c.id === centroId);
    return centro ? centro.color : '#64748b';
}

function getCentroName(centroId) {
    const centro = CENTROS.find(c => c.id === centroId);
    return centro ? centro.name : centroId;
}

function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatDateShort(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-AR', { year: 'numeric', month: 'short' });
}

function checkAuth() {
    const user = JSON.parse(localStorage.getItem('adminUser'));
    if (!user) {
        window.location.href = 'login.html';
        return null;
    }
    return user;
}

function logout() {
    localStorage.removeItem('adminUser');
    window.location.href = 'login.html';
}

// GET con query params — funciona siempre con Apps Script
async function apiCall(action, params = {}) {
    const queryParams = new URLSearchParams({ action, ...params });
    const response = await fetch(`${API_URL}?${queryParams.toString()}`);
    return response.json();
}

// POST sin headers custom — evita el preflight CORS que rompe Apps Script
async function apiPostJson(action, data) {
    const params = new URLSearchParams({ action, data: JSON.stringify(data) });
    const response = await fetch(API_URL, {
        method: 'POST',
        body: params   // application/x-www-form-urlencoded por defecto → "simple request" → sin preflight
    });
    return response.json();
}

// Upload PDF — misma estrategia: FormData sin Content-Type manual
async function uploadPDF(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                const base64Data = reader.result.split(',')[1];

                // FIX CLAVE: usar URLSearchParams en lugar de JSON body con Content-Type header.
                // Content-Type: application/json dispara un preflight OPTIONS que Apps Script
                // no puede responder correctamente, causando "Failed to fetch".
                // URLSearchParams se manda como application/x-www-form-urlencoded,
                // que es un "simple request" y no necesita preflight.
                const params = new URLSearchParams({
                    action: 'uploadPDF',
                    fileName: file.name,
                    fileData: base64Data
                });

                const response = await fetch(API_URL, {
                    method: 'POST',
                    body: params
                });

                const data = await response.json();
                resolve(data);
            } catch (error) {
                reject(error);
            }
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

function showNotification(message, type = 'success') {
    document.querySelectorAll('.notification').forEach(n => n.remove());

    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    notification.style.cssText = `
        position: fixed; top: 100px; right: 20px;
        padding: 1rem 1.5rem; border-radius: 0.5rem;
        display: flex; align-items: center; gap: 0.75rem;
        z-index: 3000; animation: slideIn 0.3s ease;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3276f3'};
        color: white; font-weight: 500; box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    `;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s, transform 0.3s';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes slideIn {
        from { opacity: 0; transform: translateX(100%); }
        to   { opacity: 1; transform: translateX(0); }
    }
`;
document.head.appendChild(styleSheet);
