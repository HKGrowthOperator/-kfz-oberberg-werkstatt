# Werkstatt-System — Backend-Bausteine (Einrichtung)

> **Hosting / Live-Betrieb:** Wie das Ganze auf einem Server läuft, damit der
> Kunde es nutzen kann, steht in **`deploy/HOSTING.md`** (Ein-Server-Setup mit
> Docker-Compose + Caddy, von HK zentral betrieben).


Diese vier Bausteine erweitern die Werkstatt-App um Cloud, Online-Buchung,
automatischen Versand und gesetzeskonforme E-Rechnungen. Jeder Baustein ist
**fertiger Code** — live gehen sie, sobald ihr eure eigenen Konten einsteckt.

> **Wichtig:** Die Cloud-Funktionen laufen nur in der **selbst-gehosteten**
> Version der App (eigener Webspace / Netlify / Vercel), **nicht** im
> Claude-Artifact-Sandbox — der blockiert externe Server aus Sicherheitsgründen.
> Die App selbst ist eine einzelne HTML-Datei; einfach mit hochladen.

Laufende Kosten grob: **20–60 €/Monat** Infrastruktur (Supabase Free reicht für
den Start, n8n-Host + WhatsApp/SMTP je nach Anbieter).

---

## 1. Cloud-Sync + Mehrbenutzer + Rollen  (`01_schema.sql`, `kfz-sync.js`)

**Was es kann:** Daten liegen zentral in der Cloud, mehrere Geräte/Mitarbeiter
greifen zu. Rollen: **Inhaber** (alles) und **Mechaniker** (Aufträge, Termine,
Teile — **keine** Finanzen/Einstellungen). Jede Beleg-Änderung wird
revisionssicher protokolliert (GoBD-Audit-Trail).

