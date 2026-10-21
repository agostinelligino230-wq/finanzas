-- Vuelta atrás de 012: Naranja X deja de leerse por mail.
alter table public.gmail_links alter column providers set default array['uala', 'mercadopago', 'wallbit', 'nacion', 'macro'];
update public.gmail_links set providers = array_remove(providers, 'naranjax');
