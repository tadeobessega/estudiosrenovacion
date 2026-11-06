/* Accesos del Panel de miembros del CEER (/pages/miembros/).
   Se sirven solo por la API (acción getPanelCEER) a cuentas aprobadas del CEER o
   administradores, para que los enlaces internos (Drive, documentos) no queden en el HTML público.
   estado: 'activo' | 'pendiente' (se muestra con un rótulo). */
export const PANEL_CEER = [
  {
    seccion: 'Publicaciones del CEER',
    accesos: [
      {
        titulo: 'Página del CEER',
        descripcion: 'Página pública del centro: presentación, equipo e informes.',
        url: '/pages/ceer',
        tipo: 'Sitio'
      },
      {
        titulo: 'Monitor económico',
        descripcion: 'Tablero con los indicadores monetarios y de actividad que actualiza el bot.',
        url: '/pages/monitor/',
        tipo: 'Tablero'
      },
      {
        titulo: 'IPCEER',
        descripcion: 'Índice de precios de bienes de alta frecuencia con base SEPA. Se actualiza solo después de cada corrida de la PC.',
        url: 'https://ipceer.tadeobessega.workers.dev/',
        tipo: 'Tablero'
      }
    ]
  },
  {
    seccion: 'Herramientas de producción',
    accesos: [
      {
        titulo: 'Sistema de marca',
        descripcion: 'Colores, tipografías, logo, placas, gráficos e informes del CEER.',
        url: 'https://claude.ai/artifact/91ATn5u7RbfrRyVtYn8yKs',
        tipo: 'Diseño'
      },
      {
        titulo: 'Bot de publicaciones',
        descripcion: 'Arma las publicaciones del CEER a partir de los datos. Todavía no está publicado.',
        url: 'https://github.com/tadeobessega/publicaciones-ceer',
        tipo: 'Herramienta',
        estado: 'pendiente'
      },
      {
        titulo: 'Cargar informes',
        descripcion: 'Panel de administración del sitio para subir informes y editar el equipo.',
        url: '/admin/',
        tipo: 'Sitio'
      }
    ]
  },
  {
    seccion: 'Archivos y documentos',
    accesos: [
      {
        titulo: 'Drive del CEER',
        descripcion: 'Carpeta compartida con informes, bases y material de trabajo.',
        url: 'https://drive.google.com/drive/folders/1C1FhpIBjWpyGGIpaBOL9qLOusuDLodn_?usp=drive_link',
        tipo: 'Drive'
      },
      {
        titulo: 'Guion Soda',
        descripcion: 'Documento de trabajo del guion para Soda.',
        url: 'https://docs.google.com/document/d/1t3clczi4eCf_2zADswKzJeoWwWMdg16a_odwLxWiaw8/edit',
        tipo: 'Documento'
      }
    ]
  }
];

/* Estado de la base del IPCEER: lo sube la PC al release de GitHub en cada corrida. */
export async function estadoIPCEER() {
  try {
    const r = await fetch('https://github.com/tadeobessega/ipceer/releases/download/sepa-archivo/estado_pc.json',
      { redirect: 'follow', cf: { cacheTtl: 300, cacheEverything: true } });
    if (!r.ok) return null;
    const txt = (await r.text()).replace(/^﻿/, '');
    return JSON.parse(txt);
  } catch {
    return null;
  }
}