1. Bei [supabase.com](https://supabase.com) kostenloses Projekt anlegen.
2. **SQL Editor** öffnen → Inhalt von `01_schema.sql` einfügen → **Run**.
3. Projekt-Werte notieren: **Project URL** und **anon public key**
   (Settings → API).
4. In der App (selbst gehostet) vor `</body>` einbinden:
   ```html
   <script type="module">
     import { KfzSync } from './kfz-sync.js';
     window.KfzSync = KfzSync;
     KfzSync.init({ url: 'https://DEIN-PROJEKT.supabase.co', anon: 'DEIN-ANON-KEY' });
   </script>
   ```
5. Ersten Benutzer anlegen: `KfzSync.register('ahmet@…', 'passwort', 'Ahmet')`
   → der **erste** Benutzer wird automatisch **Inhaber**. Weitere Benutzer
   werden **Mechaniker** (Rolle später im Supabase-Dashboard änderbar).
6. Bedienung: `KfzSync.login(email, pw)` → `KfzSync.push()` (hochladen) /
   `KfzSync.pull()` (herunterladen). `KfzSync.auto(true)` lädt nach jeder
   Speicherung automatisch hoch.

**Betrieb-ID herausfinden** (für die nächsten Bausteine):
SQL Editor → `select id from betrieb;` → die UUID kopieren.

---

## 2. Online-Terminbuchung  (`buchung.html`)

**Was es kann:** Öffentliche Buchungsseite für die Homepage. Anfragen landen
sofort in der App unter **Termine** (Quelle „online", Status „angefragt").

1. In `buchung.html` oben eintragen: `SUPABASE_URL`, `SUPABASE_ANON`,
   `BETRIEB_ID` (aus Schritt 1).
2. Damit Fremde (ohne Login) einen Termin **anlegen**, aber nichts **lesen**
   dürfen, im SQL Editor einmalig ausführen:
   ```sql
   create policy termin_public_insert on termin for insert to anon
     with check (quelle = 'online' and status = 'angefragt');
   ```
3. `buchung.html` hochladen und von der Homepage verlinken (z. B. Button
   „Termin online anfragen").
4. In der App die Online-Anfragen bestätigen/ablehnen — dabei `status` auf
   `bestätigt` setzen (dann greift auch die Terminerinnerung aus Baustein 3).

---

## 3. Automatischer Versand  (`n8n-workflow.json`)

**Was es kann:** Prüft **täglich** die Fälligkeiten und verschickt automatisch
E-Mail/WhatsApp: **Terminerinnerung** (Termin morgen) und
**Zahlungserinnerung** (Rechnung 7 Tage überfällig). HU/AU-, Öl- und
Geburtstags-Erinnerungen lassen sich nach demselben Muster ergänzen.

1. n8n bereitstellen — am einfachsten [n8n Cloud](https://n8n.io), alternativ
   selbst hosten (Docker).
2. **Import from File** → `n8n-workflow.json`.
3. Zwei Credentials anlegen und den Postgres-/E-Mail-Nodes zuweisen:
   - **Supabase Postgres** (Host/DB/Passwort aus Supabase → Settings →
     Database → Connection info)
   - **SMTP Werkstatt** (euer E-Mail-Postausgang)
4. Umgebungsvariablen setzen: `BETRIEB_ID`, und für WhatsApp
   `WHATSAPP_PHONE_ID` + `WHATSAPP_TOKEN` (WhatsApp Business Cloud API). Ohne
   WhatsApp einfach den WhatsApp-Node deaktivieren — E-Mail reicht.
5. Workflow **aktivieren**. Der Trigger läuft täglich 07:00 Uhr.

**Erweiterung HU/AU & Geburtstag:** einen weiteren Postgres-Node einfügen mit
z. B.
```sql
select kunde_name, (daten->>'email') email, (daten->>'tel') tel
from kunde where betrieb_id = '…'
  and (daten->>'huDatum')::date between current_date and current_date + 30;
```
(Feldname `huDatum` an die in der App gespeicherten Schlüssel anpassen.)

---

## 4. Gesetzeskonforme E-Rechnung (ZUGFeRD/Factur-X)  (`zugferd-service/`)

**Was es kann:** Erzeugt aus einer Rechnung ein **PDF mit eingebettetem
EN-16931-XML** (ZUGFeRD/Factur-X, Profil EN 16931) — das ist die ab 2025/2028
für B2B verpflichtende E-Rechnung. Kleinunternehmer-Fall (§ 19 UStG) ist
berücksichtigt.

1. Node 18+ vorausgesetzt. Im Ordner `zugferd-service/`:
   ```bash
   npm install
   npm test     # erzeugt /tmp/test-rechnung.pdf zur Kontrolle
   npm start    # Service auf Port 8787
   ```
2. Aufruf (die App schickt Beleg + Firmendaten):
   ```bash
   curl -X POST http://localhost:8787/rechnung \
     -H 'Content-Type: application/json' \
     -d '{ "beleg": { "no":"RE-2026-014", "datum":"2026-07-07",
            "kunde":{"name":"Max Mustermann","plz":"51643","ort":"Gummersbach"},
            "positionen":[{"bez":"Ölwechsel","menge":1,"einzel":89.90}] },
           "firma": { "firma":"KFZ-Service Oberberg","plz":"51643","ort":"Gummersbach",
            "ustid":"DE123456789","iban":"DE12...","kleinunternehmer":false } }' \
     --output Rechnung.pdf
   ```
3. Deployen auf einem kleinen Node-Host (Render/Railway/eigener Server); die
   URL in der App als „E-Rechnung erzeugen"-Ziel hinterlegen.

**Geprüft (PDF/A-3b):** `npm test` bestätigt alle Struktur-Merkmale:
`factur-x.xml` eingebettet und im Katalog (`/AF`) referenziert
(`AFRelationship=Alternative`, `application/xml`); **OutputIntent** mit
eingebettetem **sRGB-ICC-Profil** (`assets/sRGB.icc`); **XMP-Metadaten** mit
`pdfaid:part=3`, `pdfaid:conformance=B` und der **Factur-X-Extension**
(`fx:DocumentFileName=factur-x.xml`, `fx:ConformanceLevel=EN 16931`);
**eingebettete TrueType-Schrift** (Liberation Sans, `assets/*.ttf` — keine
verbotene Standard-14-Schrift); Dokument-`/ID` im Trailer. Zur finalen
Abnahme kann das PDF zusätzlich durch den **veraPDF**- oder
**Mustang-Validator** laufen. Fehlt eine der Asset-Dateien, fällt der Dienst
automatisch auf reines ZUGFeRD (ohne striktes A-3) zurück und protokolliert das.

---

## 5. Live-Teile-Connector (TecDoc-Katalog & Lieferanten-Bestellung)  (`teile-connector/`)

**Was es kann:** In der App gibt es unter **Teile / Lager** die Suche
„**Online-Katalog · Teile per Nummer suchen**". Ohne Connector läuft sie über
einen eingebauten **Demo-Katalog** (sofort nutzbar). Mit dem Connector-Dienst
sucht sie im **echten TecDoc-Katalog** und **bestellt beim Großhändler**.

**Der Dienst (Adapter-Schicht):**
- `MockConnector` — Demo, funktioniert ohne Lizenz (zum Testen/als Fallback).
- `TecDocConnector` — echter Teilekatalog, braucht `TECDOC_API_KEY`
  (TecAlliance/TecDoc-Lizenz). OE-/Artikelnummer → passende Teile.
- `SupplierConnector` — Bestellung/Verfügbarkeit beim Großhändler
  (Wessels+Müller, Stahlgruber, PV, Coler …), braucht
  `SUPPLIER_ORDER_URL` + `SUPPLIER_TOKEN` (euer Händler-Konto/API, oft via TecCom).

Der Dienst wählt automatisch: TecDoc falls Key vorhanden, sonst Mock; Bestellung
beim Lieferanten falls Konto vorhanden, sonst Mock.

**Einrichten:**
1. Im Ordner `teile-connector/`:
   ```bash
   npm install
   npm test      # Selbsttest (Mock) — muss "Alle Tests bestanden" zeigen
   npm start     # Dienst auf Port 8790
   ```
2. Endpunkte: `GET /capabilities`, `POST /teile/suche` `{query|oe}`,
   `GET /teile/verfuegbarkeit/:artikelnr`, `POST /teile/bestellung` `{positionen}`.
3. Dienst deployen (Render/Railway/eigener Server), dann in der **App →
   Einstellungen → „Teile-Connector"** die URL eintragen (z. B.
   `https://connector.kfz-oberberg.de`). Feld leer lassen = Demo-Katalog.
4. Live schalten: Umgebungsvariablen setzen —
   `TECDOC_API_KEY` (+ `TECDOC_PROVIDER_ID`) für den Katalog,
   `SUPPLIER_ORDER_URL` + `SUPPLIER_TOKEN` (+ `SUPPLIER_CUSTOMER_NO`) für die
   Bestellung. Ohne Codeänderung schaltet der Dienst dann auf Live um.

> **Ehrliche Grenze:** TecDoc ist **kostenpflichtig** (TecAlliance-Lizenz), und
> die elektronische Bestellung braucht ein **Händler-Konto mit API/EDI-Zugang**
> des Betriebs. Die Adapter sind fertig; die genauen Feld-/Endpunktnamen sind
> beim jeweiligen Anbieter final abzugleichen (in `connector.js` kommentiert).

---

## Reihenfolge-Empfehlung

1. **Supabase-Schema + Sync** (Fundament — alles andere baut darauf auf)
2. **Online-Buchung** (schneller sichtbarer Nutzen für Kunden)
3. **Auto-Versand** (n8n) — spart täglich Handarbeit
4. **ZUGFeRD** — sobald B2B-Kunden die E-Rechnung verlangen

Das Ganze passt als **Modul-/Betreuungspaket** in die Partnerschaft mit Ahmet:
einmalige Einrichtung + kleine monatliche Infrastruktur-Pauschale.
