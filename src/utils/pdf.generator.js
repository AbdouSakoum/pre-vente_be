/**
 * Génère et stocke les PDFs des commandes sur disque.
 * Appelé après création de commande ou à la demande.
 */
const path = require('path');
const fs   = require('fs');
const pool = require('../db/pool');
const {
  loadPrintSettings, buildHeader, buildLinesTable, buildTotals,
  buildSignatureBlock, buildFooter, generatePdf, fmtNum, fmtDate, BLUE, GRAY,
} = require('./pdf.helper');

const STYLES = {
  companyName:  { fontSize: 14, bold: true, color: '#1f2a37' },
  companyInfo:  { fontSize: 9,  color: '#6b7280', lineHeight: 1.4 },
  sectionLabel: { fontSize: 8, bold: true, color: BLUE, margin: [0, 0, 0, 3], characterSpacing: 1 },
  thCell:       { bold: true, fontSize: 9, color: '#ffffff', margin: [4, 6, 4, 6] },
  footer:       { fontSize: 8, color: '#9aa3af', alignment: 'center', italics: true },
};
const DEFAULT_STYLES = { defaultStyle: { font: 'Roboto', fontSize: 10, color: '#1f2a37' } };

/**
 * Génère le bon de commande d'une order et le stocke.
 * Retourne l'URL relative du fichier.
 */
async function generateBonCommande(orderId, tenantId) {
  // Charger les données
  const [orderRes, ps] = await Promise.all([
    pool.query(
      `SELECT o.*, c.name AS client_name, c.phone AS client_phone,
              c.address AS client_address, c.city AS client_city,
              u1.name AS pre_seller_name,
              json_agg(json_build_object(
                'product_name', p.name, 'variant_name', pv.name,
                'quantity', ol.quantity, 'unit_price', ol.unit_price
              ) ORDER BY ol.id) AS lines
       FROM orders o
       LEFT JOIN clients c ON c.id = o.client_id
       LEFT JOIN users u1  ON u1.id = o.pre_seller_id
       LEFT JOIN order_lines ol ON ol.order_id = o.id
       LEFT JOIN product_variants pv ON pv.id = ol.variant_id
       LEFT JOIN products p ON p.id = pv.product_id
       WHERE o.id = $1 AND o.tenant_id = $2
       GROUP BY o.id, c.name, c.phone, c.address, c.city, u1.name`,
      [orderId, tenantId]
    ),
    loadPrintSettings(tenantId),
  ]);

  if (!orderRes.rows.length) throw new Error('Commande introuvable');
  const o = orderRes.rows[0];

  const totalTTC = o.lines.reduce((s, l) => s + parseFloat(l.unit_price) * parseInt(l.quantity), 0);
  const totalHT  = parseFloat((totalTTC / 1.20).toFixed(2));
  const docNum   = `BC-${String(o.order_number).padStart(5, '0')}`;

  const docDef = {
    pageSize: 'A4', pageMargins: [40, 40, 40, 60],
    styles: STYLES, ...DEFAULT_STYLES,
    content: [
      ...buildHeader(ps, 'BON DE COMMANDE', docNum, fmtDate(o.created_at), {
        name: o.client_name, phone: o.client_phone,
        address: o.client_address, city: o.client_city,
      }),
      o.pre_seller_name ? { text: `Pré-vendeur : ${o.pre_seller_name}`, fontSize: 9, color: GRAY, margin: [0, 0, 0, 10] } : {},
      {
        columns: [
          statusBadge('Statut', o.status),
          statusBadge('Paiement', o.payment_status),
        ],
        margin: [0, 0, 0, 14],
      },
      buildLinesTable(o.lines),
      buildTotals(totalHT, 20, o.total_ttc),
      { text: '\n' },
      buildSignatureBlock(ps),
      ...buildFooter(ps),
    ],
    footer: (page, pages) => ({
      text: `Page ${page} / ${pages}`,
      alignment: 'center', fontSize: 8, color: GRAY, margin: [0, 10, 0, 0],
    }),
  };

  const buf = await generatePdf(docDef);

  // Stocker sur disque
  const dir = path.join(__dirname, '../../uploads', tenantId, 'pdfs');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `bon-commande-${orderId}.pdf`;
  fs.writeFileSync(path.join(dir, filename), buf);

  const fileUrl = `/uploads/${tenantId}/pdfs/${filename}`;

  // Mettre à jour la commande
  await pool.query(
    `UPDATE orders SET bon_commande_url = $1 WHERE id = $2 AND tenant_id = $3`,
    [fileUrl, orderId, tenantId]
  );

  return fileUrl;
}

