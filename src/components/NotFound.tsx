import { Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";

export function NotFound() {
  return (
    <main
      className={
        "flex min-h-screen flex-col items-center justify-center gap-3 px-6 text-center " +
        "bg-zinc-50 text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50"
      }
    >
      <span className="text-zinc-400 dark:text-zinc-500" aria-hidden="true">
        <Compass className="size-10" strokeWidth={2} />
      </span>
      <h1 className="text-lg font-semibold">404 — Page not found</h1>
      <p className="max-w-md text-sm text-zinc-500 dark:text-zinc-400">
        That page is not on this street. Check the address or head back home.
      </p>
      <Link
        to="/"
        className="rounded-md border border-zinc-300 px-4 py-2 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:hover:bg-zinc-800"
      >
        Back to CityDesk
      </Link>
    </main>
  );
}
