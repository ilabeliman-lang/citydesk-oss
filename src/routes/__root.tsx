import { createRootRoute, HeadContent, Link, Outlet, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/lib/auth/provider";
import { PreviewHostBridge } from "@/components/preview-host-bridge";
import { NotFound } from "@/components/NotFound";
import appCss from "../styles.css?url";
import { A11yBoot } from "@/world/a11y/A11yPrefs"; // NDU cat 12 basics
import { buildCsp } from "@/lib/security/headers"; // NDU-UPG u-081: strict document CSP

const APP_NAME = "CityDesk";

export const Route = createRootRoute({
  head: ({ match }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: APP_NAME },
      { name: "theme-color", content: "#1A1511" },
      {
        name: "description",
        content: "A fictional Port Harcourt township block. Walk, eat, work a shift, and watch the lights.",
      },
      // NDU-UPG u-081: strict document CSP as a meta tag (works without server
      // config; the policy itself is built + frozen by src/lib/security/headers.ts).
      { httpEquiv: "Content-Security-Policy", content: buildCsp(import.meta.env.DEV, (match?.context as { nonce?: string } | undefined)?.nonce) },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      // NDU-UPG 515: warm the map tile/glyph host and the road-data host before the map asks for them.
      { rel: "preconnect", href: "https://tiles.openfreemap.org", crossOrigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://overpass-api.de" },
      { rel: "manifest", href: "/__grok/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/__grok/icon-180.png" },
    ],
  }),
  notFoundComponent: NotFound,
  component: () => (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <PreviewHostBridge />
        <A11yBoot />
        <AuthProvider>
          <Outlet />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  ),
});
