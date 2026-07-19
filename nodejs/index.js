#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const { spawn, execSync } = require('child_process');
const axios = require('axios');

try { require('dotenv').config(); } catch {}

const LOG_FILE = path.join(process.cwd(), 'debug.log');
function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}
function logError(msg) {
  const line = `[${new Date().toISOString()}] ERROR: ${msg}`;
  console.error(line);
  try { fs.appendFileSync(LOG_FILE, line + '\n'); } catch {}
}

// Write startup marker immediately
try { fs.writeFileSync(LOG_FILE, `[${new Date().toISOString()}] === STARTUP ===\n`); } catch {}

/* ==================== Environment ==================== */

const env = {
  REMOTE_SYNC:    process.env.UPLOAD_URL     || '',
  PUBLIC_URL:     process.env.PROJECT_URL    || '',
  AUTO_PING:      process.env.AUTO_ACCESS    || false,
  ROUTE_YT:       process.env.YT_WARPOUT     || false,
  WORK_DIR_BASE:  process.env.FILE_PATH      || '.config',
  API_PATH:       process.env.SUB_PATH       || 'update',
  SESSION_ID:     process.env.UUID           || '',
  TUN_DOMAIN:     process.env.ARGO_DOMAIN    || '',
  TUN_AUTH:       process.env.ARGO_AUTH      || '',
  TUN_PORT:       Number(process.env.ARGO_PORT) || 8001,
  S5_EDGE:        process.env.S5_PORT        || '',
  TUIC_EDGE:      process.env.TUIC_PORT      || '',
  HY2_EDGE:       process.env.HY2_PORT       || '',
  TLS_EDGE:       process.env.ANYTLS_PORT    || '',
  REALM_EDGE:     process.env.REALITY_PORT   || '',
  SMART_HOST:     process.env.CFIP           || 'saas.sin.fan',
  SMART_PORT:     Number(process.env.CFPORT) || 443,
  HTTP_SVC_PORT:  Number(process.env.PORT)   || 3000,
  NODE_TAG:       process.env.NAME           || '',
  TG_CHAT:        process.env.CHAT_ID        || '',
  TG_BOT:         process.env.BOT_TOKEN      || '',
  NO_TUN:         process.env.DISABLE_ARGO   || false,
  WG_PRIVATE_KEY: process.env.WG_PRIVATE_KEY || '',
  SB_VERSION:     process.env.SB_VERSION     || '1.11.6'
};

const sensitiveKeys = [
  'UPLOAD_URL','PROJECT_URL','AUTO_ACCESS','YT_WARPOUT','UUID',
  'ARGO_DOMAIN','ARGO_AUTH',
  'ARGO_PORT','S5_PORT','TUIC_PORT','HY2_PORT','ANYTLS_PORT',
  'REALITY_PORT','CFIP','CFPORT','PORT','NAME','CHAT_ID','BOT_TOKEN','DISABLE_ARGO','WG_PRIVATE_KEY'
];
sensitiveKeys.forEach(k => { process.env[k] = ''; delete process.env[k]; });
const coverEnv = { 'NODE_ENV': 'production', 'APP_MODE': 'server', 'LOG_LEVEL': 'warn' };
Object.entries(coverEnv).forEach(([k, v]) => { process.env[k] = v; });

