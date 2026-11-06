/* ============================================================
   Monitor económico del CEER
   - Series del BCRA, Ámbito, NY Fed y BLS: datos_historicos.json
     (lo arma bot_monetario.py).
   - Series del INDEC: /api?action=getSeriesINDEC (Worker del sitio).
   - Últimos valores diarios: /api?action=getIndicadores.
   ============================================================ */
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
  const mesLargo = (ym) => { const [y, m] = ym.split('-'); return `${MESES[+m - 1]} ${y}`; };
  const mesCorto = (ym) => { const [y, m] = ym.split('-'); return `${MES3[+m - 1]} ${y.slice(2)}`; };
  const trimestre = (ym) => { const [y, m] = ym.split('-'); return `${Math.ceil(+m / 3)}T ${y}`; };
  // La serie semestral de la EPH viene fechada al mes siguiente al cierre del semestre (2025-01 = 2.º semestre 2024).
  const semestre = (ym) => { let [y, m] = ym.split('-').map(Number); m -= 6; if (m < 1) { m += 12; y -= 1; } return `${m <= 6 ? 1 : 2}S ${y}`; };
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
    const ejeTicks = { font: { family: MONO, size: 11 }, color: C.sec, maxTicksLimit: 6, callback: (v) => fmtY(v) };
    const scales = {
      x: { type: 'category', grid: { display: false }, border: { color: C.grilla }, ticks: { font: { family: MONO, size: 11 }, color: C.sec, maxRotation: 0, autoSkip: true, maxTicksLimit: 8, callback: function (v) { const l = this.getLabelForValue(v); return (cfg.formatoX || mesCorto)(l); } } },
      y: { stacked: !!cfg.apilado, grid: { color: C.grilla }, border: { display: false }, ticks: ejeTicks, beginAtZero: !!cfg.desdeCero }
    };
    if (cfg.eje2) scales.y1 = { position: 'right', grid: { display: false }, border: { display: false }, ticks: { ...ejeTicks, callback: (v) => (cfg.formatoY2 || fmtY)(v) } };
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
    cont.appendChild(tarjetaGrafico(cfg));
    const filas = cfg.filas.filter((f) => f.v != null && isFinite(f.v)).sort((a, b) => b.v - a.v);
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
      const inicioDatos = Math.max(0, ...ch.data.datasets.map((ds) => ds.data.findIndex((v) => v != null)).filter((i) => i >= 0));
      const desde = d || cfg.desde || labels[inicioDatos];
      let i0 = labels.findIndex((l) => l >= desde.slice(0, l.length));
      if (i0 < 0) i0 = 0;
      i0 = Math.max(i0, d ? 0 : inicioDatos);
      let i1 = labels.length - 1;
      if (h) { const j = labels.map((l) => l <= h.slice(0, l.length)).lastIndexOf(true); if (j >= 0) i1 = j; }
      else { const ult = Math.max(...ch.data.datasets.map((ds) => { for (let i = ds.data.length - 1; i >= 0; i--) if (ds.data[i] != null) return i; return -1; })); if (ult >= 0) i1 = ult; }
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
    return `<div class="std"><span class="rotulo">${rotulo}</span><span class="cifra">${cifra}</span><span class="var">${variacion || ''}</span><span class="fuente">${fuente}</span></div>`;
  }
  const varSpan = (v, sufijo, invertir) => {
    if (v == null || !isFinite(v)) return '';
    const bueno = invertir ? v < 0 : v > 0;
    return `<span class="${bueno ? 'sube' : 'baja'}">${flecha(v)} ${pct(Math.abs(v), 1)}</span> ${sufijo}`;
  };

  /* ---------------- Paneles ---------------- */
  const PANELES = [
    { id: 'precios', nombre: 'Precios' },
    { id: 'actividad', nombre: 'Actividad' },
    { id: 'trabajo', nombre: 'Trabajo e ingresos' },
    { id: 'externo', nombre: 'Sector externo' },
    { id: 'cambio', nombre: 'Tipo de cambio' },
    { id: 'monetaria', nombre: 'Política monetaria' },
    { id: 'bancos', nombre: 'Bancos' },
    { id: 'generador', nombre: 'Generador de gráficos', aparte: true }
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
    document.getElementById('seccionActual').textContent = p.nombre;
    document.getElementById('btnGenerador').classList.toggle('activa', id === 'generador');
    document.querySelectorAll('.pestana').forEach((b) => b.classList.toggle('activa', b.dataset.panel === id));
    document.querySelectorAll('.panel').forEach((p) => p.classList.toggle('activo', p.id === id));
    history.replaceState(null, '', '#' + id);
    const b = document.querySelector(`.pestana[data-panel="${id}"]`);
    if (b) b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (window._actFlechas) window._actFlechas();
    graficos.forEach((c) => c.resize());
    window.scrollTo({ top: Math.min(window.scrollY, document.getElementById('paneles').offsetTop - 120), behavior: 'smooth' });
  }
  const bloque = (panel, html) => { const d = document.createElement('div'); d.innerHTML = html; while (d.firstChild) panel.appendChild(d.firstChild); };
  const grilla = (panel) => { const g = document.createElement('div'); g.className = 'graficos'; panel.appendChild(g); return g; };
  const titulo = (panel, t, intro) => bloque(panel, `<h2>${t}</h2>${intro ? `<p class="intro">${intro}</p>` : ''}`);

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

  /* ---- Generador ---- */
  function diccionario() {
    const D = {
      ipc_mensual: ['Inflación mensual (%)', () => m('ipc_mensual'), 'INDEC'],
      ipc_interanual: ['Inflación interanual (%)', () => m('ipc_interanual'), 'INDEC'],
      ipc_nucleo: ['Inflación núcleo mensual (%)', () => varM(ix('ipc_nucleo')), 'INDEC'],
      ipc_regulados: ['Inflación de regulados mensual (%)', () => varM(ix('ipc_regulados')), 'INDEC'],
      ipc_estacionales: ['Inflación de estacionales mensual (%)', () => varM(ix('ipc_estacionales')), 'INDEC'],
      rem_interanual: ['Inflación esperada a 12 meses, REM (%)', () => m('rem_interanual'), 'BCRA'],
      cbt_ia: ['Canasta básica total, var. interanual (%)', () => varIA(ix('linea_pobreza')), 'INDEC'],
      emae: ['EMAE desestacionalizado (índice)', () => ix('emae_desest'), 'INDEC'],
      emae_ia: ['EMAE, var. interanual (%)', () => varIA(ix('emae_original')), 'INDEC'],
      ipi_ia: ['Industria (IPI), var. interanual (%)', () => varIA(ix('ipi_original')), 'INDEC'],
      isac_ia: ['Construcción (ISAC), var. interanual (%)', () => varIA(ix('isac_original')), 'INDEC'],
      sal_reg_ia: ['Salario registrado, var. interanual (%)', () => varIA(ix('sal_registrado')), 'INDEC'],
      expo: ['Exportaciones (millones de USD)', () => ix('expo'), 'INDEC'],
      impo: ['Importaciones (millones de USD)', () => ix('impo'), 'INDEC'],
      saldo: ['Saldo comercial (millones de USD)', () => ix('saldo'), 'INDEC'],
      tc_mayorista: ['Tipo de cambio mayorista (nominal)', () => nom('tc_mayorista'), 'BCRA'],
      tc_mayorista_var: ['Devaluación mensual (%)', () => m('tc_mayorista_var'), 'BCRA'],
      dolar_blue: ['Dólar blue (nominal)', () => nom('dolar_blue'), 'Ámbito'],
      dolar_mep: ['Dólar MEP (nominal)', () => nom('dolar_mep'), 'Ámbito'],
      dolar_ccl: ['Dólar CCL (nominal)', () => nom('dolar_ccl'), 'Ámbito'],
      brecha_blue: ['Brecha blue (%)', () => m('brecha_blue'), 'BCRA y Ámbito'],
      itcrm: ['Tipo de cambio real multilateral', () => m('itcrm'), 'BCRA'],
      riesgo_pais: ['Riesgo país (pb)', () => m('riesgo_pais'), 'Ámbito'],
      reservas: ['Reservas brutas (USD constantes)', () => m('reservas'), 'BCRA'],
      compra_divisas: ['Compras de divisas del BCRA (USD constantes)', () => m('compra_divisas'), 'BCRA'],
      base_monetaria: ['Base monetaria (pesos constantes)', () => m('base_monetaria'), 'BCRA'],
      m2: ['M2 (pesos constantes)', () => m('m2'), 'BCRA'],
      tamar_tea: ['TAMAR (TEA %)', () => m('tamar_tea'), 'BCRA'],
      badlar_tea: ['BADLAR (TEA %)', () => m('badlar_tea'), 'BCRA'],
      plazo_fijo: ['Plazos fijos (pesos constantes)', () => m('plazo_fijo'), 'BCRA'],
      personales: ['Préstamos personales (pesos constantes)', () => m('personales'), 'BCRA'],
      tarjetas: ['Préstamos con tarjeta (pesos constantes)', () => m('tarjetas'), 'BCRA'],
      depositos_usd: ['Depósitos en dólares (nominal)', () => nom('depositos_usd'), 'BCRA'],
      tasa_fed: ['Tasa de la FED (%)', () => m('tasa_fed'), 'NY Fed']
    };
    return D;
  }

  function panelGenerador() {
    const P = document.getElementById('generador');
    const D = diccionario();
    const opciones = '<option value="">Elegí una serie</option>' + Object.entries(D).map(([k, [l]]) => `<option value="${k}">${esc(l)}</option>`).join('');
    titulo(P, 'Generador de gráficos', 'Elegí una o dos series para verlas juntas en el tiempo o en un diagrama de dispersión con su recta de regresión.');
    bloque(P, `<div class="generador">
      <div class="gen-opciones">
        <label><input type="radio" name="genModo" value="tiempo" checked> Serie de tiempo</label>
        <label><input type="radio" name="genModo" value="dispersion"> Dispersión (X contra Y)</label>
        <label><input type="checkbox" id="genDos" checked> Comparar con una segunda serie</label>
      </div>
      <div class="gen-fila">
        <div class="gen-caja"><h4>Serie 1 (eje Y)</h4><label for="genS1">Serie</label><select id="genS1">${opciones}</select>
          <label for="genT1">Tipo</label><select id="genT1"><option value="linea">Línea</option><option value="barras">Barras</option></select></div>
        <div class="gen-caja" id="genCaja2"><h4>Serie 2 (eje derecho o X)</h4><label for="genS2">Serie</label><select id="genS2">${opciones}</select>
          <label for="genT2">Tipo</label><select id="genT2"><option value="linea">Línea</option><option value="barras">Barras</option></select></div>
      </div>
      <button type="button" class="btn" id="genDibujar">Dibujar</button>
    </div><div class="graficos" id="genSalida"></div>`);
    const caja2 = document.getElementById('genCaja2');
    const sync = () => {
      const disp = document.querySelector('input[name="genModo"]:checked').value === 'dispersion';
      if (disp) document.getElementById('genDos').checked = true;
      document.getElementById('genDos').disabled = disp;
      caja2.classList.toggle('apagada', !document.getElementById('genDos').checked);
    };
    P.querySelectorAll('input').forEach((i) => i.addEventListener('change', sync));
    document.getElementById('genDibujar').addEventListener('click', () => dibujarGenerador(D));
  }

  function dibujarGenerador(D) {
    const k1 = document.getElementById('genS1').value, k2 = document.getElementById('genS2').value;
    const dos = document.getElementById('genDos').checked;
    const disp = document.querySelector('input[name="genModo"]:checked').value === 'dispersion';
    if (!k1 || (dos && !k2)) { alert('Elegí las series que querés graficar.'); return; }
    const out = document.getElementById('genSalida');
    const prev = Chart.getChart('gGen'); if (prev) { graficos.splice(graficos.indexOf(prev), 1); prev.destroy(); }
    out.innerHTML = '';
    const fuentes = [...new Set([D[k1][2], dos ? D[k2][2] : null].filter(Boolean))].join(', ');
    const a = D[k1][1](), b = dos ? D[k2][1]() : null;
    if (disp) {
      const pts = [];
      a.forEach((v, i) => { if (v != null && b[i] != null) pts.push({ x: b[i], y: v, f: S.fm[i] }); });
      if (pts.length < 3) { alert('Las dos series casi no coinciden en el tiempo.'); return; }
      const n = pts.length; let sx = 0, sy = 0, sxy = 0, sxx = 0, syy = 0;
      pts.forEach((p) => { sx += p.x; sy += p.y; sxy += p.x * p.y; sxx += p.x * p.x; syy += p.y * p.y; });
      const pend = (n * sxy - sx * sy) / (n * sxx - sx * sx), ord = (sy - pend * sx) / n;
      const r2 = Math.pow((n * sxy - sx * sy) / Math.sqrt((n * sxx - sx * sx) * (n * syy - sy * sy)), 2) || 0;
      const xs = pts.map((p) => p.x), x0 = Math.min(...xs), x1 = Math.max(...xs);
      out.appendChild(tarjetaGrafico({ id: 'gGen', titulo: `${D[k1][0]} y ${D[k2][0]}`, unidad: `Observaciones mensuales; R² = ${num(r2, 3)}`, fuente: `CEER en base a ${fuentes}`, ancho: true, alto: true }));
      const ch = new Chart(document.getElementById('gGen'), {
        type: 'scatter',
        data: { datasets: [
          { label: 'Observaciones', data: pts, backgroundColor: C.puntos, pointRadius: 3.5 },
          { type: 'line', label: 'Regresión', data: [{ x: x0, y: pend * x0 + ord }, { x: x1, y: pend * x1 + ord }], borderColor: C.ambar, borderWidth: 2, pointRadius: 0 }
        ] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, etiquetasFinales: { activo: false }, tooltip: { backgroundColor: C.tooltip, cornerRadius: 0, callbacks: { label: (it) => (it.raw.f ? ` ${mesLargo(it.raw.f)}: (${num(it.raw.x, 2)}; ${num(it.raw.y, 2)})` : '') } } },
          scales: { x: { title: { display: true, text: D[k2][0] }, grid: { color: C.grilla }, ticks: { font: { family: MONO, size: 11 }, callback: (v) => compacto(v) } }, y: { title: { display: true, text: D[k1][0] }, grid: { color: C.grilla }, ticks: { font: { family: MONO, size: 11 }, callback: (v) => compacto(v) } } } }
      });
      ch.$cfg = { serieTiempo: false }; graficos.push(ch);
    } else {
      const series = [{ label: D[k1][0], data: a, tipo: document.getElementById('genT1').value === 'barras' ? 'bar' : undefined }];
      if (dos) series.push({ label: D[k2][0], data: b, eje: 'y1', tipo: document.getElementById('genT2').value === 'barras' ? 'bar' : undefined });
      serieTiempo({ id: 'gGen', titulo: dos ? `${D[k1][0]} y ${D[k2][0]}` : D[k1][0], unidad: dos ? 'Serie 1 en el eje izquierdo, serie 2 en el derecho' : '', fuente: `CEER en base a ${fuentes}`, ancho: true, alto: true, eje2: dos, etiquetas: false, series }, out);
      aplicarFechas();
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
    const html = [
      clave('Inflación mensual (IPC)', u ? pct(u.v) : '<span class="sin-dato">sin datos aún</span>', uia ? `Interanual: ${pct(uia.v)}` : '', `INDEC / ${u ? mesLargo(u.f) : ''}`, true),
      clave('Actividad económica (EMAE)', ue ? pct(ue.v, 1, true) : '<span class="sin-dato">sin datos aún</span>', ue && emM[ue.i] != null ? `Interanual. Mensual desestacionalizada: ${pct(emM[ue.i], 1, true)}` : 'Variación interanual', `INDEC / ${ue ? mesLargo(ue.f) : ''}`),
      clave('Tipo de cambio mayorista', tc && !tc.error ? '$ ' + num(tc.valor, 0) : '<span class="sin-dato">sin datos aún</span>', res && !res.error ? `Reservas: USD ${num(res.valor, 0)} M` : '', `BCRA / ${tc && tc.periodo ? tc.periodo : ''}`),
      clave('Riesgo país', riesgo ? num(riesgo.v, 0) : '<span class="sin-dato">sin datos aún</span>', 'Puntos básicos', `Ámbito / ${riesgo ? fd(riesgo.f) : ''}`)
    ];
    document.getElementById('claves').innerHTML = html.join('');
    const ahora = new Date();
    document.getElementById('fechaCorte').textContent = `${MESES[ahora.getMonth()]} ${ahora.getFullYear()}`;
  }

  /* ---------------- Carga ---------------- */
  function renderizar() {
    const activo = (location.hash || '#precios').slice(1);
    graficos.splice(0).forEach((c) => c.destroy());
    aplicarPaleta();
    crearPaneles();
    claves();
    [panelPrecios, panelActividad, panelTrabajo, panelExterno, panelCambio, panelMonetaria, panelBancos, panelGenerador].forEach((fn) => {
      try { fn(); } catch (e) { console.error(fn.name, e); }
    });
    aplicarFechas();
    if (!S.indecOk) bloque(document.getElementById('precios'), '<p class="estado error">No se pudieron cargar las series del INDEC. Probá de nuevo en unos minutos.</p>');
    mostrar(PANELES.some((p) => p.id === activo) ? activo : 'precios');
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
