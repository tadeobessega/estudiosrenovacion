/**
 * Admin Configuration
 * 
 * IMPORTANT: Update the API_URL with your Google Apps Script deployment URL
 * 
 * To get your API URL:
 * 1. Open your Google Apps Script project
 * 2. Click Deploy > New deployment
 * 3. Select "Web app"
 * 4. Set "Execute as" to "Me"
 * 5. Set "Who has access" to "Anyone"
 * 6. Click Deploy
 * 7. Copy the URL and paste it below
 */

// Replace this with your Google Apps Script deployment URL
const API_URL = 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE';

// Research centers configuration
const CENTROS = [
    { id: 'CEER', name: 'Centro de Estudios Económicos', color: '#020995' },
    { id: 'CEEIR', name: 'Centro de Estudios Estratégicos Internacionales', color: '#489bdc' },
    { id: 'CEDHyS', name: 'Centro de Estudios en Derechos Humanos y Seguridad', color: '#2850bd' },
    { id: 'OPER', name: 'Observatorio de Políticas Educativas', color: '#780000' },
    { id: 'OPAL', name: 'Observatorio para el Análisis Electoral', color: '#006D77' },
    { id: 'OPSA', name: 'Observatorio de Política Social Aplicada', color: '#a64319' },
    { id: 'CIREN', name: 'Centro de Estudios Científicos', color: '#014b3e' }
];

// Report tags
const TAGS = [
    'Informe',
    'Informe Especial',
    'Análisis',
    'Investigación',
    'Documento de Trabajo',
    'Policy Brief',
    'Nota Técnica'
];

// Utility functions
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
    return date.toLocaleDateString('es-AR', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

function formatDateShort(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('es-AR', {
        year: 'numeric',
        month: 'short'
    });
}

// Check authentication
function checkAuth() {
    const user = JSON.parse(localStorage.getItem('adminUser'));
    if (!user) {
        window.location.href = 'login.html';
        return null;
    }
    return user;
}

// Logout function
function logout() {
    localStorage.removeItem('adminUser');
    window.location.href = 'login.html';
}

// API helper functions
async function apiCall(action, params = {}) {
    const queryParams = new URLSearchParams({ action, ...params });
    const response = await fetch(`${API_URL}?${queryParams.toString()}`);
    return response.json();
}

async function apiPostJson(action, data) {
    const response = await fetch(`${API_URL}?action=${action}`, {
        method: 'POST',
        body: JSON.stringify(data)
    });
    return response.json();
}

// File upload helper
async function uploadPDF(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = async () => {
            try {
                // Get base64 data (remove the data:application/pdf;base64, prefix)
                const base64Data = reader.result.split(',')[1];
                
                const response = await fetch(`${API_URL}?action=uploadPDF`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        fileName: file.name,
                        fileData: base64Data
                    })
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

// Show notification
function showNotification(message, type = 'success') {
    // Remove existing notifications
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(n => n.remove());
    
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.innerHTML = `
        <i class="fas fa-${type === 'success' ? 'check-circle' : type === 'error' ? 'exclamation-circle' : 'info-circle'}"></i>
        <span>${message}</span>
    `;
    notification.style.cssText = `
        position: fixed;
        top: 100px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        z-index: 3000;
        animation: slideIn 0.3s ease;
        background: ${type === 'success' ? '#10b981' : type === 'error' ? '#ef4444' : '#3276f3'};
        color: white;
        font-weight: 500;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
    `;
    
    document.body.appendChild(notification);
    
    // Auto remove after 4 seconds
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => notification.remove(), 300);
    }, 4000);
}

// Add animation styles
const styleSheet = document.createElement('style');
styleSheet.textContent = `
    @keyframes slideIn {
        from {
            opacity: 0;
            transform: translateX(100%);
        }
        to {
            opacity: 1;
            transform: translateX(0);
        }
    }
`;
document.head.appendChild(styleSheet);
