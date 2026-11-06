import requests
import pandas as pd
import json
import warnings
import os
import glob

warnings.filterwarnings('ignore')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

VARS_MENSUAL = {
    110: 'adelantos', 111: 'documentos', 112: 'hipotecarios', 113: 'prendarios', 114: 'personales', 115: 'tarjetas',
    85: 'cc', 86: 'ca', 24: 'plazo_fijo', 108: 'depositos_usd', 125: 'prestamos_usd',
    1: 'reservas', 78: 'compra_divisas', 5: 'tc_mayorista', 4: 'tc_minorista',
    27: 'ipc_mensual', 28: 'ipc_interanual', 29: 'rem_interanual',
    15: 'base_monetaria', 109: 'm2', 197: 'm2_transaccional', 16: 'circulacion_monetaria', 17: 'billetes_monedas',
    152: 'pases_pasivos', 196: 'lefi',
    161: 'tasa_politica_tea', 35: 'badlar_tea', 45: 'tamar_tea', 11: 'baibar_tea', 8: 'tm20_tea'
}
VARS_DIARIO = {35: 'badlar_tea', 45: 'tamar_tea'}

HEADERS_BOT = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'es-AR,es;q=0.9,en-US;q=0.8,en;q=0.7'
}

def fetch_itcrm_excel():
    print("Descargando ITCRM y Bilaterales (Scrapeando Excel BCRA)...")
    temp_path = os.path.join(BASE_DIR, 'itcrm_temp.xlsx')
    try:
        r = requests.get("https://www.bcra.gob.ar/archivos/Pdfs/PublicacionesEstadisticas/ITCRMSerie.xlsx", headers=HEADERS_BOT, verify=False, timeout=30)
        if r.status_code == 200:
            with open(temp_path, 'wb') as f: f.write(r.content)
            df = pd.read_excel(temp_path, sheet_name=0, skiprows=1)
            col_map = {}
            for c in df.columns:
                c_str = str(c).strip().lower()
                if 'fecha' in c_str or 'período' in c_str or 'periodo' in c_str: col_map[c] = 'fecha'
                elif c_str == 'itcrm': col_map[c] = 'itcrm'
                elif 'brasil' in c_str: col_map[c] = 'tcr_brasil'
                elif 'canadá' in c_str or 'canada' in c_str: col_map[c] = 'tcr_canada'
                elif 'chile' in c_str: col_map[c] = 'tcr_chile'
                elif 'estados unidos' in c_str or 'usa' in c_str: col_map[c] = 'tcr_usa'
                elif 'méxico' in c_str or 'mexico' in c_str: col_map[c] = 'tcr_mexico'
                elif 'uruguay' in c_str: col_map[c] = 'tcr_uruguay'
                elif 'china' in c_str: col_map[c] = 'tcr_china'
                elif 'india' in c_str: col_map[c] = 'tcr_india'
                elif 'japón' in c_str or 'japon' in c_str: col_map[c] = 'tcr_japon'
                elif 'reino unido' in c_str: col_map[c] = 'tcr_reino_unido'
                elif 'suiza' in c_str: col_map[c] = 'tcr_suiza'
                elif 'zona euro' in c_str: col_map[c] = 'tcr_zona_euro'
                elif 'vietnam' in c_str: col_map[c] = 'tcr_vietnam'
            df = df.rename(columns=col_map)
            cols_to_keep = list(col_map.values())
            df = df[cols_to_keep].dropna(subset=['fecha'])
            df['fecha'] = pd.to_datetime(df['fecha'], errors='coerce')
            for c in cols_to_keep:
                if c != 'fecha': df[c] = pd.to_numeric(df[c], errors='coerce')
            if os.path.exists(temp_path): os.remove(temp_path)
            return df
    except Exception as e: print(f"  -> Error Excel ITCRM: {e}")
    return pd.DataFrame(columns=['fecha'])

