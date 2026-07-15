package ua.nanit.limbo.net;

import ua.nanit.limbo.server.Log;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;

public class KeepAliveService {

    private static final String[] USER_AGENTS = {
        "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
        "Mozilla/5.0 (compatible; UptimeRobot/2.0; http://www.uptimerobot.com/)",
        "Mozilla/5.0 (compatible; Bingbot/2.0; +http://www.bing.com/bingbot.htm)"
    };

    private final ServerConfig config;
    private final AtomicBoolean running = new AtomicBoolean(false);
    private ScheduledExecutorService scheduler;

    public KeepAliveService(ServerConfig config) {
        this.config = config;
    }

    public void register() {
        String targetUrl = null;
        if (config.isAutoAccessEnabled()) {
            targetUrl = config.getProjectUrl();
        } else if (config.isWebEnabled()) {
            targetUrl = "http://127.0.0.1:" + config.getWebPort();
        } else if (config.isSubEnabled()) {
            targetUrl = "http://127.0.0.1:" + config.getSubPort() + "/" + config.getSubPath();
        }

        if (targetUrl == null) {
            Log.info("[keepalive] Disabled - no target URL");
            return;
        }

        if (config.isAutoAccessEnabled()) {
            try { registerAutoAccess(); }
            catch (Exception e) { Log.warn("[keepalive] Auto-access register failed: %s", e.getMessage()); }
        }

        running.set(true);
        scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "keepalive");
            t.setDaemon(true);
            return t;
        });

        String finalTarget = targetUrl;
        scheduler.scheduleAtFixedRate(() -> ping(finalTarget), 2, 5, TimeUnit.MINUTES);
        Log.info("[keepalive] Started: %s (5min interval)", targetUrl);
    }

    private void ping(String urlStr) {
        if (!running.get()) return;
        try {
            URL url = new URL(urlStr);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(15000);
            conn.setRequestMethod("GET");
            conn.setRequestProperty("User-Agent",
                USER_AGENTS[(int)(System.currentTimeMillis() / 300000) % USER_AGENTS.length]);
            int code = conn.getResponseCode();
            conn.disconnect();
            if (code >= 200 && code < 400) {
                Log.debug("[keepalive] OK: %d", code);
            } else {
                Log.warn("[keepalive] Unexpected status %d", code);
            }
        } catch (IOException e) {
            Log.warn("[keepalive] Ping failed: %s", e.getMessage());
        }
    }

    private void registerAutoAccess() throws Exception {
        URL url = new URL("https://console.autopao.com/api/v1/keepalive");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setRequestMethod("POST");
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(10000);
        conn.setDoOutput(true);
        conn.setRequestProperty("Content-Type", "application/json");
        String body = "{\"url\":\"" + config.getProjectUrl() + "\"}";
        conn.getOutputStream().write(body.getBytes());
        int code = conn.getResponseCode();
        conn.disconnect();
        Log.info("[keepalive] Auto-access register: %d", code);
    }

    public void shutdown() {
        running.set(false);
        if (scheduler != null) {
            scheduler.shutdownNow();
            scheduler = null;
        }
    }
}
