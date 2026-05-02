# Employee ID generation service
import logging

logger = logging.getLogger(__name__)

ROLE_PREFIX: dict[str, str] = {
    "DRIVER": "KTD",
    "PUMP_OPERATOR": "KTP",
    "MANAGER": "KTM",
    "FLEET_MANAGER": "KTFM",
    "ACCOUNTANT": "KTA",
    "PROJECT_ASSOCIATE": "KTPA",
    # Also accept lowercase keys
    "driver": "KTD",
    "pump_operator": "KTP",
    "manager": "KTM",
    "fleet_manager": "KTFM",
    "accountant": "KTA",
    "project_associate": "KTPA",
}


async def generate_employee_id(db, role_name: str) -> str:
    """
    Generate the next employee ID for the given role.
    Scans existing employee_ids in the DB to find the highest numeric suffix and increments.
    """
    from sqlalchemy import text

    prefix = ROLE_PREFIX.get(role_name) or ROLE_PREFIX.get(role_name.upper())
    if not prefix:
        raise ValueError(f"Unknown role for employee_id generation: {role_name}")

    # Find all employee_ids starting with this prefix
    result = await db.execute(
        text(
            "SELECT employee_id FROM users WHERE employee_id LIKE :pat ORDER BY employee_id"
        ),
        {"pat": f"{prefix}%"},
    )
    rows = result.fetchall()

    max_num = 0
    for row in rows:
        eid = row[0] or ""
        suffix = eid[len(prefix):]
        if suffix.isdigit():
            max_num = max(max_num, int(suffix))

    next_num = max_num + 1
    # Pad to at least 2 digits
    padded = str(next_num).zfill(max(2, len(str(next_num))))
    return f"{prefix}{padded}"