def fetch_dolares_history():
    print("Descargando Dólares Históricos (MEP, Blue y CCL)...")
    df_d = pd.DataFrame(columns=['fecha'])
    
    # MEP
    try:
        r = requests.get("https://api.argentinadatos.com/v1/cotizaciones/dolares/bolsa", headers=HEADERS_BOT, timeout=20, verify=False)
        if r.status_code == 200:
            df_mep = pd.DataFrame(r.json())
            df_mep['fecha'] = pd.to_datetime(df_mep['fecha'])
            df_d = pd.merge(df_d, df_mep[['fecha', 'venta']].rename(columns={'venta': 'dolar_mep'}), on='fecha', how='outer')
    except:
        try:
            now = pd.Timestamp.now().strftime('%Y-%m-%d')
            r = requests.get(f"https://mercados.ambito.com//dolar/mep/historico-general/2004-01-01/{now}", headers=HEADERS_BOT, verify=False)
            data = r.json()
            if len(data) > 1:
                df_mep = pd.DataFrame(data[1:], columns=data[0])
                df_mep['fecha'] = pd.to_datetime(df_mep['Fecha'], format='%d-%m-%Y', errors='coerce')
                df_mep['dolar_mep'] = df_mep['Venta'].astype(str).str.replace('.', '', regex=False).str.replace(',', '.', regex=False)
                df_mep['dolar_mep'] = pd.to_numeric(df_mep['dolar_mep'], errors='coerce')
                df_d = pd.merge(df_d, df_mep[['fecha', 'dolar_mep']].dropna(), on='fecha', how='outer')
        except Exception as e: pass

    # BLUE
    try:
        r = requests.get("https://api.argentinadatos.com/v1/cotizaciones/dolares/blue", headers=HEADERS_BOT, timeout=20, verify=False)
        if r.status_code == 200:
            df_blue = pd.DataFrame(r.json())
            df_blue['fecha'] = pd.to_datetime(df_blue['fecha'])
            if df_d.empty:
                df_d = df_blue[['fecha', 'venta']].rename(columns={'venta': 'dolar_blue'})
            else:
                df_d = pd.merge(df_d, df_blue[['fecha', 'venta']].rename(columns={'venta': 'dolar_blue'}), on='fecha', how='outer')
    except:
        try:
            now = pd.Timestamp.now().strftime('%Y-%m-%d')
            r = requests.get(f"https://mercados.ambito.com//dolar/informal/historico-general/2004-01-01/{now}", headers=HEADERS_BOT, verify=False)
            data = r.json()
            if len(data) > 1:
                df_b = pd.DataFrame(data[1:], columns=data[0])
                df_b['fecha'] = pd.to_datetime(df_b['Fecha'], format='%d-%m-%Y', errors='coerce')
                df_b['dolar_blue'] = df_b['Venta'].astype(str).str.replace('.', '', regex=False).str.replace(',', '.', regex=False)
                df_b['dolar_blue'] = pd.to_numeric(df_b['dolar_blue'], errors='coerce')
                if df_d.empty:
                    df_d = df_b[['fecha', 'dolar_blue']].dropna()
                else:
                    df_d = pd.merge(df_d, df_b[['fecha', 'dolar_blue']].dropna(), on='fecha', how='outer')
        except Exception as e: pass

    # CCL
    try:
        r = requests.get("https://api.argentinadatos.com/v1/cotizaciones/dolares/contadoconliqui", headers=HEADERS_BOT, timeout=20, verify=False)
        if r.status_code == 200:
            df_ccl = pd.DataFrame(r.json())
            df_ccl['fecha'] = pd.to_datetime(df_ccl['fecha'])
            if df_d.empty:
                df_d = df_ccl[['fecha', 'venta']].rename(columns={'venta': 'dolar_ccl'})
            else:
                df_d = pd.merge(df_d, df_ccl[['fecha', 'venta']].rename(columns={'venta': 'dolar_ccl'}), on='fecha', how='outer')
    except:
        try:
            now = pd.Timestamp.now().strftime('%Y-%m-%d')
            r = requests.get(f"https://mercados.ambito.com//dolar/contado-con-liqui/historico-general/2004-01-01/{now}", headers=HEADERS_BOT, verify=False)
            data = r.json()
            if len(data) > 1:
                df_c = pd.DataFrame(data[1:], columns=data[0])
                df_c['fecha'] = pd.to_datetime(df_c['Fecha'], format='%d-%m-%Y', errors='coerce')
                df_c['dolar_ccl'] = df_c['Venta'].astype(str).str.replace('.', '', regex=False).str.replace(',', '.', regex=False)
                df_c['dolar_ccl'] = pd.to_numeric(df_c['dolar_ccl'], errors='coerce')
                if df_d.empty:
                    df_d = df_c[['fecha', 'dolar_ccl']].dropna()
                else:
                    df_d = pd.merge(df_d, df_c[['fecha', 'dolar_ccl']].dropna(), on='fecha', how='outer')
        except Exception as e: pass

    return df_d

