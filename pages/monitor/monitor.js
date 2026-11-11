/* ============================================================
   Monitor económico del CEER
   - Series del BCRA, Ámbito, NY Fed y BLS: datos_historicos.json
     (lo arma bot_monetario.py).
   - Series del INDEC: /api?action=getSeriesINDEC (Worker del sitio).
   - Últimos valores diarios: /api?action=getIndicadores.
   ============================================================ */
/* Estadísticas de visitas: una vista por carga de página, sin cookies. La marca del día en localStorage separa visitantes de vistas.
   En la página de un informe, la ruta incluye su id. */
(function () {
  try {
    var u = new URL(location.href), ruta = u.pathname.replace(/index(\.html)?$/, '').replace(/\.html$/, '');
    if (/\/informe$/.test(ruta) && u.searchParams.get('id')) ruta += '?id=' + encodeURIComponent(u.searchParams.get('id'));
    if (/^\/(admin|api)/.test(ruta) || location.hostname === 'localhost') return;
    var dia = new Date().toISOString().slice(0, 10), k = 'cer-visita:' + ruta, nuevo = 1;
    try { if (localStorage.getItem(k) === dia) nuevo = 0; else localStorage.setItem(k, dia); } catch (e) {}
    var body = JSON.stringify({ action: 'visita', ruta: ruta, nuevo: nuevo });
    if (navigator.sendBeacon) navigator.sendBeacon('/api', new Blob([body], { type: 'text/plain' }));
    else fetch('/api', { method: 'POST', body: body, keepalive: true });
  } catch (e) {}
})();

