"""
create_real_users.py — Create real Kavya Transports staff accounts in the database.

This script is IDEMPOTENT — safe to run multiple times.
Existing users (matched by email) are skipped without modification.

Usage (on the server):
    cd /home/ubuntu/kavya_erp/backend
    source /home/ubuntu/kavya_erp/venv/bin/activate
    python create_real_users.py
"""

import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.db.postgres.connection import AsyncSessionLocal
from app.models.postgres.user import User, Role, UserRole
from app.core.security import get_password_hash


# ─── User definitions ──────────────────────────────────────────────────────────
# Format: (email, password, first_name, last_name, phone, role_name)
# phone is extracted from the password pattern KT@XXXXXXXXXX
USERS = [
    # ── ADMIN ──────────────────────────────────────────────────────────────────
    ("nambirajan@kavyatransports.com",      "KT@9047244000",  "Nambirajan",    "",              "9047244000",  "admin"),
    ("yogu@kavyatransports.com",            "KT@9486871772",  "Yogu",          "",              "9486871772",  "admin"),

    # ── FINANCE MANAGER ────────────────────────────────────────────────────────
    ("kosalai@kavyatransports.com",         "KT@9384475215",  "Kosalai",       "",              "9384475215",  "finance_manager"),

    # ── ACCOUNTANT ─────────────────────────────────────────────────────────────
    ("maharajan@kavyatransports.com",       "KT@9769059976",  "Maharajan",     "",              "9769059976",  "accountant"),

    # ── FLEET MANAGER ──────────────────────────────────────────────────────────
    ("asiq@kavyatransports.com",            "KT@9384545215",  "Asiq",          "",              "9384545215",  "fleet_manager"),
    ("pushpaveni@kavyatransports.com",      "KT@7397365215",  "Pushpaveni",    "",              "7397365215",  "fleet_manager"),
    ("poornakala@kavyatransports.com",      "KT@9384465215",  "Poornakala",    "",              "9384465215",  "fleet_manager"),
    ("vasanth@kavyatransports.com",         "KT@9791595215",  "Vasanth",       "",              "9791595215",  "fleet_manager"),

    # ── PUMP OPERATOR ──────────────────────────────────────────────────────────
    ("karavel@kavyatransports.com",         "KT@9342041325",  "Karavel",       "",              "9342041325",  "pump_operator"),

    # ── CLERK ──────────────────────────────────────────────────────────────────
    ("nambi@kavyatransports.com",           "KT@8111001093",  "Nambi",         "",              "8111001093",  "clerk"),
    ("ragul@kavyatransports.com",           "KT@8610535975",  "Ragul",         "",              "8610535975",  "clerk"),
    ("vinoth@kavyatransports.com",          "KT@9594673380",  "Vinoth",        "",              "9594673380",  "clerk"),
    ("sugumar@kavyatransports.com",         "KT@6379006493",  "Sugumar",       "",              "6379006493",  "clerk"),
    ("juli@kavyatransports.com",            "KT@9626752450",  "Juli",          "",              "9626752450",  "clerk"),
    ("kumaran@kavyatransports.com",         "KT@8072924789",  "Kumaran",       "",              "8072924789",  "clerk"),

    # ── DRIVERS ────────────────────────────────────────────────────────────────
    ("gopikrishnan@kavyatransports.com",    "KT@6383952782",  "Gopikrishnan",  "",              "6383952782",  "driver"),
    ("arun@kavyatransports.com",            "KT@9790833671",  "Arun",          "",              "9790833671",  "driver"),
    ("raju@kavyatransports.com",            "KT@7411762573",  "Raju",          "",              "7411762573",  "driver"),
    ("selvin@kavyatransports.com",          "KT@8903611651",  "Selvin",        "",              "8903611651",  "driver"),
    ("muthumari@kavyatransports.com",       "KT@9790044540",  "Muthumari",     "",              "9790044540",  "driver"),
    ("moovendran@kavyatransports.com",      "KT@9342881156",  "Moovendran",    "",              "9342881156",  "driver"),
    ("thulasimani@kavyatransports.com",     "KT@9626537950",  "Thulasimani",   "",              "9626537950",  "driver"),
    ("selva@kavyatransports.com",           "KT@9677748064",  "Selva",         "",              "9677748064",  "driver"),
    ("raja@kavyatransports.com",            "KT@6383805729",  "Raja",          "",              "6383805729",  "driver"),
    ("murugan@kavyatransports.com",         "KT@6374280724",  "Murugan",       "",              "6374280724",  "driver"),
    ("rajendran@kavyatransports.com",       "KT@9176739371",  "Rajendran",     "",              "9176739371",  "driver"),
    ("arunkumar@kavyatransports.com",       "KT@7200899595",  "Arunkumar",     "",              "7200899595",  "driver"),
    ("rajendrankovil@kavyatransports.com",  "KT@9894485257",  "Rajendran",     "Kovil",         "9894485257",  "driver"),
    ("therusaibu@kavyatransports.com",      "KT@9488808768",  "Therusaibu",    "",              "9488808768",  "driver"),
    ("balakrishnan@kavyatransports.com",    "KT@9865138705",  "Balakrishnan",  "",              "9865138705",  "driver"),
    ("rajkumar@kavyatransports.com",        "KT@9363780656",  "Rajkumar",      "",              "9363780656",  "driver"),
    ("alexpandiyan@kavyatransports.com",    "KT@9150591670",  "Alex",          "Pandiyan",      "9150591670",  "driver"),
    ("seetharam@kavyatransports.com",       "KT@9944092097",  "Seetharam",     "",              "9944092097",  "driver"),
    ("balachandran@kavyatransports.com",    "KT@9626421344",  "Balachandran",  "",              "9626421344",  "driver"),
    ("sivaperumal@kavyatransports.com",     "KT@9043318192",  "Sivaperumal",   "",              "9043318192",  "driver"),
    ("maruthu@kavyatransports.com",         "KT@9656975540",  "Maruthu",       "",              "9656975540",  "driver"),
    ("ganeshan@kavyatransports.com",        "KT@9585476380",  "Ganeshan",      "",              "9585476380",  "driver"),
    ("anantharaji@kavyatransports.com",     "KT@9791858443",  "Anantharaji",   "",              "9791858443",  "driver"),
    ("ponnusamy@kavyatransports.com",       "KT@9965656645",  "Ponnusamy",     "",              "9965656645",  "driver"),
    ("ananthasami@kavyatransports.com",     "KT@7418380919",  "Ananthasami",   "",              "7418380919",  "driver"),
    ("selvakumar@kavyatransports.com",      "KT@7845814998",  "Selvakumar",    "",              "7845814998",  "driver"),
    ("shahul@kavyatransports.com",          "KT@9655285340",  "Shahul",        "",              "9655285340",  "driver"),
    ("bose@kavyatransports.com",            "KT@9095839303",  "Bose",          "",              "9095839303",  "driver"),
    ("varathan@kavyatransports.com",        "KT@9360744509",  "Varathan",      "",              "9360744509",  "driver"),
    ("karthickraja@kavyatransports.com",    "KT@7092015233",  "Karthick",      "Raja",          "7092015233",  "driver"),
    ("surya@kavyatransports.com",           "KT@7200331707",  "Surya",         "",              "7200331707",  "driver"),
    ("sivasuburam@kavyatransports.com",     "KT@9597112161",  "Sivasuburam",   "",              "9597112161",  "driver"),
    ("thirupathi@kavyatransports.com",      "KT@9786078515",  "Thirupathi",    "",              "9786078515",  "driver"),
    ("anburaj@kavyatransports.com",         "KT@9047322663",  "Anburaj",       "",              "9047322663",  "driver"),
    ("mariyappan@kavyatransports.com",      "KT@7598027356",  "Mariyappan",    "",              "7598027356",  "driver"),
    ("muppidathi@kavyatransports.com",      "KT@9894817973",  "Muppidathi",    "",              "9894817973",  "driver"),
    ("kumar@kavyatransports.com",           "KT@8015045371",  "Kumar",         "",              "8015045371",  "driver"),
    ("nagarajan@kavyatransports.com",       "KT@6383157101",  "Nagarajan",     "",              "6383157101",  "driver"),
    ("puthiyaraja@kavyatransports.com",     "KT@9094959967",  "Puthiyaraja",   "",              "9094959967",  "driver"),
    ("nagoor@kavyatransports.com",          "KT@8489241578",  "Nagoor",        "",              "8489241578",  "driver"),
    ("rajamanikam@kavyatransports.com",     "KT@9025813426",  "Rajamanikam",   "",              "9025813426",  "driver"),
    ("chandran@kavyatransports.com",        "KT@9750113886",  "Chandran",      "",              "9750113886",  "driver"),
    ("balasubramanian@kavyatransports.com", "KT@6380151373",  "Balasubramanian","",             "6380151373",  "driver"),
    ("ramesh@kavyatransports.com",          "KT@9994430115",  "Ramesh",        "",              "9994430115",  "driver"),
    ("thangapandi@kavyatransports.com",     "KT@6383581387",  "Thangapandi",   "",              "6383581387",  "driver"),
    ("soundarraj@kavyatransports.com",      "KT@9361867658",  "Soundarraj",    "",              "9361867658",  "driver"),
]


