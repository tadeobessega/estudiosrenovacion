# Dashboard del CEER (`pages/monitor/`)

Dashboard económico con gráficos históricos (BCRA, FRED, BLS, Ámbito).
Lo desarrolló el equipo del CEER. Se integró al sitio del CER: desde
`pages/ceer.html` → botón **"Abrir el dashboard"**.

## Archivos

| Archivo | Qué es |
|---|---|
| `index.html` | El dashboard (Chart.js). Carga `datos_historicos.json` (mismo directorio). |
| `datos_historicos.json` | Series históricas ya procesadas (~540 KB). **Es lo que hay que mantener actualizado.** |
| `bot_monetario.py` | Script Python que reconstruye el JSON: baja BCRA, ITCRM, bandas, etc. |
| `ceer_*.png`, `ceer blanco 1.png` | Logos del dashboard. |

El dashboard es estático (no necesita backend). Lo único que "envejece" es
`datos_historicos.json`.

## Mantener los datos al día

### Automático — GitHub Action (recomendado)

El workflow `.github/workflows/monitor-datos.yml` corre `bot_monetario.py` cada
día a las 08:00 UTC y hace `commit` del `datos_historicos.json` nuevo.
No hay que configurar nada; también se puede correr a mano desde la pestaña
**Actions → Actualizar datos del dashboard → Run workflow**.

> Opcional: si el bot necesita la API de ArgenStats, cargá el secret
> `ARGENSTATS_API_KEY` en Settings → Secrets and variables → Actions.

### A mano

En una compu con Python:

```
pip install pandas requests openpyxl
cd pages/monitor
python bot_monetario.py
```
y commiteás el `datos_historicos.json` actualizado.

## Notas del bot

- El IPC de EE.UU. (BLS) se toma de un `SeriesReport*.xlsx` bajado a mano de
  bls.gov y puesto en esta carpeta. Si no está, el bot conserva el último valor
  conocido (lee el JSON anterior como "memoria").
- Genera temporales `*_temp.xlsx` que borra solo (están en `.gitignore`).
- BCRA / ITCRM / bandas: sin API key.
