#!/usr/bin/env python3

import os, re, sys, ssl, json, time, base64, hashlib, secrets, shutil, signal, requests, subprocess, threading, random, platform
from http.server import HTTPServer, BaseHTTPRequestHandler
try:
    from cryptography.hazmat.primitives.asymmetric import x25519
    from cryptography.hazmat.primitives import serialization
    HAS_CRYPTO = True
except ImportError:
    HAS_CRYPTO = False

REMOTE_SYNC    = os.environ.get('UPLOAD_URL', '')
PUBLIC_URL     = os.environ.get('PROJECT_URL', '')
AUTO_PING      = os.environ.get('AUTO_ACCESS', 'false').lower() in ('true', 'yes')
ROUTE_YT       = os.environ.get('YT_WARPOUT', 'false').lower() in ('true', 'yes')
WORK_DIR_BASE  = os.environ.get('FILE_PATH', '.config')
API_PATH       = os.environ.get('SUB_PATH', 'update')
SESSION_ID     = os.environ.get('UUID', '0a6568ff-ea3c-4271-9020-450560e10d63')
TUN_PORT       = int(os.environ.get('ARGO_PORT', '8001'))
TUN_DOMAIN     = os.environ.get('ARGO_DOMAIN', '')
TUN_AUTH       = os.environ.get('ARGO_AUTH', '')
S5_EDGE        = os.environ.get('S5_PORT', '')
HY2_EDGE       = os.environ.get('HY2_PORT', '')
TUIC_EDGE      = os.environ.get('TUIC_PORT', '')
TLS_EDGE       = os.environ.get('ANYTLS_PORT', '')
REALM_EDGE     = os.environ.get('REALITY_PORT', '')
SMART_HOST     = os.environ.get('CFIP', 'saas.sin.fan')
SMART_PORT     = int(os.environ.get('CFPORT', '443'))
HTTP_SVC_PORT  = int(os.environ.get('PORT', '3000'))
NODE_TAG       = os.environ.get('NAME', '')
TG_CHAT        = os.environ.get('CHAT_ID', '')
TG_BOT         = os.environ.get('BOT_TOKEN', '')
NO_TUN         = os.environ.get('DISABLE_ARGO', 'false').lower() in ('true', 'yes')
SB_VERSION     = os.environ.get('SB_VERSION', '1.11.6')

sensitive_keys = [
    'UPLOAD_URL','PROJECT_URL','AUTO_ACCESS','YT_WARPOUT','UUID',
    'ARGO_DOMAIN','ARGO_AUTH',
    'ARGO_PORT','S5_PORT','TUIC_PORT','HY2_PORT','ANYTLS_PORT',
    'REALITY_PORT','CFIP','CFPORT','PORT','NAME','CHAT_ID','BOT_TOKEN','DISABLE_ARGO'
]
for k in sensitive_keys:
    if k in os.environ:
        os.environ.pop(k, None)
os.environ['NODE_ENV'] = 'production'
os.environ['APP_MODE'] = 'server'
os.environ['LOG_LEVEL'] = 'warn'

ROOT = os.getcwd()
WORK_DIR = os.path.join(ROOT, WORK_DIR_BASE)
logFile = os.path.join(WORK_DIR, 'app.log')
cfgPath = os.path.join(WORK_DIR, 'config.json')
encData = os.path.join(WORK_DIR, 'session_store.dat')
peerList = os.path.join(WORK_DIR, 'route_table.cache')
idStore = os.path.join(WORK_DIR, 'node_identity.key')
certPath = os.path.join(WORK_DIR, 'tls.crt')
keyPath = os.path.join(WORK_DIR, 'tls.key')
syncPath = '/' + API_PATH.lstrip('/')

privKey = ''
pubKey = ''

def log(msg):
    ts = time.strftime('%Y-%m-%d %H:%M:%S')
    line = f'[{ts}] {msg}'
    print(line)
    try:
        os.makedirs(os.path.dirname(logFile), exist_ok=True)
        with open(logFile, 'a') as f:
            f.write(line + '\n')
    except:
        pass

