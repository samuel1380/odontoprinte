-- ====================================================================
-- SCRIPT DE LIBERAÇÃO TOTAL DO SUPABASE (ODONTOPRINT)
-- Execute este script no SQL Editor do Supabase para desativar o RLS
-- e permitir que PC, Celular e Render salvem e leiam dados sem bloqueio!
-- ====================================================================

-- 1. Desativa o Row Level Security (RLS) que estava bloqueando o app
ALTER TABLE IF EXISTS public.printers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.printer_maintenances DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.resin_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.resin_calibrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cases DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.case_status_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_job_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_run_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.system_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles DISABLE ROW LEVEL SECURITY;

-- 2. Concede permissões totais para o perfil anon (chave usada pelo site no Render) e authenticated
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- 3. Garante que qualquer nova tabela ou sequência criada no futuro já venha liberada
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
