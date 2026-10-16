-- ====================================================================
-- MIGRATION: 20261018_printer_plate_size.sql
-- Medidas da mesa/chapa por impressora (montagem automática da mesa).
--
-- 100% segura para re-rodar (só ADD COLUMN IF NOT EXISTS).
-- Aplicada sozinha a cada deploy (npm run db:migrate).
-- ====================================================================

ALTER TABLE public.printers
    ADD COLUMN IF NOT EXISTS plate_width_mm NUMERIC,
    ADD COLUMN IF NOT EXISTS plate_depth_mm NUMERIC,
    ADD COLUMN IF NOT EXISTS plate_height_mm NUMERIC;
