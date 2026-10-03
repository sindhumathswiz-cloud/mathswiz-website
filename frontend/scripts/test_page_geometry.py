"""Unit tests for page_geometry.py. Run: python -m unittest scripts/test_page_geometry.py"""

import math
import sys
import unittest
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).parent))
import page_geometry as pg  # noqa: E402


def marker(x, y, text="", w=0.02, h=0.012, **extra):
    return {"kind": "M", "x": x, "y": y, "width": w, "height": h, "text": text, **extra}


def word(text, x0, top, x1=None, bottom=None):
    return {"text": text, "x0": x0, "x1": x1 if x1 is not None else x0 + 20, "top": top, "bottom": bottom if bottom is not None else top + 10}


class OptionRegions(unittest.TestCase):
    def test_two_rows_of_options_become_four_regions(self):
        question = {"x": 0.05, "y": 0.10, "width": 0.9, "height": 0.2, "printedNumber": "7"}
        markers = [marker(0.06, 0.20, "(a)"), marker(0.5, 0.20, "(b)"), marker(0.06, 0.25, "(c)"), marker(0.5, 0.25, "(d)")]
        regions = pg.option_regions([question], markers)
        self.assertEqual([r["label"] for r in regions], ["A", "B", "C", "D"])
        self.assertTrue(all(r["printedNumber"] == "7" for r in regions))
        a, b, c = regions[0], regions[1], regions[2]
        self.assertLess(a["x"] + a["width"], b["x"])  # (a) stops before (b) on the same row
        self.assertLess(a["y"] + a["height"], c["y"] + 0.001)  # row 1 stops at row 2
        self.assertAlmostEqual(c["y"] + c["height"], 0.30, places=3)  # last row runs to the question end

    def test_a_lone_marker_is_not_an_option_set(self):
        question = {"x": 0.05, "y": 0.10, "width": 0.9, "height": 0.2, "printedNumber": "1"}
        self.assertEqual(pg.option_regions([question], [marker(0.06, 0.2, "(a)")]), [])

    def test_markers_outside_the_question_are_ignored(self):
        question = {"x": 0.05, "y": 0.10, "width": 0.4, "height": 0.1, "printedNumber": "1"}
        far = [marker(0.6, 0.12, "(a)"), marker(0.7, 0.12, "(b)")]
        self.assertEqual(pg.option_regions([question], far), [])


class AnswerSolutionRegions(unittest.TestCase):
    columns = [{"kind": "PAGE_COLUMN", "x": 0.04, "width": 0.92}]

    def test_answer_key_entries_are_bounded_by_the_next_number(self):
        markers = [marker(0.06, 0.10, printedNumber="1"), marker(0.06, 0.16, printedNumber="2")]
        regions = pg.answer_solution_regions([], 600, 800, "ANSWER_KEY", markers, self.columns)
        self.assertEqual([r["kind"] for r in regions], ["ANSWER_REGION_CANDIDATE"] * 2)
        self.assertAlmostEqual(regions[0]["y"] + regions[0]["height"], 0.158, places=3)
        self.assertAlmostEqual(regions[1]["y"] + regions[1]["height"], 0.95, places=3)

    def test_unnumbered_answer_page_falls_back_to_column_regions_with_lower_confidence(self):
        regions = pg.answer_solution_regions([], 600, 800, "SOLUTION", [], self.columns)
        self.assertEqual(len(regions), 1)
        self.assertEqual(regions[0]["kind"], "SOLUTION_REGION_CANDIDATE")
        self.assertLessEqual(regions[0]["confidence"], 0.5)

    def test_sol_label_on_a_question_page_is_attributed_to_the_preceding_question(self):
        markers = [marker(0.06, 0.10, printedNumber="3"), marker(0.06, 0.60, printedNumber="4")]
        words = [word("Sol.", 40, 400), word("Ans:", 40, 300)]
        regions = pg.answer_solution_regions(words, 600, 800, "QUESTION", markers, self.columns)
        kinds = {r["kind"]: r for r in regions}
        self.assertEqual(kinds["SOLUTION_REGION_CANDIDATE"]["printedNumber"], "3")
        self.assertEqual(kinds["ANSWER_REGION_CANDIDATE"]["printedNumber"], "3")
        # the answer region ends where the solution label starts
        self.assertLess(kinds["ANSWER_REGION_CANDIDATE"]["y"] + kinds["ANSWER_REGION_CANDIDATE"]["height"], 0.51)
        # the solution region ends at the next question
        self.assertAlmostEqual(kinds["SOLUTION_REGION_CANDIDATE"]["y"] + kinds["SOLUTION_REGION_CANDIDATE"]["height"], 0.598, places=3)


