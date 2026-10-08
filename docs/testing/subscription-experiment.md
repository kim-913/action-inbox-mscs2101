# Manual ChatGPT subscription experiment

- Date: 2026-10-07.
- Status: **tested — one synthetic email, one submitted message, one observed response**.
- Surface: official `https://chatgpt.com/`, existing signed-in Arc session. No login, account selection, credentials, upgrade, or purchase was required.
- Selected model control visibly displayed **Medium**. The underlying model name and subscription billing tier were not visible or independently verified; neither is inferred.
- Method: ordinary website composer and Send button, operated through Arc's documented AppleScript DOM UI capability. Send was clicked once. No retries or regeneration.
- Initial browser-tool discovery attached to a different existing ChatGPT conversation; no message was submitted there. Execution used a newly created, explicitly identified Arc tab instead, without navigating the app preview.
- Scope: a manual one-case web experiment only. This is **not app API integration**, backend extraction verification, or 50-case accuracy evidence. No API was enabled or called directly, no API credits were used by this experiment, and no billing action was taken. A ChatGPT web subscription does not establish backend API access.
- Data and side effects: synthetic email only; no mail retrieval, app task creation, calendar event creation, credential/session extraction, hidden API access, network replay, or dependency/source-code changes.

## Exact submitted prompt

```text
This is one synthetic-email extraction experiment. Analyze only the email below. Do not access mail, use connected apps, perform the task, create reminders, or create calendar events. Return one JSON object with category, action, title, dueAt (ISO 8601 with UTC offset), confidence (0–1), actionEvidence (exact quote), deadlineEvidence (exact quote), and uncertainty. Distinguish an actionable deadline from informational dates; explain any excluded date in uncertainty. Use America/Los_Angeles for date interpretation.

Received: 2026-10-07, America/Los_Angeles
Subject: Registration documents
Please upload the signed registration form by October 16, 2026 at 5:00 PM America/Los_Angeles. The orientation session on October 20 is for information only. Do not add it to your calendar.
```

## Exact observed assistant response

The completed response was captured from the visible conversation text; the Stop control was no longer present.

```json
{
  "category": "registration",
  "action": "upload_document",
  "title": "Upload signed registration form",
  "dueAt": "2026-10-16T17:00:00-07:00",
  "confidence": 1.0,
  "actionEvidence": "Please upload the signed registration form by October 16, 2026 at 5:00 PM America/Los_Angeles.",
  "deadlineEvidence": "by October 16, 2026 at 5:00 PM America/Los_Angeles",
  "uncertainty": "The October 16 deadline is explicit and actionable. October 20 is excluded because the email states that the orientation session is for information only and explicitly instructs: 'Do not add it to your calendar.' The received date, October 7, 2026, is also excluded because it is metadata rather than an actionable deadline. No meaningful uncertainty remains regarding the action or deadline."
}
```

## Bounded observation

The response identified the upload action, retained exact action/deadline evidence, represented the explicit Los Angeles deadline as `2026-10-16T17:00:00-07:00`, and excluded the informational October 20 orientation. Its `confidence: 1.0` is the model's reported score, not measured accuracy or calibrated confidence. No repeated experiment or check suite was run. This demonstrates that the signed-in ChatGPT web session could answer this one synthetic extraction prompt; it does not demonstrate automated extraction in Action Inbox.

The returned `category: "registration"` is not an Action Inbox category enum value. This prompt/result was not submitted to or validated against the application's extraction schema. Correct action/deadline evidence in this one response must not be described as a successful application-contract or API-integration test.
