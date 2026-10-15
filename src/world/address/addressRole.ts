import { createServerFn } from "@tanstack/react-start";
import { authMiddleware } from "@/lib/auth/middleware";

/** Operator (the council) or a resident. Never creates an account. */
export const myRole = createServerFn({ method: "POST" })
  .middleware([authMiddleware])
  .handler(async ({ context }) => {
    const { isAdmin } = await import("@/world/businesses");
    const operator = await isAdmin(context.userId);
    return { role: operator ? ("operator" as const) : ("resident" as const), userId: context.userId };
  });
