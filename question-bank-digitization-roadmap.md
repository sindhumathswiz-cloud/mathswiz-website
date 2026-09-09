# Question bank digitization: where things stand, and how to take it forward

You asked for a plan to turn your PDF books (plus images and web URLs) into a high-quality question bank with minimal human correction. Before proposing anything new, I went through the codebase to find out what's already built — and the honest answer is: **more than you'd expect, but scattered across four overlapping pipelines that don't talk to each other**, with one real structural weak point sitting right at the "minimum human effort" goal you care about most. Fixing the sprawl and that weak point will get you further, faster, than building something new.

## What actually exists today

| Pipeline | Input | Where it lives | Status |
|---|---|---|---|
| **Bulk-import** | PDF, image, pasted text | `admin/extract-pdf`, `admin/extract-mathpix` → `structure-questions.ts` → `Question` table | **Live.** This is the one real admin UI (`bulk-import/page.tsx`) actually drives. Has chunking, cross-chunk solution reconciliation, dedup by content hash. |
| **Book/BookIngestionRun** | PDF | `book-storage.ts` → `pdf-page-renderer.ts` (Python/pdftoppm) → `book-vision-benchmark.ts` (4 OCR/vision providers) | **Half-built.** Good architecture — page-by-page rendering, multi-provider OCR benchmarking — but nothing connects rendering → extraction → question rows yet. Each step is a manual admin click. This is what we just fixed the storage layer for. |
| **ExtractionSession** (legacy) | PDF | `admin/ingest/sessions/*`, `extract-with-llm`, `match-solutions`, `parse-direct` | **Dead.** Fully built — its own JSON repair, its own solution-matcher, its own rule-based parser — but no admin page calls it. Orphaned. |
| **Spider** (web) | URL | `admin/ingest/spider` | **Built, unwired.** Crawls a page for question-like links, extracts via LLM, writes `Question` rows directly. No UI button exists to trigger it. |
| **Single-image, ad hoc** | Image | `extract-vision`, `extract-question` | **Duplicated.** Each has its own prompt and its own structuring logic instead of sharing `structure-questions.ts`. `extract-question` doesn't even use OCR — it sends the raw image straight to a vision LLM in one shot. |

Four pipelines, one live. That's not a criticism of the work — each piece is individually reasonable — it's just what happens when a feature gets rebuilt a few times without retiring the previous attempt. The first real decision is whether to keep patching bulk-import (works today, weakest architecture) or finish the Book pipeline (best architecture, most work left) and retire the rest.

## The actual weak point for "minimum human effort"

You said the priority is good extraction with minimal correction, especially for **matching questions to their answers and solutions**. I looked specifically at how that matching works today, and it's the shakiest part of the whole system:

`lib/solution-matcher.ts` matches a question to its solution by **question number plus page proximity only** — no content comparison at all. Question 1 on page 5 gets matched to "solution 1" found within 3 pages. This works fine for a single, cleanly-numbered exercise. It silently mismatches the moment:
- A new exercise restarts numbering at 1 (this is true of nearly every Indian math textbook — every exercise, every chapter, restarts at Q1)
- OCR misreads the leading digit
- A solutions section sits more than 3 pages after its questions (common in chapters with many worked examples)

There's no fallback to content similarity and no chapter/exercise-boundary awareness, so a wrong match doesn't just fail — it silently produces a *confident-looking, wrong* answer key entry. That's the opposite of what you want: it's precisely the failure mode that creates hidden correction work later, because nothing flags it as wrong.

Two more things compound this:
- There are **two parallel places a solution can be stored** — `Question.explanation` (used by nearly every pipeline) and a separate `Solution` model with its own `confidence`/`isVerified` fields (used by exactly one route, `admin/solutions/match`, which itself has no UI caller I could find). Split state, one path actually wired up.
- The schema already has a **7-stage verification pipeline** designed for this (`UNVERIFIED → STRUCTURALLY_VALID → ANSWER_MATCHED → SOLUTION_MATCHED → MATHEMATICALLY_VERIFIED → NEEDS_REVIEW → VERIFIED`) — but nothing in any current route ever advances a question past `UNVERIFIED`. The workflow was designed; it was never wired to anything.

