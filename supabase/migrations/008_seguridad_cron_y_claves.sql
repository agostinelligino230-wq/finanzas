-- 008: seguridad. El programador diario llama a la función gmail con una clave secreta,
-- y los importadores viejos (que ya no usa la app) dejan de poder llamarse con la clave pública.

-- ANTES de correr esta migración, guardá la clave en Vault una sola vez (el mismo valor que el secreto CRON_SECRET de la función):
--   select vault.create_secret('<la clave>', 'cron_secret');
-- Así la clave no queda escrita en ningún archivo del repo.

-- 1) Lectura diaria (7:17 de Argentina) con la clave en el encabezado X-Cron-Secret.
select cron.unschedule('leer-gmail') where exists (select 1 from cron.job where jobname = 'leer-gmail');
select cron.schedule(
  'leer-gmail',
  '17 10 * * *',
  $$ select net.http_post(
       url := 'https://jlsqtygwaertmhurjwbj.supabase.co/functions/v1/gmail',
       headers := jsonb_build_object('Content-Type', 'application/json', 'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1)),
       body := '{"cron": true}'::jsonb
     ); $$
);

-- 2) Importadores viejos: se quitan los permisos (no se borran, por si hiciera falta volver atrás).
revoke execute on function public.import_uala(text, jsonb, jsonb) from anon, authenticated;
revoke execute on function public.import_cuentas(text, jsonb, jsonb) from anon, authenticated;
