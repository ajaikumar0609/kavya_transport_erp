# Email HTML Templates — Kavya Transports Transactional Emails
# All templates are self-contained HTML strings with dynamic variable substitution.
# Use render_*() helpers which perform safe string interpolation via .format_map().

from __future__ import annotations
from datetime import datetime

# ── Brand tokens ──────────────────────────────────────────────────────────────
_BRAND_BLUE = "#1E40AF"
_BRAND_LIGHT = "#DBEAFE"
_TEXT_DARK = "#111827"
_TEXT_MID = "#374151"
_TEXT_LIGHT = "#6B7280"
_BORDER = "#E5E7EB"
_BG = "#F9FAFB"

_BASE_WRAPPER = """\
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>{subject}</title>
</head>
<body style="margin:0;padding:0;background:{bg};font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:{bg};padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0"
             style="background:#ffffff;border-radius:10px;
                    border:1px solid {border};overflow:hidden;max-width:600px;">
        <!-- Header -->
        <tr>
          <td style="background:{brand};padding:24px 32px;">
            <span style="color:#ffffff;font-size:20px;font-weight:700;letter-spacing:0.5px;">
              Kavya Transports
            </span>
            <span style="color:rgba(255,255,255,0.55);font-size:11px;
                         font-weight:500;margin-left:10px;text-transform:uppercase;
                         letter-spacing:1.5px;">ERP</span>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px;">
            {body_html}
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="background:{bg};padding:20px 32px;
                     border-top:1px solid {border};">
            <p style="margin:0;color:{text_light};font-size:11px;line-height:1.6;">
              This is an automated message from Kavya Transports ERP system.<br/>
              Please do not reply to this email.
            </p>
            <p style="margin:8px 0 0;color:{text_light};font-size:10px;">
              &copy; {year} Kavya Transports. All rights reserved.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>
"""


def _wrap(subject: str, body_html: str) -> str:
    """Wrap body_html in the branded base template."""
    return _BASE_WRAPPER.format(
        subject=subject,
        bg=_BG,
        brand=_BRAND_BLUE,
        border=_BORDER,
        text_light=_TEXT_LIGHT,
        year=datetime.utcnow().year,
        body_html=body_html,
    )


def _badge(text: str, color: str = _BRAND_BLUE) -> str:
    return (
        f'<span style="display:inline-block;background:{color};color:#fff;'
        f'font-size:11px;font-weight:700;padding:3px 10px;border-radius:12px;'
        f'letter-spacing:0.5px;">{text}</span>'
    )


def _detail_row(label: str, value: str) -> str:
    return (
        f'<tr>'
        f'<td style="padding:8px 0;color:{_TEXT_LIGHT};font-size:13px;width:140px;">{label}</td>'
        f'<td style="padding:8px 0;color:{_TEXT_DARK};font-size:13px;font-weight:600;">{value}</td>'
        f'</tr>'
    )


# ════════════════════════════════════════════════════════════════════════════
#  1.  JOB CREATED
# ════════════════════════════════════════════════════════════════════════════

def render_job_created(
    *,
    user_name: str,
    job_number: str,
    origin: str,
    destination: str,
    client_name: str,
    pickup_date: str,
    material: str,
    quantity: str,
    created_by: str,
) -> tuple[str, str]:
    """Returns (subject, html_content)."""
    subject = f"New Job Assigned — {job_number}"
    body = f"""
      <h2 style="margin:0 0 6px;color:{_BRAND_BLUE};font-size:18px;">
        New Job Assigned
      </h2>
      <p style="margin:0 0 20px;color:{_TEXT_MID};font-size:13px;">
        Hello {user_name}, a new job has been created and assigned to your queue.
      </p>
      <table cellpadding="0" cellspacing="0" width="100%"
             style="background:{_BG};border-radius:8px;padding:16px;
                    border:1px solid {_BORDER};margin-bottom:20px;">
        <tbody>
          {_detail_row("Job Number", job_number)}
          {_detail_row("Route", f"{origin} → {destination}")}
          {_detail_row("Client", client_name)}
          {_detail_row("Pickup Date", pickup_date)}
          {_detail_row("Material", material)}
          {_detail_row("Quantity", quantity)}
          {_detail_row("Created By", created_by)}
        </tbody>
      </table>
      <p style="color:{_TEXT_LIGHT};font-size:12px;margin:0;">
        Log in to the ERP system to review and process this job.
      </p>
    """
    return subject, _wrap(subject, body)


