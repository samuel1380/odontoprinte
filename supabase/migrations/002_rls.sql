-- ====================================================================
-- MIGRATION 002: ROW LEVEL SECURITY (RLS) - ODONTOPRINT
-- ====================================================================

-- 1. HELPER FUNCTION TO GET CURRENT USER ROLE
CREATE OR REPLACE FUNCTION public.get_my_role()
RETURNS user_role AS $$
DECLARE
    v_role user_role;
BEGIN
    SELECT role INTO v_role
    FROM public.profiles
    WHERE id = auth.uid();
    
    RETURN v_role;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- 2. ENABLE RLS ON ALL TABLES
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.case_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_job_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.printers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.printer_maintenances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resin_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resin_calibrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.print_run_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- 3. PROFILES POLICIES
DROP POLICY IF EXISTS "Profiles are readable by authenticated users" ON public.profiles;
CREATE POLICY "Profiles are readable by authenticated users"
ON public.profiles FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Profiles can be updated by owner or admin" ON public.profiles;
CREATE POLICY "Profiles can be updated by owner or admin"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid() OR public.get_my_role() = 'ADMIN');

DROP POLICY IF EXISTS "Admins can insert/delete profiles" ON public.profiles;
CREATE POLICY "Admins can insert/delete profiles"
ON public.profiles FOR ALL
TO authenticated
USING (public.get_my_role() = 'ADMIN');

-- 4. SYSTEM SETTINGS POLICIES
DROP POLICY IF EXISTS "System settings are readable by authenticated users" ON public.system_settings;
CREATE POLICY "System settings are readable by authenticated users"
ON public.system_settings FOR SELECT
TO authenticated, anon
USING (true);

DROP POLICY IF EXISTS "System settings can be updated by admin" ON public.system_settings;
CREATE POLICY "System settings can be updated by admin"
ON public.system_settings FOR UPDATE
TO authenticated
USING (public.get_my_role() = 'ADMIN');

-- 5. CASES POLICIES
DROP POLICY IF EXISTS "Cases are readable by all authenticated staff" ON public.cases;
CREATE POLICY "Cases are readable by all authenticated staff"
ON public.cases FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Cases insertable by CADISTA or ADMIN" ON public.cases;
CREATE POLICY "Cases insertable by CADISTA or ADMIN"
ON public.cases FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role() IN ('CADISTA', 'ADMIN'));

DROP POLICY IF EXISTS "Cases updateable by CADISTA or ADMIN" ON public.cases;
CREATE POLICY "Cases updateable by CADISTA or ADMIN"
ON public.cases FOR UPDATE
TO authenticated
USING (public.get_my_role() IN ('CADISTA', 'ADMIN'));

-- 6. CASE STATUS EVENTS POLICIES
DROP POLICY IF EXISTS "Events readable by authenticated staff" ON public.case_status_events;
CREATE POLICY "Events readable by authenticated staff"
ON public.case_status_events FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Events insertable by CADISTA or ADMIN" ON public.case_status_events;
CREATE POLICY "Events insertable by CADISTA or ADMIN"
ON public.case_status_events FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role() IN ('CADISTA', 'ADMIN'));

-- 7. PRINT JOBS & ITEMS POLICIES
DROP POLICY IF EXISTS "Print jobs readable by authenticated staff" ON public.print_jobs;
CREATE POLICY "Print jobs readable by authenticated staff"
ON public.print_jobs FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Print jobs insertable by CADISTA or ADMIN" ON public.print_jobs;
CREATE POLICY "Print jobs insertable by CADISTA or ADMIN"
ON public.print_jobs FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role() IN ('CADISTA', 'ADMIN'));

DROP POLICY IF EXISTS "Print jobs updateable by CADISTA, OPERADOR_IMPRESSAO, ADMIN" ON public.print_jobs;
CREATE POLICY "Print jobs updateable by CADISTA, OPERADOR_IMPRESSAO, ADMIN"
ON public.print_jobs FOR UPDATE
TO authenticated
USING (public.get_my_role() IN ('CADISTA', 'OPERADOR_IMPRESSAO', 'ADMIN'));

DROP POLICY IF EXISTS "Print job items readable by authenticated staff" ON public.print_job_items;
CREATE POLICY "Print job items readable by authenticated staff"
ON public.print_job_items FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Print job items insertable by CADISTA, OPERADOR_IMPRESSAO, ADMIN" ON public.print_job_items;
CREATE POLICY "Print job items insertable by CADISTA, OPERADOR_IMPRESSAO, ADMIN"
ON public.print_job_items FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role() IN ('CADISTA', 'OPERADOR_IMPRESSAO', 'ADMIN'));

