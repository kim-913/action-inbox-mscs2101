import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import type { RequestOptions } from "node:https";
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type Mock,
} from "vitest";
import { ApiFailure } from "../runtime.js";
import {
  fetchCanvasFeed,
  parseCanvasFeed,
  validateCanvasFeedUrl,
} from "./feed.js";

const network = vi.hoisted(() => ({ lookup: vi.fn(), request: vi.fn() }));
vi.mock("node:dns/promises", () => ({ lookup: network.lookup }));
vi.mock("node:https", () => ({ request: network.request }));
const feedUrl =
  "https://sofia.instructure.com/feeds/calendars/user_synthetic-secret-not-a-hex-uuid.ics";
const calendar = (...events: string[]) =>
  [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Synthetic//EN",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
const event = (properties = "", uid = "event-assignment-101") =>
  [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    "SUMMARY:Synthetic assignment [DEMO]",
    properties,
    "END:VEVENT",
  ].join("\r\n");
const fixture = (name: string) =>
  readFileSync(
    new URL(`../../../../test-data/canvas/${name}.ics`, import.meta.url),
    "utf8",
  );

describe("Canvas credential URL boundary", () => {
  it("accepts only the pinned user feed without assuming a hexadecimal UUID", () => {
    expect(validateCanvasFeedUrl(feedUrl)).toBe(feedUrl);
    expect(
      validateCanvasFeedUrl(
        "https://sofia.instructure.com/feeds/calendars/user_abc_123-XYZ.ics",
      ),
    ).toContain("user_abc_123-XYZ.ics");
  });
  it.each([
    "http://sofia.instructure.com/feeds/calendars/user_secret.ics",
    "https://evil.example/feeds/calendars/user_secret.ics",
    "https://sofia.instructure.com.evil.example/feeds/calendars/user_secret.ics",
    "https://user:password@sofia.instructure.com/feeds/calendars/user_secret.ics",
    "https://sofia.instructure.com:443/feeds/calendars/user_secret.ics",
    "https://sofia.instructure.com:8443/feeds/calendars/user_secret.ics",
    "https://sofia.instructure.com/feeds/calendars/course_secret.ics",
    "https://sofia.instructure.com/feeds/calendars/user_.ics",
    "https://sofia.instructure.com/feeds/calendars/user_secret.ics?",
    "https://sofia.instructure.com/feeds/calendars/user_secret.ics#",
    "https://sofia.instructure.com/feeds/calendars/user_secret.ics?token=private",
    "https://sofia.instructure.com/feeds/calendars/user_secret.ics#private",
    "https://sofia.instructure.com/feeds/calendars/../calendars/user_secret.ics",
    "https://sofia.instructure.com/feeds/calendars/%2e%2e/user_secret.ics",
    "https://sofia.instructure.com/feeds/calendars/user_a%2fb.ics",
    "https://sofia.instructure.com\\feeds\\calendars\\user_secret.ics",
    ` ${feedUrl}`,
    `${feedUrl}\n`,
    feedUrl.replace("user_", `user_${"x".repeat(2048)}`),
  ])(
    "rejects unsafe raw URL spellings without reflecting the credential",
    (input) => {
      try {
        validateCanvasFeedUrl(input);
        expect.unreachable("URL accepted");
      } catch (error) {
        expect(error).toBeInstanceOf(ApiFailure);
        expect(error).toMatchObject({
          status: 400,
          code: "CANVAS_FEED_INVALID",
        });
        expect(String(error)).not.toContain("secret");
        expect(String(error)).not.toContain(input);
      }
    },
  );
});

describe("Canvas iCalendar snapshots", () => {
  it("parses synthetic pinned-emitter fixtures with unfolding and escaped text", () => {
    const items = parseCanvasFeed(fixture("original"));
    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({
      kind: "Assignment",
      title: "Synthetic design brief [SYNTH-101]",
      start: {
        kind: "instant",
        value: "2026-10-15T18:00:00.000Z",
        timeZone: "UTC",
      },
      end: {
        kind: "instant",
        value: "2026-10-15T18:00:00.000Z",
        timeZone: "UTC",
      },
      sourceUrl: null,
      cancelled: false,
    });
    expect(items[0]?.description).toContain(
      "Prepare a diagram, explanation; and notes.",
    );
    expect(items[0]?.description).toContain("C:\\demo.This sentence continues");
    expect(items[1]?.kind).toBe("Event");
    expect(items[2]?.start).toEqual({
      kind: "date",
      value: "2026-10-17",
      timeZone: null,
    });
    expect(items[2]?.end).toBeNull();
    expect(items[3]).toMatchObject({
      kind: "Assignment",
      start: { kind: "date", value: "2026-10-18" },
      end: null,
    });
  });
  it("keeps UID identity across changed due dates and does not invent missing events", () => {
    const original = parseCanvasFeed(fixture("original"));
    const changed = parseCanvasFeed(fixture("changed"));
    expect(changed).toHaveLength(3);
    expect(changed[0]?.id).toBe(original[0]?.id);
    expect(changed[0]?.start).not.toEqual(original[0]?.start);
    expect(changed.some((item) => item.id === original[2]?.id)).toBe(false);
  });
  it.each([
    "event-assignment-1",
    "event-assignment-override-2",
    "event-sub-assignment-3",
  ])("recognizes only upstream assignment UID convention %s", (uid) => {
    expect(parseCanvasFeed(calendar(event("", uid)))[0]?.kind).toBe(
      "Assignment",
    );
  });
  it.each([
    "assignment-1",
    "event-calendar-event-1",
    "event-assignment-fake",
    "event-assignment-1-extra",
  ])("does not infer assignments from title or UID lookalikes %s", (uid) => {
    expect(parseCanvasFeed(calendar(event("", uid)))[0]?.kind).toBe("Event");
  });
  it("supports absent DTSTART and exposes STATUS:CANCELLED as a generic parser fact", () => {
    expect(
      parseCanvasFeed(calendar(event("STATUS:CANCELLED")))[0],
    ).toMatchObject({ start: null, end: null, cancelled: true });
    expect(parseCanvasFeed(calendar())).toEqual([]);
  });
  it("hashes UID plus recurrence identity, not changed DTSTART", () => {
    const properties =
      "RECURRENCE-ID:20261001T120000Z\r\nDTSTART:20261002T120000Z";
    const first = parseCanvasFeed(calendar(event(properties)))[0]!;
    const moved = parseCanvasFeed(
      calendar(
        event(properties.replace("DTSTART:20261002", "DTSTART:20261003")),
      ),
    )[0]!;
    const other = parseCanvasFeed(
      calendar(
        event(
          properties.replace(
            "RECURRENCE-ID:20261001",
            "RECURRENCE-ID:20261004",
          ),
        ),
      ),
    )[0]!;
    expect(first.id).toMatch(/^[a-f0-9]{64}$/);
    expect(moved.id).toBe(first.id);
    expect(other.id).not.toBe(first.id);
  });
  it.each(["course", "user", "group", "account"])(
    "retains native %s calendar source links without allowing arbitrary query destinations",
    (context) => {
      const url = `https://sofia.instructure.com/calendar?include_contexts=${context}_41&month=10&year=2026#calendar_event_8`;
      expect(
        parseCanvasFeed(
          calendar(event(`URL:${url}`, "event-calendar-event-8")),
        )[0]?.sourceUrl,
      ).toBe(url);
      expect(
        parseCanvasFeed(
          calendar(
            event(`URL:${url.replace("#", "&redirect=https://evil.example#")}`),
          ),
        )[0]?.sourceUrl,
      ).toBeNull();
      expect(
        parseCanvasFeed(
          calendar(
            event(`URL:${url.replace(`${context}_41`, "unsupported_41")}`),
          ),
        )[0]?.sourceUrl,
      ).toBeNull();
    },
  );
  it("retains exclusive all-day ends without manufacturing timezone or midnight", () => {
    expect(
      parseCanvasFeed(
        calendar(
          event("DTSTART;VALUE=DATE:20261101\r\nDTEND;VALUE=DATE:20261102"),
        ),
      )[0],
    ).toMatchObject({
      start: { kind: "date", value: "2026-11-01", timeZone: null },
      end: { kind: "date", value: "2026-11-02", timeZone: null },
    });
  });
  it("resolves component-local named timezone transitions and never registers zones globally", () => {
    const timezone = [
      "BEGIN:VTIMEZONE",
      "TZID:America/New_York",
      "BEGIN:STANDARD",
      "DTSTART:19701101T020000",
      "TZOFFSETFROM:-0400",
      "TZOFFSETTO:-0500",
      "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
      "END:STANDARD",
      "BEGIN:DAYLIGHT",
      "DTSTART:19700308T020000",
      "TZOFFSETFROM:-0500",
      "TZOFFSETTO:-0400",
      "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
      "END:DAYLIGHT",
      "END:VTIMEZONE",
    ].join("\r\n");
    const properties =
      "DTSTART;TZID=America/New_York:20260701T090000\r\nDTEND;TZID=America/New_York:20260701T100000";
    expect(
      parseCanvasFeed(calendar(timezone, event(properties)))[0],
    ).toMatchObject({
      start: {
        kind: "instant",
        value: "2026-07-01T13:00:00.000Z",
        timeZone: "America/New_York",
      },
      end: {
        kind: "instant",
        value: "2026-07-01T14:00:00.000Z",
        timeZone: "America/New_York",
      },
    });
    expect(() => parseCanvasFeed(calendar(event(properties)))).toThrow(
      ApiFailure,
    );
    const localOccurrence = parseCanvasFeed(
      calendar(
        timezone,
        event("RECURRENCE-ID;TZID=America/New_York:20260701T090000"),
      ),
    )[0]!;
    const utcOccurrence = parseCanvasFeed(
      calendar(event("RECURRENCE-ID:20260701T130000Z")),
    )[0]!;
    expect(localOccurrence.id).toBe(utcOccurrence.id);
  });
  it.each([
    "DTSTART:20260230T120000Z",
    "DTSTART:20261301T120000Z",
    "DTSTART:20261001T250000Z",
    "DTSTART:20261001T120000",
    "DTSTART;TZID=Unknown/Zone:20261001T120000",
    "DTSTART;VALUE=DATE:20260230",
    "DTSTART;VALUE=DATE;TZID=UTC:20261001",
    "DTSTART;TZID=America/New_York:20261001T120000Z",
    "DTSTART:20261001T120000Z\r\nDTEND:20260901T120000Z",
    "DTSTART;VALUE=DATE:20261001\r\nDTEND:20261002T120000Z",
    "DTEND:20261001T120000Z",
    "RRULE:FREQ=DAILY",
    "RDATE:20261001T120000Z",
    "EXDATE:20261001T120000Z",
    "EXRULE:FREQ=DAILY",
    "DURATION:PT1H",
    "RECURRENCE-ID;RANGE=THISANDFUTURE:20261001T120000Z",
    "SUMMARY:duplicate",
  ])(
    "rejects unsupported or invalid semantics rather than publishing partial data: %s",
    (properties) => {
      expect(() => parseCanvasFeed(calendar(event(properties)))).toThrow(
        "could not be read safely",
      );
    },
  );
  it("rejects malformed, truncated, mixed-component and oversized snapshots", () => {
    for (const text of [
      fixture("truncated"),
      fixture("unsupported-properties"),
      "<html>private upstream error</html>",
      calendar(event()).replace("END:VEVENT", "END:VTODO"),
      calendar(event()).replace("VERSION:2.0", "VERSION:1.0"),
      calendar(event()).replace("END:VCALENDAR", ""),
      `${calendar()}${calendar()}`,
      calendar("BEGIN:VTODO\r\nUID:hidden\r\nEND:VTODO"),
      calendar(event(), event()),
      calendar(event("DESCRIPTION:" + "x".repeat(65537))),
      calendar(event("SUMMARY:" + "x".repeat(2049))),
      "x".repeat(2 * 1024 * 1024 + 1),
      calendar(
        ...Array.from({ length: 1001 }, (_, index) =>
          event("", `event-calendar-event-${index}`),
        ),
      ),
    ])
      expect(() => parseCanvasFeed(text)).toThrow(ApiFailure);
  });
  it("preserves decoded ICS text literally and ignores alternative HTML and attachments", () => {
    const text =
      "Use vector<T>, literal <script>example()</script>, &amp; and &lt;.\\nDo not execute code.";
    const item = parseCanvasFeed(
      calendar(
        event(
          [
            `DESCRIPTION:${text}`,
            "X-ALT-DESC;FMTTYPE=text/html:<script>private-alt()</script>",
            "ATTACH:https://evil.example/attachment",
          ].join("\r\n"),
        ).replace(
          "SUMMARY:Synthetic assignment [DEMO]",
          "SUMMARY:Explore vector<T> &amp; [DEMO]",
        ),
      ),
    )[0]!;
    expect(item.title).toBe("Explore vector<T> &amp; [DEMO]");
    expect(item.description).toBe(text.replace("\\n", "\n"));
    expect(item.description).not.toContain("private-alt");
    expect(network.request).not.toHaveBeenCalled();
  });
  it("accepts only existing approved Sofia source URLs and redacts feed URLs in displayed text", () => {
    const allowed =
      "https://sofia.instructure.com/calendar?include_contexts=course_42&month=10&year=2026#assignment_12";
    expect(
      parseCanvasFeed(calendar(event(`URL:${allowed}`)))[0]?.sourceUrl,
    ).toBe(allowed);
    expect(
      parseCanvasFeed(
        calendar(
          event("URL:https://sofia.instructure.com/courses/42/assignments/12"),
        ),
      )[0]?.sourceUrl,
    ).toBe("https://sofia.instructure.com/courses/42/assignments/12");
    for (const url of [
      feedUrl,
      "javascript:alert(1)",
      "https://evil.example/calendar",
      "http://sofia.instructure.com/calendar",
      "https://user:secret@sofia.instructure.com/calendar",
      "https://sofia.instructure.com/login",
      "https://sofia.instructure.com/calendar?redirect=https://evil.example",
      "https://sofia.instructure.com/courses/42/../../feeds/calendars/user_secret.ics",
      "https://sofia.instructure.com/courses/42/%2e%2e/feeds",
      "https://sofia.instructure.com:443/calendar",
    ]) {
      expect(
        parseCanvasFeed(calendar(event(`URL:${url}`)))[0]?.sourceUrl,
      ).toBeNull();
    }
    expect(
      parseCanvasFeed(calendar(event(`DESCRIPTION:Private ${feedUrl}`)))[0]
        ?.description,
    ).not.toContain("synthetic-secret");
  });
  it("redacts raw parser values and private malformed input from errors", () => {
    try {
      parseCanvasFeed(calendar(event("DTSTART:private-token-do-not-echo")));
      expect.unreachable();
    } catch (error) {
      expect(error).toMatchObject({ code: "CANVAS_FEED_INVALID" });
      expect(String(error)).not.toContain("private-token");
    }
  });
});

describe("Canvas pinned HTTPS transport", () => {
  let outbound: EventEmitter & { end: Mock; destroy: Mock };
  let options: RequestOptions;
  let respond: (response: PassThrough) => void;
  beforeEach(() => {
    network.lookup
      .mockReset()
      .mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    network.request.mockReset();
    outbound = Object.assign(new EventEmitter(), {
      end: vi.fn(),
      destroy: vi.fn(),
    });
    network.request.mockImplementation(
      (
        _url: string,
        init: RequestOptions,
        callback: (response: PassThrough) => void,
      ) => {
        options = init;
        respond = callback;
        return outbound;
      },
    );
  });
  afterEach(() => vi.useRealTimers());

  async function reply(
    body = calendar(event()),
    overrides: {
      statusCode?: number;
      headers?: Record<string, string>;
      complete?: boolean;
    } = {},
  ) {
    const pending = fetchCanvasFeed(feedUrl);
    await Promise.resolve();
    const response = Object.assign(new PassThrough(), {
      statusCode: overrides.statusCode ?? 200,
      headers: overrides.headers ?? {
        "content-type": "text/calendar; charset=utf-8",
      },
      complete: overrides.complete ?? true,
    });
    respond(response);
    response.end(body);
    return pending;
  }
  it("pins the socket lookup to the validated address while preserving host, SNI and certificate checks", async () => {
    const pending = reply();
    await Promise.resolve();
    expect(options).toMatchObject({
      servername: "sofia.instructure.com",
      rejectUnauthorized: true,
      agent: false,
      family: 4,
      headers: { "accept-encoding": "identity" },
    });
    network.lookup.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const callback = vi.fn();
    const pinnedLookup = options.lookup as (
      hostname: string,
      options: { all?: boolean },
      callback: (...args: unknown[]) => void,
    ) => void;
    pinnedLookup("sofia.instructure.com", {}, callback);
    expect(callback).toHaveBeenLastCalledWith(null, "93.184.216.34", 4);
    pinnedLookup("sofia.instructure.com", { all: true }, callback);
    expect(callback).toHaveBeenLastCalledWith(null, [
      { address: "93.184.216.34", family: 4 },
    ]);
    expect(network.lookup).toHaveBeenCalledTimes(1);
    expect(network.lookup).toHaveBeenCalledWith("sofia.instructure.com", {
      all: true,
      verbatim: true,
    });
    expect(network.request.mock.calls[0]?.[0]).toBe(feedUrl);
    await expect(pending).resolves.toHaveLength(1);
  });
  it.each([
    ["0.0.0.0", 4],
    ["10.2.3.4", 4],
    ["100.64.0.1", 4],
    ["127.0.0.1", 4],
    ["169.254.169.254", 4],
    ["172.16.0.1", 4],
    ["192.168.1.1", 4],
    ["192.0.0.1", 4],
    ["192.0.2.1", 4],
    ["198.18.0.1", 4],
    ["198.51.100.1", 4],
    ["203.0.113.1", 4],
    ["224.0.0.1", 4],
    ["255.255.255.255", 4],
    ["::", 6],
    ["::1", 6],
    ["fc00::1", 6],
    ["fe80::1", 6],
    ["ff02::1", 6],
    ["::ffff:127.0.0.1", 6],
    ["64:ff9b::7f00:1", 6],
    ["2001:db8::1", 6],
    ["2001::1", 6],
    ["2002:7f00:1::", 6],
    ["3fff::1", 6],
  ])(
    "rejects nonpublic DNS address %s before opening HTTPS",
    async (address, family) => {
      network.lookup.mockResolvedValue([{ address, family }]);
      await expect(fetchCanvasFeed(feedUrl)).rejects.toMatchObject({
        code: "CANVAS_UNAVAILABLE",
      });
      expect(network.request).not.toHaveBeenCalled();
    },
  );
  it("rejects mixed public/private and empty DNS results", async () => {
    network.lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "::1", family: 6 },
    ]);
    await expect(fetchCanvasFeed(feedUrl)).rejects.toBeInstanceOf(ApiFailure);
    network.lookup.mockResolvedValue([]);
    await expect(fetchCanvasFeed(feedUrl)).rejects.toBeInstanceOf(ApiFailure);
    expect(network.request).not.toHaveBeenCalled();
  });
  it("supports public IPv6 through the same pinned transport", async () => {
    network.lookup.mockResolvedValue([
      { address: "2606:4700:4700::1111", family: 6 },
    ]);
    await expect(reply()).resolves.toHaveLength(1);
    expect(options.family).toBe(6);
  });
  it.each([301, 302, 303, 307, 308, 401, 403, 500])(
    "never follows status %s or exposes response content",
    async (statusCode) => {
      await expect(
        reply("private upstream body", {
          statusCode,
          headers: { location: "http://127.0.0.1/private" },
        }),
      ).rejects.toMatchObject({
        code: "CANVAS_UNAVAILABLE",
        message: "Canvas calendar is unavailable. Try again later.",
      });
      expect(network.request).toHaveBeenCalledTimes(1);
      expect(outbound.destroy).toHaveBeenCalled();
    },
  );
  it("enforces the 15 second deadline while DNS hangs and ignores late DNS completion", async () => {
    vi.useFakeTimers();
    let resolveLookup!: (
      addresses: { address: string; family: number }[],
    ) => void;
    network.lookup.mockReturnValue(
      new Promise((resolve) => {
        resolveLookup = resolve;
      }),
    );
    const pending = fetchCanvasFeed(feedUrl);
    const assertion = expect(pending).rejects.toMatchObject({
      status: 504,
      code: "CANVAS_UNAVAILABLE",
    });
    await vi.advanceTimersByTimeAsync(15_000);
    await assertion;
    resolveLookup([{ address: "93.184.216.34", family: 4 }]);
    await Promise.resolve();
    expect(network.request).not.toHaveBeenCalled();
  });
  it("enforces a total deadline even when the response trickles bytes", async () => {
    vi.useFakeTimers();
    const pending = fetchCanvasFeed(feedUrl);
    const assertion = expect(pending).rejects.toMatchObject({ status: 504 });
    await Promise.resolve();
    const response = Object.assign(new PassThrough(), {
      statusCode: 200,
      headers: { "content-type": "text/calendar" },
      complete: false,
    });
    respond(response);
    await vi.advanceTimersByTimeAsync(14_000);
    response.write("BEGIN:VCALENDAR\r\n");
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(outbound.destroy).toHaveBeenCalled();
    response.destroy();
  });
  it("rejects oversized declared and streamed bodies, wrong encoding/type and incomplete bodies", async () => {
    const headerCases: Record<string, string>[] = [
      {
        "content-type": "text/calendar",
        "content-length": String(2 * 1024 * 1024 + 1),
      },
      { "content-type": "text/calendar", "content-encoding": "gzip" },
      { "content-type": "text/html" },
      { "content-type": "text/calendar; charset=iso-8859-1" },
      { "content-type": "text/calendar", "content-length": "100000" },
    ];
    for (const headers of headerCases)
      await expect(reply(calendar(), { headers })).rejects.toMatchObject({
        code: "CANVAS_FEED_INVALID",
      });
    await expect(reply("x".repeat(2 * 1024 * 1024 + 1))).rejects.toMatchObject({
      code: "CANVAS_FEED_INVALID",
    });
    await expect(reply(calendar(), { complete: false })).rejects.toMatchObject({
      code: "CANVAS_FEED_INVALID",
    });
  });
  it("rejects invalid UTF-8 and aborted responses rather than committing a partial calendar", async () => {
    for (const aborted of [false, true]) {
      const pending = fetchCanvasFeed(feedUrl);
      await Promise.resolve();
      const response = Object.assign(new PassThrough(), {
        statusCode: 200,
        headers: { "content-type": "text/calendar" },
        complete: true,
      });
      respond(response);
      if (aborted) response.emit("aborted");
      else response.end(Buffer.from([0xc3, 0x28]));
      await expect(pending).rejects.toMatchObject({
        code: "CANVAS_FEED_INVALID",
      });
      response.destroy();
    }
  });
  it("redacts DNS and TLS failures without propagating raw provider errors", async () => {
    network.lookup.mockRejectedValue(new Error(`DNS failed ${feedUrl}`));
    await expect(fetchCanvasFeed(feedUrl)).rejects.toMatchObject({
      message: "Canvas calendar is unavailable. Try again later.",
    });
    network.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    const pending = fetchCanvasFeed(feedUrl);
    await Promise.resolve();
    outbound.emit("error", new Error(`certificate failed ${feedUrl}`));
    await expect(pending).rejects.toMatchObject({
      message: "Canvas calendar is unavailable. Try again later.",
    });
  });
});