const ROOT = process.cwd();
const WORK_DIR = path.resolve(ROOT, env.WORK_DIR_BASE);
const syncPath = '/' + env.API_PATH.replace(/^\//, '');
const encData = path.resolve(WORK_DIR, 'session_store.dat');
const peerList = path.resolve(WORK_DIR, 'route_table.cache');
const idStore = path.resolve(WORK_DIR, 'node_identity.key');
const certPath = path.join(WORK_DIR, 'tls.crt');
const keyPath = path.join(WORK_DIR, 'tls.key');

const arch = (() => {
  const a = os.arch().toLowerCase();
  if (a === 'arm64' || a === 'aarch64') return 'arm64';
  return 'amd64';
})();

let privKey = '';
let pubKey = '';

const AES_KEY = crypto.createHash('sha256').update(env.SESSION_ID || 'default').digest();

/* ==================== Error Handlers ==================== */

process.on('uncaughtException', (err) => {
  logError(`uncaught: ${err.message}`);
  cleanup(true);
  process.exit(1);
});
process.on('unhandledRejection', (reason) => {
  logError(`unhandled rejection: ${reason}`);
});

/* ==================== Crypto ==================== */

function aesEncrypt(data) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', AES_KEY, iv);
  let encrypted = cipher.update(data, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return JSON.stringify({ iv: iv.toString('hex'), encrypted, tag: tag.toString('hex') });
}

function aesDecrypt(encoded) {
  const { iv, encrypted, tag } = JSON.parse(encoded);
  const decipher = crypto.createDecipheriv('aes-256-gcm', AES_KEY, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

/* ==================== Utilities ==================== */

function writeSecure(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(filePath, data, { mode: 0o600 });
}

function validPort(port) {
  try {
    if (port === null || port === undefined || port === '') return false;
    if (typeof port === 'string' && port.trim() === '') return false;
    const n = parseInt(port);
    if (isNaN(n)) return false;
    if (n < 1 || n > 65535) return false;
    return true;
  } catch { return false; }
}

function genRandStr(len) {
  return crypto.randomBytes(Math.ceil(len/2)).toString('hex').slice(0, len);
}

const staleFiles = ['network_trace.log', 'route_table.cache', 'cache_store.bin', 'tls.crt', 'tls.key', 'conn_config.json', 'conn_config.yml'];

function purgeOld() {
  staleFiles.forEach(f => { try { fs.rmSync(path.join(WORK_DIR, f), { force: true }); } catch {} });
  const t = path.resolve(ROOT, '.tmp');
  if (fs.existsSync(t)) { try { fs.rmSync(t, { recursive: true, force: true }); } catch {} }
}

function cleanup(keepData) {
  const keep = new Set(['node_identity.key', 'tls.crt', 'tls.key']);
  if (keepData) keep.add('session_store.dat');
  if (!fs.existsSync(WORK_DIR)) return;
  try {
    for (const f of fs.readdirSync(WORK_DIR)) {
      if (keep.has(f)) continue;
      const p = path.resolve(WORK_DIR, f);
      try {
        const s = fs.statSync(p);
        if (s.isDirectory()) fs.rmSync(p, { recursive: true, force: true });
        else fs.unlinkSync(p);
      } catch {}
    }
  } catch (e) { logError(`Cleanup error: ${e.message}`); }
  const t = path.resolve(ROOT, '.tmp');
  if (fs.existsSync(t)) { try { fs.rmSync(t, { recursive: true, force: true }); } catch {} }
}

function clr() { process.stdout.write('\x1Bc'); }

/* ==================== TLS Certificates ==================== */

function ensureCerts() {
  if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
    try {
      execSync(`openssl x509 -in "${certPath}" -noout -checkend 0`, { stdio: 'ignore' });
      return;
    } catch {}
  }
  fs.mkdirSync(path.dirname(certPath), { recursive: true });
  try {
    execSync('openssl version', { stdio: 'ignore' });
    execSync(`openssl ecparam -genkey -name prime256v1 -out "${keyPath}"`, { stdio: 'ignore' });
    execSync(`openssl req -new -x509 -days 365 -key "${keyPath}" -out "${certPath}" -subj "/CN=www.microsoft.com/O=Microsoft Corporation/C=US"`, { stdio: 'ignore' });
    return;
  } catch {}
  try {
    const forge = require('node-forge');
    const pki = forge.pki;
    const keys = pki.rsa.generateKeyPair(2048);
    const cert = pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    const now = new Date();
    cert.validity.notBefore = now;
    cert.validity.notAfter = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);
    const attrs = [
      { name: 'commonName', value: 'www.microsoft.com' },
      { name: 'organizationName', value: 'Microsoft Corporation' },
      { name: 'countryName', value: 'US' }
    ];
    cert.setSubject(attrs);
    cert.setIssuer(attrs);
    cert.sign(keys.privateKey);
    writeSecure(keyPath, pki.privateKeyToPem(keys.privateKey));
    writeSecure(certPath, pki.certificateToPem(cert));
  } catch (e) {
    logError(`Failed to generate TLS certificates: ${e.message}`);
    process.exit(1);
  }
}

/* ==================== Cloudflare Tunnel Config ==================== */

function setupTunnelConfig() {
  if (env.NO_TUN === 'true' || env.NO_TUN === true) return null;
  if (!env.TUN_AUTH || !env.TUN_DOMAIN) return null;
  if (env.TUN_AUTH.includes('TunnelSecret')) {
    writeSecure(path.join(WORK_DIR, 'conn_config.json'), env.TUN_AUTH);
    let tunnelId = '';
    try {
      const parsed = JSON.parse(env.TUN_AUTH);
      tunnelId = parsed.TunnelID || '';
    } catch {
      tunnelId = (env.TUN_AUTH.match(/"TunnelID"\s*:\s*"([^"]+)"/) || [])[1] || '';
    }
    const yaml = [
      `tunnel: ${tunnelId}`,
      `credentials-file: ${path.join(WORK_DIR, 'conn_config.json')}`,
      'protocol: http2',
      'ingress:',
      `  - hostname: ${env.TUN_DOMAIN}`,
      `    service: http://localhost:${env.TUN_PORT}`,
      '    originRequest:',
      '      noTLSVerify: true',
      '  - service: http_status:404'
    ].join('\n');
    writeSecure(path.join(WORK_DIR, 'conn_config.yml'), yaml);
    return 'config';
  }
  return 'token';
}

/* ==================== Binary Download & Process Management ==================== */

async function downloadBinary(url, dest) {
  const dir = path.dirname(dest);
  await fs.promises.mkdir(dir, { recursive: true });
  const tmp = dest + '.dl';
  const w = fs.createWriteStream(tmp);
  const r = await axios.get(url, { responseType: 'stream', timeout: 3 * 60 * 1000 });
  if (r.status < 200 || r.status >= 300) throw new Error(`HTTP ${r.status} for ${url}`);
  r.data.pipe(w);
  await new Promise((resolve, reject) => w.on('finish', resolve).on('error', reject));
  fs.chmodSync(tmp, 0o755);
  fs.renameSync(tmp, dest);
  return dest;
}

const children = [];

function startProcess(name, binPath, args) {
  const proc = spawn(binPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  children.push(proc);
  proc.stdout.on('data', d => log(`[${name}] ${d.toString().trim()}`));
  proc.stderr.on('data', d => log(`[${name}] ${d.toString().trim()}`));
  proc.on('error', err => logError(`[${name}] error: ${err.message}`));
  proc.on('exit', (code, sig) => log(`[${name}] exited [code=${code}, sig=${sig}]`));
  return proc;
}

async function stopAll() {
  children.forEach(p => { try { p.kill('SIGTERM'); } catch {} });
  await new Promise(r => setTimeout(r, 2000));
  children.forEach(p => { try { p.kill('SIGKILL'); } catch {} });
  process.exit(0);
}

/* ==================== Key Management ==================== */

function loadOrCreateKeys() {
  if (fs.existsSync(idStore)) {
    const c = fs.readFileSync(idStore, 'utf8');
    const pm = c.match(/PrivateKey:\s*(.*)/);
    const pum = c.match(/PublicKey:\s*(.*)/);
    if (pm && pum) { privKey = pm[1]; pubKey = pum[1]; return; }
  }
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  const privJwk = privateKey.export({ format: 'jwk' });
  const pubJwk = publicKey.export({ format: 'jwk' });
  privKey = privJwk.d;
  pubKey = pubJwk.x;
  writeSecure(idStore, `PrivateKey: ${privKey}\nPublicKey: ${pubKey}\n`);
}

/* ==================== sing-box Config ==================== */

function buildProxyConfig() {
  const inbound = [];

  inbound.push({
    type: 'vmess', tag: 'vmess-ws-in', listen: '::', listen_port: env.TUN_PORT,
    users: [{ uuid: env.SESSION_ID }],
    transport: { type: 'ws', path: '/vmess-argo', early_data_header_name: 'Sec-WebSocket-Protocol' }
  });

  if (validPort(env.REALM_EDGE)) {
    inbound.push({
      type: 'vless', tag: 'vless-reality', listen: '::', listen_port: parseInt(env.REALM_EDGE),
      users: [{ uuid: env.SESSION_ID, flow: 'xtls-rprx-vision' }],
      tls: {
        enabled: true, server_name: 'www.iij.ad.jp',
        reality: { enabled: true, handshake: { server: 'www.iij.ad.jp', server_port: 443 }, private_key: privKey, short_id: [''] }
      }
    });
  }

  if (validPort(env.HY2_EDGE)) {
    inbound.push({
      type: 'hysteria2', tag: 'hysteria-in', listen: '::', listen_port: parseInt(env.HY2_EDGE),
      users: [{ password: env.SESSION_ID }], masquerade: 'https://www.microsoft.com',
      tls: { enabled: true, alpn: ['h3'], certificate_path: certPath, key_path: keyPath }
    });
  }

  if (validPort(env.TUIC_EDGE)) {
    inbound.push({
      type: 'tuic', tag: 'tuic-in', listen: '::', listen_port: parseInt(env.TUIC_EDGE),
      users: [{ uuid: env.SESSION_ID, password: env.SESSION_ID }], congestion_control: 'bbr',
      tls: { enabled: true, alpn: ['h3'], certificate_path: certPath, key_path: keyPath }
    });
  }

  if (validPort(env.S5_EDGE)) {
    inbound.push({
      type: 'socks', tag: 's5-in', listen: '::', listen_port: parseInt(env.S5_EDGE),
      users: [{ username: env.SESSION_ID.substring(0, 8), password: env.SESSION_ID.slice(-12) }]
    });
  }

  if (validPort(env.TLS_EDGE)) {
    inbound.push({
      type: 'anytls', tag: 'anytls-in', listen: '::', listen_port: parseInt(env.TLS_EDGE),
      users: [{ password: env.SESSION_ID }],
      tls: { enabled: true, certificate_path: certPath, key_path: keyPath }
    });
  }

  const ep = [{
    type: 'wireguard', tag: 'wireguard-out', mtu: 1280,
    address: ['172.16.0.2/32', '2606:4700:110:8dfe:d141:69bb:6b80:925/128'],
    private_key: env.WG_PRIVATE_KEY || 'YFYOAdbw1bKTHlNNi+aEjBM3BO7unuFC5rOkMRAz9XY=',
    peers: [{
      address: 'engage.cloudflareclient.com', port: 2408,
      public_key: 'bmXOC+F1FxEMF9dyiK2H5/1SUtzH0JuVo51h2wPfgyo=',
      allowed_ips: ['0.0.0.0/0', '::/0'], reserved: [78, 135, 76]
    }]
  }];

  const rs = (tag, url) => ({ tag, type: 'remote', format: 'binary', url });
  const rules = [
    rs('netflix', 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/netflix.srs'),
    rs('openai', 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/openai.srs')
  ];
  const wgRules = ['netflix'];

  let needYT = env.ROUTE_YT === true || env.ROUTE_YT === 'true';
  if (!needYT) {
    try {
      const t = execSync('curl -o /dev/null -m 2 -s -w "%{http_code}" https://www.youtube.com', { encoding: 'utf8' }).trim();
      needYT = t !== '200';
    } catch { needYT = true; }
  }
  if (needYT) {
    rules.push(rs('youtube', 'https://raw.githubusercontent.com/MetaCubeX/meta-rules-dat/sing/geo/geosite/youtube.srs'));
    wgRules.push('youtube');
  }

  return {
    log: { disabled: true, level: 'error', timestamp: true },
    inbounds: inbound,
    endpoints: ep,
    outbounds: [{ type: 'direct', tag: 'direct' }],
    route: { rule_set: rules, rules: [{ rule_set: wgRules, outbound: 'wireguard-out' }], final: 'direct' }
  };
}

/* ==================== Network Detection ==================== */

let trycloudflareDomain = null;

async function waitForEndpoint(timeoutMs) {
  if (env.TUN_DOMAIN) return env.TUN_DOMAIN;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (trycloudflareDomain) return trycloudflareDomain;
    await new Promise(r => setTimeout(r, 1000));
  }
  return null;
}

async function getISP() {
  try {
    const r1 = await axios.get('https://api.ip.sb/geoip', { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 3000 });
    if (r1.data && r1.data.country_code && r1.data.isp) return `${r1.data.country_code}-${r1.data.isp}`.replace(/\s+/g, '_');
  } catch {
    try {
      const r2 = await axios.get('http://ip-api.com/json', { headers: { 'User-Agent': 'Mozilla/5.0' }, timeout: 3000 });
      if (r2.data && r2.data.status === 'success' && r2.data.countryCode && r2.data.org) return `${r2.data.countryCode}-${r2.data.org}`.replace(/\s+/g, '_');
    } catch {}
  }
  return 'Unknown';
}

/* ==================== Subscription ==================== */

async function buildPeers(endpoint) {
  let svr = '';
  try { const r = await axios.get('http://ipv4.ip.sb', { timeout: 3000 }); svr = r.data.trim(); } catch {
    try { svr = execSync('curl -sm 3 ipv4.ip.sb').toString().trim(); } catch {
      try { const r = await axios.get('http://ipv6.ip.sb', { timeout: 3000 }); svr = `[${r.data.trim()}]`; } catch {
        try { svr = `[${execSync('curl -sm 3 ipv6.ip.sb').toString().trim()}]`; } catch {}
      }
    }
  }

  const isp = await getISP();
  const tag = env.NODE_TAG ? `${env.NODE_TAG}-${isp}` : isp;

  await new Promise(r => setTimeout(r, 2000));

  let data = '';

  if ((env.NO_TUN !== 'true' && env.NO_TUN !== true) && endpoint) {
    const vmess = `vmess://${Buffer.from(JSON.stringify({
      v: '2', ps: tag, add: env.SMART_HOST, port: env.SMART_PORT, id: env.SESSION_ID, aid: '0',
      scy: 'auto', net: 'ws', type: 'none', host: endpoint,
      path: '/vmess-argo?ed=2560', tls: 'tls', sni: endpoint, alpn: '', fp: 'firefox'
    })).toString('base64')}`;
    data = vmess;
  }

  if (validPort(env.TUIC_EDGE)) data += `\ntuic://${env.SESSION_ID}:${env.SESSION_ID}@${svr}:${env.TUIC_EDGE}?sni=www.microsoft.com&congestion_control=bbr&udp_relay_mode=native&alpn=h3&allow_insecure=1#${tag}`;
  if (validPort(env.HY2_EDGE)) data += `\nhysteria2://${env.SESSION_ID}@${svr}:${env.HY2_EDGE}/?sni=www.microsoft.com&insecure=1&alpn=h3&obfs=none#${tag}`;
  if (validPort(env.REALM_EDGE)) data += `\nvless://${env.SESSION_ID}@${svr}:${env.REALM_EDGE}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.iij.ad.jp&fp=firefox&pbk=${pubKey}&type=tcp&headerType=none#${tag}`;
  if (validPort(env.TLS_EDGE)) data += `\nanytls://${env.SESSION_ID}@${svr}:${env.TLS_EDGE}?security=tls&sni=${svr}&fp=chrome&insecure=1&allowInsecure=1#${tag}`;
  if (validPort(env.S5_EDGE)) {
    const a = Buffer.from(`${env.SESSION_ID.substring(0, 8)}:${env.SESSION_ID.slice(-12)}`).toString('base64');
    data += `\nsocks://${a}@${svr}:${env.S5_EDGE}#${tag}`;
  }

  const enc = Buffer.from(data).toString('base64');
  writeSecure(encData, enc);
  writeSecure(peerList, aesEncrypt(data));

  return data;
}

/* ==================== Remote Sync ==================== */

async function removeRemoteNodes() {
  try {
    if (!env.REMOTE_SYNC) return;
    if (!fs.existsSync(encData)) return;
    let c;
    try { c = fs.readFileSync(encData, 'utf-8'); } catch { return; }
    const d = Buffer.from(c, 'base64').toString('utf-8');
    const nodes = d.split('\n').filter(l => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(l));
    if (!nodes.length) return;
    return axios.post(`${env.REMOTE_SYNC}/api/delete-nodes`,
      JSON.stringify({ nodes }),
      { headers: { 'Content-Type': 'application/json' } }
    ).catch(() => null);
  } catch { return null; }
}

async function notifyTG() {
  if (!env.TG_BOT || !env.TG_CHAT) return;
  try {
    const msg = fs.readFileSync(encData, 'utf8');
    const url = `https://api.telegram.org/bot${env.TG_BOT}/sendMessage`;
    const esc = env.NODE_TAG.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
    await axios.post(url, null, { params: { chat_id: env.TG_CHAT, text: `**${esc} Update**\n\`\`\`${msg}\`\`\``, parse_mode: 'MarkdownV2' } });
  } catch {}
}

async function syncRemote() {
  if (env.REMOTE_SYNC && env.PUBLIC_URL) {
    try {
      await axios.post(`${env.REMOTE_SYNC}/api/add-subscriptions`, { subscription: [`${env.PUBLIC_URL}${syncPath}`] }, { headers: { 'Content-Type': 'application/json' } });
    } catch {}
  } else if (env.REMOTE_SYNC) {
    if (!fs.existsSync(peerList)) return;
    let c;
    try {
      c = aesDecrypt(fs.readFileSync(peerList, 'utf-8'));
    } catch { return; }
    const nodes = c.split('\n').filter(l => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(l));
    if (!nodes.length) return;
    try { await axios.post(`${env.REMOTE_SYNC}/api/add-nodes`, { nodes }, { headers: { 'Content-Type': 'application/json' } }); } catch {}
  }
}

async function pingKeep() {
  if (!env.AUTO_PING || !env.PUBLIC_URL) return;
  try {
    await axios.post('https://keep.gvrander.eu.org/add-url', { url: env.PUBLIC_URL }, { headers: { 'Content-Type': 'application/json' } });
  } catch {}
}

/* ==================== HTTP Server ==================== */

function startHTTP(svcData) {
  const srv = http.createServer((req, res) => {
    res.setHeader('Server', 'nginx/1.24.0');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');

    if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
    const url = new URL(req.url, `http://localhost`);
    if (url.pathname === '/health') {
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
    } else if (url.pathname === syncPath) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(Buffer.from(svcData).toString('base64'));
    } else if (url.pathname === '/debug') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      try {
        const debugContent = fs.readFileSync(LOG_FILE, 'utf-8');
        res.end(debugContent);
      } catch {
        res.end('debug.log not available yet');
      }
    } else if (url.pathname === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      try {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
        res.end(html);
      } catch {
        res.end('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Welcome</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#fafafa;color:#333}div{text-align:center;max-width:500px;padding:20px}h1{font-size:2.5rem;font-weight:300;margin:0 0 8px;color:#444}p{color:#777;line-height:1.6}</style></head><body><div><h1>Service Running</h1><p>This server is running normally. Please check back later.</p></div></body></html>');
      }
    } else {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.end('<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>404 Not Found</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;display:flex;justify-content:center;align-items:center;height:100vh;margin:0;background:#f5f5f5;color:#333}div{text-align:center}h1{font-size:5rem;font-weight:300;margin:0;color:#999}p{color:#999;font-size:1.1rem}</style></head><body><div><h1>404</h1><p>The requested page could not be found.</p></div></body></html>');
    }
  });

  function tryListen(p, retries) {
    srv.listen(p, '0.0.0.0', () => {
      if (p !== env.HTTP_SVC_PORT) log(`port ${env.HTTP_SVC_PORT} in use, falling back to ${p}`);
    });
    srv.once('error', err => {
      if (err.code === 'EADDRINUSE' && retries > 0) tryListen(p + 1, retries - 1);
      else { logError('cannot bind to any port'); process.exit(1); }
    });
  }
  tryListen(env.HTTP_SVC_PORT, 5);
}

/* ==================== Binary Setup ==================== */

async function ensureSingBox(binDir) {
  const sbBin = path.join(binDir, 'sing-box');
  if (fs.existsSync(sbBin)) return sbBin;
  const url = `https://github.com/SagerNet/sing-box/releases/download/v${env.SB_VERSION}/sing-box-${env.SB_VERSION}-linux-${arch}.tar.gz`;
  const tarPath = path.join(WORK_DIR, 'sing-box.tar.gz');
  log(`Downloading sing-box v${env.SB_VERSION}...`);
  await downloadBinary(url, tarPath);
  execSync(`tar -xzf "${tarPath}" -C "${binDir}" --strip-components=1 sing-box-${env.SB_VERSION}-linux-${arch}/sing-box 2>/dev/null`, { stdio: 'pipe' });
  fs.unlinkSync(tarPath);
  fs.chmodSync(sbBin, 0o755);
  log('sing-box binary ready');
  return sbBin;
}

async function ensureCloudflared(binDir) {
  const cfBin = path.join(binDir, 'cloudflared');
  if (fs.existsSync(cfBin)) return cfBin;
  const url = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${arch}`;
  log('Downloading cloudflared...');
  await downloadBinary(url, cfBin);
  log('cloudflared binary ready');
  return cfBin;
}

/* ==================== Bootstrap ==================== */

async function bootstrap() {
  log('=== bootstrap started ===');
  const binDir = path.resolve(WORK_DIR, 'bin');
  await fs.promises.mkdir(binDir, { recursive: true });

  if (!fs.existsSync(WORK_DIR)) fs.mkdirSync(WORK_DIR, { recursive: true });
  purgeOld();
  removeRemoteNodes();

  log(`UUID set: ${!!env.SESSION_ID}`);
  log(`ARGO_AUTH set: ${!!env.TUN_AUTH}`);
  log(`ARGO_DOMAIN: ${env.TUN_DOMAIN || '(none)'}`);
  log(`REALITY_PORT: ${env.REALM_EDGE || '(none)'}`);
  log(`HY2_PORT: ${env.HY2_EDGE || '(none)'}`);
  log(`TUIC_PORT: ${env.TUIC_EDGE || '(none)'}`);

  let sbBin = null;
  try {
    sbBin = await ensureSingBox(binDir);
  } catch (e) {
    logError(`sing-box download failed: ${e.message}`);
  }

  let cfBin = null;
  if (env.NO_TUN !== 'true' && env.NO_TUN !== true) {
    try {
      cfBin = await ensureCloudflared(binDir);
    } catch (e) {
      logError(`cloudflared download failed: ${e.message}`);
    }
  }

  if (validPort(env.REALM_EDGE)) loadOrCreateKeys();

  const needsTLS = !!(env.HY2_EDGE || env.TUIC_EDGE || env.TLS_EDGE);
  if (needsTLS) ensureCerts();

  const cfg = buildProxyConfig();
  const cfgPath = path.join(WORK_DIR, 'config.json');
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  log('sing-box config written');

  if (sbBin) {
    startProcess('sing-box', sbBin, ['run', '-c', cfgPath]);
  } else {
    logError('sing-box binary not available - proxy will not start');
  }

  if (cfBin) {
    if (env.TUN_AUTH) {
      if (env.TUN_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
        startProcess('cloudflared', cfBin, ['tunnel', '--no-autoupdate', 'run', '--token', env.TUN_AUTH]);
      } else if (env.TUN_AUTH.match(/TunnelSecret/)) {
        setupTunnelConfig();
        startProcess('cloudflared', cfBin, ['tunnel', '--config', path.join(WORK_DIR, 'conn_config.yml'), 'run']);
      }
    } else {
      const proc = spawn(cfBin, ['tunnel', '--url', `http://localhost:${env.TUN_PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
      children.push(proc);
      proc.stdout.on('data', d => log(`[cloudflared] ${d.toString().trim()}`));
      proc.stderr.on('data', d => {
        const text = d.toString();
        const m = text.match(/https:\/\/([A-Za-z0-9.-]+\.trycloudflare\.com)/);
        if (m) trycloudflareDomain = m[1];
        log(`[cloudflared] ${text.trim()}`);
      });
      proc.on('error', err => logError(`cloudflared error: ${err.message}`));
      proc.on('exit', (code, sig) => log(`cloudflared exited [code=${code}, sig=${sig}]`));
    }
  } else {
    log('cloudflared binary not available - Argo tunnel will not start');
  }

  process.on('SIGINT', stopAll);
  process.on('SIGTERM', stopAll);

  await new Promise(r => setTimeout(r, 5000));
  const endpoint = await waitForEndpoint(30000);
  log(`endpoint: ${endpoint || '(none)'}`);

  const svcData = await buildPeers(endpoint);
  log('subscription built, starting HTTP server');
  startHTTP(svcData);

  const subUrl = env.PUBLIC_URL ? `${env.PUBLIC_URL}${syncPath}` : '(not set)';
  log(`subscription URL: ${subUrl}`);

  await notifyTG();
  await syncRemote();
  await pingKeep();

  log('=== bootstrap complete ===');

  setTimeout(() => {
    cleanup(true);
    clr();
  }, 45000);
}

bootstrap().catch(err => { logError(`bootstrap: ${err.message}`); process.exit(1); });

process.stdin.resume();
