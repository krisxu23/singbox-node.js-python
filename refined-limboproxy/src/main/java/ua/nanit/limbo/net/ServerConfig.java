package ua.nanit.limbo.net;

import java.util.UUID;

public class ServerConfig {

    private String domain;
    private String port;
    private String uuid;
    private String remarksPrefix;

    private String wsPort;
    private String realityPort;
    private String hy2Port;
    private String tuicPort;
    private String socks5Port;
    private String anytlsPort;

    private String tuicPassword;
    private String socks5User;
    private String socks5Password;
    private String anytlsPassword;

    private String cfIp;
    private String cfPort;

    private String sbVersion;
    private String sbDownloadUrl;
    private String cfDownloadUrl;

    private String argoDomain;
    private String argoToken;
    private boolean disableArgo;

    private String webPort;
    private String webTitle;
    private String webDesc;

    private String subPort;
    private String subPath;

    private String nezhaServer;
    private String nezhaPort;
    private String nezhaKey;

    private String tgChatId;
    private String tgBotToken;

    private boolean autoAccess;
    private String projectUrl;

    private String uploadUrl;
    private boolean ytWarpOut;

    private static final ServerConfig INSTANCE = new ServerConfig();

    public static ServerConfig getInstance() { return INSTANCE; }

    private ServerConfig() {
        this.uuid = UUID.randomUUID().toString();
        this.port = "25565";
        this.remarksPrefix = "xah";
        this.wsPort = "8001";
        this.cfIp = "www.shopify.com";
        this.cfPort = "443";
        this.sbVersion = "1.13.14";
        this.subPath = "sub";
        this.webTitle = "Personal Blog";
        this.webDesc = "Thoughts, code and notes";
    }

    public void loadFromEnv() {
        this.domain         = env("DOMAIN", domain);
        this.port           = env("PORT", port);
        this.uuid           = env("UUID", uuid);
        this.remarksPrefix  = env("REMARKS_PREFIX", remarksPrefix);
        this.wsPort         = env("WS_PORT", wsPort);
        this.realityPort    = env("REALITY_PORT", realityPort);
        this.hy2Port        = env("HY2_PORT", hy2Port);
        this.tuicPort       = env("TUCI_PORT", tuicPort);
        this.socks5Port     = env("SOCKS5_PORT", socks5Port);
        this.anytlsPort     = env("ANYTLS_PORT", anytlsPort);
        this.tuicPassword   = env("TUCI_PASSWORD", tuicPassword);
        this.socks5User     = env("SOCKS5_USER", socks5User);
        this.socks5Password = env("SOCKS5_PASSWORD", socks5Password);
        this.anytlsPassword = env("ANYTLS_PASSWORD", anytlsPassword);
        this.cfIp           = env("CF_IP", cfIp);
        this.cfPort         = env("CF_PORT", cfPort);
        this.sbVersion      = env("SINGBOX_VERSION", sbVersion);
        this.sbDownloadUrl  = env("SINGBOX_DOWNLOAD_URL", sbDownloadUrl);
        this.cfDownloadUrl  = env("CLOUDFLARED_DOWNLOAD_URL", cfDownloadUrl);
        this.argoDomain     = env("ARGO_DOMAIN", argoDomain);
        this.argoToken      = env("ARGO_TOKEN", argoToken);
        this.disableArgo    = envBool("DISABLE_ARGO");
        this.webPort        = env("WEB_PORT", webPort);
        this.webTitle       = env("WEB_TITLE", webTitle);
        this.webDesc        = env("WEB_DESC", webDesc);
        this.subPort        = env("SUB_PORT", subPort);
        this.subPath        = env("SUB_PATH", subPath);
        this.nezhaServer    = env("NEZHA_SERVER", nezhaServer);
        this.nezhaPort      = env("NEZHA_PORT", nezhaPort);
        this.nezhaKey       = env("NEZHA_KEY", nezhaKey);
        this.tgChatId       = env("TG_CHAT_ID", tgChatId);
        this.tgBotToken     = env("TG_BOT_TOKEN", tgBotToken);
        this.autoAccess     = envBool("AUTO_ACCESS");
        this.projectUrl     = env("PROJECT_URL", projectUrl);
        this.uploadUrl      = env("UPLOAD_URL", uploadUrl);
        this.ytWarpOut      = envBool("YT_WARPOUT");

        if (domain == null || domain.isEmpty()) {
            domain = fetchPublicIp();
        }

        if (tuicPassword == null || tuicPassword.isEmpty()) tuicPassword = uuid;
        if (socks5User == null || socks5User.isEmpty()) socks5User = "xah";
        if (socks5Password == null || socks5Password.isEmpty()) socks5Password = uuid;
        if (anytlsPassword == null || anytlsPassword.isEmpty()) anytlsPassword = uuid;
    }

