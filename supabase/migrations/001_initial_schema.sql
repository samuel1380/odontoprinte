-- ====================================================================
-- MIGRATION 001: INITIAL SCHEMA - ODONTOPRINT
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. ENUMS
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM ('ADMIN', 'CADISTA', 'OPERADOR_RESINA', 'OPERADOR_IMPRESSAO', 'PROTETICO_ACABAMENTO');
EXCEPTION
    WHEN duplicate_object THEN
        ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'PROTETICO_ACABAMENTO';
END $$;

DO $$ BEGIN
    CREATE TYPE process_type AS ENUM ('FRESAGEM', 'IMPRESSAO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

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
EXCEPTION
    WHEN duplicate_object THEN
        ALTER TYPE dental_file_type ADD VALUE IF NOT EXISTS 'MODELO_COM_FUROS';
        ALTER TYPE dental_file_type ADD VALUE IF NOT EXISTS 'GENGIVA_ARTIFICIAL';
        ALTER TYPE dental_file_type ADD VALUE IF NOT EXISTS 'COROA_FRESADA';
END $$;

DO $$ BEGIN
    CREATE TYPE print_job_status AS ENUM ('AGUARDANDO', 'PARCIAL', 'CONCLUIDO', 'CANCELADO');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE print_item_status AS ENUM (
        'AGUARDANDO_FILA',
        'EM_PREPARO',
        'EM_IMPRESSAO',
        'PRONTO_ACABAMENTO',
        'CONCLUIDO',
        'FALHOU_REIMPRESSAO'
    );
EXCEPTION
    WHEN duplicate_object THEN
        ALTER TYPE print_item_status ADD VALUE IF NOT EXISTS 'PRONTO_ACABAMENTO';
END $$;

DO $$ BEGIN
    CREATE TYPE resin_batch_status AS ENUM ('AGUARDANDO_CALIBRACAO', 'CALIBRADA', 'REPROVADA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE calibration_status AS ENUM ('EM_ANDAMENTO', 'APROVADA', 'REPROVADA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE print_run_status AS ENUM ('PREPARADA', 'EM_IMPRESSAO', 'FINALIZADA', 'CANCELADA');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE print_run_item_result AS ENUM ('PENDENTE', 'CONCLUIDO', 'FALHOU');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    role user_role NOT NULL DEFAULT 'CADISTA',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. SYSTEM SETTINGS
CREATE TABLE IF NOT EXISTS public.system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    maintenance_interval_days INT NOT NULL DEFAULT 7,
    calibration_hexagon_min NUMERIC(5, 2) NOT NULL DEFAULT 9.99,
    calibration_hexagon_max NUMERIC(5, 2) NOT NULL DEFAULT 10.01,
    normal_print_prefix TEXT NOT NULL DEFAULT 'A',
    retry_print_prefix TEXT NOT NULL DEFAULT '00A',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. CASES (Trabalhos/Pacientes)
CREATE TABLE IF NOT EXISTS public.cases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    patient_code TEXT NOT NULL,
    patient_name TEXT,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 6. CASE STATUS EVENTS
CREATE TABLE IF NOT EXISTS public.case_status_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    case_id UUID NOT NULL REFERENCES public.cases(id) ON DELETE CASCADE,
    process_type process_type NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. PRINT JOBS
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

-- 8. PRINT JOB ITEMS
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

-- 9. PRINTERS
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

-- 10. PRINTER MAINTENANCES
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

-- 11. RESIN BATCHES
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

-- 12. RESIN CALIBRATIONS
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

-- 13. PRINT RUNS
CREATE TABLE IF NOT EXISTS public.print_runs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    run_code TEXT NOT NULL UNIQUE,
    printer_id UUID NOT NULL REFERENCES public.printers(id),
    resin_batch_id UUID NOT NULL REFERENCES public.resin_batches(id),
    calibration_id UUID NOT NULL REFERENCES public.resin_calibrations(id),
    supports_confirmed BOOLEAN NOT NULL DEFAULT false,
    resin_manipulated BOOLEAN NOT NULL DEFAULT false,
    status print_run_status NOT NULL DEFAULT 'PREPARADA',
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 14. PRINT RUN ITEMS
CREATE TABLE IF NOT EXISTS public.print_run_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    print_run_id UUID NOT NULL REFERENCES public.print_runs(id) ON DELETE CASCADE,
    print_job_item_id UUID NOT NULL REFERENCES public.print_job_items(id) ON DELETE CASCADE,
    result print_run_item_result NOT NULL DEFAULT 'PENDENTE',
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 15. AUDIT LOGS
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

-- 16. SEQUENCES FOR PRINT RUN NOMENCLATURE
CREATE SEQUENCE IF NOT EXISTS print_run_normal_seq START WITH 1 INCREMENT BY 1;
CREATE SEQUENCE IF NOT EXISTS print_run_retry_seq START WITH 1 INCREMENT BY 1;

-- 17. PERFORMANCE INDEXES
CREATE INDEX IF NOT EXISTS idx_cases_patient_code ON public.cases(patient_code);
CREATE INDEX IF NOT EXISTS idx_print_jobs_status ON public.print_jobs(status);
CREATE INDEX IF NOT EXISTS idx_print_jobs_queue_entered ON public.print_jobs(queue_entered_at ASC);
CREATE INDEX IF NOT EXISTS idx_print_job_items_status ON public.print_job_items(status);
CREATE INDEX IF NOT EXISTS idx_print_job_items_is_retry ON public.print_job_items(is_retry);
CREATE INDEX IF NOT EXISTS idx_printer_maintenances_printer ON public.printer_maintenances(printer_id, performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_resin_calibrations_combo ON public.resin_calibrations(resin_batch_id, printer_id, status);
CREATE INDEX IF NOT EXISTS idx_print_runs_code ON public.print_runs(run_code);
CREATE INDEX IF NOT EXISTS idx_print_runs_status ON public.print_runs(status);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON public.audit_logs(created_at DESC);
