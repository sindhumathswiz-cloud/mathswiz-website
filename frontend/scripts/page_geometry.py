"""Profile-specific geometry detection for page regions.

All coordinates are normalised to the page (0-1, origin top-left), matching
the regions render-pdf-page-batch.py already emits. Detectors are
deliberately conservative: a region is only emitted when the page gives
positive geometric evidence for it, and every region carries a confidence
and an evidence string so a reviewer can see why it exists.

Region kinds added here (alongside the existing QUESTION_REGION_CANDIDATE
and OPTION_MARKER_CANDIDATE):

  OPTION_REGION_CANDIDATE    box around one answer option (a)-(d)
  ANSWER_REGION_CANDIDATE    box around a printed answer / answer-key entry
  SOLUTION_REGION_CANDIDATE  box around a printed solution / entry
  FIGURE_REGION_CANDIDATE    box around a diagram or picture
  GRAPH_REGION_CANDIDATE     box around a plotted graph (axes + curve)
  TABLE_REGION_CANDIDATE     box around a ruled table

Profiles differ in where the evidence comes from:

  DIGITAL_MATH             native PDF objects only (words, images, vector
                           graphics, ruled tables). Highest confidence.
  MIXED_LAYOUT_ASSESSMENT  native first; raster analysis only for pages whose
                           text layer is too sparse (image-rendered pages).
  IMAGE_BOOK               raster analysis (no text layer to trust).
  PHOTOGRAPHED_BOOK        raster analysis with the outer margin ignored
                           (fingers, adjacent pages, background) and lower
                           confidence, since skew and shadows add noise.
"""

from __future__ import annotations

import re
from collections import deque

import numpy as np

ANSWER_WORD_RE = re.compile(r"^(?:ans(?:wers?)?|key)[.:]?$", re.I)
SOLUTION_WORD_RE = re.compile(r"^(?:sol(?:ution)?s?)[.:]?$", re.I)
OPTION_LABEL_RE = re.compile(r"^\(?([a-dA-D])[.)]?\)?$")

PROFILES = {
    "DIGITAL_MATH": {"native": True, "raster": "never", "margin": 0.0, "confidence": 1.0, "min_figure_height": 0.04},
    "MIXED_LAYOUT_ASSESSMENT": {"native": True, "raster": "sparse_text", "margin": 0.0, "confidence": 0.95, "min_figure_height": 0.04},
    "IMAGE_BOOK": {"native": False, "raster": "always", "margin": 0.02, "confidence": 0.85, "min_figure_height": 0.05},
    "PHOTOGRAPHED_BOOK": {"native": False, "raster": "always", "margin": 0.06, "confidence": 0.7, "min_figure_height": 0.06},
}
SPARSE_TEXT_CHARACTERS = 80


def profile_settings(profile: str) -> dict:
    return PROFILES.get(profile, PROFILES["DIGITAL_MATH"])


def _box(kind: str, x0: float, y0: float, x1: float, y1: float, confidence: float, evidence: str, **extra) -> dict:
    x0, y0 = max(0.0, x0), max(0.0, y0)
    x1, y1 = min(1.0, x1), min(1.0, y1)
    region = {
        "kind": kind,
        "x": round(x0, 5),
        "y": round(y0, 5),
        "width": round(max(0.0, x1 - x0), 5),
        "height": round(max(0.0, y1 - y0), 5),
        "confidence": round(confidence, 3),
        "evidence": evidence,
    }
    region.update(extra)
    return region


def _bounds(region: dict) -> tuple[float, float, float, float]:
    return (
        float(region["x"]),
        float(region["y"]),
        float(region["x"]) + float(region["width"]),
        float(region["y"]) + float(region["height"]),
    )