def logError(msg):
    ts = time.strftime('%Y-%m-%d %H:%M:%S')
    line = f'[{ts}] ERROR: {msg}'
    print(line)
    try:
        os.makedirs(os.path.dirname(logFile), exist_ok=True)
        with open(logFile, 'a') as f:
            f.write(line + '\n')
    except:
        pass

try:
    with open(logFile, 'w') as f:
        f.write(f'[{time.strftime("%Y-%m-%d %H:%M:%S")}] === STARTUP ===\n')
except:
    pass

def write_secure(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        if isinstance(data, str):
            f.write(data.encode('utf-8'))
        else:
            f.write(data)
    try: os.chmod(path, 0o600)
    except: pass

def get_arch():
    m = platform.machine().lower()
    return 'arm64' if m in ('arm64', 'aarch64') else 'amd64'

ARCH = get_arch()

def valid_port(p):
    try:
        if p is None or p == '': return False
        n = int(p)
        return 1 <= n <= 65535
    except (ValueError, TypeError): return False

def sha256_file(fp):
    h = hashlib.sha256()
    with open(fp, 'rb') as f:
        for chunk in iter(lambda: f.read(4096), b''): h.update(chunk)
    return h.hexdigest()

def gen_rand_str(l):
    return secrets.token_hex(l // 2 + 1)[:l]

stale = ['network_trace.log', 'route_table.cache', 'tls.crt', 'tls.key', 'conn_config.json', 'conn_config.yml']

def purge_old():
    for f in stale:
        p = os.path.join(WORK_DIR, f)
        try:
            if os.path.exists(p): os.unlink(p)
        except: pass
    td = os.path.join(ROOT, '.tmp')
    if os.path.exists(td):
        try: shutil.rmtree(td)
        except: pass

def cleanup(keep_data=False):
    keep = set(['node_identity.key', 'tls.crt', 'tls.key'])
    if keep_data: keep.add('session_store.dat')
    if os.path.exists(WORK_DIR):
        try:
            for f in os.listdir(WORK_DIR):
                if f in keep: continue
                p = os.path.join(WORK_DIR, f)
                try:
                    if os.path.isdir(p): shutil.rmtree(p)
                    else: os.unlink(p)
                except: pass
        except Exception as e: print(f'Cleanup: {e}')
    td = os.path.join(ROOT, '.tmp')
    if os.path.exists(td):
        try: shutil.rmtree(td)
        except: pass

def clr(): os.system('clear' if os.name == 'posix' else 'cls')

def remove_remote():
    if not REMOTE_SYNC: return
    if not os.path.exists(encData): return
    try:
        with open(encData, 'r') as f: c = f.read()
    except: return
    try:
        d = base64.b64decode(c).decode('utf-8')
        nodes = [l for l in d.split('\n') if re.search(r'(vless|vmess|trojan|hysteria2|tuic):\/\/', l)]
        if nodes: requests.post(f'{REMOTE_SYNC}/api/delete-nodes', json={'nodes': nodes}, timeout=30)
    except: pass

def setup_tunnel():
    if NO_TUN: return None
    if not TUN_AUTH or not TUN_DOMAIN: return None
    if 'TunnelSecret' in TUN_AUTH:
        write_secure(os.path.join(WORK_DIR, 'conn_config.json'), TUN_AUTH)
        tid = (re.search(r'"TunnelID":\s*"([^"]+)"', TUN_AUTH) or [None, '']).group(1)
        y = f"tunnel: {tid}\ncredentials-file: {os.path.join(WORK_DIR, 'conn_config.json')}\nprotocol: http2\n\ningress:\n  - hostname: {TUN_DOMAIN}\n    service: http://localhost:{TUN_PORT}\n    originRequest:\n      noTLSVerify: true\n  - service: http_status:404\n"
        write_secure(os.path.join(WORK_DIR, 'conn_config.yml'), y)
        return 'config'
    return 'token'

def write_keys(pk, puk):
    os.makedirs(os.path.dirname(idStore), exist_ok=True)
    write_secure(idStore, f'PrivateKey: {pk}\nPublicKey: {puk}\n')

def load_keys():
    global privKey, pubKey
    if os.path.exists(idStore):
        with open(idStore, 'r') as f: c = f.read()
        pm = re.search(r'PrivateKey:\s*(.*)', c)
        pum = re.search(r'PublicKey:\s*(.*)', c)
        if pm and pum:
            privKey = pm.group(1).strip()
            pubKey = pum.group(1).strip()
            return
    if not HAS_CRYPTO:
        logError('cryptography library required for Reality key generation')
        return
    from cryptography.hazmat.primitives.asymmetric import x25519
    from cryptography.hazmat.primitives import serialization
    priv = x25519.X25519PrivateKey.generate()
    priv_bytes = priv.private_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PrivateFormat.Raw,
        encryption_algorithm=serialization.NoEncryption()
    )
    pub_bytes = priv.public_key().public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw
    )
    privKey = base64.urlsafe_b64encode(priv_bytes).decode().rstrip('=')
    pubKey = base64.urlsafe_b64encode(pub_bytes).decode().rstrip('=')
    write_keys(privKey, pubKey)

