-- ====================================================================
-- MIGRATION: 20261012_print_queue_enhancements.sql
-- MELHORIAS NA FILA DE IMPRESSÃO 3D: UPLOAD RÁPIDO, LOTES,
-- DETECÇÃO DE DUPLICIDADE, REIMPRESSÕES E BACKUP AUTOMÁTICO
-- ====================================================================

-- 1. Ampliação segura da tabela print_job_items
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

-- 2. Tabela de Lotes / Placas de Impressão (Batches)
CREATE TABLE IF NOT EXISTS public.print_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    batch_name TEXT NOT NULL,
    printer_name TEXT,
    printer_id UUID REFERENCES public.printers(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'EM_PREPARO', -- EM_PREPARO, IMPRIMINDO, CONCLUIDO, FALHOU
    failure_reason TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 3. Tabela de Histórico de Transições de Status (Auditoria de Card)
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

-- 4. Índices para busca ultrarrápida
CREATE INDEX IF NOT EXISTS idx_print_job_items_file_hash ON public.print_job_items(file_hash);
CREATE INDEX IF NOT EXISTS idx_print_job_items_clinic ON public.print_job_items(clinic_name);
CREATE INDEX IF NOT EXISTS idx_print_job_items_cadista ON public.print_job_items(cadista_name);
CREATE INDEX IF NOT EXISTS idx_print_job_items_work_type ON public.print_job_items(work_type);
CREATE INDEX IF NOT EXISTS idx_print_job_items_batch ON public.print_job_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_print_job_items_backup ON public.print_job_items(backup_done);
CREATE INDEX IF NOT EXISTS idx_print_item_history_item ON public.print_item_history(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_batches_status ON public.print_batches(status);
