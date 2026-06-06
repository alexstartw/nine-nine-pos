"""
一次性遷移腳本：SQLite → PostgreSQL (Supabase)
執行方式：在 backend/ 目錄下執行
  python scripts/migrate_sqlite_to_pg.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

# 確保可以 import app
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # type: ignore[import]

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from sqlmodel import create_engine, text

SQLITE_URL = f"sqlite:///{Path(__file__).resolve().parents[2] / 'data' / 'app.db'}"
_raw_pg_url = os.environ["DATABASE_URL"]
PG_URL = _raw_pg_url.split('?')[0]  # strip ?pgbouncer=true etc.

sqlite_engine = create_engine(SQLITE_URL)
pg_engine = create_engine(PG_URL)

# orders ↔ reservations 互相有外鍵，需分階段處理
# 其餘 table 按外鍵順序
SIMPLE_TABLES = [
    "vendors",
    "products",
    "members",
    "stock_entries",
    "order_items",      # 在 orders/reservations 之後才寫，先列出供 truncate 用
    "reservation_items",
]


def fetch_all(table: str) -> list[dict]:
    with sqlite_engine.connect() as conn:
        rows = conn.execute(text(f"SELECT * FROM {table}")).mappings().all()
        return [dict(r) for r in rows]


def get_pg_schema(table: str) -> dict[str, str]:
    """回傳 {column_name: data_type}"""
    with pg_engine.connect() as conn:
        result = conn.execute(text(
            "SELECT column_name, data_type FROM information_schema.columns "
            "WHERE table_name = :t AND table_schema = 'public'"
        ), {"t": table})
        return {row[0]: row[1] for row in result}


def coerce_row(row: dict, schema: dict[str, str]) -> dict:
    """SQLite integer 0/1 → PostgreSQL boolean"""
    out = {}
    for k, v in row.items():
        if k in schema and schema[k] == "boolean" and isinstance(v, int):
            out[k] = bool(v)
        else:
            out[k] = v
    return out


def insert_all(table: str, rows: list[dict]) -> None:
    if not rows:
        print(f"  {table}: 0 筆，略過")
        return

    schema = get_pg_schema(table)
    cols = [c for c in rows[0].keys() if c in schema]
    filtered_rows = [coerce_row({c: r[c] for c in cols}, schema) for r in rows]

    col_str = ", ".join(f'"{c}"' for c in cols)
    val_str = ", ".join(f":{c}" for c in cols)

    with pg_engine.begin() as conn:
        conn.execute(text(f"INSERT INTO {table} ({col_str}) VALUES ({val_str})"), filtered_rows)

    print(f"  {table}: {len(rows)} 筆 ✓")


def reset_sequences() -> None:
    """重設 PostgreSQL auto-increment sequence，避免新資料 ID 衝突"""
    tables_with_id = [
        "vendors", "products", "members", "stock_entries",
        "orders", "order_items", "reservations", "reservation_items",
    ]
    with pg_engine.begin() as conn:
        for table in tables_with_id:
            conn.execute(text(f"""
                SELECT setval(
                    pg_get_serial_sequence('{table}', 'id'),
                    COALESCE((SELECT MAX(id) FROM {table}), 0) + 1,
                    false
                )
            """))
    print("  sequences 重設完成 ✓")


def get_pg_ids(table: str) -> set:
    """Return the set of IDs currently in a PG table."""
    with pg_engine.connect() as conn:
        rows = conn.execute(text(f"SELECT id FROM {table}")).fetchall()
        return {r[0] for r in rows}


def sanitize_fk(rows: list[dict], fk_col: str, valid_ids: set) -> list[dict]:
    """Set FK column to None for rows that reference non-existent parents."""
    fixed = 0
    result = []
    for r in rows:
        if r.get(fk_col) not in valid_ids:
            r = {**r, fk_col: None}
            fixed += 1
        result.append(r)
    if fixed:
        print(f"    ⚠ {fk_col}: {fixed} 筆孤立引用設為 NULL")
    return result


def main() -> None:
    print("=== SQLite → Supabase 遷移開始 ===\n")

    # 先 truncate 所有 table（逆序避免 FK 錯誤）
    with pg_engine.begin() as conn:
        conn.execute(text(
            "TRUNCATE TABLE reservation_items, order_items, reservations, orders, "
            "stock_entries, members, products, vendors CASCADE"
        ))

    # vendors
    insert_all("vendors", fetch_all("vendors"))

    # 從 SQLite 建立 valid_ids（避開 PgBouncer 讀取時序問題）
    with sqlite_engine.connect() as conn:
        valid_vendor_ids = {r[0] for r in conn.execute(text("SELECT id FROM vendors")).fetchall()}
        valid_product_ids = {r[0] for r in conn.execute(text("SELECT id FROM products")).fetchall()}
        # barcode → product_id 對照表（用於修補孤立 FK）
        barcode_to_pid = {
            r[0]: r[1]
            for r in conn.execute(text("SELECT barcode, id FROM products WHERE barcode IS NOT NULL")).fetchall()
        }

    # products — 清除孤立 vendor_id
    products = sanitize_fk(fetch_all("products"), "vendor_id", valid_vendor_ids)
    insert_all("products", products)

    # stock_entries — 孤立 product_id 嘗試用 barcode 回填，找不到則 NULL
    stock = fetch_all("stock_entries")
    resolved = skipped = 0
    fixed_stock = []
    for r in stock:
        pid = r.get("product_id")
        if pid not in valid_product_ids:
            fallback = barcode_to_pid.get(r.get("barcode"))
            r = {**r, "product_id": fallback}
            if fallback:
                resolved += 1
            else:
                skipped += 1
        fixed_stock.append(r)
    if resolved:
        print(f"    ⚠ stock_entries: {resolved} 筆孤立 product_id 已用 barcode 回填")
    if skipped:
        print(f"    ⚠ stock_entries: {skipped} 筆孤立 product_id 無法回填，設為 NULL")
    insert_all("stock_entries", fixed_stock)

    for table in ["members"]:
        insert_all(table, fetch_all(table))

    # reservations 先不帶 order_id（解循環依賴）
    res_rows = fetch_all("reservations")
    res_without_order = [{**r, "order_id": None} for r in res_rows]
    schema = get_pg_schema("reservations")
    cols = [c for c in res_without_order[0].keys() if c in schema]
    filtered = [coerce_row({c: r[c] for c in cols}, schema) for r in res_without_order]
    col_str = ", ".join(f'"{c}"' for c in cols)
    val_str = ", ".join(f":{c}" for c in cols)
    with pg_engine.begin() as conn:
        conn.execute(text(f"INSERT INTO reservations ({col_str}) VALUES ({val_str})"), filtered)
    print(f"  reservations: {len(res_rows)} 筆（order_id 暫設 NULL）✓")

    # orders
    insert_all("orders", fetch_all("orders"))

    # order_items
    insert_all("order_items", fetch_all("order_items"))

    # 補回 reservations.order_id
    with pg_engine.begin() as conn:
        for r in res_rows:
            if r.get("order_id") is not None:
                conn.execute(text(
                    "UPDATE reservations SET order_id = :oid WHERE id = :id"
                ), {"oid": r["order_id"], "id": r["id"]})
    print("  reservations.order_id 補回完成 ✓")

    # reservation_items
    insert_all("reservation_items", fetch_all("reservation_items"))

    print("\n重設 PostgreSQL sequences...")
    reset_sequences()

    print("\n=== 遷移完成 ===")


if __name__ == "__main__":
    main()
