from __future__ import annotations

import importlib.util
import sys
import unittest
from pathlib import Path

SCRIPT = Path(__file__).with_name("pred_material_rate_sync.py")
SPEC = importlib.util.spec_from_file_location("pred_material_rate_sync", SCRIPT)
assert SPEC and SPEC.loader
sync = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = sync
SPEC.loader.exec_module(sync)


class IndexParsingTests(unittest.TestCase):
    def test_fortnightly_guard_is_stable_across_a_month_boundary(self) -> None:
        anchor = sync.date(2026, 8, 17)
        self.assertTrue(sync.is_fortnightly_run_day(anchor, anchor))
        self.assertTrue(sync.is_fortnightly_run_day(sync.date(2026, 8, 31), anchor))
        self.assertTrue(sync.is_fortnightly_run_day(sync.date(2026, 9, 14), anchor))
        self.assertFalse(sync.is_fortnightly_run_day(sync.date(2026, 9, 7), anchor))

    def test_real_label_variants_and_link_styles_are_read(self) -> None:
        html = """
        <tr><td>8-August-14</td><td><a href="assets/pdf/August 2014.pdf">View</a></td></tr>
        <tr><td>10_October_2014.PDF</td><td><a href="/uploads/October.pdf">View</a></td></tr>
        <tr><td>4-April-16-copy</td><td><a href="/uploads/April.pdf">View</a></td></tr>
        <tr><td>5-May-2026</td><td><a href="/uploads/May.pdf">View</a></td></tr>
        """
        documents, unreadable = sync.parse_index(html)
        self.assertEqual([], unreadable)
        self.assertEqual(
            ["2026-05-01", "2016-04-01", "2014-10-01", "2014-08-01"],
            [document.effective_from.isoformat() for document in documents],
        )
        self.assertTrue(all(document.url.startswith(sync.SOURCE_ORIGIN) for document in documents))

    def test_unreadable_rows_are_reported_not_guessed(self) -> None:
        html = '<tr><td>unknown circular</td><td><a href="/uploads/a.pdf">View</a></td></tr>'
        documents, unreadable = sync.parse_index(html)
        self.assertEqual([], documents)
        self.assertEqual(1, len(unreadable))


class OcrExtractionTests(unittest.TestCase):
    def test_known_published_layout_maps_all_seven_materials(self) -> None:
        ocr = """
        Ordinary Portland Cement (43/53 grade) 5,100/- M.T
        Portland Pozzolana Cement 4,800/- M.T
        Portland Slag Cement 4,800/- M.T
        Steel, i.e. Angles, Channels & I-Sections 53,000/- M.T
        M.S. Plates (As per IS 2062-E250 BR) 63,000/- M.T
        Category-A Steel Major Steel Manufacturers including SAIL, VSP STEEL, TATA 56,000/- M.T
        Category-B Steel Other Steel Manufacturers like GOEL, SHYAM 50,000/- M.T
        """
        self.assertEqual(
            {
                "CEM_OPC43": 5100,
                "CEM_PPC": 4800,
                "CEM_PSC": 4800,
                "STEEL_STRUCT_SEC": 53000,
                "STEEL_STRUCT_PLATE": 63000,
                "STEEL_TMT_A": 56000,
                "STEEL_TMT_B": 50000,
            },
            sync.extract_rates(ocr),
        )

    def test_implausible_value_stops_import(self) -> None:
        ocr = """
        Ordinary Portland Cement (43/53 grade) 510/- M.T
        Portland Pozzolana Cement 4,800/- M.T
        Portland Slag Cement 4,800/- M.T
        Mild Steel Structural Steel Angles Channels 53,000/- M.T
        M.S. Plates 63,000/- M.T
        Major Steel Manufacturers 56,000/- M.T
        Other Steel Manufacturers 50,000/- M.T
        """
        with self.assertRaises(sync.SyncError):
            sync.extract_rates(ocr)

    def test_sor_year_is_read_when_present(self) -> None:
        self.assertEqual("2025-26", sync.source_sor_year("month of May-2026 of 2025-26 SoR"))


if __name__ == "__main__":
    unittest.main()
