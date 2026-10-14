-- ====================================================================
-- MIGRATION: 20261014_queue_central_db_metadata_only.sql
-- FILA 100% NO BANCO CENTRAL, SOMENTE METADADOS (SEM CONTEÚDO 3D)
--
-- Contexto: a fila era salva primeiro no navegador (localStorage) e o
-- envio ao Supabase ignorava erros, então aparelhos diferentes viam
-- filas diferentes. O conteúdo do arquivo 3D nunca deve ir ao banco.
--
-- ESTA MIGRATION É 100% ADITIVA E SEGURA:
--  - Não apaga nenhum registro, tabela ou coluna.
--  - Não apaga nenhum arquivo (o banco nunca guardou conteúdo 3D;
--    a coluna file_url contém no máximo marcadores de texto curtos).
--  - Pode rodar quantas vezes quiser (idempotente).
--
-- COMO APLICAR: Supabase Dashboard > SQL Editor > colar tudo > RUN
-- ====================================================================

-- 1. Garante todas as colunas de metadados da fila
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

ALTER TABLE public.print_job_items
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Tabelas da fila (lotes + histórico de status)
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

-- 3. Índices (leitura rápida em qualquer aparelho + duplicidade por hash)
CREATE INDEX IF NOT EXISTS idx_print_job_items_file_hash ON public.print_job_items(file_hash);
CREATE INDEX IF NOT EXISTS idx_print_job_items_file_name ON public.print_job_items(file_name);
CREATE INDEX IF NOT EXISTS idx_print_job_items_clinic ON public.print_job_items(clinic_name);
CREATE INDEX IF NOT EXISTS idx_print_job_items_cadista ON public.print_job_items(cadista_name);
CREATE INDEX IF NOT EXISTS idx_print_job_items_work_type ON public.print_job_items(work_type);
CREATE INDEX IF NOT EXISTS idx_print_job_items_batch ON public.print_job_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_print_job_items_updated ON public.print_job_items(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_item_history_item ON public.print_item_history(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_batches_status ON public.print_batches(status);

-- 4. Permissões: leitura e escrita para todos os aparelhos do laboratório
ALTER TABLE IF EXISTS public.print_job_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cases DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_item_history DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- 5. Realtime (atualização entre aparelhos)
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
END $$;
