import "server-only";
import { getWorkerById } from "./workers";
import type { Contact, Opportunity, Task, Activity } from "@/lib/types";

/**
 * Resolve owner name for a given owner ID
 * Looks up the worker/user record to get the full name
 */
export async function resolveOwnerName(
  ownerId: string | undefined,
): Promise<string | undefined> {
  if (!ownerId) return undefined;

  try {
    const worker = await getWorkerById(ownerId);
    return worker?.full_name ?? undefined;
  } catch (error) {
    console.error("resolveOwnerName error", error);
    return undefined;
  }
}

/**
 * Resolve owner names for multiple entities
 * Returns a map of owner ID to owner name for efficient lookup
 */
export async function resolveOwnerNames(
  ownerIds: (string | undefined)[],
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(ownerIds.filter(Boolean))];
  const nameMap = new Map<string, string>();

  // Fetch all workers in parallel
  const promises = uniqueIds.map(async (id) => {
    if (!id) return;
    try {
      const worker = await getWorkerById(id);
      if (worker?.full_name) {
        nameMap.set(id, worker.full_name);
      }
    } catch (error) {
      console.error(`Error resolving owner ${id}:`, error);
    }
  });

  await Promise.all(promises);
  return nameMap;
}

/**
 * Add owner names to contact records
 */
export async function enrichContactsWithOwnerNames(
  contacts: Contact[],
): Promise<Contact[]> {
  const ownerIds = contacts.map((c) => c.ownerId);
  const ownerNames = await resolveOwnerNames(ownerIds);

  return contacts.map((contact) => ({
    ...contact,
    ownerName: contact.ownerId ? ownerNames.get(contact.ownerId) : undefined,
  }));
}

/**
 * Add owner names to opportunity records
 */
export async function enrichOpportunitiesWithOwnerNames(
  opportunities: Opportunity[],
): Promise<Opportunity[]> {
  const ownerIds = opportunities.map((o) => o.ownerId);
  const ownerNames = await resolveOwnerNames(ownerIds);

  return opportunities.map((opportunity) => ({
    ...opportunity,
    ownerName: opportunity.ownerId ? ownerNames.get(opportunity.ownerId) : undefined,
  }));
}

/**
 * Add owner names to task records
 */
export async function enrichTasksWithOwnerNames(
  tasks: Task[],
): Promise<Task[]> {
  const assigneeIds = tasks.map((t) => t.assignedToId);
  const ownerNames = await resolveOwnerNames(assigneeIds);

  return tasks.map((task) => ({
    ...task,
    assignedToName: task.assignedToId ? ownerNames.get(task.assignedToId) : undefined,
  }));
}

/**
 * Add creator names to activity records
 */
export async function enrichActivitiesWithCreatorNames(
  activities: Activity[],
): Promise<Activity[]> {
  const creatorIds = activities.map((a) => a.createdById);
  const creatorNames = await resolveOwnerNames(creatorIds);

  return activities.map((activity) => ({
    ...activity,
    createdByName: activity.createdById ? creatorNames.get(activity.createdById) : undefined,
  }));
}
