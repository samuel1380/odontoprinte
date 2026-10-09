"use client";

import React, { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { UserRole } from "@/lib/constants";
import { 
  Printer, 
  Lock, 
  Mail, 
  User, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  Layers, 
  FlaskConical, 
  ArrowRight,
  UserPlus,
  LogIn,
  CheckCircle2,
  Briefcase
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const { login, user, isLoading: authLoading } = useAuth();
  
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [requestedRole, setRequestedRole] = useState<UserRole>("CADISTA");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!authLoading && user) {
      router.replace("/dashboard");
    }
  }, [user, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Por favor, insira o seu e-mail corporativo.");
      return;
    }
    if (!password.trim()) {
      toast.error("Por favor, insira a sua senha.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isRegisterMode) {
        if (!fullName.trim()) {
          toast.error("Por favor, insira seu nome completo.");
          setIsSubmitting(false);
          return;
        }

        const res = await OdontoPrintService.requestUserAccess({
          full_name: fullName.trim(),
          email: email.trim().toLowerCase(),
          password: password.trim(),
          role: requestedRole,
        });

        if (res.success) {
          toast.success("Solicitação enviada com sucesso! Aguarde a aprovação do Administrador para efetuar login.");
          setIsRegisterMode(false);
          setPassword("");
        } else {
          toast.error(res.error || "Não foi possível enviar a solicitação. Verifique os dados.");
        }
      } else {
        const res = await login(email, password);
        if (res.success) {
          toast.success("Autenticado com sucesso no OdontoPrint!");
          router.replace("/dashboard");
        } else {
          toast.error(res.error || "Credenciais inválidas. Verifique seu e-mail e senha.");
        }
      }
    } catch {
      toast.error("Ocorreu um erro ao processar a autenticação.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-[100dvh] bg-[#0B0F19] flex flex-col items-center justify-center text-white p-4">
        <img
          src="/logo.jpg"
          alt="OdontoPrint"
          className="h-16 w-16 rounded-2xl object-contain bg-white p-1.5 shadow-xl shadow-brand-500/20 animate-pulse mb-4"
        />
        <div className="h-5 w-5 rounded-full border-2 border-brand-400 border-t-transparent animate-spin mb-3" />
        <p className="text-xs text-slate-400 font-medium">Verificando sessão...</p>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] w-full flex flex-col lg:flex-row bg-[#0B0F19] selection:bg-brand-500 selection:text-white overflow-x-hidden">
      {/* Coluna Esquerda: Apresentação da Plataforma (Desktop PC) */}
      <div className="relative hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-slate-950 text-white overflow-hidden border-r border-slate-850">
        {/* Glow de fundo e padrão de malha médica */}
        <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Topo da Coluna Esquerda com a Logo */}
        <div className="relative z-10">
          <div className="flex items-center gap-4">
            <img
              src="/logo.jpg"
              alt="Logo OdontoPrint"
              className="h-16 w-16 lg:h-20 lg:w-20 rounded-2xl lg:rounded-3xl object-contain shadow-xl shadow-brand-500/25 p-1.5 lg:p-2 bg-white shrink-0"
            />
            <div>
              <span className="text-2xl lg:text-3xl font-black tracking-tight text-white">
                ODONTO<span className="text-brand-400">PRINT</span>
              </span>
              <span className="block text-[11px] lg:text-xs uppercase tracking-widest text-slate-400 font-semibold">
                Dental 3D Laboratory
              </span>
            </div>
          </div>
        </div>

        {/* Conteúdo Central */}
        <div className="relative z-10 my-auto py-12 max-w-lg">
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/80 px-3.5 py-1 text-xs text-brand-300 mb-6 backdrop-blur-sm">
            <ShieldCheck className="w-3.5 h-3.5 text-brand-400" />
            <span>Sistema Operacional para Laboratórios Odontológicos</span>
          </div>

          <h1 className="text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
            Gestão integrada, precisão e rastreabilidade em impressão 3D.
          </h1>
          <p className="mt-4 text-slate-400 text-sm leading-relaxed">
            Plataforma projetada para otimizar o fluxo de trabalho de ponta a ponta: da recepção de arquivos CAD até a polimerização final e entrega clínica.
          </p>

          <div className="mt-8 space-y-4">
            <div className="flex items-start gap-3.5">
              <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-900/60 border border-brand-700/60 text-brand-300">
                <Layers className="h-3.5 w-3.5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Fila FIFO & Rastreabilidade de Modelos</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Sequenciamento inteligente de peças, controle de status por paciente e priorização em caso de repetição.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-emerald-900/60 border border-emerald-700/60 text-emerald-300">
                <FlaskConical className="h-3.5 w-3.5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Controle Paramétrico de Resinas</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Validação milimétrica dimensional e liberação de lotes com segurança conforme protocolos técnicos.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5">
              <div className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-blue-900/60 border border-blue-700/60 text-blue-300">
                <Printer className="h-3.5 w-3.5" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-slate-200">Gestão Preventiva do Parque de Impressoras</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Checklists técnicos de 7 dias, registro de manutenções periódicas e histórico de conformidade.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé da Coluna Esquerda */}
        <div className="relative z-10 flex items-center justify-between text-xs text-slate-500 pt-6 border-t border-slate-800">
          <span>&copy; {new Date().getFullYear()} OdontoPrint Inc.</span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Conformidade Técnica RDC / CFO
          </span>
        </div>
      </div>

      {/* Coluna Direita: Formulário de Autenticação (Mobile + Desktop) */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center items-center px-4 sm:px-8 xl:px-20 py-8 sm:py-12 relative overflow-hidden bg-[#0B0F19] text-white">
        {/* Efeito de Fundo com Orbes Difusos (Mobile + Desktop) */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-32 -left-32 w-80 h-80 bg-cyan-500/20 rounded-full blur-3xl animate-pulse" />
          <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-brand-500/20 rounded-full blur-3xl" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-brand-600/15 rounded-full blur-3xl" />
          <div className="absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.06)_1px,transparent_1px)] [background-size:24px_24px] opacity-40" />
        </div>

        {/* Card de Login com Vidro Fosco */}
        <div className="relative z-10 w-full max-w-sm sm:max-w-md mx-auto bg-[#0F172A]/85 backdrop-blur-xl border border-white/10 p-5 sm:p-8 rounded-3xl shadow-2xl">
          {/* Logo visível em telas menores */}
          <div className="flex lg:hidden items-center gap-3 mb-6">
            <img
              src="/logo.jpg"
              alt="Logo OdontoPrint"
              className="h-11 w-11 rounded-2xl object-contain border border-white/20 p-1 bg-white shrink-0 shadow-md"
            />
            <div>
              <span className="text-base font-black tracking-tight text-white">
                ODONTO<span className="text-cyan-400">PRINT</span>
              </span>
              <span className="block text-[9px] uppercase tracking-wider text-slate-300 font-bold">
                Dental 3D Laboratory
              </span>
            </div>
          </div>

          {/* Abas: Acessar Conta vs Solicitar Acesso */}
          <div className="flex p-1 bg-slate-950/70 border border-slate-800 rounded-full mb-6">
            <button
              type="button"
              onClick={() => setIsRegisterMode(false)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-full transition ${
                !isRegisterMode
                  ? "bg-white text-slate-950 shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <LogIn className="w-3.5 h-3.5" />
              <span>Acessar</span>
            </button>
            <button
              type="button"
              onClick={() => setIsRegisterMode(true)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 text-xs font-semibold rounded-full transition ${
                isRegisterMode
                  ? "bg-white text-slate-950 shadow-xs"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Solicitar Acesso</span>
            </button>
          </div>

          <div className="mb-6">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white">
              {isRegisterMode ? "Solicitar Acesso" : "Entrar na Plataforma"}
            </h2>
            <p className="text-xs text-slate-400 mt-1 leading-relaxed">
              {isRegisterMode
                ? "Preencha seus dados para autorização no laboratório."
                : "Insira suas credenciais corporativas."}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {isRegisterMode && (
              <div>
                <label className="block text-xs font-medium text-slate-200 mb-1.5">
                  Nome Completo
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Ex: Dra. Camila Soares"
                    className="w-full pl-10 pr-4 py-2.5 text-base sm:text-sm rounded-full border border-slate-700/80 bg-slate-900/90 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 transition"
                  />
                </div>
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-slate-200 mb-1.5">
                E-mail Corporativo
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                <input
                  type="email"
                  required
                  autoFocus={!isRegisterMode}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu.nome@odontoprint.com.br"
                  className="w-full pl-10 pr-4 py-2.5 text-base sm:text-sm rounded-full border border-slate-700/80 bg-slate-900/90 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-200 mb-1.5">
                Senha
              </label>

              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5 pointer-events-none" />
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-10 py-2.5 text-base sm:text-sm rounded-full border border-slate-700/80 bg-slate-900/90 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400 transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-3 text-slate-400 hover:text-white p-0.5 transition"
                  title={showPassword ? "Ocultar senha" : "Exibir senha"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {isRegisterMode && (
              <div>
                <label className="block text-xs font-medium text-slate-200 mb-1.5 flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                  Função / Setor
                </label>
                <select
                  value={requestedRole}
                  onChange={(e) => setRequestedRole(e.target.value as UserRole)}
                  className="w-full px-4 py-2.5 text-base sm:text-sm rounded-full border border-slate-700/80 bg-slate-900 text-white focus:outline-none focus:ring-2 focus:ring-cyan-400 transition font-medium"
                >
                  <option value="CADISTA">Cadista (Design CAD)</option>
                  <option value="OPERADOR_IMPRESSAO">Operador de Impressão 3D & Resinas</option>
                </select>
              </div>
            )}

            {!isRegisterMode && (
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-cyan-500 focus:ring-cyan-400"
                  />
                  <span className="text-xs text-slate-300">Lembrar neste navegador</span>
                </label>
              </div>
            )}

            <Button
              type="submit"
              disabled={isSubmitting}
              className="w-full mt-4 h-11 text-sm font-semibold rounded-full bg-white hover:bg-slate-200 text-slate-950 shadow-md gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-slate-950/30 border-t-slate-950 animate-spin" />
                  <span>Aguarde...</span>
                </>
              ) : (
                <>
                  <span>{isRegisterMode ? "Enviar Solicitação" : "Entrar"}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-6 pt-4 border-t border-white/10 flex items-center justify-center gap-2 text-[10px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>Ambiente Seguro Criptografado &bull; TLS 1.3</span>
          </div>
        </div>
      </div>
    </div>
  );
}