function statusBadge(label, value) {
  const colors = {
    pending: '#f59e0b', confirmed: '#3b82f6', delivered: '#16a34a',
    cancelled: '#e2483d', paid: '#16a34a', unpaid: '#e2483d', partial: '#f59e0b',
  };
  const color = colors[value] || GRAY;
  return {
    stack: [
      { text: label, fontSize: 8, color: GRAY, margin: [0, 0, 0, 2] },
      { text: value?.toUpperCase() || '-', fontSize: 9, bold: true, color, margin: [6, 3, 6, 3] },
    ],
    width: 'auto',
  };
}

/**
 * Genere le bon de livraison d'une commande et le stocke.
 */
async function generateBonLivraison(orderId, tenantId) {
  const [orderRes, ps] = await Promise.all([
    pool.query(
      `SELECT o.*, c.name AS client_name, c.phone AS client_phone,
              c.address AS client_address, c.city AS client_city,
              u2.name AS delivery_name,
              json_agg(json_build_object(
                'product_name', p.name, 'variant_name', pv.name,
                'quantity', ol.quantity, 'unit_price', ol.unit_price
              ) ORDER BY ol.id) AS lines
       FROM orders o
       LEFT JOIN clients c ON c.id = o.client_id
       LEFT JOIN users u2  ON u2.id = o.delivery_user_id
       LEFT JOIN order_lines ol ON ol.order_id = o.id
       LEFT JOIN product_variants pv ON pv.id = ol.variant_id
       LEFT JOIN products p ON p.id = pv.product_id
       WHERE o.id = $1 AND o.tenant_id = $2
       GROUP BY o.id, c.name, c.phone, c.address, c.city, u2.name`,
      [orderId, tenantId]
    ),
    loadPrintSettings(tenantId),
  ]);

  if (!orderRes.rows.length) throw new Error('Commande introuvable');
  const o = orderRes.rows[0];

  const totalTTC = o.lines.reduce((s, l) => s + parseFloat(l.unit_price) * parseInt(l.quantity), 0);
  const totalHT  = parseFloat((totalTTC / 1.20).toFixed(2));
  const docNum   = `BL-${String(o.order_number).padStart(5, '0')}`;

  const docDef = {
    pageSize: 'A4', pageMargins: [40, 40, 40, 60],
    styles: STYLES, ...DEFAULT_STYLES,
    content: [
      ...buildHeader(ps, 'BON DE LIVRAISON', docNum, fmtDate(o.delivered_at || o.created_at), {
        name: o.client_name, phone: o.client_phone,
        address: o.client_address, city: o.client_city,
      }),
      o.delivery_name ? { text: `Livreur : ${o.delivery_name}`, fontSize: 9, color: GRAY, margin: [0, 0, 0, 10] } : {},
      o.delivery_address ? { text: `Adresse : ${o.delivery_address}`, fontSize: 9, color: GRAY, margin: [0, 0, 0, 10] } : {},
      buildLinesTable(o.lines, true),
      buildTotals(totalHT, 20, o.total_ttc),
      { text: '\n' },
      buildSignatureBlock(ps, 'Signature client - Recu conforme', 'Signature livreur'),
      ...buildFooter(ps),
    ],
    footer: (page, pages) => ({
      text: `Page ${page} / ${pages}`,
      alignment: 'center', fontSize: 8, color: GRAY, margin: [0, 10, 0, 0],
    }),
  };

  const buf = await generatePdf(docDef);

  const dir = path.join(__dirname, '../../uploads', tenantId, 'pdfs');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `bon-livraison-${orderId}.pdf`;
  fs.writeFileSync(path.join(dir, filename), buf);

  const fileUrl = `/uploads/${tenantId}/pdfs/${filename}`;
  await pool.query(
    `UPDATE orders SET bon_livraison_url = $1 WHERE id = $2 AND tenant_id = $3`,
    [fileUrl, orderId, tenantId]
  ).catch(() => {});

  return fileUrl;
}

