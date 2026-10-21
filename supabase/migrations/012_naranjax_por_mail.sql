-- 012: Naranja X por mail (compras con la tarjeta de crédito). Queda prendida como las demás cuentas;
-- cada uno la puede apagar en Cuentas.
alter table public.gmail_links alter column providers set default array['uala', 'mercadopago', 'wallbit', 'nacion', 'macro', 'naranjax'];
update public.gmail_links set providers = array_append(providers, 'naranjax') where not ('naranjax' = any(providers));
