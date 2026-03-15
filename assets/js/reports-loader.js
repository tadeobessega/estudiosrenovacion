/**
 * Reports Loader - Fetches and displays reports from Google Sheets API
 * 
 * IMPORTANT: Update the API_URL with your Google Apps Script deployment URL
 */

// Replace this with your Google Apps Script deployment URL
const REPORTS_API_URL = 'YOUR_GOOGLE_APPS_SCRIPT_URL_HERE';

// Centro colors for styling
const CENTRO_COLORS = {
    'CEER': '#020995',
    'CEEIR': '#489bdc',
    'CEDHyS': '#2850bd',
    'OPER': '#780000',
    'OPAL': '#006D77',
    'OPSA': '#a64319',
    'CIREN': '#014b3e'
};

// Initialize reports on page load
document.addEventListener('DOMContentLoaded', () => {
    // Load reports into "Informes Destacados" section on homepage
    const informesGrid = document.querySelector('.informes-grid');
    if (informesGrid) {
        loadHomeReports(informesGrid);
    }

    // Load reports into "Novedades" section on homepage
    const novedadesGrid = document.querySelector('.novedades-grid');
    if (novedadesGrid) {
        loadNovedades(novedadesGrid);
    }

    // Load reports for specific centro pages
    const publicacionesGrid = document.querySelector('.publicaciones-grid');
    if (publicacionesGrid) {
        const centro = getCentroFromPage();
        if (centro) {
            loadCentroReports(publicacionesGrid, centro);
        }
    }
});

/**
 * Get the centro ID from the current page URL or data attribute
 */
function getCentroFromPage() {
    // Check for data attribute
    const container = document.querySelector('[data-centro]');
    if (container) {
        return container.dataset.centro;
    }

    // Check URL path
    const path = window.location.pathname.toLowerCase();
    if (path.includes('ceer')) return 'CEER';
    if (path.includes('ceeir')) return 'CEEIR';
    if (path.includes('cedhys')) return 'CEDHyS';
    if (path.includes('oper')) return 'OPER';
    if (path.includes('opal')) return 'OPAL';
    if (path.includes('opsa')) return 'OPSA';
    if (path.includes('ciren')) return 'CIREN';

    return null;
}

/**
 * Load featured reports for homepage "Informes Destacados" section
 */
async function loadHomeReports(container, limit = 6) {
    try {
        // Show loading state
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                <div class="loading-spinner"></div>
                <p style="margin-top: 1rem; color: var(--gray-500);">Cargando informes...</p>
            </div>
        `;

        const response = await fetch(`${REPORTS_API_URL}?action=getReports&centro=all`);
        const data = await response.json();

        if (data.success && data.reports.length > 0) {
            // Take the most recent reports
            const reports = data.reports.slice(0, limit);
            container.innerHTML = reports.map(report => createInformeCard(report)).join('');
        } else {
            container.innerHTML = createEmptyState('informes');
        }
    } catch (error) {
        console.error('Error loading reports:', error);
        container.innerHTML = createErrorState('informes');
    }
}

/**
 * Load reports for "Novedades" section
 */
async function loadNovedades(container, limit = 6) {
    try {
        // Show loading state
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                <div class="loading-spinner"></div>
                <p style="margin-top: 1rem; color: var(--gray-500);">Cargando novedades...</p>
            </div>
        `;

        const response = await fetch(`${REPORTS_API_URL}?action=getReports&centro=all`);
        const data = await response.json();

        if (data.success && data.reports.length > 0) {
            // Take the most recent reports
            const reports = data.reports.slice(0, limit);
            container.innerHTML = reports.map(report => createNovedadCard(report)).join('');
        } else {
            container.innerHTML = createEmptyState('novedades');
        }
    } catch (error) {
        console.error('Error loading novedades:', error);
        container.innerHTML = createErrorState('novedades');
    }
}

/**
 * Load reports for a specific centro page
 */
