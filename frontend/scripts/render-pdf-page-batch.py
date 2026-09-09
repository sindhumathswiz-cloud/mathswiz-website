"""Render a bounded PDF page batch and emit conservative layout candidates."""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

import pdfplumber
import numpy as np
from PIL import Image, ImageFilter, ImageOps
from pypdf import PdfReader


QUESTION_RE = re.compile(r"^\s*(?:q(?:uestion)?\s*)?\d{1,4}\s*[.)]", re.I | re.M)
QUESTION_TOKEN_RE = re.compile(r"^(?:q(?:uestion)?\s*)?(\d{1,4})[.)]$", re.I)
OPTION_TOKEN_RE = re.compile(r"^(?:\([a-dA-D]\)|[a-dA-D][.)])$")
ANSWER_RE = re.compile(r"\b(?:answers?|answer\s*key)\b", re.I)
SOLUTION_RE = re.compile(r"\b(?:solutions?|sol\.)\b", re.I)
FIGURE_RE = re.compile(r"\b(?:fig(?:ure)?\.?|graph|diagram|curve|plot)\b", re.I)
TABLE_RE = re.compile(r"\b(?:table|marks?|q\.no|question\s*no)\b", re.I)
CONVERTER_NOTICE_RE = re.compile(r"An evaluation version of novaPDF.*?without this notice\.", re.I | re.S)


def classify_page(text: str, image_count: int) -> str:
    question_hits = len(QUESTION_RE.findall(text))
    has_answers = bool(ANSWER_RE.search(text))
    has_solutions = bool(SOLUTION_RE.search(text))
    if has_solutions and question_hits:
        return "MIXED_QUESTION_SOLUTION"
    if has_answers and question_hits:
        return "MIXED_QUESTION_ANSWER"
    if has_solutions:
        return "SOLUTION"
    if has_answers:
        return "ANSWER_KEY"
    if question_hits:
        return "QUESTION"
    if len(text.strip()) < 80 and image_count:
        return "IMAGE_CONTENT"
    if len(text.strip()) < 30:
        return "FRONT_OR_DIVIDER"
    return "CONTENT"


def horizontal_regions(image_path: Path) -> list[dict]:
    with Image.open(image_path) as source:
        image = source.convert("L")
        target_width = min(1200, image.width)
        if target_width != image.width:
            image = image.resize((target_width, round(image.height * target_width / image.width)))
        pixels = image.load()
        rows = []
        for y in range(image.height):
            dark = sum(1 for x in range(image.width) if pixels[x, y] < 210)
            rows.append(dark / image.width)
        active = [index for index, ratio in enumerate(rows) if ratio > 0.002]
        if not active:
            return []
        bands: list[list[int]] = [[active[0], active[0]]]
        for row in active[1:]:
            if row - bands[-1][1] <= 24:
                bands[-1][1] = row
            else:
                bands.append([row, row])
        regions = []
        for start, end in bands:
            if end - start < 8:
                continue
            regions.append({
                "kind": "CONTENT_BAND",
                "x": 0,
                "y": round(start / image.height, 5),
                "width": 1,
                "height": round((end - start + 1) / image.height, 5),
                "confidence": 0.55,
            })
        return regions[:40]


def column_regions(image_path: Path) -> list[dict]:
    with Image.open(image_path) as source:
        image = source.convert("L")
        target_width = min(1000, image.width)
        image = image.resize((target_width, round(image.height * target_width / image.width)))
        array = np.asarray(image)
        ink = array < 190
        top, bottom = round(image.height * 0.08), round(image.height * 0.92)
        ratios = ink[top:bottom].mean(axis=0)
        center_start, center_end = round(image.width * 0.35), round(image.width * 0.65)
        low_ink = np.where(ratios[center_start:center_end] < 0.018)[0]
        if len(low_ink) < max(8, round(image.width * 0.012)):
            return [{"kind": "PAGE_COLUMN", "x": 0.04, "y": 0.04, "width": 0.92, "height": 0.92, "confidence": 0.5}]
        groups = np.split(low_ink, np.where(np.diff(low_ink) > 1)[0] + 1)
        widest = max(groups, key=len)
        if len(widest) < max(8, round(image.width * 0.012)):
            return [{"kind": "PAGE_COLUMN", "x": 0.04, "y": 0.04, "width": 0.92, "height": 0.92, "confidence": 0.5}]
        gap_start = (center_start + int(widest[0])) / image.width
        gap_end = (center_start + int(widest[-1])) / image.width
        if not 0.38 <= (gap_start + gap_end) / 2 <= 0.62:
            return [{"kind": "PAGE_COLUMN", "x": 0.04, "y": 0.04, "width": 0.92, "height": 0.92, "confidence": 0.5}]
        return [
            {"kind": "PAGE_COLUMN", "column": 1, "x": 0.04, "y": 0.04, "width": round(gap_start - 0.05, 5), "height": 0.92, "confidence": 0.72},
            {"kind": "PAGE_COLUMN", "column": 2, "x": round(gap_end, 5), "y": 0.04, "width": round(0.96 - gap_end, 5), "height": 0.92, "confidence": 0.72},
        ]


