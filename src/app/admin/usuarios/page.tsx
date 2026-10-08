"use client";

import React, { useState } from "react";
import { AppShell } from "@/components/layout/shell";
import { useAuth } from "@/lib/auth-context";
import { USER_ROLES, UserRole, ROLE_PERMISSIONS } from "@/lib/constants";
import { Users, ShieldCheck, Plus, CheckCircle2, UserCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { toast } from "sonner";

interface MockUser {
  id: string;
  full_name: string;
  email: string;
  role: UserRole;
  active: boolean;
}

export default function AdminUsuariosPage() {
  const { user: currentUser } = useAuth();

  const [usersList, setUsersList] = useState<MockUser[]>([
    {
      id: "u1",
      full_name: "Dr. Marcelo Arquiteto",
      email: "admin@odontoprint.com.br",
      role: "ADMIN",
      active: true,
    },
    {
      id: "u2",
      full_name: "Dra. Juliana Ribeiro",
      email: "juliana.cad@odontoprint.com.br",
      role: "CADISTA",
      active: true,
    },
    {
      id: "u3",
      full_name: "Lucas Mendes",
      email: "lucas.print@odontoprint.com.br",
      role: "OPERADOR_IMPRESSAO",
      active: true,
    },
    {
      id: "u4",
      full_name: "Eng. Rafael Costa",
      email: "rafael.print@odontoprint.com.br",
      role: "OPERADOR_IMPRESSAO",
      active: true,
    },
  ]);

  const [modalOpen, setModalOpen] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<UserRole>("CADISTA");

  const handleRoleChange = (userId: string, newRoleValue: UserRole) => {
    setUsersList((prev) =>
      prev.map((u) => (u.id === userId ? { ...u, role: newRoleValue } : u))
    );
    const roleLabel = (USER_ROLES as Record<string, string>)[newRoleValue] || newRoleValue;
    toast.success(`Papel do usuário atualizado para ${roleLabel}`);
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFullName.trim() || !newEmail.trim()) {
      toast.error("Preencha todos os campos.");
      return;
    }

    const newUser: MockUser = {
      id: crypto.randomUUID(),
      full_name: newFullName.trim(),
      email: newEmail.trim().toLowerCase(),
      role: newRole,
      active: true,
    };

    setUsersList((prev) => [...prev, newUser]);
    const roleLabel = (USER_ROLES as Record<string, string>)[newRole] || newRole;
    toast.success(`Usuário ${newUser.full_name} criado com papel ${roleLabel}!`);
    setModalOpen(false);
    setNewFullName("");
    setNewEmail("");
    setNewRole("CADISTA");
  };

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-brand-700 bg-brand-50 border-brand-200">
                Administração
              </Badge>
              <span className="text-xs text-slate-400">&bull;</span>
              <span className="text-xs text-slate-500">Controle de Acesso RBAC</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight mt-1 flex items-center gap-2">
              Usuários e Perfis de Acesso
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Gerenciamento de credenciais e permissões operacionais do laboratório.
            </p>
          </div>

          <Button onClick={() => setModalOpen(true)} size="sm" className="gap-1.5 font-bold">
            <Plus className="w-4 h-4" />
            Adicionar Colaborador
          </Button>
        </div>

        {/* Roles Description Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(Object.keys(ROLE_PERMISSIONS) as UserRole[]).map((roleKey) => {
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

        {/* Users Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-4 h-4 text-brand-500" />
              Equipe do Laboratório ({usersList.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-slate-100">
              {usersList.map((u) => (
                <div
                  key={u.id}
                  className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700 font-bold">
                      {u.full_name.charAt(0)}
                    </div>
                    <div>
                      <div className="font-bold text-slate-900 text-sm">{u.full_name}</div>
                      <div className="text-slate-400">{u.email}</div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u.id, e.target.value as UserRole)}
                      className="px-3 py-1.5 text-xs rounded-lg border border-slate-200 bg-slate-50 font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-brand-500"
                    >
                      {(Object.keys(USER_ROLES) as (keyof typeof USER_ROLES)[]).map((r) => (
                        <option key={r} value={r}>
                          {USER_ROLES[r]}
                        </option>
                      ))}
                    </select>

                    <Badge variant={u.active ? "success" : "destructive"}>
                      {u.active ? "Ativo" : "Inativo"}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Modal: Novo Colaborador */}
        <Dialog
          open={modalOpen}
          onOpenChange={setModalOpen}
          title="Cadastrar Novo Colaborador"
          description="Convide um membro da equipe odontológica para acessar o sistema."
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
              <Button type="submit" size="sm" className="font-bold">
                Cadastrar Colaborador
              </Button>
            </div>
          </form>
        </Dialog>
      </div>
    </AppShell>
  );
}
