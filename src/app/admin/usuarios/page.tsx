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
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-brand-700 bg-brand-50 border-brand-200 font-semibold">
                Administração do Sistema
              </Badge>
              <span className="text-xs text-slate-400">&bull;</span>
              <span className="text-xs text-slate-500 font-medium">Controle de Acesso & Autorização RBAC</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1 flex items-center gap-2">
              Gestão de Usuários e Acessos
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Aprove novos acessos ao laboratório, gerencie perfis operacionais e audite permissões técnicas.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={loadUsers}
              disabled={isLoading}
              className="gap-1.5"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
              Atualizar
            </Button>
            <Button onClick={() => setModalOpen(true)} size="sm" className="gap-1.5 font-bold">
              <Plus className="w-4 h-4" />
              Adicionar Colaborador
            </Button>
          </div>
        </div>

        {/* Roles Description Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {(Object.keys(ROLE_PERMISSIONS) as (keyof typeof ROLE_PERMISSIONS)[]).map((roleKey) => {
            const roleInfo = ROLE_PERMISSIONS[roleKey];
            return (
              <Card key={roleKey} className="p-4 bg-white border border-slate-200/80 shadow-subtle">
                <div className="flex items-center justify-between mb-2">
                  <Badge variant="secondary" className="font-bold text-xs">
                    {roleInfo.label}
                  </Badge>
                  <ShieldCheck className="w-4 h-4 text-brand-500" />
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {roleInfo.description}
                </p>
              </Card>
            );
          })}
        </div>

        {/* SECTION 1: SOLICITAÇÕES DE ACESSO PENDENTES */}
        <Card className="border-amber-200/80 bg-amber-50/20 shadow-subtle overflow-hidden">
          <CardHeader className="bg-amber-50/50 border-b border-amber-100 pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2 text-amber-950 font-bold">
                  <Clock className="w-4 h-4 text-amber-600" />
                  Solicitações de Acesso Pendentes
                  {pendingUsers.length > 0 && (
                    <Badge className="bg-amber-500 text-white hover:bg-amber-600 text-xs px-2 py-0.5">
                      {pendingUsers.length} pendente{pendingUsers.length > 1 ? "s" : ""}
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="text-xs text-amber-800/80 mt-0.5">
                  Novos colaboradores que solicitaram acesso na tela de login e aguardam autorização do Administrador.
                </CardDescription>
              </div>
            </div>
          </CardHeader>

          <CardContent className="p-4">
            {pendingUsers.length === 0 ? (
              <div className="text-center py-6 text-slate-500 bg-white/60 rounded-xl border border-dashed border-amber-200">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                <p className="text-sm font-semibold text-slate-700">Nenhuma solicitação pendente</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Todas as solicitações de acesso ao laboratório foram revisadas e liberadas.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {pendingUsers.map((applicant) => (
                  <div
                    key={applicant.id}
                    className="p-3.5 bg-white rounded-xl border border-amber-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-amber-100 border border-amber-200 text-amber-800 flex items-center justify-center font-bold text-sm shrink-0">
                        {applicant.full_name?.charAt(0) || "U"}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                          {applicant.full_name}
                          <Badge variant="outline" className="text-xs border-amber-300 bg-amber-50 text-amber-800 font-semibold">
                            Função: {(USER_ROLES as Record<string, string>)[applicant.role] || applicant.role}
                          </Badge>
                        </div>
                        <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                          <span>{applicant.email || "Sem e-mail"}</span>
                          <span>&bull;</span>
                          <span className="text-slate-400">
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
                        className="text-xs border-rose-200 text-rose-600 hover:bg-rose-50 hover:text-rose-700 gap-1"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Recusar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApprove(applicant.id, applicant.full_name)}
                        className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1"
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
        <Card className="bg-white border-slate-200/80 shadow-subtle">
          <CardHeader className="pb-3 border-b border-slate-100">
            <CardTitle className="text-base flex items-center gap-2 text-slate-900 font-bold">
              <Users className="w-4 h-4 text-brand-600" />
              Equipe Ativa no Laboratório ({activeUsers.length})
            </CardTitle>
            <CardDescription className="text-xs text-slate-500">
              Colaboradores com permissão ativa para acessar os módulos autorizados.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-slate-100">
              {activeUsers.map((u) => {
                const isCurrentUser = currentUser?.email?.toLowerCase() === u.email?.toLowerCase();
                const isRootAdmin = u.email?.toLowerCase() === "admin@odontoprint.com.br";

                return (
                  <div
                    key={u.id}
                    className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-slate-50/50 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-100 text-brand-700 font-bold text-sm shrink-0">
                        {u.full_name?.charAt(0) || "U"}
                      </div>
                      <div>
                        <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                          {u.full_name}
                          {isCurrentUser && (
                            <Badge className="bg-slate-100 text-slate-700 text-[10px] px-1.5 py-0 border-slate-200">
                              Você
                            </Badge>
                          )}
                          {isRootAdmin && (
                            <Badge className="bg-brand-50 text-brand-700 text-[10px] px-1.5 py-0 border-brand-200">
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
                          className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-white font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500 disabled:opacity-60 disabled:bg-slate-100"
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
                          className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition"
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
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nome Completo *
              </label>
              <input
                type="text"
                required
                value={newFullName}
                onChange={(e) => setNewFullName(e.target.value)}
                placeholder="Ex: Dra. Camila Soares"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                E-mail Corporativo *
              </label>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="Ex: camila@odontoprint.com.br"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Papel Operacional (Perfil) *
              </label>
              <select
                value={newRole}
                onChange={(e) => setNewRole(e.target.value as UserRole)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-brand-500 font-semibold"
              >
                {(Object.keys(USER_ROLES) as (keyof typeof USER_ROLES)[]).map((r) => (
                  <option key={r} value={r}>
                    {USER_ROLES[r]}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" size="sm" disabled={isSubmitting} className="font-bold">
                {isSubmitting ? "Cadastrando..." : "Cadastrar & Liberar Acesso"}
              </Button>
            </div>
          </form>
        </Dialog>
      </div>
    </AppShell>
  );
}
