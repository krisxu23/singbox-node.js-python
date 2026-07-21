# singbox-node.js-python

sing-box 代理启动器，支持 Node.js 和 Python 两种运行环境。自动下载 sing-box + cloudflared 二进制并启动，提供多协议代理订阅服务。

| 环境 | 文档 | 源码 |
| --- | --- | --- |
| Node.js | [NODE.md](nodejs/NODE.md) | [index.js](nodejs/index.js) |
| Python | [PYTHON.md](python/PYTHON.md) | [app.py](python/app.py) |

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `UUID` | `0a6568ff-ea3c-4271-9020-450560e10d63` | 会话标识 |
| `ARGO_AUTH` / `ARGO_DOMAIN` | 无 | Argo 固定隧道令牌/域名 |
| `ARGO_PORT` | `8001` | 隧道本地端口 |
| `HY2_PORT` / `TUIC_PORT` / `REALITY_PORT` / `S5_PORT` / `ANYTLS_PORT` | 无 | 协议端口（留空=不启用） |
| `CFIP` / `CFPORT` | `saas.sin.fan` / `443` | 优选路由地址/端口 |
| `PORT` | `3000` | HTTP 服务端口 |
| `FILE_PATH` | `.config` | 工作目录 |
| `SUB_PATH` | `update` | API 路径 |
| `SB_VERSION` | `1.13.14` | sing-box 版本 |
| `DISABLE_ARGO` | `false` | 禁用 Argo 隧道 |
| `NAME` | 无 | 节点名称前缀 |
| `UPLOAD_URL` | 无 | 远程同步地址 |
| `PROJECT_URL` | 无 | 订阅公网地址 |
| `AUTO_ACCESS` | `false` | 自动保活 |
| `YT_WARPOUT` | `false` | YouTube 走 WARP 出站 |
| `CHAT_ID` / `BOT_TOKEN` | 无 | Telegram 推送 |

## 获取节点

| 方式 | 说明 |
| --- | --- |
| **HTTP API** | `http://<IP>:<PORT>/<SUB_PATH>`（默认 `http://ip:3000/update`），返回 base64 订阅 |
| **本地文件** | `session_store.dat` — base64 编码订阅；`route_table.cache` — AES 加密节点列表 |
| **Telegram** | 配置 `CHAT_ID` + `BOT_TOKEN` 后自动推送 |
| **远程同步** | 配置 `UPLOAD_URL` 后自动同步 |

## 进程守护

sing-box 和 cloudflared 各运行独立自愈 watchdog。进程异常退出后 3 秒自动重启，正常退出（exit=0）或进程关闭时停止。

## 目录结构

```
.
├── nodejs/
│   ├── index.js          # 入口
│   ├── package.json      # 依赖
│   └── NODE.md
├── python/
│   ├── app.py            # 入口
│   ├── requirements.txt  # 依赖
│   └── PYTHON.md
├── index.html            # HTTP 服务默认页面
└── README.md
```

## 说明

- 首次运行自动下载 sing-box 和 cloudflared 二进制（Linux amd64/arm64）
- Reality 密钥对首次自动生成，重启后持久化
- TLS 使用自签证书，客户端需开启 `allow_insecure`
- 遵守当地法律法规和服务商规定
