-- ====================================================================
-- MIGRATION: 20261014_fix_mesa_print_jobs_prod.sql
-- CORRIGE "Falha ao gravar trabalhos / pacientes" ao criar MESA no Render
--
-- Causa raiz no banco de PRODUÇÃO (Supabase):
--  1) RLS ainda ATIVO em cases / print_jobs / print_batches /
--     print_item_history -> o anon key usado pelo site no Render recebe
--     "new row violates row-level security policy" no INSERT.
--     (O script LIBERAR_BANCO_SEM_BLOQUEIOS.sql não incluía print_batches
--      nem print_item_history.)
--  2) Coluna updated_at sem DEFAULT now() -> violação de NOT NULL.
--  3) Coluna print_batches.batch_number / sequência ausentes -> insert
--     de mesa falha ou gera número duplicado.
--
-- 100% ADITIVO E SEGURO: só ADD COLUMN IF NOT EXISTS, CREATE TABLE/INDEX
-- IF NOT EXISTS, DISABLE RLS e GRANTs. Nada é apagado.
-- COMO APLICAR: Supabase Dashboard > SQL Editor > colar tudo > RUN
-- ====================================================================

-- 1. updated_at com DEFAULT now() nas 3 tabelas da fila
ALTER TABLE IF EXISTS public.cases
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS public.cases
    ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE IF EXISTS public.print_jobs
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS public.print_jobs
    ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE IF EXISTS public.print_job_items
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE IF EXISTS public.print_job_items
    ALTER COLUMN updated_at SET DEFAULT now();

-- 2. Colunas de metadados da fila (sem conteúdo 3D no banco)
ALTER TABLE public.print_job_items
    ADD COLUMN IF NOT EXISTS clinic_name TEXT,
    ADD COLUMN IF NOT EXISTS cadista_name TEXT,
    ADD COLUMN IF NOT EXISTS work_type TEXT,
    ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'NORMAL',
    ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS material TEXT,
    ADD COLUMN IF NOT EXISTS quantity INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS file_name TEXT,
    ADD COLUMN IF NOT EXISTS file_size BIGINT,
    ADD COLUMN IF NOT EXISTS file_hash TEXT,
    ADD COLUMN IF NOT EXISTS file_url TEXT,
    ADD COLUMN IF NOT EXISTS backup_path TEXT,
    ADD COLUMN IF NOT EXISTS backup_done BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS backup_done_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS batch_id UUID,
    ADD COLUMN IF NOT EXISTS batch_name TEXT,
    ADD COLUMN IF NOT EXISTS parent_item_id UUID REFERENCES public.print_job_items(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS reprint_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS reprint_reason TEXT;

-- 3. Tabelas de mesa (lotes) + histórico
CREATE TABLE IF NOT EXISTS public.print_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_name TEXT NOT NULL,
    printer_name TEXT,
    printer_id UUID REFERENCES public.printers(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'EM_PREPARO',
    failure_reason TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.print_item_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    item_id UUID NOT NULL REFERENCES public.print_job_items(id) ON DELETE CASCADE,
    from_status TEXT,
    to_status TEXT NOT NULL,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    changed_by_name TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Numeração da mesa: Impressão #1, #2, ...
CREATE SEQUENCE IF NOT EXISTS print_batch_number_seq START WITH 1 INCREMENT BY 1;

ALTER TABLE public.print_batches
    ADD COLUMN IF NOT EXISTS batch_number INT;

WITH numbered AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
    FROM public.print_batches
    WHERE batch_number IS NULL
)
UPDATE public.print_batches b
SET batch_number = numbered.rn + COALESCE(
    (SELECT MAX(batch_number) FROM public.print_batches WHERE batch_number IS NOT NULL), 0
)
FROM numbered
WHERE b.id = numbered.id;

ALTER TABLE public.print_batches
    ALTER COLUMN batch_number SET DEFAULT nextval('print_batch_number_seq');

SELECT setval(
    'print_batch_number_seq',
    COALESCE((SELECT MAX(batch_number) FROM public.print_batches), 0) + 1,
    false
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_print_batches_number_unique
    ON public.print_batches(batch_number);

-- 5. Índices da fila
CREATE INDEX IF NOT EXISTS idx_print_job_items_file_hash ON public.print_job_items(file_hash);
CREATE INDEX IF NOT EXISTS idx_print_job_items_file_name ON public.print_job_items(file_name);
CREATE INDEX IF NOT EXISTS idx_print_job_items_clinic ON public.print_job_items(clinic_name);
CREATE INDEX IF NOT EXISTS idx_print_job_items_cadista ON public.print_job_items(cadista_name);
CREATE INDEX IF NOT EXISTS idx_print_job_items_work_type ON public.print_job_items(work_type);
CREATE INDEX IF NOT EXISTS idx_print_job_items_batch ON public.print_job_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_print_job_items_updated ON public.print_job_items(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_item_history_item ON public.print_item_history(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_batches_status ON public.print_batches(status);

-- 6. LIBERAÇÃO TOTAL (o app no Render usa a ANON KEY, sem login por role):
--    desativa RLS em TODAS as tabelas da fila, incluindo as duas que
--    faltavam no script antigo (print_batches, print_item_history).
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
ALTER TABLE IF EXISTS public.print_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_item_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.system_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- 7. Realtime entre aparelhos
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.print_job_items;
    EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null; END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;
    EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null; END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.cases;
    EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null; END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.print_batches;
    EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null; END;
END $$;
