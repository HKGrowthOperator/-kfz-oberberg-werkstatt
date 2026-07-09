/* ============================================================================
 *  kfz-sync.js  —  Cloud-Sync für die Werkstatt-App (localStorage <-> Supabase)
 *  Rollen: Inhaber (alles) / Mechaniker (keine Finanzen) — serverseitig per RLS.
 * ----------------------------------------------------------------------------
 *  EINBINDEN (nur in der selbst-gehosteten Version der App, NICHT im Artifact-
 *  Sandbox — der blockiert externe Skripte):
 *
 *    <script type="module">
 *      import { KfzSync } from './kfz-sync.js';
 *      window.KfzSync = KfzSync;
 *      KfzSync.init({
 *        url:  'https://DEIN-PROJEKT.supabase.co',
 *        anon: 'DEIN-ANON-KEY'
 *      });
 *    </script>
 *
 *  Dann in der App-Oberfläche (Einstellungen) Buttons anschließen:
 *    KfzSync.login(email, passwort)   ->  anmelden
 *    KfzSync.push()                   ->  lokale Daten hochladen
 *    KfzSync.pull()                   ->  Cloud-Daten herunterladen + App neu rendern
 *    KfzSync.auto(true)               ->  Auto-Push bei jeder Speicherung
 * ========================================================================== */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// localStorage-Key  ->  { table, spalten die separat gefüllt werden }
const MAP = {
  kfz_customers:    { table: 'kunde',   cols: ['name','tel','email','kennzeichen','fahrzeug'] },
  kfz_invoices:     { table: 'beleg',   cols: ['belegart','no','datum','status','brutto',
                                               ['bezahlt_am','bezahltAm'], ['kunde_name', o => o.kunde && o.kunde.name]] },
  kfz_expenses:     { table: 'ausgabe', cols: ['datum','kategorie','brutto'] },
  kfz_appointments: { table: 'termin',  cols: ['datum','zeit','kennzeichen','leistung','status',
                                               ['kunde_name','kunde'], 'tel'] },
  kfz_parts:        { table: 'teil',    cols: ['nummer','bezeichnung','lieferant','ek','vk','bestand','mindestbestand'] },
};
const SINGLETON = { kfz_settings: 'einstellung' }; // eine Zeile statt Liste

let sb = null, betriebId = null;

function pickCols(spec, obj) {
  const out = {};
  for (const c of spec.cols) {
    if (Array.isArray(c)) {                      // [zielSpalte, quelle]
      const [dst, src] = c;
      out[dst] = typeof src === 'function' ? src(obj) : obj[src];
    } else {
      out[c] = obj[c];                           // gleicher Name
    }
  }
  return out;
}

export const KfzSync = {
  init({ url, anon }) {
    sb = createClient(url, anon, { auth: { persistSession: true, autoRefreshToken: true } });
    return this;
  },

  async login(email, password) {
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return this._loadBetrieb();
  },
  async register(email, password, name) {
    const { error } = await sb.auth.signUp({ email, password, options: { data: { name } } });
    if (error) throw error;
    return 'Bestätigungs-E-Mail versendet.';
  },
  async logout() { await sb.auth.signOut(); betriebId = null; },

  async _loadBetrieb() {
    const { data: prof, error } = await sb.from('profile')
      .select('betrieb_id, name, rolle').single();
    if (error) throw error;
    betriebId = prof.betrieb_id;
    return prof;                                  // { betrieb_id, name, rolle }
  },
  async role() { return (await this._loadBetrieb()).rolle; },

  /* ---- HOCHLADEN: alle lokalen Stores in die Cloud (upsert) ---------------- */
  async push() {
    if (!betriebId) await this._loadBetrieb();
    // Listen-Stores
    for (const [key, spec] of Object.entries(MAP)) {
      const list = JSON.parse(localStorage.getItem(key) || '[]');
      if (!Array.isArray(list) || !list.length) continue;
      const rows = list.map(o => ({
        id: o.id, betrieb_id: betriebId, daten: o,
        updated_at: new Date().toISOString(), deleted: false,
        ...pickCols(spec, o),
      }));
      const { error } = await sb.from(spec.table).upsert(rows, { onConflict: 'betrieb_id,id' });
      if (error) throw new Error(`${spec.table}: ${error.message}`);
    }
    // Einstellungen (Singleton)
    const set = JSON.parse(localStorage.getItem('kfz_settings') || 'null');
    if (set) {
      const { error } = await sb.from('einstellung')
        .upsert({ betrieb_id: betriebId, daten: set, updated_at: new Date().toISOString() });
      if (error) throw error;
    }
    return 'Hochgeladen.';
  },

  /* ---- HERUNTERLADEN: Cloud -> localStorage, dann App neu zeichnen --------- */
  async pull() {
    if (!betriebId) await this._loadBetrieb();
    for (const [key, spec] of Object.entries(MAP)) {
      const { data, error } = await sb.from(spec.table)
        .select('daten, deleted').eq('betrieb_id', betriebId);
      if (error) throw error;
      const list = (data || []).filter(r => !r.deleted).map(r => r.daten);
      localStorage.setItem(key, JSON.stringify(list));
    }
    const { data: eset } = await sb.from('einstellung')
      .select('daten').eq('betrieb_id', betriebId).maybeSingle();
    if (eset && eset.daten) localStorage.setItem('kfz_settings', JSON.stringify(eset.daten));
    // App neu laden, damit die globalen Arrays neu aus localStorage gelesen werden
    if (typeof location !== 'undefined') location.reload();
    return 'Heruntergeladen.';
  },

  /* ---- AUTO-PUSH: nach jedem save() automatisch hochladen (debounced) ------ */
  auto(on) {
    if (!on || this._hooked) return;
    this._hooked = true;
    const orig = localStorage.setItem.bind(localStorage);
    let t = null;
    localStorage.setItem = (k, v) => {
      orig(k, v);
      if (k.startsWith('kfz_') && betriebId) {
        clearTimeout(t);
        t = setTimeout(() => this.push().catch(console.warn), 1500);
      }
    };
  },
};
