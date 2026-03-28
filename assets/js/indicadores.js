/**
 * MONITOR ECONÓMICO CEER
 * Versión Final - Conexión Directa con APIs Oficiales
 */
(function() {
    // 1. Punto de entrada
    document.addEventListener('DOMContentLoaded', () => {
        console.log("Monitor Económico: Iniciando carga de datos...");
        cargarIndicadores();
    });

    // 2. Función principal
    async function cargarIndicadores() {
        const container = document.getElementById('indicadores-container');
        if (!container) return;

        try {
            // Consultamos los indicadores (Usamos el M2 Interanual para mayor precisión)
            const resultadosP = await Promise.allSettled([
                fetchBCRA(5, 'Tipo de Cambio Mayorista', '$'),
                fetchBCRA(27, 'Inflación Mensual (IPC)', '', '%', true),
                fetchBCRA(29, 'Inflación Esperada (REM 12m)', '', '%'),
                fetchBCRA(1, 'Reservas Internacionales', 'USD ', ' MM'),
                fetchBCRA(45, 'Tasa TAMAR', '', '%'),
                fetchBCRA(25, 'M2 Privado (Var. Interanual)', '', '%', true),
                fetchDatosArgentinaVar('143.3_NO_PR_2004_A_31', 'Actividad (EMAE Desest.) - Var. Mensual')
            ]);

            container.innerHTML = ''; 
            let hayDatos = false;

            resultadosP.forEach(res => {
                if (res.status === 'fulfilled' && res.value) {
                    hayDatos = true;
                    renderCard(container, res.value);
                }
            });

            if (!hayDatos) {
                container.innerHTML = '<p style="text-align: center; color: #ef4444; grid-column: 1/-1;">Error de conexión con fuentes oficiales.</p>';
            }
        } catch (error) {
            console.error("Error en el monitor:", error);
        }
    }

    // 3. Generación de tarjetas visuales
    function renderCard(container, data) {
        let colorClass = "var(--gray-900)";
        if (data.valor.includes('+')) colorClass = "#10b981";
        if (data.valor.includes('-')) colorClass = "#ef4444";

        container.innerHTML += `
            <div class="eje-card fade-in-up" style="padding: 2rem 1rem;">
                <h3 class="eje-title" style="color: var(--ceer); margin-bottom: 0.5rem; font-size: 0.95rem;">${data.titulo}</h3>
                <div style="font-size: 2.2rem; font-weight: 700; color: ${colorClass}; margin-bottom: 0.5rem;">${data.valor}</div>
                <span style="font-size: 0.85rem; color: var(--gray-500);"><i class="fas fa-clock"></i> Actualizado: ${data.fecha}</span>
            </div>
        `;
    }

    // 4. Lógica para consultar el BCRA
    async function fetchBCRA(id, titulo, prefijo = '', sufijo = '', mostrarSigno = false) {
        const res = await fetch(`https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/${id}?limit=1`);
        if (!res.ok) throw new Error(`Error BCRA ${id}`);
        const data = await res.json();
        const ultimoDato = data.results[0].detalle[0];
        const valorF = ultimoDato.valor;
        const strValor = valorF.toLocaleString('es-AR', {minimumFractionDigits: 1, maximumFractionDigits: 1});
        let signo = (mostrarSigno && valorF > 0) ? '+' : '';
        return { titulo, valor: signo + prefijo + strValor + sufijo, fecha: formatearFecha(ultimoDato.fecha) };
    }

    // 5. Lógica para consultar INDEC (EMAE)
    async function fetchDatosArgentinaVar(idSerie, titulo) {
        const res = await fetch(`https://apis.datos.gob.ar/series/api/series/?ids=${idSerie}&limit=5000`);
        if (!res.ok) throw new Error(`Error INDEC ${idSerie}`);
        const data = await res.json();
        const len = data.data.length;
        const variacion = ((data.data[len - 1][1] / data.data[len - 2][1]) - 1) * 100;
        const signo = variacion > 0 ? '+' : '';
        return { 
            titulo, 
            valor: signo + variacion.toLocaleString('es-AR', {minimumFractionDigits: 1, maximumFractionDigits: 1}) + '%', 
            fecha: formatearFecha(data.data[len - 1][0]) 
        };
    }

    // 6. Utilidad de fechas
    function formatearFecha(fechaStr) {
        if(!fechaStr) return '';
        const partes = fechaStr.split('-');
        return partes.length >= 3 ? `${partes[2]}/${partes[1]}/${partes[0]}` : fechaStr;
    }
})();