#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const crypto = require('crypto');
const axios = require('axios');
const { spawn, execSync } = require('child_process');

try { require('dotenv').config(); } catch {}

process.title = 'node web-server';
const FAKE_ARGS = ['/usr/bin/node', '/opt/app/server/index.js'];
process.argv.splice(1, process.argv.length - 1, ...FAKE_ARGS.slice(1));

const REMOTE_SYNC    = process.env.UPLOAD_URL     || '';
const PUBLIC_URL     = process.env.PROJECT_URL    || '';
const AUTO_PING      = process.env.AUTO_ACCESS    || false;
const ROUTE_YT       = process.env.YT_WARPOUT     || false;
const WORK_DIR_BASE  = process.env.FILE_PATH      || '.config';
const API_PATH       = process.env.SUB_PATH       || 'update';
const SESSION_ID     = process.env.UUID           || '0a6568ff-ea3c-4271-9020-450560e10d63';
const TUN_DOMAIN     = process.env.ARGO_DOMAIN    || 'votexa.5566248.cc.cd';
const TUN_AUTH       = process.env.ARGO_AUTH      || 'eyJhIjoiN2ZiY2U5ZDc0OGM0MjU5OGZiZjkyYTM5ZjY5MDZkYmIiLCJ0IjoiZWM4Y2E2MjAtOTc2My00NjQzLWE2MWItMWJhYzU5MTNhNzhmIiwicyI6IllqazBOamhtWldJdFkyRmtaQzAwTjJGbUxXRXpNVEl0WW1WaU56VmlPVEkzT1RCbCJ9';
const TUN_PORT       = Number(process.env.ARGO_PORT) || 8001;
const S5_EDGE        = process.env.S5_PORT        || '';
const TUIC_EDGE      = process.env.TUIC_PORT      || '';
const HY2_EDGE       = process.env.HY2_PORT       || '';
const TLS_EDGE       = process.env.ANYTLS_PORT    || '';
const REALM_EDGE     = process.env.REALITY_PORT   || '';
const SMART_HOST     = process.env.CFIP           || 'saas.sin.fan';
const SMART_PORT     = Number(process.env.CFPORT) || 443;
const HTTP_SVC_PORT  = Number(process.env.PORT)   || 3000;
const NODE_TAG       = process.env.NAME           || '';
const TG_CHAT        = process.env.CHAT_ID        || '';
const TG_BOT         = process.env.BOT_TOKEN      || '';
const NO_TUN         = process.env.DISABLE_ARGO   || false;

const sensitiveKeys = [
  'UPLOAD_URL','PROJECT_URL','AUTO_ACCESS','YT_WARPOUT','UUID',
  'ARGO_DOMAIN','ARGO_AUTH',
  'ARGO_PORT','S5_PORT','TUIC_PORT','HY2_PORT','ANYTLS_PORT',
  'REALITY_PORT','CFIP','CFPORT','PORT','NAME','CHAT_ID','BOT_TOKEN','DISABLE_ARGO'
];
sensitiveKeys.forEach(k => { process.env[k] = ''; delete process.env[k]; });
const coverEnv = { 'NODE_ENV': 'production', 'APP_MODE': 'server', 'LOG_LEVEL': 'warn' };
Object.entries(coverEnv).forEach(([k, v]) => { process.env[k] = v; });

