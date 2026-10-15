import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SessionAuthForm } from "@/components/auth/SessionAuthForm";
import { SignedIn } from "@/lib/auth/gates";
import { useCurrentUser } from "@/lib/auth/use-current-user";
import { ShieldCheck, ArrowLeft, Laptop } from "lucide-react";

export const Route = createFileRoute("/login")({ component: Login });

function Login() {
  const user = useCurrentUser();
  const navigate = useNavigate();

  return (
    <main className="bg-bg text-fg min-h-dvh flex flex-col justify-between px-4 py-8 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-accent/10 rounded-full blur-3xl pointer-events-none" />

      {/* Top Header */}
      <header className="relative z-10 max-w-md w-full mx-auto flex items-center justify-between">
        <Link
          to="/"
          className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-fg transition-colors px-3 py-1.5 rounded-full bg-surface border border-white/5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Landing</span>
        </Link>
        <Link
          to="/map"
          className="text-xs text-accent hover:underline font-medium"
        >
          Launch 3D Map
        </Link>
      </header>

      {/* Main Container */}
      <div className="relative z-10 w-full max-w-md mx-auto my-auto space-y-6 pt-4 pb-8">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold tracking-wider uppercase">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>NDU Identity & Sessions</span>
          </div>
          <h1 className="font-display text-3xl sm:text-4xl text-fg tracking-tight">
            CityDesk Sessions
          </h1>
          <p className="text-muted text-xs sm:text-sm max-w-sm mx-auto">
            Direct credential authentication for the 3D township. Manage active devices, leases, and council telemetry.
          </p>
        </div>

        <SignedIn>
          <div className="p-5 bg-surface border border-white/10 rounded-3xl text-center space-y-4 shadow-xl">
            <div className="w-12 h-12 rounded-full bg-accent/20 border border-accent/30 text-accent mx-auto flex items-center justify-center font-bold text-lg">
              {(user?.displayName || user?.primaryEmail || "U")[0].toUpperCase()}
            </div>
            <div>
              <p className="font-semibold text-fg">{user?.displayName || "Member"}</p>
              <p className="text-xs text-muted">{user?.primaryEmail}</p>
            </div>
            <div className="flex gap-2">
              <Link
                to="/account/sessions"
                className="flex-1 bg-surface hover:bg-white/10 border border-white/10 text-fg text-xs py-2.5 rounded-xl transition-colors flex items-center justify-center gap-1.5 font-medium"
              >
                <Laptop className="w-3.5 h-3.5" />
                <span>My Sessions</span>
              </Link>
              <Link
                to="/map"
                className="flex-1 bg-accent text-bg text-xs py-2.5 rounded-xl font-semibold transition-colors flex items-center justify-center"
              >
                <span>Enter 3D City</span>
              </Link>
            </div>
          </div>
        </SignedIn>

        {(!user || user.isDevFallback) && (
          <SessionAuthForm
            callbackURL="/"
            onSuccess={() => {
              void navigate({ to: "/" });
            }}
          />
        )}

        <div className="text-center text-xs text-muted/70 space-y-1">
          <p>Zero third-party trackers. All session tokens are strictly self-hosted.</p>
          <p>
            Need to inspect active devices? Check{" "}
            <Link to="/account/sessions" className="text-accent underline underline-offset-2">
              Account → Sessions
            </Link>
            .
          </p>
        </div>
      </div>

      {/* Footer */}
      <footer className="relative z-10 max-w-md w-full mx-auto text-center text-[11px] text-muted">
        <span>CityDesk Port Harcourt Township · NDU Sovereign Systems</span>
      </footer>
    </main>
  );
}
