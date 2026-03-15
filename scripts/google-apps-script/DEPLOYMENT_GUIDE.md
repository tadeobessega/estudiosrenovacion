# Guia de Despliegue - Sistema de Publicacion de Informes

Esta guia explica como configurar el sistema de publicacion de informes utilizando Google Apps Script, Google Sheets y Google Drive.

## Arquitectura del Sistema

```
┌─────────────────────────────────────────────────────────────┐
│                     Sitio Web (Vercel)                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │  index.html │  │ admin/      │  │ pages/      │         │
│  │  (publico)  │  │ (panel)     │  │ (centros)   │         │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘         │
│         │                │                │                 │
└─────────┼────────────────┼────────────────┼─────────────────┘
          │                │                │
          ▼                ▼                ▼
    ┌─────────────────────────────────────────────┐
    │         Google Apps Script (API)            │
    │                                             │
    │  • Autenticacion de usuarios                │
    │  • CRUD de informes                         │
    │  • Subida de PDFs                           │
    │  • Gestion de permisos                      │
    └──────────────┬──────────────────────────────┘
                   │
          ┌────────┴────────┐
          ▼                 ▼
   ┌──────────────┐  ┌──────────────┐
   │ Google Sheets│  │ Google Drive │
   │  (base de    │  │  (archivos   │
   │   datos)     │  │    PDF)      │
   └──────────────┘  └──────────────┘
```

## Paso 1: Configurar Google Sheets

1. Abre la hoja de calculo:
   https://docs.google.com/spreadsheets/d/1qVKcTtsxPCSppm3EZmpGuUfS_laTcybXBImJpD017qs

2. Crea dos hojas (sheets) con los siguientes nombres y columnas:

### Hoja "Usuarios"
| email | password | centro | approved | role |
|-------|----------|--------|----------|------|
| tadeobessega | JMaynard36 | | TRUE | admin |

### Hoja "Informes"
| id | titulo | tag | centro | fecha | pdf_url | created_at |
|----|--------|-----|--------|-------|---------|------------|

## Paso 2: Configurar Google Drive

1. Abre la carpeta de Google Drive:
   https://drive.google.com/drive/folders/1W53dE7w0BAt2FDCulGhQO-Z4qTdBn1m_

2. Asegurate de que la carpeta tiene permisos para que tu cuenta pueda subir archivos.

## Paso 3: Desplegar Google Apps Script

1. Ve a https://script.google.com/

2. Crea un nuevo proyecto:
   - Haz clic en "Nuevo proyecto"
   - Ponle un nombre descriptivo (ej: "API Informes Renovacion")

3. Copia el codigo:
   - Abre el archivo `Code.gs` de esta carpeta
   - Copia todo el contenido
   - Pega en el editor de Apps Script (reemplaza el codigo existente)

4. Verifica las constantes:
   ```javascript
   const SPREADSHEET_ID = '1qVKcTtsxPCSppm3EZmpGuUfS_laTcybXBImJpD017qs';
   const DRIVE_FOLDER_ID = '1W53dE7w0BAt2FDCulGhQO-Z4qTdBn1m_';
   ```

5. Ejecuta la funcion de inicializacion (opcional):
   - Selecciona `initializeSheets` en el dropdown de funciones
   - Haz clic en "Ejecutar"
   - Autoriza los permisos cuando se solicite

6. Despliega como Web App:
   - Haz clic en "Implementar" > "Nueva implementacion"
   - Selecciona "Aplicacion web"
   - Configura:
     - Descripcion: "API Informes v1"
     - Ejecutar como: "Yo"
     - Quien tiene acceso: "Cualquier persona"
   - Haz clic en "Implementar"
   - **COPIA LA URL** que aparece (la necesitaras en el paso siguiente)

## Paso 4: Configurar el Frontend

1. Abre el archivo `assets/js/admin-config.js`

2. Reemplaza la URL del API:
   ```javascript
   const API_URL = 'https://script.google.com/macros/s/TU_ID_DE_DEPLOYMENT/exec';
   ```

3. Abre el archivo `assets/js/reports-loader.js`

4. Reemplaza la URL del API:
   ```javascript
   const REPORTS_API_URL = 'https://script.google.com/macros/s/TU_ID_DE_DEPLOYMENT/exec';
   ```

## Paso 5: Probar el Sistema

1. Abre el sitio web en tu navegador

2. Ve a la pagina de login:
   `/admin/login.html`

3. Inicia sesion con las credenciales de admin:
   - Usuario: `tadeobessega`
   - Password: `JMaynard36`

4. Prueba subir un informe:
   - Haz clic en "Subir"
   - Completa el formulario
   - Sube un PDF
   - Verifica que aparece en la lista

5. Verifica que el informe aparece en el sitio publico

## Usuarios y Permisos

### Roles

| Rol | Permisos |
|-----|----------|
| admin | Ver todos los informes, crear/editar/eliminar cualquier informe, aprobar usuarios, gestionar centros |
| user | Ver informes de su centro, crear/editar/eliminar informes de su centro |

### Flujo de Registro

1. Usuario se registra en `/admin/login.html`
2. Usuario selecciona su centro de investigacion
3. Admin aprueba el usuario en `/admin/users.html`
4. Usuario puede iniciar sesion y subir informes

## Centros de Investigacion

| ID | Nombre |
|----|--------|
| CEER | Centro de Estudios Economicos |
| CEEIR | Centro de Estudios Estrategicos Internacionales |
| CEDHyS | Centro de Estudios en Derechos Humanos y Seguridad |
| OPER | Observatorio de Politicas Educativas |
| OPAL | Observatorio para el Analisis Electoral |
| OPSA | Observatorio de Politica Social Aplicada |
| CIREN | Centro de Estudios Cientificos |

## Solucion de Problemas

### Error "CORS" o "Network Error"

1. Verifica que la URL del API esta correcta
2. Verifica que el despliegue esta configurado como "Cualquier persona"
3. Intenta crear un nuevo despliegue

### Error "No autorizado"

1. Re-autoriza el script en Google Apps Script
2. Verifica los permisos de la hoja de calculo

### Archivos no se suben

1. Verifica los permisos de la carpeta de Drive
2. Verifica que el DRIVE_FOLDER_ID es correcto
3. El tamano maximo es 10MB

### Usuario no puede iniciar sesion

1. Verifica que el usuario esta en la hoja "Usuarios"
2. Verifica que `approved` es `TRUE`
3. Verifica que el password es correcto

## Actualizaciones del API

Si necesitas actualizar el codigo del API:

1. Edita el codigo en Apps Script
2. Haz clic en "Implementar" > "Gestionar implementaciones"
3. Edita la implementacion existente o crea una nueva
4. Si creas una nueva, actualiza las URLs en el frontend

## Seguridad

- Las contrasenas se guardan en texto plano (para simplificar). En produccion, considera usar hash.
- La API esta abierta a cualquier persona pero requiere credenciales validas para operaciones.
- Los usuarios normales solo pueden modificar informes de su centro asignado.
