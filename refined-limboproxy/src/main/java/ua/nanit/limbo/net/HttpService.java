package ua.nanit.limbo.net;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;
import ua.nanit.limbo.server.Log;

import java.io.*;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.concurrent.Executors;

public class HttpService {

    private final ServerConfig config;
    private HttpServer server;

    public HttpService(ServerConfig config) {
        this.config = config;
    }

    public void startup() throws Exception {
        boolean hasSub = config.isSubEnabled();
        boolean hasWeb = config.isWebEnabled();
        if (!hasSub && !hasWeb) return;

        int port = hasSub
            ? Integer.parseInt(config.getSubPort().trim())
            : Integer.parseInt(config.getWebPort().trim());

        this.server = HttpServer.create(new InetSocketAddress(port), 0);

        if (hasSub) {
            server.createContext("/" + config.getSubPath(), new SubHandler());
        }
        server.createContext("/", new WebHandler());
        server.setExecutor(Executors.newFixedThreadPool(2));
        server.start();
        Log.info("[server] Web service started on port %d", port);
    }

    public void stop() {
        if (server != null) {
            server.stop(0);
            server = null;
        }
    }

    private static void setHeaders(HttpExchange ex) {
        ex.getResponseHeaders().set("Server", "nginx");
        ex.getResponseHeaders().set("X-Content-Type-Options", "nosniff");
    }

    private class SubHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            Path dataFile = Paths.get(System.getProperty("user.dir"), "players.data");
            if (!Files.exists(dataFile)) {
                exchange.sendResponseHeaders(404, -1);
                exchange.close();
                return;
            }
            byte[] content = Files.readAllBytes(dataFile);
            exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=utf-8");
            setHeaders(exchange);
            exchange.sendResponseHeaders(200, content.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(content);
            }
        }
    }

    private class WebHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String path = exchange.getRequestURI().getPath();
            byte[] bytes;
            int status;

            if ("/favicon.ico".equals(path)) {
                exchange.sendResponseHeaders(204, -1);
                exchange.close();
                return;
            }

            if ("/".equals(path) || "/index.html".equals(path)) {
                bytes = buildPage().getBytes(StandardCharsets.UTF_8);
                status = 200;
            } else {
                bytes = build404().getBytes(StandardCharsets.UTF_8);
                status = 404;
            }

            exchange.getResponseHeaders().set("Content-Type", "text/html; charset=utf-8");
            exchange.getResponseHeaders().set("Connection", "close");
            setHeaders(exchange);
            exchange.sendResponseHeaders(status, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        }

        private String buildPage() {
            String title = esc(config.getWebTitle());
            String desc = esc(config.getWebDesc());
            String year = String.valueOf(java.time.Year.now().getValue());
            return "<!DOCTYPE html><html lang=\"en\"><head>"
                + "<meta charset=\"UTF-8\">"
                + "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1.0\">"
                + "<meta name=\"description\" content=\"" + desc + "\">"
                + "<title>" + title + "</title>"
                + "<style>"
                + "*{box-sizing:border-box;margin:0;padding:0}"
                + "body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;"
                + "color:#333;background:#fafafa;line-height:1.6;max-width:720px;margin:0 auto;padding:40px 20px}"
                + "header{border-bottom:2px solid #e0e0e0;padding-bottom:16px;margin-bottom:32px}"
                + "header h1{font-size:28px;font-weight:700;color:#222}"
                + "header p{color:#666;margin-top:4px;font-size:14px}"
                + "main article{margin-bottom:24px;padding-bottom:16px;border-bottom:1px solid #eee}"
                + "main article h3{font-size:18px;margin-bottom:4px}"
                + "main article h3 a{color:#2563eb;text-decoration:none}"
                + "main article .meta{font-size:13px;color:#999;margin-bottom:8px}"
                + "code{background:#f0f0f0;padding:2px 6px;border-radius:3px;font-size:13px}"
                + "footer{margin-top:40px;padding-top:20px;border-top:2px solid #e0e0e0;"
                + "color:#999;font-size:13px;text-align:center}"
                + "</style></head><body>"
                + "<header><h1>" + title + "</h1><p>" + desc + "</p></header>"
                + "<main>"
                + "<article><h3><a href=\"/post/hello-world/\">Hello World</a></h3>"
                + "<div class=\"meta\">" + year + " &middot; 3 min read</div>"
                + "<p>Welcome to my blog. I write about software, networking, and Linux.</p></article>"
                + "<article><h3><a href=\"/post/setting-up-a-server/\">Setting Up a Linux Server</a></h3>"
                + "<div class=\"meta\">" + (Integer.parseInt(year)-1) + " &middot; 5 min read</div>"
                + "<p>Basic server setup notes: SSH, firewall, Docker, and monitoring.</p></article>"
                + "</main>"
                + "<footer>&copy; " + year + " " + title + "</footer>"
                + "</body></html>";
        }

        private String build404() {
            return "<!DOCTYPE html><html><head><meta charset=\"UTF-8\">"
                + "<title>404</title>"
                + "<style>body{font-family:sans-serif;color:#666;text-align:center;padding:80px 20px}"
                + "h1{font-size:64px;color:#ddd}</style></head>"
                + "<body><h1>404</h1><p>Not Found</p></body></html>";
        }
    }

    private static String esc(String s) {
        if (s == null) return "";
        return s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;");
    }
}
