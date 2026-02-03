from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path


CREATE_REMARKS_SQL = """
CREATE TABLE IF NOT EXISTS remarks (
  date TEXT PRIMARY KEY,
  alias TEXT,
  remark TEXT,
  select_json TEXT,
  updated_at INTEGER
)
""".strip()


def migrate_db(db_path: Path) -> bool:
    try:
        conn = sqlite3.connect(db_path)
        try:
            conn.execute(CREATE_REMARKS_SQL)
            conn.commit()
        finally:
            conn.close()
        return True
    except Exception as exc:
        print(f"[fail] {db_path}: {exc}")
        return False


def main() -> int:
    parser = argparse.ArgumentParser(description="Add remarks table to all SQLite DBs in a folder.")
    parser.add_argument("--db-dir", default="db", help="Database folder path (default: db)")
    parser.add_argument("--pattern", default="*.db", help="Glob pattern for db files (default: *.db)")
    args = parser.parse_args()

    db_dir = Path(args.db_dir)
    if not db_dir.exists():
        print(f"[fail] db dir not found: {db_dir}")
        return 1

    db_files = sorted(db_dir.glob(args.pattern))
    if not db_files:
        print(f"[warn] no db files matched: {db_dir / args.pattern}")
        return 0

    ok = 0
    for db_path in db_files:
        if migrate_db(db_path):
            print(f"[ok] {db_path}")
            ok += 1

    print(f"[done] migrated {ok}/{len(db_files)} db files")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
