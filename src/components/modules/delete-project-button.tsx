"use client";

import { Trash2 } from "lucide-react";
import { useState } from "react";
import { deleteProjectAction } from "@/app/actions/projects";
import { useRouter } from "next/navigation";

export function DeleteProjectButton({ projectId }: { projectId: string }) {
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

  async function handleDelete() {
    if (!window.confirm("Are you sure you want to delete this project?")) return;
    
    setIsDeleting(true);
    try {
      await deleteProjectAction(projectId);
      router.refresh();
    } catch (err) {
      console.error(err);
      alert("Failed to delete project");
    } finally {
      setIsDeleting(false);
    }
  }

  return (
    <button
      onClick={handleDelete}
      disabled={isDeleting}
      className="inline-flex items-center justify-center rounded-md p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 transition-all"
      title="Delete project"
    >
      <Trash2 className="h-4 w-4" />
    </button>
  );
}