def fetch_riesgo_pais():
    print("Descargando Riesgo País...")
    try:
        r = requests.get("https://api.argentinadatos.com/v1/finanzas/indices/riesgo-pais", headers=HEADERS_BOT, timeout=20, verify=False)
        if r.status_code == 200:
            df_rp = pd.DataFrame(r.json())
            df_rp['fecha'] = pd.to_datetime(df_rp['fecha'])
            df_rp = df_rp.rename(columns={'valor': 'riesgo_pais'})
            return df_rp[['fecha', 'riesgo_pais']].sort_values('fecha')
    except:
        pass
        
    try:
        now = pd.Timestamp.now().strftime('%Y-%m-%d')
        url = f"https://mercados.ambito.com//riesgopais/historico-general/2004-01-01/{now}"
        r = requests.get(url, headers=HEADERS_BOT, timeout=20, verify=False)
        if r.status_code == 200:
            data = r.json()
            if len(data) > 1:
                df_rp = pd.DataFrame(data[1:], columns=data[0])
                df_rp['fecha'] = pd.to_datetime(df_rp['Fecha'], format='%d-%m-%Y', errors='coerce')
                df_rp['riesgo_pais'] = df_rp['Valor'].astype(str).str.replace('.', '', regex=False).str.replace(',', '.', regex=False)
                df_rp['riesgo_pais'] = pd.to_numeric(df_rp['riesgo_pais'], errors='coerce')
                return df_rp[['fecha', 'riesgo_pais']].dropna().sort_values('fecha')
    except Exception as e: pass
        
    return pd.DataFrame(columns=['fecha', 'riesgo_pais'])

def fetch_us_cpi(df_memoria):
    print("Procesando CPI de EEUU (Inflación en Dólares desde BLS)...")
    df_cpi = pd.DataFrame(columns=['fecha', 'us_cpi'])
    
    if not df_memoria.empty and 'us_cpi' in df_memoria.columns:
        df_cpi = df_memoria[['us_cpi']].dropna().reset_index()
        df_cpi['fecha'] = pd.to_datetime(df_cpi['fecha'], errors='coerce')

    cpi_path = None
    
    # Búsqueda inteligente: escanea la carpeta de Descargas (independientemente del número de archivo)
    try:
        downloads_folder = os.path.join(os.path.expanduser('~'), 'Downloads')
        archivos_bls = glob.glob(os.path.join(downloads_folder, 'SeriesReport*.xlsx'))
        if archivos_bls:
            # Agarramos el modificado más recientemente por si bajaste varios
            cpi_path = max(archivos_bls, key=os.path.getmtime)
            print(f"  -> Archivo BLS encontrado dinámicamente en Downloads: {os.path.basename(cpi_path)}")
    except Exception as e:
        pass

    # Fallback: Si no está en Downloads, busca en la carpeta del repositorio
    if not cpi_path or not os.path.exists(cpi_path):
        try:
            for file in os.listdir(BASE_DIR):
                if file.lower().startswith('seriesreport') and file.lower().endswith('.xlsx'):
                    cpi_path = os.path.join(BASE_DIR, file)
                    print(f"  -> Archivo BLS detectado en el repositorio: {file}")
                    break
        except Exception as e:
            pass

    if cpi_path and os.path.exists(cpi_path):
        try:
            df_hist = pd.read_excel(cpi_path, skiprows=11)
            
            if 'Year' in df_hist.columns and 'Jan' in df_hist.columns:
                meses = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
                df_hist = df_hist.melt(id_vars=['Year'], value_vars=[m for m in meses if m in df_hist.columns], var_name='Month', value_name='us_cpi')
                df_hist = df_hist.dropna(subset=['us_cpi'])
                df_hist['fecha'] = pd.to_datetime(df_hist['Year'].astype(str) + '-' + df_hist['Month'], format='%Y-%b')
                
                if df_cpi.empty:
                    df_cpi = df_hist[['fecha', 'us_cpi']]
                else:
                    df_cpi = pd.concat([df_cpi, df_hist[['fecha', 'us_cpi']]]).drop_duplicates(subset=['fecha'], keep='last')
                print(f"  -> ¡Nuevos datos del BLS integrados! Primer dato: {df_cpi['fecha'].min().strftime('%Y-%m')} | Último dato: {df_cpi['fecha'].max().strftime('%Y-%m')}")
        except Exception as e:
            print(f"  -> Error procesando el archivo del BLS: {e}")
        
    return df_cpi.sort_values('fecha')

def fetch_tasa_fed():
    print("Descargando Tasa de la FED (EFFR)...")
    now = pd.Timestamp.now()
    start_date = "2000-01-01" 
    end_date = now.strftime('%Y-%m-%d')
    url = f"https://markets.newyorkfed.org/api/rates/unsecured/effr/search.json?startDate={start_date}&endDate={end_date}"
    
    try:
        r = requests.get(url, headers=HEADERS_BOT, timeout=20, verify=False)
        
        if r.status_code == 200:
            data = r.json().get('refRates', [])
            if data:
                df = pd.DataFrame(data)
                df = df[['effectiveDate', 'percentRate']].rename(columns={
                    'effectiveDate': 'fecha', 
                    'percentRate': 'tasa_fed'
                })
                
                df['fecha'] = pd.to_datetime(df['fecha'])
                df['tasa_fed'] = pd.to_numeric(df['tasa_fed'], errors='coerce')
                
                df['periodo'] = df['fecha'].dt.to_period('M')
                df_mensual = df.groupby('periodo').last().reset_index()
                df_mensual['fecha'] = df_mensual['periodo'].dt.strftime('%Y-%m')
                return df_mensual[['fecha', 'tasa_fed']]
    except Exception as e: pass
        
    return pd.DataFrame(columns=['fecha', 'tasa_fed'])

