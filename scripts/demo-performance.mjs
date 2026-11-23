import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";
import { chromium } from "playwright";

// Explicit synthetic harness only. Never accepts a remote URL or saved profile.
const web = "http://127.0.0.1:5174";
const api = "http://127.0.0.1:3002";
const output = resolve(
  ".local-preview/performance",
  new Date().toISOString().replaceAll(":", "-"),
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  ...(process.env.CHROME_PATH
    ? { executablePath: process.env.CHROME_PATH }
    : {}),
  headless: true,
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  timezoneId: "America/Los_Angeles",
  reducedMotion: "no-preference",
});
await context.tracing.start({
  screenshots: true,
  snapshots: true,
  sources: true,
});
const page = await context.newPage();
const results = [];
try {
  await page.goto(`${api}/__smoke/start`);
  await page.waitForURL(`${web}/`);
  await page.getByRole("button", { name: "Planner", exact: true }).waitFor();
  await page.waitForFunction(
    async (origin) => {
      const response = await fetch(`${origin}/v1/inbox?limit=100`, {
        credentials: "include",
      });
      const data = await response.json();
      return (
        data.items?.length === 100 &&
        data.dataState.latestSyncRun?.status === "Succeeded"
      );
    },
    api,
    { timeout: 60_000, polling: 500 },
  );
  const snapshot = await page.evaluate(async (origin) => {
    const response = await fetch(`${origin}/v1/inbox?limit=100`, {
      credentials: "include",
    });
    return response.json();
  }, api);
  assert.equal(snapshot.items.length, 100, "Requires SMOKE_MESSAGE_COUNT=100");
  await writeFile(
    `${output}/synthetic-inbox.json`,
    JSON.stringify(snapshot, null, 2),
  );
  await page.addInitScript(() => {
    window.__demoPayloadTimes = [];
    window.__demoPending = 0;
    const original = window.fetch.bind(window);
    window.fetch = async (...args) => {
      window.__demoPending += 1;
      const response = await original(...args);
      const url = new URL(response.url);
      if (url.pathname.startsWith("/v1/")) {
        const json = response.json.bind(response);
        response.json = async () => {
          const body = await json();
          window.__demoPending -= 1;
          if (!response.ok)
            throw new Error(
              `Demo API failed: ${response.status} ${url.pathname}`,
            );
          window.__demoPayloadTimes.push({
            path: url.pathname,
            at: performance.now(),
          });
          return body;
        };
      }
      return response;
    };
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  for (let run = -1; run < 10; run += 1) {
    // Outside t0/t1: respect the production 120-request/minute limiter.
    if (run >= 0) await pause(10_000);
    const cacheEnabled = run >= 5;
    await cdp.send("Network.setCacheDisabled", {
      cacheDisabled: !cacheEnabled,
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page
      .getByText("100 source messages loaded", { exact: true })
      .waitFor();
    await page.waitForFunction(() => {
      const paths = window.__demoPayloadTimes.map((item) => item.path);
      return (
        window.__demoPending === 0 &&
        paths.filter((path) => path === "/v1/inbox").length >= 2 &&
        ["/v1/tasks", "/v1/calendar/upcoming", "/v1/canvas/connection"].every(
          (path) => paths.includes(path),
        )
      );
    });
    const t0 = await page.evaluate(() =>
      Math.max(...window.__demoPayloadTimes.map((item) => item.at)),
    );
    // Driver waits and both real user interactions are inside the measured interval.
    await page
      .getByRole("button", { name: "Open email & source →", exact: true })
      .first()
      .click();
    await page
      .getByRole("heading", { name: "Source email and review", exact: true })
      .waitFor();
    await page
      .getByRole("heading", {
        name: "Synthetic registration request 100",
        exact: true,
        level: 2,
      })
      .waitFor();
    await page
      .getByRole("button", { name: "← Back to Planner", exact: true })
      .click();
    await page.getByRole("button", { name: "Gmail", exact: true }).click();
    await page.waitForFunction(() => {
      const visiblePlan = document.querySelector("main")?.innerText ?? "";
      return (
        window.__demoPending === 0 &&
        visiblePlan.includes("100 source messages loaded") &&
        !visiblePlan.includes("Synthetic campus closure") &&
        !visiblePlan.includes("Synthetic cross-timezone meeting") &&
        Array.from(document.querySelectorAll("button")).some(
          (button) =>
            button.textContent === "Gmail" &&
            button.getAttribute("aria-pressed") === "true",
        )
      );
    });
    await page.evaluate(() =>
      Promise.all(
        document
          .getAnimations()
          .filter(
            (animation) =>
              animation.effect?.getTiming().iterations !== Infinity,
          )
          .map((animation) => animation.finished.catch(() => {})),
      ),
    );
    const t1 = await page.evaluate(
      () =>
        new Promise((resolveFrame) => {
          requestAnimationFrame(() =>
            requestAnimationFrame(() => resolveFrame(performance.now())),
          );
        }),
    );
    const timing = {
      run: run + 1,
      cache: cacheEnabled ? "enabled/warm" : "disabled",
      milliseconds: t1 - t0,
    };
    if (run >= 0) results.push(timing);
    console.log(JSON.stringify({ ...timing, warmup: run < 0 }));
    await writeFile(
      `${output}/progress.json`,
      JSON.stringify(results, null, 2) + "\n",
    );
  }
  const times = results
    .map((result) => result.milliseconds)
    .sort((a, b) => a - b);
  const report = {
    browser: browser.version(),
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    frontendBundle: await page
      .locator('script[type="module"]')
      .getAttribute("src"),
    viewport: "1440x1000",
    timezone: "America/Los_Angeles",
    motion: "normal; finite UI transitions included in the measured interval",
    messages: 100,
    methodology:
      "T31: one warm-up, five cache-disabled and five cache-enabled reloads; t0 last consumed dashboard API payload; t1 painted source-detail round trip and loaded Gmail filter result. Driver waits included; ten-second pacing only between runs.",
    results,
    maxMilliseconds: Math.max(...times),
    medianMilliseconds: (times[4] + times[5]) / 2,
    passed: times.every((time) => time <= 2000),
  };
  await writeFile(
    `${output}/results.json`,
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report));
  assert(
    report.passed,
    "Every measured T31 interaction must complete within 2 seconds",
  );
} catch (error) {
  await writeFile(
    `${output}/failure.json`,
    JSON.stringify(
      {
        error: String(error),
        completedMeasurements: results,
      },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  await context.tracing.stop({ path: `${output}/trace.zip` });
  await browser.close();
}
