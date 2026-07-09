/* ============================================================================
 *  facturx.js  —  EN-16931 CII-XML (ZUGFeRD/Factur-X, Profil EN 16931) bauen
 *  Eingabe: Beleg-Objekt aus der Werkstatt-App + Firmen-Einstellungen.
 *  Ausgabe: gültiges CrossIndustryInvoice-XML als String.
 * ========================================================================== */

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;' }[c]));
const n2 = v => (Math.round((+v || 0) * 100) / 100).toFixed(2);
const dt = iso => (iso || new Date().toISOString().slice(0,10)).replace(/-/g, ''); // YYYYMMDD

/**
 * @param {object} inv   Beleg: { no, datum, faellig, positionen:[{bez,menge,einzel,mwst}], netto, brutto, kunde:{name,strasse,plz,ort,land} }
 * @param {object} firma Einstellungen: { firma, strasse, plz, ort, land, ustid, steuernr, iban, bic, kleinunternehmer }
 * @param {number} steuersatz  Standard-USt in % (19). Bei Kleinunternehmer 0 mit Grund.
 */
export function buildFacturX(inv, firma, steuersatz = 19) {
  const klein = !!firma.kleinunternehmer;
  const satz = klein ? 0 : steuersatz;
  const positionen = inv.positionen || [];

  // Positionszeilen
  const lines = positionen.map((p, i) => {
    const menge = +p.menge || 0, einzel = +p.einzel || 0, zeilenNetto = menge * einzel;
    return `
    <ram:IncludedSupplyChainTradeLineItem>
      <ram:AssociatedDocumentLineDocument><ram:LineID>${i + 1}</ram:LineID></ram:AssociatedDocumentLineDocument>
      <ram:SpecifiedTradeProduct><ram:Name>${esc(p.bez || 'Leistung')}</ram:Name></ram:SpecifiedTradeProduct>
      <ram:SpecifiedLineTradeAgreement>
        <ram:NetPriceProductTradePrice><ram:ChargeAmount>${n2(einzel)}</ram:ChargeAmount></ram:NetPriceProductTradePrice>
      </ram:SpecifiedLineTradeAgreement>
      <ram:SpecifiedLineTradeDelivery><ram:BilledQuantity unitCode="C62">${n2(menge)}</ram:BilledQuantity></ram:SpecifiedLineTradeDelivery>
      <ram:SpecifiedLineTradeSettlement>
        <ram:ApplicableTradeTax>
          <ram:TypeCode>VAT</ram:TypeCode>
          <ram:CategoryCode>${klein ? 'E' : 'S'}</ram:CategoryCode>
          <ram:RateApplicablePercent>${n2(satz)}</ram:RateApplicablePercent>
        </ram:ApplicableTradeTax>
        <ram:SpecifiedTradeSettlementLineMonetarySummation><ram:LineTotalAmount>${n2(zeilenNetto)}</ram:LineTotalAmount></ram:SpecifiedTradeSettlementLineMonetarySummation>
      </ram:SpecifiedLineTradeSettlement>
    </ram:IncludedSupplyChainTradeLineItem>`;
  }).join('');

  const netto = inv.netto != null ? +inv.netto : positionen.reduce((s,p)=>s+(+p.menge||0)*(+p.einzel||0),0);
  const steuer = klein ? 0 : Math.round(netto * satz) / 100;
  const brutto = inv.brutto != null ? +inv.brutto : netto + steuer;
  const k = inv.kunde || {};

  const taxBlock = `
      <ram:ApplicableTradeTax>
        <ram:CalculatedAmount>${n2(steuer)}</ram:CalculatedAmount>
        <ram:TypeCode>VAT</ram:TypeCode>
        ${klein ? '<ram:ExemptionReason>Kleinunternehmer gemäß § 19 UStG</ram:ExemptionReason>' : ''}
        <ram:BasisAmount>${n2(netto)}</ram:BasisAmount>
        <ram:CategoryCode>${klein ? 'E' : 'S'}</ram:CategoryCode>
        <ram:RateApplicablePercent>${n2(satz)}</ram:RateApplicablePercent>
      </ram:ApplicableTradeTax>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<rsm:CrossIndustryInvoice xmlns:rsm="urn:un:unece:uncefact:data:standard:CrossIndustryInvoice:100" xmlns:ram="urn:un:unece:uncefact:data:standard:ReusableAggregateBusinessInformationEntity:100" xmlns:udt="urn:un:unece:uncefact:data:standard:UnqualifiedDataType:100">
  <rsm:ExchangedDocumentContext>
    <ram:GuidelineSpecifiedDocumentContextParameter><ram:ID>urn:cen.eu:en16931:2017</ram:ID></ram:GuidelineSpecifiedDocumentContextParameter>
  </rsm:ExchangedDocumentContext>
  <rsm:ExchangedDocument>
    <ram:ID>${esc(inv.no || '')}</ram:ID>
    <ram:TypeCode>380</ram:TypeCode>
    <ram:IssueDateTime><udt:DateTimeString format="102">${dt(inv.datum)}</udt:DateTimeString></ram:IssueDateTime>
  </rsm:ExchangedDocument>
  <rsm:SupplyChainTradeTransaction>${lines}
    <ram:ApplicableHeaderTradeAgreement>
      <ram:SellerTradeParty>
        <ram:Name>${esc(firma.firma || '')}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(firma.plz || '')}</ram:PostcodeCode>
          <ram:LineOne>${esc(firma.strasse || '')}</ram:LineOne>
          <ram:CityName>${esc(firma.ort || '')}</ram:CityName>
          <ram:CountryID>${esc(firma.land || 'DE')}</ram:CountryID>
        </ram:PostalTradeAddress>
        ${firma.ustid ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="VA">${esc(firma.ustid)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}
        ${firma.steuernr ? `<ram:SpecifiedTaxRegistration><ram:ID schemeID="FC">${esc(firma.steuernr)}</ram:ID></ram:SpecifiedTaxRegistration>` : ''}
      </ram:SellerTradeParty>
      <ram:BuyerTradeParty>
        <ram:Name>${esc(k.name || '')}</ram:Name>
        <ram:PostalTradeAddress>
          <ram:PostcodeCode>${esc(k.plz || '')}</ram:PostcodeCode>
          <ram:LineOne>${esc(k.strasse || '')}</ram:LineOne>
          <ram:CityName>${esc(k.ort || '')}</ram:CityName>
          <ram:CountryID>${esc(k.land || 'DE')}</ram:CountryID>
        </ram:PostalTradeAddress>
      </ram:BuyerTradeParty>
    </ram:ApplicableHeaderTradeAgreement>
    <ram:ApplicableHeaderTradeDelivery/>
    <ram:ApplicableHeaderTradeSettlement>
      <ram:InvoiceCurrencyCode>EUR</ram:InvoiceCurrencyCode>
      ${firma.iban ? `<ram:SpecifiedTradeSettlementPaymentMeans><ram:TypeCode>58</ram:TypeCode><ram:PayeePartyCreditorFinancialAccount><ram:IBANID>${esc(firma.iban)}</ram:IBANID></ram:PayeePartyCreditorFinancialAccount></ram:SpecifiedTradeSettlementPaymentMeans>` : ''}${taxBlock}
      ${inv.faellig ? `<ram:SpecifiedTradePaymentTerms><ram:DueDateDateTime><udt:DateTimeString format="102">${dt(inv.faellig)}</udt:DateTimeString></ram:DueDateDateTime></ram:SpecifiedTradePaymentTerms>` : ''}
      <ram:SpecifiedTradeSettlementHeaderMonetarySummation>
        <ram:LineTotalAmount>${n2(netto)}</ram:LineTotalAmount>
        <ram:TaxBasisTotalAmount>${n2(netto)}</ram:TaxBasisTotalAmount>
        <ram:TaxTotalAmount currencyID="EUR">${n2(steuer)}</ram:TaxTotalAmount>
        <ram:GrandTotalAmount>${n2(brutto)}</ram:GrandTotalAmount>
        <ram:DuePayableAmount>${n2(brutto)}</ram:DuePayableAmount>
      </ram:SpecifiedTradeSettlementHeaderMonetarySummation>
    </ram:ApplicableHeaderTradeSettlement>
  </rsm:SupplyChainTradeTransaction>
</rsm:CrossIndustryInvoice>`;
}
