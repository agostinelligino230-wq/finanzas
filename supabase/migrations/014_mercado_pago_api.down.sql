-- Deshace 014: borra la conexión con Mercado Pago por API. Los movimientos que ya entraron quedan.
delete from public.incoming_notices where channel = 'api';
alter table public.incoming_notices drop constraint if exists incoming_notices_channel_check;
alter table public.incoming_notices add constraint incoming_notices_channel_check check (channel in ('mail', 'push'));
drop function if exists public.start_mp_link(text);
drop table if exists public.mp_link_states;
drop table if exists public.mp_links;
