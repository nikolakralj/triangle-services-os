import { redirect } from "next/navigation";

// The Companies directory is not an operating surface. Rows stay in the
// database, and `/companies/[id]` still opens from missions, Approvals and
// holdings. Bookmarks of the mega-list land on Missions with a short notice.
export default function CompaniesPage() {
  redirect("/missions?notice=companies");
}
