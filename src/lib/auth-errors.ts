/**
 * Validação e tradução de erros do fluxo de acesso (solicitar conta, login).
 * Centraliza as mensagens em português claro — nunca expor erro técnico bruto.
 */

export function isValidEmail(email: string): boolean {
  const clean = (email || "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(clean);
}

export function validateAccessRequest(params: {
  full_name?: string;
  email?: string;
  password?: string;
}): string | null {
  if (!params.full_name || !params.full_name.trim()) {
    return "Informe seu nome completo.";
  }
  if (!params.email || !params.email.trim()) {
    return "Informe seu e-mail.";
  }
  if (!isValidEmail(params.email)) {
    return "E-mail inválido. Confira o endereço digitado.";
  }
  if (!params.password || params.password.trim().length === 0) {
    return "Crie uma senha de acesso.";
  }
  if (params.password.trim().length < 6) {
    return "A senha precisa de pelo menos 6 caracteres.";
  }
  return null;
}

/** Traduz erros crus do Supabase Auth para português claro. */
export function translateSupabaseAuthError(raw: string): string {
  const msg = raw || "";
  if (/user already registered|already been registered|duplicate/i.test(msg)) {
    return "Este e-mail já possui cadastro ou solicitação pendente.";
  }
  if (/password.*(at least|6 characters|too short|weak)|weak_password/i.test(msg)) {
    return "A senha precisa de pelo menos 6 caracteres.";
  }
  if (/invalid login credentials/i.test(msg)) {
    return "E-mail ou senha incorretos. Verifique suas credenciais.";
  }
  if (/email not confirmed/i.test(msg)) {
    return "E-mail ainda não confirmado. Fale com o Administrador para liberar seu acesso.";
  }
  if (/signups not allowed|signup.*disabled/i.test(msg)) {
    return "Cadastro temporariamente desativado no servidor. Fale com o Administrador.";
  }
  if (/email rate limit|rate limit|too many requests|over_email/i.test(msg)) {
    return "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo.";
  }
  if (/invalid email|email.*invalid/i.test(msg)) {
    return "E-mail inválido. Confira o endereço digitado.";
  }
  if (/network|fetch|failed to fetch/i.test(msg)) {
    return "Sem conexão com o servidor. Verifique sua internet e tente de novo.";
  }
  return "Não foi possível concluir. Verifique os dados e tente de novo.";
}
