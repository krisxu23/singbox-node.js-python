# EdgeConnect Toolkit

多运行时 CDN 边缘服务模块启动器 - 单进程部署无子进程。

Multi-runtime launcher for CDN edge service modules. Single-process deployment with no child processes.

选择运行环境

| 环境 | 文档 | 源码 |
| --- | --- | --- |
| Node.js | [NODE.md](NODE.md) | [nodejs/index.js](nodejs/index.js) |
| Python | [PYTHON.md](PYTHON.md) | [python/app.py](python/app.py) |

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
│   └── package.json
├── python/
│   ├── app.py
│   └── requirements.txt
├── index.html
├── license
├── NODE.md
├── PYTHON.md
└── README.md
```

## 说明

- 确保端口开放且未被占用
- 模块需通过官方源码构建
- 配置密钥支持持久化
- TLS 使用自签证书，客户端需要开启 `allow_insecure`
- 遵守当地法律法规和服务商规定
