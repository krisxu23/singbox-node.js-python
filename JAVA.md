# Java Sbx Native

Java 版本的 sing-box native 用于部署 VMess Ws + Argo、VLESS Reality、Hysteria2、TUIC、AnyTLS、SOCKS5 等代理，只有主进程。

## 功能

- 自动下载并缓存 `sbx.so`、`bot.so`、`v1.so` 或 `agent.so`。
- 通过 JNA 调用 native `StartSingBox`、`StartCloudflared`、`StartNezhaAgent` 启动服务。
- 支持 VMess Ws + Argo、VLESS Reality、Hysteria2、TUIC、AnyTLS、SOCKS5。
- 自动生成 Reality X25519 keypair，并校验已有 keypair 是否匹配。
- 自动生成 HY2/TUIC/AnyTLS 需要的 TLS 证书，`openssl` 不可用时使用内置 fallback 证书。
- 自动生成订阅内容，并通过 HTTP 暴露订阅。
- 可选 Telegram 推送、Merge-sub 节点自动上传、自动保活等。

## 运行要求

- JDK `>=11`
- Maven `>=3.6`
- Linux `amd64` 或 `arm64`
- 可选：`openssl`，用于生成 TLS 自签证书

## 安装与构建

```bash
cd java
mvn -DskipTests package
```

构建完成后会生成包含 JNA 依赖的 fat jar：

```text
target/server-1.0.jar
```

## 启动

```bash
java -jar target/server-1.0.jar
```

开发调试时也可以使用 Maven 直接运行：

```bash
mvn -q exec:java -Dexec.mainClass=dev.sbxnative.App
```

如果使用 `exec:java`，需要自行在 `pom.xml` 中添加 `exec-maven-plugin`，或直接使用打包后的 jar。

## 常用示例

启用 HY2、TUIC 和 AnyTLS 或 socks5：

```bash
export S5_PORT=1234
export HY2_PORT=8443
export TUIC_PORT=9443
export ANYTLS_PORT=10443
java -jar target/server-1.0.jar
```

启用 Reality：

```bash
export REALITY_PORT=443
export UUID=0a6568ff-ea3c-4271-9020-450560e10d63
java -jar target/server-1.0.jar
```

使用 Cloudflare 固定隧道：

```bash
export ARGO_DOMAIN=example.your-domain.com
export ARGO_AUTH='你的 tunnel token 或 TunnelSecret JSON'
export ARGO_PORT=8001
java -jar target/server-1.0.jar
```

禁用 Argo，只运行直连协议端口：

```bash
export DISABLE_ARGO=true
export REALITY_PORT=443
java -jar target/server-1.0.jar
```

## 环境变量

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `UPLOAD_URL` | 空 | Merge-sub 上传地址。填写后可上传订阅或节点。 |
| `PROJECT_URL` | 空 | 项目公网 URL。用于上传订阅和自动保活。 |
| `AUTO_ACCESS` | `false` | 设置为 `true` 时向保活服务提交 `PROJECT_URL`。 |
| `YT_WARPOUT` | `false` | 设置为 `true` 时强制 YouTube 走 WARP 出站规则。 |
| `FILE_PATH` | `.npm` | 运行目录，存放动态库、配置、订阅和临时文件。 |
| `SUB_PATH` | `sub` | HTTP 订阅路径，例如 `/sub`。 |
| `UUID` | `0a6568ff-ea3c-4271-9020-450560e10d63` | 节点 UUID。建议自行修改。 |
| `NEZHA_SERVER` | 空 | 哪吒服务端地址。v1 通常形如 `host:port`。 |
| `NEZHA_PORT` | 空 | 哪吒 v0 agent 端口；v1 模式留空。 |
| `NEZHA_KEY` | 空 | 哪吒 v1 的 `NZ_CLIENT_SECRET` 或 v0 agent 密钥。 |
| `ARGO_DOMAIN` | 空 | Cloudflare 固定隧道域名。为空时使用临时隧道。 |
| `ARGO_AUTH` | 空 | Cloudflare tunnel token 或 TunnelSecret JSON。 |
| `ARGO_PORT` | `8001` | cloudflared 反代到本地的端口。 |
| `S5_PORT` | 空 | SOCKS5 入站端口。为空不启用。 |
| `TUIC_PORT` | 空 | TUIC 入站端口。为空不启用。 |
| `HY2_PORT` | 空 | Hysteria2 入站端口。为空不启用。 |
| `ANYTLS_PORT` | 空 | AnyTLS 入站端口。为空不启用。 |
| `REALITY_PORT` | 空 | VLESS Reality 入站端口。为空不启用。 |
| `CFIP` | `saas.sin.fan` | VMess Argo 节点中的优选域名或 IP。 |
| `CFPORT` | `443` | `CFIP` 对应端口。 |
| `PORT` | `3000` | HTTP 订阅服务监听端口。 |
| `NAME` | 空 | 节点名称前缀。 |
| `CHAT_ID` | 空 | Telegram chat id。 |
| `BOT_TOKEN` | 空 | Telegram bot token。`CHAT_ID` 和 `BOT_TOKEN` 都存在才推送。 |
| `DISABLE_ARGO` | `false` | 设置为 `true` 时禁用 Argo/cloudflared。 |

## 运行产物

运行时会在 `FILE_PATH` 目录下生成文件：

| 文件 | 说明 |
| --- | --- |
| `config.json` | sing-box 配置。 |
| `config.yaml` | 哪吒 v1 agent 配置。 |
| `boot.log` | cloudflared 临时隧道日志。 |
| `sub.txt` | base64 订阅内容。 |
| `list.txt` | 明文节点列表。 |
| `keypair.properties` | Reality private/public keypair。 |
| `cert.pem` / `private.key` | HY2/TUIC/AnyTLS 使用的 TLS 证书和私钥。 |
| `tunnel.json` / `tunnel.yml` | Cloudflare TunnelSecret JSON 模式配置。 |

启动成功后，HTTP 订阅地址为：

```text
http://<服务器IP>:<PORT>/<SUB_PATH>
```

脚本会在启动后延迟清理部分运行文件，默认保留 `keypair.properties` 和 `sub.txt`。

## Argo 模式

- 未设置 `ARGO_DOMAIN` 或 `ARGO_AUTH`：使用 Cloudflare quick tunnel，并从 `boot.log` 中提取 `trycloudflare.com` 域名。
- 设置 token 格式的 `ARGO_AUTH`：使用 token 运行固定隧道。
- 设置包含 `TunnelSecret` 的 JSON：生成 `tunnel.json` 和 `tunnel.yml` 后运行固定隧道。
- 设置 `DISABLE_ARGO=true`：不启动 cloudflared，也不生成 VMess Argo 订阅节点。

## 哪吒模式

- `NEZHA_SERVER` + `NEZHA_KEY`，且 `NEZHA_PORT` 为空：使用 v1 agent 配置文件模式。
- `NEZHA_SERVER` + `NEZHA_KEY` + `NEZHA_PORT`：使用 v0 agent 参数模式。
- 哪吒变量为空时会跳过 agent。

## 注意事项

- Java 版通过 JNA 在 JVM 进程内调用 `.so`，无需额外 JNI glue 代码。
- 请先确认端口在部署平台开放并未被占用。
- Reality 会首次生成并持久化 `keypair.properties`，后续重启会复用同一对 key。
- HY2、TUIC、AnyTLS 会使用自签证书，客户端需要开启 `allow_insecure` 或等效选项。
- 请在符合当地法律法规和服务商规则的前提下使用。
