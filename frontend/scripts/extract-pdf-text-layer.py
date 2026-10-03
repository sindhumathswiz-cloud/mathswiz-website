"""Build the native text layer for specific pages of a PDF (no rendering, no OCR).

Free and local: used to backfill pages that were rendered before text layers
were stored, and by the page-faithful source viewer.
"""

from __future__ import annotations

import argparse
import json
import sys

import pdfplumber

from page_text_layer import build_text_layer

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_pdf")
    parser.add_argument("pages", help="comma-separated 1-based page numbers")
    args = parser.parse_args()

    results = []
    with pdfplumber.open(args.input_pdf) as document:
        wanted = sorted({int(part) for part in args.pages.split(",") if part.strip().isdigit()})
        for page_number in wanted:
            if not 1 <= page_number <= len(document.pages):
                continue
            try:
                layer = build_text_layer(document.pages[page_number - 1])
            except Exception:  # noqa: BLE001 - one bad page must not lose the batch
                layer = None
            results.append({"pageNumber": page_number, "textLayer": layer})
    print(json.dumps({"pages": results}, ensure_ascii=False))


if __name__ == "__main__":
    main()