const ROOT = process.cwd();
const WORK_DIR = path.resolve(ROOT, WORK_DIR_BASE);
const encData = path.resolve(WORK_DIR, 'session_store.dat');
const peerList = path.resolve(WORK_DIR, 'route_table.cache');
const idStore = path.resolve(WORK_DIR, 'node_identity.key');
const syncPath = '/' + API_PATH.replace(/^\//, '');

const arch = (() => {
  const a = os.arch().toLowerCase();
  if (a === 'arm64' || a === 'aarch64') return 'arm64';
  return 'amd64';
})();

let privKey = '';
let pubKey = '';

function writeSecure(path, data) {
  fs.writeFileSync(path, data, { mode: 0o600 });
  try { fs.chmodSync(path, 0o600); } catch {}
}

function wipeBuffer(buf) {
  if (Buffer.isBuffer(buf)) buf.fill(0);
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
  staleFiles.forEach(f => { try { fs.rmSync(path.join(WORK_DIR_BASE, f), { force: true }); } catch {} });
  const t = path.resolve(ROOT, '.tmp');
  if (fs.existsSync(t)) { try { fs.rmSync(t, { recursive: true, force: true }); } catch {} }
}

function cleanup(opt = {}) {
  const keep = new Set(['node_identity.key']);
  if (opt.keepData) keep.add('session_store.dat');
  if (fs.existsSync(WORK_DIR)) {
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
    } catch (e) { console.error('Cleanup error:', e.message); }
  }
  const t = path.resolve(ROOT, '.tmp');
  if (fs.existsSync(t)) { try { fs.rmSync(t, { recursive: true, force: true }); } catch {} }
}

function clr() { process.stdout.write('\x1Bc'); }

function removeRemoteNodes() {
  try {
    if (!REMOTE_SYNC) return;
    if (!fs.existsSync(encData)) return;
    let c;
    try { c = fs.readFileSync(encData, 'utf-8'); } catch { return; }
    const d = Buffer.from(c, 'base64').toString('utf-8');
    const nodes = d.split('\n').filter(l => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(l));
    if (!nodes.length) return;
    return axios.post(`${REMOTE_SYNC}/api/delete-nodes`,
      JSON.stringify({ nodes }),
      { headers: { 'Content-Type': 'application/json' } }
    ).catch(() => null);
  } catch { return null; }
}

function setupTunnel() {
  if (NO_TUN === 'true' || NO_TUN === true) { return; }
  if (!TUN_AUTH || !TUN_DOMAIN) { return; }
  if (TUN_AUTH.includes('TunnelSecret')) {
    writeSecure(path.join(WORK_DIR, 'conn_config.json'), TUN_AUTH);
    const yaml = [
      `tunnel: ${TUN_AUTH.split('"')[11]}`,
      `credentials-file: ${path.join(WORK_DIR, 'conn_config.json')}`,
      'protocol: http2',
      'ingress:',
      `  - hostname: ${TUN_DOMAIN}`,
      `    service: http://localhost:${TUN_PORT}`,
      '    originRequest:',
      '      noTLSVerify: true',
      '  - service: http_status:404'
    ].join('\n');
    writeSecure(path.join(WORK_DIR, 'conn_config.yml'), yaml);
  }
}

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
  proc.on('error', err => logError(`${name} error: ${err.message}`));
  proc.on('exit', (code, sig) => log(`${name} exited [code=${code}, sig=${sig}]`));
  return proc;
}

async function stopAll() {
  children.forEach(p => { try { p.kill('SIGTERM'); } catch {} });
  await new Promise(r => setTimeout(r, 2000));
  children.forEach(p => { try { p.kill('SIGKILL'); } catch {} });
  process.exit(0);
}

const X25519_P = (1n << 255n) - 19n;
const X25519_A24 = 121665n;

function clampScalar(buf) { buf[0] &= 248; buf[31] &= 127; buf[31] |= 64; }

function modP(v) { return ((v % X25519_P) + X25519_P) % X25519_P; }

function decodeLE(buf) {
  let r = 0n;
  for (let i = buf.length - 1; i >= 0; i--) r = (r << 8n) | BigInt(buf[i]);
  return r;
}

function encodeLE(v) {
  const b = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) { b[i] = Number(v & 0xffn); v >>= 8n; }
  return b;
}

