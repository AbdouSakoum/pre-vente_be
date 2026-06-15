require('dotenv').config();
const pool = require('./pool');
const bcrypt = require('bcryptjs');

async function seed() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Tenant de démo
    const { rows: [tenant] } = await client.query(
      `INSERT INTO tenants (name, subdomain) VALUES ('Société Demo', 'demo')
       ON CONFLICT (subdomain) DO UPDATE SET name=EXCLUDED.name RETURNING *`
    );
    console.log('Tenant:', tenant.subdomain, tenant.id);

    // Admin
    const hash = await bcrypt.hash('admin123', 10);
    const { rows: [admin] } = await client.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role)
       VALUES ($1, 'Admin', 'admin@demo.com', $2, 'admin')
       ON CONFLICT (tenant_id, email) DO UPDATE SET password_hash=$2 RETURNING id, email, role`,
      [tenant.id, hash]
    );
    console.log('Admin:', admin.email);

    // Gestionnaire stock
    const hashGs = await bcrypt.hash('stock123', 10);
    await client.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role)
       VALUES ($1, 'Gestionnaire Stock', 'stock@demo.com', $2, 'stock_manager')
       ON CONFLICT (tenant_id, email) DO UPDATE SET password_hash=$2`,
      [tenant.id, hashGs]
    );
    console.log('Stock manager: stock@demo.com');

    // Pré-vendeur
    const hashPv = await bcrypt.hash('prevente123', 10);
    await client.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role)
       VALUES ($1, 'Jean Dupont', 'prevente@demo.com', $2, 'pre_seller')
       ON CONFLICT (tenant_id, email) DO UPDATE SET password_hash=$2`,
      [tenant.id, hashPv]
    );
    console.log('Pre-seller: prevente@demo.com');

    // Livreur
    const hashLiv = await bcrypt.hash('livreur123', 10);
    const { rows: [livreur] } = await client.query(
      `INSERT INTO users (tenant_id, name, email, password_hash, role)
       VALUES ($1, 'Mohamed Ali', 'livreur@demo.com', $2, 'delivery')
       ON CONFLICT (tenant_id, email) DO UPDATE SET password_hash=$2 RETURNING id`,
      [tenant.id, hashLiv]
    );
    console.log('Delivery: livreur@demo.com');

    // Catégorie + produit démo
    const { rows: [cat] } = await client.query(
      `INSERT INTO categories (tenant_id, name) VALUES ($1, 'Boissons') ON CONFLICT DO NOTHING RETURNING *`,
      [tenant.id]
    );

    if (cat) {
      const { rows: [prod] } = await client.query(
        `INSERT INTO products (tenant_id, name, description, category_id)
         VALUES ($1, 'Eau minérale', 'Eau en bouteille', $2) RETURNING *`,
        [tenant.id, cat.id]
      );
      await client.query(
        `INSERT INTO product_variants (tenant_id, product_id, name, sku, price)
         VALUES ($1, $2, '50cl', 'EAU-50CL', 2.50)`,
        [tenant.id, prod.id]
      );
      await client.query(
        `INSERT INTO product_variants (tenant_id, product_id, name, sku, price)
         VALUES ($1, $2, '1.5L', 'EAU-1L5', 5.00)`,
        [tenant.id, prod.id]
      );
      console.log('Produit démo créé');
    }

    await client.query('COMMIT');
    console.log('\n✓ Seed terminé !');
    console.log('Accès : sous-domaine "demo" (ex: demo.localhost)');
    console.log('Comptes :');
    console.log('  admin@demo.com / admin123');
    console.log('  stock@demo.com / stock123');
    console.log('  prevente@demo.com / prevente123');
    console.log('  livreur@demo.com / livreur123');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erreur seed:', err);
  } finally {
    client.release();
    pool.end();
  }
}

seed();
