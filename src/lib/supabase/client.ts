import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  let supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  let supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  // Fallback seguro para chaves salvas localmente caso o deploy não tenha injetado via build
  if (typeof window !== "undefined") {
    if (!supabaseUrl || supabaseUrl.includes("your-project-id")) {
      const savedUrl = localStorage.getItem("odontoprint_supabase_url");
      if (savedUrl) supabaseUrl = savedUrl;
    }
    if (!supabaseKey || supabaseKey.includes("your-anon-key")) {
      const savedKey = localStorage.getItem("odontoprint_supabase_anon_key");
      if (savedKey) supabaseKey = savedKey;
    }
  }

  // Verifica se as chaves foram fornecidas e não são placeholders
  const isConfigured = Boolean(
    supabaseUrl &&
    supabaseKey &&
    !supabaseUrl.includes("your-project-id") &&
    !supabaseKey.includes("your-anon-key")
  );

  return {
    client: isConfigured ? createBrowserClient(supabaseUrl, supabaseKey) : null,
    isConfigured,
    supabaseUrl: isConfigured ? supabaseUrl : "",
  };
}
