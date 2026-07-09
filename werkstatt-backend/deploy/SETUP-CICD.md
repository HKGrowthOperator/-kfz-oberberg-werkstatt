# CI/CD & Server-Zugang — Einrichtung (einmalig)

Ziel: **Jeder Push auf `main` deployt automatisch** auf den Hetzner-VPS, und
Claude bekommt **direkten SSH-Zugang**, um real bauen/testen/deployen zu können.

```
GitHub (main) ──push──► GitHub Actions ──SSH──► VPS: git pull + docker compose up -d --build
```

---

## A) Server-Bootstrap (einmalig auf dem VPS)
Voraussetzung: VPS läuft, Docker installiert (siehe `HOSTING.md` Schritt 1–3).

```bash
# 1) Repo an den festen Ort klonen
sudo mkdir -p /opt/kfz-oberberg-werkstatt
sudo chown "$USER" /opt/kfz-oberberg-werkstatt
git clone git@github.com:hkgrowthoperator/kfz-oberberg-werkstatt.git /opt/kfz-oberberg-werkstatt
# (privates Repo → auf dem Server einen Read-only Deploy-Key hinterlegen:
#  ssh-keygen -t ed25519 -f ~/.ssh/repo_deploy -N ""
#  danach den .pub-Key in GitHub → Repo → Settings → Deploy keys eintragen)

# 2) .env füllen
cd /opt/kfz-oberberg-werkstatt/werkstatt-backend/deploy
cp .env.example .env && nano .env      # DOMAIN, SUPABASE_*, BETRIEB_ID, n8n-Passwort …

# 3) Erststart
docker compose up -d --build
```

## B) GitHub-Secrets für die Pipeline
Repo → **Settings → Secrets and variables → Actions → New repository secret**:

| Secret | Wert |
|--------|------|
| `DEPLOY_HOST` | Server-IP oder Hostname |
| `DEPLOY_USER` | SSH-User auf dem Server (z. B. `deploy` oder `root`) |
| `DEPLOY_SSH_KEY` | **privater** SSH-Key, dessen `.pub` auf dem Server in `~/.ssh/authorized_keys` liegt |

Danach: bei jedem Push auf `main` (Pfad `werkstatt-backend/**`) läuft der Workflow
`.github/workflows/deploy.yml`. Manuell testen: **Actions → Deploy to VPS → Run workflow**.

## C) Direkter SSH-Zugang für Claude (damit ich real arbeiten kann)
Damit ich in „Claude Code on the web" selbst bauen/testen/deployen kann, in der
**Umgebung** hinterlegen:
- **SSH-Key** (eigener Key für Claude, nicht der CI-Key) + **Server-IP** als Umgebungs-Secret.
- **Netzwerk-Policy mit Outbound-Zugang** (damit `git`, Docker-Hub, npm, Supabase erreichbar sind).
- Auf dem Server den zugehörigen `.pub`-Key in `~/.ssh/authorized_keys` eintragen.

Sicherheits-Tipp: für Claude einen eigenen User `claude` mit `docker`-Gruppe anlegen,
statt `root` — so bleibt der Zugriff nachvollziehbar und einschränkbar.

---

## Ablauf danach (Regelbetrieb)
1. Ich ändere Code im Repo und pushe auf `main`.
2. GitHub Actions deployt automatisch auf den VPS.
3. Prüfen: `curl -sf https://connector.<DOMAIN>/health` und `.../rechnung…/health`.

Manueller Deploy ohne CI (auf dem Server): `bash werkstatt-backend/deploy/deploy.sh`.
