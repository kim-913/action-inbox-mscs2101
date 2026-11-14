> Drive snapshot: [Action_Inbox_1.pptx](https://drive.google.com/file/d/18VFLQpc3jLsCPIZQcaP71PtpQy1JVb_I/view), modified 2026-10-14T03:16:57.407Z. Imported November 14, 2026. This is an archived course artifact; its dated claims are not new verification results.

# Presentation slide transcript

Editable deck: [pitch.pptx](pitch.pptx). Diagrams and layout remain in the PPTX.

## Slide 1

ACTION INBOX / GROUP 1

Jiaqi Zhou · 0:00–0:25 | Tianchu Hang · 0:25–0:50

1 / 3

Action Inbox

A source-linked planner for scattered responsibilities

•

Problem: email, coursework and calendars are scattered.

•

Value: Turn scattered information into actionable tasks, with source links

•

Core: Gmail + Google Calendar + Canvas calendar feed.

•

Next: Outlook / full Canvas API, subject to authorization.

Jiaqi Zhou · PM / UI-UX | Tianchu Hang · Lead / Assistant PM

### Embedded speaker notes

Jiaqi Zhou | 25 seconds
Action Inbox will help students and busy professionals manage responsibilities scattered across messages, coursework and calendars. The goal is one source-linked plan: review evidence, approve an action and track its status. Our difference is this transparent cross-source workflow, not simply another mailbox or task list.

Tianchu Hang | 25 seconds
We will prioritize Gmail, Google Calendar and the read-only Canvas calendar feed. Outlook and richer Canvas API access will be staged around approved authorization. I will coordinate dependencies and integration review. Our proposed sequence is two weeks to define scope and access, two to build the core, and two to verify it.

## Slide 2

ACTION INBOX / GROUP 1

Ziruo Ke · Software Engineer / Programmer · 0:50–1:40

2 / 3

Proposed system architecture

Web client

React / TypeScript  
Review + tasks + planner

Application API

Fastify / Node.js  
Sessions + approval rules

Provider connectors

Gmail · Google Calendar  
Canvas feed · Outlook*

PostgreSQL

Users · source items · tasks  
Encrypted credentials

Optional AI

Structured extraction  
Evidence-backed suggestions

HTTPS

Consented imports

Persist / retrieve

Opt-in

Native source dates bypass AI; users approve external writes.

- Outlook and full Canvas API will require approved access.

### Embedded speaker notes

Ziruo Ke | 50 seconds
This is our proposed architecture. The React client will show sources, review controls, tasks and the planner. It will communicate over HTTPS with a Fastify API that enforces sessions, ownership and approval rules. Provider connectors will import consented Gmail, Calendar and Canvas data; Outlook will depend on authorized access. PostgreSQL will store source items, user decisions and encrypted credentials. Optional AI will return structured suggestions with supporting evidence, while native dates bypass AI. The system will remain useful without extraction. External calendar writes will require explicit confirmation. We will use TypeScript and shared schemas, with human-reviewed AI assistance for development.

## Slide 3

ACTION INBOX / GROUP 1

Ke Ding · Quality Assurance & Documentation · 1:40–2:35

3 / 3

QA, acceptance and delivery risk

Accuracy: Test 50 anonymized messages; identify ≥90% of messages requiring action; ≥90% of extracted explicit deadlines are correct.  
Duplicates: Repeated imports and approvals should not create duplicate tasks or calendar events.  
Privacy and approval: Users can only access their own data; external calendar changes require confirmation.  
Failed updates: Keep previously imported data when an update fails.

MAIN RISK: Access to external services + correct date interpretation

Week 1: Check service access • Add integrations in stages • Test timezones and permissions

•

•

•

•

### Embedded speaker notes

Ke Ding | 55 seconds
I will be responsible for QA and documentation. We will test fifty anonymized messages. Our targets are to identify at least ninety percent of messages that require action, and ensure that at least ninety percent of the explicit deadlines we extract are correct.
We will check that repeated imports and approvals do not create duplicates, users cannot access each other’s data, and external calendar changes require confirmation. We will also test revoked permissions, timezone differences, and failed refreshes.
Our main delivery risk is obtaining provider access and interpreting dates correctly. We will check access in week one and add integrations in stages. I will document defects, test results, and remaining limitations.
