"""Add payment_proof_url to trip_expenses

Revision ID: w001_add_payment_proof_url_to_trip_expenses
Revises: v001_invoice_payment_proof
Create Date: 2026-05-02 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

revision = 'w001'
down_revision = 'v001_invoice_payment_proof'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('trip_expenses', sa.Column('payment_proof_url', sa.String(500), nullable=True))
    op.add_column('trip_expenses', sa.Column('payment_proof_s3_key', sa.String(500), nullable=True))


def downgrade():
    op.drop_column('trip_expenses', 'payment_proof_s3_key')
    op.drop_column('trip_expenses', 'payment_proof_url')