def valid_cert_pair(cert, key):
    if not os.path.exists(cert) or not os.path.exists(key): return False
    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ctx.load_cert_chain(certfile=cert, keyfile=key)
        return True
    except: return False

def ensure_certs():
    if os.path.exists(certPath) and os.path.exists(keyPath) and valid_cert_pair(certPath, keyPath): return
    os.makedirs(os.path.dirname(certPath), exist_ok=True)
    tc, tk = f'{certPath}.tmp', f'{keyPath}.tmp'
    for p in (tc, tk):
        try:
            if os.path.exists(p): os.unlink(p)
        except: pass
    try:
        subprocess.run(['openssl', 'version'], capture_output=True, check=True)
        subprocess.run(['openssl', 'ecparam', '-genkey', '-name', 'prime256v1', '-out', tk], capture_output=True, check=True)
        subprocess.run(['openssl', 'req', '-new', '-x509', '-days', '3650', '-key', tk, '-out', tc, '-subj', '/CN=bing.com'], capture_output=True, check=True)
        if valid_cert_pair(tc, tk): os.replace(tc, certPath); os.replace(tk, keyPath); return
    except: pass
    for p in (tc, tk):
        try:
            if os.path.exists(p): os.unlink(p)
        except: pass
    logError('openssl not available - TLS cert generation failed')
    sys.exit(1)

