"""
Production hotfix: Add missing `finance_manager` role and assign it to
finance@kavyatransports.com.

Run from the backend directory:
    cd backend
    python fix_finance_role.py

Safe to run multiple times (idempotent).
"""
import asyncio
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from app.db.postgres.connection import AsyncSessionLocal
from app.models.postgres.user import User, Role, UserRole, RoleType, user_roles


async def fix():
    async with AsyncSessionLocal() as db:
        # 1. Ensure finance_manager role exists
        result = await db.execute(select(Role).where(Role.name == "finance_manager"))
        role = result.scalar_one_or_none()
        if not role:
            role = Role(
                name="finance_manager",
                display_name="Finance Manager",
                role_type=RoleType.FINANCE_MANAGER,
                is_system=True,
            )
            db.add(role)
            await db.flush()
            print(f"[OK] Created role: finance_manager (id={role.id})")
        else:
            print(f"[OK] Role already exists: finance_manager (id={role.id})")

        # 2. Find the finance user
        result = await db.execute(
            select(User).where(User.email == "finance@kavyatransports.com")
        )
        user = result.scalar_one_or_none()
        if not user:
            print("[WARN] User finance@kavyatransports.com not found — skipping assignment")
            await db.commit()
            return

        # 3. Check existing role assignments (both tables)
        existing_legacy = await db.execute(
            select(user_roles).where(
                user_roles.c.user_id == user.id,
                user_roles.c.role_id == role.id,
            )
        )
        existing_extended = await db.execute(
            select(UserRole).where(
                UserRole.user_id == user.id,
                UserRole.role_id == role.id,
            )
        )

        if existing_legacy.first() is None and existing_extended.scalar_one_or_none() is None:
            db.add(UserRole(user_id=user.id, role_id=role.id))
            await db.flush()
            print(f"[OK] Assigned finance_manager role to {user.email}")
        else:
            print(f"[OK] Role already assigned to {user.email}")

        await db.commit()
        print("[DONE] finance_manager role fix complete.")
        print("       The user can now log in at finance@kavyatransports.com / demo123")
        print("       and will be redirected to /fm/dashboard with full Finance Manager permissions.")


if __name__ == "__main__":
    asyncio.run(fix())
