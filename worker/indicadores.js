/* ============================================================
   Monitor económico del CEER (lado servidor)
   - Fuente principal: API oficial del INDEC (api.indec.gob.ar),
     si el Worker tiene el secret INDEC_TOKEN.
   - Respaldo sin clave: BCRA (api.bcra.gob.ar) y la API de
     Series de Tiempo (apis.datos.gob.ar), que tiene algo de atraso.
   El resultado se guarda 3 horas en KV para no golpear las fuentes.
   ============================================================ */

const CACHE_KEY = 'cache:indicadores:v3';
const CACHE_TTL = 3 * 60 * 60;
const INDEC = 'https://api.indec.gob.ar/v1';
const SERIES = 'https://apis.datos.gob.ar/series/api/series/';
const BCRA = 'https://api.bcra.gob.ar/estadisticas/v4.0/monetarias';
const UA = { 'user-agent': 'CER-estudiosrenovacion/1.0', accept: 'application/json' };

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const mesLabel = (anio, mes) => `${MESES[mes - 1]} ${anio}`;
const fromISO = (iso) => { const [y, m] = iso.split('-').map(Number); return { anio: y, mes: m }; };
const diaLabel = (iso) => { const [y, m, d] = iso.slice(0, 10).split('-'); return `${d}/${m}/${y}`; };
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

async function getJSON(url, headers = {}) {
  const r = await fetch(url, { headers: { ...UA, ...headers }, cf: { cacheTtl: 600 } });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return r.json();
}

/* ---------------- INDEC (oficial, con token) ---------------- */
function indec(env) {
  const h = { authorization: 'Bearer ' + env.INDEC_TOKEN };
  return (path) => getJSON(INDEC + path, h);
}
const ultimoPeriodo = (rows) => rows.reduce((m, r) => (String(r.periodo) > m ? String(r.periodo) : m), '');
const periodoMes = (p) => mesLabel(Number(String(p).slice(0, 4)), Number(String(p).slice(4, 6)));
const tipo = (r) => norm(`${r.tipo_de_indicador} ${r.tipo_de_indicador_descripcion || ''}`);
const esInteranual = (r) => /interanual/.test(tipo(r));
const esMensual = (r) => /(intermensual|mensual)/.test(tipo(r)) && !esInteranual(r) && !/acumulad/.test(tipo(r));

async function indecIPC(q, filtroDesc) {
  const rows = await q(`/ipc_nacional?descripcion=ilike.*${filtroDesc}*&order=periodo.desc&limit=300`);
  const nac = rows.filter((r) => /nacional|total/.test(norm(r.region)) || !r.region);
  const p = ultimoPeriodo(nac);
  const ult = nac.filter((r) => String(r.periodo) === p);
  const m = ult.find(esMensual), a = ult.find(esInteranual);
  if (!m) throw new Error('IPC sin variación mensual');
  return { valor: +m.valor, sub: a ? { label: 'interanual', valor: +a.valor } : null, periodo: periodoMes(p) };
}

async function indecEMAE(q) {
  const rows = await q('/estimador-mensual-de-actividad-economica-nivel-general?order=periodo.desc&limit=60');
  const p = ultimoPeriodo(rows);
  const ult = rows.filter((r) => String(r.periodo) === p);
  const m = ult.find((r) => /desestacionaliz/.test(tipo(r)) && esMensual(r));
  const a = ult.find((r) => /original/.test(tipo(r)) && esInteranual(r)) || ult.find(esInteranual);
  if (!m && !a) throw new Error('EMAE sin variaciones');
  return m
    ? { valor: +m.valor, sub: a ? { label: 'interanual', valor: +a.valor } : null, periodo: periodoMes(p), nota: 'desestacionalizado, var. mensual' }
    : { valor: +a.valor, periodo: periodoMes(p), nota: 'var. interanual' };
}

async function indecIPI(q) {
  const rows = await q('/ipi_manufacturero?descripcion=ilike.*nivel general*&order=periodo.desc&limit=60');
  const p = ultimoPeriodo(rows);
  const ult = rows.filter((r) => String(r.periodo) === p);
  const a = ult.find((r) => /original/.test(norm(r.serie)) && esInteranual(r));
  const m = ult.find((r) => /desestacionaliz/.test(norm(r.serie)) && esMensual(r));
  if (!a) throw new Error('IPI sin interanual');
  return { valor: +a.valor, sub: m ? { label: 'mensual desest.', valor: +m.valor } : null, periodo: periodoMes(p) };
}