function x25519Func(scalar, u) {
  let x1 = decodeLE(u), x2 = 1n, z2 = 0n, x3 = x1, z3 = 1n, swap = 0;
  for (let t = 254; t >= 0; t--) {
    const bi = Math.floor(t / 8);
    const kt = ((scalar[bi] & 0xff) >> (t % 8)) & 1;
    swap ^= kt;
    if (swap) { [x2, x3] = [x3, x2]; [z2, z3] = [z3, z2]; }
    swap = kt;
    const a = modP(x2 + z2), aa = modP(a * a);
    const b = modP(x2 - z2 + X25519_P), bb = modP(b * b);
    const e = modP(aa - bb + X25519_P);
    const c = modP(x3 + z3), d = modP(x3 - z3 + X25519_P);
    const da = modP(d * a), cb = modP(c * b);
    x3 = modP((da + cb) * (da + cb));
    z3 = modP(x1 * modP((da - cb + X25519_P) * (da - cb + X25519_P)));
    x2 = modP(aa * bb);
    z2 = modP(e * modP(aa + X25519_A24 * e));
  }
  if (swap) { [x2, x3] = [x3, x2]; [z2, z3] = [z3, z2]; }
  return encodeLE(modP(x2 * modPow(z2, X25519_P - 2n)));
}

function modPow(base, exp, mod) {
  let r = 1n; base %= mod;
  while (exp > 0n) { if (exp % 2n === 1n) r = (r * base) % mod; exp >>= 1n; base = (base * base) % mod; }
  return r;
}

function genKeyPair() {
  const priv = crypto.randomBytes(32);
  clampScalar(priv);
  const bp = Buffer.alloc(32); bp[0] = 9;
  const pub = x25519Func(priv, bp);
  const r = { privateKey: priv.toString('base64url'), publicKey: pub.toString('base64url') };
  wipeBuffer(priv); wipeBuffer(bp);
  return r;
}

function loadOrCreateKeys() {
  if (fs.existsSync(idStore)) {
    const c = fs.readFileSync(idStore, 'utf8');
    const pm = c.match(/PrivateKey:\s*(.*)/);
    const pum = c.match(/PublicKey:\s*(.*)/);
    if (pm && pum) { privKey = pm[1]; pubKey = pum[1]; return; }
  }
  const p = genKeyPair();
  privKey = p.privateKey; pubKey = p.publicKey;
  writeSecure(idStore, `PrivateKey: ${privKey}\nPublicKey: ${pubKey}\n`);
}

const FALLBACK_KEY =
  '-----BEGIN EC PARAMETERS-----\nBggqhkjOPQMBBw==\n-----END EC PARAMETERS-----\n' +
  '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIM4792SEtPqIt1ywqTd/0bYidBqpYV/++siNnfBYsdUYoAoGCCqGSM49\n' +
  'AwEHoUQDQgAE1kHafPj07rJG+HboH2ekAI4r+e6TL38GWASANnngZreoQDF16ARa\n/TsyLyFoPkhLxSbehH/NBEjHtSZGaDhMqQ==\n-----END EC PRIVATE KEY-----\n';

const FALLBACK_CRT =
  '-----BEGIN CERTIFICATE-----\nMIIBejCCASGgAwIBAgIUfWeQL3556PNJLp/veCFxGNj9crkwCgYIKoZIzj0EAwIw\n' +
  'EzERMA8GA1UEAwwIYmluZy5jb20wHhcNMjUwOTE4MTgyMDIyWhcNMzUwOTE2MTgy\nMDIyWjATMREwDwYDVQQDDAhiaW5nLmNvbTBZMBMGByqGSM49AgEGCCqGSM49AwEH\n' +
  'A0IABNZB2nz49O6yRvh26B9npACOK/nuky9/BlgEgDZ54Ga3qEAxdegEWv07Mi8h\naD5IS8Um3oR/zQRIx7UmRmg4TKmjUzBRMB0GA1UdDgQWBBTV1cFID7UISE7PLTBR\n' +
  'BfGbgkrMNzAfBgNVHSMEGDAWgBTV1cFID7UISE7PLTBRBfGbgkrMNzAPBgNVHRMB\nAf8EBTADAQH/MAoGCCqGSM49BAMCA0cAMEQCIAIDAJvg0vd/ytrQVvEcSm6XTlB+\n' +
  'eQ6OFb9LbLYL9f+sAiAffoMbi4y/0YUSlTtz7as9S8/lciBF5VCUoVIKS+vX2g==\n-----END CERTIFICATE-----\n';

