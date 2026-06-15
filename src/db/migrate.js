require('dotenv').config();
const fs = require('fs');
const path = require('path');
const pool = require('./pool');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

async function migrate() {
  const client = await pool.connect();
  try {
    // Créer la table de suivi si elle n'existe pas
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename VARCHAR(255) PRIMARY KEY,
        applied_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Lire les fichiers de migration triés
    const files = fs.readdirSync(MIGRATIONS_DIR)
      .filter(f => f.endsWith('.sql'))
      .sort();

    // Récupérer les migrations déjà appliquées
    const { rows } = await client.query('SELECT filename FROM schema_migrations');
    const applied = new Set(rows.map(r => r.filename));

    let count = 0;
    for (const file of files) {
      if (applied.has(file)) {
        console.log(`  ✓ ${file} (déjà appliquée)`);
        continue;
      }

      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`  ↑ ${file} appliquée`);
      count++;
    }

    if (count === 0) console.log('  Aucune nouvelle migration.');
    else console.log(`\n${count} migration(s) appliquée(s).`);

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Erreur migration :', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
