"""Regression test for render-pdf-page-batch.py. Run: python -m unittest scripts/test_render_pdf_page_batch.py"""

import importlib.util
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
spec = importlib.util.spec_from_file_location("render_batch", Path(__file__).parent / "render-pdf-page-batch.py")
render_batch = importlib.util.module_from_spec(spec)
spec.loader.exec_module(render_batch)


class RenderedPageStem(unittest.TestCase):
    def test_matches_only_pdftoppm_page_files(self):
        pattern = render_batch.RENDERED_PAGE_STEM_RE
        for stem in ("page-1", "page-007", "page-534"):
            self.assertTrue(pattern.match(stem), stem)

    def test_ignores_the_enhanced_derivative_left_by_an_earlier_page(self):
        # page-1-processed.jpg sits beside page-2.jpg in a photographed-book batch;
        # treating it as a page crashed every multi-page batch with a ValueError.
        self.assertIsNone(render_batch.RENDERED_PAGE_STEM_RE.match("page-1-processed"))


if __name__ == "__main__":
    unittest.main()
