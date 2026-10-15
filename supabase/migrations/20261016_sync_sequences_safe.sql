-- ====================================================================
-- MIGRATION: 20261016_sync_sequences_safe.sql
-- Sincroniza as sequências de código de impressão com os dados existentes.
--
-- Motivo: os códigos (A001, 00A001...) agora vêm da sequência atômica do
-- banco via RPC generate_print_run_code. Se a sequência estiver atrasada,
-- a primeira ordem geraria código duplicado.
--
-- 100% segura para re-rodar: nunca zera, só avança para MAX+1.
-- Aplicada automaticamente a cada deploy (npm run db:migrate).
-- ====================================================================

-- Sequência dos códigos normais (A001, A002...) a partir do maior em uso
SELECT setval(
    'print_run_normal_seq',
    COALESCE(
        (SELECT MAX(CAST(SUBSTRING(run_code FROM '[0-9]+$') AS INTEGER))
         FROM public.print_runs WHERE run_code !~ '^00A' AND run_code ~ '[0-9]'),
        0
    ) + 1,
    false
);

-- Sequência dos códigos de reimpressão (00A001, 00A002...)
SELECT setval(
    'print_run_retry_seq',
    COALESCE(
        (SELECT MAX(CAST(SUBSTRING(run_code FROM '[0-9]+$') AS INTEGER))
         FROM public.print_runs WHERE run_code ~ '^00A'),
        0
    ) + 1,
    false
);

-- Numeração das mesas acompanha o maior número existente
SELECT setval(
    'print_batch_number_seq',
    COALESCE((SELECT MAX(batch_number) FROM public.print_batches), 0) + 1,
    false
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_print_batches_number_unique
    ON public.print_batches(batch_number);
