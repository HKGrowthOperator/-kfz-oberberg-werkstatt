/* ============================================================================
 *  connector.js — Adapter-Schicht für Teilekatalog & Lieferanten-Bestellung
 * ----------------------------------------------------------------------------
 *  Ein einheitliches Interface, drei Adapter:
 *    - MockConnector      : funktioniert SOFORT (Demo-Katalog, keine Lizenz)
 *    - TecDocConnector    : echter TecDoc/TecAlliance-Katalog (API-Key nötig)
 *    - SupplierConnector  : Bestellung beim Großhändler (Konto/API nötig)
 *
 *  Die App/der Server spricht immer nur dieses Interface an. Echte Zugangs-
 *  daten werden per Umgebungsvariablen eingesteckt — dann schaltet der
 *  Live-Betrieb ohne Codeänderung frei.
 * ----------------------------------------------------------------------------
 *  Interface (jeder Adapter implementiert dies):
 *    capabilities()                       -> { suche, verfuegbarkeit, bestellung, live }
 *    suche({query,oe,vin,kba,limit})      -> [Teil]
 *    verfuegbarkeit(artikelnr)            -> { artikelnr, bestand, preis, lieferzeit, lager }
 *    bestellen({positionen,referenz})     -> { bestellId, status, positionen, summe, voraussichtlich }
 *
 *  Teil = { artikelnr, oe, bezeichnung, hersteller, lieferant, ekPreis,
 *           vkPreis, verfuegbar, lieferzeit, quelle }
 * ========================================================================== */

export class TeileConnector {
  capabilities() { return { suche: false, verfuegbarkeit: false, bestellung: false, live: false }; }
  async suche() { throw new Error('nicht implementiert'); }
  async verfuegbarkeit() { throw new Error('nicht implementiert'); }
  async bestellen() { throw new Error('nicht implementiert'); }
}

/* ----------------------------------------------------------------------------
 *  MockConnector — Demo-Katalog, sofort nutzbar (für Test & Fallback)
 * -------------------------------------------------------------------------- */
export class MockConnector extends TeileConnector {
  constructor() {
    super();
    this.katalog = [
      { artikelnr: 'BRE-1234', oe: '1K0615301AA', bezeichnung: 'Bremsscheibe vorne 312mm', hersteller: 'ATE',   lieferant: 'Wessels+Müller', ekPreis: 34.50, vkPreis: 69.00, verfuegbar: 8,  lieferzeit: 'heute' },
      { artikelnr: 'BRE-2210', oe: '1K0698451',   bezeichnung: 'Bremsbeläge vorne (Satz)',  hersteller: 'Bosch', lieferant: 'Wessels+Müller', ekPreis: 22.00, vkPreis: 48.00, verfuegbar: 15, lieferzeit: 'heute' },
      { artikelnr: 'OEL-5W30', oe: 'VW50700',      bezeichnung: 'Motoröl 5W-30 Longlife 5L', hersteller: 'Castrol', lieferant: 'Stahlgruber', ekPreis: 28.90, vkPreis: 54.90, verfuegbar: 40, lieferzeit: 'heute' },
      { artikelnr: 'FIL-OIL', oe: '03N115562B',    bezeichnung: 'Ölfilter',                  hersteller: 'MANN',  lieferant: 'Stahlgruber',   ekPreis: 6.20,  vkPreis: 14.90, verfuegbar: 33, lieferzeit: 'heute' },
      { artikelnr: 'FIL-AIR', oe: '1K0129620D',    bezeichnung: 'Luftfilter',                hersteller: 'MANN',  lieferant: 'Stahlgruber',   ekPreis: 9.80,  vkPreis: 22.00, verfuegbar: 21, lieferzeit: 'heute' },
      { artikelnr: 'FIL-INN', oe: '1K1819653B',    bezeichnung: 'Innenraumfilter Aktivkohle',hersteller: 'Bosch', lieferant: 'PV Automotive', ekPreis: 8.40,  vkPreis: 24.00, verfuegbar: 18, lieferzeit: '1 Tag' },
      { artikelnr: 'BAT-72',  oe: '000915105DE',   bezeichnung: 'Starterbatterie 72Ah',      hersteller: 'Varta', lieferant: 'Coler',         ekPreis: 78.00, vkPreis: 139.00,verfuegbar: 5,  lieferzeit: '1 Tag' },
      { artikelnr: 'ZUE-4',   oe: '101905601F',    bezeichnung: 'Zündkerzen (4er Satz)',     hersteller: 'NGK',   lieferant: 'PV Automotive', ekPreis: 16.00, vkPreis: 39.00, verfuegbar: 12, lieferzeit: 'heute' },
      { artikelnr: 'REI-205', oe: '',              bezeichnung: 'Reifen 205/55 R16 91V',     hersteller: 'Continental', lieferant: 'Reifen Krieg', ekPreis: 62.00, vkPreis: 99.00, verfuegbar: 24, lieferzeit: 'heute' },
      { artikelnr: 'STO-311', oe: '5Q0413031',     bezeichnung: 'Stoßdämpfer vorne',         hersteller: 'Sachs', lieferant: 'Stahlgruber',   ekPreis: 54.00, vkPreis: 109.00,verfuegbar: 4,  lieferzeit: '1 Tag' },
      { artikelnr: 'KEI-6PK', oe: '03L903137T',    bezeichnung: 'Keilrippenriemen 6PK1841',  hersteller: 'ContiTech', lieferant: 'Wessels+Müller', ekPreis: 12.50, vkPreis: 29.00, verfuegbar: 9, lieferzeit: 'heute' },
      { artikelnr: 'WAS-KIT', oe: '1K0998002',     bezeichnung: 'Wasserpumpe + Zahnriemen-Kit',hersteller: 'INA', lieferant: 'Coler',         ekPreis: 89.00, vkPreis: 189.00,verfuegbar: 3,  lieferzeit: '2 Tage' },
    ].map(t => ({ ...t, quelle: 'mock' }));
  }
  capabilities() { return { suche: true, verfuegbarkeit: true, bestellung: true, live: false }; }