def blank(width=700, height=990):
    return np.full((height, width), 255, dtype=np.uint8)


def draw_table(page, x0, y0, x1, y1, rows=4, cols=3):
    for r in range(rows + 1):
        y = y0 + (y1 - y0) * r // rows
        page[y:y + 2, x0:x1] = 0
    for c in range(cols + 1):
        x = x0 + (x1 - x0) * c // cols
        page[y0:y1 + 2, x:x + 2] = 0


def draw_text_lines(page, y_start, count, x0=60, x1=640, gap=26):
    """Dashed bars standing in for text lines (gaps between lines, broken horizontally)."""
    for i in range(count):
        y = y_start + i * gap
        for x in range(x0, x1, 18):
            page[y:y + 9, x:x + 12] = 0


def draw_graph(page, x0, y0, x1, y1):
    midx, midy = (x0 + x1) // 2, (y0 + y1) // 2
    page[midy:midy + 2, x0:x1] = 0  # x axis
    page[y0:y1, midx:midx + 2] = 0  # y axis
    for x in range(x0 + 4, x1 - 4):
        y = int(midy - (y1 - y0) * 0.35 * math.sin((x - x0) / (x1 - x0) * 2 * math.pi))
        page[y - 1:y + 2, x] = 0


class RasterRegions(unittest.TestCase):
    def test_ruled_grid_is_a_table_not_a_figure(self):
        page = blank()
        draw_table(page, 100, 300, 600, 500)
        kinds = [r["kind"] for r in pg.raster_regions(page, pg.profile_settings("IMAGE_BOOK"))]
        self.assertIn("TABLE_REGION_CANDIDATE", kinds)
        self.assertNotIn("FIGURE_REGION_CANDIDATE", kinds)
        self.assertNotIn("GRAPH_REGION_CANDIDATE", kinds)

    def test_table_and_graph_on_the_same_page_are_told_apart(self):
        page = blank()
        draw_table(page, 100, 200, 600, 400)
        draw_graph(page, 150, 500, 550, 760)
        regions = pg.raster_regions(page, pg.profile_settings('IMAGE_BOOK'))
        kinds = sorted(r['kind'] for r in regions)
        self.assertEqual(kinds, ['GRAPH_REGION_CANDIDATE', 'TABLE_REGION_CANDIDATE'])
        table = next(r for r in regions if r['kind'] == 'TABLE_REGION_CANDIDATE')
        self.assertLess(table['y'] + table['height'], 0.45)  # the graph's x-axis is not chained into the table

    def test_thin_rules_survive_the_downscale_of_a_large_scan(self):
        page = blank(1400, 1980)
        draw_table(page, 200, 400, 1200, 800)
        # one-pixel rules: a strided downscale would drop them half the time
        regions = pg.raster_regions(page, pg.profile_settings('IMAGE_BOOK'))
        self.assertIn('TABLE_REGION_CANDIDATE', [r['kind'] for r in regions])

    def test_axes_plus_curve_is_a_graph(self):
        page = blank()
        draw_graph(page, 150, 300, 550, 560)
        regions = pg.raster_regions(page, pg.profile_settings("IMAGE_BOOK"))
        graphs = [r for r in regions if r["kind"] == "GRAPH_REGION_CANDIDATE"]
        self.assertEqual(len(graphs), 1)
        g = graphs[0]
        self.assertLess(abs(g["x"] - 150 / 700), 0.03)
        self.assertLess(abs(g["y"] - 300 / 990), 0.03)

    def test_plain_text_lines_produce_no_figure(self):
        page = blank()
        draw_text_lines(page, 100, 25)
        self.assertEqual(pg.raster_regions(page, pg.profile_settings("IMAGE_BOOK")), [])

    def test_photographed_profile_ignores_the_outer_margin(self):
        page = blank()
        draw_graph(page, 5, 300, 95, 560)  # a "finger/background" blob hugging the left edge
        self.assertEqual(pg.raster_regions(page, pg.profile_settings("PHOTOGRAPHED_BOOK")), [])

    def test_photographed_confidence_is_lower_than_image_book(self):
        page = blank()
        draw_graph(page, 150, 300, 550, 560)
        image_conf = pg.raster_regions(page, pg.profile_settings("IMAGE_BOOK"))[0]["confidence"]
        photo_conf = pg.raster_regions(page, pg.profile_settings("PHOTOGRAPHED_BOOK"))[0]["confidence"]
        self.assertLess(photo_conf, image_conf)

    def test_empty_page(self):
        self.assertEqual(pg.raster_regions(blank(), pg.profile_settings("IMAGE_BOOK")), [])


