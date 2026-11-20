import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs", "iife"],
  globalName: "HypelineHTML5",
  footer: ({ format }) => format === "iife" ? { js: "var MuxyGatewayHTML5 = HypelineHTML5;" } : {},
  dts: true,
  sourcemap: true,
  clean: true
});
