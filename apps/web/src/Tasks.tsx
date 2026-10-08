import { useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import {
  apiRoutes,
  calendarLinkSchema,
  reminderSchema,
  successResponseSchema,
  taskSchema,
  tasksResponseSchema,
  type Reminder,
  type Task,
} from "@action-inbox/contracts";
import {
  type ApiClient,
  RequestError,
  route,
  safeExternalLink,
  type TaskIntent,
  type ReminderIntent,
  type EventIntent,
} from "./api/client";
import {
  ActionNotice,
  DueFields,
  ErrorNotice,
  displayDate,
  isoDate,
  localDateValue,
  useAction,
  useNow,
} from "./ui";
import { compareTaskUrgency, taskUrgency } from "./urgency";

export function Tasks({
  api,
  timezone,
  connected,
  openEmail,
  initialTaskId = null,
  createInitially = false,
}: {
  api: ApiClient;
  timezone: string;
  connected: boolean;
  openEmail: (id: string) => void;
  initialTaskId?: string | null;
  createInitially?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(initialTaskId);
  const [creating, setCreating] = useState(
    createInitially || api.pendingTask !== null,
  );
  const now = useNow();
  const tasks = useInfiniteQuery({
    queryKey: ["private", "tasks"],
    initialPageParam: null as string | null,
    queryFn: ({ pageParam, signal }) =>
      api.request(
        `${apiRoutes.tasks}?limit=100${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
        tasksResponseSchema,
        { signal },
      ),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const orderedTasks = (
    tasks.data?.pages.flatMap((page) => page.items) ?? []
  ).sort((a, b) => compareTaskUrgency(a, b, now));
  const activeCount = orderedTasks.filter(
    (task) => task.status !== "Completed",
  ).length;
  return (
    <section>
      <div className="page-heading">
        <div>
          <p className="eyebrow">Make room for progress</p>
          <h1>Your next steps</h1>
          <p className="subtitle">
            Approved by you. Organized by due date, not an AI score.
          </p>
        </div>
        <button
          aria-expanded={creating}
          onClick={() => setCreating((value) => !value)}
        >
          {creating ? "Close new task" : "+ New task"}
        </button>
      </div>
      {creating && <ManualTask api={api} />}
      <div className="surface task-workspace">
        <div className="section-heading">
          <div>
            <h2>Tasks</h2>
            <p className="section-note">
              {activeCount} active · {orderedTasks.length - activeCount}{" "}
              completed
              {tasks.hasNextPage ? " · More tasks available below" : ""}
            </p>
          </div>
          <button
            className="secondary small"
            onClick={() => void tasks.refetch()}
            disabled={tasks.isFetching}
          >
            Reload tasks and versions
          </button>
        </div>
        <p className="urgency-explainer">
          Overdue → today → next 7 days → later → no date. Completed tasks are
          separate from urgency. No date does not mean low importance.
        </p>
        <ErrorNotice error={tasks.error} />
        {tasks.isPending && (
          <p className="empty-state" role="status">
            Loading tasks…
          </p>
        )}
        {tasks.data && orderedTasks.length === 0 && (
          <div className="empty-state">
            <div className="empty-symbol" aria-hidden="true">
              ✓
            </div>
            <h3>Your next step starts here</h3>
            <p>
              Approve a suggestion from Inbox or create a task yourself. Nothing
              is added automatically.
            </p>
            <button className="secondary" onClick={() => setCreating(true)}>
              Create your first task
            </button>
          </div>
        )}
        <div className="task-list">
          {orderedTasks.map((task) => {
            const urgency = taskUrgency(task, now);
            const expanded = selectedId === task.id;
            return (
              <article
                key={task.id}
                className={`task-item ${expanded ? "selected" : ""} ${task.status === "Completed" ? "is-completed" : ""}`}
              >
                <button
                  className="task-row"
                  aria-expanded={expanded}
                  aria-controls={`task-editor-${task.id}`}
                  onClick={() => setSelectedId(expanded ? null : task.id)}
                >
                  <span
                    className={`task-marker ${task.status === "Completed" ? "done" : ""}`}
                    aria-hidden="true"
                  >
                    {task.status === "Completed" ? "✓" : ""}
                  </span>
                  <span className="row-copy">
                    <strong>{task.title}</strong>
                    <small>
                      {task.status}
                      {task.dueAt
                        ? ` · ${displayDate(task.dueAt)}`
                        : " · No due date"}
                      {task.sourceEmailId ? " · From email" : " · Manual task"}
                    </small>
                  </span>
                  <span className={`pill ${urgency.tone}`}>
                    {urgency.label}
                  </span>
                  <span className="expand-mark" aria-hidden="true">
                    {expanded ? "−" : "+"}
                  </span>
                </button>
                {expanded && (
                  <div className="task-detail" id={`task-editor-${task.id}`}>
                    <TaskEditor key={task.version} api={api} task={task} />
                    {task.sourceEmailId ? (
                      <button
                        className="text-button source-link"
                        onClick={() => openEmail(task.sourceEmailId!)}
                      >
                        View source email and evidence{" "}
                        <span aria-hidden="true">→</span>
                      </button>
                    ) : (
                      <p className="hint">
                        Manually created task · no source email
                      </p>
                    )}
                    <details className="editor-disclosure">
                      <summary>
                        In-app reminder metadata{" "}
                        <span>Stored only · no delivery</span>
                      </summary>
                      <ReminderEditor api={api} taskId={task.id} />
                      {task.reminders.map((reminder) => (
                        <ReminderEditor
                          key={`${reminder.id}:${reminder.scheduledAt}:${reminder.status}`}
                          api={api}
                          taskId={task.id}
                          reminder={reminder}
                        />
                      ))}
                    </details>
                    <details className="editor-disclosure">
                      <summary>
                        Google Calendar event{" "}
                        <span>
                          {task.calendarLink?.status === "Created"
                            ? "Created"
                            : "Requires your confirmation"}
                        </span>
                      </summary>
                      <EventCreator
                        api={api}
                        task={task}
                        timezone={timezone}
                        connected={connected}
                      />
                    </details>
                  </div>
                )}
              </article>
            );
          })}
        </div>
        {tasks.hasNextPage && (
          <button
            className="load-more secondary"
            disabled={tasks.isFetchingNextPage}
            onClick={() => void tasks.fetchNextPage()}
          >
            Load more tasks
          </button>
        )}
      </div>
    </section>
  );
}

export function ManualTask({ api }: { api: ApiClient }) {
  const [title, setTitle] = useState(api.pendingTask?.title ?? "");
  const [due, setDue] = useState(
    localDateValue(api.pendingTask?.dueAt ?? null),
  );
  const [request, setRequest] = useState<TaskIntent | null>(api.pendingTask);
  const action = useAction();
  const cache = useQueryClient();
  return (
    <form
      className="panel"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          if (!title.trim()) throw new Error("Enter a task title.");
          const intent = request ?? {
            requestId: crypto.randomUUID(),
            title: title.trim(),
            dueAt: isoDate(due),
          };
          api.pendingTask = intent;
          setRequest(intent);
          try {
            await api.request(apiRoutes.tasks, taskSchema, {
              method: "POST",
              body: intent,
            });
          } catch (error) {
            if (
              error instanceof RequestError &&
              error.code === "INVALID_REQUEST"
            ) {
              api.pendingTask = null;
              setRequest(null);
            }
            throw error;
          }
          api.pendingTask = null;
          setRequest(null);
          setTitle("");
          setDue("");
          await cache.invalidateQueries({ queryKey: ["private", "tasks"] });
        }, "Manual task created.");
      }}
    >
      <h2>Create manual task</h2>
      <DueFields
        title={title}
        due={due}
        onTitle={setTitle}
        onDue={setDue}
        disabled={action.pending || request !== null}
      />
      <button disabled={action.pending}>
        {request ? "Retry creating this task" : "Create task"}
      </button>
      {request && action.error != null && (
        <p>
          Your original request is retained. Retry checks the same task
          creation, without creating a duplicate.
        </p>
      )}
      <ActionNotice action={action} />
    </form>
  );
}

function TaskEditor({ api, task }: { api: ApiClient; task: Task }) {
  const [title, setTitle] = useState(task.title);
  const [due, setDue] = useState(localDateValue(task.dueAt));
  const [status, setStatus] = useState(task.status);
  const [locked, setLocked] = useState(false);
  const action = useAction();
  const cache = useQueryClient();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          if (!title.trim()) throw new Error("Enter a task title.");
          const body = {
            version: task.version,
            title: title.trim(),
            dueAt: isoDate(due),
            status,
          };
          setLocked(true);
          await api.request(route(apiRoutes.task, task.id), taskSchema, {
            method: "PATCH",
            body,
          });
          setLocked(false);
          await cache.invalidateQueries({ queryKey: ["private", "tasks"] });
        });
      }}
    >
      <h3>Task details</h3>
      <p className="hint">
        Due: {displayDate(task.dueAt)} · Version {task.version}
      </p>
      <DueFields
        title={title}
        due={due}
        onTitle={setTitle}
        onDue={setDue}
        disabled={action.pending || locked}
      />
      <label>
        Status
        <select
          value={status}
          disabled={action.pending || locked}
          onChange={(event) => setStatus(event.target.value as Task["status"])}
        >
          <option>Pending</option>
          <option>Waiting for Reply</option>
          <option>Completed</option>
        </select>
      </label>
      <p className="hint">
        To reopen a completed task, choose Pending and save.
      </p>
      <button disabled={action.pending}>Save task</button>
      <ActionNotice action={action} />
    </form>
  );
}

function ReminderEditor({
  api,
  taskId,
  reminder,
}: {
  api: ApiClient;
  taskId: string;
  reminder?: Reminder;
}) {
  const saved = reminder ? null : (api.pendingReminders.get(taskId) ?? null);
  const [scheduled, setScheduled] = useState(
    localDateValue(reminder?.scheduledAt ?? saved?.scheduledAt ?? null),
  );
  const [request, setRequest] = useState<ReminderIntent | null>(saved);
  const action = useAction();
  const cache = useQueryClient();
  if (reminder?.status === "Cancelled")
    return (
      <p>
        Cancelled in-app reminder: {displayDate(reminder.scheduledAt)} ·
        Delivery: Not configured
      </p>
    );
  return (
    <form
      className="subpanel"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          const scheduledAt = isoDate(scheduled);
          if (!scheduledAt)
            throw new Error("Choose an in-app reminder date and time.");
          if (reminder)
            await api.request(
              route(apiRoutes.reminder, reminder.id),
              reminderSchema,
              { method: "PATCH", body: { scheduledAt } },
            );
          else {
            const intent = request ?? {
              requestId: crypto.randomUUID(),
              scheduledAt,
            };
            api.pendingReminders.set(taskId, intent);
            setRequest(intent);
            try {
              await api.request(
                route(apiRoutes.reminders, taskId),
                reminderSchema,
                { method: "POST", body: intent },
              );
            } catch (error) {
              if (
                error instanceof RequestError &&
                error.code === "INVALID_REQUEST"
              ) {
                api.pendingReminders.delete(taskId);
                setRequest(null);
              }
              throw error;
            }
            api.pendingReminders.delete(taskId);
          }
          setRequest(null);
          if (!reminder) setScheduled("");
          await cache.invalidateQueries({ queryKey: ["private", "tasks"] });
        }, "In-app due metadata saved. No notification delivery is configured.");
      }}
    >
      <h3>{reminder ? "Edit in-app reminder" : "Add in-app reminder"}</h3>
      <p className="hint">
        Stored due metadata only. No notification, email, push, or background
        delivery is configured, including while this browser is closed.
      </p>
      <label>
        Reminder date and time (local)
        <input
          type="datetime-local"
          required
          value={scheduled}
          disabled={action.pending || request !== null}
          onChange={(event) => setScheduled(event.target.value)}
        />
      </label>
      <div className="actions">
        <button disabled={action.pending}>
          {request ? "Retry saving metadata" : "Save reminder metadata"}
        </button>
        {reminder && (
          <button
            type="button"
            disabled={action.pending}
            onClick={() =>
              void action.run(async () => {
                await api.request(
                  route(apiRoutes.reminder, reminder.id),
                  successResponseSchema,
                  { method: "DELETE" },
                );
                await cache.invalidateQueries({
                  queryKey: ["private", "tasks"],
                });
              }, "In-app reminder cancelled.")
            }
          >
            Cancel reminder metadata
          </button>
        )}
      </div>
      <ActionNotice action={action} />
    </form>
  );
}

export function EventCreator({
  api,
  task,
  timezone,
  connected,
}: {
  api: ApiClient;
  task: Task;
  timezone: string;
  connected: boolean;
}) {
  const saved = api.pendingEvents.get(task.id) ?? null;
  const [title, setTitle] = useState(saved?.title ?? task.title);
  const [start, setStart] = useState(
    localDateValue(saved?.startAt ?? task.dueAt),
  );
  const [end, setEnd] = useState(localDateValue(saved?.endAt ?? null));
  const [zone, setZone] = useState(saved?.timezone ?? timezone);
  const [confirmed, setConfirmed] = useState(saved !== null);
  const [request, setRequest] = useState<EventIntent | null>(saved);
  const action = useAction();
  const cache = useQueryClient();
  const link = task.calendarLink;
  const external = safeExternalLink(link?.htmlLink ?? null);
  if (link?.status === "Created")
    return (
      <section className="subpanel">
        <h3>Calendar event created</h3>
        <p>Google event ID: {link.googleEventId}</p>
        {external && (
          <a href={external} target="_blank" rel="noreferrer">
            Open Google Calendar event
          </a>
        )}
      </section>
    );
  return (
    <form
      className="subpanel"
      onSubmit={(event) => {
        event.preventDefault();
        void action.run(async () => {
          if (!confirmed)
            throw new Error("Confirm external calendar creation first.");
          const startAt = isoDate(start),
            endAt = isoDate(end);
          if (!startAt || !endAt || Date.parse(endAt) <= Date.parse(startAt))
            throw new Error("Choose an end time after the start time.");
          if (!title.trim() || !zone.trim())
            throw new Error("Enter an event title and timezone.");
          try {
            Intl.DateTimeFormat("en", { timeZone: zone.trim() });
          } catch {
            throw new Error(
              "Enter a valid IANA timezone, such as America/New_York or UTC.",
            );
          }
          const intent = request ?? {
            requestId: crypto.randomUUID(),
            title: title.trim(),
            startAt,
            endAt,
            timezone: zone.trim(),
          };
          api.pendingEvents.set(task.id, intent);
          setRequest(intent);
          const result = await api
            .request(
              route(apiRoutes.createEvent, task.id),
              calendarLinkSchema,
              { method: "POST", body: intent },
            )
            .catch((error) => {
              if (
                error instanceof RequestError &&
                error.code === "INVALID_REQUEST"
              ) {
                api.pendingEvents.delete(task.id);
                setRequest(null);
              }
              throw error;
            });
          await cache.invalidateQueries({ queryKey: ["private"] });
          if (result.status !== "Created")
            throw new Error(
              result.error
                ? `${result.error.message} (Request: ${result.error.requestId})`
                : "Calendar creation is not confirmed. Retry the same request to check its outcome.",
            );
          api.pendingEvents.delete(task.id);
          setRequest(null);
        }, "Google Calendar event creation confirmed.");
      }}
    >
      <h3>Create Google Calendar event</h3>
      {link && <p>Saved event state: {link.status}</p>}
      {link?.error && (
        <p role="alert">
          {link.error.message} · Request: {link.error.requestId}
        </p>
      )}
      <fieldset disabled={action.pending || request !== null}>
        <label>
          Event title
          <input
            value={title}
            required
            maxLength={300}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label>
          Event start (local time)
          <input
            type="datetime-local"
            required
            value={start}
            onChange={(event) => setStart(event.target.value)}
          />
        </label>
        <label>
          Event end (local time)
          <input
            type="datetime-local"
            required
            value={end}
            onChange={(event) => setEnd(event.target.value)}
          />
        </label>
        <label>
          Calendar timezone (IANA)
          <input
            value={zone}
            required
            onChange={(event) => setZone(event.target.value)}
          />
        </label>
        <p className="hint">
          Start and end use this browser’s local timezone (
          {Intl.DateTimeFormat().resolvedOptions().timeZone}); Calendar timezone
          is the event’s display timezone.
        </p>
        <label className="check">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          I confirm creating this event in my primary Google Calendar.
        </label>
      </fieldset>
      <button disabled={action.pending || !confirmed || !connected}>
        {request
          ? "Retry same calendar request"
          : "Create confirmed calendar event"}
      </button>
      {!connected && (
        <p>Reconnect Google in Connections before creating an event.</p>
      )}
      <p className="hint">
        Approval alone never creates a calendar event. Failed requests retain
        their idempotency key across in-app navigation; retry this same request.
      </p>
      <ActionNotice action={action} />
    </form>
  );
}
