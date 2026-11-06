/* ============================================================
   Centros de Estudios Renovación — cliente de datos
   Sitio 100% estático (GitHub Pages). Los datos vienen del
   Web App de Google Apps Script del equipo.

   Incluye una caché en sessionStorage (TTL corto) para que la
   navegación entre páginas no vuelva a pegarle al backend en
   cada clic. Las escrituras del panel usan otro archivo y no
   pasan por acá.
   ============================================================ */
(function (global) {
  'use strict';

  // Web App de Apps Script (lectura + escritura del panel).
  var API = 'https://script.google.com/macros/s/AKfycbz0a0VXQPcGS41kWw0-77v51ddlxdTbN0NDhkToZeyMjJlwsleF8yoKkudhcee7sgXv/exec';
  global.CER_API = API;

  // ---- Caché ligera -----------------------------------------
  var CACHE_TTL = 5 * 60 * 1000;      // 5 minutos
  var CACHE_PREFIX = 'cer:cache:';

  function cacheKey(action, params) {
    return CACHE_PREFIX + action + ':' + JSON.stringify(params || {});
  }
  function cacheGet(key) {
    try {
      var raw = sessionStorage.getItem(key);
      if (!raw) return null;
      var box = JSON.parse(raw);
      if (!box || (Date.now() - box.t) > CACHE_TTL) { sessionStorage.removeItem(key); return null; }
      return box.v;
    } catch (e) { return null; }
  }
  function cacheSet(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v: value })); }
    catch (e) { /* cuota llena o modo privado: seguimos sin caché */ }
  }
  function cacheClear() {
    try {
      Object.keys(sessionStorage)
        .filter(function (k) { return k.indexOf(CACHE_PREFIX) === 0; })
        .forEach(function (k) { sessionStorage.removeItem(k); });
    } catch (e) {}
  }

  // ---- Fetch + caché ----------------------------------------
  function fetchJSON(url, tries) {
    return fetch(url)
      .then(function (r) { return r.text(); })
      .then(function (t) {
        var d;
        try { d = JSON.parse(t); }
        catch (e) { throw new Error('El servidor no respondió JSON.'); }
        if (!d || d.success === false) throw new Error((d && d.error) || 'Error del servidor');
        return d;
      })
      .catch(function (err) {
        // Apps Script devuelve páginas de error transitorias: reintentamos.
        if ((tries || 0) < 2) {
          return new Promise(function (res) { setTimeout(res, 900); })
            .then(function () { return fetchJSON(url, (tries || 0) + 1); });
        }
        throw err;
      });
  }

  function apiGet(action, params, opts) {
    opts = opts || {};
    var key = cacheKey(action, params);

    if (!opts.fresh) {
      var hit = cacheGet(key);
      if (hit !== null) return Promise.resolve(hit);
    }

    var qs = new URLSearchParams(Object.assign({ action: action }, params || {}));
    return fetchJSON(API + '?' + qs.toString()).then(function (d) {
      cacheSet(key, d);
      return d;
    });
  }

  function byFechaDesc(a, b) {
    return new Date(b.fecha || b.created_at || 0) - new Date(a.fecha || a.created_at || 0);
  }

  function getReports(centro, opts) {
    return apiGet('getReports', { centro: centro || 'all' }, opts)
      .then(function (d) { return (d.reports || []).slice().sort(byFechaDesc); });
  }
  function getReportById(id, opts) { return apiGet('getReport', { id: id }, opts).then(function (d) { return d.report || null; }); }
  function getFeatured(opts)     { return apiGet('getFeatured', {}, opts).then(function (d) { return (d.reports || []).slice().sort(byFechaDesc); }); }
  function getMiembros(c, opts)  { return apiGet('getMiembros', { centro: c || 'all' }, opts).then(function (d) { return d.miembros || []; }); }
  function getConfig(key, opts)  { return apiGet('getConfig', { key: key }, opts).then(function (d) { return d.value || ''; }); }
  function getUsers(opts)        { return apiGet('getUsers', {}, opts).then(function (d) { return d.users || []; }); }
  function getNotes(only, opts)  { return apiGet('getNotes', { soloAprobadas: only ? 'true' : 'false' }, opts).then(function (d) { return d.notes || []; }); }

  function getNoteById(id, opts) {
    return getNotes(true, opts).then(function (notes) {
      return notes.filter(function (n) { return String(n.id) === String(id); })[0] || null;
    });
  }

  global.CERData = {
    api: API,
    clearCache: cacheClear,
    getReports: getReports,
    getReportById: getReportById,
    getFeatured: getFeatured,
    getMiembros: getMiembros,
    getConfig: getConfig,
    getUsers: getUsers,
    getNotes: getNotes,
    getNoteById: getNoteById
  };
})(window);
