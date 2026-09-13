-- ============================================================
-- Extensiones requeridas
-- ============================================================
create extension if not exists pgcrypto;      -- gen_random_uuid()
create extension if not exists btree_gist;     -- EXCLUDE constraints con igualdad + rangos (anti doble-reserva)

-- Las funciones auxiliares de RLS (get_user_organization_ids, is_org_member,
-- etc.) viven en 20260830120250_rls-helpers.sql, DESPUÉS de crear
-- organizations y organization_members: son `language sql`, y a diferencia
-- de plpgsql, Postgres valida sus referencias a tablas en el momento de
-- CREATE FUNCTION, no en el primer uso. Si organization_members todavía no
-- existe, la migración falla con "relation does not exist".
