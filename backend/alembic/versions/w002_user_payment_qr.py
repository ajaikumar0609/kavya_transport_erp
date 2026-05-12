"""add user payment QR fields (stub — schema already applied to DB)

Revision ID: w002_user_payment_qr
Revises:
Create Date: 2026-04-25
"""
from alembic import op
import sqlalchemy as sa

revision = "w002_user_payment_qr"
down_revision = None  # Treated as a root; schema changes already present in DB
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Schema changes from this migration are already present in the database.
    # This stub exists so Alembic can navigate the revision chain.
    pass


def downgrade() -> None:
    pass
