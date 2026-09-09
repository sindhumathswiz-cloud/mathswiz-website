"""Create a frozen set of at most 25 high-risk formula crops; no external calls."""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path

from PIL import Image


ROOT = Path.cwd() / ".private" / "shadow-sample-corrected"
CHECKPOINT = ROOT / "mistral-corrected-head-to-head-checkpoint.json"
OUTPUT = ROOT / "mathpix-formula-crops"
FORMULA_RE = re.compile(r"\\(?:int|sum|lim|sqrt|frac|begin|sin|cos|tan|alpha|beta|pi)|\$|[∫Σπαβ√]", re.I)
RISK_RE = re.compile(r"\\(?:int|sum|lim|sqrt|begin|alpha|beta|pi)|\^\{|_\{|tan\^\{-1\}|sin\^\{-1\}|cos\^\{-1\}|\\left|\\right", re.I)


def score(block: dict) -> int:
    content = str(block.get("content") or "")
    if not FORMULA_RE.search(content):
        return -1
    value = 100 if block.get("type") == "equation" else 30
    value += 8 * len(RISK_RE.findall(content))
    value += min(len(content) // 80, 12)
    return value


def main() -> None:
    checkpoint = json.loads(CHECKPOINT.read_text(encoding="utf-8"))
    completed = [result for result in checkpoint["results"] if result["status"] == "COMPLETED"]
    if len(completed) != 12:
        raise ValueError(f"Expected 12 completed corrected Mistral pages, found {len(completed)}")
    candidates = []
    for result in completed:
        blocks = result["rawOutput"]["pages"][0].get("blocks") or []
        for index, block in enumerate(blocks):
            block_score = score(block)
            if block_score >= 0:
                candidates.append({"result": result, "block": block, "blockIndex": index, "score": block_score})

    selected = []
    used = set()
    for page_number in sorted({candidate["result"]["pageNumber"] for candidate in candidates}):
        page_candidates = sorted((candidate for candidate in candidates if candidate["result"]["pageNumber"] == page_number), key=lambda candidate: candidate["score"], reverse=True)
        for candidate in page_candidates[:2]:
            selected.append(candidate)
            used.add((page_number, candidate["blockIndex"]))
    for candidate in sorted(candidates, key=lambda item: item["score"], reverse=True):
        identity = (candidate["result"]["pageNumber"], candidate["blockIndex"])
        if len(selected) >= 25:
            break
        if identity not in used:
            selected.append(candidate)
            used.add(identity)
    selected = selected[:25]
    if not selected or len(selected) > 25:
        raise ValueError("Formula crop selection violated its ceiling")

    OUTPUT.mkdir(parents=True, exist_ok=True)
    manifest_crops = []
    for ordinal, candidate in enumerate(selected, start=1):
        result, block = candidate["result"], candidate["block"]
        with Image.open(result["imagePath"]) as source:
            left = max(0, int(block["top_left_x"]) - 24)
            top = max(0, int(block["top_left_y"]) - 18)
            right = min(source.width, int(block["bottom_right_x"]) + 24)
            bottom = min(source.height, int(block["bottom_right_y"]) + 18)
            if right <= left or bottom <= top:
                raise ValueError(f"Invalid crop box on page {result['pageNumber']} block {candidate['blockIndex']}")
            crop = source.crop((left, top, right, bottom))
            crop_path = OUTPUT / f"crop-{ordinal:02d}-p{result['pageNumber']:04d}-b{candidate['blockIndex']:03d}.png"
            crop.save(crop_path, "PNG", optimize=True)
        payload = crop_path.read_bytes()
        manifest_crops.append({
            "key": f"p{result['pageNumber']}:b{candidate['blockIndex']}:MATHPIX_OCR",
            "pageNumber": result["pageNumber"], "blockIndex": candidate["blockIndex"], "blockType": block.get("type"),
            "selectionScore": candidate["score"], "sourceImageSha256": result["imageSha256"],
            "sourceBbox": [left, top, right, bottom], "mistralContent": block.get("content") or "",
            "cropPath": str(crop_path.resolve()), "cropSha256": hashlib.sha256(payload).hexdigest(), "cropBytes": len(payload),
        })
    if len({crop["cropSha256"] for crop in manifest_crops}) != len(manifest_crops):
        raise ValueError("Formula crop sample contains duplicate image hashes")
    manifest = {"version": 1, "status": "READY_APPROVED", "provider": "MATHPIX_OCR", "callCeiling": 25, "cropCount": len(manifest_crops), "crops": manifest_crops}
    manifest_path = ROOT / "mathpix-formula-crop-manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(json.dumps({"manifestPath": str(manifest_path), "cropCount": len(manifest_crops), "pages": sorted({crop["pageNumber"] for crop in manifest_crops})}))


if __name__ == "__main__":
    main()
