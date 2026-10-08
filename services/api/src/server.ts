import { z } from "zod";
import { buildApp } from "./app.js";

const environment = z
  .object({
    API_HOST: z.string().min(1).default("127.0.0.1"),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    WEB_ORIGIN: z.url().default("http://127.0.0.1:5173"),
  })
  .safeParse(process.env);

if (!environment.success) {
  process.stderr.write(
    "Invalid API_HOST, API_PORT, or WEB_ORIGIN configuration.\n",
  );
  process.exitCode = 1;
} else {
  const app = buildApp({ webOrigin: environment.data.WEB_ORIGIN });
  const close = async () => {
    await app.close();
  };
  process.once("SIGINT", () => {
    void close();
  });
  process.once("SIGTERM", () => {
    void close();
  });
  try {
    await app.listen({
      host: environment.data.API_HOST,
      port: environment.data.API_PORT,
    });
    process.stdout.write("Action Inbox API listening.\n");
  } catch {
    process.stderr.write(
      "API startup failed. Check the configured host and port.\n",
    );
    process.exitCode = 1;
  }
}