def _overlap_ratio(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    """Intersection area as a fraction of the smaller box."""
    # Pad by a hair so hairline boxes (a ruled line has zero height) still
    # register containment instead of dividing by a zero area.
    pad = 0.0005
    a = (a[0] - pad, a[1] - pad, a[2] + pad, a[3] + pad)
    b = (b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad)
    ix = max(0.0, min(a[2], b[2]) - max(a[0], b[0]))
    iy = max(0.0, min(a[3], b[3]) - max(a[1], b[1]))
    smaller = min((a[2] - a[0]) * (a[3] - a[1]), (b[2] - b[0]) * (b[3] - b[1]))
    return (ix * iy) / smaller if smaller > 0 else 0.0


def _column_for(center_x: float, columns: list[dict]) -> dict:
    for column in columns:
        if column.get("kind") == "PAGE_COLUMN" and float(column["x"]) <= center_x <= float(column["x"]) + float(column["width"]):
            return column
    return {"x": 0.04, "width": 0.92}


# --------------------------------------------------------------------------
# Option regions: one box per option, from the marker to the next option on
# the row (or the column edge), down to the next option row (or the end of
# the owning question).
# --------------------------------------------------------------------------

def option_regions(question_regions: list[dict], option_markers: list[dict]) -> list[dict]:
    regions: list[dict] = []
    for question in question_regions:
        qx0, qy0, qx1, qy1 = _bounds(question)
        owned = []
        for marker in option_markers:
            mx = float(marker["x"]) + float(marker["width"]) / 2
            my = float(marker["y"]) + float(marker["height"]) / 2
            if qx0 <= mx <= qx1 and qy0 <= my <= qy1:
                owned.append(marker)
        if len(owned) < 2:
            continue  # a lone "(a)" is not an option set
        owned.sort(key=lambda m: (round(float(m["y"]), 2), float(m["x"])))
        rows: list[list[dict]] = []
        for marker in owned:
            if rows and abs(float(marker["y"]) - float(rows[-1][0]["y"])) <= 0.012:
                rows[-1].append(marker)
            else:
                rows.append([marker])
        for row_index, row in enumerate(rows):
            row.sort(key=lambda m: float(m["x"]))
            next_row_top = min(float(m["y"]) for m in rows[row_index + 1]) if row_index + 1 < len(rows) else None
            bottom = (next_row_top - 0.002) if next_row_top is not None else qy1
            for index, marker in enumerate(row):
                left = float(marker["x"])
                right = float(row[index + 1]["x"]) - 0.004 if index + 1 < len(row) else qx1
                regions.append(_box(
                    "OPTION_REGION_CANDIDATE", left, float(marker["y"]) - 0.002, right, bottom, 0.7,
                    "option marker row inside a detected question region",
                    printedNumber=question.get("printedNumber"), label=str(marker.get("text", "")).strip("().").upper(),
                ))
    return regions


# --------------------------------------------------------------------------
# Answer / solution regions.
# --------------------------------------------------------------------------

def answer_solution_regions(
    words: list[dict], page_width: float, page_height: float, page_type: str,
    question_markers: list[dict], columns: list[dict],
) -> list[dict]:
    regions: list[dict] = []
    page_columns = [c for c in columns if c.get("kind") == "PAGE_COLUMN"] or [{"x": 0.04, "width": 0.92}]

    def column_markers(column: dict) -> list[dict]:
        cx0, cx1 = float(column["x"]), float(column["x"]) + float(column["width"])
        return sorted(
            (m for m in question_markers if cx0 <= float(m["x"]) <= cx1),
            key=lambda m: float(m["y"]),
        )

    if page_type in {"ANSWER_KEY", "SOLUTION"}:
        kind = "ANSWER_REGION_CANDIDATE" if page_type == "ANSWER_KEY" else "SOLUTION_REGION_CANDIDATE"
        found_entries = False
        for column in page_columns:
            markers = column_markers(column)
            for index, marker in enumerate(markers):
                bottom = float(markers[index + 1]["y"]) - 0.002 if index + 1 < len(markers) else 0.95
                top = max(0.0, float(marker["y"]) - 0.004)
                if bottom - top < 0.008:
                    continue
                found_entries = True
                regions.append(_box(
                    kind, float(column["x"]), top, float(column["x"]) + float(column["width"]), bottom, 0.7,
                    f"{page_type.lower().replace('_', ' ')} entry bounded by printed numbers", printedNumber=marker.get("printedNumber"),
                ))
        if not found_entries:
            for column in page_columns:
                regions.append(_box(
                    kind, float(column["x"]), 0.04, float(column["x"]) + float(column["width"]), 0.95, 0.5,
                    f"{page_type.lower().replace('_', ' ')} page with no numbered entries", printedNumber=None,
                ))
        return regions

    labels = []
    for word in words:
        token = str(word.get("text", "")).strip()
        if ANSWER_WORD_RE.match(token):
            labels.append(("ANSWER_REGION_CANDIDATE", word))
        elif SOLUTION_WORD_RE.match(token):
            labels.append(("SOLUTION_REGION_CANDIDATE", word))
    label_tops = sorted(float(w["top"]) / page_height for _, w in labels)
    for kind, word in labels:
        center_x = ((float(word["x0"]) + float(word["x1"])) / 2) / page_width
        top = float(word["top"]) / page_height
        column = _column_for(center_x, page_columns)
        cx0, cx1 = float(column["x"]), float(column["x"]) + float(column["width"])
        following = [float(m["y"]) for m in question_markers if cx0 <= float(m["x"]) <= cx1 and float(m["y"]) > top + 0.004]
        following += [t for t in label_tops if t > top + 0.004]
        bottom = min(following, default=0.95) - 0.002
        if bottom - top < 0.008:
            continue
        preceding = [m for m in question_markers if cx0 <= float(m["x"]) <= cx1 and float(m["y"]) <= top]
        owner = max(preceding, key=lambda m: float(m["y"])) if preceding else None
        regions.append(_box(
            kind, cx0, max(0.0, top - 0.003), cx1, bottom, 0.7,
            "printed 'Ans'/'Sol' label bounded by the next label or question number",
            printedNumber=owner.get("printedNumber") if owner else None,
        ))
    return regions


# --------------------------------------------------------------------------
# Native graphics: embedded images, vector drawings and ruled tables.
# --------------------------------------------------------------------------

def _cluster(boxes: list[tuple[float, float, float, float]], gap: float) -> list[tuple[tuple[float, float, float, float], int]]:
    """Merge boxes that overlap once each is grown by `gap`. Returns (box, member_count)."""
    items = [(list(b), 1) for b in boxes]
    changed = True
    while changed:
        changed = False
        merged: list[tuple[list[float], int]] = []
        for box, count in items:
            for index, (other, other_count) in enumerate(merged):
                if (box[0] - gap <= other[2] and other[0] - gap <= box[2] and box[1] - gap <= other[3] and other[1] - gap <= box[3]):
                    merged[index] = ([min(box[0], other[0]), min(box[1], other[1]), max(box[2], other[2]), max(box[3], other[3])], count + other_count)
                    changed = True
                    break
            else:
                merged.append((box, count))
        items = merged
    return [((b[0], b[1], b[2], b[3]), c) for b, c in items]


def _norm(obj: dict, width: float, height: float) -> tuple[float, float, float, float]:
    return (float(obj["x0"]) / width, float(obj["top"]) / height, float(obj["x1"]) / width, float(obj["bottom"]) / height)


def native_table_regions(plumber_page, confidence_scale: float) -> list[dict]:
    try:
        tables = plumber_page.find_tables()
    except Exception:
        return []
    regions = []
    for table in tables:
        x0, top, x1, bottom = table.bbox
        box = (x0 / plumber_page.width, top / plumber_page.height, x1 / plumber_page.width, bottom / plumber_page.height)
        rows = len(table.rows)
        cols = max((len(row.cells) for row in table.rows), default=0)
        area = (box[2] - box[0]) * (box[3] - box[1])
        if rows < 2 or cols < 2 or area > 0.9 or area < 0.004:
            continue
        regions.append(_box("TABLE_REGION_CANDIDATE", *box, 0.85 * confidence_scale, f"ruled table, {rows} rows x {cols} columns (native)", rows=rows, columns=cols))
    return regions


def native_graphic_regions(plumber_page, table_regions: list[dict], settings: dict) -> list[dict]:
    width, height = float(plumber_page.width), float(plumber_page.height)
    scale = settings["confidence"]
    table_bounds = [_bounds(t) for t in table_regions]
    regions: list[dict] = []

    for image in getattr(plumber_page, "images", None) or []:
        box = _norm(image, width, height)
        area = (box[2] - box[0]) * (box[3] - box[1])
        if area >= 0.85 or area < 0.008:
            continue  # a page-sized image is the scanned page itself, not a figure on it
        regions.append(_box("FIGURE_REGION_CANDIDATE", *box, 0.8 * scale, "embedded image (native)"))

    def outside_tables(box):
        return all(_overlap_ratio(box, t) < 0.5 for t in table_bounds)

    primitives: list[tuple[float, float, float, float]] = []
    curve_count = 0
    line_count = 0
    for curve in getattr(plumber_page, "curves", None) or []:
        box = _norm(curve, width, height)
        if outside_tables(box):
            primitives.append(box)
            curve_count += 1
    for line in getattr(plumber_page, "lines", None) or []:
        box = _norm(line, width, height)
        span_w, span_h = box[2] - box[0], box[3] - box[1]
        if (span_h < 0.004 and span_w > 0.85) or (span_w < 0.004 and span_h > 0.85):
            continue  # page-wide rules and borders
        if outside_tables(box):
            primitives.append(box)
            line_count += 1
    for rect in getattr(plumber_page, "rects", None) or []:
        box = _norm(rect, width, height)
        span_w, span_h = box[2] - box[0], box[3] - box[1]
        if span_w * span_h > 0.5 or not outside_tables(box):
            continue
        primitives.append(box)

    for box, members in _cluster(primitives, 0.012):
        area = (box[2] - box[0]) * (box[3] - box[1])
        if area < 0.01 or area > 0.6 or (box[3] - box[1]) < settings["min_figure_height"]:
            continue
        inside_curves = sum(1 for c in (getattr(plumber_page, "curves", None) or []) if _overlap_ratio(_norm(c, width, height), box) > 0.9)
        inside_lines = sum(1 for l in (getattr(plumber_page, "lines", None) or []) if _overlap_ratio(_norm(l, width, height), box) > 0.9)
        is_graph = inside_curves >= 1 and inside_lines >= 2
        # A plotted curve is often ONE path object, so two axes + one curve
        # is already a graph; anything else needs several primitives to count.
        if members < 4 and not is_graph:
            continue
        regions.append(_box(
            "GRAPH_REGION_CANDIDATE" if is_graph else "FIGURE_REGION_CANDIDATE", *box,
            (0.72 if is_graph else 0.65) * scale,
            f"vector drawing: {inside_curves} curve(s), {inside_lines} line(s), {members} primitives (native)",
        ))
    return regions


# --------------------------------------------------------------------------
# Raster analysis (image-rendered and photographed pages). numpy only.
# --------------------------------------------------------------------------

def _runs(binary: np.ndarray, axis: int, min_length: int) -> list[tuple[int, int, int]]:
    """Rows (axis=1) or columns (axis=0) holding a straight ink run >= min_length.
    Returns (index, start, end) of the longest run on each qualifying line."""
    lines = binary if axis == 1 else binary.T
    found = []
    for index in range(lines.shape[0]):
        row = lines[index]
        if row.sum() < min_length:
            continue
        padded = np.concatenate(([0], row.astype(np.int8), [0]))
        diff = np.diff(padded)
        starts, ends = np.where(diff == 1)[0], np.where(diff == -1)[0]
        lengths = ends - starts
        if len(lengths) and lengths.max() >= min_length:
            best = int(lengths.argmax())
            found.append((index, int(starts[best]), int(ends[best])))
    return found


def _group_indices(indices: list[int], gap: int) -> list[list[int]]:
    groups: list[list[int]] = []
    for value in sorted(indices):
        if groups and value - groups[-1][-1] <= gap:
            groups[-1].append(value)
        else:
            groups.append([value])
    return groups


def _continues_into_margin(raw_ink: np.ndarray, box: tuple[int, int, int, int], mx: int, my: int, cell: int) -> bool:
    x0, y0, x1, y1 = box
    height, width = raw_ink.shape
    if x0 <= mx + cell and mx > 0 and raw_ink[y0:y1, max(0, mx - cell):mx].any():
        return True
    if x1 >= width - mx - cell and mx > 0 and raw_ink[y0:y1, width - mx:min(width, width - mx + cell)].any():
        return True
    if y0 <= my + cell and my > 0 and raw_ink[max(0, my - cell):my, x0:x1].any():
        return True
    if y1 >= height - my - cell and my > 0 and raw_ink[height - my:min(height, height - my + cell), x0:x1].any():
        return True
    return False


def raster_regions(gray: np.ndarray, settings: dict, page_type: str = "CONTENT") -> list[dict]:
    """Detect tables (ruled grids), graphs (axes + ink) and figures (dense
    non-text blobs) from a grayscale page image."""
    if gray.ndim != 2 or gray.size == 0:
        return []
    height, width = gray.shape
    scale_factor = min(1.0, 700 / width)
    if scale_factor < 1.0:
        # Darkest-pixel pooling, not striding: 1px rules and axes must survive the downscale.
        step = max(1, round(1 / scale_factor))
        cropped_h, cropped_w = (height // step) * step, (width // step) * step
        gray = gray[:cropped_h, :cropped_w].reshape(cropped_h // step, step, cropped_w // step, step).min(axis=(1, 3))
        height, width = gray.shape
    ink = gray < 190
    margin = settings["margin"]
    raw_ink = ink.copy()
    mx = my = 0
    if margin:
        mx, my = int(width * margin), int(height * margin)
        ink[:my, :] = False
        ink[height - my:, :] = False
        ink[:, :mx] = False
        ink[:, width - mx:] = False
    confidence = settings["confidence"]
    regions: list[dict] = []

    # --- ruled tables: >=3 long horizontal rules and >=2 long vertical rules
    h_lines = _runs(ink, 1, int(width * 0.3))
    v_lines = _runs(ink, 0, int(height * 0.08))
    h_groups = _group_indices([i for i, _, _ in h_lines], 2)
    # One (top, bottom, left, right) per horizontal rule. A page can hold a
    # table and a graph axis at once, so rules are chained into a table only
    # while they stay vertically close and share the same left/right extent.
    rules = []
    for group in h_groups:
        members = [(s, e) for i, s, e in h_lines if i in group]
        rules.append((group[0], group[-1], int(np.median([m[0] for m in members])), int(np.median([m[1] for m in members]))))
    sequences: list[list[tuple[int, int, int, int]]] = []
    for rule in rules:
        last = sequences[-1][-1] if sequences else None
        if last and abs(rule[2] - last[2]) <= 0.03 * width and abs(rule[3] - last[3]) <= 0.03 * width and rule[0] - last[1] <= 0.1 * height:
            sequences[-1].append(rule)
        else:
            sequences.append([rule])
    table_boxes: list[tuple[float, float, float, float]] = []
    for sequence in sequences:
        if len(sequence) < 3:
            continue
        top_y, bottom_y = sequence[0][0], sequence[-1][1]
        left_edge, right_edge = min(r[2] for r in sequence), max(r[3] for r in sequence)
        spanning = [c for c, s, e in v_lines if s <= top_y + 3 and e >= bottom_y - 3 and left_edge - 3 <= c <= right_edge + 3]
        v_groups = _group_indices(spanning, 2)
        if len(v_groups) < 2:
            continue
        left_x, right_x = v_groups[0][0], v_groups[-1][-1]
        box = (left_x / width, top_y / height, (right_x + 1) / width, (bottom_y + 1) / height)
        area = (box[2] - box[0]) * (box[3] - box[1])
        if 0.01 <= area <= 0.9:
            table_boxes.append(box)
            regions.append(_box(
                "TABLE_REGION_CANDIDATE", *box, 0.72 * confidence,
                f"ruled grid: {len(sequence)} horizontal x {len(v_groups)} vertical rules (raster)",
                rows=len(sequence) - 1, columns=len(v_groups) - 1,
            ))

    # --- figures / graphs: coarse-cell connected components that are tall,
    # wide, and ink-dense on almost every row (text paragraphs have gaps).
    cell = 8
    gh, gw = height // cell, width // cell
    if gh < 4 or gw < 4:
        return regions
    cells = ink[: gh * cell, : gw * cell].reshape(gh, cell, gw, cell).any(axis=(1, 3))
    visited = np.zeros_like(cells, dtype=bool)
    min_height = settings["min_figure_height"]
    for sy in range(gh):
        for sx in range(gw):
            if not cells[sy, sx] or visited[sy, sx]:
                continue
            queue = deque([(sy, sx)])
            visited[sy, sx] = True
            members = []
            while queue:
                y, x = queue.popleft()
                members.append((y, x))
                for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if 0 <= ny < gh and 0 <= nx < gw and cells[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        queue.append((ny, nx))
            ys = [m[0] for m in members]
            xs = [m[1] for m in members]
            y0, y1, x0, x1 = min(ys), max(ys) + 1, min(xs), max(xs) + 1
            box = (x0 * cell / width, y0 * cell / height, x1 * cell / width, y1 * cell / height)
            box_height, box_width = box[3] - box[1], box[2] - box[0]
            if box_height < min_height or box_width < 0.08 or box_height * box_width > 0.6:
                continue
            if any(_overlap_ratio(box, t) > 0.5 for t in table_boxes):
                continue
            if margin and _continues_into_margin(raw_ink, (x0 * cell, y0 * cell, x1 * cell, y1 * cell), mx, my, cell):
                continue  # clipped by the ignored margin: a finger, shadow or neighbouring page, not a figure
            sub = ink[y0 * cell: y1 * cell, x0 * cell: x1 * cell]
            row_coverage = float(sub.any(axis=1).mean())
            column_coverage = float(sub.any(axis=0).mean())
            fill = len(members) / float((y1 - y0) * (x1 - x0))
            if row_coverage < 0.85 or column_coverage < 0.6 or fill > 0.65:
                continue
            long_h = _runs(sub, 1, int(sub.shape[1] * 0.6))
            long_v = _runs(sub, 0, int(sub.shape[0] * 0.6))
            is_graph = bool(long_h) and bool(long_v)
            regions.append(_box(
                "GRAPH_REGION_CANDIDATE" if is_graph else "FIGURE_REGION_CANDIDATE", *box,
                (0.6 if is_graph else 0.55) * confidence,
                "ink-dense non-text block" + (" with axis-like straight lines" if is_graph else "") + " (raster)",
            ))
    return regions


# --------------------------------------------------------------------------
# Orchestration.
# --------------------------------------------------------------------------

def should_use_raster(settings: dict, native_characters: int) -> bool:
    mode = settings["raster"]
    if mode == "always":
        return True
    if mode == "sparse_text":
        return native_characters < SPARSE_TEXT_CHARACTERS
    return False


def detect_geometry(
    *, profile: str, plumber_page, gray: np.ndarray | None, page_type: str, native_characters: int,
    question_regions: list[dict], question_markers: list[dict], option_markers: list[dict],
    columns: list[dict], words: list[dict],
) -> tuple[list[dict], list[str]]:
    """Returns (regions, detectors_used)."""
    settings = profile_settings(profile)
    regions: list[dict] = []
    detectors: list[str] = []

    # "(a)" inside an "Ans: (a)" line is an answer, not an option: find the
    # answer/solution boxes first and keep their markers out of the option set.
    answer_boxes: list[dict] = []
    if plumber_page is not None and words:
        answer_boxes = answer_solution_regions(words, float(plumber_page.width), float(plumber_page.height), page_type, question_markers, columns)
    answer_bounds = [_bounds(r) for r in answer_boxes]
    option_markers = [
        m for m in option_markers
        if not any(b[0] <= float(m["x"]) + float(m["width"]) / 2 <= b[2] and b[1] <= float(m["y"]) + float(m["height"]) / 2 <= b[3] for b in answer_bounds)
    ]

    if question_regions:
        owned = option_regions(question_regions, option_markers)
        if owned:
            regions += owned
            detectors.append("option-rows")

    if answer_boxes:
        regions += answer_boxes
        detectors.append("answer-solution-markers")

    graphics: list[dict] = []
    if settings["native"] and plumber_page is not None:
        tables = native_table_regions(plumber_page, settings["confidence"])
        graphics += tables + native_graphic_regions(plumber_page, tables, settings)
        if graphics:
            detectors.append("native-graphics")
    if gray is not None and should_use_raster(settings, native_characters):
        found = raster_regions(gray, settings, page_type)
        # Native evidence wins; raster only fills in what native found nowhere.
        existing = [_bounds(r) for r in graphics]
        found = [r for r in found if all(_overlap_ratio(_bounds(r), e) < 0.5 for e in existing)]
        if found:
            graphics += found
            detectors.append("raster-analysis")
    return regions + graphics, detectors
