"""Crop one pixel region out of an already-rendered book page image.

Used for pulling a figure/diagram/graph out of a page that Mathpix OCR
flagged (via its `line_data` response) as containing a non-text region, so a
Question row can store the diagram alongside its text rather than losing it.
Deliberately dumb: this script does no detection of its own, just a
bounds-clamped crop + re-encode. Region detection happens in
lib/extract-book-page.ts, which parses Mathpix's line_data coordinates
before calling this.
"""

from __future__ import annotations

import argparse
import json
import sys

from PIL import Image


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_image", help="Path to the already-rendered page image")
    parser.add_argument("output_image", help="Path to write the cropped JPEG to")
    parser.add_argument("--x", type=int, required=True, help="Left edge of the region, in source-image pixels")
    parser.add_argument("--y", type=int, required=True, help="Top edge of the region, in source-image pixels")
    parser.add_argument("--width", type=int, required=True, help="Region width, in source-image pixels")
    parser.add_argument("--height", type=int, required=True, help="Region height, in source-image pixels")
    # A tight OCR-reported box tends to clip a figure's axis labels/border —
    # a small default margin keeps the crop legible without pulling in
    # unrelated surrounding text.
    parser.add_argument("--padding", type=int, default=12, help="Pixels of margin to add on every side before clamping")
    parser.add_argument("--quality", type=int, default=90, help="JPEG quality for the saved crop")
    args = parser.parse_args()

    try:
        with Image.open(args.source_image) as source:
            image = source.convert("RGB")
            source_width, source_height = image.size

            left = args.x - args.padding
            top = args.y - args.padding
            right = args.x + args.width + args.padding
            bottom = args.y + args.height + args.padding

            # Clamp to the actual image bounds — a region derived from OCR
            # coordinates can otherwise fall (slightly) outside the image,
            # which Pillow would happily "crop" as out-of-bounds padding.
            left = max(0, min(left, source_width - 1))
            top = max(0, min(top, source_height - 1))
            right = max(left + 1, min(right, source_width))
            bottom = max(top + 1, min(bottom, source_height))

            cropped = image.crop((left, top, right, bottom))
            cropped.save(args.output_image, format="JPEG", quality=args.quality)
            width, height = cropped.size
    except Exception as error:  # noqa: BLE001 - reported to the caller as JSON, not raised
        print(json.dumps({"error": str(error)}))
        return 1

    print(json.dumps({"outputPath": args.output_image, "width": width, "height": height}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
