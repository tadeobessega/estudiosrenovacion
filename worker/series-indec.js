/* ============================================================
   Series históricas del INDEC para el dashboard del CEER
   Fuente: API de Series de Tiempo (apis.datos.gob.ar), que publica
   las series del INDEC sin clave. Se piden agrupadas por frecuencia
   (la API colapsa a la menor frecuencia si se mezclan) y se guardan
   6 horas en KV.
   ============================================================ */

const CACHE_KEY = 'cache:series-indec:v2';
const CACHE_TTL = 6 * 60 * 60;
const API = 'https://apis.datos.gob.ar/series/api/series/';
const DESDE = '2016-01-01';

// clave: [id de la serie, frecuencia, escala opcional]
export const CATALOGO = {
  // Precios
  ipc:              ['148.3_INIVELNAL_DICI_M_26', 'm'],
  ipc_nucleo:       ['148.3_INUCLEONAL_DICI_M_19', 'm'],
  ipc_regulados:    ['148.3_IREGULANAL_DICI_M_22', 'm'],
  ipc_estacionales: ['148.3_IESTACINAL_DICI_M_25', 'm'],
  div_alimentos:    ['146.3_IALIMENNAL_DICI_M_45', 'm'],
  div_bebidas:      ['146.3_IBEBIDANAL_DICI_M_39', 'm'],
  div_vivienda:     ['146.3_IVIVIENNAL_DICI_M_52', 'm'],
  div_salud:        ['146.3_ISALUDNAL_DICI_M_18', 'm'],
  div_transporte:   ['146.3_ITRANSPNAL_DICI_M_23', 'm'],
  div_comunicacion: ['146.3_ICOMUNINAL_DICI_M_27', 'm'],
  div_recreacion:   ['146.3_IRECREANAL_DICI_M_31', 'm'],
  div_educacion:    ['146.3_IEDUCACNAL_DICI_M_22', 'm'],
  div_restaurantes: ['146.3_IRESTAUNAL_DICI_M_33', 'm'],
  div_varios:       ['146.3_IBIENESNAL_DICI_M_36', 'm'],
  linea_pobreza:    ['150.1_LA_POBREZA_0_D_13', 'm'],
  linea_indigencia: ['150.1_LA_INDICIA_0_D_16', 'm'],
  // Actividad
  emae_desest:      ['143.3_NO_PR_2004_A_31', 'm'],
  emae_original:    ['143.3_NO_PR_2004_A_21', 'm'],
  sec_agro:         ['11.3_ISOM_2004_M_39', 'm'],
  sec_pesca:        ['11.3_VIPAA_2004_M_5', 'm'],
  sec_mineria:      ['11.3_ISD_2004_M_26', 'm'],
  sec_industria:    ['11.3_VMASD_2004_M_23', 'm'],
  sec_electricidad: ['11.3_ITC_2004_M_21', 'm'],
  sec_comercio:     ['11.3_AGCS_2004_M_41', 'm'],
  sec_hoteles:      ['11.3_P_2004_M_20', 'm'],
  sec_transporte:   ['11.3_EMC_2004_M_25', 'm'],
  sec_financiera:   ['11.3_IM_2004_M_25', 'm'],
  sec_inmobiliarias:['11.3_SEGA_2004_M_48', 'm'],
  sec_admin:        ['11.3_C_2004_M_60', 'm'],
  sec_ensenanza:    ['11.3_CMMR_2004_M_10', 'm'],
  sec_salud:        ['11.3_HR_2004_M_24', 'm'],
  sec_comunitarios: ['11.3_TAC_2004_M_60', 'm'],
  ipi_desest:       ['453.1_SERIE_DESEADA_0_0_24_58', 'm'],
  ipi_original:     ['453.1_SERIE_ORIGNAL_0_0_14_46', 'm'],
  isac_desest:      ['33.2_ISAC_SIN_EDAD_0_M_23_56', 'm'],
  isac_original:    ['33.2_ISAC_NIVELRAL_0_M_18_63', 'm'],
  // Trabajo e ingresos
  sal_total:        ['149.1_TL_INDIIOS_OCTU_0_21', 'm'],
  sal_registrado:   ['149.1_TL_REGIADO_OCTU_0_16', 'm'],
  sal_privado_reg:  ['149.1_SOR_PRIADO_OCTU_0_25', 'm'],
  sal_publico:      ['149.1_SOR_PUBICO_OCTU_0_14', 'm'],
  sal_no_registrado:['149.1_SOR_PRIADO_OCTU_0_28', 'm'],
  eph_actividad:    ['43.2_ECTAT_0_T_33', 't', 100],
  eph_empleo:       ['44.2_ECTET_0_T_30', 't', 100],
  eph_desocupacion: ['45.2_ECTDT_0_T_33', 't', 100],
  pobreza_personas: ['64.2_POBLACION_NUA_0_0_34_74', 's', 100],
  pobreza_hogares:  ['63.2_HOGARES_PONUA_0_0_33_21', 's', 100],
  // Sector externo (millones de USD)
  expo:             ['74.3_IET_0_M_16', 'm'],
  impo:             ['74.3_IIT_0_M_25', 'm'],
  saldo:            ['74.3_ISC_0_M_19', 'm'],
  expo_pp:          ['75.3_IETPP_0_M_43', 'm'],
  expo_moa:         ['74.3_IEMOA_0_M_48', 'm'],
  expo_moi:         ['74.3_IEMOI_0_M_46', 'm'],
  expo_cye:         ['74.3_IECE_0_M_35', 'm']
};

async function pedir(claves) {
  const ids = claves.map((k) => CATALOGO[k][0]).join(',');
  const r = await fetch(`${API}?ids=${ids}&start_date=${DESDE}&limit=1000&format=json`, {
    headers: { 'user-agent': 'CER-estudiosrenovacion/1.0', accept: 'application/json' }
  });
  if (!r.ok) throw new Error(`Series ${r.status}`);
  const d = await r.json();
  const out = {};
  claves.forEach((k, i) => {
    const escala = CATALOGO[k][2] || 1;
    const fechas = [], valores = [];
    for (const fila of d.data) {
      const v = fila[i + 1];
      if (v == null) continue;
      fechas.push(fila[0].slice(0, 7));
      // Las tasas de la EPH vienen como proporción (0,079): pasan a %.
      valores.push(escala !== 1 && Math.abs(v) < 1 ? v * escala : v);
    }
    out[k] = { f: fechas, v: valores };
  });
  return out;
}

async function construir() {
  const porFrec = { m: [], t: [], s: [] };
  for (const [k, [, frec]] of Object.entries(CATALOGO)) porFrec[frec].push(k);
  const lotes = [];
  for (const [, claves] of Object.entries(porFrec)) {
    for (let i = 0; i < claves.length; i += 20) lotes.push(claves.slice(i, i + 20));
  }
  const res = await Promise.allSettled(lotes.map(pedir));
  const series = {}, errores = [];
  res.forEach((r, i) => (r.status === 'fulfilled' ? Object.assign(series, r.value) : errores.push(lotes[i].join(','))));
  return { generado: new Date().toISOString(), fuente: 'INDEC vía API de Series de Tiempo (datos.gob.ar)', series, errores };
}

export async function getSeriesINDEC(env, { fresh = false } = {}) {
  if (!fresh) {
    const hit = await env.FILES.get(CACHE_KEY, { type: 'json' });
    if (hit) return hit;
  }
  const data = await construir();
  if (!data.errores.length) await env.FILES.put(CACHE_KEY, JSON.stringify(data), { expirationTtl: CACHE_TTL });
  return data;
}
