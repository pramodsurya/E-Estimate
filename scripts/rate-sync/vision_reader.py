#!/usr/bin/env python3
"""Read the rate table out of a PRED circular by looking at it.

OCR reads a scan as a stream of words, so the rate column arrives detached
from the description column and a number lands beside whichever row happens
to follow it in reading order. Every failure this replaces was that same
fault: "Ponland" for "Portland", a rate column clipped off the page, 58,000
read as 38,000 with nothing in the pipeline able to contradict it. A vision
model reads the table as a table, which is the one thing OCR of a scan
cannot do.

Nothing here trusts the model on its own. It must report the description it
read beside each rate, and `rates_from_reading` checks that description
against the same anchors the OCR path used, then the printed bounds. The
caller then applies the month-on-month movement guard. A misread has to
survive all three.

The reader is deliberately swappable: `read_pages` is the whole interface, so
changing provider is a new class and a config value, never a change to the
checks below.

Usage
  GEMINI_API_KEY=... python vision_reader.py --list-models
  GEMINI_API_KEY=... python vision_reader.py path/to/circular.pdf

Environment
  GEMINI_API_KEY   required
  GEMINI_MODEL     override the model id (default below)
"""

from __future__ import annotations

import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

API_ROOT = "https://generativelanguage.googleapis.com/v1beta"
# Overridable because Google's flash-tier ids move faster than this file does.
# `--list-models` prints what the key can actually reach.
DEFAULT_MODEL = os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")
# The long edge to render at. Enough to resolve a comma in "58,000" on a
# mediocre scan without paying for detail the model cannot use.
RENDER_LONG_EDGE = 2000
MAX_PAGES = 8
TIMEOUT_SECONDS = 180


class VisionError(RuntimeError):
    """The circular could not be read well enough to import."""


# --------------------------------------------------------------------------
# Rendering
# --------------------------------------------------------------------------


def render_pages(pdf: bytes) -> list[bytes]:
    """One PNG per page. The embedded text layer is ignored on purpose --
    on several of these circulars it is itself damaged OCR."""
    if shutil.which("pdftoppm") is None:
        raise VisionError('"pdftoppm" is required. Install poppler-utils.')

    with tempfile.TemporaryDirectory(prefix="pred-vision-") as temporary:
        directory = Path(temporary)
        pdf_path = directory / "circular.pdf"
        pdf_path.write_bytes(pdf)
        completed = subprocess.run(
            [
                "pdftoppm",
                "-png",
                "-scale-to",
                str(RENDER_LONG_EDGE),
                str(pdf_path),
                str(directory / "page"),
            ],
            capture_output=True,
            text=True,
            check=False,
            timeout=120,
        )
        if completed.returncode != 0:
            detail = (completed.stderr or completed.stdout).strip()[:300]
            raise VisionError(f"pdftoppm failed: {detail}")
        pages = sorted(directory.glob("page-*.png"))
        if not pages:
            raise VisionError("Poppler rendered no pages")
        if len(pages) > MAX_PAGES:
            raise VisionError(f"{len(pages)} pages is more than a circular should be")
        return [page.read_bytes() for page in pages]


# --------------------------------------------------------------------------
# The ask
# --------------------------------------------------------------------------

