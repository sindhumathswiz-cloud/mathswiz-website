"""Build a local-only page inventory for question/answer/solution pairing."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from pypdf import PdfReader


BOOKS = [
    ("arihant", "DIGITAL_MATH", Path(r"C:\Users\sumod\Downloads\JEE Books\Arihant Skills in Mathematics for JEE Integral Calculus.pdf")),
    ("grade12", "MIXED_EDUCATIONAL", Path(r"C:\Users\sumod\Downloads\Class 12 Maths\Math_Grade12_V1.pdf")),
    ("xamidea", "MIXED_EDUCATIONAL", Path(r"C:\Users\sumod\Downloads\Class 12 Maths\Xam Idea Mathematics Class 12 2023 Edition.pdf")),
    ("rdsharma", "PHOTOGRAPHED_BOOK", Path(r"C:\Users\sumod\Downloads\JEE Books\RD Sharma 1 Main&Adv.pdf")),
]

QUESTION_RE = re.compile(r"(?m)^\s*(?:q(?:uestion)?\.?\s*)?(\d{1,3})\s*[.)]\s+")
EXAMPLE_RE = re.compile(r"\bexample\s+(\d{1,3})\b", re.I)
SOLUTION_NUMBER_RE = re.compile(r"\b(?:sol(?:ution)?\.?|answer)\s*(?:no\.?\s*)?(\d{1,3})\b", re.I)
ANSWER_HEADING_RE = re.compile(r"\b(?:answer\s*key|answers?|hints?\s+(?:and|&)\s+solutions?)\b", re.I)
SOLUTION_HEADING_RE = re.compile(r"\b(?:detailed\s+solutions?|solutions?|sol\.)\b", re.I)
EXERCISE_RE = re.compile(r"\b(?:exercise|multiple choice|single option|objective type|questions?)\b", re.I)
FIGURE_RE = re.compile(r"\b(?:fig(?:ure)?\.?|graph|curve|matrix|determinant)\b", re.I)


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main() -> None:
    output_root = Path(".private/paired-benchmark").resolve()
    output_root.mkdir(parents=True, exist_ok=True)
    books = []
    for book_id, profile, source in BOOKS:
        reader = PdfReader(str(source))
        pages = []
        for index, page in enumerate(reader.pages):
            try:
                text = page.extract_text() or ""
            except Exception:
                text = ""
            normalized = re.sub(r"\s+", " ", text).strip()
            question_numbers = sorted({int(value) for value in QUESTION_RE.findall(text)})
            example_numbers = sorted({int(value) for value in EXAMPLE_RE.findall(text)})
            solution_numbers = sorted({int(value) for value in SOLUTION_NUMBER_RE.findall(text)})
            pages.append({
                "pageNumber": index + 1,
                "characters": len(normalized),
                "questionNumbers": question_numbers,
                "exampleNumbers": example_numbers,
                "solutionNumbers": solution_numbers,
                "questionMarkerCount": len(QUESTION_RE.findall(text)),
                "hasExerciseHeading": bool(EXERCISE_RE.search(text)),
                "hasAnswerHeading": bool(ANSWER_HEADING_RE.search(text)),
                "hasSolutionHeading": bool(SOLUTION_HEADING_RE.search(text)),
                "hasFigureMarker": bool(FIGURE_RE.search(text)),
                "preview": normalized[:240],
            })
        books.append({
            "id": book_id,
            "profile": profile,
            "sourcePdf": str(source.resolve()),
            "sourcePdfSha256": sha256(source),
            "sourcePages": len(reader.pages),
            "pages": pages,
        })
        print(json.dumps({
            "id": book_id,
            "pages": len(pages),
            "textPages": sum(page["characters"] >= 80 for page in pages),
            "questionPages": sum(page["questionMarkerCount"] >= 3 for page in pages),
            "answerPages": sum(page["hasAnswerHeading"] for page in pages),
            "solutionPages": sum(page["hasSolutionHeading"] for page in pages),
        }))
    output_path = output_root / "page-inventory.json"
    output_path.write_text(json.dumps({"version": 1, "books": books}, indent=2), encoding="utf-8")
    print(json.dumps({"outputPath": str(output_path)}))


if __name__ == "__main__":
    main()