# ════════════════════════════════════════════════════════════════════════════
#  2.  JOB STATUS UPDATED
# ════════════════════════════════════════════════════════════════════════════

_STATUS_COLORS: dict[str, str] = {
    "approved":    "#059669",
    "in_progress": "#2563EB",
    "completed":   "#059669",
    "cancelled":   "#DC2626",
    "on_hold":     "#D97706",
    "pending_approval": "#D97706",
}


def render_job_status_updated(
    *,
    user_name: str,
    job_number: str,
    old_status: str,
    new_status: str,
    remarks: str = "",
    updated_by: str,
) -> tuple[str, str]:
    subject = f"Job {job_number} Status Updated — {new_status.replace('_', ' ').title()}"
    status_color = _STATUS_COLORS.get(new_status.lower(), _BRAND_BLUE)
    body = f"""
      <h2 style="margin:0 0 6px;color:{_BRAND_BLUE};font-size:18px;">
        Job Status Updated
      </h2>
      <p style="margin:0 0 20px;color:{_TEXT_MID};font-size:13px;">
        Hello {user_name}, the status of job <strong>{job_number}</strong> has changed.
      </p>
      <div style="display:flex;gap:8px;margin-bottom:20px;align-items:center;">
        {_badge(old_status.replace("_"," ").upper(), "#6B7280")}
        <span style="color:{_TEXT_LIGHT};margin:0 6px;font-size:14px;">&#8594;</span>
        {_badge(new_status.replace("_"," ").upper(), status_color)}
      </div>
      <table cellpadding="0" cellspacing="0" width="100%"
             style="background:{_BG};border-radius:8px;padding:16px;
                    border:1px solid {_BORDER};margin-bottom:20px;">
        <tbody>
          {_detail_row("Job Number", job_number)}
          {_detail_row("Previous Status", old_status.replace("_"," ").title())}
          {_detail_row("New Status", new_status.replace("_"," ").title())}
          {_detail_row("Updated By", updated_by)}
          {_detail_row("Remarks", remarks or "—")}
        </tbody>
      </table>
    """
    return subject, _wrap(subject, body)


# ════════════════════════════════════════════════════════════════════════════
#  3.  TRIP STATUS UPDATED
# ════════════════════════════════════════════════════════════════════════════

def render_trip_status_updated(
    *,
    user_name: str,
    trip_number: str,
    old_status: str,
    new_status: str,
    vehicle_number: str = "",
    driver_name: str = "",
    origin: str = "",
    destination: str = "",
    remarks: str = "",
    updated_by: str,
) -> tuple[str, str]:
    subject = f"Trip {trip_number} — {new_status.replace('_', ' ').title()}"
    status_color = _STATUS_COLORS.get(new_status.lower(), _BRAND_BLUE)
    body = f"""
      <h2 style="margin:0 0 6px;color:{_BRAND_BLUE};font-size:18px;">
        Trip Status Update
      </h2>
      <p style="margin:0 0 20px;color:{_TEXT_MID};font-size:13px;">
        Hello {user_name}, an update on trip <strong>{trip_number}</strong>.
      </p>
      <div style="margin-bottom:20px;">
        {_badge(old_status.replace("_"," ").upper(), "#6B7280")}
        <span style="color:{_TEXT_LIGHT};margin:0 8px;font-size:14px;">&#8594;</span>
        {_badge(new_status.replace("_"," ").upper(), status_color)}
      </div>
      <table cellpadding="0" cellspacing="0" width="100%"
             style="background:{_BG};border-radius:8px;padding:16px;
                    border:1px solid {_BORDER};margin-bottom:20px;">
        <tbody>
          {_detail_row("Trip Number", trip_number)}
          {_detail_row("Route", f"{origin} → {destination}" if origin else "—")}
          {_detail_row("Vehicle", vehicle_number or "—")}
          {_detail_row("Driver", driver_name or "—")}
          {_detail_row("New Status", new_status.replace("_"," ").title())}
          {_detail_row("Updated By", updated_by)}
          {_detail_row("Remarks", remarks or "—")}
        </tbody>
      </table>
    """
    return subject, _wrap(subject, body)


# ════════════════════════════════════════════════════════════════════════════
#  4.  INVOICE CREATED
# ════════════════════════════════════════════════════════════════════════════

