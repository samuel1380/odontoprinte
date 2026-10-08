"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { 
  Printer, 
  Lock, 
  Mail, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  Layers, 
  FlaskConical, 
  ArrowRight,
  CheckCircle2
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      toast.error("Por favor, insira o seu e-mail profissional.");
      return;
    }

    setIsLoading(true);
    try {
      const res = await login(email, password);
      if (res.success) {
        toast.success("Autenticado com sucesso no OdontoPrint!");
        router.push("/dashboard");
      } else {
        toast.error(res.error || "Credenciais inválidas. Verifique os dados digitados.");
      }
    } catch {
      toast.error("Ocorreu um erro ao processar a autenticação.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col lg:flex-row bg-white selection:bg-brand-500 selection:text-white">
      {/* Coluna Esquerda: Apresentação da Plataforma e Autoridade Técnica */}
      <div className="relative hidden lg:flex lg:w-1/2 flex-col justify-between p-12 bg-slate-950 text-white overflow-hidden border-r border-slate-800">
        {/* Glow de fundo e padrão de malha médica */}
        <div className="absolute inset-0 opacity-15 pointer-events-none bg-[radial-gradient(#38bdf8_1px,transparent_1px)] [background-size:24px_24px]" />
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-brand-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-cyan-500/15 rounded-full blur-3xl pointer-events-none" />

        {/* Topo da Coluna Esquerda com a nova Logo */}
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
        <div className="relative z-10 flex items-center justify-between text-xs text-slate-500 pt-6 border-t border-slate-850">
          <span>&copy; {new Date().getFullYear()} OdontoPrint Inc.</span>
          <span className="flex items-center gap-1.5 text-slate-400">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
            Conformidade Técnica RDC / CFO
          </span>
        </div>
      </div>

      {/* Coluna Direita: Formulário de Autenticação */}
      <div className="w-full lg:w-1/2 flex flex-col justify-center px-6 py-12 sm:px-12 xl:px-24 bg-white">
        <div className="mx-auto w-full max-w-sm">
          {/* Logo visível em telas menores */}
          <div className="flex lg:hidden items-center gap-3 mb-8">
            <img
              src="/logo.jpg"
              alt="Logo OdontoPrint"
              className="h-11 w-11 rounded-2xl object-contain shadow-xs border border-slate-200 p-0.5 bg-white shrink-0"
            />
            <div>
              <span className="text-lg font-black tracking-tight text-slate-900">
                ODONTO<span className="text-brand-600">PRINT</span>
              </span>
              <span className="block text-[9px] uppercase tracking-wider text-slate-400 font-bold">
                Dental 3D Laboratory
              </span>
            </div>
          </div>

          <div className="mb-8">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
              Acesso à Plataforma
            </h2>
            <p className="text-xs text-slate-500 mt-1.5">
              Insira suas credenciais corporativas para entrar na central operacional.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                E-mail Corporativo
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
                <input
                  type="email"
                  required
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="operador@odontoprint.com.br"
                  className="w-full pl-10 pr-4 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-slate-50/50 hover:bg-white transition"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Senha
                </label>
                <button
                  type="button"
                  onClick={() => toast.info("Para redefinir sua senha, solicite ao Administrador do laboratório.")}
                  className="text-xs font-medium text-brand-600 hover:text-brand-700 transition"
                >
                  Esqueceu a senha?
                </button>
              </div>

              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-3 pointer-events-none" />
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-slate-50/50 hover:bg-white transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 p-0.5"
                  title={showPassword ? "Ocultar senha" : "Exibir senha"}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span className="text-xs text-slate-600">Lembrar neste navegador</span>
              </label>
            </div>

            <Button
              type="submit"
              disabled={isLoading}
              className="w-full mt-3 h-11 text-sm font-semibold rounded-xl bg-brand-600 hover:bg-brand-700 text-white shadow-sm gap-2"
            >
              {isLoading ? (
                <>
                  <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  <span>Verificando credenciais...</span>
                </>
              ) : (
                <>
                  <span>Entrar no Sistema</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </form>

          {/* Dica discreta de primeiro acesso */}
          <div className="mt-8 rounded-xl border border-slate-200/90 bg-slate-50/60 p-3.5 text-xs text-slate-500">
            <span className="font-semibold text-slate-700">Primeiro acesso?</span>
            <p className="mt-0.5 text-[11px] text-slate-500 leading-relaxed">
              Utilize o e-mail do seu cadastro corporativo (ex: <code className="text-brand-700 font-mono">admin@odontoprint.com.br</code>) ou contate o responsável técnico do laboratório para liberação de acesso.
            </p>
          </div>

          <div className="mt-10 pt-6 border-t border-slate-100 flex items-center justify-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-slate-400" />
            <span>Ambiente Seguro Criptografado &bull; TLS 1.3</span>
          </div>
        </div>
      </div>
    </div>
  );
}
