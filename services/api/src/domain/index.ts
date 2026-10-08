import type { FastifyInstance } from "fastify";
import type { Runtime } from "../runtime.js";
import { registerAccount } from "./account.js";
import { registerCalendar } from "./calendar.js";
import { registerReminders } from "./reminders.js";
import { registerSuggestions } from "./suggestions.js";
import { registerTasks } from "./tasks.js";
import { registerDisplay } from "./display.js";

export async function registerDomain(
  app: FastifyInstance,
  runtime: Runtime,
): Promise<void> {
  registerSuggestions(app, runtime);
  registerTasks(app, runtime);
  registerReminders(app, runtime);
  registerCalendar(app, runtime);
  registerAccount(app, runtime);
  registerDisplay(app, runtime);
}
