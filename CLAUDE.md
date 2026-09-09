# Mathswiz — project context for Claude Code

This is the Mathswiz web app (Next.js, `frontend/`, Prisma/Postgres). This file didn't
exist before 2026-09-08 — it was added to hand off an in-progress piece of work
(book-ingestion / question-bank pipeline) from a Cowork session that had browser/API
access to a running dev server but no git or terminal access.

## Start here for the question-bank / book-ingestion pipeline

Read, in this order:
1. **`PHASE_QB_INGESTION_HANDOFF_2026-09-08.md`** — what a recent session just fixed
   (two real bugs, one in answer-key matching, one in extraction reliability), what data
   it remediated, one known unresolved gap, and a feature the user proposed
   (pre-extraction chapter manifest) that's the natural next phase. **Start here** — it
   has a "first thing to do: check git status" note, since that session's code changes
   were written to disk directly and have not been committed.
2. `question-bank-digitization-roadmap.md` — the overall phased plan (Phase 0–6) this
   work sits inside.
3. `content-pipeline-decisions.md` — storage/provider decisions for the pipeline.
4. `PHASE_QB_PILOT.md` — the pilot book corpus (including the exact book worked on in
   the handoff doc above) and the quality gates the pipeline is meant to satisfy.
5. `IMPLEMENTATION_TASKS.md` — broader task tracking, if still current.

## Standing constraints on this pipeline (carried over from the handed-off session)

- **Never hard-delete question data.** Archive (`status: 'ARCHIVED'` + a `reviewNotes`
  explanation) instead, via `PATCH /api/questions/[id]`.
- **Never fabricate answers or explanations.** If a provider/model produces an answer
  that wasn't actually transcribed from printed source text, it must be stripped, not
  trusted — see the "fabrication guard" section of the handoff doc for the real incident
  that motivated this and how it's enforced in code today.
- Don't trust `BookChapter` row order as page order — it's populated in encounter order
  during extraction, not true page order. Verify chapter boundaries from actual page
  headers when it matters.
