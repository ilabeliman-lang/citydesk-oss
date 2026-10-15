import { existsSync, statSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "src");
const EXTS = [".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"];
const HERE = path.dirname(fileURLToPath(import.meta.url));
/** Server modules whose import chain needs Vite/TanStack request context: swapped for tiny stubs. */
const STUBS = {
  "@/world/scan-store.server": path.join(HERE, "stubs", "scan-store.server.mjs"),
};

function withExtension(file) {
  if (existsSync(file) && statSync(file).isFile()) return file;
  for (const ext of EXTS) if (existsSync(file + ext)) return file + ext;
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  if (STUBS[specifier]) return { url: pathToFileURL(STUBS[specifier]).href, shortCircuit: true };
  if (specifier.startsWith("@/")) {
    const hit = withExtension(path.join(SRC, specifier.slice(2)));
    if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
  }
  if ((specifier.startsWith("./") || specifier.startsWith("../")) && context.parentURL?.startsWith("file:")) {
    const parent = fileURLToPath(context.parentURL);
    if (parent.startsWith(SRC)) {
      const hit = withExtension(path.resolve(path.dirname(parent), specifier));
      if (hit) return { url: pathToFileURL(hit).href, shortCircuit: true };
    }
  }
  return nextResolve(specifier, context);
}
