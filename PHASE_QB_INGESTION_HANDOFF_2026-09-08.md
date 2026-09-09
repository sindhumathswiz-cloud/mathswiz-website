# Book-ingestion QA session handoff (2026-09-08) — for Claude Code

This documents a Cowork session that ran the Book-ingestion pipeline against a live dev
server (`localhost:3000`, driven via browser automation + `fetch` calls — no direct
filesystem/git access from that session), found and fixed two real pipeline bugs, and
remediated bad data those bugs had already produced. It also captures a feature proposal
the user made partway through that's a natural next phase. Everything below is the
context needed to continue this work with full git/terminal access.

**Read `question-bank-digitization-roadmap.md`, `content-pipeline-decisions.md`, and
`PHASE_QB_PILOT.md` first if you haven't** — this session's work sits inside that
existing plan (mostly Phase 1/Phase 2 territory: wiring the Book pipeline, fixing
solution/answer matching). `PHASE_QB_PILOT.md`'s quality gate #5 ("A solution match
requires printed-number evidence plus content agreement; number alone is insufficient")
and the image-book profile's "build an explicit printed-number inventory before creating
any Question records" are exactly the requirements this session's bug fixes and the new
feature proposal serve.

## ⚠️ First thing to do: check git status

**Every code change below was written directly to disk via a file-sync tool, not via git.**
Nothing has been committed. Run `git status` / `git diff` in `frontend/` and review before
doing anything else — treat the descriptions below as "what changed and why," not as a
promise the working tree is clean or that these are the only uncommitted changes.

## Context: what was being worked on

Book: **Xam Idea Mathematics Class 12** (2023 edition) — the same book listed in
`PHASE_QB_PILOT.md`'s corpus (534 pages, "Page rendering + mathematical/diagram OCR"
profile).
- `bookId`: `cmtmzvx8t000hm8nys08n8gqz`
- ingestion `runId`: `cmtpy0brp0001s4nyf36f47k9`

Approach: process the book's 13 real NCERT chapters one at a time (chapter boundaries
were verified by scanning actual page headers — **do not trust the `BookChapter` table's
row order**, it was populated in encounter-order during earlier extraction runs and is
not in true page order), in ascending order of how many questions each chapter currently
had extracted:

Three Dimensional Geometry (0) → Linear Programming (0) → Probability (0) → Vector
Algebra (6) → Continuity and Differentiability (15) → Integrals (17) → Application of
Derivatives (23) → Application of Integrals (64) → Determinants (102) → Inverse
Trigonometric Functions (117) → Matrices (124) → Relations and Functions (142)

The user asked to stop after 3 chapters (Three Dimensional Geometry, Linear Programming,
Probability). Processing those 3 surfaced two real bugs (below), which became the focus
of the rest of the session. **The remaining 9 chapters have not been touched** and are
still waiting for this same chapter-by-chapter treatment whenever it resumes.

## Bug #1 (fixed, deployed, verified): `match-answer-keys` false-coverage bug

**File:** `app/api/admin/books/[id]/ingestions/[runId]/match-answer-keys/route.ts`
(+ its `route.test.ts`)

The route's safety check for "does this answer-key page actually belong to this
exercise" counted *any* nearby DRAFT candidate — including non-MCQ subjective questions
— as coverage evidence. This let Linear Programming's answer key (page 404) falsely
claim Three-Dimensional-Geometry's real MCQ candidates (page 367) with wrong letters,
while 3D Geometry's *own* real answer key (page 370) got skipped as "low coverage"
because most of its nearby candidates hadn't been captured yet.

**Fix:** coverage now requires `mcqCandidates.length > 0` (was: `candidates.length > 0`,
i.e. any candidate at all, MCQ-shaped or not).

Verified live: post-fix, the false match was gone and the real match (page 370 → its own
MCQs) applied correctly, letter-for-letter against the printed key.

A new regression test was added to `route.test.ts` modeled directly on this real
collision (chapter A's real MCQ candidates vs. chapter B's non-MCQ candidates scattered
over the same number range) — keep it, it's the exact shape of bug that's easy to
reintroduce by "simplifying" the coverage check later.

**This bug is exactly the class of problem the manifest feature (below) would prevent
structurally** instead of by heuristic — see that section.

## Bug #2 (fixed, deployed, verified with one known residual gap): silent extraction failures

**Files:** `frontend/src/lib/structure-questions.ts` (+ `structure-questions.test.ts`),
`frontend/src/lib/env.ts`

### Root cause

`structureQuestions()` (called by every extraction route via `extract-book-page.ts`) only
fell back from Gemini to Groq when Gemini's call **threw**. When Gemini returned HTTP 200
with truncated/malformed JSON — a *different* failure mode, found live on a dense
20-item MCQ page that consistently truncated mid-array — `parseLLMJson()` returned
`null`, and `normalizeExtractedQuestions(null)` silently collapsed that to `[]`.
That's indistinguishable from a page that legitimately has zero questions, so it never
triggered fallback and never surfaced anywhere as a failure. Two real gaps were found
this way: pages 368-369 of Three Dimensional Geometry (13 of 20 MCQs missing) and pages
471-479 of Probability (9 pages returning 0 despite having clearly legible content).

