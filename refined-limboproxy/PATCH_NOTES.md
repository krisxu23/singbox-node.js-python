# 补丁说明（仅采纳的改进）

根据你的评估反馈，这里列出所有实际采纳的改进和对应的文件修改。

---

## P0: 安全与可靠性（必须合入）

### 1. UUID 随机生成
**文件**: `net/ServerConfig.java`  
**改动**: `this.uuid = UUID.randomUUID().toString()` 替代硬编码  
**回退**: 环境变量 `UUID` 可覆盖（用于恢复已知节点）

```java
// 新版 ServerConfig 构造器
this.uuid = UUID.randomUUID().toString();
// loadFromEnv() 中
this.uuid = env("UUID", uuid); // 有 env UUID 则覆盖
```

### 2. 优雅关闭 (ShutdownHook)
**文件**: `NanoLimbo.java`  
**改动**: 注册 JVM ShutdownHook，按依赖顺序关闭所有服务

```java
Runtime.getRuntime().addShutdownHook(new Thread(() -> {
    serviceManager.shutdown();  // KeepAlive → HTTP → Tunnel → Net
}));
```

### 3. 配置覆盖逻辑修复
**文件**: `NanoLimbo.java`, `net/ServerConfig.java`  
**原有问题**: NanoLimbo.java 里 setter 设值后被 loadFromEnv() 覆盖  
**修复**:  
- NanoLimbo.java 不再调用任何 setter，只调用 `config.loadFromEnv()`  
- ServerConfig 所有默认值在构造器中一次设置
- `loadFromEnv()` 用 `env(key, fallback)` 模式：有环境变量则用，否则保留默认值

---

## P1: 伪装增强

### 4. Keep-Alive 爬虫 User-Agent
**文件**: `net/KeepAliveService.java`  
**改动**: 轮换使用 Googlebot / UptimeRobot / Bingbot 的 User-Agent

```java
private static final String[] USER_AGENTS = {
    "Mozilla/5.0 (compatible; Googlebot/2.1; ...)",
    "Mozilla/5.0 (compatible; UptimeRobot/2.0; ...)",
    "Mozilla/5.0 (compatible; Bingbot/2.0; ...)"
};
// 每 5 分钟轮换一次
USER_AGENTS[(int)(System.currentTimeMillis() / 300000) % 3]
```

### 5. 临时文件清理
**文件**: `NanoLimbo.java`  
**改动**: 启动时清理 `lib/bridge.log` 和 `lib/singbox.log`

---

## P2: 可维护性

### 6. 可配置的二进制源
**文件**: `net/ServerConfig.java`  
**新增环境变量**:
- `SINGBOX_DOWNLOAD_URL` — 自定义 sing-box .so 下载地址
- `CLOUDFLARED_DOWNLOAD_URL` — 自定义 cloudflared .so 下载地址

### 7. Minecraft 服务器伪装
以下修改需要在你的 `LimboServer.java`（位于 `server/` 包中）手动调整：

```java
// 找到 MOTD 设置处（约在 LimboServer.java 的连接初始化部分）
// 改为原版 Minecraft 默认文本
motd = "A Minecraft Server";

// 找到 brand 设置处（ServerListPing 响应中）
// 改为常见服务端品牌
brand = "Paper";  // 或 "Vanilla"
// 注意：不要用 "NanoLimbo"，过于小众
```

---

## 文件清单

将 `src/` 目录覆盖原项目对应路径：

```
refined-limboproxy/src/main/java/ua/nanit/limbo/
├── NanoLimbo.java          # 新增 ShutdownHook + 临时文件清理
└── net/
    ├── ServerConfig.java   # UUID 随机生成 + 配置逻辑修复 + 可配置二进制源
    ├── ServiceManager.java # 新增 shutdown() 方法
    ├── HttpService.java    # 精简版（保留基础博客模板+nginx头）
    └── KeepAliveService.java # Googlebot/UptimeRobot User-Agent
```

**不需要改动的文件**（保持原样即可）:
- `net/AbstractService.java` — 已有 try-catch 隔离
- `net/NetService.java` — 功能正常
- `net/TunnelService.java` — 功能正常
- `net/NativeServiceLoader.java` — 功能正常
- `net/NezhaService.java` — 功能正常
- `net/TelegramService.java` — 功能正常
- `net/CertHelper.java` — 功能正常
- `net/LimboConstants.java` — 无需修改
- `server/` 下所有文件 — 除 MOTD/brand 外无需修改
