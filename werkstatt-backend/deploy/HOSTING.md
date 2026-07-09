# Hosting — Werkstatt-System für KFZ-Service Oberberg

**Ein Server, von HK zentral betrieben.** Ein kleiner VPS trägt App,
Online-Buchung, ZUGFeRD-Dienst, Teile-Connector und n8n. Die Datenbank
(Supabase) läuft managed extern. Caddy holt automatisch HTTPS-Zertifikate.
Einrichtung einmalig ~30–45 Minuten, danach nur pflegen.

```
Internet ─► Caddy (80/443, Auto-HTTPS)
             ├─ app.kfz-oberberg.de       → Werkstatt-App (static)
             ├─ termin.kfz-oberberg.de     → Online-Terminbuchung (static)
             ├─ connector.kfz-oberberg.de  → Teile-Connector (Node)
             ├─ rechnung.kfz-oberberg.de   → ZUGFeRD-Dienst (Node)
             └─ n8n.kfz-oberberg.de        → Automatisierung (Basic-Auth)
Supabase (managed) ← App (Cloud-Sync) + n8n (Fälligkeits-Queries)
```

## Voraussetzungen
- Ein VPS, z. B. **Hetzner CX22** (2 vCPU / 4 GB, ~5–8 €/M), Ubuntu 24.04.
- Eine Domain, die HK verwaltet (hier: `kfz-oberberg.de`).
- Ein Supabase-Projekt (Free-Tier reicht zum Start).

---

## Schritt 1 — Server bestellen
Hetzner Cloud → neuer Server, Ubuntu 24.04, eigenen **SSH-Key** hinterlegen.
IP-Adresse notieren. Per `ssh root@SERVER-IP` einloggen.

## Schritt 2 — DNS setzen
Beim Domain-Anbieter fünf **A-Records** auf die Server-IP zeigen lassen:

| Name | Typ | Wert |
|------|-----|------|
| `app` | A | SERVER-IP |
| `termin` | A | SERVER-IP |
| `connector` | A | SERVER-IP |
| `rechnung` | A | SERVER-IP |
| `n8n` | A | SERVER-IP |

(Optional Wildcard `*` statt der fünf Einträge.)

## Schritt 3 — Docker installieren
```bash
curl -fsSL https://get.docker.com | sh
```
(bringt das `docker compose`-Plugin mit).

## Schritt 4 — Projekt auf den Server + konfigurieren
Den Ordner `werkstatt-backend/` auf den Server bringen (git oder scp), dann:
```bash
cd werkstatt-backend/deploy
cp .env.example .env
nano .env                 # DOMAIN, ACME_EMAIL, SUPABASE_*, BETRIEB_ID, n8n-Passwort …
```
App-Dateien liegen bereits unter `deploy/static/` (`index.html` = App,
`buchung.html` = Buchungsseite). Bei einem App-Update einfach die neue
`kfz-rechnungsprogramm.html` als `deploy/static/index.html` ersetzen.

## Schritt 5 — Starten
```bash
docker compose up -d --build
```
Caddy beschafft automatisch die HTTPS-Zertifikate (kann 1–2 Min dauern).
Prüfen:
```bash
docker compose ps
curl -sf https://connector.kfz-oberberg.de/health   && echo OK
curl -sf https://rechnung.kfz-oberberg.de/health    && echo OK
```
App im Browser: `https://app.kfz-oberberg.de`

## Schritt 6 — Supabase verbinden
1. Supabase-Projekt anlegen, im **SQL Editor** `../01_schema.sql` ausführen.
2. `select id from betrieb;` → UUID als `BETRIEB_ID` in `.env` eintragen.
3. In der App → **Einstellungen → Cloud-Sync**: Supabase-URL + anon-Key
   eintragen, ersten Benutzer registrieren (wird automatisch **Inhaber**).
4. In der App → **Einstellungen → Teile-Connector**:
   `https://connector.kfz-oberberg.de` eintragen.
5. Für die öffentliche Buchung die Insert-Policy setzen (siehe
   `../ANLEITUNG.md`, Abschnitt 2) und in `static/buchung.html` URL/Key/BETRIEB_ID
   eintragen.

## Schritt 7 — n8n aktivieren
`https://n8n.kfz-oberberg.de` öffnen (Basic-Auth aus `.env`).
`../n8n-workflow.json` importieren, Credentials **Supabase Postgres**
(Connection-Info aus Supabase → Settings → Database) und **SMTP Werkstatt**
anlegen, Workflow **aktivieren**. Läuft dann täglich 07:00 Uhr.

---

## Betrieb & Wartung (HK)
- **Updates**: `git pull && docker compose up -d --build` (bzw. neue App-Datei
  nach `static/index.html` kopieren, kein Rebuild nötig).
- **Logs**: `docker compose logs -f caddy` / `... zugferd` / `... connector` / `... n8n`.
- **Backups**:
  - Supabase macht automatische DB-Backups (Free: begrenzt, Pro: täglich + PITR).
  - n8n-Daten + Zertifikate sichern:
    ```bash
    docker run --rm -v deploy_n8n_data:/d -v $PWD:/b alpine tar czf /b/n8n-backup.tgz -C /d .
    ```
    (per Cron z. B. nächtlich, off-site kopieren).
- **Monitoring**: `docker compose ps` zeigt Healthchecks; Container mit
  `restart: unless-stopped` starten nach Reboot automatisch.
- **Zugänge** (SSH-Key, Supabase, Domain, n8n-Passwort) liegen zentral bei HK —
  Ahmet muss sich um nichts kümmern.

## Kostenüberblick (für die Partnerschaft)
| Posten | ca. Kosten |
|--------|-----------|
| VPS (Hetzner CX22) | 5–8 €/M |
| Supabase | Free → bei Bedarf ~25 $/M |
| Domain | ~1 €/M |
| WhatsApp Business / TecDoc | optional, nach Anbieter |

→ als **Modul-/Betreuungspauschale** in die Zusammenarbeit mit KFZ-Service
Oberberg aufnehmen.