def normalized_word_region(word: dict, plumber_page, kind: str, confidence: float) -> dict:
    return {
        "kind": kind,
        "x": round(float(word["x0"]) / plumber_page.width, 5),
        "y": round(float(word["top"]) / plumber_page.height, 5),
        "width": round((float(word["x1"]) - float(word["x0"])) / plumber_page.width, 5),
        "height": round((float(word["bottom"]) - float(word["top"])) / plumber_page.height, 5),
        "text": str(word["text"]),
        "confidence": confidence,
    }


def native_structure_regions(plumber_page, page_type: str, text: str, columns: list[dict]) -> list[dict]:
    try:
        words = plumber_page.extract_words() or []
    except Exception:
        return []
    question_markers = []
    option_markers = []
    for word in words:
        token = str(word.get("text", "")).strip()
        question_match = QUESTION_TOKEN_RE.match(token)
        if question_match and float(word["top"]) / plumber_page.height < 0.96:
            marker = normalized_word_region(word, plumber_page, "QUESTION_NUMBER_CANDIDATE", 0.82)
            marker["printedNumber"] = question_match.group(1)
            question_markers.append(marker)
        elif OPTION_TOKEN_RE.match(token):
            option_markers.append(normalized_word_region(word, plumber_page, "OPTION_MARKER_CANDIDATE", 0.76))
    regions = question_markers[:100] + option_markers[:200]
    eligible = page_type in {"QUESTION", "MIXED_QUESTION_ANSWER", "MIXED_QUESTION_SOLUTION"} or "exercise" in text.lower() or len(question_markers) >= 4 or len(option_markers) >= 4
    if not eligible or page_type in {"ANSWER_KEY", "SOLUTION"}:
        return regions
    page_columns = [column for column in columns if column.get("kind") == "PAGE_COLUMN"]
    for marker in question_markers:
        center_x = float(marker["x"]) + float(marker["width"]) / 2
        column = next((candidate for candidate in page_columns if float(candidate["x"]) <= center_x <= float(candidate["x"]) + float(candidate["width"])), None)
        if not column:
            column = {"x": 0.04, "width": 0.92}
        following = [candidate for candidate in question_markers if candidate is not marker and float(candidate["y"]) > float(marker["y"]) and float(column["x"]) <= float(candidate["x"]) <= float(column["x"]) + float(column["width"])]
        bottom = min([float(candidate["y"]) for candidate in following], default=0.95)
        top = max(0.0, float(marker["y"]) - 0.004)
        if bottom - top < 0.015:
            continue
        regions.append({
            "kind": "QUESTION_REGION_CANDIDATE",
            "printedNumber": marker["printedNumber"],
            "x": round(float(column["x"]), 5),
            "y": round(top, 5),
            "width": round(float(column["width"]), 5),
            "height": round(bottom - top, 5),
            "confidence": 0.68,
            "evidence": "native question marker and column geometry",
        })
    return regions


