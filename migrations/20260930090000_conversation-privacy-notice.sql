-- ============================================================
-- Aviso de privacidad para nichos de salud (odontología, clínica,
-- fisioterapia, veterinaria): el motivo de consulta o los datos de la
-- mascota que el agente anota son información sensible. Este flag por
-- conversación asegura que el aviso se mande UNA vez, de forma
-- determinística (lo antepone el código en agentRuntime.ts, no depende de
-- que el modelo se acuerde de decirlo) antes de la primera respuesta real
-- del agente en esa conversación.
-- ============================================================
alter table public.conversations
  add column if not exists privacy_notice_sent_at timestamptz;
