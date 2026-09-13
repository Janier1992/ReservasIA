-- ============================================================
-- La plataforma se está usando primero en Colombia: el default de moneda
-- 'USD' heredado del prompt original no aplica. Se cambia el default a
-- 'COP' para negocios nuevos y se corrigen los que ya quedaron en 'USD'
-- por no haber tenido un selector de moneda en el onboarding hasta ahora.
--
-- La plataforma sigue siendo genérica: currency queda como texto libre con
-- un selector en el dashboard (no se restringe a COP únicamente).
-- ============================================================
alter table public.business_profiles alter column currency set default 'COP';
alter table public.services alter column currency set default 'COP';

update public.business_profiles set currency = 'COP' where currency = 'USD';
update public.services set currency = 'COP' where currency = 'USD';