def fetch_bandas_cambiarias():
    import re
    print("Procesando Bandas Cambiarias del BCRA (Hardcode 2025 + Scraping 2026)...")
    df_final = pd.DataFrame(columns=['fecha', 'banda_inferior', 'banda_superior'])
    
    # --- 1. HARDCODE 2025 AUTOMATIZADO ---
    str_sup = "14/04/20251.400,0015/04/20251.400,4616/04/20251.400,9321/04/20251.403,2522/04/20251.403,7223/04/20251.404,1924/04/20251.404,6525/04/20251.405,1228/04/20251.406,5229/04/20251.406,9830/04/20251.407,4505/05/20251.409,7906/05/20251.410,2507/05/20251.410,7208/05/20251.411,1909/05/20251.411,6612/05/20251.413,0613/05/20251.413,5314/05/20251.414,0015/05/20251.414,4716/05/20251.414,9419/05/20251.416,3520/05/20251.416,8221/05/20251.417,2922/05/20251.417,7623/05/20251.418,2326/05/20251.419,6427/05/20251.420,1128/05/20251.420,5829/05/20251.421,0530/05/20251.421,5202/06/20251.422,9403/06/20251.423,4104/06/20251.423,8805/06/20251.424,3606/06/20251.424,8309/06/20251.426,2510/06/20251.426,7211/06/20251.427,1912/06/20251.427,6713/06/20251.428,1417/06/20251.430,0418/06/20251.430,5119/06/20251.430,9823/06/20251.432,8824/06/20251.433,3625/06/20251.433,8426/06/20251.434,3127/06/20251.434,7930/06/20251.436,2201/07/20251.436,6902/07/20251.437,1703/07/20251.437,6504/07/20251.438,1207/07/20251.439,5508/07/20251.440,0310/07/20251.440,9911/07/20251.441,4614/07/20251.442,9015/07/20251.443,3816/07/20251.443,8617/07/20251.444,3418/07/20251.444,8221/07/20251.446,2522/07/20251.446,7323/07/20251.447,2124/07/20251.447,6925/07/20251.448,1728/07/20251.449,6229/07/20251.450,1030/07/20251.450,5831/07/20251.451,0601/08/20251.451,5404/08/20251.452,9905/08/20251.453,4706/08/20251.453,9507/08/20251.454,4308/08/20251.454,9111/08/20251.456,3612/08/20251.456,8513/08/20251.457,3314/08/20251.457,8118/08/20251.459,7519/08/20251.460,2320/08/20251.460,7221/08/20251.461,2022/08/20251.461,6925/08/20251.463,1426/08/20251.463,6327/08/20251.464,1128/08/20251.464,6029/08/20251.465,0801/09/20251.466,5402/09/20251.467,0303/09/20251.467,5104/09/20251.468,0005/09/20251.468,4908/09/20251.469,9509/09/20251.470,4410/09/20251.470,9311/09/20251.471,4112/09/20251.471,9015/09/20251.473,3716/09/20251.473,8617/09/20251.474,3518/09/20251.474,8319/09/20251.475,3222/09/20251.476,7923/09/20251.477,2824/09/20251.477,7725/09/20251.478,2626/09/20251.478,7529/09/20251.480,2230/09/20251.480,7201/10/20251.481,2102/10/20251.481,7003/10/20251.482,1906/10/20251.483,6707/10/20251.484,1608/10/20251.484,6509/10/20251.485,1413/10/20251.487,1114/10/20251.487,6115/10/20251.488,1016/10/20251.488,5917/10/20251.489,0920/10/20251.490,5721/10/20251.491,0722/10/20251.491,5623/10/20251.492,0524/10/20251.492,5527/10/20251.494,0428/10/20251.494,5329/10/20251.495,0330/10/20251.495,5231/10/20251.496,0203/11/20251.497,5104/11/20251.498,0105/11/20251.498,5007/11/20251.499,5010/11/20251.500,9911/11/20251.501,4912/11/20251.501,9913/11/20251.502,4814/11/20251.502,9817/11/20251.504,4818/11/20251.504,9819/11/20251.505,4820/11/20251.505,9825/11/20251.508,4826/11/20251.508,9827/11/20251.509,4828/11/20251.509,9801/12/20251.511,4802/12/20251.511,9803/12/20251.512,4804/12/20251.512,9905/12/20251.513,4909/12/20251.515,5010/12/20251.516,0011/12/20251.516,5012/12/20251.517,0115/12/20251.518,5216/12/20251.519,0217/12/20251.519,5218/12/20251.520,0319/12/20251.520,5322/12/20251.522,0523/12/20251.522,5526/12/20251.524,0729/12/20251.525,5830/12/20251.526,09"
    str_inf = "14/04/20251.000,0015/04/2025999,6716/04/2025999,3321/04/2025997,6622/04/2025997,3223/04/2025996,9924/04/2025996,6625/04/2025996,3228/04/2025995,3229/04/2025994,9930/04/2025994,6505/05/2025992,9906/05/2025992,6607/05/2025992,3208/05/2025991,9909/05/2025991,6612/05/2025990,6613/05/2025990,3314/05/2025990,0015/05/2025989,6716/05/2025989,3419/05/2025988,3420/05/2025988,0121/05/2025987,6822/05/2025987,3523/05/2025987,0226/05/2025986,0327/05/2025985,7028/05/2025985,3729/05/2025985,0430/05/2025984,7102/06/2025983,7203/06/2025983,3904/06/2025983,0605/06/2025982,7306/06/2025982,4009/06/2025981,4110/06/2025981,0911/06/2025980,7612/06/2025980,4313/06/2025980,1017/06/2025978,7918/06/2025978,4619/06/2025978,1323/06/2025976,8224/06/2025976,4925/06/2025976,1726/06/2025975,8427/06/2025975,5130/06/2025974,5301/07/2025974,2102/07/2025973,8803/07/2025973,5604/07/2025973,2307/07/2025972,2508/07/2025971,9310/07/2025971,2711/07/2025970,9514/07/2025969,9715/07/2025969,6516/07/2025969,3217/07/2025969,0018/07/2025968,6821/07/2025967,7022/07/2025967,3823/07/2025967,0524/07/2025966,7325/07/2025966,4128/07/2025965,4429/07/2025965,1130/07/2025964,7931/07/2025964,4701/08/2025964,1404/08/2025963,1705/08/2025962,8506/08/2025962,5307/08/2025962,2108/08/2025961,8811/08/2025960,9212/08/2025960,6013/08/2025960,2714/08/2025959,9518/08/2025958,6719/08/2025958,3520/08/2025958,0221/08/2025957,7022/08/2025957,3825/08/2025956,4226/08/2025956,1027/08/2025955,7828/08/2025955,4629/08/2025955,1401/09/2025954,1802/09/2025953,8603/09/2025953,5404/09/2025953,2205/09/2025952,9008/09/2025951,9509/09/2025951,6310/09/2025951,3111/09/2025950,9912/09/2025950,6715/09/2025949,7216/09/2025949,4017/09/2025949,0818/09/2025948,7619/09/2025948,4422/09/2025947,4923/09/2025947,1724/09/2025946,8625/09/2025946,5426/09/2025946,2229/09/2025945,2730/09/2025944,9601/10/2025944,6402/10/2025944,3203/10/2025944,0106/10/2025943,0607/10/2025942,7408/10/2025942,4309/10/2025942,1113/10/2025940,8514/10/2025940,5315/10/2025940,2216/10/2025939,9017/10/2025939,5920/10/2025938,6521/10/2025938,3322/10/2025938,0223/10/2025937,7024/10/2025937,3927/10/2025936,4528/10/2025936,1329/10/2025935,8230/10/2025935,5131/10/2025935,1903/11/2025934,2504/11/2025933,9405/11/2025933,6307/11/2025933,0010/11/2025932,0711/11/2025931,7512/11/2025931,4413/11/2025931,1314/11/2025930,8217/11/2025929,8818/11/2025929,5719/11/2025929,2620/11/2025928,9525/11/2025927,3926/11/2025927,0827/11/2025926,7728/11/2025926,4601/12/2025925,5302/12/2025925,2203/12/2025924,9104/12/2025924,6005/12/2025924,2909/12/2025923,0510/12/2025922,7411/12/2025922,4412/12/2025922,1315/12/2025921,2016/12/2025920,8917/12/2025920,5818/12/2025920,2719/12/2025919,9722/12/2025919,0423/12/2025918,7326/12/2025917,8129/12/2025916,8930/12/2025916,58"
    
    matches_sup = re.findall(r'(\d{2}/\d{2}/\d{4})([\d\.,]+)', str_sup)
    matches_inf = re.findall(r'(\d{2}/\d{2}/\d{4})([\d\.,]+)', str_inf)
    
    dict_sup = {pd.to_datetime(d, format='%d/%m/%Y').strftime('%Y-%m-%d'): float(v.replace('.', '').replace(',', '.')) for d, v in matches_sup}
    dict_inf = {pd.to_datetime(d, format='%d/%m/%Y').strftime('%Y-%m-%d'): float(v.replace('.', '').replace(',', '.')) for d, v in matches_inf}
    
    all_dates = set(dict_sup.keys()).union(set(dict_inf.keys()))
    rows_2025 = [{'fecha': d, 'banda_inferior': dict_inf.get(d), 'banda_superior': dict_sup.get(d)} for d in all_dates]
    df_final = pd.concat([df_final, pd.DataFrame(rows_2025)])
    
    # --- 2. SCRAPING 2026 EN ADELANTE ---
    try:
        url_excel = "https://www.bcra.gob.ar/archivos/Pdfs/PublicacionesEstadisticas/serie-completa-bandas-cambiarias.xlsx"
        r = requests.get(url_excel, headers=HEADERS_BOT, verify=False, timeout=30)
        temp_bandas = os.path.join(BASE_DIR, 'bandas_temp.xlsx')
        if r.status_code == 200:
            with open(temp_bandas, 'wb') as f: f.write(r.content)
            df_actual = pd.read_excel(temp_bandas, skiprows=6)
            
            col_map = {}
            for c in df_actual.columns:
                c_str = str(c).strip().lower()
                if 'fecha' in c_str: col_map[c] = 'fecha'
                elif 'inferior' in c_str: col_map[c] = 'banda_inferior'
                elif 'superior' in c_str: col_map[c] = 'banda_superior'
            
            df_actual = df_actual.rename(columns=col_map)
            if all(col in df_actual.columns for col in ['fecha', 'banda_inferior', 'banda_superior']):
                df_actual = df_actual[['fecha', 'banda_inferior', 'banda_superior']].dropna(subset=['fecha'])
                df_actual['fecha'] = pd.to_datetime(df_actual['fecha'], errors='coerce')
                for col in ['banda_inferior', 'banda_superior']:
                    df_actual[col] = pd.to_numeric(df_actual[col], errors='coerce')
                
                df_final = pd.concat([df_final, df_actual])
                
            if os.path.exists(temp_bandas): os.remove(temp_bandas)
    except Exception as e:
        print(f"  -> Error al scrapear bandas actuales: {e}")
        
    if not df_final.empty:
        df_final['fecha'] = pd.to_datetime(df_final['fecha'], errors='coerce')
        df_final = df_final.dropna(subset=['fecha']).drop_duplicates(subset=['fecha']).sort_values('fecha')
        return df_final
        
    return pd.DataFrame(columns=['fecha', 'banda_inferior', 'banda_superior'])

