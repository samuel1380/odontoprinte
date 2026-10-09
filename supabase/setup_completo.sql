-- ====================================================================
-- ODONTOPRINT: SCRIPT COMPLETO E UNIFICADO (MIGRATIONS + SEED)
-- Execute este script inteiro no SQL Editor do Supabase de uma só vez!
-- ====================================================================

-- 1. EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS DE DOMÍNIO
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('ADMIN', 'CADISTA', 'OPERADOR_RESINA', 'OPERADOR_IMPRESSAO', 'PROTETICO_ACABAMENTO');
EXCEPTION WHEN duplicate_object THEN
    ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'PROTETICO_ACABAMENTO';
END $$;

DO $$ BEGIN
    CREATE TYPE process_type AS ENUM ('FRESAGEM', 'IMPRESSAO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE dental_file_type AS ENUM (
        'MODELO_COM_FUROS',
        'MODELO_DE_TRABALHO',
        'ANTAGONISTA',
        'TROQUEL',
        'GENGIVA_ARTIFICIAL',
        'COROA_FRESADA',
        'PLACA_MIORRELAXANTE',
        'ELEMENTO_PROVA',
        'ELEMENTO_PROVISORIO',
        'ELEMENTO_CARGA_CERAMICA'
    );
EXCEPTION WHEN duplicate_object THEN
    ALTER TYPE dental_file_type ADD VALUE IF NOT EXISTS 'MODELO_COM_FUROS';
    ALTER TYPE dental_file_type ADD VALUE IF NOT EXISTS 'GENGIVA_ARTIFICIAL';
    ALTER TYPE dental_file_type ADD VALUE IF NOT EXISTS 'COROA_FRESADA';
END $$;

DO $$ BEGIN
    CREATE TYPE print_job_status AS ENUM ('AGUARDANDO', 'PARCIAL', 'CONCLUIDO', 'CANCELADO');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE print_item_status AS ENUM (
        'AGUARDANDO_FILA',
        'EM_PREPARO',
        'EM_IMPRESSAO',
        'PRONTO_ACABAMENTO',
        'CONCLUIDO',
        'FALHOU_REIMPRESSAO'
    );
EXCEPTION WHEN duplicate_object THEN
    ALTER TYPE print_item_status ADD VALUE IF NOT EXISTS 'PRONTO_ACABAMENTO';
END $$;