  async suche({ query = '', oe = '', limit = 20 } = {}) {
    const q = (oe || query).toLowerCase().replace(/\s+/g, '');
    if (!q) return this.katalog.slice(0, limit);
    return this.katalog.filter(t =>
      [t.artikelnr, t.oe, t.bezeichnung, t.hersteller].some(v => (v || '').toLowerCase().replace(/\s+/g, '').includes(q))
    ).slice(0, limit);
  }
  async verfuegbarkeit(artikelnr) {
    const t = this.katalog.find(x => x.artikelnr === artikelnr);
    if (!t) return { artikelnr, bestand: 0, preis: null, lieferzeit: 'unbekannt', lager: null };
    return { artikelnr, bestand: t.verfuegbar, preis: t.ekPreis, lieferzeit: t.lieferzeit, lager: t.lieferant };
  }
  async bestellen({ positionen = [], referenz = '' } = {}) {
    const summe = positionen.reduce((s, p) => {
      const t = this.katalog.find(x => x.artikelnr === p.artikelnr);
      return s + (t ? t.ekPreis : 0) * (+p.menge || 1);
    }, 0);
    return {
      bestellId: 'MOCK-' + Math.random().toString(36).slice(2, 8).toUpperCase(),
      status: 'bestätigt (Demo)', referenz,
      positionen: positionen.map(p => ({ ...p, status: 'reserviert' })),
      summe: Math.round(summe * 100) / 100,
      voraussichtlich: 'nächster Werktag',
    };
  }
}

/* ----------------------------------------------------------------------------
 *  TecDocConnector — echter Teilekatalog (TecAlliance / TecDoc)
 *  Braucht: TECDOC_API_KEY (+ providerId). Endpoint-/Feldnamen ggf. an die
 *  euch lizenzierte API-Doku anpassen (TecAlliance "pegasus" REST).
 * -------------------------------------------------------------------------- */
export class TecDocConnector extends TeileConnector {
  constructor({ apiKey, baseUrl, providerId } = {}) {
    super();
    this.apiKey = apiKey || process.env.TECDOC_API_KEY;
    this.providerId = providerId || process.env.TECDOC_PROVIDER_ID;
    this.baseUrl = baseUrl || process.env.TECDOC_BASE_URL || 'https://webservice.tecalliance.services/pegasus-3-0/services/TecdocToCatDLB.jsonEndpoint';
    if (!this.apiKey) throw new Error('TecDoc: TECDOC_API_KEY fehlt (Lizenz erforderlich)');
  }
  capabilities() { return { suche: true, verfuegbarkeit: false, bestellung: false, live: true }; }

