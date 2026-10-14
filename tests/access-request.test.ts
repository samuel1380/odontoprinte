import { describe, it, expect } from "vitest";
import {
  isValidEmail,
  validateAccessRequest,
  translateSupabaseAuthError,
} from "../src/lib/auth-errors";

describe("Fluxo de acesso: validação e mensagens em português", () => {
  it("valida e-mail", () => {
    expect(isValidEmail("ana@clinica.com")).toBe(true);
    expect(isValidEmail("  ANA@Clinica.COM.BR  ")).toBe(true);
    expect(isValidEmail("sem-arroba")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("")).toBe(false);
  });

  it("exige nome, e-mail válido e senha com 6+ caracteres", () => {
    expect(validateAccessRequest({ full_name: "", email: "a@b.com", password: "123456" })).toBe(
      "Informe seu nome completo."
    );
    expect(validateAccessRequest({ full_name: "Ana", email: "", password: "123456" })).toBe(
      "Informe seu e-mail."
    );
    expect(validateAccessRequest({ full_name: "Ana", email: "email-ruim", password: "123456" })).toBe(
      "E-mail inválido. Confira o endereço digitado."
    );
    expect(validateAccessRequest({ full_name: "Ana", email: "a@b.com", password: "" })).toBe(
      "Crie uma senha de acesso."
    );
    expect(validateAccessRequest({ full_name: "Ana", email: "a@b.com", password: "123" })).toBe(
      "A senha precisa de pelo menos 6 caracteres."
    );
    expect(
      validateAccessRequest({ full_name: "Ana", email: "a@b.com", password: "123456" })
    ).toBeNull();
  });

  it("traduz erros crus do Supabase Auth (nunca mostra inglês na tela)", () => {
    expect(translateSupabaseAuthError("User already registered")).toBe(
      "Este e-mail já possui cadastro ou solicitação pendente."
    );
    expect(translateSupabaseAuthError("Password should be at least 6 characters")).toBe(
      "A senha precisa de pelo menos 6 caracteres."
    );
    expect(translateSupabaseAuthError("Invalid login credentials")).toBe(
      "E-mail ou senha incorretos. Verifique suas credenciais."
    );
    expect(translateSupabaseAuthError("Email not confirmed")).toBe(
      "E-mail ainda não confirmado. Fale com o Administrador para liberar seu acesso."
    );
    expect(translateSupabaseAuthError("Signups not allowed for this instance")).toBe(
      "Cadastro temporariamente desativado no servidor. Fale com o Administrador."
    );
    expect(translateSupabaseAuthError("Email rate limit exceeded")).toBe(
      "Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente de novo."
    );
    expect(translateSupabaseAuthError("Failed to fetch")).toBe(
      "Sem conexão com o servidor. Verifique sua internet e tente de novo."
    );
    expect(translateSupabaseAuthError("Algo totalmente inesperado 500")).toBe(
      "Não foi possível concluir. Verifique os dados e tente de novo."
    );
  });
});
