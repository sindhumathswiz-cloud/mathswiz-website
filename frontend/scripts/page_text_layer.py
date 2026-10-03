"""Positioned, selectable text for one PDF page (the "text layer").

The page image stays the visual source of truth; this is what makes the text
on it selectable at the exact place it is printed. Coordinates are fractions
of the page (0-1, top-left origin) so they hold at any display size.

Lines follow the PDF's own content-stream order (``use_text_flow``), which is
reading order for almost every generated PDF -- a two-column page therefore
copies column 1 then column 2 instead of interleaving the columns row by row.
"""

from __future__ import annotations

MIN_CHARACTERS = 12
MAX_LINES = 1500
# Legacy symbol-font glyphs land in the Unicode Private Use Area; they paste as
# boxes, so a page full of them needs the OCR text layer instead.
PRIVATE_USE_START, PRIVATE_USE_END = 0xE000, 0xF8FF
REPLACEMENT_CHARACTER = 0xFFFD


def _rounded(value: float) -> float:
    return round(float(value), 5)


def garbled_ratio(text: str) -> float:
    visible = [char for char in text if not char.isspace()]
    if not visible:
        return 0.0
    bad = sum(1 for char in visible if PRIVATE_USE_START <= ord(char) <= PRIVATE_USE_END or ord(char) == REPLACEMENT_CHARACTER)
    return round(bad / len(visible), 4)


def _same_line(previous: dict, word: dict) -> bool:
    height = max(float(previous["bottom"]) - float(previous["top"]), float(word["bottom"]) - float(word["top"]), 1.0)
    on_same_baseline = abs(float(word["top"]) - float(previous["top"])) <= height * 0.5
    # A word that starts well to the left of where the last one ended began a
    # new line (or column), even when the two happen to share a baseline.
    continues_rightwards = float(word["x0"]) >= float(previous["x1"]) - height * 0.5
    return on_same_baseline and continues_rightwards


def build_text_layer(plumber_page) -> dict | None:
    """Return the page's text layer, or None when the page has no usable text."""
    try:
        words = plumber_page.extract_words(use_text_flow=True, keep_blank_chars=False) or []
    except Exception:
        return None
    words = [word for word in words if str(word.get("text", "")).strip()]
    if not words:
        return None

    page_width, page_height = float(plumber_page.width), float(plumber_page.height)
    if page_width <= 0 or page_height <= 0:
        return None

    grouped: list[list[dict]] = []
    for word in words:
        if grouped and _same_line(grouped[-1][-1], word):
            grouped[-1].append(word)
        else:
            grouped.append([word])

    lines = []
    for group in grouped[:MAX_LINES]:
        x0 = min(float(w["x0"]) for w in group)
        x1 = max(float(w["x1"]) for w in group)
        top = min(float(w["top"]) for w in group)
        bottom = max(float(w["bottom"]) for w in group)
        lines.append({
            "x": _rounded(max(0.0, x0 / page_width)),
            "y": _rounded(max(0.0, top / page_height)),
            "w": _rounded(min(1.0, (x1 - x0) / page_width)),
            "h": _rounded(min(1.0, (bottom - top) / page_height)),
            "text": " ".join(str(w["text"]) for w in group),
            "kind": "text",
            "words": [
                [_rounded(max(0.0, float(w["x0"]) / page_width)), _rounded((float(w["x1"]) - float(w["x0"])) / page_width), str(w["text"])]
                for w in group
            ],
        })

    all_text = " ".join(line["text"] for line in lines)
    if len(all_text.replace(" ", "")) < MIN_CHARACTERS:
        return None
    return {"version": 1, "source": "NATIVE_PDF", "garbled": garbled_ratio(all_text), "lines": lines}
