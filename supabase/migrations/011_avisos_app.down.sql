-- Vuelta atrás de 011: sin avisos propios de la app.
drop function if exists public.delete_push_token(text);
drop function if exists public.save_push_token(text, text);
drop table if exists public.push_tokens;
