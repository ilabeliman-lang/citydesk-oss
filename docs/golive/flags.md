# Go-live feature-flag checklist

Every flag below was found by grepping the code (`VITE_*` in `src/` and
`scripts/`) at HEAD of **main** (`f9bd574`) and on the four unmerged feature
branches named in the go-live plan. Nothing is invented: if a feature has no
flag, this document says so.

Build-time flags: these are `import.meta.env.VITE_*`, so they are baked in at
build time. Changing one means a rebuild + redeploy, not a live toggle. Only
flags that appear in shipped (non-test) source are listed.

## On main today

| Flag | Defined at | Default | Production recommendation | Gates |
|---|---|---|---|---|
| `VITE_AUTH_ENABLED` | `src/lib/auth/client.ts:38`, `src/lib/auth/gate-identity.server.ts:30` | enabled (only the exact string `"false"` disables) | **leave unset** (auth ON) | all auth/login |
| `VITE_NDU_ASSISTANT` | `src/world/assistant/flag.ts:11` | off (only the exact string `"on"` enables) | `off` for go-live #1; turn `on` only after the assistant has its own review | NDU-AI assistant slot (`CityBuildings.tsx:1111`) |
| `VITE_NDU_IMMERSE` | `src/world/immerse/flag.ts:11` | on (only `"off"` disables) | **leave unset** (on) | immersion wing |
| `VITE_INGEST_NSFW_MODEL_URL` | `src/world/ingest/models.ts:116` | the built-in model URL | leave unset unless self-hosting the NSFW gate model | safe ingest |

There is **no** env flag on main for: reception desk, terrain/ground, object
inspect, or props/lighting — those features live only on unmerged branches
(see next section). There is also no "safe-features settings" env flag on
main; the ingest safety stack is unconditional in the shipped code, and the
closest switches are the `?search=0` / `?immerse=0` / `?assistant=0` URL
parameters plus localStorage keys (`src/world/search/flag.ts`,
`src/world/immerse/flag.ts`, `src/world/assistant/flag.ts`).

## Flags that arrive with each go-live branch

These branches are not merged yet, so these flags do not exist on main. Once a
branch merges, its flag goes live with the default shown.

| Branch | New flag(s) | Default (from that branch's source) | Recommendation when merged |
|---|---|---|---|
| `feat/reception-handoff` | `VITE_NDU_RECEPTION` | reception desk flag — see `src/world/workverse/reception.ts` on that branch | `on` at go-live (it is the marquee feature); confirm with Sun |
| `feat/terrain-ground` | `VITE_NDU_GROUND` | ground/terrain flag on that branch | `on` after the terrain audit lands GO |
| `feat/object-inspect` | `VITE_NDU_INSPECT`, `VITE_NDU_INSPECT_TAP` | inspect flag + tap-to-inspect sub-flag on that branch | `VITE_NDU_INSPECT=on`, `VITE_NDU_INSPECT_TAP=off` initially (tap is the riskier interaction) |
| `feat/realism-03-props-lighting` | `VITE_NDU_PROPS` | props/lighting flag on that branch | `on` after the realism-03 audit lands GO |

## How to verify before shipping

```bash
# flags actually compiled into a build
grep -rn "VITE_[A-Z_]*" src/ scripts/ | grep -v "\.test\." 
# per-branch flags (feature worktrees)
for d in ../citydesk-wt-reception ../citydesk-wt-02 ../citydesk-wt-04 ../citydesk-wt-03; do
  echo "== $d"; grep -rhoE "VITE_[A-Z_]+" $d/src | sort -u
done
```

## Go-live checklist

1. Auth: `VITE_AUTH_ENABLED` unset (auth on) — verify with `npm run check:auth`.
2. Assistant: `VITE_NDU_ASSISTANT=off` for the first production cut.
3. Immerse: `VITE_NDU_IMMERSE` unset (on).
4. Reception: merge `feat/reception-handoff`, set `VITE_NDU_RECEPTION` per its branch default; Sun confirms.
5. Terrain: merge after GO on `docs/audits/terrain-ground.md`; set `VITE_NDU_GROUND`.
6. Object inspect: merge after GO on `docs/audits/object-inspect.md`; set `VITE_NDU_INSPECT=on`, `VITE_NDU_INSPECT_TAP=off`.
7. Props/lighting: merge after GO on `docs/audits/realism-03-props-lighting.md`; set `VITE_NDU_PROPS`.
8. Rebuild after any flag change (build-time baking) and re-run `npm run typecheck` + `npm test`.
