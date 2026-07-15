# 项目改进清单

## 🔴 关键安全修复

### 1. 移除硬编码 UUID
`NanoLimbo.java` 中原先硬编码了 `5c002620-79a3-4417-bc96-86490f2c2fbd`，所有节点使用相同的 UUID 会导致被关联封禁。已改为 `UUID.randomUUID()` 自动生成。

### 2. 可配置的 sing-box 下载源
原先硬编码从个人 fork 下载，改为可通过 `SINGBOX_DOWNLOAD_URL` 环境变量指定，同时保留默认值。

### 3. 配置覆盖逻辑梳理
原先在 NanoLimbo.java 中用 setter 设值后，又调用 `loadFromEnv()` 覆盖，流程混乱。现统一在 `ServerConfig` 中管理，`loadFromEnv()` 只覆盖显式设置的环境变量。

## 🟡 伪装加强

### 4. HTTP 伪装博客大升级
- **动态头像**：支持 Gravatar 邮箱配置 `WEB_GRAVATAR_EMAIL`
- **RSS Feed**：生成 `/feed.xml`
- **robots.txt**：生成标准 robots.txt
- **nginx 行为模拟**：添加 `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy` 等标准 nginx 响应头
- **TLS 支持**：监听 443 端口时自动启用自签名 TLS
- **SEO 友好**：完整的 HTML 结构，多层文章内容

### 5. 日志清理
服务启动后自动清理 `bridge.log` 等临时日志文件，减少痕迹。

### 6. Keep-Alive 伪装为爬虫
`KeepAliveService` 使用 `UptimeBot/1.0` User-Agent 进行健康检查，更接近真实爬虫。

## 🟢 架构改进

### 7. 统一关闭流程
`ServiceManager.shutdown()` 按依赖顺序优雅关闭所有服务。

### 8. Graceful Shutdown
`NanoLimbo.main()` 中注册 JVM ShutdownHook，确保收到 SIGTERM 时正确清理。

### 9. 增强错误恢复
各服务错误不会阻塞整个启动流程，使用 try-catch 隔离错误。

## 📋 部署建议

### 最佳伪装实践
1. **使用真实域名**：通过 `ARGO_DOMAIN` 设置固定域名，而非随机生成
2. **启用 HTTP 博客**：设置 `WEB_PORT` 和 `WEB_TITLE`/`WEB_DESC`
3. **配置 Gravatar**：设置 `WEB_GRAVATAR_EMAIL` 显示真实头像
4. **Minecraft 端口**：使用 `25565` 端口（Minecraft 默认端口）
5. **日志管理**：使用 `--daemon` 参数启动，抑制控制台输出

### 推荐配置
```bash
# Minecraft 伪装
PORT=25565

# Reality (TCP)
REALITY_PORT=443

# Hysteria2 (UDP)
HY2_PORT=8443

# HTTP 博客伪装 (增强伪装)
WEB_PORT=8080
WEB_TITLE="John's Tech Blog"
WEB_DESC="Software development, Linux, and networking notes"
WEB_GRAVATAR_EMAIL="your.email@gmail.com"

# Argo Tunnel (可选)
ARGO_TOKEN=eyJ...
ARGO_DOMAIN=tunnel.example.com
```

## 🚨 安全警告

1. **不要提交凭据到 GitHub**：使用 GitHub Secrets 或 `.env` 文件管理敏感信息
2. **定期更新 sing-box**：关注 [sing-box 安全公告](https://github.com/SagerNet/sing-box/security)
3. **避免单一 UUID**：每个实例应该使用不同 UUID
4. **日志清理**：定期检查 `players.data` 等敏感文件
