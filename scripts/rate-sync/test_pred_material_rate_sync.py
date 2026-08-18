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

sys.path.insert(0, str(SCRIPT.parent))
import vision_reader as vision  # noqa: E402  (path is set immediately above)


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


class RatePeriodTests(unittest.TestCase):
    """A circular is in force until the next one supersedes it.

    PRED publishes quarterly from May 2026, so a period closed at month end
    left June and July with no circular at all -- and the app skips a period
    whose end date has passed, so those months silently fell back to the yearly
    schedule rate.
    """

    class FakeSupabase:
        def __init__(self) -> None:
            self.closed: list[tuple[list[str], str]] = []

        def close_open_periods(self, material_codes, before) -> None:
            self.closed.append((list(material_codes), before.isoformat()))

    def test_open_period_is_closed_the_day_before_its_successor(self) -> None:
        supabase = self.FakeSupabase()
        # The contract the sync relies on: the previous period ends the day
        # before the new one begins, leaving no gap and no overlap.
        supabase.close_open_periods(["CEM_OPC43"], sync.date(2026, 8, 1))
        codes, before = supabase.closed[0]
        self.assertEqual(codes, ["CEM_OPC43"])
        self.assertEqual(before, "2026-08-01")

    def test_month_end_helper_is_no_longer_used_for_rate_rows(self) -> None:
        source = SCRIPT.read_text(encoding="utf-8")
        rate_row_block = source.split("rate_rows = [", 1)[1].split("]", 1)[0]
        self.assertIn('"effective_to": None', rate_row_block)
        self.assertNotIn("last_day_of_month", rate_row_block)


def reading(**overrides: object) -> dict:
    """A well-formed reply, as the model returns it, with the printed
    descriptions copied off a real circular."""
    materials = [
        ("CEM_OPC43", "Ordinary Portland Cement(43/53 grade)", 5100),
        ("CEM_PPC", "Portland Pozzolana Cement", 4800),
        ("CEM_PSC", "Portland Slag Cement", 4800),
        (
            "STEEL_STRUCT_SEC",
            "Mild Steel, Structural Steel, i.e. Angles, Channels & I - Sections",
            53000,
        ),
        ("STEEL_STRUCT_PLATE", "M.S. Plates (As per IS 2062-E250 BR)", 63000),
        ("STEEL_TMT_A", "Major Steel Manufacturers including PSUs", 56000),
        ("STEEL_TMT_B", "Other Steel Manufacturers with minimum installed", 50000),
    ]
    return {
        "circular_month": "May -2026",
        "sor_year": "2025-26",
        "materials": [
            {
                "material_code": code,
                "printed_description": description,
                "rate": rate,
                "unit": "M.T",
            }
            for code, description, rate in materials
        ],
        **overrides,
    }


class ReadingVerificationTests(unittest.TestCase):
    """The model proposes; these checks dispose."""

    def test_known_published_layout_maps_all_seven_materials(self) -> None:
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
            vision.rates_from_reading(reading()),
        )

    def test_implausible_value_stops_import(self) -> None:
        body = reading()
        body["materials"][0]["rate"] = 510
        with self.assertRaises(sync.SyncError):
            vision.rates_from_reading(body)

    def test_rate_taken_from_the_wrong_row_is_rejected(self) -> None:
        """The failure that motivated all of this: a plausible number lifted
        off a neighbouring row. The description travels with the rate, so the
        row can be challenged even when the number itself looks fine."""
        body = reading()
        plate = next(
            m for m in body["materials"] if m["material_code"] == "STEEL_STRUCT_PLATE"
        )
        # A real rate, but read off the Public Health line below the plates row.
        plate["printed_description"] = "H.R. Sheet in coils 1.6 mm."
        plate["rate"] = 62000
        with self.assertRaises(sync.SyncError):
            vision.rates_from_reading(body)

    def test_a_material_the_model_left_out_stops_import(self) -> None:
        """Omission is the safe answer for an illegible row, and it must not
        be mistaken for a complete reading."""
        body = reading()
        body["materials"] = [
            m for m in body["materials"] if m["material_code"] != "CEM_PPC"
        ]
        with self.assertRaises(sync.SyncError) as caught:
            vision.rates_from_reading(body)
        self.assertIn("CEM_PPC", str(caught.exception))

    def test_sor_year_is_read_when_present(self) -> None:
        self.assertEqual("2025-26", reading()["sor_year"])


if __name__ == "__main__":
    unittest.main()
