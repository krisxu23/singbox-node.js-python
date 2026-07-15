package ua.nanit.limbo;

import ua.nanit.limbo.net.ServerConfig;
import ua.nanit.limbo.net.ServiceManager;
import ua.nanit.limbo.server.LimboServer;
import ua.nanit.limbo.server.Log;

import java.nio.file.Files;
import java.nio.file.Paths;

public final class NanoLimbo {

    public static void main(String[] args) {
        float javaVersion = Float.parseFloat(System.getProperty("java.class.version"));
        if (javaVersion < 55.0) {
            System.err.println("ERROR: Java 11+ required");
            System.exit(1);
        }

        try {
            cleanupTempFiles();

            ServerConfig config = ServerConfig.getInstance();
            config.loadFromEnv();

            ServiceManager serviceManager = new ServiceManager();
            serviceManager.install();
            serviceManager.startup();

            Runtime.getRuntime().addShutdownHook(new Thread(() -> {
                Log.info("[server] Shutting down...");
                serviceManager.shutdown();
                Log.info("[server] Goodbye");
            }));

            new LimboServer().start();

        } catch (Exception e) {
            Log.error("[server] Fatal error: ", e);
            System.exit(1);
        }
    }

    private static void cleanupTempFiles() {
        try {
            Files.deleteIfExists(Paths.get("lib", "bridge.log"));
            Files.deleteIfExists(Paths.get("lib", "singbox.log"));
        } catch (Exception ignored) {}
    }
}
