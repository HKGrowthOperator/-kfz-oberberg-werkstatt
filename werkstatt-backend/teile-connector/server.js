/* ============================================================================
 *  server.js — Teile-Connector HTTP-Dienst
 *  Die Werkstatt-App ruft diese Endpunkte auf (Connector-URL in Einstellungen):
 *    GET  /health
 *    GET  /capabilities                       -> was kann der aktive Adapter
 *    POST /teile/suche          {query|oe}    -> Katalogtreffer
 *    GET  /teile/verfuegbarkeit/:artikelnr    -> Bestand/Preis/Lieferzeit
 *    POST /teile/bestellung     {positionen}  -> Bestellung beim Lieferanten
 * ----------------------------------------------------------------------------
 *  Ohne Zugangsdaten läuft alles über den Mock (sofort testbar).
 *  Mit TECDOC_API_KEY / SUPPLIER_ORDER_URL+SUPPLIER_TOKEN schaltet Live frei.
 *  Start:  npm install && npm start   (Port 8790, per PORT-Env änderbar)
 * ========================================================================== */
import express from 'express';
import { makeConnectors } from './connector.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

// CORS, damit die (selbst gehostete) App den Dienst aufrufen darf
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', process.env.ALLOW_ORIGIN || '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const { catalog, ordering } = makeConnectors();

app.get('/health', (_, res) => res.json({ ok: true }));
app.get('/capabilities', (_, res) => res.json({
  katalog: catalog.capabilities(), bestellung: ordering.capabilities(),
  katalogQuelle: catalog.constructor.name, bestellQuelle: ordering.constructor.name,
}));

app.post('/teile/suche', async (req, res) => {
  try { res.json({ treffer: await catalog.suche(req.body || {}) }); }
  catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

app.get('/teile/verfuegbarkeit/:artikelnr', async (req, res) => {
  try {
    const src = ordering.capabilities().verfuegbarkeit ? ordering : catalog;
    res.json(await src.verfuegbarkeit(req.params.artikelnr));
  } catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

app.post('/teile/bestellung', async (req, res) => {
  try { res.json(await ordering.bestellen(req.body || {})); }
  catch (e) { res.status(502).json({ error: String(e.message || e) }); }
});

const PORT = process.env.PORT || 8790;
if (process.argv[1] && process.argv[1].endsWith('server.js'))
  app.listen(PORT, () => console.log(`Teile-Connector läuft auf :${PORT} (Katalog: ${catalog.constructor.name}, Bestellung: ${ordering.constructor.name})`));

export { app };
