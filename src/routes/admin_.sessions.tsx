// NDU-UPG sessions: admin sessions desk (hidden unless admin; server re-checks every call).
import { createFileRoute } from "@tanstack/react-router";
import { AdminSessionsDesk } from "@/lib/auth/sessions/AdminSessionsDesk";

export const Route = createFileRoute("/admin_/sessions")({ component: AdminSessionsDesk });
