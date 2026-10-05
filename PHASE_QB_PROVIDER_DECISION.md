# Phase QB provider decision

Status as of 2026-10-05: **not ready to decide. Do not buy a long-term plan yet.**

The decision is made by a gate, not by opinion. It lives in `frontend/src/lib/provider-pilot.ts`, is shown at
Book Library -> Provider pilot, and reads existing results only: it never calls a provider.

## How the decision is made

PHASE_QB_PILOT.md requires a controlled representative sample from all four source profiles, compared on question
recall, formula accuracy, option accuracy, solution-match precision, figure retention, review minutes per 100
questions and cost per verified question. The gate turns that into criteria, each `Met`, `Not met` or
`Not measured`. The verdict stays `Not ready` until every criterion is both measured and met. A "provisional
lead" is shown alongside, labelled as the reading so far, never as a recommendation to buy.

Evidence comes from three places:

- Benchmarks run inside the app (Book Library -> Gemini / Mathpix buttons), which know the book's class and the
  run's source profile.
- The earlier four-page pilot and shadow-sample runs, summarised by `scripts/build-pilot-evidence.py` into
  `frontend/src/data/phase-qb-pilot-evidence.json` (counts, outcomes and latencies only; page images and provider
  output stay under `.private`). Re-run the script after any new benchmark run.
- Measurements only a person can supply, recorded per run on the same screen: review minutes, questions
  reviewed, and spend.

Thresholds are proposals, not measurements, and are constants at the top of `provider-pilot.ts`: 90% completion,
95% question recall, 90% question precision, 90% formula agreement, 25 pages per profile and per class, 100
reviewed questions. A provider that ran out of credit counts as unavailable, not as failing.

## What the evidence says so far

| Provider | Pages | Completed | Question recall | Precision | Median latency |
|---|---:|---:|---:|---:|---:|
| Gemini Vision | 21 (2 unavailable) | 84% | 95.6% over 12 scored pages | 90.2% | 37.8 s |
| Mathpix OCR | 6 | 100% | 98.2% over 4 scored pages | 74.7% | 3.9 s |
| Mistral OCR | 12 | 100% | 96.2% over 8 scored pages | 86.2% | 3.1 s |
| OpenAI Vision | 1 | 0% (no credit) | none | none | none |

Reading it:

- Gemini leads on the evidence so far, but mostly by default: it is the only provider with enough scored pages to
  rank (10 or more). Mistral, with 8, is close behind and would be ranked with a little more data.
- Mathpix's high recall comes from four pages, and it over-detects badly on the image-book page (30 markers for 12
  questions), so it ranks low once false detections count. This matches the written benchmark: use it for targeted
  formula regions, not as the whole-page question parser.
- Mistral is close to Gemini on recall and far faster, but has fewer scored pages and lower precision.
- Question counts are measured against the PDF's own question markers on born-digital pages (or a hand count on the
  four-page pilot). That is a proxy: on one Arihant page the markers expect 13 and Gemini reports 25. Treat small
  differences as noise.

## What the pilot still needs

1. **Coverage.** Completed provider results on 25 pages for each source profile: digital math has 13, mixed layout
   1, image book 3, photographed book 1. And for each class: Class 11 has none (the earlier files record no class),
   Class 12 has 2. Run benchmarks from the Book Library, or the stratified shadow sample, on the Class 11 book
   (Senior Secondary School Mathematics) as well as the Class 12 one. This spends provider credits and needs
   explicit approval, as the 100-page shadow run does.
2. **Review time and spend.** Record, per run, how long reviewing took, how many questions were reviewed (at least
   100 across runs) and what was spent. Cost per verified question is divided only by the verified questions of
   runs whose spend was recorded.
3. **Ground truth.** Option accuracy, solution-match precision and figure retention cannot be scored without a
   hand-labelled sample; nothing in the system records it yet. Until it exists those three criteria stay `Not
   measured` and block the verdict.
4. **Formula agreement.** Run the Provider Agreement screen on pages that have both a Gemini and a Mathpix
   reading. No page does yet.

When every criterion is measured and met the screen reads `Ready to decide` and names the provider that leads.