INSTRUCTIONS = """\
This is a scanned rate circular from the Public Health wing of the Telangana \
PRED. It contains one table of material rates, with a description column and \
a "Rate in Rs." column.

Read that table and report the rate for each of these materials:

  CEM_OPC43           Ordinary Portland Cement (43/53 grade)
  CEM_PPC             Portland Pozzolana Cement
  CEM_PSC             Portland Slag Cement
  STEEL_STRUCT_SEC    Mild Steel / Structural Steel - angles, channels, I-sections
  STEEL_STRUCT_PLATE  M.S. Plates
  STEEL_TMT_A         Reinforcement steel, Category-A, major steel manufacturers
  STEEL_TMT_B         Reinforcement steel, Category-B, other steel manufacturers

Rules:

- Take each rate from the "Rate in Rs." cell on that material's own row. Some \
rows are two or three lines tall and the ruling can be faint; follow the row's \
horizontal band across to the rate column rather than counting down the column.
- Rates are printed like "5,200/-" or "58,000/-". Report the number alone, as \
an integer: 5200, 58000.
- Copy the description cell into printed_description exactly as printed, \
including any scanning damage. It is the evidence for the match, so do not \
tidy or correct it.
- The table also prices things that are not wanted: 6mm M.S. rods, M.S. flats, \
and the Public Health items below (P.C. drawn steel wire, H.R. sheet in coils, \
foundry grade pig iron). Do not report them, and do not let their rates be \
attributed to a row above or below them.
- If a material is absent, or its rate is not legible with confidence, leave \
it out entirely. A missing material is handled safely downstream. A guessed \
rate is not.
- sor_year is the schedule year the circular cites, printed like "2025-26". \
Use an empty string if it does not appear.
- circular_month is the month the rates govern, as printed, e.g. "June -2025".
"""

MATERIAL_CODES = [
    "CEM_OPC43",
    "CEM_PPC",
    "CEM_PSC",
    "STEEL_STRUCT_SEC",
    "STEEL_STRUCT_PLATE",
    "STEEL_TMT_A",
    "STEEL_TMT_B",
]

# Gemini takes an OpenAPI subset: uppercase type names, no additionalProperties,
# and propertyOrdering to pin field order in the reply.
RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "OBJECT",
    "properties": {
        "circular_month": {"type": "STRING"},
        "sor_year": {"type": "STRING"},
        "materials": {
            "type": "ARRAY",
            "items": {
                "type": "OBJECT",
                "properties": {
                    "material_code": {"type": "STRING", "enum": MATERIAL_CODES},
                    "printed_description": {"type": "STRING"},
                    "rate": {"type": "INTEGER"},
                    "unit": {"type": "STRING"},
                },
                "required": ["material_code", "printed_description", "rate", "unit"],
                "propertyOrdering": [
                    "material_code",
                    "printed_description",
                    "rate",
                    "unit",
                ],
            },
        },
    },
    "required": ["circular_month", "sor_year", "materials"],
    "propertyOrdering": ["circular_month", "sor_year", "materials"],
}


# --------------------------------------------------------------------------
# The call
# --------------------------------------------------------------------------


def _api_key() -> str:
    """The key, minus whatever whitespace came with it.

    A key pasted into a web form usually arrives with a trailing newline, and
    a newline in a header value is a request-splitting hazard rather than a
    typo, so it is stripped here rather than trusted.
    """
    key = (os.getenv("GEMINI_API_KEY") or "").strip()
    if not key:
        raise VisionError("GEMINI_API_KEY is not set")
    if not key.isprintable():
        raise VisionError("GEMINI_API_KEY contains control characters")
    return key


def _post(url: str, payload: dict[str, Any]) -> dict[str, Any]:
    request = Request(
        url,
        method="POST",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "content-type": "application/json",
            "x-goog-api-key": _api_key(),
        },
    )
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:400].replace("\n", " ")
        raise VisionError(f"HTTP {error.code} from the model API: {detail}") from error
    except URLError as error:
        raise VisionError(f"could not reach the model API: {error.reason}") from error


def list_models() -> list[str]:
    """What this key can actually reach. Ids move; this is the ground truth."""
    request = Request(
        f"{API_ROOT}/models?pageSize=200",
        headers={"x-goog-api-key": _api_key()},
    )
    try:
        with urlopen(request, timeout=TIMEOUT_SECONDS) as response:
            body = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")[:400]
        raise VisionError(f"HTTP {error.code} listing models: {detail}") from error
    except URLError as error:
        raise VisionError(f"could not reach the model API: {error.reason}") from error

    names = []
    for model in body.get("models", []):
        methods = model.get("supportedGenerationMethods") or []
        if "generateContent" in methods:
            names.append(model.get("name", "").removeprefix("models/"))
    return sorted(names)