async def run():
    created = 0
    skipped = 0
    errors = 0

    async with AsyncSessionLocal() as db:
        # Load all roles into a dict for fast lookup
        result = await db.execute(select(Role))
        roles = {r.name: r for r in result.scalars().all()}

        missing_roles = set(u[5] for u in USERS) - set(roles.keys())
        if missing_roles:
            print(f"[ERROR] The following roles are missing from the DB: {missing_roles}")
            print("        Run seed_data.py first to create roles, then re-run this script.")
            sys.exit(1)

        for email, password, first_name, last_name, phone, role_name in USERS:
            try:
                # Skip if user already exists
                existing = await db.execute(select(User).where(User.email == email))
                if existing.scalar_one_or_none():
                    print(f"  [SKIP] {email} — already exists")
                    skipped += 1
                    continue

                # Check if phone is already taken, append suffix to avoid unique violation
                phone_check = await db.execute(select(User).where(User.phone == phone))
                final_phone = phone
                if phone_check.scalar_one_or_none():
                    # Append last 2 chars of local email name to make it unique
                    suffix = email.split("@")[0][-2:]
                    final_phone = phone + suffix
                    print(f"  [WARN] Phone {phone} already used — storing as {final_phone} for {email}")

                user = User(
                    email=email,
                    phone=final_phone,
                    password_hash=get_password_hash(password),
                    first_name=first_name,
                    last_name=last_name,
                    is_active=True,
                    is_verified=True,
                )
                db.add(user)
                await db.flush()  # Get user.id

                role = roles[role_name]
                db.add(UserRole(user_id=user.id, role_id=role.id))
                await db.flush()

                print(f"  [OK]   {email} → role: {role_name}")
                created += 1

            except Exception as exc:
                await db.rollback()
                print(f"  [FAIL] {email} — {exc}")
                errors += 1
                # Re-open a fresh transaction for remaining users
                async with AsyncSessionLocal() as db2:
                    db = db2
                continue

        await db.commit()

    print()
    print("═" * 55)
    print(f"  Done. Created: {created}  |  Skipped: {skipped}  |  Errors: {errors}")
    print("═" * 55)


if __name__ == "__main__":
    asyncio.run(run())
