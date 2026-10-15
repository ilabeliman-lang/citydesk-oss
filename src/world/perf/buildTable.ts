/** Format measured build rows as "{file} {bytes}", largest byte size first. */
export function buildTable(rows: { file: string; bytes: number }[]): string {
  return [...rows]
    .sort((a, b) => b.bytes - a.bytes)
    .map((row) => `${row.file} ${row.bytes}`)
    .join("\n");
}
