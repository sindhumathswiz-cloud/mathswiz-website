"""Re-render the frozen 12-page head-to-head sample with PDFium; no external calls."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pypdfium2 as pdfium


ROOT = Path.cwd() / ".private" / "shadow-sample"
OUTPUT = Path.cwd() / ".private" / "shadow-sample-corrected"


def main() -> None:
    shadow = json.loads((ROOT / "shadow-manifest.json").read_text(encoding="utf-8"))
    frozen = json.loads((ROOT / "mistral-head-to-head-checkpoint.json").read_text(encoding="utf-8"))["approvedSamples"]
    if len(frozen) != 12:
        raise ValueError(f"Expected 12 frozen samples, found {len(frozen)}")
    books = {book["id"]: book for book in shadow["books"]}
    OUTPUT.mkdir(parents=True, exist_ok=True)
    samples = []
    for frozen_sample in frozen:
        book = books[frozen_sample["bookId"]]
        directory = OUTPUT / frozen_sample["bookId"]
        directory.mkdir(parents=True, exist_ok=True)
        output_path = directory / f"page-{frozen_sample['pageNumber']:04d}-pdfium.jpg"
        document = pdfium.PdfDocument(book["sourcePdf"])
        try:
            page = document[frozen_sample["pageNumber"] - 1]
            try:
                image = page.render(scale=180 / 72).to_pil().convert("RGB")
                image.save(output_path, "JPEG", quality=94, optimize=True, progressive=True)
            finally:
                page.close()
        finally:
            document.close()
        payload = output_path.read_bytes()
        samples.append({
            **frozen_sample,
            "sourcePdf": book["sourcePdf"],
            "imagePath": str(output_path.resolve()),
            "imageSha256": hashlib.sha256(payload).hexdigest(),
            "imageBytes": len(payload),
            "renderer": "PDFium",
            "dpi": 180,
        })
    if len({sample["imageSha256"] for sample in samples}) != 12:
        raise ValueError("Corrected sample contains duplicate image hashes")
    manifest = {"version": 1, "status": "READY_APPROVED", "approvedPageCount": 12, "callCeiling": 12, "provider": "MISTRAL_OCR", "samples": samples}
    manifest_path = OUTPUT / "corrected-head-to-head-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"manifestPath": str(manifest_path), "pages": [sample["pageNumber"] for sample in samples], "uniqueHashes": 12}))


if __name__ == "__main__":
    main()
