"""add gps_locations table for iALERT real-time telemetry

Revision ID: x001_add_gps_locations
Revises: a012, b689434ea2ec, l001_user_doc_fields, r003_tyre_enums_to_varchar,
         s001_add_passbook_fields, t001_tyre_initial_tread, w002_user_payment_qr
Create Date: 2026-05-12
"""
from typing import Union

from alembic import op
import sqlalchemy as sa

revision = "x001_add_gps_locations"
# Merge all 7 current DB heads into a single head, then add gps_locations.
down_revision: Union[str, tuple] = (
    "a012",
    "b689434ea2ec",
    "l001_user_doc_fields",
    "r003_tyre_enums_to_varchar",
    "s001_add_passbook_fields",
    "t001_tyre_initial_tread",
    "w002_user_payment_qr",
)
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "gps_locations",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        # Vehicle linkage (SET NULL so GPS rows survive if a vehicle is deleted)
        sa.Column(
            "vehicle_id",
            sa.Integer,
            sa.ForeignKey("vehicles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("registration_number", sa.String(20), nullable=False),
        # Position
        sa.Column("latitude", sa.Numeric(10, 8), nullable=False),
        sa.Column("longitude", sa.Numeric(11, 8), nullable=False),
        sa.Column("altitude", sa.Numeric(10, 2), nullable=True),
        # Motion
        sa.Column("speed", sa.Numeric(8, 2), nullable=True),
        sa.Column("heading", sa.Numeric(6, 2), nullable=True),
        sa.Column("odometer", sa.Numeric(12, 2), nullable=True),
        # State
        sa.Column("ignition_on", sa.Boolean, nullable=True),
        sa.Column("battery_voltage", sa.Numeric(6, 2), nullable=True),
        # Provenance
        sa.Column("source", sa.String(20), nullable=False, server_default="ialert"),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("NOW()"),
        ),
    )

    # Unique constraint used as the upsert target
    op.create_unique_constraint(
        "uq_gps_locations_reg_time",
        "gps_locations",
        ["registration_number", "recorded_at"],
    )

    # Indexes for common query patterns
    op.create_index("ix_gps_locations_registration_number", "gps_locations", ["registration_number"])
    op.create_index("ix_gps_locations_recorded_at", "gps_locations", ["recorded_at"])
    op.create_index("ix_gps_locations_vehicle_id", "gps_locations", ["vehicle_id"])


def downgrade() -> None:
    op.drop_index("ix_gps_locations_vehicle_id", table_name="gps_locations")
    op.drop_index("ix_gps_locations_recorded_at", table_name="gps_locations")
    op.drop_index("ix_gps_locations_registration_number", table_name="gps_locations")
    op.drop_constraint("uq_gps_locations_reg_time", "gps_locations", type_="unique")
    op.drop_table("gps_locations")
