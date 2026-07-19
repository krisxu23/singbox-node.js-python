# singbox-node.js-python

sing-box 代理启动器，支持 Node.js 和 Python 运行环境。下载并运行 sing-box + cloudflared 二进制，提供多协议代理订阅服务。

选择运行环境

| 环境 | 文档 | 源码 |
| --- | --- | --- |
| Node.js | [nodejs/NODE.md](nodejs/NODE.md) | [nodejs/index.js](nodejs/index.js) |
| Python | [python/PYTHON.md](python/PYTHON.md) | [python/app.py](python/app.py) |

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `UPLOAD_URL` | 无 | 远程同步地址 |
| `PROJECT_URL` | 无 | 订阅更新地址 |
| `AUTO_ACCESS` | `false` | 自动接入 |
| `YT_WARPOUT` | `false` | YouTube 走 WARP 出口 |
| `FILE_PATH` | `.config` | 配置目录 |
| `SUB_PATH` | `update` | API 路径 |
| `UUID` | `0a6568ff-ea3c-4271-9020-450560e10d63` | 会话标识 |
| `ARGO_DOMAIN` | 无 | Argo 域名 |
| `ARGO_AUTH` | 无 | Argo 令牌或 JSON |
| `ARGO_PORT` | `8001` | Argo 隧道端口 |
| `S5_PORT` | 无 | S5 边缘端口 |
| `TUIC_PORT` | 无 | TUIC 边缘端口 |
| `HY2_PORT` | 无 | HY2 边缘端口 |
| `ANYTLS_PORT` | 无 | TLS 边缘端口 |
| `REALITY_PORT` | 无 | REALITY 边缘端口 |
| `CFIP` | `saas.sin.fan` | 优选路由地址 |
| `CFPORT` | `443` | 优选路由端口 |
| `PORT` | `3000` | HTTP 监听端口 |
| `NAME` | 无 | 节点名称前缀 |
| `CHAT_ID` | 无 | Telegram 聊天 ID |
| `BOT_TOKEN` | 无 | Telegram 机器人令牌 |
| `DISABLE_ARGO` | `false` | 禁用 Argo 隧道 |

## 目录结构

```
.
├── .github/workflows/build.yml
├── nodejs/
│   ├── index.js
│   ├── package.json
│   └── NODE.md
├── python/
│   ├── app.py
│   ├── requirements.txt
│   └── PYTHON.md
├── index.html
├── license
└── README.md
```

## 获取节点

运行成功后，节点订阅信息可通过以下方式获取：

| 方式 | 说明 |
| --- | --- |
| **HTTP API** | `http://<容器IP>:<PORT>/<SUB_PATH>`（默认 `http://ip:3000/update`），返回 base64 订阅数据，可直接导入客户端 |
| **本地文件** | `session_store.dat` — base64 编码的订阅数据；`route_table.cache` — AES 加密节点列表（均在 `FILE_PATH` 目录下） |
| **Telegram 推送** | 配置 `CHAT_ID` + `BOT_TOKEN` 后自动推送到 Telegram |
| **远程同步** | 配置 `UPLOAD_URL` 后自动同步到远程端点 |

## 说明

- 确保端口开放且未被占用
- sing-box 和 cloudflared 首次运行自动下载
- 进程守护每 30 秒检查，崩溃后自动重启（最多 5 次）
- TLS 使用自签证书，客户端需要开启 `allow_insecure`
- 遵守当地法律法规和服务商规定
