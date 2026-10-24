/**
 * Synthetic Caterer Quote Generator for EventPilot.
 * Generates 3 deliberately messy catering quote PDFs with distinct layouts,
 * hidden charges, fine print, and missing terms for deterministic quote flag rules.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const QUOTES_DIR = path.join(ROOT_DIR, 'samples', 'quotes');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Quote 1: Royal Caterers & Banqueting Services
// Issues:
// - Line items exclude GST ("tax excluded") -> TAX_EXCLUDED
// - No service charge mentioned in fees or inclusions -> SERVICE_CHARGE_MISSING
// - Validity expired (e.g. 2025-01-15) -> VALIDITY_EXPIRED
// - Stated total (Rs. 11,50,000) does not match line items sum (Rs. 11,20,000) -> SUM_MISMATCH
// ─────────────────────────────────────────────────────────────────────────────
function generateQuote1() {
  const dir = path.join(QUOTES_DIR, 'quote-1-royal-caterers');
  ensureDir(dir);
  const pdfPath = path.join(dir, 'quote.pdf');
  const jsonPath = path.join(dir, 'expected.json');

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(fs.createWriteStream(pdfPath));

  // Header banner
  doc.rect(40, 40, 515, 60).fill('#1E293B');
  doc.fillColor('#F8FAFC').fontSize(20).font('Helvetica-Bold').text('ROYAL CATERERS & BANQUETING', 55, 52);
  doc.fillColor('#94A3B8').fontSize(9).font('Helvetica').text('14 Lake Palace Road, Udaipur, Rajasthan 313001 | +91 94140 12345', 55, 78);

  // Quote Metadata
  doc.fillColor('#0F172A').fontSize(10).font('Helvetica-Bold').text('ESTIMATE / PRO-FORMA INVOICE', 40, 115);
  doc.font('Helvetica').fontSize(9);
  doc.text('Quote Ref: RC-2025-UDZ-882', 40, 130);
  doc.text('Date: 02 January 2025', 40, 143);
  doc.fillColor('#DC2626').text('Valid Until: 15 January 2025', 40, 156); // Expired validity

  doc.fillColor('#0F172A').text('Client: Aarav Sharma & Ananya Singhania', 320, 130);
  doc.text('Occasion: Sangeet & Reception Banquets', 320, 143);
  doc.text('Location: Heritage Lawn, Lake Pichola', 320, 156);

  // Line items table header
  doc.rect(40, 180, 515, 22).fill('#F1F5F9');
  doc.fillColor('#334155').font('Helvetica-Bold').fontSize(9);
  doc.text('Item Description', 50, 187);
  doc.text('Qty', 290, 187);
  doc.text('Unit', 330, 187);
  doc.text('Rate (Rs.)', 390, 187);
  doc.text('Total (Rs.)', 475, 187);

  // Line items data
  const items = [
    { desc: 'Grand Mewari Royal Dinner Buffet (Veg)', qty: 350, unit: 'per guest', rate: '2,400', total: '8,40,000', note: 'Price strictly net of GST' },
    { desc: 'Live Old Delhi & Udaipur Chaat Street (6 Carts)', qty: 350, unit: 'per guest', rate: '500', total: '1,75,000', note: 'Taxes extra at prevailing rates' },
    { desc: 'Artisanal Dessert & Mithai Grazing Island', qty: 1, unit: 'setup', rate: '1,05,000', total: '1,05,000', note: 'Exclusive of GST and local cess' },
  ];

  let y = 208;
  doc.font('Helvetica').fontSize(8.5);
  items.forEach((item, idx) => {
    if (idx % 2 === 1) doc.rect(40, y - 4, 515, 30).fill('#FAFAFA');
    doc.fillColor('#0F172A').font('Helvetica-Bold').text(item.desc, 50, y);
    doc.fillColor('#64748B').font('Helvetica').fontSize(7.5).text(`* ${item.note}`, 50, y + 11);

    doc.fillColor('#0F172A').fontSize(8.5).font('Helvetica');
    doc.text(String(item.qty), 290, y);
    doc.text(item.unit, 330, y);
    doc.text(item.rate, 390, y);
    doc.font('Helvetica-Bold').text(item.total, 475, y);
    y += 32;
  });

  // Table summary
  doc.rect(40, y + 5, 515, 1).fill('#CBD5E1');
  y += 15;
  doc.fillColor('#334155').font('Helvetica').fontSize(9);
  doc.text('Stated Total Payable:', 340, y);
  // Line items sum to 11,20,000 but stated total is 11,50,000 (Rs 30,000 discrepancy)
  doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(11).text('Rs. 11,50,000', 460, y);

  // Inclusions & Exclusions
  y += 35;
  doc.rect(40, y, 515, 100).fill('#F8FAFC');
  doc.fillColor('#0F172A').font('Helvetica-Bold').fontSize(9).text('TERMS & INCLUSIONS:', 50, y + 10);
  doc.font('Helvetica').fontSize(8).fillColor('#475569');
  doc.text('1. Includes fine bone-china crockery, silver cutlery, chafing warmers and table linen.', 50, y + 25);
  doc.text('2. Includes 45 uniformed hospitality service staff and live cooking chefs.', 50, y + 38);
  doc.text('3. Taxes: All quotes are EXCLUSIVE of GST. 5% GST will be added on final billing.', 50, y + 51);
  doc.text('4. Service charge: No service charge is charged or included in this quote.', 50, y + 64);
  doc.text('5. Advance: 40% upon booking, 50% one week prior to event, 10% post-event settlement.', 50, y + 77);

  doc.end();

  // Expected JSON
  const expectedData = {
    _note: "Golden fixture: quote-1 has excluded GST, missing service charge, expired validity, and a sum mismatch.",
    quoteId: "quote-1",
    extracted: {
      vendorName: "Royal Caterers & Banqueting",
      category: "catering",
      currency: "INR",
      validUntil: "2025-01-15",
      statedTotalMinor: 115000000,
      confidence: 0.95,
      lineItems: [
        {
          id: "item-1",
          description: "Grand Mewari Royal Dinner Buffet (Veg)",
          quantity: 350,
          unit: "per guest",
          unitPriceMinor: 240000,
          totalMinor: 84000000,
          taxIncluded: false,
          sourceRef: "Line items table row 1"
        },
        {
          id: "item-2",
          description: "Live Old Delhi & Udaipur Chaat Street (6 Carts)",
          quantity: 350,
          unit: "per guest",
          unitPriceMinor: 50000,
          totalMinor: 17500000,
          taxIncluded: false,
          sourceRef: "Line items table row 2"
        },
        {
          id: "item-3",
          description: "Artisanal Dessert & Mithai Grazing Island",
          quantity: 1,
          unit: "setup",
          unitPriceMinor: 10500000,
          totalMinor: 10500000,
          taxIncluded: false,
          sourceRef: "Line items table row 3"
        }
      ],
      fees: [],
      inclusions: [
        "Bone-china crockery and cutlery",
        "Chafing warmers and linen",
        "45 uniformed hospitality staff"
      ],
      exclusions: ["GST 5%", "Service charge"]
    },
    expectedFlags: [
      "TAX_EXCLUDED",
      "SERVICE_CHARGE_MISSING",
      "VALIDITY_EXPIRED",
      "SUM_MISMATCH"
    ]
  };

  fs.writeFileSync(jsonPath, JSON.stringify(expectedData, null, 2), 'utf-8');
}

// ─────────────────────────────────────────────────────────────────────────────
// Quote 2: Lakeview Banquets & Event Caterers
// Issues:
// - Overtime charge mentioned in fine print -> OVERTIME_CHARGE
// - Corkage fee mentioned in fine print -> OVERTIME_CHARGE
// - Setup & teardown fee added as separate charge -> SETUP_TEARDOWN_FEE
// - High advance deposit required (60%) -> HIGH_DEPOSIT
// ─────────────────────────────────────────────────────────────────────────────
function generateQuote2() {
  const dir = path.join(QUOTES_DIR, 'quote-2-lakeview-banquets');
  ensureDir(dir);
  const pdfPath = path.join(dir, 'quote.pdf');
  const jsonPath = path.join(dir, 'expected.json');

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(fs.createWriteStream(pdfPath));

  // Elegant luxury header
  doc.rect(40, 40, 515, 50).fill('#0F766E');
  doc.fillColor('#FFFFFF').fontSize(18).font('Helvetica-Bold').text('LAKEVIEW BANQUETS & EVENT CATERING', 55, 52);
  doc.fillColor('#CCFBF1').fontSize(8.5).font('Helvetica').text('Ambamata Scheme, Near Fatehsagar Lake, Udaipur | banquets@lakeview.test', 55, 74);

  // Metadata
  doc.fillColor('#0F172A').fontSize(9).font('Helvetica-Bold').text('PROPOSAL # LB-2026-OCT-104', 40, 105);
  doc.font('Helvetica').fontSize(8.5);
  doc.text('Date: 20 October 2026', 40, 118);
  doc.text('Valid Until: 30 November 2026', 40, 131);
  doc.text('Guest Count: 350 Pax', 40, 144);

  // Table header
  doc.rect(40, 165, 515, 20).fill('#E2E8F0');
  doc.fillColor('#1E293B').font('Helvetica-Bold').fontSize(8.5);
  doc.text('Service Package', 50, 171);
  doc.text('Qty', 300, 171);
  doc.text('Unit Price', 370, 171);
  doc.text('Amount (Rs.)', 470, 171);

  // Items
  doc.font('Helvetica').fontSize(8.5).fillColor('#0F172A');
  doc.text('Imperial Rajputana & Continental Gala Spread (Taxes Included)', 50, 195);
  doc.text('350', 300, 195);
  doc.text('Rs. 2,800', 370, 195);
  doc.font('Helvetica-Bold').text('Rs. 9,80,000', 470, 195);

  doc.font('Helvetica').text('Cocktail Bar Service & Fresh Fruit Mixology (Taxes Included)', 50, 215);
  doc.text('350', 300, 215);
  doc.text('Rs. 600', 370, 215);
  doc.font('Helvetica-Bold').text('Rs. 2,10,000', 470, 215);

  // Fees section
  doc.rect(40, 240, 515, 1).fill('#CBD5E1');
  doc.font('Helvetica-Bold').fontSize(8.5).text('Additional Venue & Operational Fees:', 50, 252);
  doc.font('Helvetica').text('Kitchen setup and late-night breakdown fee', 50, 270);
  doc.font('Helvetica-Bold').text('Rs. 45,000', 470, 270);

  doc.rect(40, 290, 515, 1).fill('#CBD5E1');
  doc.font('Helvetica-Bold').fontSize(10).text('Total Quote Value (including GST & Service Charge):', 200, 305);
  doc.text('Rs. 12,35,000', 465, 305);

  // Fine print box
  doc.rect(40, 330, 515, 140).fill('#FEF2F2');
  doc.strokeColor('#F87171').lineWidth(0.8).rect(40, 330, 515, 140).stroke();

  doc.fillColor('#991B1B').font('Helvetica-Bold').fontSize(8.5).text('MANDATORY CONTRACT CONDITIONS & FINE PRINT:', 50, 342);
  doc.font('Helvetica').fontSize(7.8).fillColor('#7F1D1D');
  doc.text('1. DEPOSIT REQUIREMENT: An advance deposit of 60% of the total quote value is mandatory upon signing confirmation.', 50, 358);
  doc.text('2. OVERTIME HOURS: Standard service concludes strictly at 11:00 PM. Overtime service charge of Rs. 25,000 per hour or part thereof will be levied for kitchen/steward staff past 11:00 PM.', 50, 372);
  doc.text('3. CORKAGE POLICY: Outside liquor is permitted only with pre-paid corkage fee of Rs. 1,500 per bottle (spirits/wine), payable prior to event start.', 50, 386);
  doc.text('4. SETUP/TEARDOWN: A setup and teardown fee of Rs. 45,000 is included as specified in fees schedule above.', 50, 400);
  doc.text('5. Guaranteed minimum billing: 300 guests. Wastage clearance is the responsibility of event planner.', 50, 414);

  doc.end();

  // Expected JSON
  const expectedData = {
    _note: "Golden fixture: quote-2 triggers OVERTIME_CHARGE, SETUP_TEARDOWN_FEE, and HIGH_DEPOSIT.",
    quoteId: "quote-2",
    extracted: {
      vendorName: "Lakeview Banquets & Event Catering",
      category: "catering",
      currency: "INR",
      validUntil: "2026-11-30",
      statedTotalMinor: 123500000,
      confidence: 0.94,
      lineItems: [
        {
          id: "item-1",
          description: "Imperial Rajputana & Continental Gala Spread",
          quantity: 350,
          unit: "per guest",
          unitPriceMinor: 280000,
          totalMinor: 98000000,
          taxIncluded: true,
          sourceRef: "Service Package table row 1"
        },
        {
          id: "item-2",
          description: "Cocktail Bar Service & Fresh Fruit Mixology",
          quantity: 350,
          unit: "per guest",
          unitPriceMinor: 60000,
          totalMinor: 21000000,
          taxIncluded: true,
          sourceRef: "Service Package table row 2"
        }
      ],
      fees: [
        {
          type: "Kitchen setup and late-night breakdown fee",
          amountMinor: 4500000,
          sourceRef: "Additional Venue & Operational Fees"
        },
        {
          type: "Overtime service charge per hour after 11 PM",
          amountMinor: 2500000,
          sourceRef: "Fine print term 2"
        },
        {
          type: "Corkage fee per bottle for outside liquor",
          amountMinor: 150000,
          sourceRef: "Fine print term 3"
        },
        {
          type: "Advance booking deposit",
          percent: 0.60,
          basis: "total",
          sourceRef: "Fine print term 1"
        }
      ],
      inclusions: [
        "GST and 10% hospitality service charge included",
        "Bar glassware and ice"
      ],
      exclusions: []
    },
    expectedFlags: [
      "OVERTIME_CHARGE",
      "SETUP_TEARDOWN_FEE",
      "HIGH_DEPOSIT"
    ]
  };

  fs.writeFileSync(jsonPath, JSON.stringify(expectedData, null, 2), 'utf-8');
}

// ─────────────────────────────────────────────────────────────────────────────
// Quote 3: Palace Flavours Catering Co.
// Issues:
// - Non-refundable cancellation terms -> NON_REFUNDABLE
// - Travel and lodging charges for staff -> TRAVEL_STAY_CHARGE
// - Quantity mismatch (quoted for 180 pax when expected is 350) -> QUANTITY_MISMATCH
// ─────────────────────────────────────────────────────────────────────────────
function generateQuote3() {
  const dir = path.join(QUOTES_DIR, 'quote-3-palace-flavours');
  ensureDir(dir);
  const pdfPath = path.join(dir, 'quote.pdf');
  const jsonPath = path.join(dir, 'expected.json');

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(fs.createWriteStream(pdfPath));

  // Rustic bordered layout simulating printed quote
  doc.strokeColor('#78350F').lineWidth(1.5).rect(35, 35, 525, 750).stroke();

  // Header
  doc.fillColor('#78350F').font('Helvetica-Bold').fontSize(18).text('PALACE FLAVOURS CATERING CO.', 50, 55);
  doc.fillColor('#92400E').fontSize(9).font('Helvetica').text('Old City Gate, City Palace Quarter, Udaipur | Phone: +91 294 2420000', 50, 78);
  doc.rect(50, 95, 495, 1).fill('#B45309');

  // Quotation particulars
  doc.fillColor('#1C1917').fontSize(9).font('Helvetica-Bold').text('CATERING ESTIMATE SHEET', 50, 110);
  doc.font('Helvetica').fontSize(8.5);
  doc.text('Client: Aarav Sharma Wedding', 50, 125);
  doc.text('Event: Pheras & Sangeet Dinner', 50, 138);
  doc.text('Date of Issue: 22 October 2026', 350, 125);
  doc.text('Valid Until: 15 December 2026', 350, 138);

  // Line items
  doc.rect(50, 160, 495, 18).fill('#FEF3C7');
  doc.fillColor('#78350F').font('Helvetica-Bold').fontSize(8.5);
  doc.text('Particulars', 60, 165);
  doc.text('Pax', 280, 165);
  doc.text('Rate', 340, 165);
  doc.text('Amount (Rs.)', 450, 165);

  doc.font('Helvetica').fontSize(8.5).fillColor('#1C1917');
  // Notice quoted for 180 pax when client expects 350 pax!
  doc.text('Special Mewari Thali Banquet & Live Tandoor (All inclusive of taxes)', 60, 190);
  doc.text('180 guests', 280, 190);
  doc.text('Rs. 2,200', 340, 190);
  doc.font('Helvetica-Bold').text('Rs. 3,96,000', 450, 190);

  // Travel and staff accommodation fee
  doc.rect(50, 220, 495, 1).fill('#E7E5E4');
  doc.font('Helvetica-Bold').fontSize(8.5).text('Logistics & Crew Expenses:', 60, 230);
  doc.font('Helvetica').text('Travel logistics and hotel accommodation for 18 master chefs and servers', 60, 245);
  doc.font('Helvetica-Bold').text('Rs. 75,000', 450, 245);

  doc.rect(50, 270, 495, 1).fill('#B45309');
  doc.font('Helvetica-Bold').fontSize(9.5).text('Total Quoted Price:', 300, 280);
  doc.text('Rs. 4,71,000', 450, 280);

  // Terms & Conditions
  doc.rect(50, 310, 495, 130).fill('#FFFBEB');
  doc.fillColor('#78350F').font('Helvetica-Bold').fontSize(8.5).text('SPECIAL BOOKING TERMS:', 60, 322);
  doc.font('Helvetica').fontSize(8).fillColor('#451A03');
  doc.text('1. CANCELLATION: Bookings are strictly NON-REFUNDABLE under any circumstances once token is received.', 60, 338);
  doc.text('2. Pax guarantee: The client has currently booked for 180 pax. Any extra guest above 180 pax will be billed at Rs. 2,500/head.', 60, 352);
  doc.text('3. Travel & stay: Client must provide or pay the quoted Rs. 75,000 lodging & travel allowance for outstation chefs.', 60, 366);
  doc.text('4. Taxes: All local sales taxes and service tax included in quoted head rate.', 60, 380);
  doc.text('5. Includes 10% standard service charge.', 60, 394);

  doc.end();

  // Expected JSON
  const expectedData = {
    _note: "Golden fixture: quote-3 triggers NON_REFUNDABLE, TRAVEL_STAY_CHARGE, and QUANTITY_MISMATCH (quoted 180 for 350 pax).",
    quoteId: "quote-3",
    extracted: {
      vendorName: "Palace Flavours Catering Co.",
      category: "catering",
      currency: "INR",
      validUntil: "2026-12-15",
      statedTotalMinor: 47100000,
      confidence: 0.93,
      lineItems: [
        {
          id: "item-1",
          description: "Special Mewari Thali Banquet & Live Tandoor",
          quantity: 180,
          unit: "per guest",
          unitPriceMinor: 220000,
          totalMinor: 39600000,
          taxIncluded: true,
          sourceRef: "Particulars table row 1"
        }
      ],
      fees: [
        {
          type: "Travel logistics and hotel accommodation for chefs",
          amountMinor: 7500000,
          sourceRef: "Logistics & Crew Expenses"
        }
      ],
      cancellationTerms: "Bookings are strictly non-refundable under any circumstances once token is received",
      inclusions: [
        "10% standard service charge included",
        "Local taxes included"
      ],
      exclusions: []
    },
    expectedFlags: [
      "NON_REFUNDABLE",
      "TRAVEL_STAY_CHARGE",
      "QUANTITY_MISMATCH"
    ]
  };

  fs.writeFileSync(jsonPath, JSON.stringify(expectedData, null, 2), 'utf-8');
}

console.log('Generating synthetic quotes...');
generateQuote1();
generateQuote2();
generateQuote3();
console.log('Generated all 3 synthetic quotes successfully in samples/quotes/!');
