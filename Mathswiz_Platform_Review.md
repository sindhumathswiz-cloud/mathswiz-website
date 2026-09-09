# Mathswiz — Platform Review & Roadmap to a Great Class 11/12 Practice Platform

*Reviewed 3 September 2026, from the current state of the `mathswiz-website` codebase.*

## Executive summary

Mathswiz is already far past "prototype" stage. The security hardening (Phase 0), the four-role product surface (admin/teacher/student/parent), the courses/homework/mastery/intervention workflows (Phase 2), and a genuinely ambitious whole-textbook ingestion pipeline (Phase QB) are all built, tested, and documented to a standard most funded ed-tech startups don't reach this early — bcrypt auth, role and ownership checks across all 131 API routes, Redis-backed distributed rate limiting, an audit log, health/readiness endpoints, and a written backup policy with quarterly restore drills. That operational discipline is not something this review needs to push on; it's a genuine asset and should be protected as new features land.

The gap between "solid platform" and "great platform students actually want to practice on" is narrower than it looks, and it comes down to three things: (1) getting enough *verified* Class 11/12 questions into the bank, since the ingestion pipeline that will supply them is still mid-flight; (2) making practice sessions feel genuinely adaptive rather than a fixed quiz; and (3) making sure every answer and hint a student sees is trustworthy, since a wrong step in a math solution is worse than no hint at all. The rest of this document lays out what's already strong, what's missing, and a prioritized order to close the gap.

## What's already strong

**Curriculum coverage.** The taxonomy seed (`prisma/syllabus/cbse.json`) already encodes the full CBSE syllabus for Class 11 (16 chapters — Sets through Probability) and Class 12 (13 chapters — Relations and Functions through Probability), plus JEE Main, NDA, and CUET board taxonomies. This is exactly the right foundation for a Class 11/12 practice platform, and it also means the platform is one flag away from serving competitive-exam prep, not just board exams.

**Question data model.** The `Question` schema is unusually thorough for this stage: 11 question types (single/multiple choice, integer, assertion-reasoning, case study, subjective, etc.), difficulty, a verification-status enum (`UNVERIFIED` → `STRUCTURALLY_VALID` → `ANSWER_MATCHED` → `SOLUTION_MATCHED` → `MATHEMATICALLY_VERIFIED` → `VERIFIED`), full provenance back to source book/chapter/exercise/printed number/page, versioning, and embeddings for RAG-based generation. This is built to support real textbook-scale ingestion, not just hand-entered questions.

**Practice experience.** The practice arena renders LaTeX via KaTeX, tracks streaks, offers an AI "Doubt Buddy" hint panel, and saves sessions into a per-topic mastery model with full event history (`MasteryEvent`). Teachers get a matching mastery dashboard and can assign targeted `Intervention`s (practice/homework/live support/material) when a student's mastery on a topic drops below a threshold — that closes the loop from practice data back to teacher action, which is the part most practice apps skip.

**Engagement layer.** Points, auto-unlocking badges, streak tracking, a leaderboard, and peer challenges are all implemented, not just modeled — a real base for Phase 4 rather than a blank slate.

**Content acquisition pipeline (Phase QB).** The whole-book ingestion system is the most distinctive piece of engineering here. It profiles source PDFs into four routing profiles (digital-math, mixed-layout assessment, image-book, photographed-book), runs a real benchmark comparing Gemini Vision against Mathpix per profile before committing to a paid plan, and gates everything behind explicit approval steps, content-hash duplicate detection, and quality gates (page-inventory counts must match the source PDF; every question needs source-page + printed-number evidence; answer/solution matches require content agreement, not just a number match). That's careful, evidence-driven engineering for a genuinely hard problem — turning real textbooks (Arihant, RD Sharma, Xam Idea, NCERT-adjacent titles) into a verified, tagged question bank.

## What's holding it back from "great"

**The question bank's actual size is the real bottleneck.** `IMPLEMENTATION_TASKS.md` shows Phase QB is mid-pipeline: pilot storage is still local filesystem (not durable object storage), there's no resumable/multipart upload yet, geometry detection for graphs/figures/tables isn't built, the 100-page shadow extraction hasn't been approved or run, and everything downstream of extraction — chapter/exercise reconciliation, answer/solution matching, verification, human review queues, and even the teacher-facing book/chapter/exercise selector — is still unbuilt. Until this pipeline clears those stages, "practicing Class 11/12 math" is capped by whatever's been entered by hand. This is worth naming plainly: no amount of UI polish substitutes for depth of verified questions per chapter.

**"Adaptive" practice isn't adaptive yet.** `AdaptivePracticeArena.tsx` runs through a fixed, pre-fetched list of questions — it doesn't pick the next question based on how the student is doing in the session. There is a `student/practice/next` API route that suggests server-driven next-question selection exists somewhere in the codebase, which is worth confirming and wiring into the actual arena the students use if it isn't already. Separately, the mastery-update formula (`lib/mastery.ts`) is a flat `+5` for correct / `-2` for incorrect regardless of question difficulty — a correct answer on an easy warm-up question moves mastery exactly as much as a correct answer on a hard one. That flattens the signal the platform needs to sequence appropriately challenging questions.

