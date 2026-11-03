import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { defineConfig, type Plugin } from "vite";

// After the build, list every file in dist/ and bake that list (plus a hash
// of the contents) into sw.js so the whole app is cached on the first visit.
function precacheManifest(): Plugin {
  let outDir = "dist";
  return {
    name: "precache-manifest",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
    },
    closeBundle() {
      const walk = (dir: string): string[] =>
        readdirSync(dir).flatMap((name) => {
          const full = join(dir, name);
          return statSync(full).isDirectory() ? walk(full) : [full];
        });
      const files = walk(outDir)
        .map((f) => relative(outDir, f).split("\\").join("/"))
        .filter((f) => f !== "sw.js" && !f.endsWith(".map"))
        .sort();
      const hash = createHash("sha256");
      for (const f of files) hash.update(f).update(readFileSync(join(outDir, f)));
      const urls = ["./", ...files.map((f) => `./${f}`)];
      const swPath = join(outDir, "sw.js");
      const sw = readFileSync(swPath, "utf8")
        .replace('"__VERSION__"', JSON.stringify(hash.digest("hex").slice(0, 12)))
        .replace('"__PRECACHE__"', JSON.stringify(urls));
      writeFileSync(swPath, sw);
    },
  };
}

// Relative base so the build works under https://nicf8814.github.io/ghost-booth/
export default defineConfig({
  base: "./",
  plugins: [precacheManifest()],
});
