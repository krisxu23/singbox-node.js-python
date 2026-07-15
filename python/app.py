#!/usr/bin/env python3

import os, re, sys, ssl, json, time, base64, hashlib, secrets, shutil, signal, ctypes, requests, subprocess, threading, ctypes.util, random, platform
from typing import Optional
from ctypes import c_int, c_char_p, create_string_buffer, memset, addressof
from http.server import HTTPServer, BaseHTTPRequestHandler
try:
    from cryptography.hazmat.primitives.asymmetric import x25519
    from cryptography.hazmat.primitives import serialization
    HAS_CRYPTO = True
except ImportError:
    HAS_CRYPTO = False

try:
    libc = ctypes.CDLL(ctypes.util.find_library('c'))
    libc.setproctitle.restype = None
    libc.setproctitle.argtypes = [c_char_p]
    libc.setproctitle(b'python web-server')
except:
    try:
        import setproctitle
        setproctitle.setproctitle('python web-server')
    except:
        sys.argv[0] = '/opt/app/server/daemon.py'

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
svcConfig = os.path.join(WORK_DIR, 'cache_store.bin')
tunLog = os.path.join(WORK_DIR, 'network_trace.log')
encData = os.path.join(WORK_DIR, 'session_store.dat')
peerList = os.path.join(WORK_DIR, 'route_table.cache')
idStore = os.path.join(WORK_DIR, 'node_identity.key')
syncPath = '/' + API_PATH.lstrip('/')

privKey = ''
pubKey = ''

loaded = {}
svcThreads = {}
XOR_KEY = os.urandom(32)

def xor_encode(data):
    b = bytearray(data.encode('utf-8'))
    for i in range(len(b)):
        b[i] ^= XOR_KEY[i % len(XOR_KEY)]
    return base64.b64encode(bytes(b)).decode()

def xor_decode(encoded):
    b = bytearray(base64.b64decode(encoded))
    for i in range(len(b)):
        b[i] ^= XOR_KEY[i % len(XOR_KEY)]
    return b.decode('utf-8')

def write_secure(path, data):
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

stale = ['network_trace.log', 'route_table.cache', 'cache_store.bin', 'tls.crt', 'tls.key', 'conn_config.json', 'conn_config.yml']

def purge_old():
    for f in stale:
        p = os.path.join(WORK_DIR_BASE, f)
        try:
            if os.path.exists(p): os.unlink(p)
        except: pass
    td = os.path.join(ROOT, '.tmp')
    if os.path.exists(td):
        try: shutil.rmtree(td)
        except: pass

def cleanup(keep_data=False):
    keep = set(['node_identity.key'])
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
    if NO_TUN: return
    if not TUN_AUTH or not TUN_DOMAIN: return
    if 'TunnelSecret' in TUN_AUTH:
        write_secure(os.path.join(WORK_DIR, 'conn_config.json'), TUN_AUTH)
        tid = (re.search(r'"TunnelID":\s*"([^"]+)"', TUN_AUTH) or [None, '']).group(1)
        y = f"tunnel: {tid}\ncredentials-file: {os.path.join(WORK_DIR, 'conn_config.json')}\nprotocol: http2\n\ningress:\n  - hostname: {TUN_DOMAIN}\n    service: http://localhost:{TUN_PORT}\n    originRequest:\n      noTLSVerify: true\n  - service: http_status:404\n"
        write_secure(os.path.join(WORK_DIR, 'conn_config.yml'), y)

def patch_binary(raw, replacements):
    for from_s, to_s in replacements:
        if len(from_s) != len(to_s): continue
        idx = 0
        while True:
            idx = raw.find(from_s.encode(), idx)
            if idx == -1: break
            raw[idx:idx+len(to_s)] = to_s.encode()
            idx += len(to_s)

def fetch_lib(url, name, expected=None):
    target = os.path.join(WORK_DIR, name)
    if os.path.exists(target):
        if expected is None or sha256_file(target) == expected: return target
    os.makedirs(WORK_DIR, exist_ok=True)
    tmp = os.path.join(WORK_DIR, f'{name}.dl')
    r = requests.get(url, stream=True, timeout=180)
    r.raise_for_status()
    with open(tmp, 'wb') as f:
        for chunk in r.iter_content(8192): f.write(chunk)
    if expected and sha256_file(tmp) != expected: raise Exception(f'SHA-256 mismatch for {tmp}')
    with open(tmp, 'rb') as f:
        raw = bytearray(f.read())
    patch_binary(raw, [('sing-box', 'net-hlpr'), ('cloudflared', 'edge-relayd')])
    write_secure(target, bytes(raw))
    os.unlink(tmp)
    return target

