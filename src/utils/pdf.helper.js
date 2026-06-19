const path = require('path');
const fs   = require('fs');
const pool = require('../db/pool');

/**
 * Lit un fichier image local et retourne une dataURL base64 pour pdfmake.
 * Retourne null si le fichier n'existe pas.
 */
function imageToDataUrl(relativeUrl) {
  if (!relativeUrl) return null;
  try {
    const filePath = path.join(__dirname, '../../', relativeUrl);
    if (!fs.existsSync(filePath)) return null;
    const ext  = path.extname(filePath).toLowerCase().replace('.', '');
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const data = fs.readFileSync(filePath).toString('base64');
    return `data:${mime};base64,${data}`;
  } catch {
    return null;
  }
}

// Couleurs
const BLUE  = '#2f6bff';
const GRAY  = '#6b7280';
const LGRAY = '#f3f4f6';
const DTEXT = '#1f2a37';

/**
 * Charge les paramètres d'impression du tenant
 */
async function loadPrintSettings(tenantId) {
  const r = await pool.query(
    `SELECT * FROM print_settings WHERE tenant_id = $1`, [tenantId]
  );
  return r.rows[0] || {};
}

/**
 * Génère l'en-tête du document (logo + infos société + infos client)
 */
function buildHeader(ps, docTitle, docNumber, date, clientInfo) {
  const logoDataUrl = imageToDataUrl(ps.logo_url);

  // Colonne gauche : logo + infos client (construits dynamiquement dans le return)
  const leftCol = [];
  if (logoDataUrl) {
    leftCol.push({ image: logoDataUrl, width: 110, margin: [0, 0, 0, 0] });
  }

  // Colonne droite : infos société
  const societyCol = [];
  societyCol.push({ text: ps.company_name || 'Votre Societe', style: 'companyName', margin: [0, 0, 0, 2] });
  if (ps.address) societyCol.push({ text: ps.address, style: 'companyInfo' });
  if (ps.city)    societyCol.push({ text: ps.city,    style: 'companyInfo' });
  if (ps.phone)   societyCol.push({ text: `Tel : ${ps.phone}`, style: 'companyInfo' });
  if (ps.email)   societyCol.push({ text: ps.email,   style: 'companyInfo' });

  const fiscalLines = [];
  if (ps.ice)       fiscalLines.push(`ICE : ${ps.ice}`);
  if (ps.if_fiscal) fiscalLines.push(`IF : ${ps.if_fiscal}`);
  if (ps.rc)        fiscalLines.push(`RC : ${ps.rc}`);
  if (ps.patente)   fiscalLines.push(`Patente : ${ps.patente}`);
  if (fiscalLines.length) {
    societyCol.push({ text: fiscalLines.join('   .   '), style: 'companyInfo', margin: [0, 4, 0, 0] });
  }

  return [
    // Bande titre
    { canvas: [{ type: 'rect', x: 0, y: 0, w: 515, h: 36, color: BLUE }], margin: [0, 0, 0, 0] },
    {
      columns: [
        { text: docTitle,  color: '#ffffff', bold: true, fontSize: 16, margin: [8, -28, 0, 12] },
        { text: docNumber, color: '#ffffff', fontSize: 11, alignment: 'right', margin: [0, -28, 8, 12] },
      ]
    },
    // Logo + infos client (gauche) | infos société (droite)
    {
      columns: [
        {
          width: '55%',
          stack: [
            ...leftCol,
            { text: 'Client', style: 'sectionLabel', margin: [0, 10, 0, 2] },
            { text: clientInfo.name || '-', bold: true, fontSize: 11, color: DTEXT },
            clientInfo.address ? { text: clientInfo.address, style: 'companyInfo' } : {},
            clientInfo.city    ? { text: clientInfo.city,    style: 'companyInfo' } : {},
            clientInfo.phone   ? { text: `Tel : ${clientInfo.phone}`, style: 'companyInfo' } : {},
            { text: `Date : ${date}`, style: 'companyInfo', margin: [0, 6, 0, 0] },
          ],
        },
        {
          width: '45%',
          stack: societyCol,
          alignment: 'right',
        }
      ],
      margin: [0, 10, 0, 14],
    },
    // Séparateur
    { canvas: [{ type: 'line', x1: 0, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#e7eaf0' }], margin: [0, 0, 0, 12] },
  ];
}

/**
 * Tableau de lignes produits
 */
function buildLinesTable(lines, showQtyLivree = false) {
  const headers = [
    { text: 'Produit / Variante', style: 'thCell' },
    { text: 'Qté commandée', style: 'thCell', alignment: 'center' },
  ];
  if (showQtyLivree) headers.push({ text: 'Qté livrée', style: 'thCell', alignment: 'center' });
  headers.push(
    { text: 'P.U. HT', style: 'thCell', alignment: 'right' },
    { text: 'Total HT', style: 'thCell', alignment: 'right' },
  );

  const widths = showQtyLivree ? ['*', 80, 70, 70, 80] : ['*', 90, 70, 80];

  const rows = (lines || []).map((l, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : LGRAY;
    const label = [l.product_name, l.variant_name].filter(Boolean).join(' - ');
    const total = (parseFloat(l.unit_price) * parseInt(l.quantity)).toFixed(2);
    const row = [
      { text: label,           fillColor: bg, margin: [4, 5, 4, 5] },
      { text: l.quantity,      fillColor: bg, alignment: 'center', margin: [4, 5, 4, 5] },
    ];
    if (showQtyLivree) {
      row.push({ text: l.qty_delivered ?? l.quantity, fillColor: bg, alignment: 'center', margin: [4, 5, 4, 5] });
    }
    row.push(
      { text: fmtNum(l.unit_price) + ' DH', fillColor: bg, alignment: 'right', margin: [4, 5, 4, 5] },
      { text: total + ' DH',                fillColor: bg, alignment: 'right', margin: [4, 5, 4, 5] },
    );
    return row;
  });

  return {
    table: { headerRows: 1, widths, body: [headers, ...rows] },
    layout: {
      hLineWidth: (i) => i === 0 || i === 1 ? 1 : 0.5,
      vLineWidth: () => 0,
      hLineColor: () => '#e7eaf0',
      fillColor: (row) => row === 0 ? BLUE : null,
    },
    margin: [0, 0, 0, 16],
  };
}

/**
 * Bloc totaux
 */
function buildTotals(totalHT, tvaRate = 20, totalTTC = null) {
  const tva = totalHT * (tvaRate / 100);
  const ttc = totalTTC !== null ? parseFloat(totalTTC) : totalHT + tva;

  return {
    alignment: 'right',
    stack: [
      totRow('Total HT',  fmtNum(totalHT) + ' DH'),
      totRow(`TVA (${tvaRate}%)`, fmtNum(tva) + ' DH'),
      {
        columns: [
          { text: 'Total TTC', bold: true, fontSize: 12, color: BLUE },
          { text: fmtNum(ttc) + ' DH', bold: true, fontSize: 12, color: BLUE, alignment: 'right' },
        ],
        margin: [0, 4, 0, 0],
      }
    ],
    margin: [300, 0, 0, 0],
  };
}

function totRow(label, value) {
  return {
    columns: [
      { text: label, color: GRAY, fontSize: 10 },
      { text: value, alignment: 'right', fontSize: 10 },
    ],
    margin: [0, 2, 0, 2],
  };
}

/**
 * Bloc signatures : gauche = signature client, droite = cachet société
 * Si cachet disponible, l'image s'affiche dans la case droite.
 */
function buildSignatureBlock(ps, leftLabel = 'Bon pour accord - Client', rightLabel = 'Cachet & Signature') {
  const cachetDataUrl = imageToDataUrl(ps.cachet_url);

  const rightStack = [
    { text: rightLabel, fontSize: 9, color: GRAY },
    cachetDataUrl
      ? {
          image: cachetDataUrl,
          width: 120,
          margin: [0, 6, 0, 0],
          alignment: 'right',
          opacity: 0.85,
        }
      : {
          canvas: [{ type: 'rect', x: 0, y: 4, w: 160, h: 70, lineColor: '#e7eaf0', lineWidth: 1, r: 4 }],
          margin: [0, 4, 0, 0],
        },
  ];

  return {
    columns: [
      {
        width: '45%',
        stack: [
          { text: leftLabel, fontSize: 9, color: GRAY },
          { canvas: [{ type: 'rect', x: 0, y: 4, w: 160, h: 70, lineColor: '#e7eaf0', lineWidth: 1, r: 4 }], margin: [0, 4, 0, 0] },
        ],
      },
      { width: '45%', stack: rightStack, alignment: 'right' },
    ],
    margin: [0, 30, 0, 0],
  };
}

/**
 * Pied de page
 */
function buildFooter(ps) {
  const lines = [];
  if (ps.footer_text) lines.push({ text: ps.footer_text, style: 'footer' });
  return lines.length ? lines : [];
}

/**
 * Génère le PDF et retourne un Buffer
 */
const PdfPrinter = require('pdfmake');
const _vfsModule = require('pdfmake/build/vfs_fonts');
const vfsFonts   = (_vfsModule.pdfMake && _vfsModule.pdfMake.vfs) ? _vfsModule.pdfMake.vfs : _vfsModule;

const printer = new PdfPrinter({
  Roboto: {
    normal:      Buffer.from(vfsFonts['Roboto-Regular.ttf'],      'base64'),
    bold:        Buffer.from(vfsFonts['Roboto-Medium.ttf'],       'base64'),
    italics:     Buffer.from(vfsFonts['Roboto-Italic.ttf'],       'base64'),
    bolditalics: Buffer.from(vfsFonts['Roboto-MediumItalic.ttf'], 'base64'),
  }
});

function generatePdf(docDef) {
  return new Promise((resolve, reject) => {
    try {

      const doc = printer.createPdfKitDocument(docDef);
      const chunks = [];
      doc.on('data', c => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}

function fmtNum(n) {
  return parseFloat(n || 0).toLocaleString('fr-MA', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtDate(d) {
  if (!d) return '-';
  return new Date(d).toLocaleDateString('fr-MA', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

module.exports = { loadPrintSettings, buildHeader, buildLinesTable, buildTotals, buildSignatureBlock, buildFooter, generatePdf, fmtNum, fmtDate, BLUE, GRAY, LGRAY, DTEXT };