class FakeTable:
    def __init__(self, bbox, rows, cols):
        self.bbox = bbox
        self.rows = [type("Row", (), {"cells": [None] * cols})() for _ in range(rows)]


class FakePage:
    width, height = 600.0, 800.0

    def __init__(self, tables=(), images=(), curves=(), lines=(), rects=()):
        self._tables, self.images, self.curves, self.lines, self.rects = list(tables), list(images), list(curves), list(lines), list(rects)

    def find_tables(self):
        return self._tables


def obj(x0, top, x1, bottom):
    return {"x0": x0, "x1": x1, "top": top, "bottom": bottom}


class NativeRegions(unittest.TestCase):
    def test_ruled_table_is_reported_with_its_shape(self):
        page = FakePage(tables=[FakeTable((60, 200, 540, 400), 4, 3)])
        regions = pg.native_table_regions(page, 1.0)
        self.assertEqual(len(regions), 1)
        self.assertEqual((regions[0]["rows"], regions[0]["columns"]), (4, 3))

    def test_single_cell_box_is_not_a_table(self):
        self.assertEqual(pg.native_table_regions(FakePage(tables=[FakeTable((60, 200, 540, 400), 1, 1)]), 1.0), [])

    def test_embedded_image_is_a_figure_but_a_full_page_scan_is_not(self):
        settings = pg.profile_settings("DIGITAL_MATH")
        figure = pg.native_graphic_regions(FakePage(images=[obj(100, 300, 400, 500)]), [], settings)
        self.assertEqual([r["kind"] for r in figure], ["FIGURE_REGION_CANDIDATE"])
        scan = pg.native_graphic_regions(FakePage(images=[obj(0, 0, 600, 800)]), [], settings)
        self.assertEqual(scan, [])

    def test_curve_with_axes_is_a_graph(self):
        page = FakePage(
            lines=[obj(100, 400, 400, 401), obj(250, 250, 251, 550)],
            curves=[obj(110, 300, 390, 500), obj(120, 320, 380, 480)],
        )
        regions = pg.native_graphic_regions(page, [], pg.profile_settings("DIGITAL_MATH"))
        self.assertEqual([r["kind"] for r in regions], ["GRAPH_REGION_CANDIDATE"])

    def test_single_path_curve_with_two_axes_is_a_graph(self):
        page = FakePage(lines=[obj(100, 400, 400, 401), obj(250, 250, 251, 550)], curves=[obj(100, 330, 400, 470)])
        regions = pg.native_graphic_regions(page, [], pg.profile_settings("DIGITAL_MATH"))
        self.assertEqual([r["kind"] for r in regions], ["GRAPH_REGION_CANDIDATE"])

    def test_page_wide_rules_are_not_figures(self):
        page = FakePage(lines=[obj(0, 100, 600, 101), obj(0, 700, 600, 701), obj(0, 300, 600, 301), obj(0, 400, 600, 401)])
        self.assertEqual(pg.native_graphic_regions(page, [], pg.profile_settings("DIGITAL_MATH")), [])

    def test_primitives_inside_a_table_do_not_become_a_figure(self):
        table_region = pg.native_table_regions(FakePage(tables=[FakeTable((60, 200, 540, 400), 4, 3)]), 1.0)
        inner = [obj(70 + i * 40, 210, 100 + i * 40, 390) for i in range(6)]
        page = FakePage(lines=inner)
        self.assertEqual(pg.native_graphic_regions(page, table_region, pg.profile_settings("DIGITAL_MATH")), [])