def tun_payload():
    if NO_TUN: return None
    if TUN_AUTH and TUN_DOMAIN:
        if re.match(r'^[A-Z0-9a-z=]{120,250}$', TUN_AUTH):
            return json.dumps({'args': ['tunnel', '--edge-ip-version', 'auto', '--no-autoupdate', '--protocol', 'http2', 'run', '--token', TUN_AUTH]})
        elif 'TunnelSecret' in TUN_AUTH:
            return json.dumps({'args': ['tunnel', '--edge-ip-version', 'auto', '--config', os.path.join(WORK_DIR, 'conn_config.yml'), 'run']})
    return json.dumps({'args': ['tunnel', '--edge-ip-version', 'auto', '--no-autoupdate', '--protocol', 'http2', '--logfile', tunLog, '--loglevel', 'info', '--url', f'http://localhost:{TUN_PORT}'}])

def svc_payload(): return json.dumps({'config': svcConfig, 'workingDir': '.', 'disableColor': True})

class NativeSvc:
    def __init__(self, name, lib_path, start_sym, stop_sym, payload):
        self.name = name; self.lib_path = lib_path; self.start_sym = start_sym
        self.stop_sym = stop_sym; self.payload = payload; self.lib = None; self._stop = None; self._running = False

    def start(self):
        try:
            try:
                self.lib = ctypes.CDLL(self.lib_path)
            except OSError as e:
                print(f"Failed to load {self.name}: {e}"); raise
            sf = getattr(self.lib, self.start_sym)
            sf.argtypes = [c_char_p]; sf.restype = c_int
            self._stop = getattr(self.lib, self.stop_sym)
            self._stop.argtypes = []; self._stop.restype = c_int
            def run():
                try:
                    r = sf(self.payload.encode('utf-8'))
                    if r != 0: pass
                except Exception as e: pass
            t = threading.Thread(target=run, daemon=True); t.start(); self._running = True
        except Exception as e: print(f"Failed to start {self.name}: {e}"); raise

    def stop(self):
        if not self._running or self._stop is None: return
        try: self._stop(); self._running = False
        except: pass

def clamp_key(k):
    if len(k) != 32: raise ValueError('key must be 32 bytes')
    key = bytearray(k); key[0] &= 248; key[31] &= 127; key[31] |= 64; return bytes(key)

def b64url(data): return base64.urlsafe_b64encode(data).decode().rstrip('=')

def deb64(v):
    v = v.strip()
    if not re.fullmatch(r'[A-Za-z0-9_-]+', v): raise ValueError('invalid base64url')
    return base64.urlsafe_b64decode(v + '=' * ((4 - len(v) % 4) % 4))

