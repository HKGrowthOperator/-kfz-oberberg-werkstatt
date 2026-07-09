# KFZ-Service Oberberg — Werkstatt-System

Komplettes Werkstatt-Management für KFZ-Service Oberberg (Gummersbach):
Rechnungen, Aufträge & Kostenvoranschläge, Termine, Fahrzeug-Historie,
Teile-/Lagerverwaltung mit Online-Katalog, Erinnerungen (HU/AU, Ölwechsel,
Geburtstag), EÜR/Kosten und gesetzeskonforme E-Rechnung.

> Entwickelt & betrieben von **HK Growth Operator**.

## Aufbau

| Teil | Ort | Was |
|------|-----|-----|
| **App** | `werkstatt-backend/deploy/static/index.html` | Self-contained Browser-App (localStorage + Cloud-Sync) |
| **Online-Buchung** | `werkstatt-backend/deploy/static/buchung.html` | Öffentliche Terminanfrage |
| **Cloud/DB** | `werkstatt-backend/01_schema.sql`, `kfz-sync.js` | Supabase-Schema (Rollen, RLS, Audit) + Sync |
| **Auto-Versand** | `werkstatt-backend/n8n-workflow.json` | Tägliche E-Mail/WhatsApp-Erinnerungen (n8n) |
| **E-Rechnung** | `werkstatt-backend/zugferd-service/` | ZUGFeRD/Factur-X als PDF/A-3b (Node) |
| **Teile-Connector** | `werkstatt-backend/teile-connector/` | Katalog + Bestellung (Mock / TecDoc / Lieferant) |
| **Deployment** | `werkstatt-backend/deploy/` | Docker-Compose + Caddy (Auto-HTTPS) |

## Loslegen

- **Hosting einrichten:** [`werkstatt-backend/deploy/HOSTING.md`](werkstatt-backend/deploy/HOSTING.md)
- **CI/CD + Server-Zugang:** [`werkstatt-backend/deploy/SETUP-CICD.md`](werkstatt-backend/deploy/SETUP-CICD.md)
- **Bausteine & Konfiguration:** [`werkstatt-backend/ANLEITUNG.md`](werkstatt-backend/ANLEITUNG.md)

## Deploy

Push auf `main` (Pfad `werkstatt-backend/**`) → GitHub Actions deployt per SSH
automatisch auf den VPS (`git pull` + `docker compose up -d --build`).
Manuell auf dem Server: `bash werkstatt-backend/deploy/deploy.sh`.

## Lizenz / Nutzung

Internes Projekt für KFZ-Service Oberberg. Nicht zur Weiterverbreitung bestimmt.
