import type { Task } from "@action-inbox/contracts";

export type DueUrgency = {
  label:
    | "Overdue"
    | "Today"
    | "Next 7 days"
    | "Later"
    | "No date"
    | "Date needs review"
    | "Completed";
  tone: "overdue" | "today" | "soon" | "neutral" | "completed";
  order: number;
};

// Urgency is a transparent comparison with an actual timestamp, never model confidence.
export function dueUrgency(dueAt: string | null, now: Date): DueUrgency {
  if (!dueAt) return { label: "No date", tone: "neutral", order: 4 };
  const due = new Date(dueAt);
  if (!Number.isFinite(due.getTime()))
    return { label: "Date needs review", tone: "neutral", order: 4 };
  if (due.getTime() < now.getTime())
    return { label: "Overdue", tone: "overdue", order: 0 };
  const tomorrow = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
  );
  if (due < tomorrow) return { label: "Today", tone: "today", order: 1 };
  const horizon = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 8,
  );
  if (due < horizon) return { label: "Next 7 days", tone: "soon", order: 2 };
  return { label: "Later", tone: "neutral", order: 3 };
}

export function taskUrgency(task: Task, now: Date): DueUrgency {
  return task.status === "Completed"
    ? { label: "Completed", tone: "completed", order: 5 }
    : dueUrgency(task.dueAt, now);
}

export function compareTaskUrgency(left: Task, right: Task, now: Date) {
  const order = taskUrgency(left, now).order - taskUrgency(right, now).order;
  if (order) return order;
  const leftDue = left.dueAt
    ? Date.parse(left.dueAt)
    : Number.POSITIVE_INFINITY;
  const rightDue = right.dueAt
    ? Date.parse(right.dueAt)
    : Number.POSITIVE_INFINITY;
  if (
    leftDue !== rightDue &&
    Number.isFinite(leftDue) &&
    Number.isFinite(rightDue)
  )
    return leftDue - rightDue;
  return left.createdAt.localeCompare(right.createdAt);
}
