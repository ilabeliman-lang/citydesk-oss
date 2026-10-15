import { createServerFn } from "@tanstack/react-start";
import { buildRoster, type Department } from "./roster";

/** Names only, under this app's src. No file contents, no other app, no home directory. */
export const listOffice = createServerFn({ method: "GET" }).handler(async (): Promise<{ departments: Department[] }> => {
  const { readdir } = await import("node:fs/promises");
  const path = await import("node:path");
  const root = path.join(process.cwd(), "src");
  const found: string[] = [];
  const walk = async (dir: string, depth: number) => {
    if (depth > 2 || found.length > 800) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith(".")) continue;
      const rel = path.relative(root, path.join(dir, ent.name)).split(path.sep).join("/");
      if (ent.isDirectory()) {
        found.push(rel + "/.keep");
        await walk(path.join(dir, ent.name), depth + 1);
      } else if (ent.isFile()) found.push(rel);
    }
  };
  await walk(root, 0);
  return { departments: buildRoster(found.filter((p) => !p.endsWith("/.keep"))) };
});
