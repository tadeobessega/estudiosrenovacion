/* ============================================================
   Centros de Estudios Renovación: Worker de Cloudflare
   - Sirve el sitio estático (dist/) vía el binding ASSETS.
   - /api        API de datos sobre D1 (reemplaza al Apps Script + Sheets).
   - /files/:key PDF subidos desde el panel (Workers KV).

   La API respeta las mismas acciones y formas de respuesta que el
   Apps Script anterior ({ success, reports }, { success, user }, …),
   así el front cambió lo mínimo. Las escrituras exigen sesión.
   ============================================================ */
import SEED_SQL from './sql/seed.sql';
import { getIndicadores, indecMuestra } from './indicadores.js';
import { getSeriesINDEC } from './series-indec.js';

const SESSION_DAYS = 14;
const MAX_PDF_BYTES = 24 * 1024 * 1024; // KV admite hasta 25 MiB por valor
const PBKDF2_ITER = 100000;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return handleApi(request, env, url);
    if (url.pathname.startsWith('/files/')) return serveFile(env, url);
    return env.ASSETS.fetch(request);
  }
};

/* ---------------- utilidades ---------------- */
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const ok = (data = {}) => json({ success: true, ...data });
const fail = (error, status = 400) => json({ success: false, error }, status);

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const fromHex = (h) => new Uint8Array(h.match(/.{2}/g).map((x) => parseInt(x, 16)));
const randomHex = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));

async function hashPassword(password, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: PBKDF2_ITER }, key, 256);
  return hex(bits);
}
function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

const toReport = (r) => r && ({ ...r, destacado: !!r.destacado });
const toUser = (u) => u && ({ email: u.email, centro: u.centro || '', approved: !!u.approved, role: u.role || 'user' });

/* Siembra inicial: los datos que venían de la planilla (una sola vez). */
let seeded = false;
async function ensureSeed(db) {
  if (seeded) return;
  const row = await db.prepare("SELECT value FROM config WHERE key = 'seeded'").first();
  if (!row) {
    // Una sentencia por línea; exec() las corre en una sola llamada a D1.
    const sql = SEED_SQL.split('\n').filter((l) => l.trim() && !l.trim().startsWith('--')).join('\n');
    await db.exec(sql);
    await db.prepare("INSERT OR REPLACE INTO config (key, value) VALUES ('seeded', ?)").bind(new Date().toISOString()).run();
  }
  seeded = true;
}

async function readParams(request, url) {
  const p = Object.fromEntries(url.searchParams);
  if (request.method === 'POST') {
    const type = request.headers.get('content-type') || '';
    if (type.includes('multipart/form-data')) {
      const fd = await request.formData();
      for (const [k, v] of fd.entries()) p[k] = v;
    } else {
      const text = await request.text();
      if (text) { try { Object.assign(p, JSON.parse(text)); } catch (e) { /* cuerpo no JSON */ } }
    }
  }
  return p;
}

async function currentUser(request, db) {
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!token) return null;
  const row = await db.prepare(
    'SELECT u.* FROM sessions s JOIN users u ON u.email = s.email WHERE s.token = ? AND s.expires_at > ?'
  ).bind(token, Date.now()).first();
  return row && row.approved ? row : null;
}