DROP POLICY IF EXISTS "Print job items updateable by OPERADOR_IMPRESSAO, CADISTA, ADMIN" ON public.print_job_items;
CREATE POLICY "Print job items updateable by OPERADOR_IMPRESSAO, CADISTA, ADMIN"
ON public.print_job_items FOR UPDATE
TO authenticated
USING (public.get_my_role() IN ('OPERADOR_IMPRESSAO', 'CADISTA', 'ADMIN'));

-- 8. PRINTERS & MAINTENANCES POLICIES
DROP POLICY IF EXISTS "Printers readable by authenticated staff" ON public.printers;
CREATE POLICY "Printers readable by authenticated staff"
ON public.printers FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Printers manageable by OPERADOR_RESINA or ADMIN" ON public.printers;
CREATE POLICY "Printers manageable by OPERADOR_RESINA or ADMIN"
ON public.printers FOR ALL
TO authenticated
USING (public.get_my_role() IN ('OPERADOR_RESINA', 'ADMIN'));

DROP POLICY IF EXISTS "Printer maintenances readable by authenticated staff" ON public.printer_maintenances;
CREATE POLICY "Printer maints readable by authenticated staff"
ON public.printer_maintenances FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Printer maintenances insertable by OPERADOR_RESINA or ADMIN" ON public.printer_maintenances;
CREATE POLICY "Printer maints insertable by OPERADOR_RESINA or ADMIN"
ON public.printer_maintenances FOR INSERT
TO authenticated
WITH CHECK (public.get_my_role() IN ('OPERADOR_RESINA', 'ADMIN'));

-- 9. RESIN BATCHES & CALIBRATIONS POLICIES
DROP POLICY IF EXISTS "Resins readable by authenticated staff" ON public.resin_batches;
CREATE POLICY "Resins readable by authenticated staff"
ON public.resin_batches FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Resins manageable by OPERADOR_RESINA or ADMIN" ON public.resin_batches;
CREATE POLICY "Resins manageable by OPERADOR_RESINA or ADMIN"
ON public.resin_batches FOR ALL
TO authenticated
USING (public.get_my_role() IN ('OPERADOR_RESINA', 'ADMIN'));

DROP POLICY IF EXISTS "Calibrations readable by authenticated staff" ON public.resin_calibrations;
CREATE POLICY "Calibrations readable by authenticated staff"
ON public.resin_calibrations FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Calibrations manageable by OPERADOR_RESINA or ADMIN" ON public.resin_calibrations;
CREATE POLICY "Calibrations manageable by OPERADOR_RESINA or ADMIN"
ON public.resin_calibrations FOR ALL
TO authenticated
USING (public.get_my_role() IN ('OPERADOR_RESINA', 'ADMIN'));

-- 10. PRINT RUNS & RUN ITEMS POLICIES
DROP POLICY IF EXISTS "Print runs readable by authenticated staff" ON public.print_runs;
CREATE POLICY "Print runs readable by authenticated staff"
ON public.print_runs FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Print runs manageable by OPERADOR_IMPRESSAO or ADMIN" ON public.print_runs;
CREATE POLICY "Print runs manageable by OPERADOR_IMPRESSAO or ADMIN"
ON public.print_runs FOR ALL
TO authenticated
USING (public.get_my_role() IN ('OPERADOR_IMPRESSAO', 'ADMIN'));

DROP POLICY IF EXISTS "Print run items readable by authenticated staff" ON public.print_run_items;
CREATE POLICY "Print run items readable by authenticated staff"
ON public.print_run_items FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Print run items manageable by OPERADOR_IMPRESSAO or ADMIN" ON public.print_run_items;
CREATE POLICY "Print run items manageable by OPERADOR_IMPRESSAO or ADMIN"
ON public.print_run_items FOR ALL
TO authenticated
USING (public.get_my_role() IN ('OPERADOR_IMPRESSAO', 'ADMIN'));

-- 11. AUDIT LOGS POLICIES
DROP POLICY IF EXISTS "Audit logs readable by authenticated staff" ON public.audit_logs;
CREATE POLICY "Audit logs readable by authenticated staff"
ON public.audit_logs FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "Audit logs insertable by all authenticated" ON public.audit_logs;
CREATE POLICY "Audit logs insertable by all authenticated"
ON public.audit_logs FOR INSERT
TO authenticated
WITH CHECK (true);