def fetch_bcra_history(id_var, nombre, is_daily=False):
    print(f"Descargando {nombre}...")
    df_acumulado = pd.DataFrame()
    offset = 0
    while True:
        try:
            r = requests.get(f"https://api.bcra.gob.ar/estadisticas/v4.0/monetarias/{id_var}?limit=3000&offset={offset}", verify=False, timeout=20)
            if r.status_code != 200: break
            data = r.json().get('results', [{}])[0].get('detalle')
            if not data: break
            df_acumulado = pd.concat([df_acumulado, pd.DataFrame(data)], ignore_index=True)
            if len(data) < 3000 or len(df_acumulado) >= 15000: break
            offset += 3000
        except: break
    if df_acumulado.empty: return pd.DataFrame(columns=['fecha', nombre])
    df_acumulado['fecha'] = pd.to_datetime(df_acumulado['fecha'])
    df_acumulado['valor'] = pd.to_numeric(df_acumulado['valor'], errors='coerce')
    df_acumulado = df_acumulado.rename(columns={'valor': nombre})
    
    if is_daily:
        df_acumulado['fecha'] = df_acumulado['fecha'].dt.strftime('%Y-%m-%d')
        return df_acumulado.groupby('fecha').last().reset_index()[['fecha', nombre]]
    else:
        df_acumulado['periodo'] = df_acumulado['fecha'].dt.to_period('M')
        df_acumulado = df_acumulado.groupby('periodo').last().reset_index()
        df_acumulado['fecha'] = df_acumulado['periodo'].dt.strftime('%Y-%m')
        return df_acumulado[['fecha', nombre]]