  async suche({ query = '', oe = '', limit = 25 } = {}) {
    // TecDoc-Artikelsuche per Artikel-/OE-Nummer. Antwortstruktur je nach
    // lizenziertem Paket — hier defensiv gemappt.
    const body = {
      getArticleDirectSearchAllNumbersWithState: {
        articleCountry: 'DE', provider: Number(this.providerId) || 0,
        searchQuery: oe || query, searchType: 10, // 10 = OE + Handelsnummern
        lang: 'de', perPage: limit,
      },
    };
    const res = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Api-Key': this.apiKey },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error('TecDoc HTTP ' + res.status);
    const data = await res.json();
    const arr = data?.data?.array || data?.articles || [];
    return arr.map(a => ({
      artikelnr: a.articleNumber || a.dataSupplierArticleNumber || '',
      oe: (a.oemNumbers && a.oemNumbers[0]?.articleNumber) || '',
      bezeichnung: a.genericArticles?.[0]?.genericArticleDescription || a.articleName || '',
      hersteller: a.mfrName || a.dataSupplierName || '',
      lieferant: '', ekPreis: null, vkPreis: null,
      verfuegbar: null, lieferzeit: null, quelle: 'tecdoc',
    })).slice(0, limit);
  }
}

/* ----------------------------------------------------------------------------
 *  SupplierConnector — Bestellung/Verfügbarkeit beim Großhändler
 *  Generischer REST-Adapter (viele Großhändler-Webservices / TecCom passen
 *  auf dieses Muster). Braucht: SUPPLIER_ORDER_URL + SUPPLIER_TOKEN.
 * -------------------------------------------------------------------------- */
export class SupplierConnector extends TeileConnector {
  constructor({ orderUrl, availUrl, token, kundennr } = {}) {
    super();
    this.orderUrl = orderUrl || process.env.SUPPLIER_ORDER_URL;
    this.availUrl = availUrl || process.env.SUPPLIER_AVAIL_URL;
    this.token = token || process.env.SUPPLIER_TOKEN;
    this.kundennr = kundennr || process.env.SUPPLIER_CUSTOMER_NO;
    if (!this.orderUrl || !this.token) throw new Error('Lieferant: SUPPLIER_ORDER_URL/SUPPLIER_TOKEN fehlt (Konto erforderlich)');
  }
  capabilities() { return { suche: false, verfuegbarkeit: !!this.availUrl, bestellung: true, live: true }; }

  async verfuegbarkeit(artikelnr) {
    if (!this.availUrl) throw new Error('Lieferant: keine Verfügbarkeits-URL konfiguriert');
    const res = await fetch(`${this.availUrl}?article=${encodeURIComponent(artikelnr)}&customer=${encodeURIComponent(this.kundennr || '')}`,
      { headers: { Authorization: `Bearer ${this.token}` } });
    if (!res.ok) throw new Error('Lieferant HTTP ' + res.status);
    const d = await res.json();
    return { artikelnr, bestand: d.quantity ?? null, preis: d.netPrice ?? null, lieferzeit: d.deliveryTime ?? null, lager: d.warehouse ?? null };
  }
  async bestellen({ positionen = [], referenz = '' } = {}) {
    const payload = {
      customerNumber: this.kundennr, reference: referenz,
      items: positionen.map(p => ({ articleNumber: p.artikelnr, quantity: +p.menge || 1 })),
    };
    const res = await fetch(this.orderUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Bestellung HTTP ' + res.status);
    const d = await res.json();
    return {
      bestellId: d.orderId || d.id || '', status: d.status || 'übermittelt', referenz,
      positionen: d.items || positionen, summe: d.totalNet ?? null,
      voraussichtlich: d.estimatedDelivery || null,
    };
  }
}

/* ----------------------------------------------------------------------------
 *  Factory — wählt Adapter je nach vorhandenen Zugangsdaten (Env).
 *  Katalog-Suche: TecDoc falls Key da, sonst Mock.
 *  Bestellung:    Lieferant falls Konto da, sonst Mock.
 * -------------------------------------------------------------------------- */
export function makeConnectors(env = process.env) {
  let catalog, ordering;
  try { catalog = env.TECDOC_API_KEY ? new TecDocConnector() : new MockConnector(); }
  catch { catalog = new MockConnector(); }
  try { ordering = (env.SUPPLIER_ORDER_URL && env.SUPPLIER_TOKEN) ? new SupplierConnector() : new MockConnector(); }
  catch { ordering = new MockConnector(); }
  return { catalog, ordering };
}
