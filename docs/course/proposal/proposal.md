> Drive snapshot: [Action_Inbox_1.docx](https://drive.google.com/file/d/1sN72IDNLhY7XLTnUkWlBgkWT3hbJw3nt/view), modified 2026-10-13T21:39:44.265Z. Imported November 14, 2026. This is an archived course artifact; its dated claims are not new verification results.

# Action Inbox

A planner connecting tasks to their original sources  
MSCS2101 | Group 1 | Project Proposal

# 1. Product idea

Action Inbox will be a browser-based planner for students and busy professionals whose responsibilities are scattered across email, calendars and coursework. It will bring source-linked information into one workspace, helping users decide what to do, when it is due and whether they have completed it. Reading an email will not mark its action complete. For example, a request to submit registration documents by Friday will become a reviewable suggestion alongside a Canvas assignment and an existing meeting.

# 2. Vision and competitive analysis

Our vision is to help users turn information into tasks while keeping control over their decisions. Gmail and Outlook organize communication within their ecosystems; Google Calendar organizes scheduled events; Canvas organizes coursework; and task managers such as Todoist organize to-do lists. Action Inbox will complement these tools by bringing information from different sources into one place, linking tasks to their original sources and keeping users in control of task approval.

# 3. Proposed scope

- **Core connectors:** Gmail imports with user permission, Google Calendar events and a read-only Sofia Canvas calendar feed. Creating events in an external calendar will require separate user confirmation.
- **Core workflow:** readable source items; optional AI action suggestions with evidence; review, correction and approval; manual or approved tasks with Pending, Completed and Waiting for Reply states.
- **Planner:** an internal calendar/agenda, source filters and a saved 7-day, 30-day or custom 1–365-day display window. Undated work will remain visible; a wider display window will not expand import coverage.
- **Staged connectors:** Outlook mail/calendar through Microsoft Graph, followed by richer Canvas API access, subject to approved registration, scopes and institutional permission.
- **Reminders:** planned one-day, two-day and custom lead times. Notification delivery will be a separate, opt-in milestone requiring channel permission and tests confirming that notifications are delivered successfully.
- **Boundaries:** the Canvas feed will not provide grades, submission status or complete coursework coverage. Automatic email sending, Canvas submissions, bidirectional sync and paid SMS are outside the core.

# 4. Technical approach and AI use

We propose React/Vite and TypeScript for the interface, Fastify/Node.js for the API, PostgreSQL for storage and shared Zod schemas for validation. Provider adapters will preserve stable source identities, source links, the meaning of dates and when the data was last updated. Bounded Gmail imports and atomic Canvas snapshot updates will prevent duplicate source items and retain the last successful data when refresh fails.

Deadlines provided directly by the source will not require AI extraction. Optional structured LLM extraction will suggest actions and explicitly stated deadlines with supporting quotations; uncertain results will require review. Manual planning will remain usable without AI. Credentials will be encrypted server-side, with secure sessions, per-user access checks, only the permissions needed for each integration and disconnect/deletion controls.

We plan to use AI coding assistants for draft code, debugging, test ideas and documentation. Team members will review generated work, record AI use and keep secrets and private content out of prompts. Runtime model access will require separate API configuration and cost approval. GitHub CI will run automated type checks and Vitest tests on pull requests. QA will verify browser/API workflows and document defects and acceptance evidence.

# 5. Main delivery risk and mitigation

The most serious risk is failure to obtain and correctly interpret provider data in time. Microsoft consent and Canvas developer-key approval may be outside the team’s control, and calendar feeds cannot supply submission status. In week 1, we will validate Google scopes, the Sofia feed and Microsoft/Canvas access prerequisites using approved accounts. We will add integrations in stages, using shared rules for identifying source items and handling dates. We will prioritize Gmail, Google Calendar and the limited Canvas calendar feed. Outlook and full Canvas access will remain explicitly unavailable until authorized. Fixtures will support development but will not count as real-provider acceptance. Before accepting each integration, we will test repeated imports, revoked permissions, timezone differences and failed refreshes.

# 6. Delivery and acceptance plan

The proposed six-week sequence is: weeks 1–2 for requirements, access checks, UI flows and the SDP/SPMP; weeks 3–4 for core connectors, review, tasks and the planner; and weeks 5–6 for reliability, privacy, usability and the demonstration. Staged connectors and notification delivery will follow their access and verification gates.

We will test 50 anonymized messages. Our targets are to identify at least 90% of messages that require action and ensure that at least 90% of the explicit deadlines extracted are correct. We will also verify that repeated approvals do not create duplicate tasks or calendar events, users can only access their own data, failed refreshes preserve existing data and external calendar changes require confirmation. All four members will test the complete workflow and participate in the pitch.

# 7. Team responsibilities

| **Member**       | Role                                  | Responsibility                                              |
| ---------------- | ------------------------------------- | ----------------------------------------------------------- |
| **Ziruo Ke**     | Software Engineer / Programmer        | Frontend, backend and connector implementation              |
| **Ke Ding**      | Quality Assurance & Documentation     | Tests, defects, acceptance evidence and documentation       |
| **Jiaqi Zhou**   | Project Manager / UI/UX Designer      | Scope, schedule, requirements, flows and usability          |
| **Tianchu Hang** | Team Lead / Assistant Project Manager | Technical coordination, dependencies and integration review |

Hardware engineering is not applicable to this software-only project.
