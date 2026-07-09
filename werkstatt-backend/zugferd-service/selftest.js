import { makeFacturXPdf } from './server.js';
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream } from 'pdf-lib';
import fs from 'fs';

const beleg = { no: 'RE-2026-014', datum: '2026-07-07', faellig: '2026-07-21',
  kunde: { name: 'Max Mustermann', strasse: 'Hauptstr. 5', plz: '51643', ort: 'Gummersbach' },
  positionen: [ { bez: 'Oelwechsel inkl. Filter', menge: 1, einzel: 89.90, mwst: 19 }, { bez: 'Motoroel 5W-30 (5L)', menge: 5, einzel: 12.50, mwst: 19 } ] };
const firma = { firma: 'KFZ-Service Oberberg', strasse: 'Musterstr. 1', plz: '51643', ort: 'Gummersbach', land: 'DE', ustid: 'DE123456789', iban: 'DE12500105170648489890', bic: 'INGDDEFFXXX', kleinunternehmer: false };

const { pdf, xml, pdfa } = await makeFacturXPdf(beleg, firma, 19);
fs.writeFileSync('/tmp/test-rechnung.pdf', Buffer.from(pdf));

let fail = 0; const ok = (n, v) => { console.log((v ? 'OK  ' : 'FAIL') + ' ' + n); if (!v) fail++; };
const doc = await PDFDocument.load(pdf);
const cat = doc.catalog;
const asStr = Buffer.from(pdf).toString('latin1');

ok('PDF neu ladbar, 1 Seite', doc.getPageCount() === 1);
ok('pdfa-Flag true (Schrift+Plumbing)', pdfa === true);
ok('XML GrandTotal 181.36', /GrandTotalAmount>181.36/.test(xml));

// OutputIntent + sRGB-ICC
const oi = cat.lookup(PDFName.of('OutputIntents'), PDFArray);
const oiDict = oi && oi.lookup(0, PDFDict);
const dop = oiDict && oiDict.get(PDFName.of('DestOutputProfile'));
ok('OutputIntents vorhanden', !!oi && oi.size() === 1);
ok('DestOutputProfile (ICC) referenziert', !!dop);
ok('OutputIntent S=GTS_PDFA1', oiDict && oiDict.get(PDFName.of('S'))?.toString() === '/GTS_PDFA1');

// XMP-Metadaten
const meta = cat.lookup(PDFName.of('Metadata'), PDFRawStream);
const xmpTxt = meta ? Buffer.from(meta.contents).toString('utf8') : '';
ok('Metadata-Stream vorhanden', !!meta);
ok('XMP pdfaid:part = 3', /<pdfaid:part>3<\/pdfaid:part>/.test(xmpTxt));
ok('XMP pdfaid:conformance = B', /<pdfaid:conformance>B<\/pdfaid:conformance>/.test(xmpTxt));
ok('XMP Factur-X DocumentFileName + EN 16931', /factur-x\.xml/.test(xmpTxt) && /fx:ConformanceLevel>EN 16931/.test(xmpTxt));

// Eingebettete (nicht Standard-14) Schrift: FontFile2 = TrueType eingebettet
ok('TrueType-Schrift eingebettet (FontFile2)', /\/FontFile2/.test(asStr));
ok('keine Standard-14 Helvetica als BaseFont', !/\/BaseFont\s*\/Helvetica\b/.test(asStr));

// Factur-X-Anhang + Dokument-ID
ok('factur-x.xml eingebettet + /AF', asStr.includes('factur-x.xml') && /\/AF\b/.test(asStr));
ok('Trailer /ID gesetzt', /\/ID\s*\[/.test(asStr));

console.log(fail ? `\n${fail} Test(s) fehlgeschlagen` : '\nAlle Tests bestanden — PDF/A-3b-Struktur vollständig.');
process.exit(fail ? 1 : 0);
