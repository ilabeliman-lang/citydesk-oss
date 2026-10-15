// NDU-UPG sessions: Account → Sessions as a page (classic layout, deep link).
import { createFileRoute, Link } from "@tanstack/react-router";
import { SignedIn, SignedOut } from "@/lib/auth/gates";
import { SessionsPanel } from "@/lib/auth/sessions/SessionsSheet";
import { SessionAuthForm } from "@/components/auth/SessionAuthForm";
import { Shield, Home, Compass } from "lucide-react";

export const Route = createFileRoute("/account/sessions")({ component: AccountSessions });

function AccountSessions() {
  return (
    <main className="bg-bg text-fg min-h-dvh px-3 py-6">
      {/* Navigation Bar */}
      <div className="mx-auto flex max-w-lg items-center justify-between px-2 mb-4">
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors">
          <Home className="w-3.5 h-3.5" />
          <span>Landing</span>
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/map" className="inline-flex items-center gap-1.5 ndu-pill text-xs">
            <Compass className="w-3 h-3 text-accent" />
            <span>3D Map</span>
          </Link>
        </div>
      </div>

      <SignedIn>
        <SessionsPanel page />
      </SignedIn>

      <SignedOut>
        <div className="mx-auto max-w-md space-y-4 pt-2">
          <div className="text-center space-y-1.5">
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold">
              <Shield className="w-3.5 h-3.5" />
              <span>Multi-Device Session Security</span>
            </div>
            <h1 className="font-display text-2xl text-fg">Active Sessions & Devices</h1>
            <p className="text-muted text-xs">
              Sign in or create a CityDesk account to inspect active session tokens, track devices, and revoke sessions remotely.
            </p>
          </div>

          <SessionAuthForm
            callbackURL="/account/sessions"
            onSuccess={() => {
              // Reload session
              if (typeof window !== "undefined") {
                window.location.reload();
              }
            }}
          />
        </div>
      </SignedOut>
    </main>
  );
}
