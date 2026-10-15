# src/components

Shared React UI components for the CityDesk app, kept separate from the page and server routes in `src/routes/`. Components here are app-level building blocks that plug into the TanStack Start / TanStack Router runtime, including bridges that let external tooling drive the app.

## Files

- `preview-host-bridge.tsx` — exports `PreviewHostBridge`, a component that renders nothing and is meant to be mounted once in `__root.tsx`; in a `useEffect` it calls `installPreviewHostBridge` wiring TanStack Router navigation (`router.history.push`) and route-path collection (`collectRoutePathsFromTree`) into the preview host bridge library, so the Grok preview chrome can drive navigation and noops when the app is not embedded.