def read_pages(pages: list[bytes], model: str | None = None) -> dict[str, Any]:
    """Ask the model for the table. Returns its reply; the caller verifies it."""
    model = model or DEFAULT_MODEL
    parts: list[dict[str, Any]] = [
        {
            "inline_data": {
                "mime_type": "image/png",
                "data": base64.b64encode(page).decode("ascii"),
            }
        }
        for page in pages
    ]
    parts.append({"text": INSTRUCTIONS})

    body = _post(
        f"{API_ROOT}/models/{model}:generateContent",
        {
            "contents": [{"role": "user", "parts": parts}],
            "generationConfig": {
                "response_mime_type": "application/json",
                "response_schema": RESPONSE_SCHEMA,
            },
        },
    )

    candidates = body.get("candidates") or []
    if not candidates:
        feedback = body.get("promptFeedback") or {}
        raise VisionError(f"the model returned no candidate ({feedback or 'no reason given'})")
    candidate = candidates[0]
    finish = candidate.get("finishReason")
    if finish not in (None, "STOP"):
        raise VisionError(f"the model stopped early: {finish}")

    text = "".join(
        part.get("text", "") for part in candidate.get("content", {}).get("parts", [])
    )
    if not text.strip():
        raise VisionError("the model returned no content")
    try:
        return json.loads(text)
    except json.JSONDecodeError as error:
        raise VisionError(f"the reply was not the requested JSON: {error}") from error


# --------------------------------------------------------------------------
# The checks
# --------------------------------------------------------------------------


def _normalise(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


def rates_from_reading(reading: dict[str, Any]) -> dict[str, int]:
    """Challenge the reading before believing it.

    The anchors here are the same expressions the OCR path matched on, but
    their job is inverted: they no longer *find* a rate, they test whether the
    row the model says it read is really that material. A rate lifted from the
    wrong row fails this even when the number itself is legible.
    """
    from pred_material_rate_sync import RATE_SPECS, SyncError

    by_code = {spec.material_code: spec for spec in RATE_SPECS}
    rates: dict[str, int] = {}

    for entry in reading.get("materials", []):
        code = entry.get("material_code")
        spec = by_code.get(code)
        if spec is None:
            raise SyncError(f"the model reported an unknown material {code!r}")
        if code in rates:
            raise SyncError(f"{code} was reported twice")

        described = _normalise(str(entry.get("printed_description", "")))
        if not re.search(spec.anchor, described, re.IGNORECASE | re.DOTALL):
            raise SyncError(
                f"{code}'s rate was taken from a row reading "
                f"{entry.get('printed_description')!r}, which is not that material"
            )

        rate = entry.get("rate")
        if not isinstance(rate, int) or isinstance(rate, bool):
            raise SyncError(f"{code}'s rate {rate!r} is not a whole number")
        if not spec.minimum <= rate <= spec.maximum:
            raise SyncError(
                f"{code} at {rate} is outside the plausible range "
                f"{spec.minimum}-{spec.maximum}"
            )
        rates[code] = rate

    missing = sorted(set(by_code) - set(rates))
    if missing:
        raise SyncError(f"the circular did not yield {', '.join(missing)}")
    return rates


def extract_rates(pdf: bytes, model: str | None = None) -> tuple[dict[str, int], str | None, str]:
    """Rates, the SOR year, and the reply kept verbatim for the audit trail."""
    reading = read_pages(render_pages(pdf), model=model)
    rates = rates_from_reading(reading)
    sor_year = (reading.get("sor_year") or "").strip() or None
    return rates, sor_year, json.dumps(reading, indent=2, sort_keys=True)


def main(argv: list[str]) -> int:
    sys.path.insert(0, str(Path(__file__).resolve().parent))
    if "--list-models" in argv:
        for name in list_models():
            print(name)
        return 0
    paths = [arg for arg in argv if not arg.startswith("--")]
    if not paths:
        print(__doc__, file=sys.stderr)
        return 2
    for path in paths:
        rates, sor_year, raw = extract_rates(Path(path).read_bytes())
        print(json.dumps({"file": path, "sor_year": sor_year, "rates": rates}, sort_keys=True))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main(sys.argv[1:]))
    except VisionError as error:
        print(f"vision-reader: {error}", file=sys.stderr)
        raise SystemExit(1)
