"""Summarise the private Phase QB provider benchmark files into a committable evidence file.

Reads frontend/.private/{provider-benchmarks,shadow-sample,shadow-sample-corrected}
(page images, raw provider output and source paths stay private) and writes
frontend/src/data/phase-qb-pilot-evidence.json: one row per provider call with only its
provider, source profile, outcome, latency and question counts. Re-run after any new
benchmark run: python scripts/build-pilot-evidence.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PRIVATE = ROOT / ".private"
OUT = ROOT / "src" / "data" / "phase-qb-pilot-evidence.json"

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")


def load(relative: str):
    path = PRIVATE / relative
    return json.loads(path.read_text(encoding="utf8")) if path.exists() else None


def row(*, dataset, provider, profile, sample, status, latency, model, expected, found, over=None, date=None):
    return {
        "dataset": dataset,
        "provider": provider,
        "profile": profile,
        "sample": sample,
        "status": status,
        "latencyMs": latency,
        "model": model,
        "expectedQuestions": expected,
        "foundQuestions": found,
        "overDetection": over,
        "date": date,
    }


def main() -> None:
    rows = []
    sources = []

    # 1. The four-page, four-profile benchmark (Gemini vs Mathpix). Expected counts
    # were established by reading each page by hand.
    pilot = load("provider-benchmarks/phase-qb-provider-pilot.json")
    if pilot:
        sources.append("provider-benchmarks/phase-qb-provider-pilot.json")
        for r in pilot["results"]:
            rows.append(row(
                dataset="PILOT_4_PAGE", provider=r["provider"], profile=r["profile"], sample=f"{r['sampleId']}:{r['pageNumber']}",
                status=r["status"], latency=r.get("latencyMs"), model=r.get("model"),
                expected=r.get("expectedVisibleItems"),
                # recallProxy is the share of expected items found (1 = all of them), not a count.
                # What the provider reported is those matches plus its false extra markers.
                found=round((r.get("recallProxy") or 0) * (r.get("expectedVisibleItems") or 0)) + (r.get("overDetection") or 0),
                over=r.get("overDetection"),
                date=(pilot.get("generatedAt") or "")[:10],
            ))

    # 2. The stratified shadow sample (Gemini). The expected count is the PDF's own
    # embedded question markers, which is only a reliable ground truth for
    # born-digital pages, so it is recorded only there.
    manifest = load("shadow-sample/shadow-manifest.json")
    native = {}
    if manifest:
        for book in manifest["books"]:
            for sample in book["samples"]:
                native[f"{book['id']}:{sample['pageNumber']}"] = (book["profile"], sample.get("nativeQuestionMarkers"))
    shadow = load("shadow-sample/shadow-checkpoint.json")
    if shadow:
        sources.append("shadow-sample/shadow-checkpoint.json")
        for r in shadow["results"]:
            profile, markers = native.get(f"{r['bookId']}:{r['pageNumber']}", (r.get("profile"), None))
            found = (r.get("metrics") or {}).get("detectedQuestions")
            rows.append(row(
                dataset="SHADOW_SAMPLE", provider=r["provider"], profile=profile, sample=f"{r['bookId']}:{r['pageNumber']}",
                status=r["status"], latency=r.get("latencyMs"), model=r.get("model"),
                expected=markers if profile == "DIGITAL_MATH" else None, found=found,
                date=(r.get("completedAt") or "")[:10],
            ))

    # 3. Head-to-heads on the same sample pages: Mistral OCR (re-rendered pages) and OpenAI.
    for dataset, relative in [
        ("MISTRAL_HEAD_TO_HEAD", "shadow-sample-corrected/mistral-corrected-head-to-head-checkpoint.json"),
        ("OPENAI_HEAD_TO_HEAD", "shadow-sample/openai-head-to-head-checkpoint.json"),
    ]:
        data = load(relative)
        if not data:
            continue
        sources.append(relative)
        for r in data["results"]:
            metrics = r.get("metrics") or {}
            rows.append(row(
                dataset=dataset, provider=r["provider"], profile=r.get("profile"), sample=f"{r['bookId']}:{r['pageNumber']}",
                status=r["status"], latency=r.get("latencyMs"), model=r.get("model"),
                expected=r.get("nativeQuestionMarkers") if r.get("profile") == "DIGITAL_MATH" else None,
                found=metrics.get("detectedQuestionMarkers"),
                date=(r.get("completedAt") or "")[:10],
            ))

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"sources": sources, "note": "Counts, outcomes and latencies only; page images and provider output stay under .private.", "observations": rows}, indent=1), encoding="utf8")
    print(f"wrote {len(rows)} observations from {len(sources)} files to {OUT}")


if __name__ == "__main__":
    main()