One genuinely good idea is already sitting unused in the codebase: `lib/book-semantic-assembler.ts` is fully built and unit-tested, and it's the only module in the whole system that has a concept of **multi-provider disagreement** — when two OCR/vision providers extract the same page differently, it flags that specific item `HOLD_FOR_RECONCILIATION` instead of guessing. Nothing calls it today. That "two providers agree → auto-accept, disagree → the only thing a human needs to look at" pattern is exactly the mechanism that gets you low correction effort at high volume, and you already paid for it once.

## The plan

**Phase 0 — Consolidate before adding anything new.** Pick the Book pipeline as the long-term home (best architecture, and it's what the storage fix I just shipped was for) and retire the legacy ExtractionSession tree and the duplicate single-image endpoints, folding bulk-import's working dedup/QA logic into it rather than running both forever. This is unglamorous but it's what makes every later phase cheaper — right now a bug fix to "how solutions get matched" would need to be made in three different files to actually take effect everywhere.

**Phase 1 — Wire the Book pipeline end to end.** Render → OCR/vision extract → structure → QA → dedup → save as `DRAFT`, as one automated flow instead of five manual admin clicks per book. This reuses `structure-questions.ts` and `extract-normalizer.ts`, which are already solid (explicit anti-hallucination instructions, fragment filtering, fixed the MCQ-default bug that broke subjective questions).

**Phase 2 — Fix solution-matching, this is the highest-leverage change.** Two concrete improvements, in order of value:
1. Scope matching to a chapter/exercise boundary (via `chapter-classifier.ts`, already built) so Exercise 5.1's Q1 can never match Exercise 5.2's Q1's solution — this alone kills the most common silent-failure mode.
2. Revive `book-semantic-assembler.ts`'s two-provider-agreement pattern from Phase 0's benchmark work: run two OCR/vision providers on ambiguous pages, auto-accept where they agree, route disagreements to a human review queue. This turns "human reviews everything" into "human reviews the ~10-20% where providers actually disagree" — which is the real lever on your stated goal.

**Phase 3 — Confidence-based review triage.** The schema already has `confidence`, `extractionConfidence`, and the 7-stage `verificationStatus` enum — none populated today. Wire `question-qa.ts`'s existing deterministic checks (it's already good: real KaTeX rendering to catch LaTeX errors, OCR-garble detection, placeholder-explanation detection like "left as an exercise") plus the provider-agreement signal from Phase 2 into these fields, then build a review queue UI sorted by risk: clean + high-confidence auto-advances toward `APPROVED`, anything flagged goes to a human queue. This is the UI-level payoff of Phases 1–2 — without it, all that signal has nowhere to surface.

**Phase 4 — Wire up web-URL scraping.** `admin/ingest/spider` already does the right thing architecturally (crawl → LLM extract → write to `Question`) but bypasses the canonical `structure-questions.ts`/QA path and has no UI button. Route it through the same pipeline as Phase 1 so URL-sourced questions get the same QA/dedup treatment as PDF-sourced ones, then add the UI trigger.

**Phase 5 — Standalone images.** `admin/extract-mathpix` already does this correctly (shares `structure-questions.ts`). Just needs to become the *only* image path — retire `extract-vision` and `extract-question`, whose independent prompts and skip-the-OCR-step shortcuts are extra surface area for inconsistent results with no upside.

**Phase 6 — Run the actual digitization.** Once 0–3 are solid, digitizing your backlog of books becomes an operational task rather than an engineering one: upload, let the pipeline run, review the flagged fraction, approve. This is also the point where the shadow-extraction comparison we held off on earlier (Gemini vs. Mathpix vs. Mistral vs. GPT-4o, under $10 in API cost for 100 pages) actually pays for itself — you'll be running this pipeline against dozens of real books, so knowing which provider(s) to standardize on, informed by real accuracy data instead of a guess, is worth doing before Phase 6 rather than after.

## Where I'd start

Phases 0–2 are the ones that directly serve "good extraction, minimal correction effort" — they're also the ones most worth doing before you pour a lot of real books through the pipeline, since fixing solution-matching after you've already digitized 20 books means re-running all 20. Phase 4 (web) and Phase 5 (images) are smaller, mostly mechanical once 0–1 exist, and can slot in whenever it's convenient.

I'd suggest we start with **Phase 0 (consolidation)** so we're not building Phase 2's fix into three places, but if you'd rather see the automated Book pipeline (Phase 1) working end-to-end first as a concrete win before touching the older code, that's a reasonable order too.