(function () {
  'use strict';

  /* ---------------- Paleta y formato ---------------- */
  // Paletas por tema (sistema de marca CEER): sobre claro y sobre azul.
  const PALETAS = {
    light: { azul: '#2840a5', ambar: '#d6810c', cian: '#138282', violeta: '#473a9a', gris: '#9c9ea5', tinta: '#171a24', grilla: '#dfe1e5', sec: '#5d6069', rojo: '#af3e30', tooltip: '#171a24', puntos: 'rgba(40,64,165,.55)' },
    dark:  { azul: '#c0d0f9', ambar: '#f7ac4d', cian: '#57d4d4', violeta: '#a7a8df', gris: '#9c9ea5', tinta: '#f2f4fb', grilla: 'rgba(192,208,249,.16)', sec: '#c0d0f9', rojo: '#f08a7c', tooltip: '#0b1438', puntos: 'rgba(192,208,249,.6)' }
  };
  const temaActual = () => (document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light');
  let C = PALETAS[temaActual()];
  let SERIE = [C.azul, C.ambar, C.cian, C.violeta, C.gris];
  const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const MES3 = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const MONO = '"Cascadia Code", ui-monospace, Menlo, monospace';
  const SANS = '"Inter", sans-serif';

  const nf = (d) => new Intl.NumberFormat('es-AR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const num = (v, d = 1) => (v == null || !isFinite(v) ? 's/d' : nf(d).format(v).replace('-', '−'));
  const pct = (v, d = 1, signo = false) => (v == null || !isFinite(v) ? 's/d' : (signo && v > 0 ? '+' : '') + num(v, d) + '%');
  const compacto = (v) => {
    if (v == null || !isFinite(v)) return '';
    const a = Math.abs(v);
    if (a >= 1e12) return num(v / 1e12, 1) + ' B';
    if (a >= 1e9) return num(v / 1e9, 1) + ' mil M';
    if (a >= 1e6) return num(v / 1e6, 1) + ' M';
    if (a >= 1e4) return num(v / 1e3, 0) + ' mil';
    return num(v, a < 10 ? 1 : 0);
  };
  const mesLargo = (ym) => { if (typeof ym !== 'string') return ''; const [y, m] = ym.split('-'); return `${MESES[+m - 1]} ${y}`; };
  const mesCorto = (ym) => { if (typeof ym !== 'string') return ''; const [y, m] = ym.split('-'); return `${MES3[+m - 1]} ${y.slice(2)}`; };
  const trimestre = (ym) => { if (typeof ym !== 'string') return ''; const [y, m] = ym.split('-'); return `${Math.ceil(+m / 3)}T ${y}`; };
  // La serie semestral de la EPH viene fechada al mes siguiente al cierre del semestre (2025-01 = 2.º semestre 2024).
  const semestre = (ym) => { if (typeof ym !== 'string') return ''; let [y, m] = ym.split('-').map(Number); m -= 6; if (m < 1) { m += 12; y -= 1; } return `${m <= 6 ? 1 : 2}S ${y}`; };
  const flecha = (v) => (v > 0 ? '▲' : v < 0 ? '▼' : '');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  /* ---------------- Series ---------------- */
  const S = { m: {}, d: {}, fm: [], fd: [], indec: {}, ind: null };

  function alinear(serie) {
    // Lleva una serie del INDEC {f, v} a la grilla mensual del JSON.
    const out = new Array(S.fm.length).fill(null);
    if (!serie) return out;
    const pos = new Map(S.fm.map((f, i) => [f, i]));
    serie.f.forEach((f, i) => { const j = pos.get(f); if (j != null) out[j] = serie.v[i]; });
    return out;
  }
  const varN = (arr, n) => arr.map((v, i) => (i >= n && v != null && arr[i - n] != null && arr[i - n] !== 0 ? (v / arr[i - n] - 1) * 100 : null));
  const varM = (a) => varN(a, 1);
  const varIA = (a) => varN(a, 12);
  const ultimo = (arr, fechas) => { for (let i = arr.length - 1; i >= 0; i--) if (arr[i] != null && isFinite(arr[i])) return { v: arr[i], f: fechas[i], i }; return null; };
  const rebase = (arr, desde, hasta) => {
    const i0 = S.fm.indexOf(desde), i1 = S.fm.indexOf(hasta);
    const tramo = arr.slice(i0, i1 + 1).filter((v) => v != null);
    if (!tramo.length) return arr.map(() => null);
    const base = tramo.reduce((a, b) => a + b, 0) / tramo.length;
    return arr.map((v) => (v == null ? null : (v / base) * 100));
  };
  const suma12 = (arr) => arr.map((_, i) => { if (i < 11) return null; let s = 0; for (let k = i - 11; k <= i; k++) { if (arr[k] == null) return null; s += arr[k]; } return s; });

  const m = (k) => S.m[k] || [];
  const nom = (k) => S.m[k + '_corriente'] || S.m[k] || [];
  const ix = (k) => S.indec[k] || new Array(S.fm.length).fill(null);

  /* ---------------- Gráficos (Chart.js) ---------------- */
  const graficos = [];
  const tieneDatos = (a) => Array.isArray(a) && a.some((v) => v != null && isFinite(v));

  // Etiquetas al final de cada línea, en el color de la serie, separadas >= 14 px.
  const etiquetasFinales = {
    id: 'etiquetasFinales',
    afterDatasetsDraw(chart) {
      const op = chart.options.plugins.etiquetasFinales;
      if (!op || !op.activo) return;
      const { ctx, chartArea, scales } = chart;
      const xmax = scales.x.max;
      const items = [];
      chart.data.datasets.forEach((ds, di) => {
        const meta = chart.getDatasetMeta(di);
        if (meta.hidden || ds.sinEtiqueta) return;
        let idx = -1;
        for (let i = Math.min(ds.data.length - 1, xmax); i >= 0; i--) if (ds.data[i] != null) { idx = i; break; }
        const pt = meta.data[idx];
        if (!pt) return;
        items.push({ y: pt.y, txt: ds.label, color: ds.colorEtiqueta || ds.borderColor || ds.backgroundColor });
      });
      items.sort((a, b) => a.y - b.y);
      for (let i = 1; i < items.length; i++) if (items[i].y - items[i - 1].y < 14) items[i].y = items[i - 1].y + 14;
      ctx.save();
      ctx.font = `600 12px ${SANS}`;
      ctx.textBaseline = 'middle';
      const x0 = scales.y1 ? scales.y1.right + 6 : chartArea.right + 8;
      items.forEach((it) => { ctx.fillStyle = it.color; ctx.fillText(it.txt, x0, Math.min(Math.max(it.y, chartArea.top), chartArea.bottom)); });
      ctx.restore();
    }
  };
  Chart.register(etiquetasFinales);
  Chart.defaults.font.family = SANS;
  Chart.defaults.color = C.sec;
  function aplicarPaleta() { C = PALETAS[temaActual()]; SERIE = [C.azul, C.ambar, C.cian, C.violeta, C.gris]; Chart.defaults.color = C.sec; }
  Chart.defaults.animation = false;

  /* ---------------- Animaciones ----------------
     Misma lógica que el tablero de Presupuesto CABA (tadeobessega/presupuesto-caba):
     - la tarjeta aparece subiendo cuando entra en pantalla (IntersectionObserver, umbral 18%);
     - el gráfico se dibuja recién ahí, 900 ms con easeOutQuart, y después se apagan las animaciones;
     - los cambios de datos se animan 700 ms;
     - las cifras cuentan desde cero (1,1 s, curva cúbica);
     - un reproductor recorre la serie en el tiempo (botón, fecha grande y deslizador);
     - todo respeta "reducir movimiento" del sistema. */
  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const IO = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    IO.unobserve(e.target); e.target.classList.add('in');
    if (e.target._alEntrar) e.target._alEntrar();
  }), { threshold: 0.18 }) : null;
  function alVer(el, fn) {
    el.classList.add('revela'); el._alEntrar = fn;
    if (!IO || RM) { el.classList.add('in'); if (fn) fn(); return; }
    IO.observe(el);
  }
  function contar(el, hasta, fmt, dur = 1100) {
    if (!el) return;
    if (RM || !isFinite(hasta)) { el.textContent = fmt(hasta); return; }
    const t0 = performance.now();
    const paso = (t) => { const k = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(hasta * e); if (k < 1) requestAnimationFrame(paso); };
    requestAnimationFrame(paso);
  }
  function animarEntrada(ch, dur = 900) {
    if (RM || !ch) return;
    ch.options.animation = { duration: dur, easing: 'easeOutQuart' };
    ch.reset(); ch.update();
    setTimeout(() => { if (ch.canvas) ch.options.animation = false; }, dur + 100);
  }
  function animarCambio(ch, dur = 700) {
    if (RM) { ch.update('none'); return; }
    ch.options.animation = { duration: dur, easing: 'easeOutQuart' };
    ch.update();
    setTimeout(() => { if (ch.canvas) ch.options.animation = false; }, dur + 100);
  }

  /* Reproductor: recorre el gráfico mes a mes. paso(i) dibuja hasta el índice i; fin() deja todo completo. */
  function reproductor(tarjeta, { desde, hasta, rotulo, paso, fin, alEmpezar }) {
    const bar = document.createElement('div');
    bar.className = 'reproductor';
    bar.innerHTML = `<button type="button">▶ Reproducir</button><span class="fecha"></span><input type="range" min="${desde}" max="${hasta}" step="1" value="${hasta}" aria-label="Fecha">`;
    tarjeta.querySelector('.lienzo').before(bar);
    const btn = bar.querySelector('button'), sl = bar.querySelector('input'), lab = bar.querySelector('.fecha');
    let tm = null, i = hasta, preparado = false;
    const salto = Math.max(1, Math.ceil((hasta - desde) / 160));
    lab.textContent = rotulo(hasta);
    const preparar = () => { if (!preparado) { preparado = true; if (alEmpezar) alEmpezar(); } };
    const ir = (k) => { i = k; sl.value = k; lab.textContent = rotulo(k); preparar(); if (k >= hasta) { fin(); preparado = false; } else paso(k); };
    const parar = () => { clearInterval(tm); tm = null; btn.textContent = '▶ Reproducir'; };
    btn.addEventListener('click', () => {
      if (tm) { parar(); return; }
      btn.textContent = '❚❚ Pausa';
      if (i >= hasta) i = desde - salto;
      tm = setInterval(() => { const k = Math.min(hasta, i + salto); ir(k); if (k >= hasta) parar(); }, RM ? 0 : 50);
    });
    sl.addEventListener('input', () => { parar(); ir(+sl.value); });
    return { parar };
  }

  function anchoEtiquetas(labels) {
    const c = document.createElement('canvas').getContext('2d');
    c.font = `600 12px ${SANS}`;
    return Math.max(0, ...labels.map((l) => c.measureText(l).width)) + 14;
  }

  function tarjetaGrafico(cfg) {
    const el = document.createElement('article');
    el.className = 'grafico' + (cfg.ancho ? ' ancho' : '') + (cfg.alto ? ' alto' : '');
    el.innerHTML = `
      <div class="cab">
        <div><h3>${esc(cfg.titulo)}</h3>${cfg.unidad ? `<p class="unidad">${esc(cfg.unidad)}</p>` : ''}</div>
        <div class="herr"><button type="button" data-png title="Descargar PNG">PNG</button><button type="button" data-csv title="Descargar CSV">CSV</button></div>
      </div>
      <div class="lienzo"><canvas id="${cfg.id}" role="img" aria-label="${esc(cfg.titulo)}"></canvas></div>
      <div class="pie"><span>Fuente: ${esc(cfg.fuente)}.</span><span class="logo"><svg viewBox="0 0 469 110"><use href="#logo-ceer"/></svg></span></div>`;
    el.querySelector('[data-png]').addEventListener('click', () => descargarPNG(el, cfg.id));
    el.querySelector('[data-csv]').addEventListener('click', () => descargarCSV(cfg.id));
    return el;
  }

  /**
   * Gráfico de series de tiempo.
   * series: [{ label, data, color, ancho, tipo:'bar', eje:'y1', guiones, relleno, apilar }]
   * opts: { labels, formatoX, formatoY, desde, apilado, eje2 }
   */
  function serieTiempo(cfg, cont) {
    // Lo que no tiene datos no se muestra: ni la serie, ni la leyenda, ni el gráfico entero.
    cfg = { ...cfg, series: cfg.series.filter((s) => tieneDatos(s.data)) };
    if (!cfg.series.length) return null;
    cont.appendChild(tarjetaGrafico(cfg));
    const labels = cfg.labels || S.fm;
    const finales = cfg.etiquetas !== false;
    const fmtY = cfg.formatoY || ((v) => compacto(v));
    const datasets = cfg.series.map((s, i) => {
      const color = s.color || SERIE[i % SERIE.length];
      const base = { label: s.label, data: s.data, yAxisID: s.eje || 'y', colorEtiqueta: color, sinEtiqueta: !!s.sinEtiqueta };
      if (s.tipo === 'bar') return { ...base, type: 'bar', backgroundColor: (c) => (c.raw != null && c.raw < 0 ? C.rojo : color), borderWidth: 0, barPercentage: 0.9, categoryPercentage: 0.9, order: 2 };
      return {
        ...base, type: 'line', borderColor: color, borderWidth: s.ancho || 2, borderDash: s.guiones ? [5, 4] : [],
        backgroundColor: s.relleno ? color : 'transparent', fill: s.relleno ? (s.apilar ? (i === 0 ? 'origin' : '-1') : 'origin') : false,
        pointRadius: 0, pointHoverRadius: 3, spanGaps: true, tension: 0, order: 1, stack: s.apilar ? 'pila' : undefined
      };
    });
    // Si con el formato pedido dos marcas del eje quedan iguales (rango chico: 34%, 34%, 33%…), se agregan decimales.
    const cbEje = (fmt) => (v, i, ticks) => {
      const t = fmt(v);
      if (!ticks || ticks.length < 2 || new Set(ticks.map((k) => fmt(k.value))).size === ticks.length) return t;
      const paso = Math.abs(ticks[1].value - ticks[0].value), d = paso < 0.1 ? 2 : 1, base = num(v, d);
      return /%/.test(t) ? base + '%' : base;
    };
    const ejeTicks = { font: { family: MONO, size: 11 }, color: C.sec, maxTicksLimit: 6, callback: cbEje(fmtY) };
    const scales = {
      x: { type: 'category', grid: { display: false }, border: { color: C.grilla }, ticks: { font: { family: MONO, size: 11 }, color: C.sec, maxRotation: 0, autoSkip: true, maxTicksLimit: 8, callback: function (v) { const l = this.getLabelForValue(v); return (cfg.formatoX || mesCorto)(l); } } },
      y: { stacked: !!cfg.apilado, grid: { color: C.grilla }, border: { display: false }, ticks: ejeTicks, beginAtZero: !!cfg.desdeCero }
    };
    if (cfg.eje2) scales.y1 = { position: 'right', grid: { display: false }, border: { display: false }, ticks: { ...ejeTicks, callback: cbEje(cfg.formatoY2 || fmtY) } };
    if (cfg.apilado) scales.x.stacked = true;
    const plugins = [];
    if (cfg.valoresBarras) plugins.push({
      id: 'valoresBarras',
      afterDatasetsDraw(ch) {
        const { ctx } = ch;
        ch.data.datasets.forEach((ds, di) => {
          if (ds.type !== 'bar') return;
          const meta = ch.getDatasetMeta(di);
          ctx.save(); ctx.font = `600 11px ${MONO}`; ctx.fillStyle = C.tinta; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
          meta.data.forEach((bar, i) => { const v = ds.data[i]; if (v != null && bar.x >= ch.chartArea.left && bar.x <= ch.chartArea.right) ctx.fillText(num(v, 1), bar.x, bar.y - 4); });
          ctx.restore();
        });
      }
    });
    const chart = new Chart(document.getElementById(cfg.id), {
      plugins,
      data: { labels, datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        layout: { padding: { right: finales ? anchoEtiquetas(cfg.series.filter((s) => !s.sinEtiqueta).map((s) => s.label)) : 8, top: 4 } },
        scales,
        plugins: {
          legend: { display: !finales && cfg.series.length > 1, position: 'bottom', align: 'start', labels: { boxWidth: 10, boxHeight: 10, padding: 14, font: { size: 12, weight: '600' }, color: C.tinta } },
          tooltip: {
            backgroundColor: C.tooltip, cornerRadius: 0, padding: 10, titleFont: { family: MONO, size: 12 }, bodyFont: { family: SANS, size: 12 },
            callbacks: {
              title: (it) => (it.length ? (cfg.formatoTitulo || mesLargo)(it[0].label) : ''),
              label: (it) => ` ${it.dataset.label}: ${(cfg.formatoTooltip || ((v) => num(v, cfg.decimales ?? 1)))(it.raw)}`
            }
          },
          etiquetasFinales: { activo: finales }
        }
      }
    });
    chart.$cfg = { ...cfg, serieTiempo: true };
    graficos.push(chart);
    return chart;
  }

  // Barras horizontales (un corte: último mes), con una barra destacada en ámbar.
  function barrasH(cfg, cont) {
    const filas = cfg.filas.filter((f) => f.v != null && isFinite(f.v)).sort((a, b) => b.v - a.v);
    if (!filas.length) return null;
    cont.appendChild(tarjetaGrafico(cfg));
    const chart = new Chart(document.getElementById(cfg.id), {
      type: 'bar',
      data: {
        labels: filas.map((f) => f.l),
        datasets: [{ label: cfg.serie || cfg.titulo, data: filas.map((f) => f.v), backgroundColor: filas.map((f) => (f.destacar ? C.ambar : (f.v < 0 ? C.rojo : C.azul))), borderWidth: 0, barPercentage: 0.78, categoryPercentage: 0.9 }]
      },
      options: {
        indexAxis: 'y', responsive: true, maintainAspectRatio: false, layout: { padding: { right: 52 } },
        scales: {
          x: { grid: { color: C.grilla }, border: { display: false }, ticks: { font: { family: MONO, size: 11 }, color: C.sec, callback: (v) => pct(v, 0) } },
          y: { grid: { display: false }, border: { color: C.grilla }, ticks: { font: { size: 12 }, color: C.tinta, autoSkip: false } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { backgroundColor: C.tooltip, cornerRadius: 0, callbacks: { label: (it) => ` ${pct(it.raw, 1, true)}` } },
          etiquetasFinales: { activo: false }
        }
      },
      plugins: [{
        id: 'valores',
        afterDatasetsDraw(ch) {
          const { ctx } = ch; const meta = ch.getDatasetMeta(0);
          ctx.save(); ctx.font = `600 11px ${MONO}`; ctx.textBaseline = 'middle';
          meta.data.forEach((bar, i) => {
            const v = ch.data.datasets[0].data[i];
            ctx.fillStyle = C.tinta;
            ctx.textAlign = v >= 0 ? 'left' : 'right';
            ctx.fillText(pct(v, 1, true), bar.x + (v >= 0 ? 6 : -6), bar.y);
          });
          ctx.restore();
        }
      }]
    });
    chart.$cfg = { ...cfg, serieTiempo: false };
    graficos.push(chart);
    return chart;
  }

  /* ---------------- Filtro de fechas ---------------- */
  function aplicarFechas() {
    const d = document.getElementById('desde').value, h = document.getElementById('hasta').value;
    graficos.forEach((ch) => {
      const cfg = ch.$cfg;
      if (!cfg.serieTiempo) return;
      const labels = ch.data.labels;
      const primeros = ch.data.datasets.map((ds) => ds.data.findIndex((v) => v != null)).filter((i) => i >= 0);
      const inicioDatos = Math.max(0, ...primeros), primero = Math.min(...primeros, labels.length - 1);
      const desde = d || cfg.desde || labels[inicioDatos];
      let i0 = labels.findIndex((l) => l >= desde.slice(0, l.length));
      if (i0 < 0) i0 = 0;
      i0 = Math.max(i0, d ? primero : inicioDatos);
      // El eje termina en el último dato disponible, aunque "hasta" pida más.
      const ult = Math.max(...ch.data.datasets.map((ds) => { for (let i = ds.data.length - 1; i >= 0; i--) if (ds.data[i] != null) return i; return -1; }));
      let i1 = ult >= 0 ? ult : labels.length - 1;
      if (h) { const j = labels.map((l) => l <= h.slice(0, l.length)).lastIndexOf(true); if (j >= 0) i1 = Math.min(j, i1); }
      ch.options.scales.x.min = i0;
      ch.options.scales.x.max = Math.max(i0, i1);
      ch.update('none');
    });
  }

  /* ---------------- Descargas ---------------- */
  const LOGO_PATH = document.querySelector('#logo-ceer path').getAttribute('d');
  function logoImagen(color, cursor) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 469 110" width="469" height="110"><path fill="${color}" d="${LOGO_PATH}"/><rect fill="${cursor}" x="417" y="87" width="52" height="21"/></svg>`;
    return new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg); });
  }
  // PNG armado a mano en alta resolución: título, unidad, gráfico, fuente y logo.
  async function descargarPNG(tarjeta, id) {
    const ch = Chart.getChart(id); if (!ch) return;
    const ESC = 3, PAD = 24;
    const css = getComputedStyle(tarjeta);
    const fondo = css.backgroundColor || '#ffffff';
    const oscuro = temaActual() === 'dark';
    const prev = ch.options.devicePixelRatio;
    ch.options.devicePixelRatio = ESC; ch.resize(); ch.update('none');
    const w = ch.width, h = ch.height;
    const titulo = tarjeta.querySelector('h3').textContent, unidad = (tarjeta.querySelector('.unidad') || {}).textContent || '';
    const fuente = tarjeta.querySelector('.pie span').textContent;
    const top = PAD + 24 + (unidad ? 22 : 0) + 16, alto = top + h + 16 + 20 + PAD, ancho = w + PAD * 2;
    const cv = document.createElement('canvas'); cv.width = ancho * ESC; cv.height = alto * ESC;
    const ctx = cv.getContext('2d'); ctx.scale(ESC, ESC);
    ctx.fillStyle = fondo; ctx.fillRect(0, 0, ancho, alto);
    ctx.fillStyle = C.tinta; ctx.font = `700 18px ${MONO}`; ctx.textBaseline = 'top'; ctx.fillText(titulo, PAD, PAD);
    if (unidad) { ctx.fillStyle = C.sec; ctx.font = `400 13px ${SANS}`; ctx.fillText(unidad, PAD, PAD + 26); }
    ctx.drawImage(ch.canvas, PAD, top, w, h);
    const yPie = top + h + 16;
    ctx.fillStyle = C.sec; ctx.font = `400 12px ${SANS}`; ctx.textBaseline = 'alphabetic'; ctx.fillText(fuente, PAD, yPie + 12);
    const logo = await logoImagen(oscuro ? '#ffffff' : '#2840a5', oscuro ? '#f7ac4d' : '#d6810c');
    if (logo) { const lh = 12, lw = lh * 469 / 110; ctx.drawImage(logo, ancho - PAD - lw, yPie + 12 - lh * 0.98, lw, lh); }
    ch.options.devicePixelRatio = prev; ch.resize(); ch.update('none');
    const a = document.createElement('a'); a.href = cv.toDataURL('image/png'); a.download = `ceer_${id}.png`; a.click();
  }
  function descargarCSV(id) {
    const ch = Chart.getChart(id); if (!ch) return;
    const l = ch.data.labels;
    const i0 = typeof ch.options.scales.x.min === 'number' ? ch.options.scales.x.min : 0;
    const i1 = typeof ch.options.scales.x.max === 'number' ? ch.options.scales.x.max : l.length - 1;
    let csv = '"Período"' + ch.data.datasets.map((d) => `;"${d.label}"`).join('') + '\n';
    for (let i = (ch.$cfg.serieTiempo ? i0 : 0); i <= (ch.$cfg.serieTiempo ? i1 : l.length - 1); i++) {
      csv += `"${l[i]}"` + ch.data.datasets.map((d) => ';' + (d.data[i] == null ? '' : String(d.data[i]).replace('.', ','))).join('') + '\n';
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `ceer_${id}.csv`; a.click();
  }

  /* ---------------- Tarjetas ---------------- */
  function clave(rotulo, cifra, varTxt, pie, destacada) {
    return `<div class="clave"><span class="rotulo">${rotulo}</span><span class="cifra${destacada ? ' destacada' : ''}">${cifra}</span><span class="var">${varTxt || ''}</span><span class="pie">${pie}</span></div>`;
  }
  function estandar(rotulo, cifra, variacion, fuente) {
    if (cifra === 's/d') return '';
    return `<div class="std"><span class="rotulo">${rotulo}</span><span class="cifra">${cifra}</span><span class="var">${variacion || ''}</span><span class="fuente">${fuente}</span></div>`;
  }
  const varSpan = (v, sufijo, invertir) => {
    if (v == null || !isFinite(v)) return '';
    const bueno = invertir ? v < 0 : v > 0;
    return `<span class="${bueno ? 'sube' : 'baja'}">${flecha(v)} ${pct(Math.abs(v), 1)}</span> ${sufijo}`;
  };

  /* ---------------- Paneles ---------------- */
  const PANELES = [
    { id: 'resumen', nombre: 'Resumen' },
    { id: 'precios', nombre: 'Precios', desc: 'Inflación mensual e interanual, núcleo, regulados y estacionales, divisiones del IPC y canastas básicas.' },
    { id: 'actividad', nombre: 'Actividad', desc: 'EMAE, industria, construcción y actividad por sector.' },
    { id: 'trabajo', nombre: 'Trabajo e ingresos', desc: 'Desocupación, empleo, pobreza y salarios reales.' },
    { id: 'externo', nombre: 'Sector externo', desc: 'Exportaciones, importaciones y saldo comercial.' },
    { id: 'cambio', nombre: 'Tipo de cambio', desc: 'Dólar oficial y paralelos, brecha, bandas, reservas, riesgo país y expectativas.' },
    { id: 'monetaria', nombre: 'Política monetaria', desc: 'Base monetaria, M2 y tasas de interés.' },
    { id: 'bancos', nombre: 'Bancos', desc: 'Préstamos y depósitos del sector privado.' },
    { id: 'generador', nombre: 'Generador de gráficos', desc: 'Armá tu propio gráfico cruzando series, por sector.', aparte: true }
  ];

  function crearPaneles() {
    const nav = document.getElementById('pestanas');
    const cont = document.getElementById('paneles');
    cont.innerHTML = ''; nav.innerHTML = '';
    const inicial = (location.hash || '').slice(1);
    PANELES.forEach((p, i) => {
      const activo = inicial ? inicial === p.id : i === 0;
      if (!p.aparte) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'pestana' + (activo ? ' activa' : ''); b.textContent = p.nombre; b.setAttribute('role', 'tab'); b.dataset.panel = p.id;
        b.addEventListener('click', () => mostrar(p.id));
        nav.appendChild(b);
      }
      const sec = document.createElement('section');
      sec.className = 'panel' + (activo ? ' activo' : ''); sec.id = p.id;
      cont.appendChild(sec);
    });
  }
  function mostrar(id) {
    const p = PANELES.find((x) => x.id === id) || PANELES[0];
    id = p.id;
    document.documentElement.setAttribute('data-panel', id);
    document.getElementById('seccionActual').textContent = p.nombre;
    document.getElementById('btnGenerador').classList.toggle('activa', id === 'generador');
    document.querySelectorAll('.pestana').forEach((b) => b.classList.toggle('activa', b.dataset.panel === id));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('activo', p.id === id));
    history.replaceState(null, '', '#' + id);
    const b = document.querySelector(`.pestana[data-panel="${id}"]`);
    if (b) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (window._actFlechas) window._actFlechas();
    graficos.forEach((c) => c.resize());
    // Al cambiar de solapa se vuelve arriba: cada panel empieza con su propio título.
    window.scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' });
  }
  const bloque = (panel, html) => { const d = document.createElement('div'); d.innerHTML = html; while (d.firstChild) panel.appendChild(d.firstChild); };
  const grilla = (panel) => { const g = document.createElement('div'); g.className = 'graficos'; panel.appendChild(g); return g; };
  const titulo = (panel, t, intro) => bloque(panel, `<h2>${t}</h2>${intro ? `<p class="intro">${intro}</p>` : ''}`);

  /* ---- Resumen: el encabezado grande (apertura) es de esta solapa; acá van los accesos a cada sección ---- */
  function panelResumen() {
    const P = document.getElementById('resumen');
    titulo(P, 'Secciones', 'Elegí una sección para ver sus indicadores y gráficos.');
    bloque(P, `<div class="secciones">${PANELES.filter((p) => p.desc).map((p) => `<button type="button" class="seccion" data-ir="${p.id}"><h3>${esc(p.nombre)}</h3><p>${esc(p.desc)}</p><span class="ir">Ver ${p.id === 'generador' ? 'el generador' : 'la sección'} →</span></button>`).join('')}</div>`);
    P.querySelectorAll('[data-ir]').forEach((b) => b.addEventListener('click', () => mostrar(b.dataset.ir)));
  }

  /* ---- Precios ---- */
  function panelPrecios() {
    const P = document.getElementById('precios');
    const ipcM = m('ipc_mensual'), ipcIA = m('ipc_interanual');
    const nuc = varM(ix('ipc_nucleo')), reg = varM(ix('ipc_regulados')), est = varM(ix('ipc_estacionales'));
    const uM = ultimo(ipcM, S.fm), uIA = ultimo(ipcIA, S.fm), uN = ultimo(nuc, S.fm), uR = ultimo(reg, S.fm), uE = ultimo(est, S.fm);
    titulo(P, 'Inflación', 'Índice de precios al consumidor (IPC) del INDEC, total nacional.');
    bloque(P, `<div class="estandar">
      ${estandar('Inflación mensual, nivel general', uM ? pct(uM.v) : 's/d', uM && ipcM[uM.i - 1] != null ? `${pct(ipcM[uM.i - 1])} el mes anterior` : '', `INDEC vía BCRA / ${uM ? mesLargo(uM.f) : ''}`)}
      ${estandar('Inflación interanual', uIA ? pct(uIA.v) : 's/d', uIA && ipcIA[uIA.i - 12] != null ? `${pct(ipcIA[uIA.i - 12])} un año antes` : '', `INDEC vía BCRA / ${uIA ? mesLargo(uIA.f) : ''}`)}
      ${estandar('Inflación núcleo, mensual', uN ? pct(uN.v) : 's/d', uN && nuc[uN.i - 1] != null ? `${pct(nuc[uN.i - 1])} el mes anterior` : '', `INDEC / ${uN ? mesLargo(uN.f) : ''}`)}
      ${estandar('Regulados y estacionales, mensual', uR ? pct(uR.v) : 's/d', uE ? `estacionales ${pct(uE.v)}` : '', `INDEC / ${uR ? mesLargo(uR.f) : ''}`)}
    </div>`);
    const g = grilla(P);
    serieTiempo({ id: 'gIpcCat', titulo: 'Inflación mensual por categoría', unidad: 'Variación % mensual', fuente: 'CEER en base a INDEC y BCRA', desde: '2024-07', formatoY: (v) => pct(v, 0),
      series: [{ label: 'Nivel general', data: ipcM, ancho: 2.5 }, { label: 'Núcleo', data: nuc }, { label: 'Regulados', data: reg }, { label: 'Estacionales', data: est }] }, g);
    serieTiempo({ id: 'gIpcIA', titulo: 'Inflación interanual', unidad: 'Variación % interanual', fuente: 'CEER en base a INDEC y BCRA', desde: '2017-01', formatoY: (v) => pct(v, 0),
      series: [{ label: 'Nivel general', data: ipcIA, ancho: 2.5 }, { label: 'Núcleo', data: varIA(ix('ipc_nucleo')) }] }, g);
    // Divisiones: último mes con dato
    const DIV = { div_alimentos: 'Alimentos y bebidas', div_bebidas: 'Bebidas alcohólicas y tabaco', div_vivienda: 'Vivienda y servicios', div_salud: 'Salud', div_transporte: 'Transporte', div_comunicacion: 'Comunicación', div_recreacion: 'Recreación y cultura', div_educacion: 'Educación', div_restaurantes: 'Restaurantes y hoteles', div_varios: 'Bienes y servicios varios' };
    const nivel = varM(ix('ipc')); const uDiv = ultimo(nivel, S.fm);
    if (uDiv) {
      const filasM = Object.entries(DIV).map(([k, l]) => ({ l, v: varM(ix(k))[uDiv.i] }));
      filasM.push({ l: 'Nivel general', v: uDiv.v, destacar: true });
      barrasH({ id: 'gIpcDivM', titulo: 'Inflación mensual por división', unidad: `Variación % mensual, ${mesLargo(uDiv.f)}`, fuente: 'CEER en base a INDEC', filas: filasM, alto: true }, g);
      const filasA = Object.entries(DIV).map(([k, l]) => ({ l, v: varIA(ix(k))[uDiv.i] }));
      filasA.push({ l: 'Nivel general', v: varIA(ix('ipc'))[uDiv.i], destacar: true });
      barrasH({ id: 'gIpcDivA', titulo: 'Inflación interanual por división', unidad: `Variación % interanual, ${mesLargo(uDiv.f)}`, fuente: 'CEER en base a INDEC', filas: filasA, alto: true }, g);
    }
    serieTiempo({ id: 'gCanastas', titulo: 'Líneas de pobreza e indigencia', unidad: 'Pesos por adulto equivalente por mes', fuente: 'CEER en base a INDEC', desde: '2020-01', formatoY: (v) => '$ ' + compacto(v), decimales: 0,
      series: [{ label: 'Pobreza (CBT)', data: ix('linea_pobreza') }, { label: 'Indigencia (CBA)', data: ix('linea_indigencia') }] }, g);
    serieTiempo({ id: 'gCanastasIA', titulo: 'Canastas básicas e inflación', unidad: 'Variación % interanual', fuente: 'CEER en base a INDEC', desde: '2020-01', formatoY: (v) => pct(v, 0),
      series: [{ label: 'CBT', data: varIA(ix('linea_pobreza')) }, { label: 'CBA', data: varIA(ix('linea_indigencia')) }, { label: 'IPC', data: varIA(ix('ipc')), color: C.gris }] }, g);
  }

  /* ---- Actividad ---- */
  function panelActividad() {
    const P = document.getElementById('actividad');
    const emaeD = ix('emae_desest'), emaeO = ix('emae_original');
    const emM = varM(emaeD), emIA = varIA(emaeO), ipiIA = varIA(ix('ipi_original')), isacIA = varIA(ix('isac_original'));
    const u1 = ultimo(emM, S.fm), u2 = ultimo(emIA, S.fm), u3 = ultimo(ipiIA, S.fm), u4 = ultimo(isacIA, S.fm);
    titulo(P, 'Actividad económica', 'Estimador mensual de actividad económica (EMAE), industria (IPI manufacturero) y construcción (ISAC).');
    bloque(P, `<div class="estandar">
      ${estandar('EMAE, variación mensual desestacionalizada', u1 ? pct(u1.v, 1, true) : 's/d', u1 && emM[u1.i - 1] != null ? `${pct(emM[u1.i - 1], 1, true)} el mes anterior` : '', `INDEC / ${u1 ? mesLargo(u1.f) : ''}`)}
      ${estandar('EMAE, variación interanual', u2 ? pct(u2.v, 1, true) : 's/d', '', `INDEC / ${u2 ? mesLargo(u2.f) : ''}`)}
      ${estandar('Industria manufacturera (IPI), interanual', u3 ? pct(u3.v, 1, true) : 's/d', '', `INDEC / ${u3 ? mesLargo(u3.f) : ''}`)}
      ${estandar('Construcción (ISAC), interanual', u4 ? pct(u4.v, 1, true) : 's/d', '', `INDEC / ${u4 ? mesLargo(u4.f) : ''}`)}
    </div>`);
    const g = grilla(P);
    serieTiempo({ id: 'gEmae', titulo: 'EMAE desestacionalizado', unidad: 'Índice base 2004 = 100', fuente: 'CEER en base a INDEC', desde: '2017-01', formatoY: (v) => num(v, 0),
      series: [{ label: 'EMAE', data: emaeD, ancho: 2.5 }] }, g);
    serieTiempo({ id: 'gEmaeM', titulo: 'EMAE, variación mensual desestacionalizada', unidad: 'Variación % mensual', fuente: 'CEER en base a INDEC', desde: '2023-01', formatoY: (v) => pct(v, 1), etiquetas: false,
      series: [{ label: 'Variación mensual', data: emM, tipo: 'bar' }] }, g);
    const SEC = { sec_agro: 'Agro', sec_pesca: 'Pesca', sec_mineria: 'Minería', sec_industria: 'Industria', sec_electricidad: 'Electricidad, gas y agua', sec_comercio: 'Comercio', sec_hoteles: 'Hoteles y restaurantes', sec_transporte: 'Transporte y comunicaciones', sec_financiera: 'Intermediación financiera', sec_inmobiliarias: 'Inmobiliarias', sec_admin: 'Administración pública', sec_ensenanza: 'Enseñanza', sec_salud: 'Salud' };
    const uSec = ultimo(varIA(ix('sec_comercio')), S.fm);
    if (uSec) {
      const filas = Object.entries(SEC).map(([k, l]) => ({ l, v: varIA(ix(k))[uSec.i] }));
      filas.push({ l: 'EMAE total', v: emIA[uSec.i], destacar: true });
      barrasH({ id: 'gEmaeSec', titulo: 'EMAE por sector', unidad: `Variación % interanual, ${mesLargo(uSec.f)}`, fuente: 'CEER en base a INDEC', filas, alto: true }, g);
    }
    serieTiempo({ id: 'gIndCons', titulo: 'Industria y construcción, series desestacionalizadas', unidad: 'Índice, promedio 2017 = 100', fuente: 'CEER en base a INDEC', desde: '2017-01', formatoY: (v) => num(v, 0), alto: true,
      series: [{ label: 'Industria (IPI)', data: rebase(ix('ipi_desest'), '2017-01', '2017-12') }, { label: 'Construcción (ISAC)', data: rebase(ix('isac_desest'), '2017-01', '2017-12') }, { label: 'EMAE', data: rebase(emaeD, '2017-01', '2017-12'), color: C.gris }] }, g);
  }

  /* ---- Trabajo e ingresos ---- */
  function panelTrabajo() {
    const P = document.getElementById('trabajo');
    const eph = S.ind || {};
    const sq = (k) => eph[k] || { f: [], v: [] };
    const act = sq('eph_actividad'), emp = sq('eph_empleo'), des = sq('eph_desocupacion'), pobP = sq('pobreza_personas'), pobH = sq('pobreza_hogares');
    const last = (s) => (s.v.length ? { v: s.v[s.v.length - 1], f: s.f[s.f.length - 1], prev4: s.v[s.v.length - 5], prev2: s.v[s.v.length - 3] } : null);
    const ld = last(des), le = last(emp), lp = last(pobP);
    const ipc = ix('ipc');
    const real = (k) => { const s = ix(k); return s.map((v, i) => (v != null && ipc[i] != null ? v / ipc[i] : null)); };
    const salRealReg = rebase(real('sal_registrado'), '2023-11', '2023-11');
    const salM = varM(ix('sal_registrado')); const us = ultimo(salM, S.fm); const ur = ultimo(salRealReg, S.fm);
    titulo(P, 'Trabajo, salarios y pobreza', 'Encuesta Permanente de Hogares (EPH, 31 aglomerados urbanos) e índice de salarios del INDEC.');
    bloque(P, `<div class="estandar">
      ${estandar('Tasa de desocupación', ld ? pct(ld.v) : 's/d', ld && ld.prev4 != null ? `${pct(ld.prev4)} un año antes` : '', `INDEC, EPH / ${ld ? trimestre(ld.f) : ''}`)}
      ${estandar('Tasa de empleo', le ? pct(le.v) : 's/d', le && le.prev4 != null ? `${pct(le.prev4)} un año antes` : '', `INDEC, EPH / ${le ? trimestre(le.f) : ''}`)}
      ${estandar('Pobreza, personas', lp ? pct(lp.v) : 's/d', lp && lp.prev2 != null ? `${pct(lp.prev2)} un año antes` : '', `INDEC, EPH / ${lp ? semestre(lp.f) : ''}`)}
      ${estandar('Salario registrado, mensual', us ? pct(us.v, 1, true) : 's/d', ur ? `real: ${num(ur.v, 1)} (nov 23 = 100)` : '', `INDEC / ${us ? mesLargo(us.f) : ''}`)}
    </div>`);
    const g = grilla(P);
    const sLabels = [...new Set([...pobP.f, ...pobH.f])].sort();
    const alinS = (s) => sLabels.map((f) => { const i = s.f.indexOf(f); return i < 0 ? null : s.v[i]; });
    serieTiempo({ id: 'gPobreza', titulo: 'Pobreza en personas y hogares', unidad: 'Porcentaje, total de aglomerados urbanos (EPH), por semestre', fuente: 'CEER en base a INDEC, EPH', labels: sLabels, formatoX: semestre, formatoTitulo: semestre, formatoY: (v) => pct(v, 0), desdeCero: true, ancho: true, alto: true, valoresBarras: true,
      series: [{ label: 'Personas', data: alinS(pobP), tipo: 'bar' }, { label: 'Hogares', data: alinS(pobH), color: C.ambar, ancho: 2.5 }] }, g);
    serieTiempo({ id: 'gSalReal', titulo: 'Salario real por sector', unidad: 'Índice deflactado por IPC, noviembre 2023 = 100. No registrado en el eje derecho', fuente: 'CEER en base a INDEC', desde: '2017-01', formatoY: (v) => num(v, 0), ancho: true, eje2: true,
      series: [
        { label: 'Registrado privado', data: rebase(real('sal_privado_reg'), '2023-11', '2023-11') },
        { label: 'Registrado público', data: rebase(real('sal_publico'), '2023-11', '2023-11') },
        { label: 'No registrado (eje der.)', data: rebase(real('sal_no_registrado'), '2023-11', '2023-11'), eje: 'y1' },
        { label: 'Total', data: rebase(real('sal_total'), '2023-11', '2023-11'), color: C.gris }
      ] }, g);
    const tLabels = [...new Set([...act.f, ...emp.f, ...des.f])].sort();
    const alin = (s) => tLabels.map((f) => { const i = s.f.indexOf(f); return i < 0 ? null : s.v[i]; });
    const desA = alin(des);
    const pm4 = desA.map((_, i) => { if (i < 3) return null; const w = desA.slice(i - 3, i + 1); return w.some((v) => v == null) ? null : w.reduce((a, b) => a + b, 0) / 4; });
    serieTiempo({ id: 'gEph', titulo: 'Tasas de actividad y empleo', unidad: 'Porcentaje de la población total', fuente: 'CEER en base a INDEC, EPH', labels: tLabels, formatoX: trimestre, formatoTitulo: trimestre, formatoY: (v) => pct(v, 0),
      series: [{ label: 'Actividad', data: alin(act) }, { label: 'Empleo', data: alin(emp) }] }, g);
    serieTiempo({ id: 'gDesoc', titulo: 'Tasa de desocupación', unidad: 'Porcentaje de la población económicamente activa', fuente: 'CEER en base a INDEC, EPH', labels: tLabels, formatoX: trimestre, formatoTitulo: trimestre, formatoY: (v) => pct(v, 0), desdeCero: true,
      series: [{ label: 'Trimestral', data: desA, tipo: 'bar' }, { label: 'Promedio 4 trimestres', data: pm4, color: C.ambar, ancho: 2.5 }] }, g);
  }

  /* ---- Sector externo ---- */
  function panelExterno() {
    const P = document.getElementById('externo');
    const ex = ix('expo'), im = ix('impo'), sa = ix('saldo');
    const ue = ultimo(ex, S.fm), ui = ultimo(im, S.fm), us = ultimo(sa, S.fm);
    const sa12 = suma12(sa); const u12 = ultimo(sa12, S.fm);
    const eIA = varIA(ex), iIA = varIA(im);
    const usd = (v) => 'USD ' + num(v, 0) + ' M';
    titulo(P, 'Intercambio comercial', 'Exportaciones e importaciones de bienes (ICA del INDEC), en millones de dólares.');
    bloque(P, `<div class="estandar">
      ${estandar('Exportaciones', ue ? usd(ue.v) : 's/d', ue ? varSpan(eIA[ue.i], 'interanual') : '', `INDEC / ${ue ? mesLargo(ue.f) : ''}`)}
      ${estandar('Importaciones', ui ? usd(ui.v) : 's/d', ui ? varSpan(iIA[ui.i], 'interanual') : '', `INDEC / ${ui ? mesLargo(ui.f) : ''}`)}
      ${estandar('Saldo comercial del mes', us ? usd(us.v) : 's/d', '', `INDEC / ${us ? mesLargo(us.f) : ''}`)}
      ${estandar('Saldo, últimos 12 meses', u12 ? usd(u12.v) : 's/d', '', `INDEC / hasta ${u12 ? mesLargo(u12.f) : ''}`)}
    </div>`);
    const g = grilla(P);
    serieTiempo({ id: 'gComercio', titulo: 'Exportaciones e importaciones', unidad: 'Millones de dólares por mes', fuente: 'CEER en base a INDEC', desde: '2017-01', formatoY: (v) => num(v, 0), decimales: 0,
      series: [{ label: 'Exportaciones', data: ex }, { label: 'Importaciones', data: im }] }, g);
    serieTiempo({ id: 'gSaldo', titulo: 'Saldo comercial', unidad: 'Millones de dólares por mes', fuente: 'CEER en base a INDEC', desde: '2021-01', formatoY: (v) => num(v, 0), decimales: 0, etiquetas: false,
      series: [{ label: 'Saldo', data: sa, tipo: 'bar' }] }, g);
    serieTiempo({ id: 'gExpoRubros', titulo: 'Exportaciones por gran rubro', unidad: 'Millones de dólares, suma de 12 meses', fuente: 'CEER en base a INDEC', desde: '2017-12', formatoY: (v) => num(v, 0), decimales: 0, ancho: true,
      series: [{ label: 'Productos primarios', data: suma12(ix('expo_pp')) }, { label: 'MOA', data: suma12(ix('expo_moa')) }, { label: 'MOI', data: suma12(ix('expo_moi')) }, { label: 'Combustibles y energía', data: suma12(ix('expo_cye')) }] }, g);
  }

  /* ---- Tipo de cambio y riesgo (BCRA y otros) ---- */
  function panelCambio() {
    const P = document.getElementById('cambio');
    titulo(P, 'Tipo de cambio, reservas y riesgo país');
    const g = grilla(P);
    serieTiempo({ id: 'gBandas', titulo: 'Tipo de cambio mayorista y bandas cambiarias', unidad: 'Pesos por dólar, promedio mensual', fuente: 'CEER en base a BCRA', desde: '2025-01', formatoY: (v) => num(v, 0), decimales: 0,
      series: [{ label: 'Mayorista', data: nom('tc_mayorista'), ancho: 2.5 }, { label: 'Banda superior', data: nom('banda_superior'), color: C.gris, guiones: true }, { label: 'Banda inferior', data: nom('banda_inferior'), color: C.gris, guiones: true }] }, g);
    serieTiempo({ id: 'gDolares', titulo: 'Dólar oficial y cotizaciones paralelas', unidad: 'Pesos por dólar, promedio mensual', fuente: 'CEER en base a BCRA y Ámbito', desde: '2024-01', formatoY: (v) => num(v, 0), decimales: 0, ancho: true,
      series: [{ label: 'Oficial mayorista', data: nom('tc_mayorista'), ancho: 2.5 }, { label: 'MEP', data: nom('dolar_mep') }, { label: 'CCL', data: nom('dolar_ccl') }, { label: 'Blue', data: nom('dolar_blue') }] }, g);
    serieTiempo({ id: 'gBrecha', titulo: 'Brecha cambiaria', unidad: 'Porcentaje sobre el tipo de cambio oficial', fuente: 'CEER en base a BCRA y Ámbito', formatoY: (v) => pct(v, 0),
      series: [{ label: 'Blue', data: m('brecha_blue') }, { label: 'MEP', data: m('brecha_mep') }, { label: 'CCL', data: m('brecha_ccl') }] }, g);
    serieTiempo({ id: 'gRiesgo', titulo: 'Riesgo país', unidad: 'Puntos básicos', fuente: 'CEER en base a Ámbito y ArgentinaDatos', formatoY: (v) => num(v, 0), decimales: 0,
      series: [{ label: 'Riesgo país', data: m('riesgo_pais') }] }, g);
    serieTiempo({ id: 'gItcrm', titulo: 'Tipo de cambio real multilateral', unidad: 'Índice 17-12-2015 = 100', fuente: 'CEER en base a BCRA', formatoY: (v) => num(v, 0),
      series: [{ label: 'ITCRM', data: m('itcrm') }] }, g);
    serieTiempo({ id: 'gReservas', titulo: 'Reservas brutas y compras de divisas del BCRA', unidad: 'Millones de dólares constantes', fuente: 'CEER en base a BCRA y BLS', eje2: true,
      series: [{ label: 'Reservas', data: m('reservas') }, { label: 'Compras', data: m('compra_divisas'), tipo: 'bar', eje: 'y1', color: C.cian }] }, g);
    serieTiempo({ id: 'gCarrera', titulo: 'Devaluación e inflación mensual', unidad: 'Variación % mensual', fuente: 'CEER en base a BCRA e INDEC', desde: '2023-01', formatoY: (v) => pct(v, 0),
      series: [{ label: 'Devaluación', data: m('tc_mayorista_var') }, { label: 'Inflación', data: m('ipc_mensual') }] }, g);
    serieTiempo({ id: 'gExpect', titulo: 'Inflación interanual observada y esperada', unidad: 'Porcentaje; expectativa a 12 meses del REM', fuente: 'CEER en base a INDEC y BCRA (REM)', formatoY: (v) => pct(v, 0),
      series: [{ label: 'Observada', data: m('ipc_interanual') }, { label: 'Esperada (REM)', data: m('rem_interanual'), guiones: true }] }, g);
    serieTiempo({ id: 'gFed', titulo: 'Tasa de fondos federales de EE.UU.', unidad: 'Tasa efectiva (EFFR), %', fuente: 'CEER en base a Reserva Federal de Nueva York', formatoY: (v) => pct(v, 1),
      series: [{ label: 'EFFR', data: m('tasa_fed') }] }, g);
  }

  /* ---- Política monetaria ---- */
  function panelMonetaria() {
    const P = document.getElementById('monetaria');
    titulo(P, 'Agregados monetarios y tasas de interés');
    const g = grilla(P);
    serieTiempo({ id: 'gAgregados', titulo: 'Base monetaria y M2', unidad: 'Pesos constantes', fuente: 'CEER en base a BCRA e INDEC',
      series: [{ label: 'M2', data: m('m2') }, { label: 'Base monetaria', data: m('base_monetaria') }] }, g);
    serieTiempo({ id: 'gTasas', titulo: 'Tasas de interés e inflación', unidad: 'Tasa efectiva anual y variación % interanual', fuente: 'CEER en base a BCRA e INDEC', desde: '2020-01', formatoY: (v) => pct(v, 0),
      series: [{ label: 'TAMAR', data: m('tamar_tea') }, { label: 'BADLAR', data: m('badlar_tea') }, { label: 'Inflación i.a.', data: m('ipc_interanual'), color: C.gris }] }, g);
    serieTiempo({ id: 'gDiario', titulo: 'Tasas BADLAR y TAMAR, diarias', unidad: 'Tasa efectiva anual, %', fuente: 'CEER en base a BCRA', labels: S.fd, ancho: true,
      formatoX: (l) => { const [y, mm, d] = l.split('-'); return `${d}/${mm}/${y.slice(2)}`; }, formatoTitulo: (l) => { const [y, mm, d] = l.split('-'); return `${d}/${mm}/${y}`; }, formatoY: (v) => pct(v, 0),
      series: [{ label: 'BADLAR', data: S.d.badlar_tea || [] }, { label: 'TAMAR', data: S.d.tamar_tea || [] }] }, g);
  }

  /* ---- Sector bancario ---- */
  function panelBancos() {
    const P = document.getElementById('bancos');
    titulo(P, 'Préstamos y depósitos del sector privado');
    const g = grilla(P);
    serieTiempo({ id: 'gPrestamos', titulo: 'Préstamos en pesos por tipo', unidad: 'Pesos constantes, saldo a fin de mes', fuente: 'CEER en base a BCRA e INDEC', apilado: true,
      series: [{ label: 'Prendarios', data: m('prendarios'), relleno: true, apilar: true }, { label: 'Hipotecarios', data: m('hipotecarios'), relleno: true, apilar: true }, { label: 'Personales', data: m('personales'), relleno: true, apilar: true }, { label: 'Tarjetas', data: m('tarjetas'), relleno: true, apilar: true }] }, g);
    serieTiempo({ id: 'gDepositos', titulo: 'Depósitos en pesos por tipo', unidad: 'Pesos constantes, saldo a fin de mes', fuente: 'CEER en base a BCRA e INDEC', apilado: true,
      series: [{ label: 'Plazo fijo', data: m('plazo_fijo'), relleno: true, apilar: true }, { label: 'Cajas de ahorro', data: m('ca'), relleno: true, apilar: true }, { label: 'Cuentas corrientes', data: m('cc'), relleno: true, apilar: true }] }, g);
    serieTiempo({ id: 'gUsd', titulo: 'Préstamos y depósitos en dólares', unidad: 'Millones de dólares corrientes', fuente: 'CEER en base a BCRA', ancho: true,
      series: [{ label: 'Depósitos', data: nom('depositos_usd') }, { label: 'Préstamos', data: nom('prestamos_usd') }] }, g);
  }

  /* ---- Generador ----
     El catálogo se arma por sector y grupo. Cada serie ofrece las transformaciones que tienen sentido
     (valor original, variación mensual, variación interanual, acumulado de 12 meses, real) y solo
     aparecen las series y transformaciones que tienen datos. */
  const TRANSFORMACIONES = {
    nivel:     { nombre: 'Valor original', corta: '', f: (a) => a },
    mensual:   { nombre: 'Variación mensual (%)', corta: 'var. mensual (%)', f: varM },
    interanual:{ nombre: 'Variación interanual (%)', corta: 'var. interanual (%)', f: varIA },
    acum12:    { nombre: 'Acumulado de 12 meses', corta: 'acumulado 12 meses', f: suma12 },
    real:      { nombre: 'Real, deflactado por IPC (nov 2023 = 100)', corta: 'real (nov 2023 = 100)', f: (a) => { const ipc = ix('ipc'); return rebase(a.map((v, i) => (v != null && ipc[i] != null ? v / ipc[i] : null)), '2023-11', '2023-11'); } }
  };
  const VAR = ['mensual', 'interanual'], FLUJO = ['mensual', 'interanual', 'acum12'];

  function catalogo() {
    // e(id, nombre, unidad, fuente, datos, transformaciones, reemplazos)
    const e = (id, nombre, unidad, fuente, g, t = [], o = {}) => ({ id, nombre, unidad, fuente, t, o, vars: [{ id: '', nombre: '', g }] });
    // Series del BCRA que existen a valores constantes (deflactados) y corrientes: un solo ítem con selector "Valores".
    const par = (k, nombre, unidad, fuente, t = VAR, primero = 'c') => {
      const c = { id: 'c', nombre: 'constantes', g: () => m(k) }, n = { id: 'n', nombre: 'corrientes', g: () => S.m[k + '_corriente'] || [] };
      const x = e(k, nombre, unidad, fuente, null, t); x.vars = primero === 'n' ? [n, c] : [c, n];
      return [x];
    };
    const eph = (k) => () => alinear(S.ind && S.ind[k]);
    const DIV = [['alimentos', 'Alimentos y bebidas'], ['bebidas', 'Bebidas alcohólicas y tabaco'], ['vivienda', 'Vivienda y servicios'], ['salud', 'Salud'], ['transporte', 'Transporte'], ['comunicacion', 'Comunicación'], ['recreacion', 'Recreación y cultura'], ['educacion', 'Educación'], ['restaurantes', 'Restaurantes y hoteles'], ['varios', 'Bienes y servicios varios']];
    const SEC = [['agro', 'Agro'], ['pesca', 'Pesca'], ['mineria', 'Minería'], ['industria', 'Industria'], ['electricidad', 'Electricidad, gas y agua'], ['comercio', 'Comercio'], ['hoteles', 'Hoteles y restaurantes'], ['transporte', 'Transporte y comunicaciones'], ['financiera', 'Intermediación financiera'], ['inmobiliarias', 'Inmobiliarias'], ['admin', 'Administración pública'], ['ensenanza', 'Enseñanza'], ['salud', 'Salud'], ['comunitarios', 'Servicios comunitarios y personales']];
    const TCR = [['usa', 'Estados Unidos'], ['brasil', 'Brasil'], ['zona_euro', 'Zona euro'], ['china', 'China'], ['chile', 'Chile'], ['uruguay', 'Uruguay'], ['mexico', 'México'], ['canada', 'Canadá'], ['japon', 'Japón'], ['reino_unido', 'Reino Unido'], ['suiza', 'Suiza'], ['india', 'India'], ['vietnam', 'Vietnam']];
    const idx = (k) => () => ix(k);
    return [
      { sector: 'Precios', grupos: [
        { grupo: 'Inflación', series: [
          e('ipc', 'IPC, nivel general', 'índice dic 2016 = 100', 'INDEC', idx('ipc'), VAR, { mensual: () => m('ipc_mensual'), interanual: () => m('ipc_interanual') }),
          e('ipc_nucleo', 'IPC, inflación núcleo', 'índice dic 2016 = 100', 'INDEC', idx('ipc_nucleo'), VAR),
          e('ipc_regulados', 'IPC, regulados', 'índice dic 2016 = 100', 'INDEC', idx('ipc_regulados'), VAR),
          e('ipc_estacionales', 'IPC, estacionales', 'índice dic 2016 = 100', 'INDEC', idx('ipc_estacionales'), VAR)
        ] },
        { grupo: 'IPC por división', series: DIV.map(([k, l]) => e('div_' + k, 'IPC, ' + l, 'índice dic 2016 = 100', 'INDEC', idx('div_' + k), VAR)) },
        { grupo: 'Canastas y expectativas', series: [
          e('linea_pobreza', 'Canasta básica total (línea de pobreza)', '$ por adulto equivalente', 'INDEC', idx('linea_pobreza'), VAR),
          e('linea_indigencia', 'Canasta básica alimentaria (línea de indigencia)', '$ por adulto equivalente', 'INDEC', idx('linea_indigencia'), VAR),
          e('rem_interanual', 'Inflación esperada a 12 meses (REM)', '%', 'BCRA', () => m('rem_interanual'))
        ] }
      ] },
      { sector: 'Actividad', grupos: [
        { grupo: 'EMAE', series: [
          e('emae_desest', 'EMAE, desestacionalizado', 'índice 2004 = 100', 'INDEC', idx('emae_desest'), VAR),
          e('emae_original', 'EMAE, serie original', 'índice 2004 = 100', 'INDEC', idx('emae_original'), VAR)
        ] },
        { grupo: 'Industria y construcción', series: [
          e('ipi_desest', 'Industria (IPI manufacturero), desestacionalizado', 'índice', 'INDEC', idx('ipi_desest'), VAR),
          e('ipi_original', 'Industria (IPI manufacturero), serie original', 'índice', 'INDEC', idx('ipi_original'), VAR),
          e('isac_desest', 'Construcción (ISAC), desestacionalizado', 'índice', 'INDEC', idx('isac_desest'), VAR),
          e('isac_original', 'Construcción (ISAC), serie original', 'índice', 'INDEC', idx('isac_original'), VAR)
        ] },
        { grupo: 'EMAE por sector', series: SEC.map(([k, l]) => e('sec_' + k, 'EMAE, ' + l, 'índice 2004 = 100', 'INDEC', idx('sec_' + k), VAR)) }
      ] },
      { sector: 'Trabajo e ingresos', grupos: [
        { grupo: 'Salarios', series: [['total', 'Salarios, nivel general', 'sal_total'], ['registrado', 'Salarios registrados', 'sal_registrado'], ['privado', 'Salarios registrados del sector privado', 'sal_privado_reg'], ['publico', 'Salarios del sector público', 'sal_publico'], ['noreg', 'Salarios no registrados', 'sal_no_registrado']]
          .map(([, n, k]) => e(k, n, 'índice oct 2016 = 100', 'INDEC', idx(k), [...VAR, 'real'])) },
        { grupo: 'Mercado de trabajo y pobreza (EPH)', series: [
          e('eph_actividad', 'Tasa de actividad (trimestral)', '%', 'INDEC, EPH', eph('eph_actividad')),
          e('eph_empleo', 'Tasa de empleo (trimestral)', '%', 'INDEC, EPH', eph('eph_empleo')),
          e('eph_desocupacion', 'Tasa de desocupación (trimestral)', '%', 'INDEC, EPH', eph('eph_desocupacion')),
          e('pobreza_personas', 'Pobreza en personas (semestral)', '%', 'INDEC, EPH', eph('pobreza_personas')),
          e('pobreza_hogares', 'Pobreza en hogares (semestral)', '%', 'INDEC, EPH', eph('pobreza_hogares'))
        ] }
      ] },
      { sector: 'Sector externo', grupos: [
        { grupo: 'Intercambio comercial', series: [
          e('expo', 'Exportaciones', 'millones de USD', 'INDEC', idx('expo'), FLUJO),
          e('impo', 'Importaciones', 'millones de USD', 'INDEC', idx('impo'), FLUJO),
          e('saldo', 'Saldo comercial', 'millones de USD', 'INDEC', idx('saldo'), ['acum12'])
        ] },
        { grupo: 'Exportaciones por gran rubro', series: [['pp', 'productos primarios'], ['moa', 'manufacturas de origen agropecuario (MOA)'], ['moi', 'manufacturas de origen industrial (MOI)'], ['cye', 'combustibles y energía']]
          .map(([k, l]) => e('expo_' + k, 'Exportaciones, ' + l, 'millones de USD', 'INDEC', idx('expo_' + k), FLUJO)) }
      ] },
      { sector: 'Tipo de cambio y reservas', grupos: [
        { grupo: 'Dólar', series: [
          ...par('tc_mayorista', 'Tipo de cambio mayorista', '$ por USD', 'BCRA', VAR, 'n'),
          ...par('tc_minorista', 'Tipo de cambio minorista', '$ por USD', 'BCRA', VAR, 'n'),
          ...par('dolar_blue', 'Dólar blue', '$ por USD', 'Ámbito', VAR, 'n'),
          ...par('dolar_mep', 'Dólar MEP', '$ por USD', 'Ámbito', VAR, 'n'),
          ...par('dolar_ccl', 'Dólar CCL', '$ por USD', 'Ámbito', VAR, 'n')
        ] },
        { grupo: 'Brecha y bandas cambiarias', series: [
          e('brecha_blue', 'Brecha cambiaria, blue', '%', 'BCRA y Ámbito', () => m('brecha_blue')),
          e('brecha_mep', 'Brecha cambiaria, MEP', '%', 'BCRA y Ámbito', () => m('brecha_mep')),
          e('brecha_ccl', 'Brecha cambiaria, CCL', '%', 'BCRA y Ámbito', () => m('brecha_ccl')),
          ...par('banda_superior', 'Banda cambiaria superior', '$ por USD', 'BCRA', [], 'n'),
          ...par('banda_inferior', 'Banda cambiaria inferior', '$ por USD', 'BCRA', [], 'n')
        ] },
        { grupo: 'Tipo de cambio real', series: [
          e('itcrm', 'Tipo de cambio real multilateral', 'índice 17-12-2015 = 100', 'BCRA', () => m('itcrm'), VAR),
          ...TCR.map(([k, l]) => e('tcr_' + k, 'Tipo de cambio real con ' + l, 'índice 17-12-2015 = 100', 'BCRA', () => m('tcr_' + k), VAR))
        ] },
        { grupo: 'Reservas y riesgo país', series: [
          ...par('reservas', 'Reservas brutas', 'millones de USD', 'BCRA'),
          ...par('compra_divisas', 'Compras de divisas del BCRA', 'millones de USD', 'BCRA', ['acum12']),
          e('riesgo_pais', 'Riesgo país', 'puntos básicos', 'Ámbito', () => m('riesgo_pais'), VAR)
        ] }
      ] },
      { sector: 'Política monetaria', grupos: [
        { grupo: 'Agregados monetarios', series: [
          ...par('base_monetaria', 'Base monetaria', 'pesos', 'BCRA'),
          ...par('m2', 'M2', 'pesos', 'BCRA'),
          ...par('m2_transaccional', 'M2 transaccional', 'pesos', 'BCRA'),
          ...par('circulacion_monetaria', 'Circulación monetaria', 'pesos', 'BCRA'),
          ...par('billetes_monedas', 'Billetes y monedas en poder del público', 'pesos', 'BCRA'),
          ...par('pases_pasivos', 'Pases pasivos', 'pesos', 'BCRA'),
          ...par('lefi', 'LEFI', 'pesos', 'BCRA')
        ] },
        { grupo: 'Tasas de interés', series: [
          e('tasa_politica_tea', 'Tasa de política monetaria (TEA)', '%', 'BCRA', () => m('tasa_politica_tea')),
          e('tamar_tea', 'TAMAR (TEA)', '%', 'BCRA', () => m('tamar_tea')),
          e('badlar_tea', 'BADLAR (TEA)', '%', 'BCRA', () => m('badlar_tea')),
          e('baibar_tea', 'BAIBAR (TEA)', '%', 'BCRA', () => m('baibar_tea')),
          e('tm20_tea', 'TM20 (TEA)', '%', 'BCRA', () => m('tm20_tea'))
        ] }
      ] },
      { sector: 'Bancos', grupos: [
        { grupo: 'Préstamos en pesos', series: [
          ...par('adelantos', 'Préstamos, adelantos', 'pesos', 'BCRA'),
          ...par('documentos', 'Préstamos, documentos', 'pesos', 'BCRA'),
          ...par('hipotecarios', 'Préstamos hipotecarios', 'pesos', 'BCRA'),
          ...par('prendarios', 'Préstamos prendarios', 'pesos', 'BCRA'),
          ...par('personales', 'Préstamos personales', 'pesos', 'BCRA'),
          ...par('tarjetas', 'Préstamos con tarjeta', 'pesos', 'BCRA')
        ] },
        { grupo: 'Depósitos en pesos', series: [
          ...par('plazo_fijo', 'Depósitos a plazo fijo', 'pesos', 'BCRA'),
          ...par('ca', 'Depósitos en cajas de ahorro', 'pesos', 'BCRA'),
          ...par('cc', 'Depósitos en cuentas corrientes', 'pesos', 'BCRA')
        ] },
        { grupo: 'En dólares', series: [
          ...par('depositos_usd', 'Depósitos en dólares', 'millones de USD', 'BCRA'),
          ...par('prestamos_usd', 'Préstamos en dólares', 'millones de USD', 'BCRA')
        ] }
      ] },
      { sector: 'Internacional', grupos: [
        { grupo: 'Estados Unidos', series: [
          e('tasa_fed', 'Tasa de fondos federales (EFFR)', '%', 'NY Fed', () => m('tasa_fed')),
          e('us_cpi', 'IPC de EE.UU.', 'índice', 'BLS', () => m('us_cpi'), VAR)
        ] }
      ] }
    ];
  }

  // Deja solo las series, valuaciones y transformaciones con datos; arma un índice por id.
  function prepararCatalogo() {
    const ENT = {};
    const cat = catalogo().map((sec) => ({
      sector: sec.sector,
      grupos: sec.grupos.map((g) => ({
        grupo: g.grupo,
        series: g.series.filter((e) => {
          e.vars = e.vars.filter((vr) => {
            vr.opts = ['nivel', ...e.t].map((tr) => {
              const data = e.o[tr] ? e.o[tr]() : TRANSFORMACIONES[tr].f(vr.g());
              return { tr, data, nombre: tr === 'nivel' ? `Valor original${e.unidad ? ` (${e.unidad})` : ''}` : TRANSFORMACIONES[tr].nombre };
            }).filter((o) => tieneDatos(o.data));
            return vr.opts.length > 0;
          });
          if (e.vars.length) ENT[e.id] = e;
          return e.vars.length > 0;
        })
      })).filter((g) => g.series.length)
    })).filter((sec) => sec.grupos.length);
    return { cat, ENT };
  }
  const etiquetaSerie = (e, vr, tr) => `${e.nombre}${vr.nombre ? `, valores ${vr.nombre}` : ''}${tr === 'nivel' ? (e.unidad ? ` (${e.unidad})` : '') : `, ${TRANSFORMACIONES[tr].corta}`}`;

  function panelGenerador() {
    const P = document.getElementById('generador');
    const { cat, ENT } = prepararCatalogo();
    P._ent = ENT;
    titulo(P, 'Generador de gráficos', 'Elegí una o dos series, por sector, para verlas juntas en el tiempo o en un diagrama de dispersión con su recta de regresión.');
    const caja = (n, titulo_) => `<div class="gen-caja" id="genCaja${n}"><h4>${titulo_}</h4>
          <label for="genSec${n}">Sector</label><select id="genSec${n}"><option value="">Elegí un sector</option>${cat.map((s) => `<option value="${esc(s.sector)}">${esc(s.sector)}</option>`).join('')}</select>
          <label for="genS${n}">Serie</label><select id="genS${n}" disabled><option value="">Primero elegí un sector</option></select>
          <label for="genV${n}" class="gen-valores" hidden>Valores</label><select id="genV${n}" class="gen-valores" hidden><option value="c">Constantes</option></select>
          <label for="genTr${n}">Transformación</label><select id="genTr${n}" disabled><option value="">Primero elegí una serie</option></select>
          <label for="genT${n}" class="gen-tipo">Tipo de gráfico</label><select id="genT${n}" class="gen-tipo"><option value="linea">Línea</option><option value="barras">Barras</option></select></div>`;
    bloque(P, `<div class="generador" id="genForm">
      <div class="gen-opciones">
        <label><input type="radio" name="genModo" value="tiempo" checked> Serie de tiempo</label>
        <label><input type="radio" name="genModo" value="dispersion"> Dispersión (X contra Y)</label>
        <label><input type="checkbox" id="genDos" checked> Comparar con una segunda serie</label>
      </div>
      <div class="gen-fila">${caja(1, 'Serie 1 (eje Y)')}${caja(2, 'Serie 2 (eje derecho o X)')}</div>
      <p class="gen-ayuda">Cada serie ofrece las transformaciones que tienen sentido (valor original, variación mensual o interanual, acumulado de 12 meses, real). Solo se listan las que tienen datos.</p>
      <button type="button" class="btn" id="genDibujar">Dibujar</button>
    </div><div class="graficos" id="genSalida"></div>`);
    const $ = (id) => document.getElementById(id);
    [1, 2].forEach((n) => {
      const sec = $('genSec' + n), sr = $('genS' + n), tr = $('genTr' + n), vl = document.querySelectorAll('#genCaja' + n + ' .gen-valores');
      const vsel = $('genV' + n);
      const llenarTr = () => {
        const e = ENT[sr.value], vr = e && (e.vars.find((x) => x.id === vsel.value) || e.vars[0]);
        tr.disabled = !vr || vr.opts.length < 2;
        tr.innerHTML = vr ? vr.opts.map((o) => `<option value="${o.tr}">${esc(o.nombre)}</option>`).join('') : '<option value="">Primero elegí una serie</option>';
      };
      sec.addEventListener('change', () => {
        const s = cat.find((x) => x.sector === sec.value);
        sr.disabled = !s;
        sr.innerHTML = s ? '<option value="">Elegí una serie</option>' + s.grupos.map((g) => `<optgroup label="${esc(g.grupo)}">${g.series.map((e) => `<option value="${esc(e.id)}">${esc(e.nombre)}</option>`).join('')}</optgroup>`).join('') : '<option value="">Primero elegí un sector</option>';
        sr.dispatchEvent(new Event('change'));
      });
      sr.addEventListener('change', () => {
        const e = ENT[sr.value], dosV = !!e && e.vars.length > 1;
        vl.forEach((el) => { el.hidden = !dosV; });
        vsel.innerHTML = dosV ? e.vars.map((x) => `<option value="${x.id}">${x.nombre[0].toUpperCase() + x.nombre.slice(1)}</option>`).join('') : '';
        llenarTr();
      });
      vsel.addEventListener('change', llenarTr);
    });
    const caja2 = $('genCaja2'), form = $('genForm');
    const sync = () => {
      const disp = document.querySelector('input[name="genModo"]:checked').value === 'dispersion';
      if (disp) $('genDos').checked = true;
      $('genDos').disabled = disp;
      caja2.classList.toggle('apagada', !$('genDos').checked);
      form.classList.toggle('es-disp', disp);
    };
    P.querySelectorAll('input').forEach((i) => i.addEventListener('change', sync));
    $('genDibujar').addEventListener('click', () => dibujarGenerador(ENT));
  }

  function dibujarGenerador(ENT) {
    const dos = document.getElementById('genDos').checked;
    const disp = document.querySelector('input[name="genModo"]:checked').value === 'dispersion';
    const leer = (n) => {
      const e = ENT[document.getElementById('genS' + n).value];
      if (!e) return null;
      const vr = e.vars.find((x) => x.id === document.getElementById('genV' + n).value) || e.vars[0];
      const o = vr.opts.find((x) => x.tr === document.getElementById('genTr' + n).value) || vr.opts[0];
      return { label: etiquetaSerie(e, vr, o.tr), data: o.data, fuente: e.fuente, tipo: document.getElementById('genT' + n).value };
    };
    const s1 = leer(1), s2 = dos ? leer(2) : null;
    if (!s1 || (dos && !s2)) { alert('Elegí las series que querés graficar.'); return; }
    const out = document.getElementById('genSalida');
    const prev = Chart.getChart('gGen'); if (prev) { graficos.splice(graficos.indexOf(prev), 1); prev.destroy(); }
    out.innerHTML = '';
    const fuentes = [...new Set([s1.fuente, s2 ? s2.fuente : null].filter(Boolean))].join(', ');
    const a = s1.data, b = s2 ? s2.data : null;
    if (disp) {
      const pts = [];
      a.forEach((v, i) => { if (v != null && b[i] != null) pts.push({ x: b[i], y: v, f: S.fm[i] }); });
      if (pts.length < 3) { alert('Las dos series casi no coinciden en el tiempo.'); return; }
      const n = pts.length; let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
      pts.forEach((p) => { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; syy += p.y * p.y; });
      const pend = (n * sxy - sx * sy) / (n * sxx - sx * sx), ord = (sy - pend * sx) / n;
      const r2 = Math.pow((n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy)), 2) || 0;
      const xs = pts.map((p) => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
      const tarjeta = tarjetaGrafico({ id: 'gGen', titulo: `${s1.label} y ${s2.label}`, unidad: 'Observaciones mensuales y recta de regresión', fuente: `CEER en base a ${fuentes}`, ancho: true, alto: true });
      tarjeta.querySelector('.lienzo').insertAdjacentHTML('beforebegin', `<div class="gen-resumen"><div><span>R²</span><b data-r2>0</b></div><div><span>Pendiente</span><b data-pend>0</b></div><div><span>Observaciones</span><b data-n>0</b></div></div>`);
      out.appendChild(tarjeta);
      const ch = new Chart(document.getElementById('gGen'), {
        type: 'scatter',
        data: { datasets: [
          { label: 'Observaciones', data: pts, backgroundColor: C.puntos, pointRadius: 3.5 },
          { type: 'line', label: 'Regresión', data: [{ x: x0, y: pend * x0 + ord }, { x: x1, y: pend * x1 + ord }], borderColor: C.ambar, borderWidth: 2, pointRadius: 0 }
        ] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, etiquetasFinales: { activo: false }, tooltip: { backgroundColor: C.tooltip, cornerRadius: 0, callbacks: { label: (it) => (it.raw.f ? ` ${mesLargo(it.raw.f)}: (${num(it.raw.x, 2)}; ${num(it.raw.y, 2)})` : '') } } },
          scales: { x: { title: { display: true, text: s2.label }, grid: { color: C.grilla }, ticks: { font: { family: MONO, size: 11 }, callback: (v) => compacto(v) } }, y: { title: { display: true, text: s1.label }, grid: { color: C.grilla }, ticks: { font: { family: MONO, size: 11 }, callback: (v) => compacto(v) } } } }
      });
      ch.$cfg = { serieTiempo: false }; graficos.push(ch);
      // reproductor: los puntos aparecen en orden cronológico y la recta se recalcula
      const ordenados = [...pts].sort((p, q) => (p.f < q.f ? -1 : 1));
      const rx = ch.scales.x, ry = ch.scales.y;
      const fijar = () => { Object.assign(ch.options.scales.x, { min: rx.min, max: rx.max }); Object.assign(ch.options.scales.y, { min: ry.min, max: ry.max }); };
      const recta = (ps) => {
        const m = ps.length; if (m < 3) return [];
        let a1 = 0, b1 = 0, c1 = 0, d1 = 0; ps.forEach((p) => { a1 += p.x; b1 += p.y; c1 += p.x * p.y; d1 += p.x * p.x; });
        const pe = (m * c1 - a1 * b1) / (m * d1 - a1 * a1), or = (b1 - pe * a1) / m;
        const xa = Math.min(...ps.map((p) => p.x)), xb = Math.max(...ps.map((p) => p.x));
        return [{ x: xa, y: pe * xa + or }, { x: xb, y: pe * xb + or }];
      };
      reproductor(tarjeta, {
        desde: 0, hasta: ordenados.length - 1,
        rotulo: (k) => mesLargo(ordenados[k].f),
        alEmpezar: fijar,
        paso: (k) => { const vis = ordenados.slice(0, k + 1); ch.data.datasets[0].data = vis; ch.data.datasets[1].data = recta(vis); ch.update('none'); },
        fin: () => { ch.data.datasets[0].data = pts; ch.data.datasets[1].data = [{ x: x0, y: pend * x0 + ord }, { x: x1, y: pend * x1 + ord }]; animarCambio(ch, 400); }
      });
      alVer(tarjeta, () => {
        animarEntrada(ch);
        contar(tarjeta.querySelector('[data-r2]'), r2, (v) => num(v, 3));
        contar(tarjeta.querySelector('[data-pend]'), pend, (v) => num(v, 3));
        contar(tarjeta.querySelector('[data-n]'), n, (v) => num(Math.round(v), 0));
      });
    } else {
      const series = [{ label: s1.label, data: a, tipo: s1.tipo === 'barras' ? 'bar' : undefined }];
      if (dos) series.push({ label: s2.label, data: b, eje: 'y1', tipo: s2.tipo === 'barras' ? 'bar' : undefined });
      const ch = serieTiempo({ id: 'gGen', titulo: dos ? `${s1.label} y ${s2.label}` : s1.label, unidad: dos ? 'Serie 1 en el eje izquierdo, serie 2 en el derecho' : '', fuente: `CEER en base a ${fuentes}`, ancho: true, alto: true, eje2: dos, etiquetas: false, series }, out);
      if (!ch) { alert('Esas series no tienen datos para graficar.'); return; }
      aplicarFechas();
      const tarjeta = ch.canvas.closest('.grafico');
      // reproductor: la serie avanza mes a mes con los ejes fijos
      const orig = ch.data.datasets.map((ds) => ds.data.slice());
      const i0 = ch.options.scales.x.min ?? 0, i1 = ch.options.scales.x.max ?? (ch.data.labels.length - 1);
      const fijar = () => ['y', 'y1'].forEach((e) => { if (ch.scales[e]) Object.assign(ch.options.scales[e], { min: ch.scales[e].min, max: ch.scales[e].max }); });
      const soltar = () => ['y', 'y1'].forEach((e) => { if (ch.options.scales[e]) { delete ch.options.scales[e].min; delete ch.options.scales[e].max; } });
      reproductor(tarjeta, {
        desde: i0, hasta: i1,
        rotulo: (k) => mesLargo(ch.data.labels[k]),
        alEmpezar: fijar,
        paso: (k) => { ch.data.datasets.forEach((ds, j) => { ds.data = orig[j].map((v, t) => (t <= k ? v : null)); }); ch.update('none'); },
        fin: () => { ch.data.datasets.forEach((ds, j) => { ds.data = orig[j].slice(); }); soltar(); ch.update('none'); }
      });
      alVer(tarjeta, () => animarEntrada(ch));
    }
    out.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ---------------- Datos clave (apertura) ---------------- */
  function claves() {
    const ipcM = m('ipc_mensual'), ipcIA = m('ipc_interanual');
    const u = ultimo(ipcM, S.fm), uia = ultimo(ipcIA, S.fm);
    const emIA = varIA(ix('emae_original')), emM = varM(ix('emae_desest'));
    const ue = ultimo(emIA, S.fm);
    const items = (S.ind && S.ind.items) || [];
    const tc = items.find((i) => i.id === 'tc'), res = items.find((i) => i.id === 'reservas');
    const riesgo = ultimo(S.d.riesgo_pais || [], S.fd);
    const fd = (iso) => { const [y, mm, d] = iso.split('-'); return `${d}/${mm}/${y}`; };
    // Solo se muestran los indicadores que tienen dato.
    const html = [
      u && clave('Inflación mensual (IPC)', pct(u.v), uia ? `Interanual: ${pct(uia.v)}` : '', `INDEC / ${mesLargo(u.f)}`, true),
      ue && clave('Actividad económica (EMAE)', pct(ue.v, 1, true), emM[ue.i] != null ? `Interanual. Mensual desestacionalizada: ${pct(emM[ue.i], 1, true)}` : 'Variación interanual', `INDEC / ${mesLargo(ue.f)}`),
      tc && !tc.error && tc.valor != null && clave('Tipo de cambio mayorista', '$ ' + num(tc.valor, 0), res && !res.error && res.valor != null ? `Reservas: USD ${num(res.valor, 0)} M` : '', `BCRA${tc.periodo ? ' / ' + tc.periodo : ''}`),
      riesgo && clave('Riesgo país', num(riesgo.v, 0), 'Puntos básicos', `Ámbito / ${fd(riesgo.f)}`)
    ].filter(Boolean);
    document.getElementById('claves').innerHTML = html.join('');
    const ahora = new Date();
    document.getElementById('fechaCorte').textContent = `${MESES[ahora.getMonth()]} ${ahora.getFullYear()}`;
  }

  /* ---------------- Carga ---------------- */
  function renderizar() {
    const activo = (location.hash || '#resumen').slice(1);
    graficos.splice(0).forEach((c) => c.destroy());
    aplicarPaleta();
    crearPaneles();
    claves();
    [panelResumen, panelPrecios, panelActividad, panelTrabajo, panelExterno, panelCambio, panelMonetaria, panelBancos, panelGenerador].forEach((fn) => {
      try { fn(); } catch (e) { console.error(fn.name, e); }
    });
    // Nada vacío: sin tarjetas ni gráficos con datos, el bloque no aparece.
    document.querySelectorAll('.estandar').forEach((el) => { if (!el.querySelector('.std')) el.remove(); });
    document.querySelectorAll('.graficos').forEach((el) => { if (!el.children.length && !el.id) el.remove(); });
    document.querySelectorAll('.panel').forEach((el) => {
      if (el.id === 'resumen' || el.id === 'generador' || el.querySelector('.std, .grafico, .estado')) return;
      bloque(el, '<p class="estado">Todavía no hay datos disponibles para esta sección.</p>');
    });
    aplicarFechas();
    if (!S.indecOk) bloque(document.getElementById('precios'), '<p class="estado error">No se pudieron cargar las series del INDEC. Probá de nuevo en unos minutos.</p>');
    mostrar(PANELES.some((p) => p.id === activo) ? activo : 'resumen');
  }

  async function cargar() {
    crearPaneles();
    try {
      const [rJson, rIndec, rInd] = await Promise.all([
        fetch('datos_historicos.json?v=' + Date.now()).then((r) => r.text()),
        fetch('/api?action=getSeriesINDEC').then((r) => r.json()).catch(() => null),
        fetch('/api?action=getIndicadores').then((r) => r.json()).catch(() => null)
      ]);
      const raw = JSON.parse(rJson.replace(/NaN/g, 'null'));
      S.fm = raw.mensual.fecha || []; S.fd = raw.diario.fecha || [];
      const num_ = (a) => (a || []).map((v) => (v == null ? null : Number(v)));
      Object.keys(raw.mensual).forEach((k) => { if (k !== 'fecha') S.m[k] = num_(raw.mensual[k]); });
      Object.keys(raw.diario).forEach((k) => { if (k !== 'fecha') S.d[k] = num_(raw.diario[k]); });
      // El bot completa hacia adelante (ffill) las series que no se actualizaron:
      // se quitan esas colas repetidas para no mostrar datos que no existen.
      ['emae', 'desempleo', 'ipc_mensual', 'ipc_interanual', 'ipc_index', 'rem_interanual'].forEach((k) => {
        const a = S.m[k]; if (!a) return;
        for (let i = a.length - 1; i > 0 && a[i] != null && a[i] === a[i - 1]; i--) a[i] = null;
      });
      // IPC: el último dato oficial es el que informa el BCRA hoy; lo posterior en el JSON no existe.
      const ipcHoy = rInd && rInd.items && rInd.items.find((i) => i.id === 'ipc' && !i.error && i.iso);
      if (ipcHoy) {
        const j = S.fm.indexOf(ipcHoy.iso);
        if (j >= 0) {
          S.m.ipc_mensual[j] = ipcHoy.valor;
          if (ipcHoy.sub) S.m.ipc_interanual[j] = ipcHoy.sub.valor;
          for (let i = j + 1; i < S.fm.length; i++) { S.m.ipc_mensual[i] = null; S.m.ipc_interanual[i] = null; }
        }
      }
      const series = (rIndec && rIndec.series) || {};
      Object.keys(series).forEach((k) => { S.indec[k] = alinear(series[k]); });
      S.ind = { ...series, items: rInd && rInd.items };
      S.indecOk = !!(rIndec && rIndec.success);
      renderizar();
    } catch (e) {
      console.error(e);
      document.getElementById('paneles').innerHTML = '<p class="estado error">No se pudieron cargar los datos del monitor.</p>';
    }
  }

  document.getElementById('btnGenerador').addEventListener('click', () => mostrar('generador'));
  // Botón "atrás" o enlaces con #sección: el panel y el encabezado siguen al hash.
  window.addEventListener('hashchange', () => {
    const id = location.hash.slice(1);
    if (S.fm.length && PANELES.some((p) => p.id === id) && document.documentElement.getAttribute('data-panel') !== id) mostrar(id);
  });
  // Flechas para deslizar las pestañas cuando no entran (como en el IPCEER)
  (function () {
    const nav = document.getElementById('pestanas');
    const izq = document.querySelector('.tabflecha.izq'), der = document.querySelector('.tabflecha.der');
    const act = () => { izq.hidden = nav.scrollLeft <= 2; der.hidden = nav.scrollLeft + nav.clientWidth >= nav.scrollWidth - 2; };
    izq.addEventListener('click', () => nav.scrollBy({ left: -240 }));
    der.addEventListener('click', () => nav.scrollBy({ left: 240 }));
    nav.addEventListener('scroll', act, { passive: true });
    window.addEventListener('resize', act);
    new MutationObserver(act).observe(nav, { childList: true });
    window._actFlechas = act;
  })();
  document.getElementById('btnTema').addEventListener('click', () => {
    const t = temaActual() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', t);
    try { localStorage.setItem('cer-theme', t); } catch (e) {}
    if (S.fm.length) renderizar();
  });
  document.getElementById('desde').addEventListener('change', aplicarFechas);
  document.getElementById('hasta').addEventListener('change', aplicarFechas);
  document.getElementById('limpiarFechas').addEventListener('click', () => { document.getElementById('desde').value = ''; document.getElementById('hasta').value = ''; aplicarFechas(); });
  document.addEventListener('DOMContentLoaded', cargar);
})();
