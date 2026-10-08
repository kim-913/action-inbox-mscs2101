import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import type { ClientRequest } from "node:http";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import ICAL from "ical.js";
import type { CanvasDate, CanvasItem } from "@action-inbox/contracts";
import { ApiFailure } from "../runtime.js";

export type CanvasFeedReader = (feedUrl: string) => Promise<CanvasItem[]>;
const HOST = "sofia.instructure.com";
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_EVENTS = 1000;
const MAX_FIELD = 64 * 1024;

function invalid(status = 502): ApiFailure {
  return new ApiFailure(
    status,
    "CANVAS_FEED_INVALID",
    "The Canvas calendar feed could not be read safely.",
  );
}
function unavailable(status = 502): ApiFailure {
  return new ApiFailure(
    status,
    "CANVAS_UNAVAILABLE",
    "Canvas calendar is unavailable. Try again later.",
  );
}

export function validateCanvasFeedUrl(input: string): string {
  // Validate the original spelling before URL normalization can erase traversal,
  // credentials, empty query delimiters, or an explicit default port.
  if (
    input.length > 2048 ||
    /\s/.test(input) ||
    !/^https:\/\/sofia\.instructure\.com\/feeds\/calendars\/user_[A-Za-z0-9_-]+\.ics$/.test(
      input,
    )
  ) {
    throw invalid(400);
  }
  return new URL(input).href;
}

const privateAddresses = new BlockList();
for (const [address, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
] as const)
  privateAddresses.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
] as const)
  privateAddresses.addSubnet(address, prefix, "ipv6");
const globalV6 = new BlockList();
globalV6.addSubnet("2000::", 3, "ipv6");
function publicAddress(address: string, family: number): boolean {
  if (isIP(address) !== family) return false;
  if (family === 4) return !privateAddresses.check(address, "ipv4");
  return (
    family === 6 &&
    globalV6.check(address, "ipv6") &&
    !privateAddresses.check(address, "ipv6")
  );
}

function download(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let req: ClientRequest | undefined;
    let settled = false;
    const finish = (error: ApiFailure | null, body?: string) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        req?.destroy();
        reject(error);
      } else resolve(body ?? "");
    };
    // Covers DNS, TLS, headers and the entire body, not just socket inactivity.
    const timer = setTimeout(() => finish(unavailable(504)), 15_000);
    void lookup(HOST, { all: true, verbatim: true })
      .then((addresses) => {
        if (settled) return;
        if (
          !addresses.length ||
          addresses.some(
            ({ address, family }) => !publicAddress(address, family),
          )
        ) {
          finish(unavailable());
          return;
        }
        const pinned = addresses[0]!;
        req = request(
          url,
          {
            method: "GET",
            agent: false,
            servername: HOST,
            rejectUnauthorized: true,
            family: pinned.family,
            // Node still verifies the original host certificate. This lookup never
            // consults DNS again, including when Node requests an all-address lookup.
            lookup: (_hostname, options, callback) => {
              if (options.all) callback(null, [pinned]);
              else callback(null, pinned.address, pinned.family);
            },
            headers: {
              accept: "text/calendar",
              "accept-encoding": "identity",
              "user-agent": "ActionInbox/0.1 (Canvas calendar subscription)",
            },
            maxHeaderSize: 16 * 1024,
          },
          (response) => {
            const encoding = response.headers["content-encoding"];
            const contentType = response.headers["content-type"] ?? "";
            if (response.statusCode !== 200) {
              finish(unavailable());
              response.destroy();
              return;
            }
            if (
              (encoding && encoding.toLowerCase() !== "identity") ||
              !/^text\/calendar(?:\s*;\s*charset\s*=\s*(?:utf-8|"utf-8"))?\s*$/i.test(
                contentType,
              )
            ) {
              finish(invalid());
              response.destroy();
              return;
            }
            const length = response.headers["content-length"];
            if (
              length &&
              (!/^\d+$/.test(length) || Number(length) > MAX_BYTES)
            ) {
              finish(invalid());
              response.destroy();
              return;
            }
            const chunks: Buffer[] = [];
            let bytes = 0;
            response.on("data", (chunk: Buffer) => {
              if (settled) return;
              bytes += chunk.length;
              if (bytes > MAX_BYTES) {
                finish(invalid());
                response.destroy();
              } else chunks.push(chunk);
            });
            response.on("aborted", () => finish(invalid()));
            response.on("error", () => finish(unavailable()));
            response.on("end", () => {
              if (settled) return;
              if (
                !response.complete ||
                (length !== undefined && Number(length) !== bytes)
              ) {
                finish(invalid());
                return;
              }
              try {
                finish(
                  null,
                  new TextDecoder("utf-8", { fatal: true }).decode(
                    Buffer.concat(chunks, bytes),
                  ),
                );
              } catch {
                finish(invalid());
              }
            });
          },
        );
        req.on("error", () => finish(unavailable()));
        req.end();
      })
      .catch(() => finish(unavailable()));
  });
}

export const fetchCanvasFeed: CanvasFeedReader = async (feedUrl) => {
  const url = validateCanvasFeedUrl(feedUrl);
  return parseCanvasFeed(await download(url));
};

