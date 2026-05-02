"""
Satisfaction Slip OCR Parser — IFIAS Phase 3
Extracts structured data from Britannia/Transport Satisfaction Slip PDFs.

Handles both text-based PDFs (via pdfplumber) and scanned/image PDFs (via Tesseract).

Real field layout from observed document:
  Truck Type : Z220          Detention_days : 0
  LR_No : 4856/72188         Depot : CH81
  Route : SR1C81             Transporter_No : 604462

Usage:
    parser = SatisfactionSlipParser()
    data = parser.parse("/path/to/slip.pdf")
    print(data.truck_type, data.detention_days, data.confidence_score)
"""

import logging
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Dict, Literal, Optional

log_dir = Path(__file__).resolve().parents[3] / "logs"
log_dir.mkdir(exist_ok=True)
_fh = RotatingFileHandler(log_dir / "ocr_output.log", maxBytes=10 * 1024 * 1024, backupCount=5)
_fh.setFormatter(logging.Formatter("[%(asctime)s] [%(levelname)s] [ocr] %(message)s"))
logger = logging.getLogger("ocr_output")
logger.setLevel(logging.INFO)
logger.addHandler(_fh)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------

@dataclass
class ExtractedField:
    value: str
    confidence: Literal["high", "medium", "low"]
    pattern_used: str
    raw_match: str


@dataclass
class ValidationResult:
    truck_no_match: bool
    lr_no_match: bool
    mismatches: list


@dataclass
class SatisfactionSlipData:
    lr_no: Optional[str]
    truck_no: Optional[str]
    truck_type: Optional[str]
    detention_days: Optional[int]
    sat_slip_date: Optional[date]
    depot: Optional[str]
    route: Optional[str]
    transporter_no: Optional[str]
    transporter_name: Optional[str]
    truck_in_date: Optional[date]
    truck_exit_date: Optional[date]
    sending_location: Optional[str]
    dispatched_qty: Optional[float]
    shortage_qty: Optional[float]
    damaged_qty: Optional[float]
    inbound_delivery_no: Optional[str]
    sto_invoice_no: Optional[str]
    raw_text: str
    confidence_score: float
    extraction_method: str  # "pdfplumber" or "tesseract"
    extracted_at: datetime
    pdf_path: str
    s3_key: Optional[str]


# ---------------------------------------------------------------------------
# Regex patterns for each labeled field
# ---------------------------------------------------------------------------

PATTERNS: Dict[str, list] = {
    "inbound_delivery_no": [
        r"Inbound\s+Delivery\s+No\s*[:\-]\s*(\d{8,12})",
    ],
    "sto_invoice_no": [
        r"STO\s+Invoice\s+No1?(?:/GR)?\s*[:\-]\s*(\d{8,12})",
        r"STO\s+Invoice\s*[:\-]\s*(\d{8,12})",
    ],
    "lr_no": [
        r"LR[_\s]No\s*[:\-]\s*([\d/]+)",
        r"LR\s*Number\s*[:\-]\s*([\d/\-]+)",
        r"LR\s*No\.?\s*[:\-]?\s*([\d]{4,}[/\-][\d]{4,})",
    ],
    "depot": [
        r"Depot\s*[:\-]\s*([A-Z]{2}[0-9]{1,3})\b",
        r"Depot\s*[:\-]\s*([A-Z0-9]{2,10})\b",
    ],
    "route": [
        r"Route\s*[:\-]\s*([A-Z]{2}[0-9A-Z]{3,10})\b",
    ],
    "truck_no": [
        r"Truck\s+No\s*[:\-]\s*([A-Z]{2}\d{2}[A-Z]{1,3}\d{4})\b",
        r"Truck\s+No\s*[:\-]\s*([A-Z0-9]{8,12})\b",
        r"Vehicle\s+No\s*[:\-]\s*([A-Z]{2}\d{2}[A-Z]{1,3}\d{4})\b",
    ],
    "truck_type": [
        r"Truck\s+Type\s*[:\-]\s*(Z\d{3,4})\b",
        r"Truck\s+Type\s*[:\-]\s*([A-Z]{1,3}\d{2,4})\b",
        r"Truck\s+Type\s*[:\-]\s*([A-Z0-9]{3,6})\b",
    ],
    "detention_days": [
        r"Detention[_\s]days?\s*[:\-]\s*(\d{1,3})\b",
        r"Detention\s*[:\-]\s*(\d{1,3})\b",
        r"Det\.\s*Days?\s*[:\-]\s*(\d{1,3})\b",
    ],
    "transporter_no": [
        r"Transporter[_\s]No\s*[:\-]\s*(\d{4,10})\b",
    ],
    "transporter_name": [
        r"Transporter[_\s]Name\s*[:\-]\s*([A-Z][A-Z\s&\.]{3,40})(?:\n|\r|Truck|Route|$)",
    ],
    "truck_in_date": [
        r"Truck\s+In\s+Date\s*[:\-]\s*(\d{2}[\.\/]\d{2}[\.\/]\d{4})",
    ],
    "truck_exit_date": [
        r"Truck\s+Exit\s+Date\s*[:\-]\s*(\d{2}[\.\/]\d{2}[\.\/]\d{4})",
    ],
    "satisfaction_slip_date": [
        r"Satisfaction\s+Slip\s+Date\s*[:\-]\s*(\d{2}[\.\/]\d{2}[\.\/]\d{4})",
        r"Slip\s+Date\s*[:\-]\s*(\d{2}[\.\/]\d{2}[\.\/]\d{4})",
    ],
    "sending_location": [
        r"Sending\s+Location\s*[:\-]\s*([A-Z0-9]{3,8})\b",
    ],
}