    private static String env(String key, String fallback) {
        String v = System.getenv(key);
        return (v != null && !v.trim().isEmpty()) ? v.trim() : fallback;
    }

    private static boolean envBool(String key) {
        return "true".equalsIgnoreCase(System.getenv(key));
    }

    private String fetchPublicIp() {
        String[] services = {
            "https://api.ipify.org",
            "https://ifconfig.me/ip",
            "https://icanhazip.com"
        };
        for (String url : services) {
            try {
                java.net.http.HttpClient client = java.net.http.HttpClient.newBuilder()
                    .connectTimeout(java.time.Duration.ofSeconds(5)).build();
                java.net.http.HttpRequest req = java.net.http.HttpRequest.newBuilder()
                    .uri(java.net.URI.create(url))
                    .timeout(java.time.Duration.ofSeconds(8))
                    .GET().header("User-Agent", "curl/8.0").build();
                java.net.http.HttpResponse<String> resp = client.send(req,
                    java.net.http.HttpResponse.BodyHandlers.ofString());
                if (resp.statusCode() == 200) {
                    String ip = resp.body().trim();
                    if (ip.matches("^[0-9a-fA-F.:]+$") && ip.length() >= 7) return ip;
                }
            } catch (Exception ignored) {}
        }
        return "";
    }

    // --- Feature checks ---
    public boolean hasProxyServices() {
        return notEmpty(realityPort) || notEmpty(hy2Port) || notEmpty(tuicPort)
            || notEmpty(socks5Port) || notEmpty(anytlsPort);
    }
    public boolean isRealityEnabled() { return notEmpty(realityPort); }
    public boolean isHy2Enabled()     { return notEmpty(hy2Port); }
    public boolean isTuicEnabled()    { return notEmpty(tuicPort); }
    public boolean isSocks5Enabled()  { return notEmpty(socks5Port); }
    public boolean isAnytlsEnabled()  { return notEmpty(anytlsPort); }
    public boolean isWebEnabled()     { return notEmpty(webPort); }
    public boolean isSubEnabled()     { return notEmpty(subPort); }
    public boolean isNezhaEnabled()   { return notEmpty(nezhaServer) && notEmpty(nezhaKey); }
    public boolean isTgEnabled()      { return notEmpty(tgChatId) && notEmpty(tgBotToken); }
    public boolean isAutoAccessEnabled() { return autoAccess && notEmpty(projectUrl); }
    public boolean isUploadEnabled()  { return notEmpty(uploadUrl); }
    private boolean notEmpty(String s) { return s != null && !s.isEmpty(); }

    // --- Getters ---
    public String getDomain()       { return domain; }
    public String getPort()         { return port; }
    public String getUuid()         { return uuid; }
    public String getRemarksPrefix(){ return remarksPrefix; }
    public String getWsPort()       { return wsPort; }
    public String getRealityPort()  { return realityPort; }
    public String getHy2Port()      { return hy2Port; }
    public String getTuicPort()     { return tuicPort; }
    public String getSocks5Port()   { return socks5Port; }
    public String getAnytlsPort()   { return anytlsPort; }
    public String getTuicPassword()   { return tuicPassword; }
    public String getSocks5User()     { return socks5User; }
    public String getSocks5Password() { return socks5Password; }
    public String getAnytlsPassword() { return anytlsPassword; }
    public String getCfIp()         { return cfIp; }
    public String getCfPort()       { return cfPort; }
    public String getSbVersion()    { return sbVersion; }
    public String getSbDownloadUrl(){ return sbDownloadUrl; }
    public String getCfDownloadUrl(){ return cfDownloadUrl; }
    public String getArgoDomain()   { return argoDomain; }
    public String getArgoToken()    { return argoToken; }
    public boolean isDisableArgo()  { return disableArgo; }
    public String getWebPort()      { return webPort; }
    public String getWebTitle()     { return webTitle; }
    public String getWebDesc()      { return webDesc; }
    public String getSubPort()      { return subPort; }
    public String getSubPath()      { return subPath; }
    public String getNezhaServer()  { return nezhaServer; }
    public String getNezhaPort()    { return nezhaPort; }
    public String getNezhaKey()     { return nezhaKey; }
    public String getTgChatId()     { return tgChatId; }
    public String getTgBotToken()   { return tgBotToken; }
    public boolean isAutoAccess()   { return autoAccess; }
    public String getProjectUrl()   { return projectUrl; }
    public String getUploadUrl()    { return uploadUrl; }
    public boolean isYtWarpOut()    { return ytWarpOut; }
}