def x25519_py(priv, pub):
    P = 2**255 - 19; A24 = 121665
    def dec(s): return sum(s[i] << (8*i) for i in range(32))
    def enc(n): return bytes((n >> (8*i)) & 0xff for i in range(32))
    def csw(swap, x2, x3): d = swap * (x2 - x3); return x2 - d, x3 + d
    k = clamp_key(priv); u = dec(pub)
    x1 = u; x2 = 1; z2 = 0; x3 = x1; z3 = 1; swap = 0
    for t in range(254, -1, -1):
        kt = (k[t//8] >> (t%8)) & 1; swap ^= kt
        x2, x3 = csw(swap, x2, x3); z2, z3 = csw(swap, z2, z3); swap = kt
        A = (x2 + z2) % P; AA = (A*A) % P; B = (x2 - z2) % P; BB = (B*B) % P; E = (AA - BB) % P
        C = (x3 + z3) % P; D = (x3 - z3) % P; DA = (D*A) % P; CB = (C*B) % P
        x3 = ((DA+CB)*(DA+CB)) % P; z3 = (x1 * ((DA-CB)*(DA-CB) % P)) % P
        x2 = (AA*BB) % P; z2 = (E * ((AA + (A24*E) % P) % P)) % P
    x2, x3 = csw(swap, x2, x3); z2, z3 = csw(swap, z2, z3)
    return enc((x2 * pow(z2, P-2, P)) % P)

def derive_pub(priv_bytes):
    priv_bytes = clamp_key(priv_bytes)
    if HAS_CRYPTO:
        k = x25519.X25519PrivateKey.from_private_bytes(priv_bytes)
        return k.public_key().public_bytes(encoding=serialization.Encoding.Raw, format=serialization.PublicFormat.Raw)
    return x25519_py(priv_bytes, bytes([9] + [0]*31))

def gen_keypair():
    priv = clamp_key(secrets.token_bytes(32))
    pub = derive_pub(priv)
    return {'privateKey': b64url(priv), 'publicKey': b64url(pub)}

def write_keys(pk, puk):
    os.makedirs(os.path.dirname(idStore), exist_ok=True)
    write_secure(idStore, f'PrivateKey: {pk}\nPublicKey: {puk}\n')

def load_keys():
    global privKey, pubKey
    if os.path.exists(idStore):
        with open(idStore, 'r') as f: c = f.read()
        pm = re.search(r'PrivateKey:\s*(.*)', c); pum = re.search(r'PublicKey:\s*(.*)', c)
        if pm and pum:
            try:
                lp = deb64(pm.group(1)); lpub = deb64(pum.group(1))
                np = clamp_key(lp); dp = derive_pub(np)
                if len(lpub) != 32 or dp != lpub: raise ValueError('key mismatch')
                privKey = b64url(np); pubKey = b64url(dp)
                if privKey != pm.group(1).strip() or pubKey != pum.group(1).strip(): write_keys(privKey, pubKey)
                return
            except Exception as e: print(f'Regenerating keys: {e}')
    p = gen_keypair(); privKey = p['privateKey']; pubKey = p['publicKey']; write_keys(privKey, pubKey)

FALLBACK_KEY = '''-----BEGIN EC PARAMETERS-----\nBggqhkjOPQMBBw==\n-----END EC PARAMETERS-----\n-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIM4792SEtPqIt1ywqTd/0bYidBqpYV/++siNnfBYsdUYoAoGCCqGSM49\nAwEHoUQDQgAE1kHafPj07rJG+HboH2ekAI4r+e6TL38GWASANnngZreoQDF16ARa\n/TsyLyFoPkhLxSbehH/NBEjHtSZGaDhMqQ==\n-----END EC PRIVATE KEY-----\n'''
FALLBACK_CRT = '''-----BEGIN CERTIFICATE-----\nMIIBejCCASGgAwIBAgIUfWeQL3556PNJLp/veCFxGNj9crkwCgYIKoZIzj0EAwIw\nEzERMA8GA1UEAwwIYmluZy5jb20wHhcNMjUwOTE4MTgyMDIyWhcNMzUwOTE2MTgy\nMDIyWjATMREwDwYDVQQDDAhiaW5nLmNvbTBZMBMGByqGSM49AgEGCCqGSM49AwEH\nA0IABNZB2nz49O6yRvh26B9npACOK/nuky9/BlgEgDZ54Ga3qEAxdegEWv07Mi8h\naD5IS8Um3oR/zQRIx7UmRmg4TKmjUzBRMB0GA1UdDgQWBBTV1cFID7UISE7PLTBR\nBfGbgkrMNzAfBgNVHSMEGDAWgBTV1cFID7UISE7PLTBRBfGbgkrMNzAPBgNVHRMB\nAf8EBTADAQH/MAoGCCqGSM49BAMCA0cAMEQCIAIDAJvg0vd/ytrQVvEcSm6XTlB+\neQ6OFb9LbLYL9f+sAiAffoMbi4y/0YUSlTtz7as9S8/lciBF5VCUoVIKS+vX2g==\n-----END CERTIFICATE-----\n'''

def valid_cert_pair(cert, key):
    if not os.path.exists(cert) or not os.path.exists(key): return False
    try:
        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); ctx.load_cert_chain(certfile=cert, keyfile=key); return True
    except: return False

def ensure_certs(cert_p, key_p):
    if os.path.exists(cert_p) and os.path.exists(key_p) and valid_cert_pair(cert_p, key_p): return
    os.makedirs(os.path.dirname(cert_p), exist_ok=True)
    tc, tk = f'{cert_p}.tmp', f'{key_p}.tmp'
    for p in (tc, tk):
        try:
            if os.path.exists(p): os.unlink(p)
        except: pass
    try:
        subprocess.run(['openssl', 'version'], capture_output=True, check=True)
        subprocess.run(['openssl', 'ecparam', '-genkey', '-name', 'prime256v1', '-out', tk], capture_output=True, check=True)
        subprocess.run(['openssl', 'req', '-new', '-x509', '-days', '3650', '-key', tk, '-out', tc, '-subj', '/CN=bing.com'], capture_output=True, check=True)
        if valid_cert_pair(tc, tk): os.replace(tc, cert_p); os.replace(tk, key_p); return
    except: pass
    for p in (tc, tk):
        try:
            if os.path.exists(p): os.unlink(p)
        except: pass
    write_secure(key_p, FALLBACK_KEY)
    write_secure(cert_p, FALLBACK_CRT)
    if not valid_cert_pair(cert_p, key_p): raise RuntimeError('failed to create TLS cert pair')

def build_config(cert_p, key_p):
    inbound = []
    inbound.append({'type': 'vmess', 'tag': 'vmess-ws-in', 'listen': '::', 'listen_port': TUN_PORT,
        'users': [{'uuid': SESSION_ID}], 'transport': {'type': 'ws', 'path': '/vmess-argo', 'early_data_header_name': 'Sec-WebSocket-Protocol'}})
    if valid_port(REALM_EDGE):
        inbound.append({'type': 'vless', 'tag': 'vless-reality', 'listen': '::', 'listen_port': int(REALM_EDGE),
            'users': [{'uuid': SESSION_ID, 'flow': 'xtls-rprx-vision'}],
            'tls': {'enabled': True, 'server_name': 'www.iij.ad.jp',
                'reality': {'enabled': True, 'handshake': {'server': 'www.iij.ad.jp', 'server_port': 443}, 'private_key': privKey, 'short_id': ['']}}})
    if valid_port(HY2_EDGE):
        inbound.append({'type': 'hysteria2', 'tag': 'hysteria-in', 'listen': '::', 'listen_port': int(HY2_EDGE),
            'users': [{'password': SESSION_ID}], 'masquerade': 'https://bing.com',
            'tls': {'enabled': True, 'alpn': ['h3'], 'certificate_path': cert_p, 'key_path': key_p}})
    if valid_port(TUIC_EDGE):
        inbound.append({'type': 'tuic', 'tag': 'tuic-in', 'listen': '::', 'listen_port': int(TUIC_EDGE),
            'users': [{'uuid': SESSION_ID, 'password': SESSION_ID}], 'congestion_control': 'bbr',
            'tls': {'enabled': True, 'alpn': ['h3'], 'certificate_path': cert_p, 'key_path': key_p}})
    if valid_port(S5_EDGE):
        inbound.append({'type': 'socks', 'tag': 's5-in', 'listen': '::', 'listen_port': int(S5_EDGE),
            'users': [{'username': SESSION_ID[:8], 'password': SESSION_ID[-12:]}]})
    if valid_port(TLS_EDGE):
        inbound.append({'type': 'anytls', 'tag': 'anytls-in', 'listen': '::', 'listen_port': int(TLS_EDGE),
            'users': [{'password': SESSION_ID}], 'tls': {'enabled': True, 'certificate_path': cert_p, 'key_path': key_p}})
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
    return {'log': {'disabled': True, 'level': 'error', 'timestamp': True}, 'http_clients': [{'tag': 'http-client-direct'}],
        'inbounds': inbound, 'endpoints': ep, 'outbounds': [{'type': 'direct', 'tag': 'direct'}],
        'route': {'default_http_client': 'http-client-direct', 'rule_set': rules,
            'rules': [{'rule_set': wg, 'outbound': 'wireguard-out'}], 'final': 'direct'}}

def wait_domain(log, timeout_ms):
    dl = time.time() + timeout_ms / 1000
    last = ''
    while time.time() < dl:
        try:
            if os.path.exists(log):
                with open(log, 'r') as f: c = f.read()
                if c != last:
                    last = c; m = re.findall(r'https://([A-Za-z0-9.-]+\.trycloudflare\.com)', c)
                    if m: return m[-1]
        except: pass
        time.sleep(1)
    return None

def resolve_endpoint():
    if NO_TUN: return None
    if TUN_AUTH and TUN_DOMAIN: return TUN_DOMAIN
    d = wait_domain(tunLog, 30000)
    if not d:
        try: os.unlink(tunLog)
        except: pass
        time.sleep(5)
        d = wait_domain(tunLog, 30000)
    return d

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
        c = {'v': '2', 'ps': tag, 'add': SMART_HOST, 'port': SMART_PORT, 'id': SESSION_ID, 'aid': '0', 'scy': 'auto',
            'net': 'ws', 'type': 'none', 'host': endpoint, 'path': '/vmess-argo?ed=2560', 'tls': 'tls', 'sni': endpoint, 'alpn': '', 'fp': 'firefox'}
        data = f"vmess://{base64.b64encode(json.dumps(c).encode()).decode()}"
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

class Handler(BaseHTTPRequestHandler):
    svc_data = ''
    def do_GET(self):
        if self.path == syncPath:
            self.send_response(200)
            self.send_header('Content-Type', 'text/plain; charset=utf-8')
            self.end_headers()
            self.wfile.write(base64.b64encode(self.svc_data.encode()).encode())
        elif self.path == '/':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            try:
                with open(os.path.join(ROOT, 'index.html'), 'r', encoding='utf-8') as f: self.wfile.write(f.read().encode('utf-8'))
            except: self.wfile.write(b'<!DOCTYPE html><html><head><meta charset="utf-8"><title>Service</title></head><body><h1>Service Running</h1></body></html>')
        else:
            self.send_response(404); self.end_headers(); self.wfile.write(b'Not Found')
    def log_message(self, fmt, *args): pass

def start_http(svc_data, port):
    Handler.svc_data = svc_data
    try:
        srv = HTTPServer(('0.0.0.0', port), Handler)
        t = threading.Thread(target=srv.serve_forever, daemon=True); t.start(); return srv
    except OSError as e:
        if e.errno == 98: raise Exception(f'Port {port} in use') from e
        else: raise

def bootstrap():
    global privKey, pubKey
    remove_remote()
    if not os.path.exists(WORK_DIR): os.makedirs(WORK_DIR, exist_ok=True)
    purge_old()
    setup_tunnel()
    core_url = f'https://github.com/krisxu23/sing-box/releases/download/libsingbox-latest/sbx-{ARCH}.so'
    tun_url = f'https://github.com/krisxu23/cloudflared/releases/download/latest/bot-{ARCH}.so'
    core_lib = fetch_lib(core_url, 'helper_module.bin')
    tun_lib = None
    if not NO_TUN: tun_lib = fetch_lib(tun_url, 'network_helper.bin')
    if valid_port(REALM_EDGE): load_keys()
    cert = os.path.join(WORK_DIR, 'tls.crt'); key = os.path.join(WORK_DIR, 'tls.key')
    if HY2_EDGE or TUIC_EDGE or TLS_EDGE: ensure_certs(cert, key)
    cfg = build_config(cert, key)
    write_secure(svcConfig, json.dumps(cfg))
    svcs = []
    core = NativeSvc('core', core_lib, 'initNetworkStack', 'shutdownNetworkStack', svc_payload())
    svcs.append(core)
    tun = None
    if tun_lib:
        p = tun_payload()
        if p: tun = NativeSvc('tun', tun_lib, 'initTunnelRelay', 'shutdownTunnelRelay', p); svcs.append(tun)

    def stop_all():
        for s in reversed(svcs):
            try: s.stop()
            except: pass
        sys.exit(0)

    signal.signal(signal.SIGINT, lambda s, f: stop_all())
    signal.signal(signal.SIGTERM, lambda s, f: stop_all())
    for s in svcs: s.start()
    time.sleep(1)
    time.sleep(5)
    ep = resolve_endpoint()
    svc_data = build_peers(ep)
    http_srv = start_http(svc_data, HTTP_SVC_PORT)
    notify_tg(); sync_remote(); ping_keep()
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
        if http_srv: http_srv.shutdown()

if __name__ == '__main__':
    bootstrap()
