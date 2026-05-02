"""
Seed KTT-tracked vehicles into the database.

These 20 vehicles are tracked via the KT Telematic (KTT) Pull API.
Registration numbers come directly from the KTT API response.

Run:  cd backend && python seed_ktt_vehicles.py

If a vehicle already exists in the DB, its gps_provider is updated to 'ktt'.
If it doesn't exist, a new record is created so it can be tracked.
"""
import asyncio
from app.db.postgres.connection import AsyncSessionLocal
from sqlalchemy import text

# ── 20 KTT-tracked vehicles (from API response 2026-04-26) ──
# vno matches exactly what the KTT API returns (no dashes)
KTT_VEHICLES = [
    {"reg": "TN72CB7731", "ktt_id": 92360},
    {"reg": "TN72CB4704", "ktt_id": 92364},
    {"reg": "TN72CB7738", "ktt_id": 92365},
    {"reg": "TN72CB5856", "ktt_id": 92366},
    {"reg": "TN72CB5865", "ktt_id": 92367},
    {"reg": "TN72CC6810", "ktt_id": 92465},
    {"reg": "TN72CB4705", "ktt_id": 92506},
    {"reg": "TN72CC6837", "ktt_id": 92532},
    {"reg": "TN72CB5871", "ktt_id": 92533},
    {"reg": "TN72CB7716", "ktt_id": 92559},
    {"reg": "TN72CB4783", "ktt_id": 92593},
    {"reg": "KA52B6235",  "ktt_id": 125164},
    {"reg": "KA01AM1029", "ktt_id": 125165},
    {"reg": "TN25BL2448", "ktt_id": 125206},
    {"reg": "KA01AM1028", "ktt_id": 125352},
    {"reg": "KA52B6223",  "ktt_id": 125423},
    {"reg": "KA01AM1011", "ktt_id": 125424},
    {"reg": "KA52B6233",  "ktt_id": 125486},
    {"reg": "KA01AM1020", "ktt_id": 125688},
    {"reg": "TN28BF8449", "ktt_id": 126086},
]


async def seed():
    async with AsyncSessionLocal() as db:
        inserted = 0
        updated = 0

        for v in KTT_VEHICLES:
            result = await db.execute(
                text("SELECT id FROM vehicles WHERE registration_number = :reg"),
                {"reg": v["reg"]},
            )
            existing = result.scalar_one_or_none()

            if existing:
                # Vehicle already in DB — just set/update gps_provider to ktt
                await db.execute(
                    text("""
                        UPDATE vehicles SET
                            gps_provider = 'ktt',
                            gps_provider_status = 'active',
                            gps_device_id = :ktt_id,
                            updated_at = NOW()
                        WHERE id = :id
                    """),
                    {"ktt_id": str(v["ktt_id"]), "id": existing},
                )
                updated += 1
                print(f"  ✓ Updated {v['reg']} (db id={existing}, ktt id={v['ktt_id']})")
            else:
                # New vehicle — insert with minimal info
                await db.execute(
                    text("""
                        INSERT INTO vehicles (
                            registration_number, vehicle_type, make, ownership_type,
                            status, fuel_type, gps_provider, gps_provider_status,
                            gps_device_id, owner_name, created_at, updated_at, is_deleted
                        ) VALUES (
                            :reg, 'TRUCK', 'KTT', 'OWNED',
                            'AVAILABLE', 'diesel', 'ktt', 'active',
                            :ktt_id, 'Kavya Transports', NOW(), NOW(), false
                        )
                    """),
                    {"reg": v["reg"], "ktt_id": str(v["ktt_id"])},
                )
                inserted += 1
                print(f"  + Inserted {v['reg']} (ktt id={v['ktt_id']})")

        await db.commit()
        print(f"\nDone: {inserted} inserted, {updated} updated, {len(KTT_VEHICLES)} total")

        # Verify
        result = await db.execute(
            text("""
                SELECT id, registration_number, gps_provider, gps_device_id
                FROM vehicles
                WHERE gps_provider = 'ktt'
                ORDER BY registration_number
            """)
        )
        print("\nKTT vehicles in DB:")
        for row in result.all():
            print(f"  V{row[0]}: {row[1]} | KTT device id={row[3]}")


if __name__ == "__main__":
    asyncio.run(seed())
