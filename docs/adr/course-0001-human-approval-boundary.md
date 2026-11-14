# ADR-0001: Separate AI suggestions from task and Calendar writes

> Source: [course ADR-0001](https://drive.google.com/file/d/17TYxmgKn98ewfEvBVhZF5vlZ3nLMEVBb/view), October 21, 2026; synchronized November 14. Course numbering and SRS v1 references are preserved and are separate from the implementation ADR series in this directory. Current requirements are in [SRS v2.0](../requirements/srs-v2.0.md).

- **Status:** Accepted
- **Date:** 2026-10-21
- **Deciders:** Ziruo Ke, Ke Ding, Jiaqi Zhou, Tianchu Hang
- **Review:** Reviewed by all team members.
- **Related requirements:** FR-05, FR-06, FR-11, FR-12, NFR-05, DR-01, DR-02 in Action Inbox SRS V1.0

## Context

Action Inbox combines source-linked information from Gmail, Google Calendar and a read-only Sofia Canvas feed. Its four-person team is working within a ten-week course plan, initially for four approved classroom test users. AI can misinterpret an action or date, and imported text can contain malicious instructions. NFR-05 requires zero unapproved tasks, provider writes or notifications under injection tests. FR-05 requires source-supported suggestions, FR-06 requires explicit approval before task creation, and FR-11 requires a separate confirmation before a Calendar write.

The design must preserve human authorization across the extractor, task domain and Calendar adapter. A model's confidence score cannot grant permission. The AI-enabled accuracy gate remains required for the planned AI demonstration even though users can use manual planning while AI is disabled.

## Decision

We will keep extraction, proposal review, task persistence and Calendar writes behind separate application responsibilities. The extractor will return structured suggestions and source quotations without tools or write authority. The API will validate output and evidence before displaying proposals. The task domain will create at most one internal task only after its owner explicitly approves a proposal, using version checks and stable identity to handle retries. A separate confirmed Calendar intent will authorize the Calendar adapter to create or reconcile an external event. Manual task creation will remain available without AI.

## Alternatives considered

- **Direct automatic task or Calendar creation from model output** — Rejected. It removes a review step but lets interpretation errors or malicious source instructions cause effects without the explicit authorization required by FR-06, FR-11 and NFR-05.
- **Manual-only planning with no extraction path** — Rejected. It reduces extraction and validation complexity but gives users all interpretation work and removes the planned assisted workflow and AI demonstration. Manual entry remains a supported fallback.

## Consequences

- **Positive:** User decisions remain traceable to their sources; extraction errors can be corrected before task creation; the model cannot directly issue provider writes; ownership and side-effect boundaries can be tested independently.
- **Negative:** Users must review suggestions and confirm external writes. The application must maintain proposal states, evidence, concurrency checks and duplicate-prevention logic. These add implementation and testing work within the course schedule.
- **Neutral / follow-ups:** Link ADR-0001 from the SDD and requirement-design-test matrix. Verify TC-05, TC-06, TC-11, TC-12 and TN-05. Revisit the boundary only if approved requirements change; any reversal requires a new ADR that supersedes this one. Notification delivery AC-09 remains a separate unresolved decision, and this ADR does not resolve it.

## AI assistance & provenance

OpenAI Codex assisted in drafting this ADR, its slide summary, and the UML sequence diagram on 2026-10-21. Inputs included the Module 4 ADR template, project proposal, presentation, SRS V1.0 dated 2026-10-15, and Week 3 stand-up dated 2026-10-16. This record makes explicit a human-approval boundary already described in the SRS.

AI was used to create the initial presentation draft. The team then rewrote and restyled the presentation to improve clarity and visual consistency. Each team member contributed their own section using the shared style.

The ADR draft was checked against FR-05 (validated suggestions), FR-06 (approval), FR-11 (separate Calendar confirmation), FR-12 (duplicates), NFR-05 (injection), and DR-01/02 (evidence and state). This was a document-level consistency review; no runtime tests were performed as part of drafting. All team members reviewed this ADR and accepted the decision. The team will defend the decision during the PDR.
