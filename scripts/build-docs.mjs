import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = fileURLToPath(new URL("../", import.meta.url));
const site = path.join(root, "docs/site");
const out = path.join(root, "site-dist");
const revision = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
const source = "https://github.com/muxy/hypeline-html5/blob/" + revision;
const escape = text => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
const prompt = await readFile(path.join(site, "install-hypeline.md"), "utf8");
const template = await readFile(path.join(site, "index.html"), "utf8");
const html = template.replaceAll("{{source}}", source).replaceAll("{{revision}}", revision)
  .replace("{{prompt}}", () => escape(prompt.trimEnd()));

// Build a complete release before replacing the previous preview.
const staging = await mkdtemp(path.join(tmpdir(), "hypeline-docs-"));
try {
  await cp(site, staging, { recursive: true });
  await writeFile(path.join(staging, "index.html"), html);
  await writeFile(path.join(staging, ".nojekyll"), "");
  await mkdir(path.join(staging, "sdk"));
  await cp(path.join(root, "LICENSE"), path.join(staging, "sdk/LICENSE"));
  for (const name of ["index.global.js", "index.global.js.map"]) {
    await cp(path.join(root, "dist", name), path.join(staging, "sdk", name));
  }
  await build({
    configFile: false, root: path.join(root, "examples/vanilla"), base: "./",
    build: { outDir: path.join(staging, "demo"), emptyOutDir: false }
  });
  await rm(out, { recursive: true, force: true });
  await cp(staging, out, { recursive: true });
  console.log("Built site-dist for SDK revision", revision);
} finally {
  await rm(staging, { recursive: true, force: true });
}
