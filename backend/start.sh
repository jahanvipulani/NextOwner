#!/bin/sh
# Waits for the database, applies migrations, then starts the API.
set -e
python - <<'PY'
import os, sys, time
from sqlalchemy import create_engine, text
url = os.environ.get("DATABASE_URL", "sqlite:///./nextowner_dev.db")
for attempt in range(40):
    try:
        with create_engine(url).connect() as c:
            c.execute(text("select 1"))
        print("database is ready")
        break
    except Exception as exc:  # noqa: BLE001
        print(f"waiting for database ({attempt + 1}/40): {exc.__class__.__name__}")
        time.sleep(2)
else:
    sys.exit("database never became ready")
PY
alembic upgrade head
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
