"""One-shot script: insert clerk role (if missing) + clerk user on production DB."""
import asyncio
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.core.security import get_password_hash
from app.models.postgres.user import User, Role, UserRole

DATABASE_URL = (
    "postgresql+asyncpg://postgres:Kavyatransport2004@"
    "database-1.cja60iaay252.ap-south-1.rds.amazonaws.com:5432/postgres"
)

async def main():
    engine = create_async_engine(DATABASE_URL, echo=False)
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with async_session() as db:
        # 1. Check how role_type is stored (string vs enum)
        result = await db.execute(text("SELECT role_type FROM roles LIMIT 1"))
        row = result.fetchone()
        print(f"[INFO] Sample role_type value: {row[0] if row else 'no rows'}")

        # 2. Upsert clerk role using raw INSERT to avoid ORM enum issues
        existing_role = await db.execute(text("SELECT id FROM roles WHERE name = 'clerk'"))
        clerk_role_row = existing_role.fetchone()

        if not clerk_role_row:
            await db.execute(text(
                "INSERT INTO roles (name, display_name, role_type, is_system, created_at, updated_at) "
                "VALUES ('clerk', 'Clerk', 'CLERK', true, NOW(), NOW())"
            ))
            await db.commit()
            existing_role2 = await db.execute(text("SELECT id FROM roles WHERE name = 'clerk'"))
            clerk_role_id = existing_role2.fetchone()[0]
            print(f"[OK] Clerk role created (id={clerk_role_id})")
        else:
            clerk_role_id = clerk_role_row[0]
            print(f"[SKIP] Clerk role already exists (id={clerk_role_id})")

        # 3. Upsert clerk user
        existing_user = await db.execute(text("SELECT id FROM users WHERE email = 'clerk@kavyatransports.com'"))
        user_row = existing_user.fetchone()

        if not user_row:
            pw_hash = get_password_hash("clerk123")
            await db.execute(text(
                "INSERT INTO users (email, phone, password_hash, first_name, last_name, is_active, is_verified, is_deleted, created_at, updated_at) "
                "VALUES ('clerk@kavyatransports.com', '9876510010', :ph, 'Kavitha', 'Clerk', true, true, false, NOW(), NOW())"
            ), {"ph": pw_hash})
            await db.commit()
            new_user = await db.execute(text("SELECT id FROM users WHERE email = 'clerk@kavyatransports.com'"))
            user_id = new_user.fetchone()[0]

            await db.execute(text(
                "INSERT INTO user_roles (user_id, role_id) VALUES (:uid, :rid)"
            ), {"uid": user_id, "rid": clerk_role_id})
            await db.commit()
            print(f"[OK] Clerk user created: clerk@kavyatransports.com / clerk123 (id={user_id})")
        else:
            print(f"[SKIP] User clerk@kavyatransports.com already exists (id={user_row[0]})")

    await engine.dispose()

if __name__ == "__main__":
    asyncio.run(main())