### Fix, in three parts (all in `structure-questions.ts`)

1. **Provider chain restructured**: `PROVIDERS = [gemini, groq, mistral]` (Mistral added
   as a third fallback per the user's suggestion — `QB_MISTRAL_TEXT_MODEL` added to
   `env.ts`, optional, defaults to `mistral-large-latest`; `MISTRAL_API_KEY` was already
   configured). The loop now treats "call succeeded but JSON is unparseable" the same as
   "call threw" — both advance to the next provider. Only a response that actually
   *parses* (even to a legitimately empty array) is trusted and stops the chain.

2. **Fabrication guard** — found live, and worth reading carefully before touching this
   code again: the first time the new fallback chain actually ran end-to-end, it
   recovered 13 previously-missing questions on page 369 — but a fallback provider
   (Groq or Mistral) had populated `correctAnswer` on all 13, despite page 369 having
   **no visible answer key** (the real key is on page 370). Cross-checked against that
   real key: 3 of the 13 were flatly wrong. The fallback model solved the questions
   itself, violating the extraction prompt's explicit "NEVER guess or solve to fabricate
   one" instruction — Gemini has not been observed doing this anywhere in this book. Fix:
   any provider other than `'gemini'` has its `correctAnswer`/`explanation`/
   `explanationType` stripped and a `... fallback -- answer/explanation stripped,
   unverified` tag appended before the result is returned. The recovered question
   **text** (content/options/type/topic/printedNumber) is kept — that's the actual value
   of the fallback; only the unverifiable answer is stripped. A genuine answer for these
   questions still reaches them later via `match-answer-keys`/`match-detailed-solutions`,
   which only backfill from text actually printed near a matching question number, never
   solved.

3. **Throw instead of silently returning `[]`** once every provider has failed or
   returned unparseable JSON. Previously this returned `[]`, indistinguishable from a
   genuinely empty page — the exact silence that hid the original bug. Now it throws an
   error naming each provider and why it failed (`"gemini threw: ..."` /
   `"mistral returned unparseable JSON (N chars): <snippet>"`), which
   `extract-questions/route.ts` already catches per-page into its `failures[]` array and
   marks that `DocumentPage` `FAILED` with the message — so a genuinely stuck page is now
   visible instead of looking identical to a real empty page. Verified this doesn't
   affect legitimate empty pages (front matter, syllabus pages) because those still
   return a *parseable* empty result from Gemini and return early, before this throw path
   is ever reached.

### Verified live

- Page 369 (Three Dimensional Geometry): re-extraction now correctly recovers 13
  questions with `correctAnswer`/`explanation` stripped and flagged, instead of
  fabricated answers.
- Probability pages 471-479: re-running recovered **65 new questions** across 6 of the 9
  originally-flagged pages (471: 2, 472: 2, 474: 10, 476: 28, 477: 7, 478: 16).

### Two things that looked like gaps but weren't — don't re-flag these

Pages 473 and 475 (Probability) originally looked like part of the same 9-page gap, but
they're **not bugs**: there's a separate, pre-existing page-stitching mechanism in
`extract-questions/route.ts` (`isLikelyCaseStudyFragment` / `isLikelyIncompletePage`,
capped at `MAX_FRAGMENT_CHAIN_PAGES = 3`) that correctly holds a page's text and merges
it with the next page when a question continues across a page break. Their content is
correctly saved under `sourcePageStart`/`sourcePageEnd` spans (473→474, 475→476) —
confirmed by matching content directly. A `pages` inspector endpoint exists at
`GET .../pages?start=N&end=M` (note: the query params are literally `start`/`end`, not
`startPage`/`pageNumber`/etc. — cost real time rediscovering this) if you need to
re-check raw OCR'd text for any page.

### One known, real, unresolved gap: page 479

Page 479 has **12 real questions plus a full printed answer key** at the bottom (visible
in full in the DB — `DocumentPage.rawText` for page 479, book's own printed page number
474). Every attempt (isolated, re-run, forced through the fragment-chain cap) returns
`detected: 0` with **no thrown error** — meaning Gemini returns a *parseable but empty*
`{"questions": []}` for this page's text, confidently and reproducibly. Because a
parseable empty result is trusted immediately (by design — to avoid burning two extra
provider calls confirming a genuinely empty page), Groq and Mistral are never even tried.
This is a *different* failure mode than bug #2's fix addresses (that fix handles
"unparseable," not "wrongly confident empty") and was not fixed this session.

**One attempted workaround that made things worse and was cleaned up**: forcing this
page through the `MAX_FRAGMENT_CHAIN_PAGES` cap (by feeding pages 480/481 into the same
chain) did force a save — but it saved 4 garbage rows extracted from page 480's Part-B
table-of-contents heading lines ("CBSE Sample Question Paper... (Solved)"), not page
479's real content. Those 4 rows were archived immediately
(`reviewNotes` explains why — search for "table-of-contents heading" in archived
questions on this book). **Don't repeat that workaround** — it doesn't actually recover
the content.

