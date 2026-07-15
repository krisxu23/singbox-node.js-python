# JAVA-Minecraft-Limbo

一个伪装成 Minecraft Limbo 服务器的代理节点部署工具。

## 原理

在免费 Java 容器（如 Serv00、CT8、Hostuno 等）上运行本程序时，它会：
1. 启动 **Minecraft Limbo 服务器**（NanoLimbo）监听 `25565` 端口，看起来就是一个正常的 Minecraft 服务器
2. 在后台启动 **sing-box** 代理核心，提供 VLESS/VMess/Hysteria2/Tuic/Socks5/AnyTLS 等协议
3. 通过 **Cloudflare Argo Tunnel** 将 WebSocket 流量转发到代理节点
4. 可选启动 **HTTP 伪装博客**，进一步混淆流量

## 快速开始

### 方式一：GitHub Actions 自动构建

1. Fork 本项目
2. 在仓库 Settings → Secrets and variables → Actions 添加以下 secrets:

| Secret | 说明 | 示例 |
|--------|------|------|
| `DOMAIN` | 服务器域名/IP | `your.domain.com` |
| `NEZHA_SERVER` | 哪吒监控域名（可选） | `na.example.com` |
| `NEZHA_KEY` | 哪吒监控 Key（可选） | `xxx` |
| `TELEGRAM_CHAT_ID` | Telegram 通知（可选） | `123456789` |
| `TELEGRAM_BOT_TOKEN` | Telegram Bot Token（可选） | `bot123:abc` |
| `ARGO_TOKEN` | Cloudflare Argo Token（可选） | `eyJ...` |
| `ARGO_DOMAIN` | Argo 固定域名（可选） | `tunnel.example.com` |

3. 进入 Actions 页面，允许 workflow 运行
4. 手动运行 `Build and Release` workflow
5. 在 Release 页面下载 `server.jar`

### 方式二：手动构建

```bash
git clone https://github.com/yourname/JAVA-Minecraft-Limbo.git
cd JAVA-Minecraft-Limbo
chmod +x gradlew
./gradlew clean shadowJar
java -jar build/libs/server.jar
```

## 环境变量配置

| 变量名 | 默认值 | 说明 |
|--------|--------|------|
| `DOMAIN` | 自动获取 | 服务器域名或 IP |
| `PORT` | `25565` | Minecraft 服务器端口 |
| `UUID` | 自动生成 | 客户端 UUID |
| `REALITY_PORT` |  | VLESS+Reality 端口（TCP） |
| `HY2_PORT` |  | Hysteria2 端口（UDP） |
| `TUCI_PORT` |  | Tuic 端口（UDP） |
| `SOCKS5_PORT` |  | Socks5 端口（TCP） |
| `ANYTLS_PORT` |  | AnyTLS 端口（TCP） |
| `WS_PORT` | `8001` | VMess+WebSocket 端口（内部 Argo） |
| `ARGO_TOKEN` |  | Argo Tunnel Token |
| `ARGO_DOMAIN` |  | Argo 隧道固定域名 |
| `NEZHA_SERVER` |  | 哪吒监控域名 |
| `NEZHA_KEY` |  | 哪吒监控 Key |
| `CF_IP` | `www.shopify.com` | Cloudflare 优选 IP |
| `CF_PORT` | `443` | Cloudflare 优选端口 |
| `WEB_PORT` |  | HTTP 伪装博客端口 |
| `REMARKS_PREFIX` | `xah` | 节点备注前缀 |

## 伪装特性

- ✅ Minecraft 服务器（NanoLimbo）监听默认 25565 端口
- ✅ HTTP 个人博客伪装（可选）
- ✅ Minecraft 协议握手响应
- ✅ Argo Tunnel 流量等同于 Cloudflare 普通流量
- ✅ Reality TLS 证书伪装

## 输出文件

运行后会在当前目录生成：
- `players.data` - 节点订阅链接（Base64 编码）
- `lib/` - 运行时依赖目录
- `lib/config.json` - sing-box 配置
- `lib/cert.pem` / `lib/key.pem` - 自签名证书
