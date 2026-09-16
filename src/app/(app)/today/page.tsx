import { redirect } from "next/navigation";

// Today lives at /decisions. Bookmarks of /today land on the same screen.
export default function TodayAliasPage() {
  redirect("/decisions");
}
