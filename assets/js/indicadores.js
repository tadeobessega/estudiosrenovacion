/**
 * MONITOR ECONÓMICO — CEER
 * Conexión directa con APIs oficiales (BCRA + datos.gob.ar)
 */
(function () {
  document.addEventListener('DOMContentLoaded', cargarIndicadores);

  async function cargarIndicadores() {
    const container = document.getElementById('indicadores-container');
    if (!container) return;

    const resultados = await Promise.allSettled([
      fetchBCRA(5, 'Tipo de Cambio Mayorista', '$'),
      fetchBCRA(27, 'Inflación Mensual (IPC)', '', '%', true),
      fetchBCRA(29, 'Inflación Esperada (REM 12m)', '', '%'),
      fetchBCRA(1, 'Reservas Internacionales', 'USD ', ' MM'),
      fetchBCRA(45, 'Tasa TAMAR', '', '%'),
      fetchBCRA(25, 'M2 Privado (Var. Interanual)', '', '%', true),
      fetchDatosArgentinaVar('143.3_NO_PR_2004_A_31', 'Actividad (EMAE Desest.) · Var. Mensual')
    ]);

    const cards = resultados
      .filter(r => r.status === 'fulfilled' && r.value)
      .map(r => renderCard(r.value));

    container.innerHTML = cards.length
      ? cards.join('')
      : '<p class="grid-state grid-state--error" style="grid-column:1/-1;">No se pudo conectar con las fuentes oficiales.</p>';
  }

  function renderCard(data) {
    let color = 'var(--gray-900)';
    if (data.valor.includes('+')) color = '#34d399';
    if (data.valor.includes('-')) color = '#f87171';
    return `
      <div class="eje-card fade-in-up">
        <h3 class="eje-title" style="color:var(--cer-cyan);font-size:.95rem;margin-bottom:.5rem;">${data.titulo}</h3>
        <div style="font-size:2.1rem;font-weight:800;color:${color};margin-bottom:.4rem;">${data.valor}</div>
        <span style="font-size:.8rem;color:var(--gray-500);"><i class="fas fa-clock"></i> Actualizado: ${data.fecha}</span>
      </div>`;
  }

  async function fetchBCRA(id, titulo, prefijo = '', sufijo = '', mostrarSigno = false) {
    const res = await fetch(`https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/${id}?limit=1`);
    if (!res.ok) throw new Error(`BCRA ${id}`);
    const data = await res.json();
    const ultimo = data.results[0].detalle[0];
    const strValor = ultimo.valor.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const signo = (mostrarSigno && ultimo.valor > 0) ? '+' : '';
    return { titulo, valor: signo + prefijo + strValor + sufijo, fecha: formatearFecha(ultimo.fecha) };
  }

  async function fetchDatosArgentinaVar(idSerie, titulo) {
    const res = await fetch(`https://apis.datos.gob.ar/series/api/series/?ids=${idSerie}&limit=5000`);
    if (!res.ok) throw new Error(`INDEC ${idSerie}`);
    const data = await res.json();
    const len = data.data.length;
    const variacion = ((data.data[len - 1][1] / data.data[len - 2][1]) - 1) * 100;
    const signo = variacion > 0 ? '+' : '';
    return {
      titulo,
      valor: signo + variacion.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + '%',
      fecha: formatearFecha(data.data[len - 1][0])
    };
  }

  function formatearFecha(fechaStr) {
    if (!fechaStr) return '';
    const p = fechaStr.split('-');
    return p.length >= 3 ? `${p[2]}/${p[1]}/${p[0]}` : fechaStr;
  }
})();
