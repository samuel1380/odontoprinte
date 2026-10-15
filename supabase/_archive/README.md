# Arquivo morto — NÃO EXECUTE

Estes scripts foram **totalmente incorporados** ao `supabase/setup_completo.sql`
(script oficial e único) e mantidos aqui só como histórico do git.

- `20261014_fix_mesa_print_jobs_prod.APPLIED.sql` — patch de emergência de
  2026-10-14 (updated_at, metadados da fila, batch_number, RLS). Tudo já está
  dentro do setup oficial.
- `seed.DEPRECATED.sql` — era 100% redundante (INSERT de settings duplicado +
  `setval(...,1)` destrutivo que zerava numeração com dados existentes).

Para banco novo ou existente, rode **apenas** `supabase/setup_completo.sql`.
