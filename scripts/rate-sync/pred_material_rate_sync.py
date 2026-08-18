#!/usr/bin/env python3
"""Synchronise PRED's monthly steel and cement circulars into Supabase.

The PRED index is the discovery API: document filenames are unguessable. The
documents themselves are usually scans, so the sync first tries a PDF text
layer and falls back to Poppler + Tesseract OCR.

Only the seven materials with an unambiguous mapping to material_rate_monthly
are written. Any malformed document, implausible value, or unusually large
month-on-month movement is recorded as QUARANTINED instead of changing rates.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from html import unescape
from pathlib import Path
from typing import Any, Iterable
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlencode, urljoin
from urllib.request import Request, urlopen

INDEX_URL = "https://www.pred.telangana.gov.in/steel_cement_rates.php"
SOURCE_ORIGIN = "https://www.pred.telangana.gov.in/"
USER_AGENT = (
    "E-Estimate-rate-sync/1.0 "
    "(monthly public steel/cement circular discovery; contact eic_pr@telangana.gov.in)"
)
MAX_PDF_BYTES = 10 * 1024 * 1024
DEFAULT_MIN_EFFECTIVE_DATE = "2025-06-01"
DEFAULT_MAX_DOCUMENTS = 3
OCR_VERSION = "poppler+tesseract-eng-psm6-or-4/v1"
# The Monday after the workflow is first published. An anchor avoids a
# month-boundary drift that a cron */14 expression would otherwise introduce.
DEFAULT_FORTNIGHTLY_ANCHOR_DATE = "2026-08-17"

MONTHS = {
    "jan": 1,
    "feb": 2,
    "mar": 3,
    "apr": 4,
    "may": 5,
    "jun": 6,
    "jul": 7,
    "aug": 8,
    "sep": 9,
    "oct": 10,
    "nov": 11,
    "dec": 12,
}


class SyncError(RuntimeError):
    """A source document is not safe to import automatically."""


@dataclass(frozen=True)
class Circular:
    label: str
    url: str
    effective_from: date


@dataclass(frozen=True)
class RateSpec:
    material_code: str
    anchor: str
    minimum: int
    maximum: int


# The descriptions are deliberately anchored to the words that distinguish one
# published row from another. Bad OCR must stop the import, not select a
# different material.
RATE_SPECS = (
    RateSpec("CEM_OPC43", r"ordinary\s+portland\s+cement", 2_000, 10_000),
    RateSpec("CEM_PPC", r"portland\s+pozzolana\s+cement", 2_000, 10_000),
    RateSpec("CEM_PSC", r"portland\s+slag\s+cement", 2_000, 10_000),
    RateSpec(
        "STEEL_STRUCT_SEC",
        r"(?:"
        r"(?:m[i1l]ld|mild)\s+steel.{0,180}?(?:angles|channels|sections)"
        r"|steel\s*,?\s*i\.?\s*e\.?\s*angles"
        r")",
        20_000,
        120_000,
    ),
    RateSpec("STEEL_STRUCT_PLATE", r"m\.?\s*s\.?\s*plates", 20_000, 120_000),
    RateSpec("STEEL_TMT_A", r"major\s+steel\s+manufacturers", 30_000, 120_000),
    RateSpec("STEEL_TMT_B", r"other\s+steel\s+manufacturers", 30_000, 120_000),
)

LINK_ROW = re.compile(
    r"<tr[^>]*>\s*<td[^>]*>(?P<label>.*?)</td>\s*"
    r"<td[^>]*>\s*<a\s+[^>]*href\s*=\s*[\"'](?P<href>[^\"']+)[\"']",
    re.IGNORECASE | re.DOTALL,
)
TAG = re.compile(r"<[^>]+>")
# Four-digit identifiers such as IS 2062 occur in the description column. A
# rate without a thousands separator is accepted only when the source follows
# it with the usual /- or Rs marker.
RATE_TOKEN = re.compile(
    r"(?<!\d)(?:"
    r"\d{1,3}(?:\s*,\s*\d{3})+"
    r"|\d{4,6}(?=\s*(?:/-|/|rs\.?))"
    r")(?!\d)",
    re.IGNORECASE,
)
SOR_YEAR = re.compile(r"\b(20\d{2})\s*-\s*(\d{2})\b")


def last_day_of_month(value: date) -> date:
    if value.month == 12:
        return date(value.year, 12, 31)
    return date(value.year, value.month + 1, 1).fromordinal(
        date(value.year, value.month + 1, 1).toordinal() - 1
    )


def is_fortnightly_run_day(today: date, anchor_date: date) -> bool:
    return (today - anchor_date).days >= 0 and (today - anchor_date).days % 14 == 0


def plain_text(value: str) -> str:
    return " ".join(unescape(TAG.sub(" ", value)).split())


def parse_label(label: str) -> date:
    text = plain_text(label).lower().replace("_", "-")
    month_match = re.search(
        r"\b(" + "|".join(MONTHS) + r")[a-z]*\b",
        text,
        re.IGNORECASE,
    )
    if not month_match:
        raise SyncError(f'could not identify a month in "{label}"')

    full_year = re.search(r"(?<!\d)((?:19|20)\d{2})(?!\d)", text)
    if full_year:
        year = int(full_year.group(1))
    else:
        short_year = re.search(r"[-_/](\d{2})(?:\D|$)", text)
        if not short_year:
            raise SyncError(f'could not identify a year in "{label}"')
        year = 2000 + int(short_year.group(1))

    if not 2014 <= year <= 2100:
        raise SyncError(f"year {year} is outside the supported source range")
    return date(year, MONTHS[month_match.group(1).lower()[:3]], 1)


def parse_index(html: str) -> tuple[list[Circular], list[str]]:
    documents: list[Circular] = []
    unreadable: list[str] = []
    seen_urls: set[str] = set()

    for match in LINK_ROW.finditer(html):
        label = plain_text(match.group("label"))
        url = urljoin(INDEX_URL, unescape(match.group("href")).strip())
        if not url.startswith(SOURCE_ORIGIN) or not url.lower().endswith(".pdf"):
            unreadable.append(f'{label}: unsafe or non-PDF URL "{url}"')
            continue
        try:
            effective_from = parse_label(label)
        except SyncError as error:
            unreadable.append(str(error))
            continue
        if url in seen_urls:
            continue
        seen_urls.add(url)
        documents.append(Circular(label, url, effective_from))

    documents.sort(key=lambda document: document.effective_from, reverse=True)
    return documents, unreadable


def http_request(
    url: str,
    *,
    method: str = "GET",
    headers: dict[str, str] | None = None,
    data: bytes | None = None,
    allowed_statuses: Iterable[int] = (200,),
) -> tuple[bytes, int]:
    request_headers = {"User-Agent": USER_AGENT, **(headers or {})}
    request = Request(url, data=data, headers=request_headers, method=method)
    try:
        with urlopen(request, timeout=45) as response:
            body = response.read(MAX_PDF_BYTES + 1)
            content_type = response.headers.get("Content-Type", "")
            if len(body) > MAX_PDF_BYTES and "application/pdf" in content_type:
                raise SyncError(f"response exceeds {MAX_PDF_BYTES // 1024 // 1024} MiB limit")
            status = response.status
    except HTTPError as error:
        body = error.read()
        status = error.code
    except URLError as error:
        raise SyncError(f"network failure: {error.reason}") from error

    if status not in set(allowed_statuses):
        detail = body.decode("utf-8", errors="replace")[:500].replace("\n", " ")
        raise SyncError(f"HTTP {status} from {url}: {detail}")
    return body, status


def get_page(url: str) -> str:
    body, _ = http_request(url)
    return body.decode("utf-8", errors="replace")


def get_pdf(url: str) -> bytes:
    body, _ = http_request(url)
    if not body.startswith(b"%PDF-"):
        raise SyncError("source link did not return a PDF")
    return body


def ensure_command(command: str) -> None:
    if shutil.which(command) is None:
        raise SyncError(
            f'"{command}" is required. Install poppler-utils and tesseract-ocr before running.'
        )


def run_command(args: list[str], *, cwd: Path) -> str:
    completed = subprocess.run(
        args,
        cwd=cwd,
        capture_output=True,
        check=False,
        text=True,
        timeout=120,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()[:500]
        raise SyncError(f'{" ".join(args[:2])} failed: {detail}')
    return completed.stdout


def normalized_ocr(value: str) -> str:
    return re.sub(r"\s+", " ", value.lower()).strip()


def recognized_anchor_count(text: str) -> int:
    normal = normalized_ocr(text)
    return sum(bool(re.search(spec.anchor, normal, re.IGNORECASE | re.DOTALL)) for spec in RATE_SPECS)


def ocr_candidate_quality(text: str) -> tuple[int, int]:
    """Prefer a layout mode that can actually yield the complete rate set."""
    try:
        extract_rates(text)
        extracted = 1
    except SyncError:
        extracted = 0
    return extracted, recognized_anchor_count(text)


def is_complete_extraction(quality: tuple[int, int]) -> bool:
    """Every material named, and a plausible rate read for each of them."""
    return quality == (1, len(RATE_SPECS))


def extract_text(pdf: bytes) -> str:
    ensure_command("pdftotext")
    ensure_command("pdftoppm")
    ensure_command("tesseract")

    with tempfile.TemporaryDirectory(prefix="pred-rate-sync-") as temporary:
        directory = Path(temporary)
        pdf_path = directory / "circular.pdf"
        pdf_path.write_bytes(pdf)

        # A text layer is worth trying but not worth trusting. Several
        # circulars carry a damaged OCR layer of their own: July 2025 lost a
        # vertical strip of the page ("Ordinary Portland Ce" for "Cement"),
        # and August 2025 turned "Portland" into "Ponland". Both are long
        # enough to look healthy by length alone, so the embedded text only
        # wins outright when it reads every material and every rate; short of
        # that it competes with the renders below rather than pre-empting them.
        candidates: list[str] = []
        embedded = run_command(["pdftotext", "-layout", str(pdf_path), "-"], cwd=directory)
        if len(re.sub(r"\s+", "", embedded)) >= 150:
            if is_complete_extraction(ocr_candidate_quality(embedded)):
                return embedded
            candidates.append(embedded)

        # The currently published circulars are scans. Use two layout modes and
        # select the one recognizing more of our exact source labels.
        run_command(
            ["pdftoppm", "-png", "-r", "300", str(pdf_path), str(directory / "page")],
            cwd=directory,
        )
        pages = sorted(directory.glob("page-*.png"))
        if not pages:
            raise SyncError("Poppler rendered no pages")

        for psm in ("6", "4"):
            page_text = [
                run_command(
                    ["tesseract", str(page), "stdout", "-l", "eng", "--psm", psm],
                    cwd=directory,
                )
                for page in pages
            ]
            candidates.append("\n".join(page_text))

        return max(candidates, key=ocr_candidate_quality)


def token_to_rate(token: str) -> int:
    return int(re.sub(r"\D", "", token))


def extract_rates(text: str) -> dict[str, int]:
    normal = normalized_ocr(text)
    matches: list[tuple[RateSpec, re.Match[str]]] = []
    for spec in RATE_SPECS:
        anchor_match = re.search(spec.anchor, normal, re.IGNORECASE | re.DOTALL)
        if not anchor_match:
            raise SyncError(f"OCR did not recognize {spec.material_code}'s source description")
        matches.append((spec, anchor_match))

    matches.sort(key=lambda item: item[1].start())
    rates: dict[str, int] = {}
    for index, (spec, anchor_match) in enumerate(matches):
        next_anchor_start = (
            matches[index + 1][1].start() if index + 1 < len(matches) else len(normal)
        )
        public_health_start = normal.find("public health items", anchor_match.end())
        if public_health_start != -1:
            next_anchor_start = min(next_anchor_start, public_health_start)
        # Keep a bounded tail so a missing rate cannot leak into an unrelated
        # row much later in a malformed document.
        row_text = normal[anchor_match.end() : min(next_anchor_start, anchor_match.end() + 650)]
        accepted = [
            token_to_rate(token)
            for token in RATE_TOKEN.findall(row_text)
            if spec.minimum <= token_to_rate(token) <= spec.maximum
        ]
        if not accepted:
            raise SyncError(
                f"no plausible price found next to {spec.material_code}'s source description"
            )
        if len(set(accepted)) > 1:
            raise SyncError(
                f"ambiguous prices for {spec.material_code}: {sorted(set(accepted))}"
            )
        rates[spec.material_code] = accepted[0]

    if set(rates) != {spec.material_code for spec in RATE_SPECS}:
        raise SyncError("OCR did not produce exactly the expected material set")
    return rates


def source_sor_year(text: str) -> str | None:
    match = SOR_YEAR.search(text)
    if match:
        return f"{match.group(1)}-{match.group(2)}"
    return None


class Supabase:
    def __init__(self, url: str, service_role_key: str) -> None:
        self.url = url.rstrip("/")
        self.headers = {
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
        }

    def rest(
        self,
        table: str,
        *,
        method: str = "GET",
        query: dict[str, str] | None = None,
        payload: Any | None = None,
        prefer: str | None = None,
        allowed_statuses: Iterable[int] = (200, 201),
    ) -> list[dict[str, Any]]:
        suffix = f"?{urlencode(query)}" if query else ""
        headers = {**self.headers, "Accept": "application/json"}
        if payload is not None:
            headers["Content-Type"] = "application/json"
        if prefer:
            headers["Prefer"] = prefer
        body, _ = http_request(
            f"{self.url}/rest/v1/{quote(table, safe='_')}{suffix}",
            method=method,
            headers=headers,
            data=json.dumps(payload).encode("utf-8") if payload is not None else None,
            allowed_statuses=allowed_statuses,
        )
        if not body:
            return []
        parsed = json.loads(body.decode("utf-8"))
        return parsed if isinstance(parsed, list) else [parsed]

    def document_for_url(self, source_url: str) -> dict[str, Any] | None:
        rows = self.rest(
            "material_rate_document",
            query={
                "source_url": f"eq.{source_url}",
                "select": "source_url,pdf_sha256,status",
                "limit": "1",
            },
        )
        return rows[0] if rows else None

    def existing_rate(self, material_code: str, before: date) -> int | None:
        rows = self.rest(
            "material_rate_monthly",
            query={
                "material_code": f"eq.{material_code}",
                "effective_from": f"lt.{before.isoformat()}",
                "select": "rate,effective_from",
                "order": "effective_from.desc",
                "limit": "1",
            },
        )
        return int(float(rows[0]["rate"])) if rows else None

    def upload_pdf(self, path: str, pdf: bytes) -> None:
        http_request(
            f"{self.url}/storage/v1/object/material-rate-circulars/{quote(path, safe='/')}",
            method="PUT",
            headers={
                **self.headers,
                "Content-Type": "application/pdf",
                "x-upsert": "true",
            },
            data=pdf,
            allowed_statuses=(200,),
        )

    def record_document(self, payload: dict[str, Any]) -> None:
        self.rest(
            "material_rate_document",
            method="POST",
            query={"on_conflict": "source_url"},
            payload=payload,
            prefer="resolution=merge-duplicates,return=minimal",
            allowed_statuses=(201,),
        )

    def close_open_periods(self, material_codes: list[str], before: date) -> None:
        """End the currently open period for each material the day before `before`.

        Keeps the table a contiguous chain -- each period ending as its
        successor begins -- which is the convention the earlier rows already
        follow (2024-06-21..2025-05-31, 2025-06-01..2026-04-30). Without this
        an older open period would overlap the new one.
        """
        if not material_codes:
            return
        codes = ",".join(f'"{code}"' for code in material_codes)
        self.rest(
            "material_rate_monthly",
            method="PATCH",
            query={
                "material_code": f"in.({codes})",
                "effective_to": "is.null",
                "effective_from": f"lt.{before.isoformat()}",
            },
            payload={"effective_to": (before - timedelta(days=1)).isoformat()},
            prefer="return=minimal",
            allowed_statuses=(200, 204),
        )

    def write_rates(self, rows: list[dict[str, Any]]) -> None:
        self.rest(
            "material_rate_monthly",
            method="POST",
            query={"on_conflict": "material_code,effective_from"},
            payload=rows,
            prefer="resolution=merge-duplicates,return=minimal",
            allowed_statuses=(201,),
        )


def assert_rate_changes_are_plausible(
    supabase: Supabase,
    rates: dict[str, int],
    effective_from: date,
) -> None:
    for material_code, new_rate in rates.items():
        prior_rate = supabase.existing_rate(material_code, effective_from)
        if prior_rate is None or prior_rate == 0:
            continue
        change = abs(new_rate - prior_rate) / prior_rate
        if change > 0.35:
            raise SyncError(
                f"{material_code} changes {change:.1%} from the previous known rate "
                f"({prior_rate} to {new_rate})"
            )


def document_payload(
    circular: Circular,
    *,
    sha256: str | None,
    status: str,
    storage_path: str | None = None,
    ocr_text: str | None = None,
    rates: dict[str, int] | None = None,
    sor_year: str | None = None,
    failure_reason: str | None = None,
) -> dict[str, Any]:
    return {
        "source_url": circular.url,
        "source_label": circular.label,
        "effective_from": circular.effective_from.isoformat(),
        "effective_to": last_day_of_month(circular.effective_from).isoformat(),
        "sor_year": sor_year,
        "pdf_sha256": sha256,
        "storage_path": storage_path,
        "ocr_text": ocr_text,
        "extracted_rates": rates or {},
        "status": status,
        "failure_reason": failure_reason,
        "last_attempt_at": datetime.now(timezone.utc).isoformat(),
        "imported_at": datetime.now(timezone.utc).isoformat()
        if status == "IMPORTED"
        else None,
    }


def sync_circular(
    circular: Circular,
    *,
    supabase: Supabase | None,
    dry_run: bool,
) -> str:
    known = supabase.document_for_url(circular.url) if supabase else None
    if known and known.get("status") == "IMPORTED":
        return "already_imported"

    pdf_sha256: str | None = None
    text: str | None = None
    try:
        pdf = get_pdf(circular.url)
        pdf_sha256 = hashlib.sha256(pdf).hexdigest()
        text = extract_text(pdf)
        rates = extract_rates(text)
        sor_year = source_sor_year(text)

        if dry_run:
            print(
                json.dumps(
                    {
                        "label": circular.label,
                        "effective_from": circular.effective_from.isoformat(),
                        "sor_year": sor_year,
                        "rates": rates,
                    },
                    sort_keys=True,
                )
            )
            return "dry_run"

        assert supabase is not None
        assert_rate_changes_are_plausible(supabase, rates, circular.effective_from)
        storage_path = f"{circular.effective_from.isoformat()}/{pdf_sha256}.pdf"
        supabase.upload_pdf(storage_path, pdf)

        source = f"PRED steel/cement circular {circular.label}: {circular.url}"
        rate_rows = [
            {
                "material_code": material_code,
                "rate": rate,
                # Left open. A circular stays in force until the next one
                # supersedes it, and since May 2026 PRED publishes quarterly:
                # closing at month end left two months of every quarter with no
                # circular at all, and periodForDate in the app skips a period
                # whose effective_to has passed, so those months silently
                # reverted to the yearly schedule rate.
                "effective_to": None,
                "effective_from": circular.effective_from.isoformat(),
                "sor_year": sor_year,
                "source": source,
            }
            for material_code, rate in sorted(rates.items())
        ]
        # Close whatever each of these materials was on before, the day before
        # this circular starts. Only these materials: a material this circular
        # does not mention is still governed by its previous rate, and closing
        # it would leave it unpriced.
        supabase.close_open_periods(sorted(rates), circular.effective_from)
        supabase.write_rates(rate_rows)
        supabase.record_document(
            document_payload(
                circular,
                sha256=pdf_sha256,
                status="IMPORTED",
                storage_path=storage_path,
                ocr_text=text,
                rates=rates,
                sor_year=sor_year,
            )
        )
        return "imported"
    except SyncError as error:
        if supabase and not dry_run:
            status = "QUARANTINED" if pdf_sha256 else "FAILED"
            supabase.record_document(
                document_payload(
                    circular,
                    sha256=pdf_sha256,
                    status=status,
                    # Keep whatever was read. Without it a quarantined document
                    # has to be downloaded and re-OCR'd by hand before anyone
                    # can see which word the extractor tripped over.
                    ocr_text=text,
                    failure_reason=str(error),
                )
            )
        print(f"{circular.label}: {error}", file=sys.stderr)
        return "failed"


def arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Discover, OCR and import PRED monthly steel/cement circulars."
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="download and extract PDFs, but make no Supabase writes",
    )
    parser.add_argument(
        "--min-effective-date",
        default=os.getenv("PRED_RATE_MIN_EFFECTIVE_DATE", DEFAULT_MIN_EFFECTIVE_DATE),
        help=f"oldest month to consider (default: {DEFAULT_MIN_EFFECTIVE_DATE})",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=int(os.getenv("PRED_RATE_MAX_DOCUMENTS_PER_RUN", DEFAULT_MAX_DOCUMENTS)),
        help=f"maximum new circulars per run (default: {DEFAULT_MAX_DOCUMENTS})",
    )
    parser.add_argument(
        "--source-url",
        help="process one known PDF URL; intended for safe manual recovery",
    )
    parser.add_argument(
        "--scheduled",
        action="store_true",
        help="enforce the fortnightly guard used by the scheduled workflow",
    )
    return parser.parse_args()


def main() -> int:
    args = arguments()
    if args.limit < 1:
        raise SystemExit("--limit must be at least 1")
    try:
        min_effective_date = date.fromisoformat(args.min_effective_date)
    except ValueError as error:
        raise SystemExit("--min-effective-date must be YYYY-MM-DD") from error
    try:
        fortnightly_anchor = date.fromisoformat(
            os.getenv("PRED_RATE_FORTNIGHTLY_ANCHOR_DATE", DEFAULT_FORTNIGHTLY_ANCHOR_DATE)
        )
    except ValueError as error:
        raise SystemExit("PRED_RATE_FORTNIGHTLY_ANCHOR_DATE must be YYYY-MM-DD") from error

    if args.scheduled and not is_fortnightly_run_day(date.today(), fortnightly_anchor):
        print(
            json.dumps(
                {
                    "status": "skipped",
                    "reason": "not a fortnightly run day",
                    "anchor_date": fortnightly_anchor.isoformat(),
                },
                sort_keys=True,
            )
        )
        return 0

    supabase: Supabase | None = None
    if not args.dry_run:
        url = os.getenv("SUPABASE_URL")
        service_role_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not service_role_key:
            raise SystemExit(
                "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required unless --dry-run is set"
            )
        supabase = Supabase(url, service_role_key)

    documents, unreadable = parse_index(get_page(INDEX_URL))
    if unreadable:
        raise SyncError(
            "The PRED index contains unreadable rows; refusing a partial import: "
            + "; ".join(unreadable[:5])
        )

    if args.source_url:
        if not args.source_url.startswith(SOURCE_ORIGIN):
            raise SystemExit("--source-url must be a PRED URL")
        lookup = {document.url: document for document in documents}
        if args.source_url not in lookup:
            raise SystemExit("the supplied URL is not currently present in the PRED index")
        candidates = [lookup[args.source_url]]
    else:
        eligible = [
            document
            for document in documents
            if document.effective_from >= min_effective_date
        ]
        # Limit only documents that still require work. Without this filtering,
        # three already-imported recent months would permanently starve an
        # initial historic backfill.
        candidates = []
        for document in eligible:
            if supabase:
                known = supabase.document_for_url(document.url)
                if known and known.get("status") == "IMPORTED":
                    continue
            candidates.append(document)
            if len(candidates) == args.limit:
                break

    if not candidates:
        print("No PRED circulars match the configured effective-date range.")
        return 0

    summary: dict[str, int] = {
        "already_imported": 0,
        "dry_run": 0,
        "failed": 0,
        "imported": 0,
    }
    for circular in candidates:
        outcome = sync_circular(circular, supabase=supabase, dry_run=args.dry_run)
        summary[outcome] += 1

    print(json.dumps({"summary": summary}, sort_keys=True))
    return 1 if summary["failed"] else 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SyncError as error:
        print(f"pred-material-rate-sync: {error}", file=sys.stderr)
        raise SystemExit(1)
