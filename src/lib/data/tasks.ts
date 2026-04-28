import "server-only";
import { createCookieSupabaseClient } from "@/lib/supabase/server";
import type { Task } from "@/lib/types";

export type TaskRow = {
  id: string;
  organization_id: string;
  title: string;
  description: string | null;
  assigned_to_id: string | null;
  related_entity_type: "company" | "contact" | "opportunity" | "worker" | "document" | "none";
  related_entity_id: string | null;
  priority: "low" | "medium" | "high" | "critical";
  status: "open" | "in_progress" | "done" | "cancelled";
  due_date: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
};

/**
 * Convert database row to UI type for Task
 */
export function rowToTask(row: TaskRow): Task {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    assignedToId: row.assigned_to_id ?? undefined,
    assignedToName: undefined, // Set separately by caller if available
    relatedEntityType: row.related_entity_type,
    relatedEntityId: row.related_entity_id ?? undefined,
    priority: row.priority,
    status: row.status,
    dueDate: row.due_date ?? undefined,
  };
}

/**
 * Get all tasks for organization
 */
export async function listTasks(
  organizationId: string,
): Promise<TaskRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("organization_id", organizationId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("listTasks error", error);
    return [];
  }
  return data as TaskRow[];
}

/**
 * Get open tasks for organization
 */
export async function listOpenTasks(
  organizationId: string,
): Promise<TaskRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("organization_id", organizationId)
    .neq("status", "done")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("priority", { ascending: false });

  if (error) {
    console.error("listOpenTasks error", error);
    return [];
  }
  return data as TaskRow[];
}

/**
 * Get overdue tasks for organization
 */
export async function getOverdueTasks(
  organizationId: string,
): Promise<TaskRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const today = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("organization_id", organizationId)
    .neq("status", "done")
    .lt("due_date", today)
    .order("due_date", { ascending: true });

  if (error) {
    console.error("getOverdueTasks error", error);
    return [];
  }
  return data as TaskRow[];
}

/**
 * Get tasks due this week
 */
export async function getTasksDueThisWeek(
  organizationId: string,
): Promise<TaskRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const today = new Date();
  const endOfWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
  const todayStr = today.toISOString().split("T")[0];
  const endStr = endOfWeek.toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("organization_id", organizationId)
    .neq("status", "done")
    .gte("due_date", todayStr)
    .lte("due_date", endStr)
    .order("due_date", { ascending: true })
    .order("priority", { ascending: false });

  if (error) {
    console.error("getTasksDueThisWeek error", error);
    return [];
  }
  return data as TaskRow[];
}

/**
 * Get tasks assigned to a specific user
 */
export async function getTasksByAssignee(
  userId: string,
): Promise<TaskRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("assigned_to_id", userId)
    .neq("status", "done")
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("priority", { ascending: false });

  if (error) {
    console.error("getTasksByAssignee error", error);
    return [];
  }
  return data as TaskRow[];
}

/**
 * Get tasks related to a specific entity
 */
export async function getTasksByEntity(
  entityType: string,
  entityId: string,
): Promise<TaskRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("related_entity_type", entityType)
    .eq("related_entity_id", entityId)
    .order("due_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("getTasksByEntity error", error);
    return [];
  }
  return data as TaskRow[];
}

/**
 * Get task by ID
 */
export async function getTaskById(id: string): Promise<TaskRow | null> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("tasks")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("getTaskById error", error);
    return null;
  }
  return data as TaskRow | null;
}

/**
 * Search and filter tasks
 */
export async function searchAndFilterTasks(
  organizationId: string,
  options: {
    search?: string;
    status?: string;
    assignedToId?: string;
    priority?: string;
  },
): Promise<TaskRow[]> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return [];

  let query = supabase
    .from("tasks")
    .select("*")
    .eq("organization_id", organizationId);

  if (options.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }
  if (options.assignedToId && options.assignedToId !== "all") {
    query = query.eq("assigned_to_id", options.assignedToId);
  }
  if (options.priority && options.priority !== "all") {
    query = query.eq("priority", options.priority);
  }

  if (options.search && options.search.trim()) {
    const searchTerm = options.search.toLowerCase();
    query = query.or(`title.ilike.%${searchTerm}%,description.ilike.%${searchTerm}%`);
  }

  const { data, error } = await query.order("due_date", {
    ascending: true,
    nullsFirst: false,
  });

  if (error) {
    console.error("searchAndFilterTasks error", error);
    return [];
  }
  return data as TaskRow[];
}

/**
 * Create new task
 */
export async function createTask(
  organizationId: string,
  data: Omit<TaskRow, "id" | "created_at" | "updated_at" | "organization_id">,
): Promise<TaskRow | null> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return null;

  const { data: newTask, error } = await supabase
    .from("tasks")
    .insert([
      {
        ...data,
        organization_id: organizationId,
      },
    ])
    .select()
    .maybeSingle();

  if (error) {
    console.error("createTask error", error);
    return null;
  }
  return newTask as TaskRow | null;
}

/**
 * Update task
 */
export async function updateTask(
  id: string,
  data: Partial<Omit<TaskRow, "id" | "created_at" | "organization_id">>,
): Promise<TaskRow | null> {
  const supabase = await createCookieSupabaseClient();
  if (!supabase) return null;

  const { data: updated, error } = await supabase
    .from("tasks")
    .update({
      ...data,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .maybeSingle();

  if (error) {
    console.error("updateTask error", error);
    return null;
  }
  return updated as TaskRow | null;
}

/**
 * Mark task as done
 */
export async function completeTask(id: string): Promise<TaskRow | null> {
  return updateTask(id, {
    status: "done",
  });
}

/**
 * Delete task (mark as cancelled)
 */
export async function cancelTask(id: string): Promise<TaskRow | null> {
  return updateTask(id, {
    status: "cancelled",
  });
}