**Two parallel practice UIs.** `/student/practice` (with `PracticeArenaClient.tsx`, ~22KB) and `/student/practice-arena` (a self-contained ~26KB page) both exist as separate implementations of what looks like the same feature. That's real duplication — two things to maintain, two places bugs can diverge, and likely a confusing choice for students about which one to use. Worth consolidating into one.

**No spaced-repetition "fix my mistakes" loop.** There's a `Flashcard` model, but it's scoped to admin-curated `KnowledgeFolder` content, not auto-generated from a student's own wrong answers. `MasteryEvent` already records every incorrect attempt with topic and question — that's the exact data needed to build a personalized, spaced-repetition revision queue ("questions you got wrong, resurfaced at the right interval"), which is one of the highest-leverage features a practice platform can have and isn't built yet.

**AI hint trustworthiness.** The Doubt Buddy hint panel falls back to live AI generation when a question has no `solution_latex` set. For math specifically, a single sign error or misapplied identity in an AI-generated step is worse than showing nothing — a student can't tell a confidently-wrong derivative from a correct one. "Phase 5 — Grounded AI" is explicitly listed as a later phase, which means this risk is currently live in whatever's shipped. Worth prioritizing a narrower fix now: always prefer a verified `Solution` record when one exists, and visibly label anything AI-generated as unverified rather than presenting it with the same confidence as a reviewed solution.

**Accessibility is deferred, not absent.** Phase 5 groups "grounded AI, advanced analytics, accessibility, and scale" together as one future phase. For a platform whose entire value is rendered math notation, screen-reader support for KaTeX output and keyboard-navigable graphs (the `mafs`/`function-plot` components) aren't cosmetic — they're part of whether the platform can serve every Class 11/12 student. Worth pulling forward as a smaller, standalone piece rather than waiting for the full Phase 5.

**No offline/PWA support.** Nothing in `package.json` suggests offline caching. Students revising close to exam day, or on inconsistent connectivity, lose access entirely. Not urgent, but worth a line item once the core loop is solid.

## Recommended priority order

**1. Finish the content pipeline before anything else.** Swap the pilot filesystem storage for durable object storage, get explicit approval for and run the 100-page shadow extraction, then push through chapter/exercise reconciliation → answer/solution matching → verification → human review queue, in the order already laid out in `IMPLEMENTATION_TASKS.md`. Then build the teacher-facing book/chapter/exercise selector so teachers can assemble tests and practice sets straight from ingested textbook content — and expose the same class → subject → chapter → topic browse to students for self-directed practice. This is the single highest-leverage piece of work: everything else in this document is more valuable once there are hundreds of verified questions per Class 11/12 chapter instead of dozens.

**2. Make practice genuinely adaptive.**
- Consolidate `/student/practice` and `/student/practice-arena` into one implementation.
- Confirm whether `practice/next` already drives adaptive selection; if not, wire session-level next-question logic (weighted toward weak topics and appropriate difficulty) instead of serving a static list.
- Make mastery deltas difficulty-aware — reward hard-question correctness more than easy-question correctness, and consider softening the penalty after a long correct streak so one slip doesn't erase a run of good sessions.
- Build the mistake-revision queue from `MasteryEvent` incorrect entries, resurfaced on a spaced-repetition schedule and surfaced prominently on the student dashboard.

**3. Protect correctness and trust.**
- Prefer verified `Solution` records over live AI generation in the hint panel wherever one exists; label AI-generated steps distinctly and route low-confidence AI explanations into the existing `QuestionReviewQueue` instead of shipping them straight to students.
- As the ingestion pipeline scales up the question bank, track per-question observed difficulty (percent correct, average time) from real attempts and periodically reconcile it against the heuristically-assigned `Difficulty` tag.

**4. Widen reach.**
- Pull baseline accessibility forward as its own workstream: KaTeX/MathML alt-text for screen readers, keyboard navigation for graphing components.
- Evaluate lightweight offline caching for previously-loaded practice sets.

**5. Grow from a strong base, once the core loop is excellent.** Phase 3 (parent engagement) and the rest of Phase 4 (deeper community features on top of the existing points/badges/leaderboard/peer-challenge foundation) and Phase 5's advanced analytics are reasonable next phases, but they compound the value of a great practice loop rather than create one — sequence them after items 1–3 above.

## What not to spend more time on right now

The security and operations layer — authentication, RBAC, ownership checks, rate limiting, audit logging, health monitoring, and the backup/recovery runbook with quarterly drills — is already at a standard well above what this stage of product typically has. Unless a specific incident or new attack surface (e.g., the new object-storage integration) demands it, this is a good area to leave alone and let the content and product work above take priority.
