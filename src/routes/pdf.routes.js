const router = require('express').Router();
const auth   = require('../middlewares/auth');
const pool   = require('../db/pool');
const { generateBonCommande, generateBonReception } = require('../utils/pdf.generator');
const {
  loadPrintSettings, buildHeader, buildLinesTable, buildTotals,
  buildSignatureBlock, buildFooter, generatePdf, fmtNum, fmtDate, BLUE, GRAY, LGRAY,
} = require('../utils/pdf.helper');

/* ═══════════════════════════════════════════════════════════════════
   GENERATE & GET URL   POST /api/pdf/orders/:id/generate
   Régénère le PDF bon de commande et retourne son URL
   ═══════════════════════════════════════════════════════════════════ */
router.post('/orders/:id/generate', auth(), async (req, res, next) => {
  try {
    const url = await generateBonCommande(req.params.id, req.tenantId);
    res.json({ url });
  } catch (err) { next(err); }
});

router.post('/stock/arrivages/:id/generate', auth(), async (req, res, next) => {
  try {
    const url = await generateBonReception(req.params.id, req.tenantId);
    res.json({ url });
  } catch (err) { next(err); }
});

const STYLES = {
  companyName:  { fontSize: 14, bold: true, color: '#1f2a37' },
  companyInfo:  { fontSize: 9,  color: '#6b7280', lineHeight: 1.4 },
  sectionLabel: { fontSize: 8, bold: true, color: BLUE, margin: [0, 0, 0, 3], characterSpacing: 1 },
  thCell:       { bold: true, fontSize: 9, color: '#ffffff', margin: [4, 6, 4, 6] },
  footer:       { fontSize: 8, color: '#9aa3af', alignment: 'center', italics: true },
};

const DEFAULT_STYLES = {
  defaultStyle: { font: 'Roboto', fontSize: 10, color: '#1f2a37' }
};

/* ═══════════════════════════════════════════════════════════════════
   1. BON DE COMMANDE   GET /api/pdf/orders/:id/bon-commande
   ═══════════════════════════════════════════════════════════════════ */
