"""Build a private, deterministic 100-page shadow-run sample without external calls."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

from PIL import Image, ImageFilter, ImageOps
import numpy as np
import pypdfium2 as pdfium
from pypdf import PdfReader


QUESTION_RE = re.compile(r"^\s*\d{1,4}\s*[.)]", re.M)
ANSWER_RE = re.compile(r"\b(?:answers?|answer\s*key)\b", re.I)
SOLUTION_RE = re.compile(r"\b(?:solutions?|sol\.)\b", re.I)
FIGURE_RE = re.compile(r"\b(?:fig(?:ure)?\.?|graph|diagram|curve|plot|matrix|determinant)\b", re.I)
CONVERTER_NOTICE_RE = re.compile(r"An evaluation version of novaPDF.*?without this notice\.", re.I | re.S)


def parse_book(value: str) -> dict:
    parts = value.split("|", 2)
    if len(parts) != 3:
        raise argparse.ArgumentTypeError("book must be id|profile|absolute-pdf-path")
    return {"id": parts[0], "profile": parts[1], "path": str(Path(parts[2]).resolve())}


def classify(text: str, images: int) -> tuple[str, int]:
    questions = len(QUESTION_RE.findall(text))
    if ANSWER_RE.search(text) or SOLUTION_RE.search(text):
        return "ANSWER_SOLUTION", questions
    if questions >= 3:
        return "QUESTION_DENSE", questions
    if FIGURE_RE.search(text):
        return "FIGURE_MATH", questions
    if len(text.strip()) < 100 and images:
        return "IMAGE_UNKNOWN", questions
    return "GENERAL_LAYOUT", questions


def evenly(items: list[dict], count: int) -> list[dict]:
    if count <= 0 or not items:
        return []
    if len(items) <= count:
        return items[:]
    return [items[round(index * (len(items) - 1) / (count - 1))] for index in range(count)] if count > 1 else [items[len(items) // 2]]


def select_pages(book: dict, per_book: int) -> tuple[list[dict], int, list[dict]]:
    reader = PdfReader(book["path"])
    total = len(reader.pages)
    start, end = max(1, round(total * 0.03)), min(total, round(total * 0.97))
    candidates = []
    for page_number in range(start, end + 1):
        page = reader.pages[page_number - 1]
        try:
            text = page.extract_text() or ""
        except Exception:
            text = ""
        try:
            images = len(page.images)
        except Exception:
            images = 0
        meaningful_text = CONVERTER_NOTICE_RE.sub("", text).strip()
        category, question_markers = classify(meaningful_text, images)
        candidates.append({"pageNumber": page_number, "category": category, "nativeCharacters": len(meaningful_text), "embeddedImages": images, "nativeQuestionMarkers": question_markers})
    quotas = {"QUESTION_DENSE": 12, "ANSWER_SOLUTION": 6, "FIGURE_MATH": 4, "GENERAL_LAYOUT": 3}
    selected = []
    for category, quota in quotas.items():
        selected.extend(evenly([page for page in candidates if page["category"] == category], min(quota, per_book - len(selected))))
    remaining = [page for page in candidates if page not in selected]
    selected.extend(evenly(remaining, per_book - len(selected)))
    selected = sorted({page["pageNumber"]: page for page in selected}.values(), key=lambda page: page["pageNumber"])
    if len(selected) < per_book:
        unused = [page for page in candidates if page["pageNumber"] not in {item["pageNumber"] for item in selected}]
        selected.extend(evenly(unused, per_book - len(selected)))
        selected.sort(key=lambda page: page["pageNumber"])
    return selected[:per_book], total, candidates


def render_page(book: dict, sample: dict, output_root: Path, dpi: int) -> dict:
    directory = output_root / book["id"]
    directory.mkdir(parents=True, exist_ok=True)
    prefix = directory / f"page-{sample['pageNumber']:04d}"
    image_path = prefix.with_suffix(".jpg")
    document = pdfium.PdfDocument(book["path"])
    try:
        page = document[sample["pageNumber"] - 1]
        try:
            rendered = page.render(scale=dpi / 72).to_pil().convert("RGB")
            rendered.save(image_path, "JPEG", quality=90, optimize=True, progressive=True)
        finally:
            page.close()
    finally:
        document.close()
    benchmark_path = image_path
    operations = []
    if book["profile"] == "PHOTOGRAPHED_BOOK":
        benchmark_path = prefix.with_name(f"{prefix.name}-processed").with_suffix(".jpg")
        with Image.open(image_path) as source:
            enhanced = ImageOps.autocontrast(source.convert("RGB"), cutoff=(0.5, 0.5)).filter(ImageFilter.UnsharpMask(radius=1.2, percent=115, threshold=3))
            enhanced.save(benchmark_path, "JPEG", quality=90, optimize=True, progressive=True)
        operations = ["autocontrast", "unsharp_mask"]
    payload = benchmark_path.read_bytes()
    with Image.open(benchmark_path) as rendered:
        luminance = np.asarray(ImageOps.grayscale(rendered).resize((160, 220)))
        mean_luminance = float(luminance.mean())
        ink_ratio = float((luminance < 200).mean())
    eligible = not (book["profile"] == "IMAGE_BOOK" and mean_luminance < 120)
    return {**sample, "archivalImagePath": str(image_path), "benchmarkImagePath": str(benchmark_path), "benchmarkImageBytes": len(payload), "benchmarkImageSha256": hashlib.sha256(payload).hexdigest(), "meanLuminance": round(mean_luminance, 2), "inkRatio": round(ink_ratio, 4), "preprocessing": operations, "status": "READY" if eligible else "EXCLUDED_NON_CONTENT"}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--book", action="append", type=parse_book, required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--per-book", type=int, default=25)
    parser.add_argument("--dpi", type=int, default=150)
    args = parser.parse_args()
    if len(args.book) != 4 or args.per_book != 25:
        raise ValueError("Phase QB shadow sample requires exactly four books and 25 pages per book")
    output_root = Path(args.output).resolve()
    manifest_books = []
    candidates_by_id = {}
    jobs = []
    for book in args.book:
        selected, total, candidates = select_pages(book, args.per_book)
        candidates_by_id[book["id"]] = candidates
        manifest_books.append({"id": book["id"], "profile": book["profile"], "sourcePdf": book["path"], "sourcePages": total, "samples": []})
        jobs.extend((book, sample) for sample in selected)
    by_id = {book["id"]: book for book in manifest_books}
    with ThreadPoolExecutor(max_workers=4) as executor:
        futures = {executor.submit(render_page, book, sample, output_root, args.dpi): book for book, sample in jobs}
        for future in as_completed(futures):
            book = futures[future]
            by_id[book["id"]]["samples"].append(future.result())
    for book in manifest_books:
        source_book = next(source for source in args.book if source["id"] == book["id"])
        used = {sample["pageNumber"] for sample in book["samples"]}
        excluded = [sample for sample in book["samples"] if sample["status"] != "READY"]
        ready = [sample for sample in book["samples"] if sample["status"] == "READY"]
        while len(ready) < args.per_book:
            pool = [candidate for candidate in candidates_by_id[book["id"]] if candidate["pageNumber"] not in used]
            if not pool:
                break
            replacements = evenly(pool, min(len(pool), max(3, (args.per_book - len(ready)) * 3)))
            for candidate in replacements:
                used.add(candidate["pageNumber"])
                rendered = render_page(source_book, candidate, output_root, args.dpi)
                if rendered["status"] == "READY":
                    ready.append(rendered)
                    if len(ready) == args.per_book:
                        break
                else:
                    excluded.append(rendered)
        if len(ready) != args.per_book:
            raise RuntimeError(f"Could not find {args.per_book} eligible pages for {book['id']}")
        book["excludedNonContentPages"] = sorted(sample["pageNumber"] for sample in excluded)
        book["samples"] = sorted(ready[:args.per_book], key=lambda sample: sample["pageNumber"])
    manifest = {
        "version": 2,
        "renderer": "PDFium",
        "status": "AWAITING_EXTERNAL_TRANSFER_APPROVAL",
        "samplePages": 100,
        "geminiCallCeiling": 100,
        "mathpixCallCeiling": 25,
        "externalCallCeiling": 125,
        "books": manifest_books,
    }
    output_root.mkdir(parents=True, exist_ok=True)
    manifest_path = output_root / "shadow-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False), encoding="utf-8")
    print(json.dumps({"manifestPath": str(manifest_path), "books": [{"id": book["id"], "profile": book["profile"], "samplePages": len(book["samples"]), "categories": {category: sum(1 for sample in book["samples"] if sample["category"] == category) for category in sorted({sample["category"] for sample in book["samples"]})}} for book in manifest_books]}, indent=2))


if __name__ == "__main__":
    main()
