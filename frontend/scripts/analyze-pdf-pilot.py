"""Read-only structural profiler for representative question-bank PDFs."""

from __future__ import annotations

import json
import statistics
import sys
from pathlib import Path

from pypdf import PdfReader


def page_profile(page) -> dict:
    try:
        text = page.extract_text() or ""
    except Exception:
        text = ""
    try:
        image_count = len(page.images)
    except Exception:
        image_count = 0
    return {
        "characters": len(text),
        "words": len(text.split()),
        "images": image_count,
        "preview": " ".join(text.split())[:240],
    }


def analyze(path: Path) -> dict:
    reader = PdfReader(path)
    count = len(reader.pages)
    sample_indexes = sorted({0, 1, max(0, count // 10), max(0, count // 4), max(0, count // 2), max(0, (count * 3) // 4), max(0, count - 2), max(0, count - 1)})
    samples = {str(index + 1): page_profile(reader.pages[index]) for index in sample_indexes}
    char_counts = [sample["characters"] for sample in samples.values()]
    metadata = reader.metadata or {}
    text_rich_pages = sum(1 for sample in samples.values() if sample["characters"] >= 500)
    image_counts = [sample["images"] for sample in samples.values()]
    median_images = statistics.median(image_counts) if image_counts else 0
    producer = str(metadata.get("/Producer", "")).lower()
    creator = str(metadata.get("/Creator", "")).lower()
    outline_items = len(reader.outline) if isinstance(reader.outline, list) else 0
    if statistics.median(char_counts) >= 500:
        source_profile = "DIGITAL_MATH"
    elif outline_items >= max(10, count // 2) or "corel" in producer or "corel" in creator:
        source_profile = "MIXED_LAYOUT_ASSESSMENT"
    elif median_images <= 3:
        source_profile = "PHOTOGRAPHED_BOOK"
    else:
        source_profile = "IMAGE_BOOK"
    return {
        "file": str(path),
        "bytes": path.stat().st_size,
        "pages": count,
        "encrypted": reader.is_encrypted,
        "metadata": {str(key): str(value) for key, value in metadata.items() if value},
        "outline_items": outline_items,
        "sample_character_median": statistics.median(char_counts) if char_counts else 0,
        "sample_image_median": median_images,
        "sample_text_rich_pages": text_rich_pages,
        "source_profile": source_profile,
        "sample_pages": samples,
    }


if __name__ == "__main__":
    results = []
    for raw_path in sys.argv[1:]:
        path = Path(raw_path)
        try:
            results.append(analyze(path))
        except Exception as error:
            results.append({"file": str(path), "error": f"{type(error).__name__}: {error}"})
    print(json.dumps(results, indent=2, ensure_ascii=False))
