/* Selbsttest des Teile-Connectors (Mock, ohne Lizenz/Konto). */
import { MockConnector, makeConnectors } from './connector.js';

const c = new MockConnector();
let fail = 0; const ok = (n, v) => { console.log((v ? 'OK  ' : 'FAIL') + ' ' + n); if (!v) fail++; };

// Suche per Bezeichnung
const s1 = await c.suche({ query: 'brems' });
ok('Suche "brems" liefert Treffer', s1.length >= 2);

// Suche per OE-Nummer
const s2 = await c.suche({ oe: '1K0615301AA' });
ok('OE-Suche exakt', s2.length === 1 && s2[0].artikelnr === 'BRE-1234');

// Verfügbarkeit
const v = await c.verfuegbarkeit('BAT-72');
ok('Verfügbarkeit BAT-72', v.bestand === 5 && v.preis === 78.0);

// Bestellung
const b = await c.bestellen({ positionen: [{ artikelnr: 'OEL-5W30', menge: 3 }, { artikelnr: 'FIL-OIL', menge: 3 }], referenz: 'AU-100' });
ok('Bestellung erzeugt ID', /^MOCK-/.test(b.bestellId));
ok('Bestellsumme korrekt (3*28.90 + 3*6.20 = 105.30)', b.summe === 105.30);

// Factory ohne Env -> Mock/Mock
const { catalog, ordering } = makeConnectors({});
ok('Factory-Fallback Katalog=Mock', catalog.constructor.name === 'MockConnector');
ok('Factory-Fallback Bestellung=Mock', ordering.constructor.name === 'MockConnector');

console.log(fail ? `\n${fail} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden.');
process.exit(fail ? 1 : 0);
