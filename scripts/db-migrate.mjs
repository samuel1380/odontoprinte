#!/usr/bin/env node
/**
 * OdontoPrint — runner de migrations do Supabase/Postgres.
 *
 * Uso:
 *   DATABASE_URL="postgresql://..." npm run db:migrate
 *
 * - Aplica, em ordem alfabética, todos os `supabase/migrations/*.sql`
 *   ainda não registrados em `public.schema_migrations`.
 * - Idempotente: pode rodar a cada deploy sem medo (só roda o que falta).
 * - Sem DATABASE_URL: pula com aviso (exit 0) para não quebrar deploys
 *   antes de você configurar o segredo no Render.
 *
 * No Render, este script roda como `preDeployCommand` (ver render.yaml).
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");

const DATABASE_URL = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || "";

if (!DATABASE_URL) {
  console.log("[db:migrate] DATABASE_URL não configurada — pulando migrations (exit 0).");
  process.exit(0);
}

const client = new pg.Client({
  connectionString: DATABASE_URL,
  // Supabase exige SSL; banco local/docker geralmente não tem (use ?sslmode=disable).
  ssl: /sslmode=disable/.test(DATABASE_URL) ? false : { rejectUnauthorized: false },
  statement_timeout: 120000,
});

async function main() {
  await client.connect();
  try {
    // Trava consultiva: dois deploys simultâneos não aplicam a mesma migration.
    await client.query("SELECT pg_advisory_lock(840137)");
    await client.query(`
      CREATE TABLE IF NOT EXISTS public.schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);
    const { rows } = await client.query("SELECT name FROM public.schema_migrations;");
    const applied = new Set(rows.map((r) => r.name));

    let files = [];
    try {
      files = (await readdir(MIGRATIONS_DIR))
        .filter((f) => f.endsWith(".sql"))
        .sort();
    } catch {
      console.log("[db:migrate] pasta supabase/migrations vazia ou ausente — nada a fazer.");
      return;
    }

    const pending = files.filter((f) => !applied.has(f));
    if (pending.length === 0) {
      console.log(`[db:migrate] banco atualizado (${files.length} migration(s) já aplicadas).`);
      return;
    }

    for (const file of pending) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
      if (!sql.trim() || sql.trim().startsWith("-- empty")) {
        console.log(`[db:migrate] ${file}: vazia, marcando como aplicada.`);
      } else {
        console.log(`[db:migrate] aplicando ${file}...`);
        await client.query(sql);
      }
      await client.query("INSERT INTO public.schema_migrations (name) VALUES ($1);", [file]);
      console.log(`[db:migrate] ${file}: OK.`);
    }
    console.log(`[db:migrate] concluído: ${pending.length} migration(s) aplicada(s).`);
  } finally {
    try {
      await client.query("SELECT pg_advisory_unlock(840137)");
    } catch {
      // ignora
    }
    await client.end();
  }
}

main().catch((err) => {
  console.error(`[db:migrate] FALHOU: ${err?.message || err}`);
  process.exit(1);
});
