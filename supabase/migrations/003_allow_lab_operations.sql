-- ====================================================================
-- MIGRATION 003: PERMISSÕES OPERACIONAIS DE BANCADA (ODONTOPRINT)
-- Garante persistência irrestrita de impressoras, resinas, calibrações e trabalhos
-- ====================================================================

-- 1. CONCESSÃO DE PERMISSÕES NAS TABELAS
GRANT ALL ON TABLE public.printers TO anon, authenticated;
GRANT ALL ON TABLE public.printer_maintenances TO anon, authenticated;
GRANT ALL ON TABLE public.resin_batches TO anon, authenticated;
GRANT ALL ON TABLE public.resin_calibrations TO anon, authenticated;
GRANT ALL ON TABLE public.cases TO anon, authenticated;
GRANT ALL ON TABLE public.case_status_events TO anon, authenticated;
GRANT ALL ON TABLE public.print_jobs TO anon, authenticated;
GRANT ALL ON TABLE public.print_job_items TO anon, authenticated;
GRANT ALL ON TABLE public.print_runs TO anon, authenticated;
GRANT ALL ON TABLE public.print_run_items TO anon, authenticated;
GRANT ALL ON TABLE public.system_settings TO anon, authenticated;
GRANT ALL ON TABLE public.audit_logs TO anon, authenticated;

-- 2. POLÍTICAS DE RLS PARA OPERAÇÃO DO LABORATÓRIO
DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow lab printer access" ON public.printers;
    CREATE POLICY "Allow lab printer access" ON public.printers FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow lab printer_maintenances access" ON public.printer_maintenances;
    CREATE POLICY "Allow lab printer_maintenances access" ON public.printer_maintenances FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow lab resin_batches access" ON public.resin_batches;
    CREATE POLICY "Allow lab resin_batches access" ON public.resin_batches FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow lab resin_calibrations access" ON public.resin_calibrations;
    CREATE POLICY "Allow lab resin_calibrations access" ON public.resin_calibrations FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow lab cases access" ON public.cases;
    CREATE POLICY "Allow lab cases access" ON public.cases FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow lab case_events access" ON public.case_status_events;
    CREATE POLICY "Allow lab case_events access" ON public.case_status_events FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow lab print_jobs access" ON public.print_jobs;
    CREATE POLICY "Allow lab print_jobs access" ON public.print_jobs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow lab print_job_items access" ON public.print_job_items;
    CREATE POLICY "Allow lab print_job_items access" ON public.print_job_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow lab print_runs access" ON public.print_runs;
    CREATE POLICY "Allow lab print_runs access" ON public.print_runs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow lab print_run_items access" ON public.print_run_items;
    CREATE POLICY "Allow lab print_run_items access" ON public.print_run_items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow lab system_settings access" ON public.system_settings;
    CREATE POLICY "Allow lab system_settings access" ON public.system_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow lab audit_logs access" ON public.audit_logs;
    CREATE POLICY "Allow lab audit_logs access" ON public.audit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN OTHERS THEN
    null;
END $$;
