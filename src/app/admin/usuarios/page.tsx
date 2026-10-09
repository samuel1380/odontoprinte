"use client";

import React, { useState, useEffect } from "react";
import { AppShell } from "@/components/layout/shell";
import { useAuth } from "@/lib/auth-context";
import { OdontoPrintService } from "@/services/odontoprint-service";
import { USER_ROLES, UserRole, ROLE_PERMISSIONS } from "@/lib/constants";
import { Profile } from "@/types/database.types";
import { 
  Users, 
  ShieldCheck, 
  Plus, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  UserPlus, 
  ShieldAlert,
  Trash2,
  RefreshCw
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "sonner";

type UserItem = Profile & { email?: string };

export default function AdminUsuariosPage() {
  const { user: currentUser } = useAuth();
  const [usersList, setUsersList] = useState<UserItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [modalOpen, setModalOpen] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("CADISTA");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const data = await OdontoPrintService.getUsers();
      setUsersList(data);
    } catch {
      toast.error("Erro ao carregar lista de usuários.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const pendingUsers = usersList.filter((u) => u.active === false);
  const activeUsers = usersList.filter((u) => u.active !== false);

  const handleApprove = async (userId: string, name: string) => {
    try {
      const ok = await OdontoPrintService.approveUser(userId);
      if (ok) {
        toast.success(`Acesso de ${name} aprovado com sucesso!`);
        await loadUsers();
      } else {
        toast.error("Não foi possível aprovar a solicitação.");
      }
    } catch {
      toast.error("Erro ao aprovar usuário.");
    }
  };

  const handleReject = async (userId: string, name: string) => {
    if (!confirm(`Deseja recusar a solicitação de acesso de ${name}?`)) {
      return;
    }
    try {
      const ok = await OdontoPrintService.rejectUser(userId);
      if (ok) {
        toast.info(`Solicitação de ${name} foi recusada.`);
        await loadUsers();
      } else {
        toast.error("Não foi possível recusar a solicitação.");
      }
    } catch {
      toast.error("Erro ao recusar usuário.");
    }
  };

  const handleRoleChange = async (userId: string, newRoleValue: UserRole) => {
    try {
      const ok = await OdontoPrintService.updateUserRole(userId, newRoleValue);
      if (ok) {
        const roleLabel = (USER_ROLES as Record<string, string>)[newRoleValue] || newRoleValue;
        toast.success(`Papel do usuário atualizado para ${roleLabel}`);
        await loadUsers();
      } else {
        toast.error("Não foi possível atualizar o papel.");
      }
    } catch {
      toast.error("Erro ao alterar papel do usuário.");
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName.trim() || !newEmail.trim()) {
      toast.error("Preencha todos os campos obrigatórios.");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await OdontoPrintService.requestUserAccess({
        full_name: newFullName.trim(),
        email: newEmail.trim().toLowerCase(),
        password: "senhaProvisoria123",
        role: newRole,
      });

      if (res.success) {
        // Como o próprio administrador está adicionando, aprova imediatamente
        const updatedList = await OdontoPrintService.getUsers();
        const found = updatedList.find((u) => u.email?.toLowerCase() === newEmail.trim().toLowerCase());
        if (found) {
          await OdontoPrintService.approveUser(found.id);
        }
        toast.success(`Colaborador ${newFullName} cadastrado e ativado com sucesso!`);
        setModalOpen(false);
        setNewFullName("");
        setNewEmail("");
        setNewRole("CADISTA");
        await loadUsers();
      } else {
        toast.error(res.error || "Não foi possível cadastrar o usuário.");
      }
    } catch {
      toast.error("Erro ao criar usuário.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight flex items-center gap-2">
              Usuários e Permissões
            </h1>
            <p className="text-xs text-slate-400 mt-0.5">
              Cadastre novos membros da equipe e defina o perfil de acesso às funções do sistema.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={loadUsers}
              disabled={isLoading}
              className="gap-1.5 w-full sm:w-auto justify-center border-slate-700 bg-slate-800/80 text-slate-300 hover:text-white hover:bg-slate-800"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button onClick={() => setModalOpen(true)} size="sm" className="gap-1.5 font-bold w-full sm:w-auto justify-center bg-white text-slate-950 hover:bg-slate-200">
              <Plus className="w-4 h-4" />
              + Novo Usuário
            </Button>
          </div>
        </div>

        {/* Roles Description Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]).map((roleKey) => {
            const roleInfo = ROLE_PERMISSIONS[roleKey];
            return (
              <Card key={roleKey} className="p-4 bg-[#0F172A] border border-slate-800">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="secondary" className="font-bold text-xs bg-slate-800 text-slate-200 border-slate-700">
                    {roleInfo.label}
                  </Badge>
                  <ShieldCheck className="w-4 h-4 text-cyan-400" />
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  {roleInfo.description}
                </p>
              </Card>
            );
          })}
        </div>

        {/* SECTION 1: SOLICITAÇÕES DE ACESSO PENDENTES */}
        <Card className="border-amber-500/30 bg-amber-950/15 overflow-hidden">
          <CardHeader className="bg-amber-950/25 border-b border-amber-500/20 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2 text-amber-300 font-bold">
                  <Clock className="w-4 h-4 text-amber-400" />
                  Solicitações de Acesso Pendentes
                  {pendingUsers.length > 0 && (
                    <Badge className="bg-amber-500 text-slate-950 font-bold text-xs px-2 py-0.5">
                      {pendingUsers.length} pendente{pendingUsers.length > 1 ? "s" : ""}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-xs text-amber-400/80 mt-0.5">
                  Novos colaboradores que solicitaram acesso na tela de login e aguardam autorização do Administrador.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4">
            {pendingUsers.length === 0 ? (
              <div className="text-center py-6 text-slate-400 bg-[#0B0F19]/50 rounded-xl border border-dashed border-slate-800">
                <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto mb-2 opacity-80" />
                <p className="text-sm font-semibold text-slate-300">Nenhuma solicitação pendente</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Todas as solicitações de acesso ao laboratório foram revisadas e liberadas.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingUsers.map((applicant) => (
                  <div
                    key={applicant.id}
                    className="p-3.5 bg-[#0F172A] rounded-xl border border-amber-500/30 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-amber-500/20 border border-amber-500/30 text-amber-300 flex items-center justify-center font-bold text-sm shrink-0">
                        {applicant.full_name?.charAt(0) || "U"}
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm flex items-center gap-2">
                          {applicant.full_name}
                          <Badge variant="outline" className="text-xs border-amber-500/40 bg-amber-950/40 text-amber-300 font-semibold">
                            Função: {(USER_ROLES as Record<string, string>)[applicant.role] || applicant.role}
                          </Badge>
                        </div>
                        <div className="text-xs text-slate-400 flex items-center gap-2 mt-0.5">
                          <span>{applicant.email || "Sem e-mail"}</span>
                          <span>&bull;</span>
                          <span className="text-slate-500">
                            Solicitado em {new Date(applicant.created_at).toLocaleDateString("pt-BR")}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-auto">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(applicant.id, applicant.full_name)}
                        className="text-xs border-rose-500/40 bg-rose-950/20 text-rose-300 hover:bg-rose-950/40 hover:text-rose-200 gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Recusar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(applicant.id, applicant.full_name)}
                        className="text-xs bg-emerald-600 hover:bg-emerald-500 text-white font-semibold gap-1"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Aprovar Acesso
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* SECTION 2: EQUIPE ATIVA */}
        <Card className="bg-[#0F172A] border-slate-800">
          <CardHeader className="pb-3 border-b border-slate-800">
            <CardTitle className="text-base flex items-center gap-2 text-white font-bold">
              <Users className="w-4 h-4 text-cyan-400" />
              Equipe Ativa no Laboratório ({activeUsers.length})
            </CardTitle>
            <CardDescription className="text-xs text-slate-400">
              Colaboradores com permissão ativa para acessar os módulos autorizados.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-800">
              {activeUsers.map((u) => {
                const isCurrentUser = currentUser?.email?.toLowerCase() === u.email?.toLowerCase();
                const isRootAdmin = u.email?.toLowerCase() === "admin@odontoprint.com.br";

                return (
                  <div
                    key={u.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-slate-800/40 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 font-bold text-sm shrink-0">
                        {u.full_name?.charAt(0) || "U"}
                      </div>
                      <div>
                        <div className="font-bold text-white text-sm flex items-center gap-2">
                          {u.full_name}
                          {isCurrentUser && (
                            <Badge className="bg-slate-800 text-slate-300 text-[10px] px-1.5 py-0 border-slate-700">
                              Você
                            </Badge>
                          )}
                          {isRootAdmin && (
                            <Badge className="bg-cyan-500/20 text-cyan-300 text-[10px] px-1.5 py-0 border-cyan-500/30">
                              Root Admin
                            </Badge>
                          )}
                        </div>
                        <div className="text-slate-400 text-xs">{u.email}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <label className="text-[11px] text-slate-400 font-medium sm:hidden">
                          Papel de Acesso:
                        </label>
                        <select
                          value={u.role}
                          disabled={isRootAdmin}
                          onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                          className="px-3 py-1.5 text-xs rounded-lg border border-slate-800 bg-[#0B0F19] font-semibold text-white focus:outline-none focus:border-cyan-500 disabled:opacity-60 disabled:bg-slate-900"
                        >
                          {(Object.keys(USER_ROLES) as (keyof typeof USER_ROLES)[]).map((r) => (
                            <option key={r} value={r}>
                              {USER_ROLES[r]}
                            </option>
                          ))}
                        </select>
                      </div>

                      <Badge variant="success" className="font-semibold text-xs">
                        Ativo
                      </Badge>

                      {!isRootAdmin && !isCurrentUser && (
                        <button
                          type="button"
                          onClick={() => handleReject(u.id, u.full_name)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded-md hover:bg-slate-800 transition"
                          title="Remover / Desativar Colaborador"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        {/* Modal: Novo Colaborador */}
        <Dialog
          open={modalOpen}
          onOpenChange={setModalOpen}
          title="Cadastrar Novo Colaborador"
          description="Adicione um colaborador diretamente com liberação imediata de acesso."
        >
          <form onSubmit={handleCreateUser} className="space-y-4 pt-2">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nome Completo *
              </label>
              <input
                type="text"
                required
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder="Ex: Dra. Camila Soares"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-[#0B0F19] text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                E-mail Corporativo *
              </label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Ex: camila@odontoprint.com.br"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-[#0B0F19] text-white focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Papel Operacional (Perfil) *
              </label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-800 bg-[#0B0F19] text-white focus:outline-none focus:border-cyan-500 font-semibold"
              >
                {(Object.keys(USER_ROLES) as (keyof typeof USER_ROLES)[]).map((r) => (
                  <option key={r} value={r}>
                    {USER_ROLES[r]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-white"
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting} className="font-bold bg-white text-slate-950 hover:bg-slate-200">
                {isSubmitting ? "Cadastrando..." : "Cadastrar & Liberar Acesso"}
              </Button>
            </div>
          </form>
        </Dialog>
      </div>
    </AppShell>
  );
}
