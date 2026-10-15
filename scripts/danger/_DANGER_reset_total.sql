-- ====================================================================
-- ⛔ PERIGO: APAGA TODOS OS DADOS OPERACIONAIS (IRREVERSÍVEL) ⛔
-- NUNCA rode em produção com dados reais. Só para zerar um banco de TESTE.
-- Faça backup (Database > Backups) antes. Perfis de usuário são mantidos,
-- todo o resto (fila, mesas, calibrações, auditoria) é destruído.
-- ====================================================================

-- 1. Esvazia todas as tabelas operacionais em cascata mantendo a estrutura
TRUNCATE TABLE 
    public.audit_logs,
    public.print_item_history,
    public.print_batches,
    public.print_run_items,
    public.print_runs,
    public.print_job_items,
    public.print_jobs,
    public.cases,
    public.resin_calibrations,
    public.resin_batches,
    public.printer_maintenances,
    public.printers
RESTART IDENTITY CASCADE;

-- 2. Reinicia as sequências para que o próximo código de impressão seja A001
SELECT setval('print_run_normal_seq', 1, false);
SELECT setval('print_run_retry_seq', 1, false);

-- 3. Garante que as configurações base do sistema existam
INSERT INTO public.system_settings (
    maintenance_interval_days, calibration_hexagon_min, calibration_hexagon_max, normal_print_prefix, retry_print_prefix
)
SELECT 7, 9.99, 10.01, 'A', '00A'
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings);

-- PRONTO! O banco está 100% limpo e zerado para uso operacional.
