-- ============================================================
-- El dueño/admin de un negocio podía reactivar su propia cuenta suspendida
-- o extender su propio vencimiento: organizations_update_admin le permite
-- UPDATE de su organización y restrict_support_org_update deja pasar
-- cualquier cambio cuando quien actualiza es owner/admin. La app nunca lo
-- ofrece, pero un UPDATE directo contra la API sí funcionaba.
--
-- status y subscription_expires_at los cambian solo soporte (panel
-- /soporte), la Edge Function confirm-subscription-payment y el scheduler
-- de vencimiento del compute service — estos dos últimos con la clave
-- admin, que no es miembro de ninguna organización y por eso pasa.
-- ============================================================

create or replace function public.restrict_owner_billing_update()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, pg_temp
as $$
begin
  if (new.status is distinct from old.status
      or new.subscription_expires_at is distinct from old.subscription_expires_at)
    and public.is_org_admin_or_owner(new.id)
    and not public.is_support_staff()
  then
    raise exception 'El estado y el vencimiento de la suscripción solo los puede cambiar soporte';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_restrict_owner_billing_update on public.organizations;
create trigger trg_restrict_owner_billing_update
  before update on public.organizations
  for each row execute function public.restrict_owner_billing_update();
