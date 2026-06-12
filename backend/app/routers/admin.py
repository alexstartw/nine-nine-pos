from __future__ import annotations

from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import Session, SQLModel, create_engine, text

from ..auth import require_admin
from ..config import DEFAULT_DB_PATH
from ..database import get_session

router = APIRouter(prefix="/admin", tags=["admin"])

# FK-safe insert order. reservations ↔ orders is circular;
# handled by nulling order_id on insert then patching it back.
_TABLES = [
    "vendors",
    "products",
    "members",
    "stock_entries",
    "reservations",
    "orders",
    "order_items",
    "reservation_items",
]


@router.post("/backup")
def backup_to_sqlite(
    pg_session: Session = Depends(get_session),
    _: Annotated[dict, Depends(require_admin)] = None,
):
    """Dump all PostgreSQL data into a date-stamped SQLite file."""
    try:
        date_str = datetime.now().strftime("%Y-%m-%d")
        out_path = DEFAULT_DB_PATH.parent / f"app_{date_str}.db"
        sqlite_engine = create_engine(
            f"sqlite:///{out_path}",
            echo=False,
            connect_args={"check_same_thread": False},
        )

        # Create a fresh schema matching the current models
        SQLModel.metadata.drop_all(sqlite_engine)
        SQLModel.metadata.create_all(sqlite_engine)

        # Read all tables from PostgreSQL
        table_data: dict[str, list[dict]] = {}
        for table in _TABLES:
            rows = pg_session.exec(text(f"SELECT * FROM {table}")).mappings().all()
            table_data[table] = [dict(r) for r in rows]

        with sqlite_engine.begin() as conn:
            conn.execute(text("PRAGMA foreign_keys = OFF"))

            _insert_rows(conn, "vendors", table_data["vendors"])
            _insert_rows(conn, "products", table_data["products"])
            _insert_rows(conn, "members", table_data["members"])
            _insert_rows(conn, "stock_entries", table_data["stock_entries"])

            # Insert reservations without order_id to break circular FK
            res_no_order = [{**r, "order_id": None} for r in table_data["reservations"]]
            _insert_rows(conn, "reservations", res_no_order)

            _insert_rows(conn, "orders", table_data["orders"])

            # Patch back reservations.order_id
            for r in table_data["reservations"]:
                if r.get("order_id") is not None:
                    conn.execute(
                        text("UPDATE reservations SET order_id = :oid WHERE id = :id"),
                        {"oid": r["order_id"], "id": r["id"]},
                    )

            _insert_rows(conn, "order_items", table_data["order_items"])
            _insert_rows(conn, "reservation_items", table_data["reservation_items"])

            conn.execute(text("PRAGMA foreign_keys = ON"))

        sqlite_engine.dispose()

        counts = {t: len(table_data[t]) for t in _TABLES}
        return {
            "success": True,
            "path": str(out_path),
            "counts": counts,
        }

    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"備份失敗：{exc}") from exc


def _insert_rows(conn, table: str, rows: list[dict]) -> None:
    if not rows:
        return
    cols = list(rows[0].keys())
    col_str = ", ".join(f'"{c}"' for c in cols)
    placeholders = ", ".join(f":p_{c}" for c in cols)
    for row in rows:
        conn.execute(
            text(f"INSERT INTO {table} ({col_str}) VALUES ({placeholders})"),
            {f"p_{c}": row.get(c) for c in cols},
        )
