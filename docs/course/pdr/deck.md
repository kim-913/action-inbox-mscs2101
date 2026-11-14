> Drive snapshot: [Action_Inbox_1_deck.pptx](https://drive.google.com/file/d/1KhfQ77yAsceXp7aSIk1SBdJnaZ_OVwYT/view), modified 2026-10-22T19:55:01.913Z. Imported November 14, 2026. This is an archived course artifact; its dated claims are not new verification results.

# Presentation slide transcript

Editable deck: [deck.pptx](deck.pptx). Diagrams and layout remain in the PPTX.

## Slide 1

ACTION INBOX / GROUP 1 / PDR

Speaker: Jiaqi Zhou · Action Inbox / Group 1

01 / 08

Stay ahead of  
what’s due.

Action Inbox

Your deadline assistant.

Scattered updates,  
one clear plan.

Gmail

Canvas

Calendar

COMING UP

Send the draft

Gmail

FRI

Project outline

Canvas

FRI

Team meeting

Calendar

2 PM

Product illustration · synthetic items · not a notification demo

Jiaqi Zhou

Project Manager / UI/UX Designer

Tianchu Hang

Team Lead / Assistant PM

Ziruo Ke

Software Engineer / Programmer

Ke Ding

QA & Documentation

### Embedded speaker notes

Jiaqi Zhou | Suggested rehearsal timing: 0:00–0:40

TALK TRACK
You’ve got an assignment on Canvas, a request in your email, and a meeting on your calendar. Just figuring out what needs your attention means checking all three.

That’s where Action Inbox comes in. We want it to feel like a deadline assistant: bring those updates together, help you see what’s coming up, and make it easier to plan your week.

I’m Jiaqi, and I’m presenting with Tianchu, Ziruo, and Ke. Here’s what that could look like.

PRESENTER NOTES
Opening: point to the three source icons, then the Coming Up card. Take a short pause before introducing Action Inbox.
The items on the cover are made-up examples. The first release is intended for four approved student testers.
If asked about reminders: the current app saves reminder settings. Choosing a delivery method and verifying that users receive reminders are still open work.

Sources: https://docs.google.com/document/d/14bSEcHd2H2ffNOsDedHtasnEzmkXR9uVVf7G5vzhd20/edit §§1.2, 2.2–2.3; FR-08/13/16

## Slide 2

ACTION INBOX / GROUP 1 / PDR

One view. Different kinds of work.

Deadlines, meetings and undated tasks keep their meaning.

Speaker: Jiaqi Zhou · Action Inbox / Group 1

02 / 08

Planner

DISPLAY WINDOW · 30 DAYS

All

Gmail

Canvas

Google Calendar

Manual tasks

UPCOMING / FRIDAY, OCT 23

Project outline

CANVAS

Date only

Team meeting

CALENDAR

2:00–2:30 pm

Review outline

MANUAL TASK

Pending

UNDATED WORK Draft questions for the team

Project outline

Source: Sofia Canvas feed  
Date: Oct 23 · no exact time supplied  
Submission status: not available

Layout illustration · synthetic entries · existing SRS concepts, not a live screenshot

### Embedded speaker notes

Jiaqi Zhou | Suggested rehearsal timing: 0:40–1:20

TALK TRACK
Here’s an example of a Friday. You can see the project outline, the team meeting, and a task to review the outline.

The assignment has a due date. The meeting has a start and end time. You might also have something to do that hasn’t got a date yet, so there’s a separate space for that below.

If you want to check where an item came from, you can select it and open its details. You can also filter the view to focus on one source.

Tianchu will explain how this fits with the tools we already use.

PRESENTER NOTES
Point to the assignment, meeting, and Undated Work section as you mention them. Then point to the source filters and detail panel.
This slide is a layout illustration. The existing implementation may look different.
Canvas feed dates can be date-only. The feed does not provide reliable assignment submission or completion status.
Display filters change what is shown. They do not expand the Gmail import window.

Sources: https://docs.google.com/document/d/14bSEcHd2H2ffNOsDedHtasnEzmkXR9uVVf7G5vzhd20/edit FR-03/07/08/09/10; DR-02

## Slide 3

ACTION INBOX / GROUP 1 / PDR

Keep your tools. Stop rebuilding the plan.

Positioning against three familiar ways of organizing work

Speaker: Tianchu Hang · Action Inbox / Group 1

03 / 08

STARTING POINT

WHAT IT CENTERS ON

WHAT YOU STILL ASSEMBLE

Email-first

Conversations

A view of upcoming work

Calendar-first

Scheduled time

Work that has no time slot

Task-list-first

Entered or connected tasks

Context from the original source

Action Inbox

Combine consented sources without losing their context or date meaning.

Workflow-level comparison; capabilities vary by product and configuration.

### Embedded speaker notes

Tianchu Hang | Suggested rehearsal timing: 1:20–1:50

TALK TRACK
Most of us already use some combination of email, a calendar, and a task list. Each one helps with part of the week.

The extra work is connecting them: finding a request in an email, checking the date, and putting it into your plan.

That’s the part we’re trying to make easier. You keep using your existing tools, and Action Inbox gives you a place to bring the information together.

Ziruo will walk through how we’re building it.

PRESENTER NOTES
Keep this comparison brief. The next slide covers the implementation.
This is a comparison of common workflows. Product features vary, and many existing tools already offer integrations.
If asked what makes the project useful: focus on the connection between an item, its original source, and the user’s plan. Avoid claiming that other products cannot do this.

Sources: https://docs.google.com/document/d/14bSEcHd2H2ffNOsDedHtasnEzmkXR9uVVf7G5vzhd20/edit §§1.2, 2.1–2.3; FR-08; DR-01/02

## Slide 4

ACTION INBOX / GROUP 1 / PDR

One application. Clear boundaries.

Architecture sketch · server-owned integrations and optional extraction

Speaker: Ziruo Ke · Action Inbox / Group 1

04 / 08

WEB CLIENT

React / TypeScript  
Review · tasks · planner

FASTIFY / NODE.JS API

Sessions + validated contracts

Proposal review + task domain

Import jobs + provider adapters

EXTERNAL SOURCES

Gmail · read  
Canvas feed · read only  
Google Calendar · read / confirm write

PostgreSQL · records, jobs, encrypted secrets

OPTIONAL EXTRACTOR

Schema-validated output  
Source quotations retained

HTTPS

Provider  
requests

FUTURE · Outlook / full Canvas API

Persist / retrieve

Development tools  
Vite · Zod · Vitest  
GitHub CI

AI assists drafts and code;  
team review remains required.

Dashed connections: optional / future dependencies.

### Embedded speaker notes

Ziruo Ke | Suggested rehearsal timing: 1:50–2:40

TALK TRACK
Let’s start on the left. The web app is built with React and TypeScript. That’s where you read items and manage your plan.

In the middle, the Fastify API handles sign-in, imports, and task updates. It connects to the external services on the right, and saves our records in PostgreSQL below.

The AI component helps pull possible actions and dates from messages. We check its output against the source before showing a suggestion.

We’re using Vite, Zod, Vitest, and GitHub CI for development and testing. AI also helps us draft code and tests, which we review.

Now let’s follow a refresh through the app.

PRESENTER NOTES
Trace left → middle → right, then point down to PostgreSQL. Introduce the optional extractor last.
Paid AI extraction is currently disabled. The diagram shows where the enabled path fits in the design. Live accuracy evaluation remains pending.
Gmail and the Sofia Canvas feed provide read access. Google Calendar also supports a separately confirmed event-creation path. Outlook and fuller Canvas OAuth are future connectors with access requirements.
Provider credentials stay on the server and are encrypted at rest. The extractor has no tools or authority to create tasks, events, or notifications.
If asked why one application: it keeps deployment and coordination manageable for a four-person team. The internal responsibilities still have clear boundaries.

Sources: https://docs.google.com/document/d/14bSEcHd2H2ffNOsDedHtasnEzmkXR9uVVf7G5vzhd20/edit §§2.1, 2.6; FR-01/03/05/11; IR-01/02; NFR-04/08; DR-01

## Slide 5

ACTION INBOX / GROUP 1 / PDR

From scattered sources to one planner.

UML sequence diagram · shared import-and-inspect journey

Speaker: Ziruo Ke · Action Inbox / Group 1

05 / 08

Keep source identity + original date meaning

Failed refresh → retain last successful data

Supported: Gmail · Canvas feed · Google Calendar. Outlook is planned. High-level successful-refresh sequence.

### Embedded speaker notes

Ziruo Ke | Suggested rehearsal timing: 2:40–3:25

TALK TRACK
Start with the refresh button. The app reads the available items from a connected service and brings them into the planner. Pick an item, and you can open its details and source.

There are two design choices behind that simple flow. We keep each item’s source identity and date meaning, so a Canvas due date stays a due date and a meeting keeps its time slot. If a refresh fails, the last successful data stays available.

That gives us a view of what’s coming up. Next, let’s look at where suggestions and tasks fit in.

PRESENTER NOTES
Follow the six arrows briefly, then point to the two design choices below the diagram.
Connected source covers Gmail, the Canvas feed, and Google Calendar after connection setup. Outlook remains planned. The diagram abstracts the successful read-and-inspect interaction; adapters have different limits and some imports run through background jobs.
Source identity supports traceability and matching the same item on refresh. Preserve date-only, exact-time and uncertain dates; Gmail receipt time is not a deadline.
Failure behavior is the design note below the success sequence: retain applicable last-success data, show freshness and an actionable error, and offer retry. No failure branch is drawn.
Gmail source content remains readable with AI disabled. Canvas dates and existing Calendar events display directly. The planner view is bounded by imports, source coverage, filters and the display window.

Sources: https://docs.google.com/document/d/14bSEcHd2H2ffNOsDedHtasnEzmkXR9uVVf7G5vzhd20/edit FR-02/03/04/08/10/11/15; DR-01/02; Mermaid source: sources-to-planner.mmd

## Slide 6

ACTION INBOX / GROUP 1 / PDR

See what’s due. Choose what to do.

Design decision · Keep imported items, suggestions and tasks separate.

Speaker: Ziruo Ke · Action Inbox / Group 1

06 / 08

DIRECT FROM SOURCE

OPTIONAL AI REVIEW

Imported deadline

CANVAS · ASSIGNMENT

Project report

Due Fri, Oct 23 · date only

Visible after import

Suggested action

EMAIL · SOURCE QUOTE

“Send slides by Friday.”

Check the action and date.

Review · edit · dismiss

Your task

ACTION INBOX · TASK

Send slides

Due date checked by you

Pending → Completed

Approve

Create  
task

Source and date meaning stay attached.

Add to Calendar? Confirm separately.

Trade-off: one review step to catch a wrong action or date before saving the task.

Illustrative items · ADR-0001 accepted Oct 21, 2026 · FR-05/06/07/08/11/12 · DR-01/02

### Embedded speaker notes

Ziruo Ke | Suggested rehearsal timing: 3:25–4:10

TALK TRACK
A Canvas assignment already has a due date, so it can appear directly in the planner.

Now take an email saying, ‘Send slides by Friday.’ With AI enabled, the app can suggest an action and a date. You check the message, edit the details if needed, and approve it.

That saves a task inside Action Inbox. You can track its progress and mark it complete. Adding it to Google Calendar takes a separate confirmation.

We keep the source attached, so you can check where the date came from. The review step helps catch mistakes before saving. Ke will explain how we test these decisions.

PRESENTER NOTES
Point to the standalone Canvas card first. Then follow only the email suggestion → approval → task arrow. These are two examples, not a three-step conversion of every imported item.
Showing an imported item or proposal creates no task. Canvas assignments and existing Calendar events remain source records. Manual task creation is a separate supported path.
Paid AI extraction is currently disabled. The email cards illustrate the enabled design; uncertain dates stay review-required. Task completion changes app-owned status, not Canvas submission status.
ADR-0001: accepted Oct 21, 2026 by Ziruo Ke, Ke Ding, Jiaqi Zhou and Tianchu Hang. Automatic creation risks acting on wrong dates or malicious text; manual-only planning gives users all interpretation work. Chosen: validated proposals plus owner approval. Cost: review clicks and extra application states.
Implementation Q&A: verify source quotations; give the extractor no tools or write authority; use version checks and atomic, duplicate-safe approval. Calendar creation requires its own confirmed intent.
Traceability: FR-05/06/07/08/11/12, NFR-05, DR-01/02. TC-06 checks approval/rejection and stale versions; TC-11 checks separate Calendar consent; TC-12 checks retries.

Sources: https://drive.google.com/file/d/17TYxmgKn98ewfEvBVhZF5vlZ3nLMEVBb/view; https://docs.google.com/document/d/14bSEcHd2H2ffNOsDedHtasnEzmkXR9uVVf7G5vzhd20/edit FR-05/06/07/08/11/12; NFR-05; DR-01/02; Course ADR template: https://sofia.instructure.com/courses/21000/modules/items/986188

## Slide 7

ACTION INBOX / GROUP 1 / PDR

What counts as a pass?

SRS acceptance targets—not achieved results

Speaker: Ke Ding · Action Inbox / Group 1

07 / 08

≥90%

Action-required recall

50-message evaluation set

≥90%

Explicit-deadline precision

Unsupported exact dates count as errors

≤2.0s

Dashboard interaction

100 messages; after API data arrives

Four-user usability check

Each approved user completes consent, source inspection, task updates and window selection without developer help.

NEGATIVE CHECKS MATTER TOO

Another user’s data → access denied  
Failed refresh → previous data retained  
Repeated approval → no duplicate task

### Embedded speaker notes

Ke Ding | Suggested rehearsal timing: 4:10–5:05

TALK TRACK
We’ll test against 50 synthetic messages with predefined expected answers. We want the app to find at least nine out of ten messages that need an action. When it gives an exact deadline, we want at least nine out of ten of those deadlines to be correct.

For speed, with 100 synced messages, the dashboard must display its controls and let users open a message within two seconds after all required API data arrives.

We’ll also ask all four testers to try the main tasks on their own. Then we’ll check a few things that can go wrong: a failed refresh, an attempt to open someone else’s data, or clicking approve twice.

Tianchu will finish with our delivery plan.

PRESENTER NOTES
The figures are SRS targets. Accuracy, formal performance, and four-user acceptance evidence are still pending.
Accuracy: use the versioned 50-message synthetic/anonymized set. Recall is TP/(TP+FN). Deadline precision includes unsupported exact predictions as errors. An empty prediction set cannot pass.
Performance: use 100 synchronized messages and a populated dashboard. Start timing after all required API data arrives. Record ten warm and ten fresh-page runs; every run must be within two seconds.
Expected failure behavior: deny foreign-user access; retain prior data after a failed refresh; avoid duplicate tasks on repeated approval.
User testing covers consent, source inspection, manual-task creation and status changes, and display-window selection.

Sources: https://docs.google.com/document/d/14bSEcHd2H2ffNOsDedHtasnEzmkXR9uVVf7G5vzhd20

## Slide 8

ACTION INBOX / GROUP 1 / PDR

The remaining work has two dependencies.

Ten-week delivery plan · builds on the existing prototype

Speaker: Tianchu Hang · Action Inbox / Group 1

08 / 08

WEEK 5 · PROVIDER ACCESS

Check the four approved accounts early.  
Keep Outlook / full Canvas gated until approved.

WEEK 7 · REMINDERS (PLANNED)

AC-09: verify delivery or explicitly approve  
a replacement criterion.

W1–4

Scope → SRS → PDR

Historical baseline + review

W5–6

Users + AI accuracy

Approved access; date safety

W7–8

Tasks + release checks

Reminder decision; security / speed

W9–10

Evidence → handoff

Release candidate; rehearse; freeze

PDR feedback now → scope and design revisions before CDR.

### Embedded speaker notes

Tianchu Hang | Suggested rehearsal timing: 5:05–5:50

TALK TRACK
We’ve already got a prototype, so the next few weeks are about trying it with the team and working through the remaining checks.

Two things need attention early. First, we need to check that all four approved accounts can connect to the services. Second, we still need to choose how reminders will be delivered and test that end to end.

After that, we’ll collect the test results, fix the issues we find, and get ready for the final presentation.

For today, we’d especially like feedback on the scope and the review step. Would this help you manage your week, and where would you want more control?

PRESENTER NOTES
Pause after the two questions and invite discussion.
Schedule: W1–4 covers the historical baseline, SRS, and PDR; W5–6 focuses on users and AI accuracy; W7–8 covers tasks, the reminder decision, Calendar, security, and performance; W9–10 covers release evidence and handoff.
AC-09 remains unresolved. The team needs an approved delivery mechanism or an explicitly approved replacement criterion, followed by observed verification. Reminder metadata alone is insufficient.
Outlook and fuller Canvas API access depend on permissions. Core acceptance should stay focused on the supported sources.
Course logistics: eight slides fit both ranges listed in Canvas. The suggested 5:50 timing is for rehearsal; no time limit appeared on the assignment page. All four members participate. Submission requires PDF and PPTX by October 24 at 9 am Pacific.
AI disclosure: OpenAI GPT-6 Astra via omp helped revise the wording and notes. The team should rehearse and adjust the wording before presenting.

Sources: https://docs.google.com/document/d/14bSEcHd2H2ffNOsDedHtasnEzmkXR9uVVf7G5vzhd20/edit §§2.4, 2.6, 4.3; https://sofia.instructure.com/courses/21000/assignments/371870