// ICAL.js is the property/value parser. Its intentionally permissive component
// closing logic needs a separate framing guard to reject truncated snapshots.
function completeEnvelope(text: string): void {
  const stack: string[] = [];
  let roots = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    if (line.length > MAX_FIELD) throw invalid();
    if (line.startsWith(" ") || line.startsWith("\t")) {
      if (!stack.length) throw invalid();
      continue;
    }
    const upper = line.toUpperCase();
    if (upper.startsWith("BEGIN:")) {
      const name = upper.slice(6);
      if (!stack.length && (++roots !== 1 || name !== "VCALENDAR"))
        throw invalid();
      stack.push(name);
      if (stack.length > 4) throw invalid();
    } else if (upper.startsWith("END:")) {
      if (stack.pop() !== upper.slice(4)) throw invalid();
    } else if (!stack.length) throw invalid();
  }
  if (stack.length || roots !== 1) throw invalid();
}

function single(component: ICAL.Component, name: string): ICAL.Property | null {
  const properties = component.getAllProperties(name);
  if (properties.length > 1) throw invalid();
  return properties[0] ?? null;
}
function field(component: ICAL.Component, name: string, limit: number): string {
  const property = single(component, name);
  if (!property) return "";
  const value = property.getFirstValue();
  if (typeof value !== "string" || value.length > limit) throw invalid();
  return value;
}
function plainText(value: string): string {
  // ICAL.js has already decoded ICS TEXT. Do not reinterpret literal homework
  // syntax or entity spellings as HTML; consumers render this string as text.
  return value.replace(
    /https?:\/\/sofia\.instructure\.com\/feeds\/[^\s<>"']+/gi,
    "[private calendar link]",
  );
}
function sourceUrl(value: string): string | null {
  if (!value || value.length > 2048 || /[\\\s%]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.origin !== `https://${HOST}` || url.username || url.password)
      return null;
    // Never expose a feed credential, a login redirect, or arbitrary Sofia APIs.
    if (
      !/^https:\/\/sofia\.instructure\.com\/(?:calendar(?:[?#]|$)|courses\/\d+(?:[/?#]|$))/.test(
        value,
      )
    )
      return null;
    if (
      url.pathname !== "/calendar" &&
      !/^\/courses\/\d+(?:\/(?:assignments|discussion_topics|quizzes)(?:\/\d+)?)?\/?$/.test(
        url.pathname,
      )
    )
      return null;
    if (url.pathname === "/calendar") {
      for (const [key, entry] of url.searchParams) {
        if (
          key === "include_contexts"
            ? !/^(?:course|user|group|account)_\d+$/.test(entry)
            : !["month", "year"].includes(key) || !/^\d+$/.test(entry)
        )
          return null;
      }
      if (url.hash && !/^#(?:assignment|calendar_event)_\d+$/.test(url.hash))
        return null;
    } else if (url.search || url.hash) return null;
    return url.href;
  } catch {
    return null;
  }
}

function date(component: ICAL.Component, name: string): CanvasDate | null {
  const property = single(component, name);
  if (!property) return null;
  // Validate the raw jCal value before ICAL.Time's normalization can turn an
  // impossible date into a different, apparently valid day.
  const raw: unknown = property.jCal[3];
  if (raw === "" && name === "dtstart") return null;
  if (typeof raw !== "string" || property.jCal.length !== 4) throw invalid();
  const dateOnly = property.type === "date";
  if (
    !(
      dateOnly
        ? /^\d{4}-\d{2}-\d{2}$/
        : /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z?$/
    ).test(raw)
  )
    throw invalid();
  const canonical = dateOnly
    ? `${raw}T00:00:00.000Z`
    : `${raw.replace(/Z$/, "")}.000Z`;
  const checked = new Date(canonical);
  if (
    !Number.isFinite(checked.getTime()) ||
    checked.toISOString() !== canonical
  )
    throw invalid();
  const tzid = property.getParameter("tzid");
  if (dateOnly) {
    if (tzid) throw invalid();
    return { kind: "date", value: raw, timeZone: null };
  }
  if (property.type !== "date-time" || (tzid && typeof tzid !== "string"))
    throw invalid();
  if (raw.endsWith("Z") && tzid) throw invalid();
  const value = property.getFirstValue();
  if (!(value instanceof ICAL.Time)) throw invalid();
  if (!raw.endsWith("Z") && (!tzid || !component.getTimeZoneByID(tzid)))
    throw invalid();
  if (value.zone === ICAL.Timezone.localTimezone) throw invalid();
  return {
    kind: "instant",
    value: value.toJSDate().toISOString(),
    timeZone: typeof tzid === "string" ? tzid : "UTC",
  };
}

function checkBounds(component: ICAL.Component): void {
  const properties = component.getAllProperties();
  if (properties.length > 128) throw invalid();
  for (const property of properties) {
    if (JSON.stringify(property.jCal).length > MAX_FIELD) throw invalid();
  }
  for (const child of component.getAllSubcomponents()) checkBounds(child);
}

function checkTimezone(component: ICAL.Component): void {
  const id = field(component, "tzid", 256);
  if (!id) throw invalid();
  const transitions = component.getAllSubcomponents();
  if (!transitions.length || transitions.length > 16) throw invalid();
  for (const transition of transitions) {
    if (
      !["standard", "daylight"].includes(transition.name) ||
      transition.getAllSubcomponents().length
    )
      throw invalid();
    const start = single(transition, "dtstart");
    const rawStart: unknown = start?.jCal[3];
    if (
      start?.type !== "date-time" ||
      typeof rawStart !== "string" ||
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(rawStart) ||
      start.getParameter("tzid")
    )
      throw invalid();
    const canonical = `${rawStart}.000Z`;
    const checked = new Date(canonical);
    if (
      !Number.isFinite(checked.getTime()) ||
      checked.toISOString() !== canonical
    )
      throw invalid();
    for (const required of ["tzoffsetfrom", "tzoffsetto"]) {
      const offset = single(transition, required)?.getFirstValue();
      if (
        !(offset instanceof ICAL.UtcOffset) ||
        Math.abs(offset.toSeconds()) >= 24 * 60 * 60
      )
        throw invalid();
    }
    if (transition.hasProperty("rdate") || transition.hasProperty("exdate"))
      throw invalid();
    const recurrence = single(transition, "rrule")?.getFirstValue();
    if (recurrence) {
      // Support ordinary annual DST transitions only. Restricting to one
      // valid ordinal weekday in one month prevents pathological iterators.
      if (
        !(recurrence instanceof ICAL.Recur) ||
        recurrence.freq !== "YEARLY" ||
        recurrence.interval !== 1
      )
        throw invalid();
      const { BYMONTH: months, BYDAY: days } = recurrence.parts;
      if (
        Object.keys(recurrence.parts).some(
          (key) => key !== "BYMONTH" && key !== "BYDAY",
        ) ||
        months?.length !== 1 ||
        !Number.isInteger(months[0]) ||
        months[0]! < 1 ||
        months[0]! > 12 ||
        days?.length !== 1 ||
        !/^(?:[1-4]|-1)(?:MO|TU|WE|TH|FR|SA|SU)$/.test(days[0]!)
      )
        throw invalid();
    }
  }
}

export function parseCanvasFeed(text: string): CanvasItem[] {
  try {
    if (Buffer.byteLength(text, "utf8") > MAX_BYTES || text.includes("\0"))
      throw invalid();
    completeEnvelope(text);
    const calendar = new ICAL.Component(ICAL.parse(text));
    if (
      calendar.name !== "vcalendar" ||
      field(calendar, "version", 16) !== "2.0"
    )
      throw invalid();
    if (
      calendar.hasProperty("method") &&
      field(calendar, "method", 32).toUpperCase() !== "PUBLISH"
    )
      throw invalid();
    if (
      calendar.hasProperty("calscale") &&
      field(calendar, "calscale", 32).toUpperCase() !== "GREGORIAN"
    )
      throw invalid();
    checkBounds(calendar);
    const events: ICAL.Component[] = [];
    const zones = new Set<string>();
    for (const component of calendar.getAllSubcomponents()) {
      if (component.name === "vevent") events.push(component);
      else if (component.name === "vtimezone") {
        checkTimezone(component);
        const id = field(component, "tzid", 256);
        if (zones.has(id) || zones.size >= 32) throw invalid();
        zones.add(id);
      } else throw invalid();
    }
    if (events.length > MAX_EVENTS) throw invalid();
    const ids = new Set<string>();
    return events.map((event) => {
      if (
        event.getAllSubcomponents().length ||
        ["rrule", "rdate", "exdate", "exrule", "duration"].some((name) =>
          event.hasProperty(name),
        )
      )
        throw invalid();
      const uid = field(event, "uid", 1024);
      if (!uid.trim()) throw invalid();
      const recurrence = date(event, "recurrence-id");
      if (single(event, "recurrence-id")?.getParameter("range"))
        throw invalid();
      const id = createHash("sha256")
        .update(
          JSON.stringify([
            uid,
            recurrence ? [recurrence.kind, recurrence.value] : null,
          ]),
        )
        .digest("hex");
      if (ids.has(id)) throw invalid();
      ids.add(id);
      const start = date(event, "dtstart");
      const end = date(event, "dtend");
      if (end && (!start || start.kind !== end.kind || end.value < start.value))
        throw invalid();
      // Pinned Canvas emitter convention, not keyword guessing from the title.
      const kind =
        /^event-(?:assignment|assignment-override|sub-assignment)-\d+$/.test(
          uid,
        )
          ? "Assignment"
          : "Event";
      return {
        id,
        kind,
        title: plainText(field(event, "summary", 2048)),
        description: plainText(field(event, "description", MAX_FIELD)),
        sourceUrl: sourceUrl(field(event, "url", 2048)),
        start,
        end,
        cancelled: field(event, "status", 32).toUpperCase() === "CANCELLED",
      };
    });
  } catch {
    // Never propagate parser exception strings, which can contain credentials
    // or private event text. A failed parse never becomes an empty snapshot.
    throw invalid();
  }
}