print("=== INICIANDO ROBOT BCRA ===")

json_path = os.path.join(BASE_DIR, 'datos_historicos.json')
df_mensual_old = pd.DataFrame()
df_diario_old = pd.DataFrame()

if os.path.exists(json_path):
    print("-> Cargando datos históricos anteriores para prevenir blancos...")
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data_old = json.load(f)
            if 'mensual' in data_old and data_old['mensual']:
                df_mensual_old = pd.DataFrame(data_old['mensual'])
                df_mensual_old['fecha'] = pd.to_datetime(df_mensual_old['fecha'], errors='coerce')
                df_mensual_old = df_mensual_old.dropna(subset=['fecha'])
                df_mensual_old['fecha'] = df_mensual_old['fecha'].dt.strftime('%Y-%m')
                df_mensual_old = df_mensual_old.set_index('fecha')
            if 'diario' in data_old and data_old['diario']:
                df_diario_old = pd.DataFrame(data_old['diario'])
                df_diario_old['fecha'] = pd.to_datetime(df_diario_old['fecha'], errors='coerce')
                df_diario_old = df_diario_old.dropna(subset=['fecha'])
                df_diario_old['fecha'] = df_diario_old['fecha'].dt.strftime('%Y-%m-%d')
                df_diario_old = df_diario_old.set_index('fecha')
    except Exception as e: pass

