-- ====================================================================
-- MIGRATION: 20261013_fix_print_queue_concluido.sql
-- CORREÇÃO: fila de impressão não avançava para CONCLUÍDO
--
-- Causas encontradas:
--  1) setup_completo.sql (rodado em produção) NÃO tinha as colunas extras
--     da fila avançada (clinic_name, file_name, backup_*, batch_*, etc.)
--     nem as tabelas print_batches / print_item_history.
--     -> updates/inserts no Supabase falhavam e o merge preferia o dado
--     remoto antigo, revertendo a tela ("não vai para o próximo").
--  2) finalize_print_run (RPC) marcava sucesso como CONCLUIDO direto,
--     pulando a bancada de acabamento (PRONTO_ACABAMENTO).
--  3) Lógica de job pai checava apenas CONCLUIDO, nunca fechava quando
--     o item estava em PRONTO_ACABAMENTO.
--
-- COMO APLICAR (Supabase Cloud):
--  1. Abra o projeto no Supabase Dashboard > SQL Editor
--  2. Cole ESTE arquivo inteiro e clique em RUN
--  3. É idempotente: pode rodar quantas vezes quiser
-- ====================================================================

-- 1. Garante colunas extras em print_job_items (mesmas de 20261012)
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

-- Garante updated_at (alguns bancos antigos não têm)
ALTER TABLE public.print_job_items
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- 2. Tabelas da fila avançada
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

-- 3. Índices
CREATE INDEX IF NOT EXISTS idx_print_job_items_file_hash ON public.print_job_items(file_hash);
CREATE INDEX IF NOT EXISTS idx_print_job_items_clinic ON public.print_job_items(clinic_name);
CREATE INDEX IF NOT EXISTS idx_print_job_items_cadista ON public.print_job_items(cadista_name);
CREATE INDEX IF NOT EXISTS idx_print_job_items_work_type ON public.print_job_items(work_type);
CREATE INDEX IF NOT EXISTS idx_print_job_items_batch ON public.print_job_items(batch_id);
CREATE INDEX IF NOT EXISTS idx_print_job_items_backup ON public.print_job_items(backup_done);
CREATE INDEX IF NOT EXISTS idx_print_item_history_item ON public.print_item_history(item_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_print_batches_status ON public.print_batches(status);

-- 4. Garante valor PRONTO_ACABAMENTO no enum (etapa "Impresso" -> bancada)
DO $$ BEGIN
    ALTER TYPE print_item_status ADD VALUE IF NOT EXISTS 'PRONTO_ACABAMENTO';
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- 5. RPC CORRIGIDA: sucesso vai para PRONTO_ACABAMENTO (bancada),
--    falha volta para AGUARDANDO_FILA como reimpressão.
--    Job pai fecha (CONCLUIDO) quando não há pendentes fora de
--    (PRONTO_ACABAMENTO, CONCLUIDO).
CREATE OR REPLACE FUNCTION public.finalize_print_run(
    p_run_id UUID,
    p_failed_item_ids UUID[],
    p_failure_reasons TEXT[],
    p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
    v_run RECORD;
    v_run_item RECORD;
    v_is_failed BOOLEAN;
    v_reason TEXT;
    v_idx INT;
    v_completed_count INT := 0;
    v_failed_count INT := 0;
    v_job_id UUID;
    v_pending_in_job INT;
BEGIN
    SELECT * INTO v_run FROM public.print_runs WHERE id = p_run_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Ordem de impressão % não encontrada', p_run_id;
    END IF;

    IF v_run.status = 'FINALIZADA' THEN
        RAISE EXCEPTION 'Esta ordem de impressão já foi finalizada anteriormente';
    END IF;

    UPDATE public.print_runs
    SET status = 'FINALIZADA', finished_at = now(), updated_at = now()
    WHERE id = p_run_id;

    FOR v_run_item IN
        SELECT pri.*, pji.print_job_id
        FROM public.print_run_items pri
        JOIN public.print_job_items pji ON pji.id = pri.print_job_item_id
        WHERE pri.print_run_id = p_run_id
    LOOP
        v_is_failed := false;
        v_reason := NULL;

        IF p_failed_item_ids IS NOT NULL AND array_length(p_failed_item_ids, 1) > 0 THEN
            FOR v_idx IN 1..array_length(p_failed_item_ids, 1) LOOP
                IF p_failed_item_ids[v_idx] = v_run_item.print_job_item_id THEN
                    v_is_failed := true;
                    IF p_failure_reasons IS NOT NULL AND array_length(p_failure_reasons, 1) >= v_idx THEN
                        v_reason := p_failure_reasons[v_idx];
                    END IF;
                    EXIT;
                END IF;
            END LOOP;
        END IF;

        IF v_is_failed THEN
            v_failed_count := v_failed_count + 1;

            UPDATE public.print_run_items
            SET result = 'FALHOU', failure_reason = v_reason
            WHERE id = v_run_item.id;

            UPDATE public.print_job_items
            SET
                status = 'AGUARDANDO_FILA',
                retry_count = retry_count + 1,
                is_retry = true,
                last_failure_reason = v_reason,
                last_run_code = v_run.run_code,
                updated_at = now()
            WHERE id = v_run_item.print_job_item_id;
        ELSE
            v_completed_count := v_completed_count + 1;

            UPDATE public.print_run_items
            SET result = 'CONCLUIDO'
            WHERE id = v_run_item.id;

            -- SUCESSO NA IMPRESSÃO = vai para a bancada de acabamento,
            -- NÃO direto para CONCLUIDO. O CONCLUIDO final acontece no
            -- approve da bancada (ou avanço manual IMPRESSO->CONCLUIDO).
            UPDATE public.print_job_items
            SET status = 'PRONTO_ACABAMENTO', last_run_code = v_run.run_code, updated_at = now()
            WHERE id = v_run_item.print_job_item_id;
        END IF;

        v_job_id := v_run_item.print_job_id;
        SELECT COUNT(*) INTO v_pending_in_job
        FROM public.print_job_items
        WHERE print_job_id = v_job_id
          AND status NOT IN ('PRONTO_ACABAMENTO', 'CONCLUIDO');

        IF v_pending_in_job = 0 THEN
            UPDATE public.print_jobs SET status = 'CONCLUIDO', updated_at = now() WHERE id = v_job_id;
        ELSE
            UPDATE public.print_jobs SET status = 'PARCIAL', updated_at = now() WHERE id = v_job_id;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'run_code', v_run.run_code,
        'completed', v_completed_count,
        'failed', v_failed_count
    );
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- 6. Realtime (não falha se já existir)
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.print_job_items;
    EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null; END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.print_jobs;
    EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null; END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.print_runs;
    EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null; END;
END $$;

-- 7. Permissões operacionais (bancada sem bloqueios RLS)
ALTER TABLE IF EXISTS public.print_job_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_run_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_item_history DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;
