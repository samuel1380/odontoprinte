-- ====================================================================
-- MIGRATION: 20261015_fix_cases_updated_at.sql
-- GARANTE DEFAULT now() E PRESENÇA DE updated_at EM TABELAS DA FILA
--
-- 100% ADITIVA E SEGURA: apenas assegura que as colunas updated_at
-- existam e possuam DEFAULT now(), prevenindo violação de NOT NULL.
-- COMO APLICAR: Supabase Dashboard > SQL Editor > colar tudo > RUN
-- ====================================================================

-- 1. Tabela de Pacientes (cases)
ALTER TABLE IF EXISTS public.cases
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE IF EXISTS public.cases
    ALTER COLUMN updated_at SET DEFAULT now();

-- 2. Tabela de Trabalhos de Impressão (print_jobs)
ALTER TABLE IF EXISTS public.print_jobs
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE IF EXISTS public.print_jobs
    ALTER COLUMN updated_at SET DEFAULT now();

-- 3. Tabela de Modelos/Itens da Fila (print_job_items)
ALTER TABLE IF EXISTS public.print_job_items
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

ALTER TABLE IF EXISTS public.print_job_items
    ALTER COLUMN updated_at SET DEFAULT now();