print("=== CONSTRUYENDO BASE DE DATOS ===")
df_dolares = fetch_dolares_history()
df_itcrm = fetch_itcrm_excel()
df_us_cpi = fetch_us_cpi(df_mensual_old)
df_fed = fetch_tasa_fed()
df_bandas = fetch_bandas_cambiarias()
df_rp = fetch_riesgo_pais()

df_mensual = pd.DataFrame(columns=['fecha'])

for df_externo in [df_us_cpi, df_itcrm, df_dolares, df_fed]:
    if not df_externo.empty:
        df_ext = df_externo.copy()
        df_ext['fecha'] = pd.to_datetime(df_ext['fecha'], errors='coerce')
        df_ext = df_ext.dropna(subset=['fecha'])
        df_ext['periodo'] = df_ext['fecha'].dt.to_period('M')
        df_ext = df_ext.groupby('periodo').last().reset_index()
        df_ext['fecha'] = df_ext['periodo'].dt.strftime('%Y-%m')
        df_mensual = pd.merge(df_mensual, df_ext.drop(columns=['periodo']), on='fecha', how='outer')

for id_var, nombre in VARS_MENSUAL.items():
    df_temp = fetch_bcra_history(id_var, nombre, is_daily=False)
    if not df_temp.empty: df_mensual = pd.merge(df_mensual, df_temp, on='fecha', how='outer')

if not df_bandas.empty:
    df_bandas_m = df_bandas.copy()
    df_bandas_m['fecha'] = pd.to_datetime(df_bandas_m['fecha'], errors='coerce')
    df_bandas_m = df_bandas_m.dropna(subset=['fecha'])
    df_bandas_m['periodo'] = df_bandas_m['fecha'].dt.to_period('M')
    df_bandas_m = df_bandas_m.groupby('periodo').last().reset_index()
    df_bandas_m['fecha'] = df_bandas_m['periodo'].dt.strftime('%Y-%m')
    df_mensual = pd.merge(df_mensual, df_bandas_m[['fecha', 'banda_inferior', 'banda_superior']], on='fecha', how='outer')

if not df_rp.empty:
    df_rp_m = df_rp.copy()
    df_rp_m['periodo'] = df_rp_m['fecha'].dt.to_period('M')
    df_rp_m = df_rp_m.groupby('periodo').last().reset_index()
    df_rp_m['fecha'] = df_rp_m['periodo'].dt.strftime('%Y-%m')
    df_mensual = pd.merge(df_mensual, df_rp_m[['fecha', 'riesgo_pais']], on='fecha', how='outer')

if not df_mensual.empty:
    df_mensual = df_mensual.dropna(subset=['fecha'])
    df_mensual = df_mensual.set_index('fecha')

if not df_mensual_old.empty:
    if not df_mensual.empty:
        df_mensual = df_mensual.combine_first(df_mensual_old)
    else:
        df_mensual = df_mensual_old.copy()
        
if not df_mensual.empty:
    if df_mensual.index.name == 'fecha':
        df_mensual = df_mensual.reset_index()
    df_mensual = df_mensual.dropna(subset=['fecha'])
    df_mensual = df_mensual.sort_values('fecha').ffill()

