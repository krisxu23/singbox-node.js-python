# Python EdgeConnect

Python CDN 边缘服务模块启动器，单进程无子进程。

## 功能

- 下载并缓存原生模块（`helper_module.bin`、`network_helper.bin`）
- 通过 ctypes 加载核心和隧道网关服务
- 支持 VMess+WS、VLESS Reality、Hysteria2、TUIC、AnyTLS、SOCKS5
- 自动生成 X25519 密钥对并校验
- 自动生成 TLS 证书（openssl 不可用时使用内置回退）
- 通过 HTTP API 暴露端点数据
- 可选 TG 推送、远程同步、自动保活

## 运行要求

- Python `>=3.9`
- Linux `amd64` 或 `arm64`
- 可访问模块下载地址
- Python 依赖：`requests`、`cryptography`
- 可选：`openssl`（用于生成 TLS 证书）

Windows 无法加载 Linux `.so` 文件，请部署在 Linux 环境。

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
| `CFIP` | `saas.sin.fan` | 智能路由地址 |
| `CFPORT` | `443` | 智能路由端口 |
| `PORT` | `3000` | HTTP 服务端口 |
| `NAME` | 空 | 节点名称前缀 |
| `CHAT_ID` | 空 | Telegram 聊天 ID |
| `BOT_TOKEN` | 空 | Telegram 机器人令牌 |
| `DISABLE_ARGO` | `false` | 禁用隧道网关 |

## 运行产物

`FILE_PATH` 目录下生成：

| 文件 | 说明 |
| --- | --- |
| `cache_store.bin` | 服务配置 |
| `network_trace.log` | 隧道网关日志 |
| `session_store.dat` | 编码后的端点数据 |
| `route_table.cache` | 路由表缓存 |
| `node_identity.key` | X25519 密钥对 |
| `tls.crt` / `tls.key` | TLS 证书和密钥 |
| `conn_config.json` / `conn_config.yml` | 隧道连接配置 |

HTTP API：`http://<host>:<PORT>/<SUB_PATH>`

启动后自动清理临时文件，保留 `node_identity.key` 和 `session_store.dat`。

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