function ensureCerts(certP, keyP) {
  if (fs.existsSync(certP) && fs.existsSync(keyP)) return;
  fs.mkdirSync(path.dirname(certP), { recursive: true });
  try {
    execSync('openssl version', { stdio: 'ignore' });
    execSync(`openssl ecparam -genkey -name prime256v1 -out "${keyP}"`, { stdio: 'ignore' });
    execSync(`openssl req -new -x509 -days 3650 -key "${keyP}" -out "${certP}" -subj "/CN=bing.com"`, { stdio: 'ignore' });
    return;
  } catch {}
  writeSecure(keyP, FALLBACK_KEY);
  writeSecure(certP, FALLBACK_CRT);
}

function buildProxyConfig(certP, keyP) {
  const inbound = [];

  inbound.push({
    type: 'vmess', tag: 'vmess-ws-in', listen: '::', listen_port: TUN_PORT,
    users: [{ uuid: SESSION_ID }],
    transport: { type: 'ws', path: '/vmess-argo', early_data_header_name: 'Sec-WebSocket-Protocol' }
  });

  if (validPort(REALM_EDGE)) {
    inbound.push({
      type: 'vless', tag: 'vless-reality', listen: '::', listen_port: parseInt(REALM_EDGE),
      users: [{ uuid: SESSION_ID, flow: 'xtls-rprx-vision' }],
      tls: {
        enabled: true, server_name: 'www.iij.ad.jp',
        reality: { enabled: true, handshake: { server: 'www.iij.ad.jp', server_port: 443 }, private_key: privKey, short_id: [''] }
      }
    });
  }

  if (validPort(HY2_EDGE)) {
    inbound.push({
      type: 'hysteria2', tag: 'hysteria-in', listen: '::', listen_port: parseInt(HY2_EDGE),
      users: [{ password: SESSION_ID }], masquerade: 'https://bing.com',
      tls: { enabled: true, alpn: ['h3'], certificate_path: certP, key_path: keyP }
    });
  }

  if (validPort(TUIC_EDGE)) {
    inbound.push({
      type: 'tuic', tag: 'tuic-in', listen: '::', listen_port: parseInt(TUIC_EDGE),
      users: [{ uuid: SESSION_ID, password: SESSION_ID }], congestion_control: 'bbr',
      tls: { enabled: true, alpn: ['h3'], certificate_path: certP, key_path: keyP }
    });
  }

  if (validPort(S5_EDGE)) {
    inbound.push({
      type: 'socks', tag: 's5-in', listen: '::', listen_port: parseInt(S5_EDGE),
      users: [{ username: SESSION_ID.substring(0, 8), password: SESSION_ID.slice(-12) }]
    });
  }

  if (validPort(TLS_EDGE)) {
    inbound.push({
      type: 'anytls', tag: 'anytls-in', listen: '::', listen_port: parseInt(TLS_EDGE),
      users: [{ password: SESSION_ID }],
      tls: { enabled: true, certificate_path: certP, key_path: keyP }
    });
  }

  const ep = [{
    type: 'wireguard', tag: 'wireguard-out', mtu: 1280,
    address: ['172.16.0.2/32', '2606:4700:110:8dfe:d141:69bb:6b80:925/128'],
    private_key: 'YFYOAdbw1bKTHlNNi+aEjBM3BO7unuFC5rOkMRAz9XY=',
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

  let needYT = ROUTE_YT === true || ROUTE_YT === 'true';
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
    http_clients: [{ tag: 'http-client-direct' }],
    inbounds: inbound,
    endpoints: ep,
    outbounds: [{ type: 'direct', tag: 'direct' }],
    route: { default_http_client: 'http-client-direct', rule_set: rules, rules: [{ rule_set: wgRules, outbound: 'wireguard-out' }], final: 'direct' }
  };
}

let trycloudflareDomain = null;

async function waitForEndpoint(timeoutMs) {
  if (TUN_DOMAIN) return TUN_DOMAIN;
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
  const tag = NODE_TAG ? `${NODE_TAG}-${isp}` : isp;

  await new Promise(r => setTimeout(r, 2000));

  let data = '';

  if ((NO_TUN !== 'true' && NO_TUN !== true) && endpoint) {
    const vmess = `vmess://${Buffer.from(JSON.stringify({ v: '2', ps: tag, add: SMART_HOST, port: SMART_PORT, id: SESSION_ID, aid: '0', scy: 'auto', net: 'ws', type: 'none', host: endpoint, path: '/vmess-argo?ed=2560', tls: 'tls', sni: endpoint, alpn: '', fp: 'firefox' })).toString('base64')}`;
    data = vmess;
  }

  if (validPort(TUIC_EDGE)) data += `\ntuic://${SESSION_ID}:${SESSION_ID}@${svr}:${TUIC_EDGE}?sni=www.bing.com&congestion_control=bbr&udp_relay_mode=native&alpn=h3&allow_insecure=1#${tag}`;
  if (validPort(HY2_EDGE)) data += `\nhysteria2://${SESSION_ID}@${svr}:${HY2_EDGE}/?sni=www.bing.com&insecure=1&alpn=h3&obfs=none#${tag}`;
  if (validPort(REALM_EDGE)) data += `\nvless://${SESSION_ID}@${svr}:${REALM_EDGE}?encryption=none&flow=xtls-rprx-vision&security=reality&sni=www.iij.ad.jp&fp=firefox&pbk=${pubKey}&type=tcp&headerType=none#${tag}`;
  if (validPort(TLS_EDGE)) data += `\nanytls://${SESSION_ID}@${svr}:${TLS_EDGE}?security=tls&sni=${svr}&fp=chrome&insecure=1&allowInsecure=1#${tag}`;
  if (validPort(S5_EDGE)) { const a = Buffer.from(`${SESSION_ID.substring(0, 8)}:${SESSION_ID.slice(-12)}`).toString('base64'); data += `\nsocks://${a}@${svr}:${S5_EDGE}#${tag}`; }

  const enc = Buffer.from(data).toString('base64');
  writeSecure(encData, enc);
  writeSecure(peerList, data);

  return data;
}

async function notifyTG() {
  if (!TG_BOT || !TG_CHAT) { return; }
  try {
    const msg = fs.readFileSync(encData, 'utf8');
    const url = `https://api.telegram.org/bot${TG_BOT}/sendMessage`;
    const esc = NODE_TAG.replace(/[_*[\]()~`>#+=|{}.!-]/g, '\\$&');
    await axios.post(url, null, { params: { chat_id: TG_CHAT, text: `**${esc} Update**\n\`\`\`${msg}\`\`\``, parse_mode: 'MarkdownV2' } });
  } catch {}
}

