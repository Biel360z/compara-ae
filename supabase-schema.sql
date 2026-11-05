create table if not exists public.stations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 80),
  addr text check (addr is null or char_length(addr) <= 120),
  lat double precision,
  lng double precision,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  check ((lat is null) = (lng is null)),
  check (lat is null or lat between -90 and 90),
  check (lng is null or lng between -180 and 180)
);

create table if not exists public.fuel_price_reports (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id),
  fuel_type text not null check (fuel_type in ('gas', 'eth')),
  price numeric(5, 2) not null check (price between 2 and 15),
  reported_by uuid not null default auth.uid() references auth.users(id),
  reported_at timestamptz not null default now()
);

create index if not exists fuel_price_reports_latest_idx
  on public.fuel_price_reports (station_id, fuel_type, reported_at desc, id desc);

alter table public.stations enable row level security;
alter table public.fuel_price_reports enable row level security;

revoke all on public.stations, public.fuel_price_reports from anon, authenticated;
grant select (id, name, addr, lat, lng, created_at)
  on public.stations to anon, authenticated;
grant select (id, station_id, fuel_type, price, reported_at)
  on public.fuel_price_reports to anon, authenticated;
grant insert (name, addr, lat, lng, created_by)
  on public.stations to authenticated;
grant insert (station_id, fuel_type, price, reported_by)
  on public.fuel_price_reports to authenticated;

drop policy if exists "Stations are publicly readable" on public.stations;
create policy "Stations are publicly readable"
  on public.stations for select
  to anon, authenticated
  using (true);

drop policy if exists "Anonymous users can add stations" on public.stations;
create policy "Anonymous users can add stations"
  on public.stations for insert
  to authenticated
  with check (
    created_by = (select auth.uid())
    and (select auth.jwt() ->> 'is_anonymous') = 'true'
  );

drop policy if exists "Price reports are publicly readable" on public.fuel_price_reports;
create policy "Price reports are publicly readable"
  on public.fuel_price_reports for select
  to anon, authenticated
  using (true);

drop policy if exists "Anonymous users can add price reports" on public.fuel_price_reports;
create policy "Anonymous users can add price reports"
  on public.fuel_price_reports for insert
  to authenticated
  with check (
    reported_by = (select auth.uid())
    and (select auth.jwt() ->> 'is_anonymous') = 'true'
  );

create or replace view public.latest_station_prices
with (security_invoker = true)
as
select distinct on (station_id, fuel_type)
  station_id,
  fuel_type,
  price,
  reported_at,
  count(*) over (partition by station_id, fuel_type) as report_count
from public.fuel_price_reports
order by station_id, fuel_type, reported_at desc, id desc;

grant select on public.latest_station_prices to anon, authenticated;

create or replace function public.submit_station_prices(
  p_station_id uuid,
  p_name text,
  p_addr text,
  p_lat double precision,
  p_lng double precision,
  p_gas_price numeric,
  p_eth_price numeric
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  submitted_station_id uuid;
begin
  if auth.uid() is null
    or coalesce(auth.jwt() ->> 'is_anonymous', 'false') <> 'true' then
    raise exception 'É necessário iniciar uma sessão anônima para enviar preços.';
  end if;

  if p_gas_price is null and p_eth_price is null then
    raise exception 'Informe o preço de pelo menos um combustível.';
  end if;

  if (p_gas_price is not null and p_gas_price not between 2 and 15)
    or (p_eth_price is not null and p_eth_price not between 2 and 15) then
    raise exception 'Os preços devem estar entre R$ 2,00 e R$ 15,00.';
  end if;

  if p_station_id is null then
    if p_name is null or char_length(btrim(p_name)) not between 1 and 80 then
      raise exception 'Informe um nome de posto com até 80 caracteres.';
    end if;
    if p_addr is not null and char_length(p_addr) > 120 then
      raise exception 'O endereço deve ter até 120 caracteres.';
    end if;
    if (p_lat is null) <> (p_lng is null)
      or (p_lat is not null and p_lat not between -90 and 90)
      or (p_lng is not null and p_lng not between -180 and 180) then
      raise exception 'A localização informada é inválida.';
    end if;

    insert into public.stations (name, addr, lat, lng)
      values (btrim(p_name), nullif(btrim(p_addr), ''), p_lat, p_lng)
      returning id into submitted_station_id;
  else
    submitted_station_id := p_station_id;
  end if;

  if p_gas_price is not null then
    insert into public.fuel_price_reports (station_id, fuel_type, price)
      values (submitted_station_id, 'gas', p_gas_price);
  end if;

  if p_eth_price is not null then
    insert into public.fuel_price_reports (station_id, fuel_type, price)
      values (submitted_station_id, 'eth', p_eth_price);
  end if;

  return submitted_station_id;
end;
$$;

revoke all on function public.submit_station_prices(
  uuid, text, text, double precision, double precision, numeric, numeric
) from public, anon, authenticated;
grant execute on function public.submit_station_prices(
  uuid, text, text, double precision, double precision, numeric, numeric
) to authenticated;

notify pgrst, 'reload schema';
