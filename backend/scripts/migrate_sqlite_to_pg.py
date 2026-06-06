"""
一次性遷移腳本：SQLite → PostgreSQL (Supabase)
使用 Transaction Pooler (port 6543)，每個 transaction 內 SET LOCAL statement_timeout = 0
執行方式：在 backend/ 目錄下執行
  PYTHONUNBUFFERED=1 python scripts/migrate_sqlite_to_pg.py
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from dotenv import load_dotenv  # type: ignore[import]

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from sqlmodel import create_engine, text

SQLITE_URL = f"sqlite:///{Path(__file__).resolve().parents[2] / 'data' / 'app.db'}"
BATCH_SIZE = 200

_raw_pg_url = os.environ["DATABASE_URL"]
PG_URL = _raw_pg_url.split("?")[0]  # strip ?pgbouncer=true

print(f"SQLite: {SQLITE_URL}", flush=True)
print(f"PG:     {PG_URL[:50]}...", flush=True)

sqlite_engine = create_engine(SQLITE_URL)
pg_engine = create_engine(PG_URL, pool_pre_ping=True)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def fetch_all(table: str) -> list[dict]:
    with sqlite_engine.connect() as conn:
        rows = conn.execute(text(f"SELECT * FROM {table}")).mappings().all()
        return [dict(r) for r in rows]


def get_pg_schema(table: str) -> dict[str, str]:
    with pg_engine.connect() as conn:
        result = conn.execute(text(
            "SELECT column_name, data_type FROM information_schema.columns "
            "WHERE table_name = :t AND table_schema = 'public'"
        ), {"t": table})
        return {row[0]: row[1] for row in result}


def coerce_row(row: dict, schema: dict[str, str]) -> dict:
    out = {}
    for k, v in row.items():
        if k in schema and schema[k] == "boolean" and isinstance(v, int):
            out[k] = bool(v)
        else:
            out[k] = v
    return out


def insert_all(table: str, rows: list[dict]) -> None:
    if not rows:
        print(f"  {table}: 0 筆，略過", flush=True)
        return

    schema = get_pg_schema(table)
    cols = [c for c in rows[0].keys() if c in schema]
    filtered_rows = [coerce_row({c: r[c] for c in cols}, schema) for r in rows]

    col_str = ", ".join(f'"{c}"' for c in cols)

    total = 0
    for i in range(0, len(filtered_rows), BATCH_SIZE):
        batch = filtered_rows[i : i + BATCH_SIZE]

        # Build multi-row VALUES INSERT — one round-trip instead of N executemany
        param_groups: list[str] = []
        all_params: dict = {}
        for j, row in enumerate(batch):
            placeholders = ", ".join(f":p{j}_{c}" for c in cols)
            param_groups.append(f"({placeholders})")
            for c in cols:
                all_params[f"p{j}_{c}"] = row[c]

        sql_multi = text(
            f"INSERT INTO {table} ({col_str}) VALUES {', '.join(param_groups)}"
        )
        with pg_engine.begin() as conn:
            conn.execute(text("SET LOCAL statement_timeout = 0"))
            conn.execute(sql_multi, all_params)
        total += len(batch)

    print(f"  {table}: {total} 筆 ✓", flush=True)


def reset_sequences() -> None:
    tables = [
        "vendors", "products", "members", "stock_entries",
        "orders", "order_items", "reservations", "reservation_items",
    ]
    with pg_engine.begin() as conn:
        conn.execute(text("SET LOCAL statement_timeout = 0"))
        for table in tables:
            conn.execute(text(f"""
                SELECT setval(
                    pg_get_serial_sequence('{table}', 'id'),
                    COALESCE((SELECT MAX(id) FROM {table}), 0) + 1,
                    false
                )
            """))
    print("  sequences 重設完成 ✓", flush=True)


# ---------------------------------------------------------------------------
# Cleanup
# ---------------------------------------------------------------------------

def cleanup() -> None:
    print("清空資料表...", flush=True)
    stmts = [
        "DELETE FROM reservation_items",
        "DELETE FROM order_items",
        "UPDATE orders SET reservation_id = NULL",
        "DELETE FROM reservations",
        "DELETE FROM orders",
        "UPDATE stock_entries SET product_id = NULL",
        "DELETE FROM stock_entries",
        "DELETE FROM members",
        "DELETE FROM products",
        "DELETE FROM vendors",
    ]
    with pg_engine.begin() as conn:
        conn.execute(text("SET LOCAL statement_timeout = 0"))
        for stmt in stmts:
            print(f"  執行: {stmt}", flush=True)
            conn.execute(text(stmt))
    print("  所有表清空完成 ✓", flush=True)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main() -> None:
    print("=== SQLite → Supabase 遷移開始 ===\n", flush=True)

    cleanup()

    # Build valid ID sets from SQLite source (avoids PgBouncer read-after-write issues)
    with sqlite_engine.connect() as conn:
        valid_vendor_ids: set = {
            r[0] for r in conn.execute(text("SELECT id FROM vendors")).fetchall()
        }
        valid_product_ids: set = {
            r[0] for r in conn.execute(text("SELECT id FROM products")).fetchall()
        }
        valid_member_ids: set = {
            r[0] for r in conn.execute(text("SELECT id FROM members")).fetchall()
        }
        barcode_to_pid: dict = {
            r[0]: r[1]
            for r in conn.execute(
                text("SELECT barcode, id FROM products WHERE barcode IS NOT NULL")
            ).fetchall()
        }

    # --- vendors ---
    print("\n插入 vendors...", flush=True)
    insert_all("vendors", fetch_all("vendors"))

    # --- products (sanitize orphaned vendor_id) ---
    print("插入 products...", flush=True)
    products = fetch_all("products")
    vendor_fixed = 0
    fixed_products = []
    for r in products:
        if r.get("vendor_id") not in valid_vendor_ids:
            r = {**r, "vendor_id": None}
            vendor_fixed += 1
        fixed_products.append(r)
    if vendor_fixed:
        print(f"    ⚠ products.vendor_id: {vendor_fixed} 筆孤立引用設為 NULL", flush=True)
    insert_all("products", fixed_products)

    # --- stock_entries (orphaned product_id → barcode fallback → skip) ---
    print("插入 stock_entries...", flush=True)
    stock = fetch_all("stock_entries")
    resolved = skipped_stock = 0
    fixed_stock = []
    for r in stock:
        pid = r.get("product_id")
        if pid not in valid_product_ids:
            fallback = barcode_to_pid.get(r.get("barcode"))
            if fallback:
                r = {**r, "product_id": fallback}
                resolved += 1
            else:
                skipped_stock += 1
                continue
        fixed_stock.append(r)
    if resolved:
        print(f"    ⚠ stock_entries: {resolved} 筆孤立 product_id 已用 barcode 回填", flush=True)
    if skipped_stock:
        print(f"    ⚠ stock_entries: {skipped_stock} 筆孤立 product_id 無法回填，略過", flush=True)
    insert_all("stock_entries", fixed_stock)

    # --- members ---
    print("插入 members...", flush=True)
    insert_all("members", fetch_all("members"))

    # --- reservations (orphaned product_id → skip; circular order_id → NULL first) ---
    print("插入 reservations...", flush=True)
    res_rows = fetch_all("reservations")
    skipped_reservation_ids: set = set()
    fixed_res = []
    res_skipped = 0
    for r in res_rows:
        if r.get("product_id") not in valid_product_ids:
            skipped_reservation_ids.add(r["id"])
            res_skipped += 1
            continue
        if r.get("member_id") not in valid_member_ids:
            r = {**r, "member_id": None}
        fixed_res.append(r)
    if res_skipped:
        print(f"    ⚠ reservations: {res_skipped} 筆孤立 product_id（商品已刪除），略過", flush=True)

    # Insert without order_id first to break circular FK
    if fixed_res:
        schema = get_pg_schema("reservations")
        res_without_order = [{**r, "order_id": None} for r in fixed_res]
        cols = [c for c in res_without_order[0].keys() if c in schema]
        col_str_res = ", ".join(f'"{c}"' for c in cols)
        filtered = [coerce_row({c: r[c] for c in cols}, schema) for r in res_without_order]
        total = 0
        for i in range(0, len(filtered), BATCH_SIZE):
            batch = filtered[i : i + BATCH_SIZE]
            param_groups = []
            all_params: dict = {}
            for j, row in enumerate(batch):
                placeholders = ", ".join(f":p{j}_{c}" for c in cols)
                param_groups.append(f"({placeholders})")
                for c in cols:
                    all_params[f"p{j}_{c}"] = row[c]
            sql_multi = text(
                f"INSERT INTO reservations ({col_str_res}) VALUES {', '.join(param_groups)}"
            )
            with pg_engine.begin() as conn:
                conn.execute(text("SET LOCAL statement_timeout = 0"))
                conn.execute(sql_multi, all_params)
            total += len(batch)
        print(f"  reservations: {total} 筆（order_id 暫設 NULL）✓", flush=True)
    else:
        print("  reservations: 0 筆，略過", flush=True)

    valid_reservation_ids = {r["id"] for r in fixed_res}

    # --- orders (sanitize reservation_id for skipped reservations) ---
    print("插入 orders...", flush=True)
    orders = fetch_all("orders")
    fixed_orders = []
    order_res_fixed = 0
    for r in orders:
        rid = r.get("reservation_id")
        if rid is not None and rid not in valid_reservation_ids:
            r = {**r, "reservation_id": None}
            order_res_fixed += 1
        if r.get("member_id") not in valid_member_ids:
            r = {**r, "member_id": None}
        fixed_orders.append(r)
    if order_res_fixed:
        print(f"    ⚠ orders: {order_res_fixed} 筆 reservation_id 設為 NULL（預約已略過）", flush=True)
    insert_all("orders", fixed_orders)

    valid_order_ids = {r["id"] for r in fixed_orders}

    # --- order_items (skip orphaned order_id or product_id) ---
    print("插入 order_items...", flush=True)
    order_items = fetch_all("order_items")
    fixed_oi = []
    oi_skipped = 0
    for r in order_items:
        if r.get("order_id") not in valid_order_ids:
            oi_skipped += 1
            continue
        if r.get("product_id") not in valid_product_ids:
            oi_skipped += 1
            continue
        fixed_oi.append(r)
    if oi_skipped:
        print(f"    ⚠ order_items: {oi_skipped} 筆孤立引用，略過", flush=True)
    insert_all("order_items", fixed_oi)

    # --- Restore reservations.order_id ---
    print("補回 reservations.order_id...", flush=True)
    with pg_engine.begin() as conn:
        conn.execute(text("SET LOCAL statement_timeout = 0"))
        for r in fixed_res:
            oid = r.get("order_id")
            if oid is not None and oid in valid_order_ids:
                conn.execute(
                    text("UPDATE reservations SET order_id = :oid WHERE id = :id"),
                    {"oid": oid, "id": r["id"]},
                )
    print("  reservations.order_id 補回完成 ✓", flush=True)

    # --- reservation_items (skip orphaned reservation_id or product_id) ---
    print("插入 reservation_items...", flush=True)
    res_items = fetch_all("reservation_items")
    fixed_ri = []
    ri_skipped = 0
    for r in res_items:
        if r.get("reservation_id") not in valid_reservation_ids:
            ri_skipped += 1
            continue
        if r.get("product_id") not in valid_product_ids:
            ri_skipped += 1
            continue
        fixed_ri.append(r)
    if ri_skipped:
        print(f"    ⚠ reservation_items: {ri_skipped} 筆孤立引用，略過", flush=True)
    insert_all("reservation_items", fixed_ri)

    print("\n重設 PostgreSQL sequences...", flush=True)
    reset_sequences()

    print("\n=== 遷移完成 ===", flush=True)


if __name__ == "__main__":
    main()