def build_config():
    inbound = []
    inbound.append({'type': 'vless', 'tag': 'vless-ws-in', 'listen': '::', 'listen_port': TUN_PORT,
        'users': [{'uuid': SESSION_ID, 'flow': ''}], 'transport': {'type': 'ws', 'path': '/'}})
    if valid_port(REALM_EDGE):
        inbound.append({'type': 'vless', 'tag': 'vless-reality', 'listen': '::', 'listen_port': int(REALM_EDGE),
            'users': [{'uuid': SESSION_ID, 'flow': 'xtls-rprx-vision'}],
            'tls': {'enabled': True, 'server_name': 'www.iij.ad.jp',
                'reality': {'enabled': True, 'handshake': {'server': 'www.iij.ad.jp', 'server_port': 443}, 'private_key': privKey, 'short_id': ['']}}})
    if valid_port(HY2_EDGE):
        inbound.append({'type': 'hysteria2', 'tag': 'hysteria-in', 'listen': '::', 'listen_port': int(HY2_EDGE),
            'users': [{'password': SESSION_ID}], 'masquerade': 'https://bing.com',
            'tls': {'enabled': True, 'alpn': ['h3'], 'certificate_path': certPath, 'key_path': keyPath}})
    if valid_port(TUIC_EDGE):
        inbound.append({'type': 'tuic', 'tag': 'tuic-in', 'listen': '::', 'listen_port': int(TUIC_EDGE),
            'users': [{'uuid': SESSION_ID, 'password': SESSION_ID}], 'congestion_control': 'bbr',
            'tls': {'enabled': True, 'alpn': ['h3'], 'certificate_path': certPath, 'key_path': keyPath}})
    if valid_port(S5_EDGE):
        inbound.append({'type': 'socks', 'tag': 's5-in', 'listen': '::', 'listen_port': int(S5_EDGE),
            'users': [{'username': SESSION_ID[:8], 'password': SESSION_ID[-12:]}]})
    if valid_port(TLS_EDGE):
        inbound.append({'type': 'anytls', 'tag': 'anytls-in', 'listen': '::', 'listen_port': int(TLS_EDGE),
            'users': [{'password': SESSION_ID}], 'tls': {'enabled': True, 'certificate_path': certPath, 'key_path': keyPath}})
    ep = [{'type': 'wireguard', 'tag': 'wireguard-out', 'mtu': 1280,
        'address': ['172.16.0.2/32', '2606:4700:110:8dfe:d141:69bb:6b80:925/128'],
        'private_key': 'YFYOAdbw1bKTHlNNi+aEjBM3BO7unuFC5rOkMRAz9XY=',
        'peers': [{'address': 'engage.cloudflareclient.com', 'port': 2408,
            'public_key': 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=',
            'allowed_ips': ['0.0.0.0/0', '::/0'], 'reserved': [78, 135, 76]}]}]
    rules = [{'tag': 'netflix', 'type': 'remote', 'format': 'binary',
        'url': 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/netflix.srs'}]
    wg = ['netflix']
    need_yt = ROUTE_YT
    if not need_yt:
        try:
            r = subprocess.run(['curl', '-o', '/dev/null', '-m', '2', '-s', '-w', '%{http_code}', 'https://www.youtube.com'],
                capture_output=True, text=True, timeout=5)
            need_yt = r.stdout.strip() != '200'
        except: need_yt = True
    if need_yt:
        rules.append({'tag': 'youtube', 'type': 'remote', 'format': 'binary',
            'url': 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/youtube.srs'})
        wg.append('youtube')
    return {'log': {'disabled': True, 'level': 'error', 'timestamp': True},
        'inbounds': inbound, 'endpoints': ep, 'outbounds': [{'type': 'direct', 'tag': 'direct'}],
        'route': {'rule_set': rules,
            'rules': [{'rule_set': wg, 'outbound': 'wireguard-out'}], 'final': 'direct'}}

def get_isp():
    try:
        r = requests.get('https://api.ip.sb/geoip', timeout=3)
        if r.status_code == 200 and r.json().get('country_code') and r.json().get('isp'):
            return f"{r.json()['country_code']}-{r.json()['isp']}".replace(' ', '_')
    except: pass
    try:
        r = requests.get('http://ip-api.com/json', timeout=3)
        if r.status_code == 200 and r.json().get('status') == 'success' and r.json().get('countryCode') and r.json().get('org'):
            return f"{r.json()['countryCode']}-{r.json()['org']}".replace(' ', '_')
    except: pass
    return 'Unknown'

def get_svr_ip():
    try:
        r = requests.get('http://ipv4.ip.sb', timeout=3)
        if r.status_code == 200: return r.text.strip()
    except: pass
    try:
        r = subprocess.run(['curl', '-sm', '3', 'ipv4.ip.sb'], capture_output=True, text=True, timeout=5)
        if r.returncode == 0 and r.stdout.strip(): return r.stdout.strip()
    except: pass
    try:
        r = requests.get('http://ipv6.ip.sb', timeout=3)
        if r.status_code == 200: return f"[{r.text.strip()}]"
    except: pass
    try:
        r = subprocess.run(['curl', '-sm', '3', 'ipv6.ip.sb'], capture_output=True, text=True, timeout=5)
        if r.returncode == 0 and r.stdout.strip(): return f"[{r.stdout.strip()}]"
    except: pass
    return ''

def build_peers(endpoint):
    svr = get_svr_ip()
    isp = get_isp()
    tag = f"{NODE_TAG}-{isp}" if NODE_TAG else isp
    time.sleep(2)
    data = ''
    if not NO_TUN and endpoint:
        data = f"vless://{SESSION_ID}@{endpoint}:443?encryption=none&security=tls&sni={endpoint}&fp=chrome&type=ws&path=%2F%3Fed%3D2560#{tag}-ws-argo"
    if valid_port(TUIC_EDGE): data += f"\ntuic://{SESSION_ID}:{SESSION_ID}@{svr}:{TUIC_EDGE}?sni=www.bing.com&congestion_control=bbr&udp_relay_mode=native&alpn=h3&allow_insecure=1#{tag}"
    if valid_port(HY2_EDGE): data += f"\nhysteria2://{SESSION_ID}@{svr}:{HY2_EDGE}/?sni=www.bing.com&insecure=1&alpn=h3&obfs=none#{tag}"
    if valid_port(REALM_EDGE): data += f"\nvless://{SESSION_ID}@{svr}:{REALM_EDGE}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.iij.ad.jp&fp=firefox&pbk={pubKey}&type=tcp&headerType=none#{tag}"
    if valid_port(TLS_EDGE): data += f"\nanytls://{SESSION_ID}@{svr}:{TLS_EDGE}?security=tls&sni={svr}&fp=chrome&insecure=1&allowInsecure=1#{tag}"
    if valid_port(S5_EDGE):
        a = base64.b64encode(f"{SESSION_ID[:8]}:{SESSION_ID[-12:]}".encode()).decode()
        data += f"\nsocks://{a}@{svr}:{S5_EDGE}#{tag}"
    write_secure(encData, base64.b64encode(data.encode()).decode())
    write_secure(peerList, data)
    return data

def notify_tg():
    if not TG_BOT or not TG_CHAT: return
    try:
        with open(encData, 'r') as f: msg = f.read()
        esc = re.sub(r'([_*[\]()~`>#+=|{}.!-])', r'\\\1', NODE_TAG)
        requests.post(f"https://api.telegram.org/bot{TG_BOT}/sendMessage",
            params={'chat_id': TG_CHAT, 'text': f"**{esc} Update**\n```{msg}```", 'parse_mode': 'MarkdownV2'}, timeout=30)
    except: pass

def sync_remote():
    if REMOTE_SYNC and PUBLIC_URL:
        try:
            requests.post(f"{REMOTE_SYNC}/api/add-subscriptions",
                json={'subscription': [f"{PUBLIC_URL}/{API_PATH}"]}, timeout=30)
        except: pass
    elif REMOTE_SYNC:
        if not os.path.exists(peerList): return
        with open(peerList, 'r') as f: c = f.read()
        nodes = [l for l in c.split('\n') if re.search(r'(vless|vmess|trojan|hysteria2|tuic):\/\/', l)]
        if nodes:
            try: requests.post(f"{REMOTE_SYNC}/api/add-nodes", json={'nodes': nodes}, timeout=30)
            except: pass

def ping_keep():
    if not AUTO_PING or not PUBLIC_URL: return
    try:
        requests.post('https://keep.gvrander.eu.org/add-url', json={'url': PUBLIC_URL}, timeout=30)
    except: pass

def dummy_traffic():
    sites = ['https://www.google.com', 'https://www.github.com', 'https://stackoverflow.com', 'https://www.python.org', 'https://news.ycombinator.com']
    for site in sites:
        try:
            requests.get(site, headers={'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36'}, timeout=5)
        except: pass
        time.sleep(3 + random.random() * 4)

def download_binary(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    tmp = dest + '.dl'
    log(f'Downloading {url}')
    r = requests.get(url, stream=True, timeout=180)
    r.raise_for_status()
    with open(tmp, 'wb') as f:
        for chunk in r.iter_content(8192):
            f.write(chunk)
    os.chmod(tmp, 0o755)
    os.replace(tmp, dest)
    log(f'Saved {dest}')
    return dest

def ensure_singbox(bin_dir):
    sb_bin = os.path.join(bin_dir, 'sing-box')
    if os.path.exists(sb_bin):
        return sb_bin
    url = f'https://github.com/SagerNet/sing-box/releases/download/v{SB_VERSION}/sing-box-{SB_VERSION}-linux-{ARCH}.tar.gz'
    tar_path = os.path.join(WORK_DIR, 'sing-box.tar.gz')
    log(f'Downloading sing-box v{SB_VERSION}...')
    download_binary(url, tar_path)
    subprocess.run(['tar', '-xzf', tar_path, '-C', bin_dir, f'--strip-components=1', f'sing-box-{SB_VERSION}-linux-{ARCH}/sing-box'], capture_output=True, check=True)
    os.unlink(tar_path)
    os.chmod(sb_bin, 0o755)
    log('sing-box binary ready')
    return sb_bin

def ensure_cloudflared(bin_dir):
    cf_bin = os.path.join(bin_dir, 'cloudflared')
    if os.path.exists(cf_bin):
        return cf_bin
    url = f'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-{ARCH}'
    log('Downloading cloudflared...')
    download_binary(url, cf_bin)
    log('cloudflared binary ready')
    return cf_bin

children = []
trycloudflare_domain = None

def start_process(name, bin_path, args):
    proc = subprocess.Popen([bin_path] + args, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    children.append(proc)

    def read_stdout():
        for line in iter(proc.stdout.readline, b''):
            if line:
                log(f'[{name}] {line.decode().strip()}')
    def read_stderr():
        global trycloudflare_domain
        for line in iter(proc.stderr.readline, b''):
            if line:
                text = line.decode()
                m = re.search(r'https://([A-Za-z0-9.-]+\.trycloudflare\.com)', text)
                if m:
                    trycloudflare_domain = m.group(1)
                log(f'[{name}] {text.strip()}')

    threading.Thread(target=read_stdout, daemon=True).start()
    threading.Thread(target=read_stderr, daemon=True).start()
    return proc

def stop_all(signum=None, frame=None):
    for p in children:
        try: p.terminate()
        except: pass
    time.sleep(2)
    for p in children:
        try: p.kill()
        except: pass
    sys.exit(0)

def wait_for_endpoint(timeout_ms):
    if TUN_DOMAIN: return TUN_DOMAIN
    deadline = time.time() + timeout_ms / 1000
    while time.time() < deadline:
        if trycloudflare_domain:
            return trycloudflare_domain
        time.sleep(1)
    return None

class Handler(BaseHTTPRequestHandler):
    svc_data = ''
    def do_GET(self):
        if self.path == syncPath:
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(base64.b64encode(self.svc_data.encode()).encode())
        elif self.path == '/debug':
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            try:
                with open(logFile, 'r') as f:
                    self.wfile.write(f.read().encode('utf-8'))
            except:
                self.wfile.write(b'debug.log not available yet')
        elif self.path == '/':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            try:
                with open(os.path.join(ROOT, 'index.html'), 'r', encoding='utf-8') as f:
                    self.wfile.write(f.read().encode('utf-8'))
            except:
                self.wfile.write(b'<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Welcome</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#fafafa;color:#333}div{text-align:center;max-width:500px;padding:20px}h1{font-size:2.5rem;font-weight:300;margin:0 0 8px;color:#444}p{color:#777;line-height:1.6}</style></head><body><div><h1>Service Running</h1><p>This server is running normally.</p></div></body></html>')
        else:
            self.send_response(404)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(b'<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>404</title><style>body{font-family:sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5;color:#333}div{text-align:center}h1{font-size:5rem;font-weight:300;margin:0;color:#999}p{color:#999}</style></head><body><div><h1>404</h1><p>Not Found</p></div></body></html>')
    def log_message(self, fmt, *args): pass

def start_http(svc_data, port):
    Handler.svc_data = svc_data
    try:
        srv = HTTPServer(('0.0.0.0', port), Handler)
        t = threading.Thread(target=srv.serve_forever, daemon=True)
        t.start()
        return srv
    except OSError as e:
        if e.errno == 98:
            raise Exception(f'Port {port} in use') from e
        else:
            raise

def bootstrap():
    log('=== bootstrap started ===')
    bin_dir = os.path.join(WORK_DIR, 'bin')
    os.makedirs(bin_dir, exist_ok=True)
    if not os.path.exists(WORK_DIR):
        os.makedirs(WORK_DIR, exist_ok=True)
    purge_old()
    remove_remote()

    log(f'UUID set: {bool(SESSION_ID)}')
    log(f'ARGO_AUTH set: {bool(TUN_AUTH)}')
    log(f'ARGO_DOMAIN: {TUN_DOMAIN or "(none)"}')
    log(f'REALITY_PORT: {REALM_EDGE or "(none)"}')
    log(f'HY2_PORT: {HY2_EDGE or "(none)"}')
    log(f'TUIC_PORT: {TUIC_EDGE or "(none)"}')

    sb_bin = None
    try:
        sb_bin = ensure_singbox(bin_dir)
    except Exception as e:
        logError(f'sing-box download failed: {e}')

    cf_bin = None
    if not NO_TUN:
        try:
            cf_bin = ensure_cloudflared(bin_dir)
        except Exception as e:
            logError(f'cloudflared download failed: {e}')

    if valid_port(REALM_EDGE):
        load_keys()

    needs_tls = HY2_EDGE or TUIC_EDGE or TLS_EDGE
    if needs_tls:
        ensure_certs()

    cfg = build_config()
    os.makedirs(os.path.dirname(cfgPath), exist_ok=True)
    with open(cfgPath, 'w') as f:
        json.dump(cfg, f, indent=2)
    log('sing-box config written')

    if sb_bin:
        start_process('sing-box', sb_bin, ['run', '-c', cfgPath])
    else:
        logError('sing-box binary not available - proxy will not start')

    if cf_bin:
        if TUN_AUTH:
            if re.match(r'^[A-Z0-9a-z=]{120,250}$', TUN_AUTH):
                start_process('cloudflared', cf_bin, ['tunnel', '--no-autoupdate', 'run', '--token', TUN_AUTH])
            elif 'TunnelSecret' in TUN_AUTH:
                setup_tunnel()
                start_process('cloudflared', cf_bin, ['tunnel', '--config', os.path.join(WORK_DIR, 'conn_config.yml'), 'run'])
        else:
            proc = subprocess.Popen([cf_bin, 'tunnel', '--url', f'http://localhost:{TUN_PORT}'],
                stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            children.append(proc)

            def read_cf_stdout():
                for line in iter(proc.stdout.readline, b''):
                    if line:
                        log(f'[cloudflared] {line.decode().strip()}')
            def read_cf_stderr():
                global trycloudflare_domain
                for line in iter(proc.stderr.readline, b''):
                    if line:
                        text = line.decode()
                        m = re.search(r'https://([A-Za-z0-9.-]+\.trycloudflare\.com)', text)
                        if m:
                            trycloudflare_domain = m.group(1)
                        log(f'[cloudflared] {text.strip()}')

            threading.Thread(target=read_cf_stdout, daemon=True).start()
            threading.Thread(target=read_cf_stderr, daemon=True).start()
    else:
        log('cloudflared binary not available - Argo tunnel will not start')

    signal.signal(signal.SIGINT, stop_all)
    signal.signal(signal.SIGTERM, stop_all)

    time.sleep(5)
    endpoint = wait_for_endpoint(30000)
    log(f'endpoint: {endpoint or "(none)"}')

    svc_data = build_peers(endpoint)
    log('subscription built, starting HTTP server')
    http_srv = start_http(svc_data, HTTP_SVC_PORT)

    sub_url = f'{PUBLIC_URL}/{syncPath}' if PUBLIC_URL else '(not set)'
    log(f'subscription URL: {sub_url}')
    notify_tg()
    sync_remote()
    ping_keep()
    log('=== bootstrap complete ===')

    threading.Thread(target=dummy_traffic, daemon=True).start()

    def delayed():
        time.sleep(45)
        cleanup(keep_data=True)
        clr()
    threading.Thread(target=delayed, daemon=True).start()

    try:
        while True: time.sleep(1)
    except KeyboardInterrupt:
        stop_all()
        if http_srv:
            http_srv.shutdown()

if __name__ == '__main__':
    bootstrap()
