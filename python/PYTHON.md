# Python EdgeConnect

Python 启动器：下载并运行 sing-box + cloudflared 二进制，提供代理订阅服务。

## 功能

- 下载 sing-box 和 cloudflared 二进制并启动
- 支持 VMess+WS、VLESS Reality、Hysteria2、TUIC、AnyTLS、SOCKS5
- 自动生成 X25519 密钥对并校验
- 自动生成 TLS 证书（需 openssl）
- 通过 HTTP API 暴露订阅数据
- 可选 TG 推送、远程同步、自动保活
- 进程守护 — 30 秒健康检查，异常退出自动重启（最多 5 次）
- 模拟正常流量（定时访问 Google/GitHub 等）
- 环境变量清理 + Server 头伪装

## 运行要求

- Python `>=3.9`
- Linux `amd64` 或 `arm64`
- 依赖：`requests`、`cryptography`
- 可选：`openssl`（用于生成 TLS 证书）

Windows 无法加载 Linux 二进制，请部署在 Linux 环境。

## 安装

```bash
cd python
python -m pip install -r requirements.txt
```

## 启动

```bash
python3 app.py
```

## 示例

启用 HY2、TUIC、AnyTLS 或 SOCKS5：

```bash
export HY2_PORT=8443
export TUIC_PORT=9443
export ANYTLS_PORT=10443
python3 app.py
```

使用固定隧道：

```bash
export ARGO_DOMAIN=example.your-domain.com
export ARGO_AUTH='your tunnel token or TunnelSecret JSON'
export ARGO_PORT=8001
python3 app.py
```

禁用隧道，仅直连端口：

```bash
export DISABLE_ARGO=true
export REALITY_PORT=443
python3 app.py
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `UPLOAD_URL` | 空 | 远程同步端点 |
| `PROJECT_URL` | 空 | 服务公网地址 |
| `AUTO_ACCESS` | `false` | 自动保活 |
| `YT_WARPOUT` | `false` | YouTube 走 WARP 出站 |
| `FILE_PATH` | `.config` | 工作目录 |
| `SUB_PATH` | `update` | API 路径 |
| `UUID` | `0a6568ff-ea3c-4271-9020-450560e10d63` | 会话标识 |
| `ARGO_PORT` | `8001` | 隧道本地端口 |
| `ARGO_DOMAIN` | 空 | 隧道域名 |
| `ARGO_AUTH` | 空 | 隧道令牌或 JSON |
| `S5_PORT` | 空 | S5 边缘端口 |
| `HY2_PORT` | 空 | HY2 边缘端口 |
| `TUIC_PORT` | 空 | TUIC 边缘端口 |
| `ANYTLS_PORT` | 空 | TLS 边缘端口 |
| `REALITY_PORT` | 空 | REALITY 边缘端口 |
| `CFIP` | `saas.sin.fan` | 优选路由地址 |
| `CFPORT` | `443` | 优选路由端口 |
| `PORT` | `3000` | HTTP 服务端口 |
| `NAME` | 空 | 节点名称前缀 |
| `CHAT_ID` | 空 | Telegram 聊天 ID |
| `BOT_TOKEN` | 空 | Telegram 机器人令牌 |
| `DISABLE_ARGO` | `false` | 禁用隧道 |

## 获取节点

| 方式 | 说明 |
| --- | --- |
| **HTTP API** | `http://<容器IP>:<PORT>/<SUB_PATH>`（默认 `http://ip:3000/update`），返回 base64 订阅数据 |
| **本地文件** | `session_store.dat` — base64 编码订阅数据；`route_table.cache` — AES 加密节点列表 |
| **Telegram** | 配置 `CHAT_ID` + `BOT_TOKEN` 后自动推送 |
| **远程同步** | 配置 `UPLOAD_URL` 后自动同步 |

## 运行产物

`FILE_PATH` 目录下生成：

| 文件 | 说明 |
| --- | --- |
| `session_store.dat` | base64 编码节点订阅数据 |
| `route_table.cache` | AES 加密节点列表 |
| `node_identity.key` | X25519 密钥对 |
| `tls.crt` / `tls.key` | TLS 证书和密钥 |
| `conn_config.json` / `conn_config.yml` | 隧道连接配置 |

## 身份密钥

首次运行生成 `node_identity.key`：

```text
PrivateKey: <private-key>
PublicKey: <public-key>
```

重启后持久化，文件损坏或密钥不匹配时自动重新生成。

## 隧道模式

- 未设置 `ARGO_DOMAIN` 或 `ARGO_AUTH`：动态隧道
- `ARGO_AUTH` 为 token 格式：令牌固定隧道
- `ARGO_AUTH` 含 `TunnelSecret`：生成 JSON/YML 配置
- `DISABLE_ARGO=true`：禁用隧道

## 注意事项

- 确认端口可用且未被占用
- HY2/TUIC/AnyTLS 使用自签证书，客户端需开启 `allow_insecure`
- Python 版不会自动读取 `.env` 文件，请通过环境变量或平台配置
- 请遵守当地法律法规和服务商规定
