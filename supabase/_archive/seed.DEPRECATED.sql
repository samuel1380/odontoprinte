-- ====================================================================
-- SEED DATA - ODONTOPRINT (AMBIENTE LIMPO PARA PRODUÇÃO)
-- ====================================================================
-- Este arquivo foi propositalmente limpo para uso operacional real.
-- Nenhum caso fictício, impressora de teste ou fila falsa é adicionada.

-- 1. CONFIGURAÇÕES BASE DO SISTEMA
INSERT INTO public.system_settings (
    maintenance_interval_days,
    calibration_hexagon_min,
    calibration_hexagon_max,
    normal_print_prefix,
    retry_print_prefix
)
SELECT 7, 9.99, 10.01, 'A', '00A'
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings);

-- 2. SEQUÊNCIAS INICIAIS
SELECT setval('print_run_normal_seq', 1, false);
SELECT setval('print_run_retry_seq', 1, false);
