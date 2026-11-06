/* ============================================================
   ciclica-data.js — cliente de datos de Cíclica (Supabase)

   Requiere que se cargue antes el SDK de Supabase:
   <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js"></script>

   Completá las dos constantes de abajo con los datos del proyecto
   (Supabase → Project Settings → API). La anon key es pública: va
   en el código del sitio, la seguridad la hacen las policies (RLS).
   ============================================================ */
(function (global) {
  'use strict';

  var SUPABASE_URL  = 'https://fllrpsufmhtpxgermjeo.supabase.co';
  var SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZsbHJwc3VmbWh0cHhnZXJtamVvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkwNDAyMDYsImV4cCI6MjEwNDYxNjIwNn0.yC9DGLQTSTn4vDdFWagPdZ3zj7XUdEhDp6p8gMRS4eA';

  var CENTROS = ['CEER', 'CEEIR', 'CEDHyS', 'OPSA', 'OPAL', 'OPER', 'CIREN'];

  var LIST_COLS =
    'id,titulo,subtitulo,bajada,autor,centros,imagen_url,estado,destacada,fecha_publicacion,created_at';
  var FULL_COLS = LIST_COLS + ',cuerpo_html,email_autor,doc_url,updated_at';

  var _sb = null;
  function sb() {
    if (_sb) return _sb;
    if (!SUPABASE_URL || !SUPABASE_ANON || !global.supabase) return null;
    _sb = global.supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        storageKey: 'ciclica-auth',
        // Lock "pasa-manos": evita el cuelgue conocido de supabase-js cuando
        // se encadena una consulta justo después de signIn (Navigator LockManager).
        lock: function (_name, _acquireTimeout, fn) { return fn(); }
      }
    });
    return _sb;
  }
  function configured() { return !!sb(); }
  function need() {
    var c = sb();
    if (!c) throw new Error('Cíclica todavía no está conectada a la base.');
    return c;
  }

  function unwrap(res) {
    if (res.error) throw new Error(res.error.message || 'Error de la base');
    return res.data;
  }

  // ---------- Lectura pública ----------
  function listaPublicadas() {
    return need()
      .from('notas')
      .select(LIST_COLS)
      .eq('estado', 'publicada')
      .order('fecha_publicacion', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
      .then(unwrap);
  }

  function destacadas(limit) {
    return need()
      .from('notas')
      .select(LIST_COLS)
      .eq('estado', 'publicada')
      .eq('destacada', true)
      .order('fecha_publicacion', { ascending: false, nullsFirst: false })
      .limit(limit || 3)
      .then(unwrap);
  }

  function getNota(id) {
    return need()
      .from('notas')
      .select(FULL_COLS)
      .eq('id', id)
      .eq('estado', 'publicada')
      .maybeSingle()
      .then(unwrap);
  }

  // ---------- Envío público (formulario) ----------
  // payload: { titulo, autor, email_autor, bajada, centros[], cuerpo_html?, doc_url? }
  // Nota: el visitante anónimo NO puede leer borradores, así que el insert
  // no pide la fila de vuelta (con `.select()` PostgREST fallaría al releerla).
  function crearBorrador(payload) {
    var row = {
      titulo:      (payload.titulo || '').trim(),
      autor:       (payload.autor || '').trim(),
      email_autor: (payload.email_autor || '').trim(),
      bajada:      (payload.bajada || '').trim() || null,
      centros:     Array.isArray(payload.centros) ? payload.centros : [],
      cuerpo_html: payload.cuerpo_html || null,
      doc_url:     payload.doc_url || null,
      estado:      'borrador',
      destacada:   false
    };
    return need().from('notas').insert(row).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      return true;
    });
  }

  function subirDocPublico(file) {
    var ext = (file.name.split('.').pop() || 'docx').toLowerCase();
    var path = 'propuestas/' + _uuid() + '.' + ext;
    return need().storage.from('notas-docs')
      .upload(path, file, { contentType: file.type, upsert: false })
      .then(function (res) { if (res.error) throw new Error(res.error.message); return path; });
  }

  // ---------- Auth (redacción) ----------
  function signIn(email, password) {
    return need().auth.signInWithPassword({ email: email, password: password }).then(function (r) {
      if (r.error) throw new Error(r.error.message);
      return r.data.user;
    });
  }
  function signOut() { return need().auth.signOut(); }
  function soyEditor() {
    return need().rpc('es_editor').then(function (r) {
      if (r.error) {
        // función ausente = el SQL de la allowlist no se corrió
        if (String(r.error.message || '').indexOf('es_editor') > -1) {
          throw new Error('Falta correr el SQL de la lista de editores (función es_editor).');
        }
        throw new Error(r.error.message || 'No se pudo verificar permisos.');
      }
      return !!r.data;
    });
  }
  function currentUser() {
    var c = sb();
    if (!c) return Promise.resolve(null);
    return c.auth.getUser().then(function (r) { return (r.data && r.data.user) || null; });
  }
  function onAuthChange(cb) {
    var c = sb();
    if (!c) return function () {};
    var sub = c.auth.onAuthStateChange(function (_e, session) { cb(session ? session.user : null); });
    return function () { sub.data.subscription.unsubscribe(); };
  }

  // ---------- Gestión (redacción, requiere sesión) ----------
  function listaTodas(opts) {
    opts = opts || {};
    var q = need().from('notas').select(LIST_COLS);
    if (opts.estado && opts.estado !== 'todas') q = q.eq('estado', opts.estado);
    return q
      .order('updated_at', { ascending: false })
      .then(unwrap);
  }

  function getNotaAdmin(id) {
    return need().from('notas').select(FULL_COLS).eq('id', id).single().then(unwrap);
  }

  function guardarNota(id, patch) {
    var clean = {};
    ['titulo','subtitulo','bajada','cuerpo_html','autor','email_autor','centros',
     'imagen_url','doc_url','estado','destacada','fecha_publicacion'
    ].forEach(function (k) { if (k in patch) clean[k] = patch[k]; });
    return need().from('notas').update(clean).eq('id', id).select(FULL_COLS).single().then(unwrap);
  }

  function crearNotaAdmin(patch) {
    var row = Object.assign({ estado: 'borrador', destacada: false, centros: [] }, patch);
    return need().from('notas').insert(row).select(FULL_COLS).single().then(unwrap);
  }

  function publicarNota(id, fecha) {
    return guardarNota(id, {
      estado: 'publicada',
      fecha_publicacion: fecha || new Date().toISOString().slice(0, 10)
    });
  }
  function despublicarNota(id) { return guardarNota(id, { estado: 'en_edicion' }); }
  function setDestacada(id, val) { return guardarNota(id, { destacada: !!val }); }
  function eliminarNota(id) {
    return need().from('notas').delete().eq('id', id).then(function (r) {
      if (r.error) throw new Error(r.error.message); return true;
    });
  }

  function subirImagen(file) {
    var ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
    var path = 'notas/' + _uuid() + '.' + ext;
    return need().storage.from('notas-img')
      .upload(path, file, { contentType: file.type, upsert: false })
      .then(function (res) {
        if (res.error) throw new Error(res.error.message);
        return need().storage.from('notas-img').getPublicUrl(path).data.publicUrl;
      });
  }

  function urlFirmadaDoc(path, segundos) {
    return need().storage.from('notas-docs')
      .createSignedUrl(path, segundos || 3600)
      .then(function (r) { if (r.error) throw new Error(r.error.message); return r.data.signedUrl; });
  }

  function _uuid() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'xxxxxxxxxxxx4xxx'.replace(/x/g, function () { return (Math.random() * 16 | 0).toString(16); }) + Date.now().toString(16);
  }

  global.CiclicaData = {
    CENTROS: CENTROS,
    configured: configured,
    // público
    listaPublicadas: listaPublicadas,
    destacadas: destacadas,
    getNota: getNota,
    crearBorrador: crearBorrador,
    subirDocPublico: subirDocPublico,
    // auth
    signIn: signIn,
    signOut: signOut,
    soyEditor: soyEditor,
    currentUser: currentUser,
    onAuthChange: onAuthChange,
    // gestión
    listaTodas: listaTodas,
    getNotaAdmin: getNotaAdmin,
    guardarNota: guardarNota,
    crearNotaAdmin: crearNotaAdmin,
    publicarNota: publicarNota,
    despublicarNota: despublicarNota,
    setDestacada: setDestacada,
    eliminarNota: eliminarNota,
    subirImagen: subirImagen,
    urlFirmadaDoc: urlFirmadaDoc
  };
})(window);
