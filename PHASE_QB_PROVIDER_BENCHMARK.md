# Phase QB provider benchmark

Benchmark date: 2026-09-03  
Prompt version: `QB_PAGE_EXTRACTION_V1`  
Corpus: four representative pages, one from each Phase QB source profile

## Results

| Profile | Expected visible items | Gemini result | Mathpix result |
|---|---:|---|---|
| Arihant digital math | 24 | 24/24, exact numbering, 33.9 s | 24 markers, 3.2 s; low overall confidence and a material formula-symbol error was observed |
| Grade 12 mixed layout | 1 rubric item | 1/1 with solution structure, 11.8 s | Table and rubric text captured, 3.9 s; question-marker metric did not recognize the table-row number |
| Xam Idea image book | 12 | 12/12, exact numbering, matrices and same-page answers preserved, 37.0 s | 30 markers, 4.2 s; 18 false extra markers caused by the answer section |
| RD Sharma photographed | 20 | 20/20, 19 complete four-option items, one correctly flagged as cropped, 49.0 s | 21 markers and 80 option markers, 7.0 s; one header false positive and low overall confidence |

## Decision

1. Use deterministic native-PDF extraction first when reliable.
2. Use Gemini Vision as the primary image-page segmenter and structured question transcriber.
3. Use Mathpix only on targeted mathematical regions for secondary OCR evidence, not as the whole-page question parser.
4. Compare provider outputs at formula-token level. Disagreement, missing options, cropped figures, or low confidence must enter review.
5. Never treat either provider's self-reported confidence as approval evidence.
6. Match answers and solutions only after printed-number, page-context, and mathematical-content agreement.
7. Keep all benchmark and extraction output in draft/review state until deterministic post-write QA passes.

## Subscription checkpoint

The currently configured credentials completed the pilot. Do not purchase an additional subscription yet. The next cost checkpoint is a 100-page shadow run measuring verified questions per rupee and human-review minutes per 100 questions.

Raw results are retained privately under `frontend/.private/provider-benchmarks/phase-qb-provider-pilot.json` and are excluded from version control.
