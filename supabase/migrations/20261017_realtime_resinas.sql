-- ====================================================================
-- MIGRATION: 20261017_realtime_resinas.sql
-- Inclui resin_batches e resin_calibrations na publicação Realtime.
--
-- Motivo: o app assina mudanças dessas tabelas (selo de sincronia e
-- atualização entre aparelhos); sem estar na publicação, os eventos de
-- resina nunca chegam.
--
-- 100% segura para re-rodar (blocos com EXCEPTION). Aplicada sozinha
-- a cada deploy (npm run db:migrate).
-- ====================================================================

DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.resin_batches;
    EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null; END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.resin_calibrations;
    EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null; END;
END $$;
