/**
 * Test-only module resolution for `node --experimental-strip-types --test`.
 * Maps the `@/` alias (tsconfig "paths") to ./src and adds the `.ts`/`.tsx`/`/index.ts`
 * extension that Vite normally infers. Usage:
 *   node --experimental-strip-types --import ./tests/property/register.mjs --test tests/property/*.test.ts
 */
import { register } from "node:module";

register("./resolve-hooks.mjs", import.meta.url);
