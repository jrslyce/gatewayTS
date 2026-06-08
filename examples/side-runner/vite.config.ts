import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const gatewayPath = "/0.2.0/gateway-unity/0.1.0/i575hs2x9lb3u8hqujtezit03w1740";

export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  server: {
    host: "127.0.0.1",
    proxy: {
      "/muxy-gateway": {
        target: "ws://gamelink.muxy.io",
        ws: true,
        changeOrigin: true,
        rewrite: () => gatewayPath,
        configure(proxy) {
          proxy.on("proxyReqWs", (proxyReq) => {
            proxyReq.removeHeader("origin");
          });
        }
      }
    }
  }
});
