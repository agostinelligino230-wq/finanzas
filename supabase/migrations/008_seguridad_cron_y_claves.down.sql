-- Vuelve atrás la 008: el programador diario llama sin clave y los importadores viejos se pueden llamar otra vez.
-- Ojo: esto vuelve a abrir los dos agujeros que cierra la 008. Usar solo si algo se rompió.
select cron.unschedule('leer-gmail') where exists (select 1 from cron.job where jobname = 'leer-gmail');
select cron.schedule(
  'leer-gmail',
  '17 10 * * *',
  $$ select net.http_post(url := 'https://jlsqtygwaertmhurjwbj.supabase.co/functions/v1/gmail', headers := '{"Content-Type": "application/json"}'::jsonb, body := '{"cron": true}'::jsonb); $$
);
grant execute on function public.import_uala(text, jsonb, jsonb) to anon, authenticated;
grant execute on function public.import_cuentas(text, jsonb, jsonb) to anon, authenticated;