router.get('/orders/:id/bon-commande', auth(), async (req, res, next) => {
  try {
    const tid = req.tenantId;
    const { id } = req.params;

    const [orderRes, ps] = await Promise.all([
      pool.query(
        `SELECT o.*, c.name AS client_name, c.phone AS client_phone, c.address AS client_address, c.city AS client_city,
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
        [id, tid]
      ),
      loadPrintSettings(tid),
    ]);

    if (!orderRes.rows.length) return res.status(404).json({ message: 'Commande introuvable' });
    const o = orderRes.rows[0];

    const totalTTC = o.lines.reduce((s, l) => s + parseFloat(l.unit_price) * parseInt(l.quantity), 0);
    const totalHT  = parseFloat((totalTTC / 1.20).toFixed(2));
    const docNum   = `BC-${String(o.order_number || id.slice(0,8)).toUpperCase()}`;

    const docDef = {
      pageSize: 'A4', pageMargins: [40, 40, 40, 60],
      styles: STYLES, ...DEFAULT_STYLES,
      content: [
        ...buildHeader(ps, 'BON DE COMMANDE', docNum, fmtDate(o.created_at), {
          name: o.client_name, phone: o.client_phone,
          address: o.client_address, city: o.client_city,
        }),
        // Vendeur
        o.pre_seller_name ? {
          text: `Pré-vendeur : ${o.pre_seller_name}`,
          fontSize: 9, color: GRAY, margin: [0, 0, 0, 10],
        } : {},
        // Statut
        {
          columns: [
            statusBadge('Statut commande', o.status),
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
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="bon-commande-${docNum}.pdf"`);
    res.send(buf);
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════
   2. BON DE LIVRAISON   GET /api/pdf/orders/:id/bon-livraison
   ═══════════════════════════════════════════════════════════════════ */
router.get('/orders/:id/bon-livraison', auth(), async (req, res, next) => {
  try {
    const tid = req.tenantId;
    const { id } = req.params;

    const [orderRes, ps] = await Promise.all([
      pool.query(
        `SELECT o.*, c.name AS client_name, c.phone AS client_phone, c.address AS client_address, c.city AS client_city,
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
        [id, tid]
      ),
      loadPrintSettings(tid),
    ]);

    if (!orderRes.rows.length) return res.status(404).json({ message: 'Commande introuvable' });
    const o = orderRes.rows[0];

    const totalTTC = o.lines.reduce((s, l) => s + parseFloat(l.unit_price) * parseInt(l.quantity), 0);
    const totalHT  = parseFloat((totalTTC / 1.20).toFixed(2));
    const docNum   = `BL-${String(o.order_number || id.slice(0,8)).toUpperCase()}`;

    const docDef = {
      pageSize: 'A4', pageMargins: [40, 40, 40, 60],
      styles: STYLES, ...DEFAULT_STYLES,
      content: [
        ...buildHeader(ps, 'BON DE LIVRAISON', docNum, fmtDate(o.delivered_at || o.created_at), {
          name: o.client_name, phone: o.client_phone,
          address: o.client_address, city: o.client_city,
        }),
        o.delivery_name ? {
          text: `Livreur : ${o.delivery_name}`,
          fontSize: 9, color: GRAY, margin: [0, 0, 0, 10],
        } : {},
        o.delivery_address ? {
          text: `Adresse de livraison : ${o.delivery_address}`,
          fontSize: 9, color: GRAY, margin: [0, 0, 0, 10],
        } : {},
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
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="bon-livraison-${docNum}.pdf"`);
    res.send(buf);
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════
   3. FACTURE   GET /api/pdf/orders/:id/facture
   ═══════════════════════════════════════════════════════════════════ */
router.get('/orders/:id/facture', auth(), async (req, res, next) => {
  try {
    const tid = req.tenantId;
    const { id } = req.params;

    // Numérotation séquentielle : incrémenter facture_seq si pas encore de num
    const [orderRes, ps] = await Promise.all([
      pool.query(
        `SELECT o.*, c.name AS client_name, c.phone AS client_phone, c.address AS client_address, c.city AS client_city,
                json_agg(json_build_object(
                  'product_name', p.name, 'variant_name', pv.name,
                  'quantity', ol.quantity, 'unit_price', ol.unit_price
                ) ORDER BY ol.id) AS lines
         FROM orders o
         LEFT JOIN clients c ON c.id = o.client_id
         LEFT JOIN order_lines ol ON ol.order_id = o.id
         LEFT JOIN product_variants pv ON pv.id = ol.variant_id
         LEFT JOIN products p ON p.id = pv.product_id
         WHERE o.id = $1 AND o.tenant_id = $2
         GROUP BY o.id, c.name, c.phone, c.address, c.city`,
        [id, tid]
      ),
      loadPrintSettings(tid),
    ]);

    if (!orderRes.rows.length) return res.status(404).json({ message: 'Commande introuvable' });
    const o = orderRes.rows[0];

    // Numéro facture : utilise facture_num si existe, sinon incrément
    let factureNum = o.facture_num;
    if (!factureNum) {
      const seqRes = await pool.query(
        `UPDATE print_settings SET facture_seq = facture_seq + 1, updated_at = NOW()
         WHERE tenant_id = $1 RETURNING facture_seq`,
        [tid]
      );
      const seq = seqRes.rows[0]?.facture_seq || 1;
      const year = new Date().getFullYear();
      factureNum = `F-${year}-${String(seq).padStart(4, '0')}`;

      // Sauvegarder sur la commande si la colonne existe
      await pool.query(
        `UPDATE orders SET facture_num = $1 WHERE id = $2 AND tenant_id = $3`,
        [factureNum, id, tid]
      ).catch(() => {}); // ignore si colonne n'existe pas encore
    }

    const totalTTC = o.total_ttc ? parseFloat(o.total_ttc)
      : o.lines.reduce((s, l) => s + parseFloat(l.unit_price) * parseInt(l.quantity), 0);
    const totalHT  = parseFloat((totalTTC / 1.20).toFixed(2));
    const tva      = parseFloat((totalTTC - totalHT).toFixed(2));
    const resteAPayer = Math.max(0, totalTTC - parseFloat(o.paid_amount || 0));

    const docDef = {
      pageSize: 'A4', pageMargins: [40, 40, 40, 60],
      styles: STYLES, ...DEFAULT_STYLES,
      content: [
        ...buildHeader(ps, 'FACTURE', factureNum, fmtDate(o.delivered_at || o.created_at), {
          name: o.client_name, phone: o.client_phone,
          address: o.client_address, city: o.client_city,
        }),
        buildLinesTable(o.lines),
        buildTotals(totalHT, 20, totalTTC),
        // Récapitulatif paiement
        {
          alignment: 'right',
          stack: [
            { canvas: [{ type: 'line', x1: 175, y1: 0, x2: 515, y2: 0, lineWidth: 1, lineColor: '#e7eaf0' }], margin: [0, 6, 0, 6] },
            { columns: [
                { text: 'Montant encaissé', fontSize: 10, color: GRAY },
                { text: `${fmtNum(o.paid_amount || 0)} DH`, fontSize: 10, alignment: 'right' },
            ]},
            { columns: [
                { text: 'Reste a payer', bold: true, fontSize: 11, color: resteAPayer > 0 ? '#e2483d' : '#16a34a' },
                { text: `${fmtNum(resteAPayer)} DH`, bold: true, fontSize: 11, alignment: 'right', color: resteAPayer > 0 ? '#e2483d' : '#16a34a' },
            ], margin: [0, 4, 0, 0] },
          ],
          margin: [300, 0, 0, 8],
        },
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
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="facture-${factureNum}.pdf"`);
    res.send(buf);
  } catch (err) { next(err); }
});

/* ═══════════════════════════════════════════════════════════════════
   4. BON DE RÉCEPTION   GET /api/pdf/stock/arrivages/:id/bon-reception
   ═══════════════════════════════════════════════════════════════════ */
router.get('/stock/arrivages/:id/bon-reception', auth(), async (req, res, next) => {
  try {
    const tid = req.tenantId;
    const { id } = req.params;

    const [arrivageRes, ps] = await Promise.all([
      pool.query(
        `SELECT a.*, f.nom AS fournisseur_name, f.telephone AS fournisseur_phone,
                u.name AS created_by_name,
                json_agg(json_build_object(
                  'product_name', p.name, 'variant_name', pv.name,
                  'quantity', al.quantite, 'unit_price', al.prix_unitaire
                ) ORDER BY al.id) AS lines
         FROM arrivages a
         LEFT JOIN fournisseurs f ON f.id = a.fournisseur_id AND f.tenant_id = a.tenant_id
         LEFT JOIN users u ON u.id = a.created_by
         LEFT JOIN arrivage_lines al ON al.arrivage_id = a.id
         LEFT JOIN product_variants pv ON pv.id = al.variant_id
         LEFT JOIN products p ON p.id = pv.product_id
         WHERE a.id = $1 AND a.tenant_id = $2
         GROUP BY a.id, f.nom, f.telephone, u.name`,
        [id, tid]
      ),
      loadPrintSettings(tid),
    ]);

    if (!arrivageRes.rows.length) return res.status(404).json({ message: 'Arrivage introuvable' });
    const a = arrivageRes.rows[0];

    const totalHT = a.lines.reduce((s, l) => s + parseFloat(l.unit_price || 0) * parseInt(l.quantity), 0);
    const docNum  = `BR-${String(id.slice(0,8)).toUpperCase()}`;

    const docDef = {
      pageSize: 'A4', pageMargins: [40, 40, 40, 60],
      styles: STYLES, ...DEFAULT_STYLES,
      content: [
        ...buildHeader(ps, 'BON DE RECEPTION', docNum, fmtDate(a.created_at), {
          name: a.fournisseur_name || 'Fournisseur',
          phone: a.fournisseur_phone,
          address: a.fournisseur_address,
        }),
        a.created_by_name ? {
          text: `Réceptionné par : ${a.created_by_name}`,
          fontSize: 9, color: GRAY, margin: [0, 0, 0, 10],
        } : {},
        a.notes ? {
          text: `Notes : ${a.notes}`,
          fontSize: 9, color: GRAY, margin: [0, 0, 0, 10],
        } : {},
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
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="bon-reception-${docNum}.pdf"`);
    res.send(buf);
  } catch (err) { next(err); }
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(label, value) {
  const colors = {
    pending: '#f59e0b', confirmed: '#3b82f6', delivered: '#16a34a',
    cancelled: '#e2483d', paid: '#16a34a', unpaid: '#e2483d', partial: '#f59e0b',
  };
  const color = colors[value] || GRAY;
  return {
    stack: [
      { text: label, fontSize: 8, color: GRAY, margin: [0, 0, 0, 2] },
      {
        text: value?.toUpperCase() || '-',
        fontSize: 9, bold: true, color,
        background: color + '18',
        margin: [6, 3, 6, 3],
      }
    ],
    width: 'auto',
  };
}

function signBox() {
  return {
    canvas: [{
      type: 'rect', x: 0, y: 4, w: 160, h: 60,
      lineColor: '#e7eaf0', lineWidth: 1, r: 4,
    }],
    margin: [0, 4, 0, 0],
  };
}

module.exports = router;
