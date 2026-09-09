# Phase QB pilot corpus

## Corpus snapshot

| Book | Pages | Source profile | Primary extraction route |
|---|---:|---|---|
| Arihant Skills in Mathematics for JEE Integral Calculus | 319 | Born-digital text with damaged symbol encoding | Native layout + mathematical OCR reconciliation |
| Math Grade 12 Volume 1 | 210 | Mixed text and image-rendered item/marking-scheme pages | Layout OCR + item-to-rubric matching |
| Xam Idea Mathematics Class 12 (2023) | 534 | Encrypted, almost entirely page images; matrices and graphs | Page rendering + mathematical/diagram OCR |
| RD Sharma Main & Advanced | 180 | Photographed book pages with skew, perspective, hands/backgrounds and watermark | Image cleanup/dewarping + mathematical OCR |

Total pilot size: 1,243 pages, approximately 131 MB.

## Required routing profiles

### Digital-math profile

- Prefer the embedded text and layout as an inventory aid.
- Reconstruct formulas independently from rendered page regions.
- Preserve printed question and session numbers.
- Compare extracted formula semantics against the page image before verification.

### Mixed-layout assessment profile

- Detect question, answer-key, and marking-scheme page types.
- Preserve tables, mark allocations, matrices, and rubric steps.
- Match by chapter, printed item number, topic, and mathematical similarity.

### Image-book profile

- Render every page to a stable archival image.
- Detect page regions before OCR; preserve matrices, graphs, figures and answer blocks as assets.
- Build an explicit printed-number inventory before creating any Question records.

### Photographed-book profile

- Detect page boundary, crop background, deskew and correct perspective.
- Exclude fingers, adjacent pages, headers and converter watermarks from question regions.
- Hold low-resolution symbols and diagram-dependent questions for review.

## Quality gates

1. Page inventory count must equal the source PDF page count.
2. Every detected exercise must record expected, extracted, matched and unresolved question counts.
3. No question may be approved without its source page and printed identifier.
4. Options must be unique and the declared answer must resolve to an available option where applicable.
5. A solution match requires printed-number evidence plus content agreement; number alone is insufficient.
6. Graphs, matrices and figures must be retained as source assets and visually verified.
7. Mathematical verification and rendering verification are separate required checks.
8. Low-confidence, ambiguous, duplicate, or unmatched items remain in human review.

## Provider purchase gate

Do not purchase a long-term plan before running a controlled representative sample from all four profiles. Compare providers using question recall, formula accuracy, option accuracy, solution-match precision, figure retention, review minutes per 100 questions, and total cost per verified question.