def render_invoice_created(
    *,
    user_name: str,
    invoice_number: str,
    client_name: str,
    total_amount: str,
    due_date: str,
    created_by: str,
    line_items_count: int = 0,
) -> tuple[str, str]:
    subject = f"Invoice {invoice_number} Generated — ₹{total_amount}"
    body = f"""
      <h2 style="margin:0 0 6px;color:{_BRAND_BLUE};font-size:18px;">
        Invoice Generated
      </h2>
      <p style="margin:0 0 20px;color:{_TEXT_MID};font-size:13px;">
        Hello {user_name}, a new invoice has been created for your review.
      </p>
      <table cellpadding="0" cellspacing="0" width="100%"
             style="background:{_BG};border-radius:8px;padding:16px;
                    border:1px solid {_BORDER};margin-bottom:20px;">
        <tbody>
          {_detail_row("Invoice #", invoice_number)}
          {_detail_row("Client", client_name)}
          {_detail_row("Total Amount", f"&#8377;{total_amount}")}
          {_detail_row("Due Date", due_date)}
          {_detail_row("Line Items", str(line_items_count) if line_items_count else "—")}
          {_detail_row("Prepared By", created_by)}
        </tbody>
      </table>
      <p style="color:{_TEXT_MID};font-size:12px;margin:0;">
        Please log in to the ERP system to review and send this invoice to the client.
      </p>
    """
    return subject, _wrap(subject, body)


# ════════════════════════════════════════════════════════════════════════════
#  5.  INVOICE PAID (manual proof uploaded)
# ════════════════════════════════════════════════════════════════════════════

def render_invoice_paid(
    *,
    user_name: str,
    invoice_number: str,
    client_name: str,
    total_amount: str,
    payment_method: str,
    paid_at: str,
    marked_by: str,
    proof_filename: str = "",
) -> tuple[str, str]:
    subject = f"Invoice {invoice_number} Marked Paid — ₹{total_amount}"
    body = f"""
      <h2 style="margin:0 0 6px;color:#059669;font-size:18px;">
        Invoice Marked as Paid ✓
      </h2>
      <p style="margin:0 0 20px;color:{_TEXT_MID};font-size:13px;">
        Hello {user_name}, the following invoice has been marked as paid.
      </p>
      <table cellpadding="0" cellspacing="0" width="100%"
             style="background:#F0FDF4;border-radius:8px;padding:16px;
                    border:1px solid #BBF7D0;margin-bottom:20px;">
        <tbody>
          {_detail_row("Invoice #", invoice_number)}
          {_detail_row("Client", client_name)}
          {_detail_row("Amount Paid", f"&#8377;{total_amount}")}
          {_detail_row("Payment Method", payment_method.replace("_"," ").title())}
          {_detail_row("Paid At", paid_at)}
          {_detail_row("Marked By", marked_by)}
          {_detail_row("Proof File", proof_filename or "—")}
        </tbody>
      </table>
      <p style="color:{_TEXT_MID};font-size:12px;margin:0;">
        The payment proof has been submitted for auditor review.
      </p>
    """
    return subject, _wrap(subject, body)


# ════════════════════════════════════════════════════════════════════════════
#  6.  REPORT GENERATED (generic)
# ════════════════════════════════════════════════════════════════════════════

def render_report_generated(
    *,
    user_name: str,
    report_title: str,
    report_type: str,
    generated_at: str,
    period: str = "",
    download_url: str = "",
) -> tuple[str, str]:
    subject = f"Report Ready — {report_title}"
    download_section = ""
    if download_url:
        download_section = f"""
        <p style="margin:20px 0 0;">
          <a href="{download_url}"
             style="display:inline-block;background:{_BRAND_BLUE};color:#fff;
                    text-decoration:none;padding:10px 22px;border-radius:6px;
                    font-size:13px;font-weight:700;">
            Download Report
          </a>
        </p>
        """
    body = f"""
      <h2 style="margin:0 0 6px;color:{_BRAND_BLUE};font-size:18px;">
        Your Report is Ready
      </h2>
      <p style="margin:0 0 20px;color:{_TEXT_MID};font-size:13px;">
        Hello {user_name}, the report you requested has been generated.
      </p>
      <table cellpadding="0" cellspacing="0" width="100%"
             style="background:{_BG};border-radius:8px;padding:16px;
                    border:1px solid {_BORDER};margin-bottom:20px;">
        <tbody>
          {_detail_row("Report", report_title)}
          {_detail_row("Type", report_type)}
          {_detail_row("Period", period or "—")}
          {_detail_row("Generated At", generated_at)}
        </tbody>
      </table>
      {download_section}
    """
    return subject, _wrap(subject, body)