**A real fix idea that was considered but not implemented, due to regression risk**: add
a heuristic that distrusts a *parseable-but-empty* result when the source text "looks
question-shaped" (e.g. multiple numbered-line markers) and falls back anyway. The problem:
front-matter/syllabus pages (e.g. this book's page 4-5, "UNIT-I: RELATIONS AND
FUNCTIONS\n1. Relations and Functions...") also have multiple numbered lines and
legitimately have zero questions — a naive version of this heuristic would regress those
pages from correct-and-fast to wrong-and-slow (or wrong-and-thrown, under fix #3 above).
**This is exactly the kind of thing the manifest feature below would make safe**: if the
system has a confirmed page range that's *known* to be inside the questions section (not
front matter, not answer-key-only), it becomes safe to apply an aggressive
distrust-the-empty-result retry policy only inside that confirmed range.

Page 479's full raw text (all 12 questions + the answer key) is in this session's tool
history if useful for manual entry as a stop-gap; ask the user for it if it's not already
in your context.

## Data remediated this session (via direct API calls, not code — already live)

- The 13 page-369 rows with fabricated `correctAnswer` values (created before the
  fabrication guard existed): `correctAnswer`/`explanation` cleared, tagged with a
  `reviewNotes` explanation, left as `DRAFT` so they still flow through
  `match-answer-keys` normally.
- 9 leftover duplicate DRAFT rows (from earlier manual `batchSize` experiments on the
  same pages, plus 6 exact duplicates the fabrication-guard re-run created once the old
  rows were cleaned): archived, not deleted, each with a `reviewNotes` explanation.
- 4 garbage rows from the page-479 fragment-chain workaround (above): archived.

None of this needed a migration — all done through the existing `PATCH /api/questions/[id]`
endpoint (`status: 'ARCHIVED'` + `reviewNotes`, or field-clearing). **Never hard-deleted
anything** — that's a standing constraint from the user for this whole project.

## New feature proposal from the user (not yet started): pre-extraction chapter manifest

Partway through, the user proposed: before extraction runs on a chapter, present the
admin with the auto-detected chapter title, page range, and sub-ranges (which pages hold
which question-type sections, which pages are the answer key, which pages are detailed
solutions) for confirmation/editing, then use that **confirmed** structure to drive
extraction and matching instead of inferring it via heuristics each time.

This directly targets bug #1's root cause (`match-answer-keys` currently has no ground
truth for "which chapter owns which pages," only proximity + coverage heuristics — a
confirmed manifest turns that into a direct range lookup, eliminating that whole bug
class) and would make the page-479-style heuristic above safe to build (see previous
section). It does **not** replace bug #2's fix — a correct page range doesn't stop a
model from truncating or confidently misjudging a single page; that needed the provider
fallback + fabrication guard regardless.

Rough shape discussed (not designed in detail — this needs real design work):
- Auto-populate from the same page-header scan already used to find chapter boundaries
  (see "Context" above) as a starting point, so this is a confirm-and-edit step, not
  manual entry from scratch.
- Likely lands as new fields on `BookChapter` or a new `ChapterManifest`/`ChapterSection`
  table: `startPage`/`endPage`, `answerKeyStartPage`/`EndPage`,
  `solutionsStartPage`/`EndPage`, possibly a `sections` JSON array for question-type
  sub-ranges.
- `extract-questions`, `match-answer-keys`, and `match-detailed-solutions` would all read
  from this instead of re-inferring per run.
- Connects directly to `PHASE_QB_PILOT.md`'s already-stated quality gate #5 ("A solution
  match requires printed-number evidence plus content agreement; number alone is
  insufficient") and the image-book profile requirement to "build an explicit
  printed-number inventory before creating any Question records" — this feature is
  essentially the concrete mechanism for satisfying those gates for the Xam Idea Class 12
  book (and every other book fed through this pipeline).

This was the natural next step agreed with the user ("fix these gaps first, then design
the manifest feature") when this session was handed off to continue with full git access.

## Suggested next steps

1. `git status`/`git diff` in `frontend/` — review and commit the deployed changes
   (structure-questions.ts + its test, match-answer-keys/route.ts + its test, env.ts) if
   they look right to you. Run the actual test suite (`vitest`) — this session could only
   verify behavior against the live API, never ran the tests it wrote.
2. Decide whether to chase page 479's residual gap now (manual entry from the raw text
   this session captured, or a scoped fix) or fold it into the manifest feature's rollout.
3. Design the chapter-manifest feature properly — schema, the confirm/edit UI, and how
   `extract-questions`/`match-answer-keys`/`match-detailed-solutions` consume it — then
   build it.
4. Resume the chapter-by-chapter processing (Vector Algebra is next, 6 questions
   currently) once the above is settled, ideally *using* the new manifest for at least
   that next chapter as a real test of it.
