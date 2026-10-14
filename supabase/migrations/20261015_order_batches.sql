-- ====================================================================
-- MIGRATION: 20261015_order_batches.sql
-- PEDIDOS (LOTES) NUMERADOS: "Impressão #1, #2, ..."
--
-- 100% ADITIVA E SEGURA: só adiciona a coluna batch_number, a sequência
-- e preenche os lotes antigos por ordem de criação. Nada é apagado.
-- COMO APLICAR: Supabase Dashboard > SQL Editor > colar tudo > RUN
-- ====================================================================

CREATE SEQUENCE IF NOT EXISTS print_batch_number_seq START WITH 1 INCREMENT BY 1;

ALTER TABLE public.print_batches
    ADD COLUMN IF NOT EXISTS batch_number INT;

-- Preenche lotes antigos sem número, por ordem de criação
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

-- Padrão para novos lotes + sequência sincronizada
ALTER TABLE public.print_batches
    ALTER COLUMN batch_number SET DEFAULT nextval('print_batch_number_seq');

SELECT setval(
    'print_batch_number_seq',
    COALESCE((SELECT MAX(batch_number) FROM public.print_batches), 0) + 1,
    false
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_print_batches_number_unique
    ON public.print_batches(batch_number);