async function loadCentroReports(container, centro) {
    try {
        // Show loading state
        container.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 3rem;">
                <div class="loading-spinner"></div>
                <p style="margin-top: 1rem; color: var(--gray-500);">Cargando publicaciones...</p>
            </div>
        `;

        const response = await fetch(`${REPORTS_API_URL}?action=getReports&centro=${encodeURIComponent(centro)}`);
        const data = await response.json();

        if (data.success && data.reports.length > 0) {
            container.innerHTML = data.reports.map(report => createPublicacionCard(report, centro)).join('');
        } else {
            container.innerHTML = createEmptyState('publicaciones');
        }
    } catch (error) {
        console.error('Error loading centro reports:', error);
        container.innerHTML = createErrorState('publicaciones');
    }
}

/**
 * Create an "informe" card for the homepage
 */
function createInformeCard(report) {
    const centroColor = CENTRO_COLORS[report.centro] || '#64748b';
    const fecha = formatDateShort(report.fecha);

    return `
        <div class="informe-card">
            <div class="informe-meta">
                <span class="informe-date">${fecha}</span>
                <span class="publicacion-type" style="background-color: ${centroColor}; color: white; padding: 0.25rem 0.5rem; border-radius: 0.25rem; font-size: 0.75rem; font-weight: 600;">${escapeHtml(report.centro)}</span>
            </div>
            <h3 class="informe-title">${escapeHtml(report.titulo)}</h3>
            <p class="informe-excerpt">${escapeHtml(report.tag)}</p>
            <a href="${report.pdf_url}" target="_blank" class="informe-link">Leer más <i class="fas fa-arrow-right"></i></a>
        </div>
    `;
}

/**
 * Create a "novedad" card with image placeholder
 */
function createNovedadCard(report) {
    const centroColor = CENTRO_COLORS[report.centro] || '#64748b';
    const fecha = formatDateShort(report.fecha);
    
    // Create a placeholder image using centro color
    const placeholderStyle = `background: linear-gradient(135deg, ${centroColor} 0%, ${adjustColor(centroColor, 40)} 100%); display: flex; align-items: center; justify-content: center;`;

    return `
        <div class="novedad-card">
            <a href="${report.pdf_url}" target="_blank">
                <div class="novedad-image" style="${placeholderStyle}">
                    <span style="color: white; font-size: 2rem; font-weight: bold; opacity: 0.3;">${report.centro}</span>
                </div>
                <div class="novedad-content">
                    <div class="novedad-date">${fecha}</div>
                    <h3 class="novedad-title">${escapeHtml(report.titulo)}</h3>
                    <p class="novedad-excerpt">${escapeHtml(report.tag)}</p>
                </div>
            </a>
        </div>
    `;
}

/**
 * Create a "publicacion" card for centro pages
 */
function createPublicacionCard(report, centro) {
    const fecha = formatDateShort(report.fecha);
    const centroLower = centro.toLowerCase();

    return `
        <div class="publicacion-card">
            <div class="publicacion-meta">
                <span class="publicacion-date">${fecha}</span>
                <span class="publicacion-type-${centroLower}">${escapeHtml(report.tag)}</span>
            </div>
            <h3 class="publicacion-title">${escapeHtml(report.titulo)}</h3>
            <a href="${report.pdf_url}" target="_blank" class="publicacion-link-${centroLower}">Leer más <i class="fas fa-download"></i></a>
        </div>
    `;
}

/**
 * Create empty state HTML
 */
function createEmptyState(type) {
    return `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--gray-500);">
            <i class="fas fa-folder-open" style="font-size: 3rem; opacity: 0.5; margin-bottom: 1rem;"></i>
            <p>No hay ${type} disponibles en este momento.</p>
        </div>
    `;
}

/**
 * Create error state HTML
 */
function createErrorState(type) {
    return `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--gray-500);">
            <i class="fas fa-exclamation-circle" style="font-size: 3rem; opacity: 0.5; margin-bottom: 1rem; color: #ef4444;"></i>
            <p>Error al cargar ${type}. Por favor, intenta de nuevo más tarde.</p>
        </div>
    `;
}

/**
 * Format date to Spanish short format (e.g., "Enero 2024")
 */
function formatDateShort(dateString) {
    if (!dateString) return '';
    
    const date = new Date(dateString);
    const months = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    
    return `${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Adjust color brightness
 */
function adjustColor(color, percent) {
    const num = parseInt(color.replace('#', ''), 16);
    const amt = Math.round(2.55 * percent);
    const R = (num >> 16) + amt;
    const G = (num >> 8 & 0x00FF) + amt;
    const B = (num & 0x0000FF) + amt;
    
    return '#' + (0x1000000 + 
        (R < 255 ? R < 1 ? 0 : R : 255) * 0x10000 + 
        (G < 255 ? G < 1 ? 0 : G : 255) * 0x100 + 
        (B < 255 ? B < 1 ? 0 : B : 255)
    ).toString(16).slice(1);
}

// Add CSS for loading spinner
const spinnerStyle = document.createElement('style');
spinnerStyle.textContent = `
    .loading-spinner {
        display: inline-block;
        width: 40px;
        height: 40px;
        border: 3px solid rgba(50, 118, 243, 0.2);
        border-radius: 50%;
        border-top-color: #3276f3;
        animation: spin 0.8s linear infinite;
    }
    
    @keyframes spin {
        to { transform: rotate(360deg); }
    }
`;
document.head.appendChild(spinnerStyle);