async function indecSalarios(q) {
  const rows = await q('/indice_salarios?descripcion=ilike.*registrad*&order=periodo.desc&limit=200');
  const tot = rows.filter((r) => !/(privad|public|no registr)/.test(norm(r.descripcion)));
  const p = ultimoPeriodo(tot);
  const ult = tot.filter((r) => String(r.periodo) === p);
  const m = ult.find(esMensual), a = ult.find(esInteranual);
  if (!m) throw new Error('Salarios sin variación mensual');
  return { valor: +m.valor, sub: a ? { label: 'interanual', valor: +a.valor } : null, periodo: periodoMes(p) };
}

async function indecEPH(q) {
  const rows = await q('/mercado_trabajo_eph?order=periodo.desc&limit=40');
  const tot = rows.filter((r) => /total/.test(norm(r.area_geografica_nom)));
  const r = (tot.length ? tot : rows)[0];
  return { valor: +r.tasa_de_desocupacion, periodo: `${r.trimestre}° trim. ${r.anio}`, sub: r.tasa_de_empleo_informal != null ? { label: 'informalidad', valor: +r.tasa_de_empleo_informal, plano: true } : null };
}

async function indecPobreza(q) {
  const rows = await q('/pobreza_eph?order=periodo.desc&limit=40');
  const tot = rows.filter((r) => /total/.test(norm(r.area_geografica_nom)));
  const r = (tot.length ? tot : rows)[0];
  return { valor: +r.tasa_pobreza_personas, periodo: `${r.semestre}° sem. ${r.anio}`, sub: { label: 'indigencia', valor: +r.tasa_indigencia_personas, plano: true } };
}

/* ---------------- Respaldo sin clave ---------------- */
async function serie(ids) {
  const desde = new Date(Date.now() - 800 * 864e5).toISOString().slice(0, 10);
  const d = await getJSON(`${SERIES}?ids=${ids}&start_date=${desde}&limit=1000&format=json`);
  return d.data; // [[fecha, v1, v2...], ...] ordenado ascendente
}
const ultimoNoNulo = (data, col) => { for (let i = data.length - 1; i >= 0; i--) if (data[i][col] != null) return data[i]; return null; };

async function bcra(id) {
  const d = await getJSON(`${BCRA}/${id}?limit=1`);
  const x = d.results[0].detalle[0];
  return { valor: +x.valor, fecha: x.fecha };
}

async function respaldoIPC() {
  const [m, a] = await Promise.all([bcra(27), bcra(28).catch(() => null)]);
  const { anio, mes } = fromISO(m.fecha);
  return { valor: m.valor, sub: a ? { label: 'interanual', valor: a.valor } : null, periodo: mesLabel(anio, mes) };
}
async function respaldoSerieVar(idMensual, idInteranual, notas = {}) {
  const ids = [idMensual && `${idMensual}:percent_change`, idInteranual && `${idInteranual}:percent_change_a_year_ago`].filter(Boolean).join(',');
  const data = await serie(ids);
  const rm = idMensual ? ultimoNoNulo(data, 1) : null;
  const ra = ultimoNoNulo(data, idMensual ? 2 : 1);
  const base = rm || ra;
  if (!base) throw new Error('serie vacía');
  const { anio, mes } = fromISO(base[0]);
  const principal = rm ? rm[1] * 100 : ra[1] * 100;
  const mismo = rm && idInteranual ? data.find((f) => f[0] === rm[0]) : null;
  const sub = mismo && mismo[2] != null ? { label: 'interanual', valor: mismo[2] * 100 } : null;
  return { valor: principal, sub, periodo: mesLabel(anio, mes), ...notas };
}
async function respaldoDesocupacion() {
  const data = await serie('42.3_EPH_PUNTUATAL_0_M_30');
  const r = ultimoNoNulo(data, 1);
  const { anio, mes } = fromISO(r[0]);
  const v = +r[1];
  return { valor: v < 1 ? v * 100 : v, periodo: `${Math.ceil(mes / 3)}° trim. ${anio}` };
}