DO $$ BEGIN
    CREATE TYPE resin_batch_status AS ENUM ('AGUARDANDO_CALIBRACAO', 'CALIBRADA', 'REPROVADA');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE calibration_status AS ENUM ('EM_ANDAMENTO', 'APROVADA', 'REPROVADA');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE print_run_status AS ENUM ('PREPARADA', 'EM_IMPRESSAO', 'FINALIZADA', 'CANCELADA');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE print_run_item_result AS ENUM ('PENDENTE', 'CONCLUIDO', 'FALHOU');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3. TABELAS PRINCIPAIS
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'CADISTA',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    maintenance_interval_days INT NOT NULL DEFAULT 7,
    calibration_hexagon_min NUMERIC(5, 2) NOT NULL DEFAULT 9.99,
    calibration_hexagon_max NUMERIC(5, 2) NOT NULL DEFAULT 10.01,
    normal_print_prefix TEXT NOT NULL DEFAULT 'A',
    retry_print_prefix TEXT NOT NULL DEFAULT '00A',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_code TEXT NOT NULL,
    patient_name TEXT,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.case_status_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    process_type process_type NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.print_jobs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    source_status_event_id UUID REFERENCES public.case_status_events(id),
    queue_entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status print_job_status NOT NULL DEFAULT 'AGUARDANDO',
    priority INT NOT NULL DEFAULT 1,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.print_job_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    print_job_id UUID NOT NULL REFERENCES public.print_jobs(id) ON DELETE CASCADE,
    file_type dental_file_type NOT NULL,
    status print_item_status NOT NULL DEFAULT 'AGUARDANDO_FILA',
    retry_count INT NOT NULL DEFAULT 0,
    is_retry BOOLEAN NOT NULL DEFAULT false,
    last_failure_reason TEXT,
    last_run_code TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.printers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    brand TEXT NOT NULL,
    model TEXT NOT NULL,
    serial_number TEXT NOT NULL,
    maintenance_contact TEXT,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.printer_maintenances (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    printer_id UUID NOT NULL REFERENCES public.printers(id) ON DELETE CASCADE,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    leveling_ok BOOLEAN NOT NULL DEFAULT false,
    cleaning_ok BOOLEAN NOT NULL DEFAULT false,
    fep_integrity_ok BOOLEAN NOT NULL DEFAULT false,
    led_integrity_ok BOOLEAN NOT NULL DEFAULT false,
    black_points_led BOOLEAN NOT NULL DEFAULT false,
    low_led_luminosity BOOLEAN NOT NULL DEFAULT false,
    protective_film_ok BOOLEAN NOT NULL DEFAULT false,
    notes TEXT,
    approved BOOLEAN NOT NULL DEFAULT false,
    performed_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resin_batches (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand TEXT NOT NULL,
    resin_type TEXT NOT NULL,
    lot TEXT NOT NULL,
    volume NUMERIC(10, 2) NOT NULL,
    volume_unit TEXT NOT NULL DEFAULT 'ml',
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    status resin_batch_status NOT NULL DEFAULT 'AGUARDANDO_CALIBRACAO',
    active BOOLEAN NOT NULL DEFAULT true,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.resin_calibrations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    resin_batch_id UUID NOT NULL REFERENCES public.resin_batches(id) ON DELETE CASCADE,
    printer_id UUID NOT NULL REFERENCES public.printers(id) ON DELETE CASCADE,
    calibration_number INT NOT NULL DEFAULT 1,
    initial_exposure_time NUMERIC(6, 2) NOT NULL,
    exposure_time NUMERIC(6, 2) NOT NULL,
    lift_speed NUMERIC(6, 2) NOT NULL,
    layer_height NUMERIC(6, 3) NOT NULL,
    hexagon_size_mm NUMERIC(6, 3) NOT NULL,
    lines_visible BOOLEAN NOT NULL DEFAULT false,
    numbers_visible BOOLEAN NOT NULL DEFAULT false,
    details_visible BOOLEAN NOT NULL DEFAULT false,
    wash_time NUMERIC(6, 2) NOT NULL,
    cure_time NUMERIC(6, 2) NOT NULL,
    status calibration_status NOT NULL DEFAULT 'EM_ANDAMENTO',
    finalized_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.print_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_code TEXT NOT NULL UNIQUE,
    printer_id UUID NOT NULL REFERENCES public.printers(id) ON DELETE CASCADE,
    resin_batch_id UUID NOT NULL REFERENCES public.resin_batches(id) ON DELETE CASCADE,
    calibration_id UUID NOT NULL REFERENCES public.resin_calibrations(id) ON DELETE CASCADE,
    supports_confirmed BOOLEAN NOT NULL DEFAULT false,
    resin_manipulated BOOLEAN NOT NULL DEFAULT false,
    status print_run_status NOT NULL DEFAULT 'PREPARADA',
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.print_run_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    print_run_id UUID NOT NULL REFERENCES public.print_runs(id) ON DELETE CASCADE,
    print_job_item_id UUID NOT NULL REFERENCES public.print_job_items(id) ON DELETE CASCADE,
    result print_run_item_result NOT NULL DEFAULT 'PENDENTE',
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.profiles(id),
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    old_data JSONB,
    new_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. SEQUENCES E ÍNDICES
CREATE SEQUENCE IF NOT EXISTS print_run_normal_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS print_run_retry_seq START WITH 1 INCREMENT BY 1;

CREATE INDEX IF NOT EXISTS idx_cases_patient_code ON public.cases(patient_code);
CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON public.print_jobs(status);
CREATE INDEX IF NOT EXISTS idx_print_jobs_queue_entered ON public.print_jobs(queue_entered_at ASC);
CREATE INDEX IF NOT EXISTS idx_print_job_items_status ON public.print_job_items(status);
CREATE INDEX IF NOT EXISTS idx_print_job_items_is_retry ON public.print_job_items(is_retry);
CREATE INDEX IF NOT EXISTS idx_printer_maintenances_printer ON public.printer_maintenances(printer_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_resin_calibrations_combo ON public.resin_calibrations(resin_batch_id, printer_id, status);
CREATE INDEX IF NOT EXISTS idx_print_runs_code ON public.print_runs(run_code);

-- 5. FUNÇÕES AUXILIARES E ATÔMICAS (RPC)
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

CREATE OR REPLACE FUNCTION public.generate_print_run_code(p_has_retry BOOLEAN DEFAULT false)
RETURNS TEXT AS $$
DECLARE
    v_normal_prefix TEXT;
    v_retry_prefix TEXT;
    v_seq_val BIGINT;
    v_code TEXT;
BEGIN
    SELECT normal_print_prefix, retry_print_prefix 
    INTO v_normal_prefix, v_retry_prefix
    FROM public.system_settings
    LIMIT 1;

    IF v_normal_prefix IS NULL THEN v_normal_prefix := 'A'; END IF;
    IF v_retry_prefix IS NULL THEN v_retry_prefix := '00A'; END IF;

    IF p_has_retry THEN
        v_seq_val := nextval('print_run_retry_seq');
        v_code := v_retry_prefix || LPAD(v_seq_val::TEXT, 3, '0');
    ELSE
        v_seq_val := nextval('print_run_normal_seq');
        v_code := v_normal_prefix || LPAD(v_seq_val::TEXT, 3, '0');
    END IF;

    RETURN v_code;
END;
$$ LANGUAGE plpgsql VOLATILE SECURITY DEFINER;

-- Trigger para Manutenção
CREATE OR REPLACE FUNCTION public.fn_trg_calculate_printer_maintenance()
RETURNS TRIGGER AS $$
BEGIN
    NEW.approved := (
        NEW.leveling_ok = true AND
        NEW.cleaning_ok = true AND
        NEW.fep_integrity_ok = true AND
        NEW.led_integrity_ok = true AND
        NEW.black_points_led = false AND
        NEW.low_led_luminosity = false AND
        NEW.protective_film_ok = true
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_printer_maintenance ON public.printer_maintenances;
CREATE TRIGGER trg_calculate_printer_maintenance
BEFORE INSERT OR UPDATE ON public.printer_maintenances
FOR EACH ROW EXECUTE FUNCTION public.fn_trg_calculate_printer_maintenance();

-- Trigger para Calibração
CREATE OR REPLACE FUNCTION public.fn_trg_calculate_resin_calibration()
RETURNS TRIGGER AS $$
DECLARE
    v_hex_min NUMERIC(5,2);
    v_hex_max NUMERIC(5,2);
BEGIN
    SELECT calibration_hexagon_min, calibration_hexagon_max
    INTO v_hex_min, v_hex_max
    FROM public.system_settings LIMIT 1;

    IF v_hex_min IS NULL THEN v_hex_min := 9.99; END IF;
    IF v_hex_max IS NULL THEN v_hex_max := 10.01; END IF;

    IF NEW.status = 'APROVADA' THEN
        IF NOT (
            NEW.hexagon_size_mm >= v_hex_min AND
            NEW.hexagon_size_mm <= v_hex_max AND
            NEW.lines_visible = true AND
            NEW.numbers_visible = true AND
            NEW.details_visible = true
        ) THEN
            RAISE EXCEPTION 'Calibração não atende aos parâmetros técnicos obrigatórios (Hexágono %.2f-%.2f e visibilidade total)', v_hex_min, v_hex_max;
        END IF;

        NEW.finalized_at := now();

        UPDATE public.resin_batches
        SET status = 'CALIBRADA', updated_at = now()
        WHERE id = NEW.resin_batch_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calculate_resin_calibration ON public.resin_calibrations;
CREATE TRIGGER trg_calculate_resin_calibration
BEFORE INSERT OR UPDATE ON public.resin_calibrations
FOR EACH ROW EXECUTE FUNCTION public.fn_trg_calculate_resin_calibration();

-- Função Atômica: Finalizar Impressão com Retorno à Fila
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

        IF p_failed_item_ids IS NOT NULL THEN
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

            UPDATE public.print_job_items
            SET status = 'CONCLUIDO', last_run_code = v_run.run_code, updated_at = now()
            WHERE id = v_run_item.print_job_item_id;
        END IF;

        v_job_id := v_run_item.print_job_id;
        SELECT COUNT(*) INTO v_pending_in_job
        FROM public.print_job_items
        WHERE print_job_id = v_job_id AND status != 'CONCLUIDO';

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

-- 6. VIEWS DO SISTEMA
CREATE OR REPLACE VIEW public.printer_availability_view AS
WITH latest_maint AS (
    SELECT DISTINCT ON (printer_id)
        printer_id, id AS maintenance_id, performed_at, approved
    FROM public.printer_maintenances
    ORDER BY printer_id, performed_at DESC
),
settings AS (
    SELECT COALESCE(maintenance_interval_days, 7) AS interval_days
    FROM public.system_settings LIMIT 1
)
SELECT 
    p.id AS printer_id,
    p.name, p.brand, p.model, p.serial_number, p.maintenance_contact, p.active,
    lm.maintenance_id,
    lm.performed_at AS last_maintenance_at,
    lm.approved AS last_maintenance_approved,
    CASE WHEN lm.performed_at IS NOT NULL THEN EXTRACT(DAY FROM (now() - lm.performed_at))::INT ELSE NULL END AS days_since_maintenance,
    CASE
        WHEN p.active = false THEN 'INATIVA'
        WHEN lm.maintenance_id IS NULL THEN 'REPROVADA'
        WHEN lm.approved = false THEN 'REPROVADA'
        WHEN EXTRACT(DAY FROM (now() - lm.performed_at)) > (SELECT interval_days FROM settings) THEN 'MANUTENCAO_VENCIDA'
        ELSE 'DISPONIVEL'
    END AS calculated_status,
    CASE
        WHEN p.active = true AND lm.approved = true AND EXTRACT(DAY FROM (now() - lm.performed_at)) <= (SELECT interval_days FROM settings) THEN true
        ELSE false
    END AS is_eligible_for_print
FROM public.printers p
LEFT JOIN latest_maint lm ON lm.printer_id = p.id;

CREATE OR REPLACE VIEW public.eligible_resin_calibrations_view AS
SELECT 
    rc.id AS calibration_id, rc.calibration_number, rc.status AS calibration_status, rc.finalized_at,
    rc.hexagon_size_mm, rc.layer_height, rc.exposure_time,
    rb.id AS resin_batch_id, rb.brand AS resin_brand, rb.resin_type, rb.lot AS resin_lot, rb.volume, rb.volume_unit,
    p.id AS printer_id, p.name AS printer_name,
    pav.calculated_status AS printer_status, pav.is_eligible_for_print AS printer_eligible
FROM public.resin_calibrations rc
JOIN public.resin_batches rb ON rb.id = rc.resin_batch_id
JOIN public.printers p ON p.id = rc.printer_id
JOIN public.printer_availability_view pav ON pav.printer_id = p.id
WHERE rc.status = 'APROVADA' AND rb.active = true AND rb.status = 'CALIBRADA';

CREATE OR REPLACE VIEW public.print_queue_view AS
SELECT 
    pji.id AS item_id, pji.file_type, pji.status AS item_status, pji.retry_count, pji.is_retry, pji.last_failure_reason, pji.last_run_code, pji.created_at AS item_created_at,
    pj.id AS print_job_id, pj.priority, pj.queue_entered_at,
    c.id AS case_id, c.patient_code, c.patient_name, c.notes AS case_notes,
    EXTRACT(EPOCH FROM (now() - pj.queue_entered_at))::INT AS wait_seconds
FROM public.print_job_items pji
JOIN public.print_jobs pj ON pj.id = pji.print_job_id
JOIN public.cases c ON c.id = pj.case_id
WHERE pji.status = 'AGUARDANDO_FILA'
ORDER BY pj.queue_entered_at ASC, pji.is_retry DESC, pji.created_at ASC;

-- 7. ATIVAÇÃO DO REALTIME
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
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.printers;
    EXCEPTION WHEN duplicate_object THEN null; WHEN undefined_object THEN null; END;
END $$;

-- 8. CONFIGURAÇÃO INICIAL (SETTINGS)
INSERT INTO public.system_settings (
    maintenance_interval_days, calibration_hexagon_min, calibration_hexagon_max, normal_print_prefix, retry_print_prefix
)
SELECT 7, 9.99, 10.01, 'A', '00A'
WHERE NOT EXISTS (SELECT 1 FROM public.system_settings);

-- 9. INICIALIZAÇÃO LIMPA PARA PRODUÇÃO (SEM DADOS DE TESTE)
-- Sequências iniciadas para o primeiro código de impressão ser A001 e de reimpressão 00A1
SELECT setval('print_run_normal_seq', 1, false);
SELECT setval('print_run_retry_seq', 1, false);

-- 10. SINCRONIZAÇÃO AUTOMÁTICA DE USUÁRIOS E PERFIS
DO $$
BEGIN
    UPDATE auth.users
    SET email_confirmed_at = now()
    WHERE email_confirmed_at IS NULL;
EXCEPTION WHEN OTHERS THEN
    null;
END $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'Operador'),
        'CADISTA'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Sincroniza perfis de contas já cadastradas em auth.users
INSERT INTO public.profiles (id, full_name, role)
SELECT id, COALESCE(raw_user_meta_data->>'full_name', email, 'Operador'), 'CADISTA'
FROM auth.users
ON CONFLICT (id) DO NOTHING;

-- 11. PERMISSÕES OPERACIONAIS DE BANCADA (GARANTE PERSISTÊNCIA TOTAL SEM BLOQUEIOS)
ALTER TABLE IF EXISTS public.printers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.printer_maintenances DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.resin_batches DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.resin_calibrations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cases DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.case_status_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_jobs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_job_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.print_run_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.system_settings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.profiles DISABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated, service_role;

-- FIM DO SCRIPT COMPLETO


