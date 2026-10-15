import { useState } from "react";
import { authClient } from "@/lib/auth/client";
import { KeyRound, Mail, User, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";

interface SessionAuthFormProps {
  onSuccess?: () => void;
  callbackURL?: string;
  defaultMode?: "signin" | "signup";
  compact?: boolean;
}

export function SessionAuthForm({
  onSuccess,
  callbackURL = "/",
  defaultMode = "signin",
  compact = false,
}: SessionAuthFormProps) {
  const [mode, setMode] = useState<"signin" | "signup">(defaultMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successNote, setSuccessNote] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccessNote(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        if (!email || !password) {
          setError("Please provide both email and password.");
          setLoading(false);
          return;
        }
        if (password.length < 8) {
          setError("Password must be at least 8 characters long.");
          setLoading(false);
          return;
        }

        const displayName = name.trim() || email.split("@")[0] || "CityDesk Member";
        const result = await authClient.signUp.email({
          email,
          password,
          name: displayName,
        });

        if (result.error) {
          setError(result.error.message || "Could not create account. Please try again.");
          setLoading(false);
          return;
        }

        setSuccessNote("Session established! Account created successfully.");
        // Try to fetch session
        try {
          await authClient.getSession();
        } catch {
          // ignore
        }
        if (onSuccess) {
          setTimeout(onSuccess, 600);
        } else if (callbackURL && typeof window !== "undefined") {
          setTimeout(() => {
            window.location.href = callbackURL;
          }, 600);
        }
      } else {
        // Sign in
        if (!email || !password) {
          setError("Please enter your email and password.");
          setLoading(false);
          return;
        }

        const result = await authClient.signIn.email({
          email,
          password,
        });

        if (result.error) {
          setError(result.error.message || "Invalid email or password.");
          setLoading(false);
          return;
        }

        setSuccessNote("Signed in successfully! Session is now active.");
        try {
          await authClient.getSession();
        } catch {
          // ignore
        }
        if (onSuccess) {
          setTimeout(onSuccess, 600);
        } else if (callbackURL && typeof window !== "undefined") {
          setTimeout(() => {
            window.location.href = callbackURL;
          }, 600);
        }
      }
    } catch (err: unknown) {
      setError((err as Error)?.message || "Authentication failed. Please verify credentials.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`w-full ${compact ? "p-3" : "p-6"} bg-surface border border-white/10 rounded-3xl shadow-2xl text-fg`}>
      {/* Tab Switcher */}
      <div className="flex bg-bg/80 p-1 rounded-2xl border border-white/5 mb-4">
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            setError(null);
            setSuccessNote(null);
          }}
          className={`flex-1 py-2 text-xs sm:text-sm font-medium rounded-xl transition-all ${
            mode === "signin"
              ? "bg-accent text-bg shadow font-semibold"
              : "text-muted hover:text-fg"
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            setError(null);
            setSuccessNote(null);
          }}
          className={`flex-1 py-2 text-xs sm:text-sm font-medium rounded-xl transition-all ${
            mode === "signup"
              ? "bg-accent text-bg shadow font-semibold"
              : "text-muted hover:text-fg"
          }`}
        >
          Create Account
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-3">
        {mode === "signup" && (
          <div>
            <label className="block text-xs text-muted mb-1 font-medium">Your Name / Call-sign</label>
            <div className="relative">
              <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Ada Lovelace"
                className="w-full bg-bg border border-white/10 focus:border-accent rounded-xl pl-10 pr-4 py-2.5 text-sm text-fg placeholder:text-muted/60 focus:outline-none transition-colors"
              />
            </div>
          </div>
        )}

        <div>
          <label className="block text-xs text-muted mb-1 font-medium">Email Address</label>
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@citydesk.local"
              className="w-full bg-bg border border-white/10 focus:border-accent rounded-xl pl-10 pr-4 py-2.5 text-sm text-fg placeholder:text-muted/60 focus:outline-none transition-colors"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs text-muted mb-1 font-medium">Password</label>
          <div className="relative">
            <KeyRound className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted pointer-events-none" />
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="w-full bg-bg border border-white/10 focus:border-accent rounded-xl pl-10 pr-4 py-2.5 text-sm text-fg placeholder:text-muted/60 focus:outline-none transition-colors"
            />
          </div>
          {mode === "signup" && (
            <p className="text-[11px] text-muted/80 mt-1">
              Passwords are cryptographically salted & hashed. No social broker tracking. A new account is a resident. The council and the agent office stay with the operator. You hold an address, a floor, or a flat.
            </p>
          )}
        </div>

        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-950/40 border border-red-800/40 rounded-xl text-red-200 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-400" />
            <span>{error}</span>
          </div>
        )}

        {successNote && (
          <div className="flex items-start gap-2 p-3 bg-emerald-950/40 border border-emerald-800/40 rounded-xl text-emerald-200 text-xs">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
            <span>{successNote}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full mt-2 bg-accent hover:opacity-90 disabled:opacity-50 text-bg font-semibold py-2.5 px-4 rounded-xl text-sm transition-all flex items-center justify-center gap-2 shadow-lg cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Authenticating Session…</span>
            </>
          ) : mode === "signin" ? (
            <span>Sign In to Session</span>
          ) : (
            <span>Create Account & Start Session</span>
          )}
        </button>
      </form>

      <div className="mt-4 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-muted">
        <span>Protected by NDU Session Protocol</span>
        <span>Zero Social Trackers</span>
      </div>
    </div>
  );
}
