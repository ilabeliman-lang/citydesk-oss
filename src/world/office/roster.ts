/**
 * Fold a file tree into an office. A directory is a department, a subdirectory is a desk,
 * a file is a child. Pure: no disk, no model, no wallet. The caller decides which root is allowed.
 */
export type BotKind = "department" | "desk" | "file";

export type OfficeBot = {
  name: string;
  kind: BotKind;
  /** Path relative to the allowed root. Never absolute, never "..". */
  path: string;
};

export type Department = OfficeBot & {
  kind: "department";
  desks: OfficeBot[];
  files: OfficeBot[];
};

const SKIP = new Set(["node_modules", ".git", "dist", ".vercel", "coverage"]);

function safe(rel: string): string | null {
  const parts = rel.split("/").filter(Boolean);
  if (!parts.length || parts.some((p) => p === ".." || p.startsWith(".") || SKIP.has(p))) return null;
  if (parts.some((p) => /env|secret|credential|token|key/i.test(p))) return null;
  return parts.join("/");
}

/** `paths` are file paths relative to the root, posix, no leading slash. */
export function buildRoster(paths: string[], caps = { departments: 24, desks: 12, files: 16 }): Department[] {
  const depts = new Map<string, Department>();
  for (const raw of paths) {
    const rel = safe(raw);
    if (!rel) continue;
    const parts = rel.split("/");
    const top = parts[0];
    let dept = depts.get(top);
    if (!dept) {
      if (depts.size >= caps.departments) continue;
      dept = { name: top, kind: "department", path: top, desks: [], files: [] };
      depts.set(top, dept);
    }
    if (parts.length === 1) continue;
    if (parts.length === 2) {
      if (dept.files.length < caps.files) dept.files.push({ name: parts[1], kind: "file", path: rel });
      continue;
    }
    const deskPath = `${parts[0]}/${parts[1]}`;
    if (!dept.desks.some((d) => d.path === deskPath) && dept.desks.length < caps.desks) {
      dept.desks.push({ name: parts[1], kind: "desk", path: deskPath });
    }
    if (dept.files.length < caps.files) dept.files.push({ name: parts[parts.length - 1], kind: "file", path: rel });
  }
  return [...depts.values()];
}

/** What a folder-bot is allowed to say. It does not read the file and it does not see a laptop. */
export function botReply(bot: OfficeBot, said: string): string {
  const heard = said.replace(/\s+/g, " ").trim().slice(0, 80);
  return `${bot.name} (${bot.path}): I heard “${heard || "…"}”. I am a folder in the office, not a process, and I cannot see your laptop.`;
}
