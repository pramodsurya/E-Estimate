# PRED monthly steel/cement sync

This job discovers the public monthly circular PDFs published at PRED's Steel
and Cement Rates page, OCRs each scanned document, and writes the seven mapped
material rates to material_rate_monthly.

It is deliberately conservative:

- It only accepts the seven material descriptions with fixed source mappings.
- It requires prices to fall inside material-specific ranges.
- It quarantines a rate that moves more than 35% from the previous known rate.
- It stores the original private PDF, SHA-256, OCR text, and extracted values
  in material_rate_document.

## Local verification

Install Poppler and Tesseract, then run:

    python -m unittest scripts/rate-sync/test_pred_material_rate_sync.py
    python scripts/rate-sync/pred_material_rate_sync.py --dry-run --limit 1

The live job requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY. The
service-role key is only for GitHub Actions secrets; never place it in the
Electron app or any VITE_ environment variable.

PRED_RATE_MIN_EFFECTIVE_DATE defaults to 2025-06-01 and
PRED_RATE_MAX_DOCUMENTS_PER_RUN defaults to 3. Adjust either only when you
intentionally need a historic backfill.

The GitHub workflow starts at 02:10 Asia/Kolkata every Monday, but calls PRED
only on alternating Mondays. Its first scheduled run is 2026-08-17; set
PRED_RATE_FORTNIGHTLY_ANCHOR_DATE to move that two-week cadence.
