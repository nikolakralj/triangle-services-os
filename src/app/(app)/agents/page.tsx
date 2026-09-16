import { redirect } from "next/navigation";

// Workforce is not an operating surface (DEV-012). Work is handed out from the
// case — Ask, Ask Bob, an instruction inside a mission — and the AI employees
// are an admin matter, so they live in Settings → Team. Bookmarks and old links
// land there with a short notice. API routes under /api/agents are unchanged.
export default function WorkforcePage() {
  redirect("/settings?notice=workforce#team");
}