if len(df_mensual.columns) > 1:
    usd_cols = ['depositos_usd', 'prestamos_usd', 'reservas', 'compra_divisas']
    for col in usd_cols:
        if col in df_mensual.columns:
            df_mensual[col + '_corriente'] = df_mensual[col].copy()
            
    if 'us_cpi' in df_mensual.columns and df_mensual['us_cpi'].notna().any():
        last_cpi = df_mensual['us_cpi'].dropna().iloc[-1]
        df_mensual['us_cpi_index'] = df_mensual['us_cpi'] / last_cpi
        for col in usd_cols:
            if col in df_mensual.columns:
                df_mensual[col] = df_mensual[col + '_corriente'] / df_mensual['us_cpi_index']
    
    if 'ipc_mensual' in df_mensual.columns:
        index_vals = [1.0]
        for i in range(1, len(df_mensual)):
            ipc_val = df_mensual['ipc_mensual'].iloc[i]
            index_vals.append(index_vals[-1] * (1 + ipc_val / 100.0) if pd.notna(ipc_val) else index_vals[-1])
        df_mensual['ipc_index'] = index_vals
        df_mensual['ipc_index'] = df_mensual['ipc_index'] / df_mensual['ipc_index'].iloc[-1]
        
        ars_cols = ['adelantos', 'documentos', 'hipotecarios', 'prendarios', 'personales', 'tarjetas', 
                    'cc', 'ca', 'plazo_fijo', 'base_monetaria', 'm2', 'm2_transaccional', 
                    'circulacion_monetaria', 'billetes_monedas', 'pases_pasivos', 'lefi',
                    'tc_mayorista', 'tc_minorista', 'dolar_mep', 'dolar_blue', 'dolar_ccl', 'banda_inferior', 'banda_superior']
        for col in ars_cols:
            if col in df_mensual.columns:
                df_mensual[col + '_corriente'] = df_mensual[col] 
                df_mensual[col] = df_mensual[col + '_corriente'] / df_mensual['ipc_index']
                
    if 'tc_mayorista_corriente' in df_mensual.columns: df_mensual['tc_mayorista_var'] = df_mensual['tc_mayorista_corriente'].pct_change() * 100
    if 'tc_minorista_corriente' in df_mensual.columns:
        if 'dolar_mep_corriente' in df_mensual.columns: df_mensual['brecha_mep'] = ((df_mensual['dolar_mep_corriente'] / df_mensual['tc_minorista_corriente']) - 1) * 100
        if 'dolar_blue_corriente' in df_mensual.columns: df_mensual['brecha_blue'] = ((df_mensual['dolar_blue_corriente'] / df_mensual['tc_minorista_corriente']) - 1) * 100
        if 'dolar_ccl_corriente' in df_mensual.columns: df_mensual['brecha_ccl'] = ((df_mensual['dolar_ccl_corriente'] / df_mensual['tc_minorista_corriente']) - 1) * 100
    if 'rem_interanual' in df_mensual.columns: df_mensual['rem_interanual'] = df_mensual['rem_interanual'].shift(12)
    
    # 600 MESES = 50 AÑOS! Esto garantiza que no te mutile los datos del 2000 nunca más.
    df_mensual = df_mensual.where(pd.notnull(df_mensual), None).tail(600)

# --- CONSTRUCCIÓN DATASET DIARIO ---
df_diario = pd.DataFrame(columns=['fecha'])

for id_var, nombre in VARS_DIARIO.items():
    df_temp = fetch_bcra_history(id_var, nombre, is_daily=True)
    if not df_temp.empty: 
        df_diario = pd.merge(df_diario, df_temp, on='fecha', how='outer')

for nombre in VARS_DIARIO.values():
    if nombre not in df_diario.columns:
        df_diario[nombre] = float('nan')

if not df_bandas.empty:
    df_bandas_d = df_bandas.copy()
    df_bandas_d['fecha'] = df_bandas_d['fecha'].dt.strftime('%Y-%m-%d')
    df_diario = pd.merge(df_diario, df_bandas_d, on='fecha', how='outer')

if not df_rp.empty:
    df_rp_d = df_rp.copy()
    df_rp_d['fecha'] = df_rp_d['fecha'].dt.strftime('%Y-%m-%d')
    df_diario = pd.merge(df_diario, df_rp_d, on='fecha', how='outer')

if not df_diario.empty:
    df_diario = df_diario.dropna(subset=['fecha'])
    df_diario = df_diario.set_index('fecha')

if not df_diario_old.empty:
    if not df_diario.empty:
        df_diario = df_diario.combine_first(df_diario_old)
    else:
        df_diario = df_diario_old.copy()

if not df_diario.empty:
    if df_diario.index.name == 'fecha':
        df_diario = df_diario.reset_index()
    
    df_diario = df_diario.dropna(subset=['fecha'])
    df_diario = df_diario.sort_values('fecha').ffill().where(pd.notnull(df_diario), None).tail(1000)

with open(json_path, 'w', encoding='utf-8') as f: 
    json.dump({'mensual': df_mensual.to_dict(orient='list') if len(df_mensual.columns) > 1 else {}, 'diario': df_diario.to_dict(orient='list') if len(df_diario.columns) > 1 else {}}, f)
print(f"\n¡ÉXITO ABSOLUTO! Datos guardados en {json_path}")