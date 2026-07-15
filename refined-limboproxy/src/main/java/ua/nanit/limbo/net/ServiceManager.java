package ua.nanit.limbo.net;

import ua.nanit.limbo.server.Log;

import java.io.File;

public class ServiceManager {

    private final ServerConfig config;
    private NetService netService;
    private TunnelService tunnelService;
    private HttpService httpService;
    private KeepAliveService keepAliveService;

    public ServiceManager() {
        this.config = ServerConfig.getInstance();
    }

    public void install() throws Exception {
        Log.info("[server] Initializing...");

        File libDir = new File(System.getProperty("user.dir"), "lib");
        if (!libDir.exists() && !libDir.mkdirs()) {
            throw new Exception("Cannot create lib dir: " + libDir);
        }

        netService = new NetService(config);
        netService.install();

        tunnelService = new TunnelService(config, netService.getLoader());
        tunnelService.install();

        Log.info("[server] Initialization complete");
    }

    public void startup() throws Exception {
        Log.info("[server] Starting services...");

        netService.startup();
        Thread.sleep(3000);

        tunnelService.startup();

        try {
            httpService = new HttpService(config);
            httpService.startup();
        } catch (Exception e) {
            Log.warn("[server] Web service start failed: %s", e.getMessage());
        }

        if (config.isNezhaEnabled()) {
            try {
                new NezhaService(config, netService.getLoader()).startup();
            } catch (Exception e) {
                Log.warn("[server] Nezha monitor failed: %s", e.getMessage());
            }
        }

        if (config.isTgEnabled()) {
            try {
                new TelegramService(config).push();
            } catch (Exception e) {
                Log.warn("[server] Telegram notify failed: %s", e.getMessage());
            }
        }

        try {
            keepAliveService = new KeepAliveService(config);
            keepAliveService.register();
        } catch (Exception e) {
            Log.warn("[server] KeepAlive failed: %s", e.getMessage());
        }

        Log.info("[server] All services started");
    }

    public void shutdown() {
        Log.info("[server] Shutting down services...");
        if (keepAliveService != null) keepAliveService.shutdown();
        if (httpService != null) httpService.stop();
        if (tunnelService != null) tunnelService.shutdown();
        if (netService != null) netService.shutdown();
        Log.info("[server] All services stopped");
    }
}
