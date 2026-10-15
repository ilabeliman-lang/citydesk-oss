# Known Test Failures

This document lists known failing test groups in the CityDesk codebase.

## Script Tests

14 script tests are currently failing:

- `scripts/test-migrations.test.mjs`
- `scripts/test-constants.test.mjs`
- `scripts/test-world-terrain.test.mjs`
- `scripts/test-world-lights.test.mjs`
- `scripts/test-avatar.test.mjs`
- `scripts/test-address-desk.test.mjs`
- `scripts/test-map-props.test.mjs`
- `scripts/test-3d-scene.test.mjs`
- `scripts/test-server-routes.test.mjs`
- `scripts/test-client-components.test.mjs`
- `scripts/test-ui-libraries.test.mjs`
- `scripts/test-utils.test.mjs`
- `scripts/test-validators.test.mjs`
- `scripts/test-types.test.mjs`

These tests can be run individually using:

```bash
node --test scripts/<test-file>.test.mjs
```

## Orbit Tests

3 orbit tests are currently failing:

- `src/world/orbit/terrain.test.ts`
- `src/world/orbit/lights.test.ts`
- `src/world/orbit/avatar.test.ts`

These tests can be run individually using:

```bash
node --test src/world/orbit/<test-file>.test.ts
```

To run all orbit tests at once, use:

```bash
npm run test:orbit
```