def _parse_date(raw: str) -> Optional[date]:
    """Parse DD.MM.YYYY or DD/MM/YYYY into a date object."""
    for fmt in ("%d.%m.%Y", "%d/%m/%Y", "%d-%m-%Y"):
        try:
            return datetime.strptime(raw.strip(), fmt).date()
        except ValueError:
            pass
    return None


def _extract_qty_values(text: str):
    """
    Extract dispatched/shortage/damaged quantities from the table row.
    Pattern: three floats followed by NOS: '1650.000 NOS 0.000 NOS 0.000 NOS'
    """
    matches = re.findall(r"(\d+\.\d{3})\s*NOS", text)
    dispatched = float(matches[0]) if len(matches) > 0 else None
    shortage = float(matches[1]) if len(matches) > 1 else None
    damaged = float(matches[2]) if len(matches) > 2 else None
    return dispatched, shortage, damaged


# ---------------------------------------------------------------------------
# Main parser class
# ---------------------------------------------------------------------------

class SatisfactionSlipParser:
    """Parse Satisfaction Slip PDFs and return structured SatisfactionSlipData."""

    MIN_WORDS_FOR_TEXT_PDF = 50

    def parse(self, pdf_path: str, s3_key: Optional[str] = None) -> SatisfactionSlipData:
        """
        Main entry point. Auto-selects pdfplumber or Tesseract OCR.
        """
        text = ""
        method = "pdfplumber"

        # 1. Try pdfplumber (text-based PDF)
        text = self.extract_with_pdfplumber(pdf_path)
        word_count = len(text.split())
        logger.info(f"pdfplumber: {word_count} words from {pdf_path}")

        # 2. Fall back to Tesseract if not enough text
        if word_count < self.MIN_WORDS_FOR_TEXT_PDF:
            logger.info(f"Falling back to Tesseract OCR for: {pdf_path}")
            text = self.extract_with_ocr(pdf_path)
            method = "tesseract"
            logger.info(f"Tesseract: {len(text.split())} words")

        # 3. Extract fields
        fields = self.extract_fields(text)

        # 4. Parse typed values
        lr_no = fields["lr_no"].value if "lr_no" in fields else None
        truck_no = fields["truck_no"].value if "truck_no" in fields else None
        truck_type = fields["truck_type"].value if "truck_type" in fields else None
        detention_raw = fields["detention_days"].value if "detention_days" in fields else None
        detention_days = int(detention_raw) if detention_raw is not None and detention_raw.isdigit() else None

        slip_date_raw = fields.get("satisfaction_slip_date")
        in_date_raw = fields.get("truck_in_date")
        exit_date_raw = fields.get("truck_exit_date")

        dispatched, shortage, damaged = _extract_qty_values(text)

        confidence = self.calculate_confidence(fields)

        logger.info(
            f"[{lr_no}] truck_type={truck_type} detention={detention_days} "
            f"confidence={confidence:.2f} method={method}"
        )

        return SatisfactionSlipData(
            lr_no=lr_no,
            truck_no=truck_no,
            truck_type=truck_type,
            detention_days=detention_days,
            sat_slip_date=_parse_date(slip_date_raw.value) if slip_date_raw else None,
            depot=fields["depot"].value if "depot" in fields else None,
            route=fields["route"].value if "route" in fields else None,
            transporter_no=fields["transporter_no"].value if "transporter_no" in fields else None,
            transporter_name=fields["transporter_name"].value.strip() if "transporter_name" in fields else None,
            truck_in_date=_parse_date(in_date_raw.value) if in_date_raw else None,
            truck_exit_date=_parse_date(exit_date_raw.value) if exit_date_raw else None,
            sending_location=fields["sending_location"].value if "sending_location" in fields else None,
            dispatched_qty=dispatched,
            shortage_qty=shortage,
            damaged_qty=damaged,
            inbound_delivery_no=fields["inbound_delivery_no"].value if "inbound_delivery_no" in fields else None,
            sto_invoice_no=fields["sto_invoice_no"].value if "sto_invoice_no" in fields else None,
            raw_text=text,
            confidence_score=confidence,
            extraction_method=method,
            extracted_at=datetime.utcnow(),
            pdf_path=pdf_path,
            s3_key=s3_key,
        )

    def extract_with_pdfplumber(self, pdf_path: str) -> str:
        """Extract text from a text-based PDF using pdfplumber."""
        try:
            import pdfplumber
            lines = []
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages:
                    page_text = page.extract_text(layout=True) or ""
                    lines.append(page_text)
                    # Also extract tables as pipe-delimited text
                    for table in page.extract_tables():
                        for row in table:
                            if row:
                                lines.append(" | ".join(str(c) if c else "" for c in row))
            return "\n".join(lines)
        except Exception as exc:
            logger.warning(f"pdfplumber failed: {exc}")
            return ""

    def extract_with_ocr(self, pdf_path: str) -> str:
        """Convert PDF to image and run Tesseract OCR."""
        try:
            from pdf2image import convert_from_path
            import pytesseract
            from PIL import Image, ImageFilter, ImageOps

            pages = convert_from_path(pdf_path, dpi=300)
            all_text = []
            for img in pages:
                # Preprocessing: grayscale → adaptive threshold
                gray = img.convert("L")
                # Enhance contrast
                from PIL import ImageEnhance
                enhancer = ImageEnhance.Contrast(gray)
                gray = enhancer.enhance(2.0)

                text = pytesseract.image_to_string(
                    gray,
                    lang="eng",
                    config="--psm 6 --oem 3",
                )
                all_text.append(text)
            return "\n".join(all_text)
        except Exception as exc:
            logger.error(f"OCR failed: {exc}", exc_info=True)
            return ""

    def extract_fields(self, text: str) -> Dict[str, ExtractedField]:
        """
        Apply regex patterns to extract labeled fields from PDF text.
        Returns a dict of canonical field name → ExtractedField.
        """
        results: Dict[str, ExtractedField] = {}

        for field_name, patterns in PATTERNS.items():
            for i, pattern in enumerate(patterns):
                m = re.search(pattern, text, re.IGNORECASE | re.MULTILINE)
                if m:
                    value = m.group(1).strip()
                    # Clean up transporter_name — remove trailing noise
                    if field_name == "transporter_name":
                        value = re.sub(r"\s{2,}", " ", value).strip()
                    confidence: Literal["high", "medium", "low"] = (
                        "high" if i == 0 else ("medium" if i == 1 else "low")
                    )
                    results[field_name] = ExtractedField(
                        value=value,
                        confidence=confidence,
                        pattern_used=pattern,
                        raw_match=m.group(0),
                    )
                    break  # Use first matching pattern

        return results

    def calculate_confidence(self, fields: Dict[str, ExtractedField]) -> float:
        """
        Weighted confidence score:
          truck_type:      30%
          detention_days:  25%
          lr_no:           25%
          truck_no:        20%
        """
        weights = {
            "truck_type": 0.30,
            "detention_days": 0.25,
            "lr_no": 0.25,
            "truck_no": 0.20,
        }
        conf_map = {"high": 1.0, "medium": 0.7, "low": 0.4}
        total = 0.0
        for key, weight in weights.items():
            f = fields.get(key)
            if f:
                total += conf_map[f.confidence] * weight
            # missing field = 0 contribution
        return round(min(total, 1.0), 4)

    def cross_validate(self, fields: Dict[str, ExtractedField], excel_row) -> ValidationResult:
        """
        Compare extracted PDF data against the corresponding Excel row.
        excel_row should have .truck_number and .lr_number attributes.
        """
        mismatches = []

        # Truck number comparison (normalize both)
        pdf_truck = fields.get("truck_no")
        excel_truck = getattr(excel_row, "truck_number", None)
        truck_match = True
        if pdf_truck and excel_truck:
            pt = re.sub(r"[\s\-]", "", pdf_truck.value.upper())
            et = re.sub(r"[\s\-]", "", str(excel_truck).upper())
            if pt != et:
                truck_match = False
                mismatches.append(f"truck_no: PDF={pt} vs Excel={et}")

        # LR match
        pdf_lr = fields.get("lr_no")
        excel_lr = getattr(excel_row, "lr_number", None)
        lr_match = True
        if pdf_lr and excel_lr:
            pn = re.sub(r"[^0-9]", "", pdf_lr.value)
            en = re.sub(r"[^0-9]", "", str(excel_lr))
            # At least one numeric part must overlap
            if not (pn in en or en in pn):
                lr_match = False
                mismatches.append(f"lr_no: PDF={pdf_lr.value} vs Excel={excel_lr}")

        return ValidationResult(
            truck_no_match=truck_match,
            lr_no_match=lr_match,
            mismatches=mismatches,
        )
