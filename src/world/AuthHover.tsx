import { useState } from "react";
import { SessionAuthForm } from "@/components/auth/SessionAuthForm";
import { SignedOut } from "@/lib/auth/gates";
import { ComingSoonSheet } from "@/world/ComingSoonSheet";

/** Sign-in sits on the map. The world stays visible around it. */
export function AuthHover() {
  const [soon, setSoon] = useState(false);
  const [open, setOpen] = useState(true);
  return (
    <>
      <button
        type="button"
        className="absolute right-3 top-3 z-[680] min-h-11 rounded-full bg-surface/90 px-3 text-xs font-medium text-fg shadow"
        onClick={() => setSoon(true)}
      >
        Coming soon
      </button>
      {soon ? <ComingSoonSheet onClose={() => setSoon(false)} /> : null}
      <SignedOut>
        {open ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[700] flex justify-center p-3">
            <div className="pointer-events-auto w-full max-w-sm">
              <div className="mb-2 flex justify-end">
                <button type="button" className="min-h-11 rounded-full bg-surface/90 px-3 text-xs" onClick={() => setOpen(false)}>
                  Look around first
                </button>
              </div>
              <SessionAuthForm compact callbackURL="/" />
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="absolute bottom-4 left-1/2 z-[700] min-h-11 -translate-x-1/2 rounded-full bg-accent px-4 text-sm font-semibold text-bg"
            onClick={() => setOpen(true)}
          >
            Sign in
          </button>
        )}
      </SignedOut>
    </>
  );
}
