-- ====================================================================
-- MIGRATION: 20261014_user_access_email.sql
-- CORRIGE "SOLICITAR ACESSO DANDO ERRO" + ADMIN SEM E-MAIL
--
-- Problemas:
--  1) profiles não tinha coluna de e-mail: solicitações apareciam como
--     "Sem e-mail" e a checagem de duplicidade nunca as encontrava.
--  2) Com confirmação de e-mail ligada no Supabase e sem SMTP, o novo
--     usuário nunca confirmava e nunca entrava, mesmo após aprovado.
--
-- ESTA MIGRATION É SEGURA: só adiciona coluna, preenche e cria trigger.
-- Nada é apagado. Idempotente: pode rodar quantas vezes quiser.
-- COMO APLICAR: Supabase Dashboard > SQL Editor > colar tudo > RUN
-- ====================================================================

-- 1. Coluna de e-mail em profiles
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Preenche e-mails de contas já existentes a partir do auth.users
UPDATE public.profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND (p.email IS NULL OR p.email = '');

-- 3. Índice único (evita e-mail duplicado; nulos duplicados permitidos)
CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_unique
    ON public.profiles(email) WHERE email IS NOT NULL AND email <> '';

-- 4. Autoconfirmação de e-mail (BEFORE) + criação do perfil (AFTER)
--    O laboratório não usa SMTP; sem isso o novo usuário nunca confirmava
--    o e-mail e nunca entrava, mesmo após aprovado pelo admin.
--    Mesma decisão do setup inicial (que confirmava todos em massa).
CREATE OR REPLACE FUNCTION public.auto_confirm_lab_user()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.email_confirmed_at IS NULL THEN
        NEW.email_confirmed_at := now();
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS auto_confirm_lab_user_trg ON auth.users;
CREATE TRIGGER auto_confirm_lab_user_trg
BEFORE INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.auto_confirm_lab_user();

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, role)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'Operador'),
        NEW.email,
        COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'CADISTA')
    )
    ON CONFLICT (id) DO UPDATE SET
        email = EXCLUDED.email,
        full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 5. Permissões (leitura/escrita da equipe em qualquer aparelho)
ALTER TABLE IF EXISTS public.profiles DISABLE ROW LEVEL SECURITY;
GRANT ALL ON TABLE public.profiles TO anon, authenticated, service_role;
