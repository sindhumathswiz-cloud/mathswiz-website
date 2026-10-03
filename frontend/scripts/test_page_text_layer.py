"""Unit tests for page_text_layer.py. Run: python -m unittest scripts/test_page_text_layer.py"""

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import page_text_layer as ptl  # noqa: E402


def word(text, x0, top, x1=None, bottom=None):
    return {"text": text, "x0": x0, "x1": x1 if x1 is not None else x0 + 10 * len(text), "top": top, "bottom": bottom if bottom is not None else top + 12}


class FakePage:
    width = 600.0
    height = 800.0

    def __init__(self, words, fail=False):
        self._words = words
        self._fail = fail
        self.flow_requested = None

    def extract_words(self, use_text_flow=False, keep_blank_chars=False):
        self.flow_requested = use_text_flow
        if self._fail:
            raise RuntimeError("boom")
        return self._words


class BuildTextLayer(unittest.TestCase):
    def test_words_on_one_baseline_become_one_line_with_normalised_boxes(self):
        layer = ptl.build_text_layer(FakePage([word("Evaluate", 60, 80), word("the", 150, 80), word("integral", 190, 81)]))
        self.assertEqual(len(layer["lines"]), 1)
        line = layer["lines"][0]
        self.assertEqual(line["text"], "Evaluate the integral")
        self.assertAlmostEqual(line["x"], 0.1, places=4)
        self.assertAlmostEqual(line["y"], 0.1, places=4)
        self.assertAlmostEqual(line["h"], 13 / 800, places=4)
        self.assertEqual([w[2] for w in line["words"]], ["Evaluate", "the", "integral"])
        self.assertEqual(layer["source"], "NATIVE_PDF")

    def test_a_new_baseline_starts_a_new_line(self):
        layer = ptl.build_text_layer(FakePage([word("First", 60, 80), word("line", 130, 80), word("Second", 60, 100), word("line", 140, 100)]))
        self.assertEqual([line["text"] for line in layer["lines"]], ["First line", "Second line"])

    def test_text_flow_order_is_requested_so_columns_copy_in_reading_order(self):
        page = FakePage([word("Left", 60, 80), word("column", 120, 80), word("Right", 330, 80), word("column", 400, 80)])
        layer = ptl.build_text_layer(page)
        self.assertTrue(page.flow_requested)
        self.assertEqual(len(layer["lines"]), 1)  # same baseline, left to right

    def test_a_jump_back_to_the_left_on_the_same_baseline_is_a_new_line(self):
        # Second column's first line follows the first column's last line in
        # the content stream and happens to sit at the same height.
        layer = ptl.build_text_layer(FakePage([word("end", 200, 700), word("of", 250, 700), word("column", 280, 700), word("Start", 350, 700), word("again", 60, 700)]))
        self.assertEqual([line["text"] for line in layer["lines"]], ["end of column Start", "again"])

    def test_a_page_with_almost_no_text_has_no_layer(self):
        self.assertIsNone(ptl.build_text_layer(FakePage([word("3", 300, 770)])))
        self.assertIsNone(ptl.build_text_layer(FakePage([])))

    def test_extraction_failure_returns_none_instead_of_raising(self):
        self.assertIsNone(ptl.build_text_layer(FakePage([], fail=True)))

    def test_private_use_glyphs_are_reported_as_garbled(self):
        layer = ptl.build_text_layer(FakePage([word("Solve", 60, 80), word("", 130, 80), word("now", 220, 80)]))
        self.assertGreater(layer["garbled"], 0.3)
        clean = ptl.build_text_layer(FakePage([word("Solve", 60, 80), word("the equation", 130, 80)]))
        self.assertEqual(clean["garbled"], 0.0)


if __name__ == "__main__":
    unittest.main()