/**
 * Genere le bon de reception d'un arrivage et le stocke.
 */
async function generateBonReception(arrivageId, tenantId) {
  const [arrivageRes, ps] = await Promise.all([
    pool.query(
      `SELECT a.*, f.nom AS fournisseur_name, f.telephone AS fournisseur_phone,
              u.name AS created_by_name,
              json_agg(json_build_object(
                'product_name', p.name, 'variant_name', pv.name,
                'quantity', al.quantite, 'unit_price', al.prix_unitaire
              ) ORDER BY al.id) AS lines
       FROM arrivages a
       LEFT JOIN fournisseurs f ON f.id = a.fournisseur_id
       LEFT JOIN users u ON u.id = a.created_by
       LEFT JOIN arrivage_lines al ON al.arrivage_id = a.id
       LEFT JOIN product_variants pv ON pv.id = al.variant_id
       LEFT JOIN products p ON p.id = pv.product_id
       WHERE a.id = $1 AND a.tenant_id = $2
       GROUP BY a.id, f.nom, f.telephone, u.name`,
      [arrivageId, tenantId]
    ),
    loadPrintSettings(tenantId),
  ]);

  if (!arrivageRes.rows.length) throw new Error('Arrivage introuvable');
  const a = arrivageRes.rows[0];

  const totalHT = a.lines.reduce((s, l) => s + parseFloat(l.unit_price || 0) * parseInt(l.quantity), 0);
  const docNum  = `BR-${String(arrivageId).slice(0, 8).toUpperCase()}`;

  const docDef = {
    pageSize: 'A4', pageMargins: [40, 40, 40, 60],
    styles: STYLES, ...DEFAULT_STYLES,
    content: [
      ...buildHeader(ps, 'BON DE RECEPTION', docNum, fmtDate(a.created_at || a.arrivage_date), {
        name: a.fournisseur_name || 'Fournisseur',
        phone: a.fournisseur_phone,
        address: a.fournisseur_address,
      }),
      a.bl ? { text: `N° BL fournisseur : ${a.bl}`, fontSize: 9, color: GRAY, margin: [0, 0, 0, 6] } : {},
      a.created_by_name ? { text: `Receptionne par : ${a.created_by_name}`, fontSize: 9, color: GRAY, margin: [0, 0, 0, 10] } : {},
      buildLinesTable(a.lines),
      totalHT > 0 ? buildTotals(totalHT, 20) : {},
      { text: '\n' },
      buildSignatureBlock(ps, 'Signature fournisseur', 'Signature receptionniste'),
      ...buildFooter(ps),
    ],
    footer: (page, pages) => ({
      text: `Page ${page} / ${pages}`,
      alignment: 'center', fontSize: 8, color: GRAY, margin: [0, 10, 0, 0],
    }),
  };

  const buf = await generatePdf(docDef);

  const dir = path.join(__dirname, '../../uploads', tenantId, 'pdfs');
  fs.mkdirSync(dir, { recursive: true });
  const filename = `bon-reception-${arrivageId}.pdf`;
  fs.writeFileSync(path.join(dir, filename), buf);

  const fileUrl = `/uploads/${tenantId}/pdfs/${filename}`;
  await pool.query(
    `UPDATE arrivages SET bon_reception_url = $1 WHERE id = $2 AND tenant_id = $3`,
    [fileUrl, arrivageId, tenantId]
  ).catch(() => {});

  return fileUrl;
}

module.exports = { generateBonCommande, generateBonLivraison, generateBonReception };
