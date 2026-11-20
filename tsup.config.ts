import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs", "iife"],
  globalName: "HypecadeHTML5",
  footer: ({ format }) => format === "iife" ? { js: "var MuxyGatewayHTML5 = HypecadeHTML5;" } : {},
  dts: true,
  sourcemap: true,
  clean: true
});
