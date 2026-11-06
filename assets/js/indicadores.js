/* ============================================================
   Monitor económico del CEER
   Pide los datos ya procesados a la API del sitio (/api, acción
   getIndicadores), que los arma en el servidor desde la API del
   INDEC y el BCRA. Acá sólo se formatea y se pinta.
   ============================================================ */
(function () {
  document.addEventListener('DOMContentLoaded', cargar);

  const GRUPOS = [
    { id: 'indec', titulo: 'Precios, actividad e ingresos' },
    { id: 'bcra', titulo: 'Mercado cambiario y monetario' }
  ];

  const num = (v, dec = 1) => Number(v).toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec });

  function formatear(it) {
    const v = Number(it.valor);
    const signo = it.signo && v > 0 ? '+' : '';
    if (it.fmt === 'ars') return '$' + num(v, 1);
    if (it.fmt === 'usd_mm') return 'USD ' + num(v, 0) + ' M';
    return signo + num(v, 1) + '%';
  }

  function clase(it) {
    if (it.color !== 'dir' || !isFinite(it.valor)) return '';
    return it.valor > 0 ? ' is-up' : it.valor < 0 ? ' is-down' : '';
  }

  function tarjeta(it) {
    if (it.error) return '';
    const sub = it.sub
      ? `<span class="indicador-sub">${it.sub.label}${it.sub.plano ? ': ' : ' '}${(!it.sub.plano && it.sub.valor > 0) ? '+' : ''}${num(it.sub.valor)}%</span>`
      : '';
    const nota = it.nota ? `<span class="indicador-nota">${it.nota}</span>` : '';
    return `
      <div class="eje-card indicador-card">
        <h3 class="indicador-titulo">${it.titulo}</h3>
        <div class="indicador-valor${clase(it)}">${formatear(it)}</div>
        ${sub}${nota}
        <span class="indicador-fecha">${it.periodo} · ${it.fuente}</span>
      </div>`;
  }

  async function cargar() {
    const cont = document.getElementById('indicadores-container');
    if (!cont) return;
    try {
      const r = await fetch('/api?action=getIndicadores');
      const d = await r.json();
      if (!d.success) throw new Error(d.error || 'sin datos');
      const html = GRUPOS.map((g) => {
        const cards = d.items.filter((i) => i.grupo === g.id).map(tarjeta).join('');
        return cards ? `<div class="indicadores-grupo"><h3 class="indicadores-grupo-titulo">${g.titulo}</h3><div class="ejes-grid indicadores-grid">${cards}</div></div>` : '';
      }).join('');
      cont.classList.remove('ejes-grid');
      cont.innerHTML = html || '<p class="grid-state grid-state--error">No se pudo conectar con las fuentes oficiales.</p>';
    } catch (e) {
      cont.innerHTML = '<p class="grid-state grid-state--error" style="grid-column:1/-1;">No se pudo conectar con las fuentes oficiales.</p>';
    }
  }
})();
