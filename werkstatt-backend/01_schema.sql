-- ============================================================================
--  KFZ-Service Oberberg — Werkstatt-System · Supabase / Postgres Schema
--  Cloud-Sync · Mehrbenutzer · Rollen (Inhaber / Mechaniker) · GoBD-Audit
-- ----------------------------------------------------------------------------
--  Einspielen:  Supabase Dashboard → SQL Editor → dieses Skript ausführen.
--  Danach kann kfz-sync.js (localStorage <-> Supabase) darauf synchronisieren.
-- ============================================================================

-- 1) MANDANT (eine Werkstatt = ein Betrieb). Vorbereitet für spätere
--    Multi-Werkstatt-Nutzung; für Oberberg gibt es genau eine Zeile.
create table if not exists betrieb (
  id          uuid primary key default gen_random_uuid(),
  name        text not null default 'KFZ-Service Oberberg',
  created_at  timestamptz not null default now()
);

-- 2) BENUTZER-PROFILE  (1:1 zu auth.users, das Supabase selbst verwaltet)
--    rolle: 'inhaber'  = darf alles (Finanzen, Einstellungen, Löschen)
--           'mechaniker' = Aufträge/Termine/Teile, KEINE Finanzen/Einstellungen
create table if not exists profile (
  id          uuid primary key references auth.users(id) on delete cascade,
  betrieb_id  uuid not null references betrieb(id) on delete cascade,
  name        text not null default '',
  rolle       text not null default 'mechaniker' check (rolle in ('inhaber','mechaniker')),
  created_at  timestamptz not null default now()
);

-- Hilfsfunktionen: Betrieb + Rolle des eingeloggten Users (für RLS-Policies)
create or replace function my_betrieb() returns uuid
  language sql stable security definer set search_path = public as
$$ select betrieb_id from profile where id = auth.uid() $$;

create or replace function is_inhaber() returns boolean
  language sql stable security definer set search_path = public as
$$ select coalesce((select rolle = 'inhaber' from profile where id = auth.uid()), false) $$;

-- ----------------------------------------------------------------------------
-- 3) FACHDATEN  — spiegeln exakt die localStorage-Stores der App wider.
--    "daten jsonb" hält das komplette Objekt aus der App (positionen,
--    fahrzeug, kennzeichen ...), damit die App-Struktur 1:1 erhalten bleibt.
--    Die herausgezogenen Spalten dienen Filter/Sortierung/Reports serverseitig.
-- ----------------------------------------------------------------------------
create table if not exists kunde (
  id         text not null,
  betrieb_id uuid not null references betrieb(id) on delete cascade,
  name       text,
  tel        text,
  email      text,
  kennzeichen text,
  fahrzeug   text,
  daten      jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false,
  primary key (betrieb_id, id)
);

create table if not exists beleg (            -- Rechnungen / Aufträge / KVA
  id         text not null,
  betrieb_id uuid not null references betrieb(id) on delete cascade,
  belegart   text check (belegart in ('rechnung','auftrag','kva')),
  no         text,
  kunde_name text,
  datum      date,
  status     text,
  brutto     numeric(12,2) default 0,
  bezahlt_am date,
  daten      jsonb not null default '{}',   -- positionen, netto, mwst, fahrzeug ...
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false,
  primary key (betrieb_id, id)
);
create index if not exists beleg_art_idx  on beleg(betrieb_id, belegart, datum);
create index if not exists beleg_stat_idx on beleg(betrieb_id, status);

create table if not exists ausgabe (          -- Firmenkosten (EÜR)
  id         text not null,
  betrieb_id uuid not null references betrieb(id) on delete cascade,
  datum      date,
  kategorie  text,
  brutto     numeric(12,2) default 0,
  daten      jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false,
  primary key (betrieb_id, id)
);

create table if not exists termin (
  id         text not null,
  betrieb_id uuid not null references betrieb(id) on delete cascade,
  datum      date,
  zeit       text,
  kunde_name text,
  tel        text,
  kennzeichen text,
  leistung   text,
  status     text default 'geplant',
  quelle     text default 'intern',          -- 'intern' | 'online'
  daten      jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  deleted    boolean not null default false,
  primary key (betrieb_id, id)
);
create index if not exists termin_datum_idx on termin(betrieb_id, datum);

create table if not exists teil (             -- Lager / Ersatzteile
  id            text not null,
  betrieb_id    uuid not null references betrieb(id) on delete cascade,
  nummer        text,
  bezeichnung   text,
  lieferant     text,
  ek            numeric(12,2) default 0,
  vk            numeric(12,2) default 0,
  bestand       numeric(12,2) default 0,
  mindestbestand numeric(12,2) default 0,
  daten         jsonb not null default '{}',
  updated_at    timestamptz not null default now(),
  deleted       boolean not null default false,
  primary key (betrieb_id, id)
);