def enhance_photographed_page(image_path: Path) -> tuple[Path, dict]:
    processed_path = image_path.with_name(f"{image_path.stem}-processed.jpg")
    with Image.open(image_path) as source:
        rgb = source.convert("RGB")
        gray = ImageOps.grayscale(rgb)
        thumbnail = gray.copy()
        thumbnail.thumbnail((700, 900))
        best_angle, best_score = 0.0, -1.0
        for angle in np.arange(-2.0, 2.01, 0.5):
            candidate = thumbnail.rotate(float(angle), resample=Image.Resampling.BILINEAR, fillcolor=255)
            ink = np.asarray(candidate) < 180
            score = float(np.var(ink.sum(axis=1)))
            if score > best_score:
                best_angle, best_score = float(angle), score
        if abs(best_angle) < 0.5:
            best_angle = 0.0
        enhanced = rgb.rotate(best_angle, resample=Image.Resampling.BICUBIC, fillcolor="white") if best_angle else rgb
        enhanced = ImageOps.autocontrast(enhanced, cutoff=(0.5, 0.5)).filter(ImageFilter.UnsharpMask(radius=1.2, percent=115, threshold=3))
        enhanced.save(processed_path, "JPEG", quality=90, optimize=True, progressive=True)
        contrast = float(np.asarray(ImageOps.grayscale(enhanced).resize((200, 260))).std())
    return processed_path, {"deskewAngle": best_angle, "contrastScore": round(min(1.0, contrast / 64), 4), "operations": ["autocontrast", "unsharp_mask"] + (["deskew"] if best_angle else [])}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_pdf")
    parser.add_argument("output_dir")
    parser.add_argument("start", type=int)
    parser.add_argument("end", type=int)
    parser.add_argument("--dpi", type=int, default=150)
    parser.add_argument("--pdftoppm", required=True)
    parser.add_argument("--profile", default="DIGITAL_MATH")
    args = parser.parse_args()

    input_pdf = Path(args.input_pdf).resolve()
    output_dir = Path(args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    prefix = output_dir / "page"
    subprocess.run([
        args.pdftoppm, "-f", str(args.start), "-l", str(args.end), "-r", str(args.dpi),
        "-jpeg", "-jpegopt", "quality=88,progressive=y,optimize=y", str(input_pdf), str(prefix)
    ], check=True, capture_output=True)

    reader = PdfReader(input_pdf)
    results = []
    with pdfplumber.open(input_pdf) as document:
        for page_number in range(args.start, args.end + 1):
            candidates = [candidate for candidate in output_dir.glob("page-*.*") if int(candidate.stem.rsplit("-", 1)[-1]) == page_number]
            if not candidates:
                raise RuntimeError(f"Rendered page {page_number} was not found")
            image_path = candidates[-1]
            page = reader.pages[page_number - 1]
            plumber_page = document.pages[page_number - 1]
            try:
                native_text = plumber_page.extract_text() or ""
            except Exception:
                native_text = ""
            meaningful_text = CONVERTER_NOTICE_RE.sub("", native_text).strip()
            try:
                image_count = len(page.images)
            except Exception:
                image_count = 0
            with Image.open(image_path) as image:
                width, height = image.size
            page_type = classify_page(meaningful_text, image_count)
            columns = column_regions(image_path)
            regions = columns + horizontal_regions(image_path) + native_structure_regions(plumber_page, page_type, meaningful_text, columns)
            if FIGURE_RE.search(meaningful_text):
                regions.append({"kind": "FIGURE_OR_GRAPH_CANDIDATE", "confidence": 0.45, "evidence": "native keyword"})
            if TABLE_RE.search(meaningful_text):
                regions.append({"kind": "TABLE_CANDIDATE", "confidence": 0.45, "evidence": "native keyword"})
            if args.profile in {"IMAGE_BOOK", "PHOTOGRAPHED_BOOK"} and not any(region["kind"] == "QUESTION_REGION_CANDIDATE" for region in regions):
                regions.append({"kind": "VISION_SEGMENTATION_REQUIRED", "confidence": 1.0, "evidence": "image-based page without reliable native question geometry"})
            processed_path = None
            preprocessing = {"operations": []}
            if args.profile == "PHOTOGRAPHED_BOOK":
                processed_path, preprocessing = enhance_photographed_page(image_path)
            results.append({
                "pageNumber": page_number,
                "imagePath": str(image_path),
                "processedImagePath": str(processed_path) if processed_path else None,
                "width": width,
                "height": height,
                "nativeText": native_text,
                "nativeCharacters": len(native_text),
                "embeddedImages": image_count,
                "pageType": page_type,
                "regions": regions,
                "preprocessing": preprocessing,
                "imageQualityScore": round(min(1.0, width / 1200) * min(1.0, height / 1600), 4),
            })
    print(json.dumps({"pages": results}, ensure_ascii=False))


if __name__ == "__main__":
    main()