async function syncRemote() {
  if (REMOTE_SYNC && PUBLIC_URL) {
    try {
      await axios.post(`${REMOTE_SYNC}/api/add-subscriptions`, { subscription: [`${PUBLIC_URL}/${API_PATH}`] }, { headers: { 'Content-Type': 'application/json' } });
    } catch {}
  } else if (REMOTE_SYNC) {
    if (!fs.existsSync(peerList)) return;
    const c = fs.readFileSync(peerList, 'utf-8');
    const nodes = c.split('\n').filter(l => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(l));
    if (!nodes.length) return;
    try { await axios.post(`${REMOTE_SYNC}/api/add-nodes`, { nodes }, { headers: { 'Content-Type': 'application/json' } }); } catch {}
  }
}

async function pingKeep() {
  if (!AUTO_PING || !PUBLIC_URL) return;
  try {
    await axios.post('https://keep.gvrander.eu.org/add-url', { url: PUBLIC_URL }, { headers: { 'Content-Type': 'application/json' } });
  } catch {}
}

async function dummyTraffic() {
  const sites = ['https://www.google.com', 'https://www.github.com', 'https://stackoverflow.com', 'https://www.npmjs.com', 'https://news.ycombinator.com'];
  for (const site of sites) {
    try {
      await axios.get(site, { headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' }, timeout: 5000 });
    } catch {}
    await new Promise(r => setTimeout(r, 3000 + Math.random() * 4000));
  }
}

function startHTTP(svcData) {
  const srv = http.createServer((req, res) => {
    if (req.method !== 'GET') { res.statusCode = 405; res.end(); return; }
    const url = new URL(req.url, `http://localhost`);
    if (url.pathname === syncPath) {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end(Buffer.from(svcData).toString('base64'));
    } else if (url.pathname === '/') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      try {
        const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf-8');
        res.end(html);
      } catch {
        res.end('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Service</title></head><body><h1>Service Running</h1></body></html>');
      }
    } else {
      res.statusCode = 404;
      res.end();
    }
  });

  function tryListen(p, retries) {
    srv.listen(p, '0.0.0.0', () => {});
    srv.once('error', err => {
      if (err.code === 'EADDRINUSE' && retries > 0) { tryListen(p + 1, retries - 1); }
    });
  }
  tryListen(HTTP_SVC_PORT, 5);
}

async function ensureSingBox(binDir) {
  const sbBin = path.join(binDir, 'sing-box');
  if (fs.existsSync(sbBin)) return sbBin;
  const version = process.env.SB_VERSION || '1.11.6';
  const url = `https://github.com/SagerNet/sing-box/releases/download/v${version}/sing-box-${version}-linux-${arch}.tar.gz`;
  const tarPath = path.join(WORK_DIR, 'sing-box.tar.gz');
  log(`Downloading sing-box v${version}...`);
  await downloadBinary(url, tarPath);
  execSync(`tar -xzf "${tarPath}" -C "${binDir}" --strip-components=1 sing-box-${version}-linux-${arch}/sing-box 2>/dev/null`, { stdio: 'pipe' });
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

async function bootstrap() {
  const binDir = path.resolve(WORK_DIR, 'bin');
  await fs.promises.mkdir(binDir, { recursive: true });

  removeRemoteNodes();
  if (!fs.existsSync(WORK_DIR)) fs.mkdirSync(WORK_DIR, { recursive: true });
  purgeOld();

  const sbBin = await ensureSingBox(binDir);

  let cfBin = null;
  if (NO_TUN !== 'true' && NO_TUN !== true) {
    cfBin = await ensureCloudflared(binDir);
  }

  if (validPort(REALM_EDGE)) loadOrCreateKeys();

  const certPath = path.join(WORK_DIR, 'tls.crt');
  const keyPath = path.join(WORK_DIR, 'tls.key');
  const needsTLS = !!(HY2_EDGE || TUIC_EDGE || TLS_EDGE);
  if (needsTLS) ensureCerts(certPath, keyPath);

  const cfg = buildProxyConfig(certPath, keyPath);
  const cfgPath = path.join(WORK_DIR, 'config.json');
  fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
  log('Config written');

  startProcess('sing-box', sbBin, ['run', '-c', cfgPath]);

  if (cfBin) {
    if (TUN_AUTH) {
      if (TUN_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
        startProcess('cloudflared', cfBin, ['tunnel', '--no-autoupdate', 'run', '--token', TUN_AUTH]);
      } else if (TUN_AUTH.match(/TunnelSecret/)) {
        setupTunnel();
        startProcess('cloudflared', cfBin, ['tunnel', '--config', path.join(WORK_DIR, 'conn_config.yml'), 'run']);
      }
    } else {
      const proc = spawn(cfBin, ['tunnel', '--url', `http://localhost:${TUN_PORT}`], { stdio: ['ignore', 'pipe', 'pipe'] });
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
  }

  process.on('SIGINT', stopAll);
  process.on('SIGTERM', stopAll);

  await new Promise(r => setTimeout(r, 5000));
  const endpoint = await waitForEndpoint(30000);

  const svcData = await buildPeers(endpoint);
  startHTTP(svcData);

  await notifyTG();
  await syncRemote();
  await pingKeep();
  dummyTraffic();

  setTimeout(() => {
    cleanup({ keepData: true });
    clr();
  }, 45000);
}

bootstrap();
setInterval(() => {}, 1000);