create table if not exists einstellung (      -- Firmen-/App-Einstellungen (eine Zeile)
  betrieb_id uuid primary key references betrieb(id) on delete cascade,
  daten      jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 4) GoBD-AUDIT-TRAIL  — revisionssicher: jede Änderung an Belegen wird
--    unveränderbar protokolliert (Insert-only, kein Update/Delete erlaubt).
-- ----------------------------------------------------------------------------
create table if not exists audit_log (
  id         bigint generated always as identity primary key,
  betrieb_id uuid not null references betrieb(id) on delete cascade,
  user_id    uuid,
  tabelle    text not null,
  datensatz  text not null,
  aktion     text not null,      -- INSERT | UPDATE | DELETE
  vorher     jsonb,
  nachher    jsonb,
  ts         timestamptz not null default now()
);

create or replace function log_change() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log(betrieb_id,user_id,tabelle,datensatz,aktion,vorher,nachher)
  values (coalesce(new.betrieb_id, old.betrieb_id), auth.uid(), tg_table_name,
          coalesce(new.id::text, old.id::text), tg_op,
          case when tg_op='INSERT' then null else to_jsonb(old) end,
          case when tg_op='DELETE' then null else to_jsonb(new) end);
  return coalesce(new, old);
end $$;

drop trigger if exists beleg_audit on beleg;
create trigger beleg_audit after insert or update or delete on beleg
  for each row execute function log_change();

-- ----------------------------------------------------------------------------
-- 5) ROW-LEVEL-SECURITY  — Datentrennung + Rollenrechte.
--    Grundregel: man sieht/ändert nur Daten des EIGENEN Betriebs.
--    Finanzen (ausgabe, einstellung) + Löschen: nur Inhaber.
-- ----------------------------------------------------------------------------
alter table betrieb     enable row level security;
alter table profile     enable row level security;
alter table kunde       enable row level security;
alter table beleg       enable row level security;
alter table ausgabe     enable row level security;
alter table termin      enable row level security;
alter table teil        enable row level security;
alter table einstellung enable row level security;
alter table audit_log   enable row level security;

-- Betrieb: sichtbar für Mitglieder
create policy betrieb_read on betrieb for select using (id = my_betrieb());

-- Profile: jeder sieht Kollegen des Betriebs; nur Inhaber legt an/ändert Rollen
create policy profile_read   on profile for select using (betrieb_id = my_betrieb());
create policy profile_write  on profile for all
  using (betrieb_id = my_betrieb() and is_inhaber())
  with check (betrieb_id = my_betrieb() and is_inhaber());

-- Generisches Muster für Fachtabellen: alle Betriebsmitglieder dürfen lesen/schreiben
do $$
declare t text;
begin
  foreach t in array array['kunde','beleg','termin','teil'] loop
    execute format('create policy %1$s_rw on %1$s for all using (betrieb_id = my_betrieb()) with check (betrieb_id = my_betrieb());', t);
  end loop;
end $$;

-- Finanzen: nur Inhaber
create policy ausgabe_rw on ausgabe for all
  using (betrieb_id = my_betrieb() and is_inhaber())
  with check (betrieb_id = my_betrieb() and is_inhaber());
create policy einstellung_read  on einstellung for select using (betrieb_id = my_betrieb());
create policy einstellung_write on einstellung for all
  using (betrieb_id = my_betrieb() and is_inhaber())
  with check (betrieb_id = my_betrieb() and is_inhaber());

-- Audit: nur Inhaber liest, niemand ändert/löscht (Insert nur via Trigger)
create policy audit_read on audit_log for select using (betrieb_id = my_betrieb() and is_inhaber());

-- ----------------------------------------------------------------------------
-- 6) ONBOARDING  — beim ersten Login automatisch Profil + Betrieb anlegen.
--    Der erste User eines neuen Betriebs wird 'inhaber'.
-- ----------------------------------------------------------------------------
create or replace function handle_new_user() returns trigger
  language plpgsql security definer set search_path = public as $$
declare b uuid;
begin
  -- Fester Betrieb für Oberberg: existierenden nehmen, sonst neu anlegen
  select id into b from betrieb order by created_at limit 1;
  if b is null then insert into betrieb(name) values('KFZ-Service Oberberg') returning id into b; end if;
  insert into profile(id, betrieb_id, name, rolle)
  values (new.id, b, coalesce(new.raw_user_meta_data->>'name',''),
          case when (select count(*) from profile where betrieb_id=b)=0 then 'inhaber' else 'mechaniker' end);
  insert into einstellung(betrieb_id, daten) values (b,'{}') on conflict do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- FERTIG. Nächster Schritt: siehe ANLEITUNG.md → "1. Cloud-Sync".
