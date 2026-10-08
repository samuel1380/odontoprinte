"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { UserRole, USER_ROLES } from "@/lib/constants";
import { createClient } from "@/lib/supabase/client";

export interface UserProfile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
}

interface AuthContextType {
  user: UserProfile | null;
  activeRole: UserRole | null;
  setActiveRole: (role: UserRole) => void;
  isLoading: boolean;
  login: (email: string, password?: string) => Promise<{ success: boolean; error?: string }>;
  signUp: (email: string, password: string, fullName: string, role?: UserRole) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  isSupabaseConnected: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [activeRole, setActiveRoleState] = useState<UserRole | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSupabaseConnected, setIsSupabaseConnected] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const { client, isConfigured } = createClient();

    async function initAuth() {
      try {
        if (isConfigured && client) {
          setIsSupabaseConnected(true);

          // 1. Verifica sessão ativa no Supabase
          const { data: { session } } = await client.auth.getSession();
          if (session?.user && isMounted) {
            const authUser = session.user;
            let role: UserRole = (authUser.user_metadata?.role as UserRole) || "ADMIN";
            let fullName = authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || "Operador";

            try {
              const { data: profileData } = await client
                .from("profiles")
                .select("role, full_name")
                .eq("id", authUser.id)
                .maybeSingle();

              if (profileData) {
                if (profileData.role) role = profileData.role as UserRole;
                if (profileData.full_name) fullName = profileData.full_name;
              }
            } catch {
              // fallback to metadata
            }

            const profile: UserProfile = {
              id: authUser.id,
              email: authUser.email || "usuario@odontoprint.com.br",
              full_name: fullName,
              role,
            };

            setUser(profile);
            const savedRole = localStorage.getItem("odontoprint_active_role") as UserRole;
            setActiveRoleState(savedRole && (USER_ROLES as Record<string, string>)[savedRole] ? savedRole : profile.role);
          } else if (isMounted) {
            // Sem sessão ativa: usuário DEVE iniciar deslogado
            setUser(null);
            setActiveRoleState(null);
            localStorage.removeItem("odontoprint_user");
            localStorage.removeItem("odontoprint_active_role");
          }

          // 2. Escuta mudanças de sessão em tempo real
          const { data: { subscription } } = client.auth.onAuthStateChange(async (event, newSession) => {
            if (!isMounted) return;

            if (newSession?.user) {
              const authUser = newSession.user;
              let role: UserRole = (authUser.user_metadata?.role as UserRole) || "ADMIN";
              let fullName = authUser.user_metadata?.full_name || authUser.email?.split("@")[0] || "Operador";

              try {
                const { data: profileData } = await client
                  .from("profiles")
                  .select("role, full_name")
                  .eq("id", authUser.id)
                  .maybeSingle();

                if (profileData) {
                  if (profileData.role) role = profileData.role as UserRole;
                  if (profileData.full_name) fullName = profileData.full_name;
                }
              } catch {
                // fallback
              }

              const profile: UserProfile = {
                id: authUser.id,
                email: authUser.email || "usuario@odontoprint.com.br",
                full_name: fullName,
                role,
              };

              setUser(profile);
              setActiveRoleState(profile.role);
              localStorage.setItem("odontoprint_user", JSON.stringify(profile));
              localStorage.setItem("odontoprint_active_role", profile.role);
            } else if (event === "SIGNED_OUT") {
              setUser(null);
              setActiveRoleState(null);
              localStorage.removeItem("odontoprint_user");
              localStorage.removeItem("odontoprint_active_role");
            }
          });

          return () => {
            subscription.unsubscribe();
          };
        } else {
          // Supabase não configurado (modo local):
          setIsSupabaseConnected(false);
          const savedUser = localStorage.getItem("odontoprint_user");
          if (savedUser && isMounted) {
            try {
              const parsed = JSON.parse(savedUser);
              if (parsed?.id && parsed?.email) {
                setUser(parsed);
                const savedRole = localStorage.getItem("odontoprint_active_role") as UserRole;
                setActiveRoleState(savedRole && (USER_ROLES as Record<string, string>)[savedRole] ? savedRole : parsed.role || "ADMIN");
              }
            } catch {
              localStorage.removeItem("odontoprint_user");
              setUser(null);
              setActiveRoleState(null);
            }
          } else if (isMounted) {
            setUser(null);
            setActiveRoleState(null);
          }
        }
      } catch (err) {
        console.error("Erro ao verificar sessão inicial:", err);
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    initAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const setActiveRole = (role: UserRole) => {
    setActiveRoleState(role);
    localStorage.setItem("odontoprint_active_role", role);
    setUser((prev) => {
      if (!prev) return null;
      const updated = { ...prev, role };
      localStorage.setItem("odontoprint_user", JSON.stringify(updated));
      return updated;
    });
  };

  const login = async (email: string, password?: string): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail) {
        return { success: false, error: "Por favor, digite seu e-mail corporativo." };
      }
      if (!password || password.trim().length === 0) {
        return { success: false, error: "Por favor, digite sua senha de acesso." };
      }
      const cleanPassword = password.trim();

      const { client, isConfigured } = createClient();

      if (isConfigured && client) {
        const { data, error } = await client.auth.signInWithPassword({
          email: cleanEmail,
          password: cleanPassword,
        });

        if (error) {
          // Se for a credencial padrão de administrador e ainda não existir no banco, cria e loga automaticamente
          if (cleanEmail === "admin@odontoprint.com.br" && cleanPassword === "admin123") {
            try {
              const signUpRes = await client.auth.signUp({
                email: cleanEmail,
                password: cleanPassword,
                options: {
                  data: {
                    full_name: "Administrador do Laboratório",
                    role: "ADMIN",
                  },
                },
              });

              if (signUpRes.data?.user) {
                const profile: UserProfile = {
                  id: signUpRes.data.user.id,
                  email: cleanEmail,
                  full_name: "Administrador do Laboratório",
                  role: "ADMIN",
                };
                try {
                  await client.from("profiles").upsert({
                    id: signUpRes.data.user.id,
                    full_name: "Administrador do Laboratório",
                    role: "ADMIN",
                    active: true,
                  });
                } catch {
                  // ignore
                }
                setUser(profile);
                setActiveRoleState("ADMIN");
                localStorage.setItem("odontoprint_user", JSON.stringify(profile));
                localStorage.setItem("odontoprint_active_role", "ADMIN");
                return { success: true };
              }
            } catch {
              // segue para o erro padrão
            }
          }

          let errorMsg = error.message;
          if (errorMsg.includes("Invalid login credentials")) {
            errorMsg = "E-mail ou senha incorretos. Verifique suas credenciais.";
          } else if (errorMsg.includes("Email not confirmed")) {
            errorMsg = "E-mail cadastrado, mas ainda não confirmado no Supabase.";
          }
          return { success: false, error: errorMsg };
        }

        if (data.user) {
          let role: UserRole = (data.user.user_metadata?.role as UserRole) || "ADMIN";
          let fullName = data.user.user_metadata?.full_name || cleanEmail.split("@")[0];

          try {
            const { data: profileData } = await client
              .from("profiles")
              .select("role, full_name")
              .eq("id", data.user.id)
              .maybeSingle();

            if (profileData) {
              if (profileData.role) role = profileData.role as UserRole;
              if (profileData.full_name) fullName = profileData.full_name;
            } else {
              // Cria o perfil na tabela profiles se ainda não existir
              await client.from("profiles").upsert({
                id: data.user.id,
                full_name: fullName,
                role: role,
                active: true,
              });
            }
          } catch {
            // prossegue com os dados de metadata
          }

          const profile: UserProfile = {
            id: data.user.id,
            email: data.user.email || cleanEmail,
            full_name: fullName,
            role,
          };

          setUser(profile);
          setActiveRoleState(profile.role);
          localStorage.setItem("odontoprint_user", JSON.stringify(profile));
          localStorage.setItem("odontoprint_active_role", profile.role);
          return { success: true };
        }
      }

      // Autenticação local quando Supabase não estiver configurado
      let detectedRole: UserRole = "CADISTA";
      if (cleanEmail.includes("admin")) detectedRole = "ADMIN";
      else if (cleanEmail.includes("resina")) detectedRole = "OPERADOR_RESINA";
      else if (cleanEmail.includes("impress")) detectedRole = "OPERADOR_IMPRESSAO";
      else if (cleanEmail.includes("acabamento") || cleanEmail.includes("protetico")) detectedRole = "PROTETICO_ACABAMENTO";

      const cleanName = cleanEmail
        .split("@")[0]
        .split(".")
        .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
        .join(" ");

      const profile: UserProfile = {
        id: crypto.randomUUID(),
        email: cleanEmail,
        full_name: cleanName || "Operador OdontoPrint",
        role: detectedRole,
      };

      setUser(profile);
      setActiveRoleState(detectedRole);
      localStorage.setItem("odontoprint_user", JSON.stringify(profile));
      localStorage.setItem("odontoprint_active_role", detectedRole);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Falha ao realizar login." };
    } finally {
      setIsLoading(false);
    }
  };

  const signUp = async (
    email: string,
    password: string,
    fullName: string,
    role: UserRole = "ADMIN"
  ): Promise<{ success: boolean; error?: string }> => {
    setIsLoading(true);
    try {
      const cleanEmail = email.trim().toLowerCase();
      const { client, isConfigured } = createClient();

      if (isConfigured && client) {
        const { data, error } = await client.auth.signUp({
          email: cleanEmail,
          password: password.trim(),
          options: {
            data: {
              full_name: fullName.trim(),
              role,
            },
          },
        });

        if (error) {
          return { success: false, error: error.message };
        }

        if (data.user) {
          // Registra no profiles
          try {
            await client.from("profiles").upsert({
              id: data.user.id,
              full_name: fullName.trim(),
              role,
              active: true,
            });
          } catch {
            // ignora se falhar
          }

          // Se auto-confirmado ou sessão retornada
          if (data.session) {
            const profile: UserProfile = {
              id: data.user.id,
              email: cleanEmail,
              full_name: fullName.trim(),
              role,
            };
            setUser(profile);
            setActiveRoleState(role);
            localStorage.setItem("odontoprint_user", JSON.stringify(profile));
            localStorage.setItem("odontoprint_active_role", role);
          }

          return { success: true };
        }
      }

      // Modo local
      const profile: UserProfile = {
        id: crypto.randomUUID(),
        email: cleanEmail,
        full_name: fullName.trim(),
        role,
      };
      setUser(profile);
      setActiveRoleState(role);
      localStorage.setItem("odontoprint_user", JSON.stringify(profile));
      localStorage.setItem("odontoprint_active_role", role);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message || "Erro ao registrar usuário." };
    } finally {
      setIsLoading(false);
    }
  };

  const logout = async () => {
    try {
      const { client, isConfigured } = createClient();
      if (isConfigured && client) {
        await client.auth.signOut();
      }
    } catch (err) {
      console.error("Erro ao encerrar sessão:", err);
    } finally {
      setUser(null);
      setActiveRoleState(null);
      localStorage.removeItem("odontoprint_user");
      localStorage.removeItem("odontoprint_active_role");
      window.location.href = "/login";
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        activeRole,
        setActiveRole,
        isLoading,
        login,
        signUp,
        logout,
        isSupabaseConnected,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth deve ser usado dentro de um AuthProvider");
  }
  return context;
}