/* ---------------- Armado ---------------- */
const DEFS = [
  { id: 'ipc', grupo: 'indec', titulo: 'Inflación mensual (IPC)', fmt: 'pct', color: 'inv',
    indec: (q) => indecIPC(q, 'nivel general'), respaldo: respaldoIPC },
  { id: 'nucleo', grupo: 'indec', titulo: 'Inflación núcleo', fmt: 'pct', color: 'inv',
    indec: (q) => indecIPC(q, 'cleo'), respaldo: () => respaldoSerieVar('148.3_INUCLEONAL_DICI_M_19', null) },
  { id: 'emae', grupo: 'indec', titulo: 'Actividad (EMAE)', fmt: 'pct', color: 'dir', signo: true,
    indec: indecEMAE, respaldo: () => respaldoSerieVar('143.3_NO_PR_2004_A_31', '143.3_NO_PR_2004_A_21', { nota: 'desestacionalizado, var. mensual' }) },
  { id: 'ipi', grupo: 'indec', titulo: 'Industria (IPI manufacturero)', fmt: 'pct', color: 'dir', signo: true, nota: 'var. interanual',
    indec: indecIPI, respaldo: () => respaldoSerieVar(null, '453.1_SERIE_ORIGNAL_0_0_14_46', { nota: 'var. interanual' }) },
  { id: 'salarios', grupo: 'indec', titulo: 'Salarios registrados', fmt: 'pct', color: 'dir', signo: true, nota: 'var. mensual',
    indec: indecSalarios, respaldo: () => respaldoSerieVar('149.1_TL_REGIADO_OCTU_0_16', null, { nota: 'var. mensual' }) },
  { id: 'desocupacion', grupo: 'indec', titulo: 'Desocupación', fmt: 'pct', color: 'inv', nivel: true,
    indec: indecEPH, respaldo: respaldoDesocupacion },
  { id: 'pobreza', grupo: 'indec', titulo: 'Pobreza (personas)', fmt: 'pct', color: 'inv', nivel: true,
    indec: indecPobreza, respaldo: null },
  { id: 'tc', grupo: 'bcra', titulo: 'Tipo de cambio mayorista', fmt: 'ars', diario: 5 },
  { id: 'reservas', grupo: 'bcra', titulo: 'Reservas internacionales', fmt: 'usd_mm', diario: 1 },
  { id: 'tamar', grupo: 'bcra', titulo: 'Tasa TAMAR', fmt: 'pct', nivel: true, diario: 45 },
  { id: 'rem', grupo: 'bcra', titulo: 'Inflación esperada (REM, 12 meses)', fmt: 'pct', nivel: true, mensual: 29 }
];

async function construir(env) {
  const q = env.INDEC_TOKEN ? indec(env) : null;
  const tareas = DEFS.map(async (d) => {
    const base = { id: d.id, grupo: d.grupo, titulo: d.titulo, fmt: d.fmt, color: d.color || null, signo: !!d.signo, nivel: !!d.nivel, nota: d.nota || null };
    try {
      if (d.diario || d.mensual) {
        const x = await bcra(d.diario || d.mensual);
        const { anio, mes } = fromISO(x.fecha);
        return { ...base, valor: x.valor, periodo: d.diario ? `al ${diaLabel(x.fecha)}` : mesLabel(anio, mes), fuente: 'BCRA' };
      }
      if (q) {
        try { return { ...base, ...(await d.indec(q)), fuente: 'INDEC' }; }
        catch (e) { if (!d.respaldo) throw e; }
      }
      if (!d.respaldo) return null;
      return { ...base, ...(await d.respaldo()), fuente: d.id === 'ipc' ? 'INDEC vía BCRA' : 'INDEC vía datos.gob.ar' };
    } catch (e) {
      return { ...base, error: String(e.message || e).slice(0, 160) };
    }
  });
  const items = (await Promise.all(tareas)).filter(Boolean);
  return { generado: new Date().toISOString(), indecApi: !!q, items };
}

export async function getIndicadores(env, { fresh = false } = {}) {
  if (!fresh) {
    const hit = await env.FILES.get(CACHE_KEY, { type: 'json' });
    if (hit) return hit;
  }
  const data = await construir(env);
  const sanos = data.items.filter((i) => !i.error).length;
  if (sanos >= 4) await env.FILES.put(CACHE_KEY, JSON.stringify(data), { expirationTtl: CACHE_TTL });
  return data;
}

/* Muestra de filas crudas del INDEC (para depurar los filtros; sólo admin). */
export async function indecMuestra(env, tabla) {
  if (!env.INDEC_TOKEN) return { error: 'Falta el secret INDEC_TOKEN' };
  return indec(env)(`/${tabla}?order=periodo.desc&limit=12`);
}
