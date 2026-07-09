/* ============================================================================
 *  server.js — ZUGFeRD/Factur-X E-Rechnung-Service
 *  POST /rechnung  { beleg, firma }  ->  PDF (Factur-X) mit eingebettetem XML.
 *  Die Werkstatt-App ruft diesen Dienst auf und bekommt eine gesetzeskonforme
 *  E-Rechnung (PDF mit maschinenlesbarem CII-XML) zurück.
 * ----------------------------------------------------------------------------
 *  Start:  npm install && npm start   (Port 8787, per PORT-Env änderbar)
 * ========================================================================== */
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PDFDocument, StandardFonts, rgb, AFRelationship } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildFacturX } from './facturx.js';
import { applyPdfA } from './pdfa.js';

const app = express();
app.use(express.json({ limit: '2mb' }));

const __dir = path.dirname(fileURLToPath(import.meta.url));
const asset = f => path.join(__dir, 'assets', f);
const eur = v => (Math.round((+v || 0) * 100) / 100).toLocaleString('de-DE',
  { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

export async function makeFacturXPdf(beleg, firma, steuersatz = 19) {
  const xml = buildFacturX(beleg, firma, steuersatz);

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595.28, 841.89]);            // A4
  // PDF/A verbietet die Standard-14-Schriften -> eingebettete TrueType (Liberation Sans)
  let font, bold, pdfaFont = true;
  try {
    pdf.registerFontkit(fontkit);
    font = await pdf.embedFont(fs.readFileSync(asset('LiberationSans-Regular.ttf')), { subset: true });
    bold = await pdf.embedFont(fs.readFileSync(asset('LiberationSans-Bold.ttf')), { subset: true });
  } catch (e) {
    pdfaFont = false;
    console.warn('Schrift-Fallback (kein striktes PDF/A):', e.message);
    font = await pdf.embedFont(StandardFonts.Helvetica);
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  }
  const ink = rgb(0.09, 0.08, 0.06), faint = rgb(0.55, 0.54, 0.50), green = rgb(0.08, 0.48, 0.31);
  let y = 800;
  const T = (t, x, yy, f = font, s = 10, c = ink) => page.drawText(String(t ?? ''), { x, y: yy, size: s, font: f, color: c });

  T(firma.firma || 'KFZ-Service Oberberg', 40, y, bold, 15, green); y -= 16;
  T([firma.strasse, [firma.plz, firma.ort].filter(Boolean).join(' ')].filter(Boolean).join(', '), 40, y, font, 9, faint);
  y -= 40;
  T('RECHNUNG', 40, y, bold, 20, ink); y -= 26;
  T(`Rechnungs-Nr.:  ${beleg.no || ''}`, 40, y); T(`Datum:  ${(beleg.datum||'').split('-').reverse().join('.')}`, 340, y); y -= 15;
  if (beleg.faellig) { T(`Fällig:  ${beleg.faellig.split('-').reverse().join('.')}`, 340, y); }
  y -= 20;
  const k = beleg.kunde || {};
  T('Rechnung an:', 40, y, bold, 10); y -= 14;
  [k.name, k.strasse, [k.plz, k.ort].filter(Boolean).join(' ')].filter(Boolean).forEach(l => { T(l, 40, y, font, 10); y -= 13; });
  y -= 16;

  // Tabellenkopf
  T('Beschreibung', 40, y, bold, 9, faint); T('Menge', 330, y, bold, 9, faint);
  T('Einzel', 400, y, bold, 9, faint); T('Gesamt', 500, y, bold, 9, faint);
  y -= 6; page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: .6, color: rgb(.88,.87,.83) }); y -= 14;

  (beleg.positionen || []).forEach(p => {
    const g = (+p.menge || 0) * (+p.einzel || 0);
    T(p.bez || '', 40, y, font, 10); T(String(p.menge ?? ''), 330, y);
    T(eur(p.einzel), 400, y); T(eur(g), 500, y); y -= 16;
  });
  y -= 6; page.drawLine({ start: { x: 320, y }, end: { x: 555, y }, thickness: .6, color: rgb(.88,.87,.83) }); y -= 16;

  const klein = !!firma.kleinunternehmer;
  const netto = beleg.netto != null ? +beleg.netto : (beleg.positionen||[]).reduce((s,p)=>s+(+p.menge||0)*(+p.einzel||0),0);
  const steuer = klein ? 0 : Math.round(netto * steuersatz) / 100;
  const brutto = beleg.brutto != null ? +beleg.brutto : netto + steuer;
  T('Nettobetrag', 400, y); T(eur(netto), 500, y); y -= 15;
  T(klein ? 'USt (§19 UStG befreit)' : `zzgl. ${steuersatz}% USt`, 400, y); T(eur(steuer), 500, y); y -= 17;
  T('Gesamtbetrag', 400, y, bold, 12, green); T(eur(brutto), 500, y, bold, 12, green); y -= 30;
  if (klein) { T('Gemäß § 19 UStG wird keine Umsatzsteuer berechnet.', 40, y, font, 9, faint); y -= 13; }
  if (firma.iban) T(`Zahlbar auf IBAN ${firma.iban}${firma.bic ? '  BIC ' + firma.bic : ''}`, 40, y, font, 9, faint);

  // ---- Factur-X: XML einbetten (AFRelationship=Alternative, Name factur-x.xml)
  const when = beleg.datum ? new Date(beleg.datum + 'T00:00:00Z') : new Date();
  await pdf.attach(Buffer.from(xml, 'utf8'), 'factur-x.xml', {
    mimeType: 'application/xml',
    description: 'Factur-X/ZUGFeRD Rechnungsdaten (EN 16931)',
    afRelationship: AFRelationship.Alternative,
    creationDate: when, modificationDate: when,
  });
  const title = `Rechnung ${beleg.no || ''}`;
  pdf.setTitle(title);
  pdf.setProducer('KFZ Oberberg ZUGFeRD-Service');
  pdf.setCreator('Factur-X EN 16931');
  pdf.setCreationDate(when); pdf.setModificationDate(when);

  // ---- PDF/A-3b: OutputIntent (sRGB), XMP-Metadaten, Dokument-ID
  let pdfa = pdfaFont;
  try {
    const iccBytes = fs.readFileSync(asset('sRGB.icc'));
    applyPdfA(pdf, { iccBytes, title, iso: when.toISOString(), seed: beleg.no || title });
  } catch (e) { pdfa = false; console.warn('PDF/A-Plumbing übersprungen:', e.message); }

  return { pdf: await pdf.save({ useObjectStreams: false }), xml, pdfa };
}

app.post('/rechnung', async (req, res) => {
  try {
    const { beleg, firma, steuersatz } = req.body || {};
    if (!beleg || !firma) return res.status(400).json({ error: 'beleg und firma erforderlich' });
    const { pdf } = await makeFacturXPdf(beleg, firma, steuersatz ?? 19);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Rechnung-${(beleg.no||'').replace(/[^\w-]/g,'_')}.pdf"`);
    res.send(Buffer.from(pdf));
  } catch (e) { console.error(e); res.status(500).json({ error: String(e.message || e) }); }
});

app.get('/health', (_, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 8787;
if (process.argv[1] && process.argv[1].endsWith('server.js'))
  app.listen(PORT, () => console.log(`ZUGFeRD-Service läuft auf :${PORT}`));