class AnswerMarkersAreNotOptions(unittest.TestCase):
    def test_a_marker_on_the_answer_line_is_excluded_from_option_regions(self):
        page = FakePage()
        question = {"kind": "QUESTION_REGION_CANDIDATE", "x": 0.05, "y": 0.10, "width": 0.9, "height": 0.3, "printedNumber": "1"}
        options = [marker(0.06, 0.15, "(a)"), marker(0.5, 0.15, "(b)"), marker(0.06, 0.18, "(c)"), marker(0.5, 0.18, "(d)"),
                   marker(0.15, 0.25, "(a)")]  # the "(a)" in "Ans: (a)"
        words = [word("Ans:", 40, 0.25 * 800)]
        regions, _ = pg.detect_geometry(
            profile="DIGITAL_MATH", plumber_page=page, gray=None, page_type="QUESTION", native_characters=500,
            question_regions=[question], question_markers=[marker(0.06, 0.10, printedNumber="1")], option_markers=options,
            columns=[{"kind": "PAGE_COLUMN", "x": 0.04, "width": 0.92}], words=words,
        )
        labels = [r["label"] for r in regions if r["kind"] == "OPTION_REGION_CANDIDATE"]
        self.assertEqual(labels, ["A", "B", "C", "D"])
        self.assertTrue(any(r["kind"] == "ANSWER_REGION_CANDIDATE" for r in regions))


class ProfileRouting(unittest.TestCase):
    def test_raster_policy_per_profile(self):
        digital, mixed = pg.profile_settings("DIGITAL_MATH"), pg.profile_settings("MIXED_LAYOUT_ASSESSMENT")
        self.assertFalse(pg.should_use_raster(digital, 0))
        self.assertTrue(pg.should_use_raster(mixed, 10))
        self.assertFalse(pg.should_use_raster(mixed, 5000))
        self.assertTrue(pg.should_use_raster(pg.profile_settings("IMAGE_BOOK"), 5000))
        self.assertTrue(pg.should_use_raster(pg.profile_settings("PHOTOGRAPHED_BOOK"), 5000))

    def test_unknown_profile_defaults_to_digital(self):
        self.assertEqual(pg.profile_settings("???"), pg.PROFILES["DIGITAL_MATH"])

    def test_native_regions_win_over_raster_in_detect_geometry(self):
        page = blank()
        draw_graph(page, 150, 300, 550, 560)
        native = FakePage(images=[obj(100, 300, 400, 500)])  # overlaps the raster graph
        settings_profile = "MIXED_LAYOUT_ASSESSMENT"
        regions, detectors = pg.detect_geometry(
            profile=settings_profile, plumber_page=native, gray=page, page_type="QUESTION", native_characters=10,
            question_regions=[], question_markers=[], option_markers=[], columns=[], words=[],
        )
        self.assertIn("native-graphics", detectors)
        figures = [r for r in regions if r["kind"] in {"FIGURE_REGION_CANDIDATE", "GRAPH_REGION_CANDIDATE"}]
        self.assertEqual(len(figures), 1)
        self.assertIn("native", figures[0]["evidence"])


if __name__ == "__main__":
    unittest.main()