/* ---------------- API ---------------- */
async function handleApi(request, env, url) {
  const db = env.DB;
  try {
    await ensureSeed(db);
    const p = await readParams(request, url);
    const action = p.action || url.pathname.split('/')[2] || '';

    // ---- Lecturas públicas ----
    switch (action) {
      case 'getReports': {
        const centro = p.centro && p.centro !== 'all' ? p.centro : null;
        const q = centro
          ? db.prepare('SELECT * FROM reports WHERE centro = ? ORDER BY fecha DESC').bind(centro)
          : db.prepare('SELECT * FROM reports ORDER BY fecha DESC');
        const { results } = await q.all();
        return ok({ reports: results.map(toReport) });
      }
      case 'getReport': {
        const r = await db.prepare('SELECT * FROM reports WHERE id = ?').bind(p.id || '').first();
        return r ? ok({ report: toReport(r) }) : fail('Informe no encontrado', 404);
      }
      case 'getFeatured': {
        const { results } = await db.prepare('SELECT * FROM reports WHERE destacado = 1 ORDER BY fecha DESC').all();
        return ok({ reports: results.map(toReport) });
      }
      case 'getMiembros': {
        const centro = p.centro && p.centro !== 'all' ? p.centro : null;
        const q = centro
          ? db.prepare('SELECT * FROM miembros WHERE centro = ? ORDER BY orden, nombre').bind(centro)
          : db.prepare('SELECT * FROM miembros ORDER BY centro, orden, nombre');
        const { results } = await q.all();
        return ok({ miembros: results });
      }
      case 'getSeriesINDEC':
        return json({ success: true, ...(await getSeriesINDEC(env)) }, 200);
      case 'getIndicadores':
        return json({ success: true, ...(await getIndicadores(env)) }, 200);
      case 'getConfig': {
        if (p.key === 'seeded') return ok({ key: p.key, value: '' });
        const r = await db.prepare('SELECT value FROM config WHERE key = ?').bind(p.key || '').first();
        return ok({ key: p.key, value: r ? r.value : '' });
      }
      case 'login': {
        const email = String(p.email || '').trim().toLowerCase();
        const u = await db.prepare('SELECT * FROM users WHERE lower(email) = ?').bind(email).first();
        if (!u || !u.password_hash) return fail('Usuario o contraseña incorrectos', 401);
        const h = await hashPassword(String(p.password || ''), u.salt);
        if (!safeEqual(h, u.password_hash)) return fail('Usuario o contraseña incorrectos', 401);
        if (!u.approved) return fail('Tu cuenta todavía no fue aprobada por un administrador', 403);
        const token = randomHex(32);
        await db.batch([
          db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()),
          db.prepare('INSERT INTO sessions (token, email, expires_at) VALUES (?, ?, ?)')
            .bind(token, u.email, Date.now() + SESSION_DAYS * 864e5)
        ]);
        return ok({ user: { ...toUser(u), token } });
      }
      case 'register': {
        const email = String(p.email || '').trim();
        const password = String(p.password || '');
        if (!email || password.length < 8) return fail('Ingresá un usuario y una contraseña de al menos 8 caracteres');
        const exists = await db.prepare('SELECT 1 FROM users WHERE lower(email) = lower(?)').bind(email).first();
        if (exists) return fail('Ese usuario ya existe');
        const salt = randomHex(16);
        await db.prepare('INSERT INTO users (email, password_hash, salt, centro, approved, role) VALUES (?, ?, ?, ?, 0, ?)')
          .bind(email, await hashPassword(password, salt), salt, p.centro || '', 'user').run();
        return ok({ message: 'Registro exitoso. Esperá la aprobación del administrador.' });
      }
    }

    // ---- Desde acá, todo requiere sesión ----
    const me = await currentUser(request, db);
    if (!me) return fail('Sesión vencida o inválida. Volvé a iniciar sesión.', 401);
    const isAdmin = me.role === 'admin';
    const adminOnly = () => (isAdmin ? null : fail('Sólo un administrador puede hacer esto', 403));
    const canTouchCentro = (centro) => isAdmin || centro === me.centro;

    switch (action) {
      case 'logout': {
        const token = (request.headers.get('authorization') || '').slice(7).trim();
        await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
        return ok();
      }
      case 'changePassword': {
        const h = await hashPassword(String(p.currentPassword || ''), me.salt);
        if (!safeEqual(h, me.password_hash)) return fail('La contraseña actual no es correcta');
        if (String(p.newPassword || '').length < 8) return fail('La nueva contraseña debe tener al menos 8 caracteres');
        const salt = randomHex(16);
        await db.prepare('UPDATE users SET password_hash = ?, salt = ? WHERE email = ?')
          .bind(await hashPassword(String(p.newPassword), salt), salt, me.email).run();
        return ok({ message: 'Contraseña actualizada' });
      }

      /* Informes */
      case 'createReport':
      case 'updateReport': {
        const d = typeof p.data === 'string' ? JSON.parse(p.data) : (p.data || {});
        if (!d.titulo || !d.centro) return fail('Faltan título o centro');
        if (!canTouchCentro(d.centro)) return fail('Tu cuenta sólo puede cargar informes de su centro', 403);
        if (action === 'createReport') {
          const id = crypto.randomUUID();
          await db.prepare(`INSERT INTO reports (id, titulo, tag, centro, fecha, pdf_url, descripcion, destacado, created_by)
                            VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)`)
            .bind(id, d.titulo, d.tag || 'Informe', d.centro, d.fecha || null, d.pdf_url || '', d.descripcion || '', me.email).run();
          return ok({ id });
        }
        const prev = await db.prepare('SELECT centro FROM reports WHERE id = ?').bind(p.id || '').first();
        if (!prev) return fail('Informe no encontrado', 404);
        if (!canTouchCentro(prev.centro)) return fail('No podés editar informes de otro centro', 403);
        await db.prepare(`UPDATE reports SET titulo = ?, tag = ?, centro = ?, fecha = ?, pdf_url = COALESCE(NULLIF(?, ''), pdf_url), descripcion = ? WHERE id = ?`)
          .bind(d.titulo, d.tag || 'Informe', d.centro, d.fecha || null, d.pdf_url || '', d.descripcion || '', p.id).run();
        return ok({ id: p.id });
      }
      case 'deleteReport': {
        const prev = await db.prepare('SELECT centro, pdf_url FROM reports WHERE id = ?').bind(p.id || '').first();
        if (!prev) return fail('Informe no encontrado', 404);
        if (!canTouchCentro(prev.centro)) return fail('No podés borrar informes de otro centro', 403);
        await db.prepare('DELETE FROM reports WHERE id = ?').bind(p.id).run();
        if (prev.pdf_url && prev.pdf_url.startsWith('/files/')) await env.FILES.delete(decodeURIComponent(prev.pdf_url.slice(7)));
        return ok();
      }
      case 'setFeatured': {
        const deny = adminOnly(); if (deny) return deny;
        const v = p.value === true || p.value === 'true' || p.value === '1' ? 1 : 0;
        await db.prepare('UPDATE reports SET destacado = ? WHERE id = ?').bind(v, p.id || '').run();
        return ok();
      }
      case 'uploadPDF': {
        let bytes, name;
        if (p.file && typeof p.file === 'object' && 'arrayBuffer' in p.file) {
          bytes = new Uint8Array(await p.file.arrayBuffer()); name = p.file.name;
        } else if (p.fileData) {
          const bin = atob(p.fileData); bytes = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
          name = p.fileName;
        } else return fail('No llegó ningún archivo');
        if (bytes.length > MAX_PDF_BYTES) return fail('El PDF supera los 24 MB');
        const clean = String(name || 'informe.pdf').normalize('NFD').replace(/[̀-ͯ]/g, '')
          .replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').slice(-80);
        const key = `${new Date().toISOString().slice(0, 10)}-${randomHex(4)}-${clean}`;
        await env.FILES.put(key, bytes, { metadata: { type: 'application/pdf', name: name || clean, by: me.email } });
        return ok({ url: `/files/${encodeURIComponent(key)}`, key });
      }

      /* Miembros */
      case 'createMiembro':
      case 'updateMiembro': {
        const d = typeof p.data === 'string' ? JSON.parse(p.data) : (p.data || {});
        if (!d.nombre || !d.centro) return fail('Faltan nombre o centro');
        if (!canTouchCentro(d.centro)) return fail('Sólo podés cargar miembros de tu centro', 403);
        if (action === 'createMiembro') {
          const id = crypto.randomUUID();
          await db.prepare('INSERT INTO miembros (id, nombre, cargo, descripcion, centro, orden) VALUES (?, ?, ?, ?, ?, ?)')
            .bind(id, d.nombre, d.cargo || '', d.descripcion || '', d.centro, Number(d.orden) || 0).run();
          return ok({ id });
        }
        const prev = await db.prepare('SELECT centro FROM miembros WHERE id = ?').bind(p.id || '').first();
        if (!prev) return fail('Miembro no encontrado', 404);
        if (!canTouchCentro(prev.centro)) return fail('No podés editar miembros de otro centro', 403);
        await db.prepare('UPDATE miembros SET nombre = ?, cargo = ?, descripcion = ?, centro = ?, orden = ? WHERE id = ?')
          .bind(d.nombre, d.cargo || '', d.descripcion || '', d.centro, Number(d.orden) || 0, p.id).run();
        return ok({ id: p.id });
      }
      case 'deleteMiembro': {
        const prev = await db.prepare('SELECT centro FROM miembros WHERE id = ?').bind(p.id || '').first();
        if (!prev) return fail('Miembro no encontrado', 404);
        if (!canTouchCentro(prev.centro)) return fail('No podés borrar miembros de otro centro', 403);
        await db.prepare('DELETE FROM miembros WHERE id = ?').bind(p.id).run();
        return ok();
      }

      /* Monitor económico (sólo admin): refrescar y ver filas crudas del INDEC */
      case 'refreshIndicadores': {
        const deny = adminOnly(); if (deny) return deny;
        return ok(await getIndicadores(env, { fresh: true }));
      }
      case 'indecMuestra': {
        const deny = adminOnly(); if (deny) return deny;
        return ok({ rows: await indecMuestra(env, String(p.tabla || 'ipc_nacional').replace(/[^a-z0-9_-]/gi, '')) });
      }

      /* Usuarios y configuración (sólo admin) */
      case 'getUsers': {
        const deny = adminOnly(); if (deny) return deny;
        const { results } = await db.prepare('SELECT * FROM users ORDER BY approved, email').all();
        return ok({ users: results.map(toUser) });
      }
      case 'approveUser':
      case 'rejectUser':
      case 'deleteUser': {
        const deny = adminOnly(); if (deny) return deny;
        if (p.email === me.email && action !== 'approveUser') return fail('No podés borrarte a vos mismo');
        if (action === 'approveUser') await db.prepare('UPDATE users SET approved = 1 WHERE email = ?').bind(p.email || '').run();
        else await db.batch([
          db.prepare('DELETE FROM sessions WHERE email = ?').bind(p.email || ''),
          db.prepare('DELETE FROM users WHERE email = ?').bind(p.email || '')
        ]);
        return ok();
      }
      case 'updateUserCentro': {
        const deny = adminOnly(); if (deny) return deny;
        await db.prepare('UPDATE users SET centro = ? WHERE email = ?').bind(p.centro || '', p.email || '').run();
        return ok();
      }
      case 'setConfig': {
        const deny = adminOnly(); if (deny) return deny;
        if (!p.key || p.key === 'seeded') return fail('Clave inválida');
        await db.prepare('INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)').bind(p.key, String(p.value ?? '')).run();
        return ok();
      }
    }
    return fail('Acción desconocida: ' + action, 404);
  } catch (err) {
    return fail('Error del servidor: ' + (err && err.message ? err.message : String(err)), 500);
  }
}

/* ---------------- archivos ---------------- */
async function serveFile(env, url) {
  const key = decodeURIComponent(url.pathname.slice('/files/'.length));
  const { value, metadata } = await env.FILES.getWithMetadata(key, { type: 'arrayBuffer' });
  if (!value) return new Response('No encontrado', { status: 404 });
  const name = (metadata && metadata.name) || key;
  return new Response(value, {
    headers: {
      'content-type': (metadata && metadata.type) || 'application/pdf',
      'content-disposition': `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      'cache-control': 'public, max-age=86400'
    }
  });
}
