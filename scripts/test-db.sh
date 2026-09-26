#!/usr/bin/env bash
# Aplica todas las migraciones sobre un Postgres VACÍO (con el stub de
# InsForge) y corre los tests de RLS de db-tests/. Lo usa CI; localmente:
#
#   PGHOST=localhost PGUSER=postgres PGPASSWORD=postgres PGDATABASE=postgres scripts/test-db.sh
#
# Nunca apuntarlo a un proyecto InsForge real: crea roles, esquemas y datos.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PSQL=(psql -v ON_ERROR_STOP=1 -q)

echo "== stub de InsForge"
"${PSQL[@]}" -f "$ROOT/db-tests/insforge-stub.sql"

echo "== migraciones"
for file in "$ROOT"/migrations/*.sql; do
  echo "   $(basename "$file")"
  "${PSQL[@]}" -f "$file" 2>&1 | grep -v NOTICE || true
  # grep -v devuelve 1 si no hay salida; el error real lo corta ON_ERROR_STOP.
  test "${PIPESTATUS[0]}" -eq 0
done

echo "== usuarios de prueba"
"${PSQL[@]}" -c "insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'owner-a@test.local'),
  ('00000000-0000-0000-0000-000000000002', 'owner-b@test.local'),
  ('00000000-0000-0000-0000-000000000003', 'staff-a@test.local'),
  ('00000000-0000-0000-0000-00000000000a', 'support@test.local')
  on conflict do nothing"

for test_file in "$ROOT"/db-tests/tenant-isolation.sql "$ROOT"/db-tests/modules-billing-walkins.sql; do
  echo "== $(basename "$test_file")"
  "${PSQL[@]}" -f "$test_file" 2>&1 | grep -E "OK:|FAIL|ERROR" | sed 's/.*NOTICE:  /   /'
  test "${PIPESTATUS[0]}" -eq 0
done

echo "== todo OK"
