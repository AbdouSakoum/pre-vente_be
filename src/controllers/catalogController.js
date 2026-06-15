const pool = require('../db/pool');
const { saveFile } = require('../services/storageService');

// ---- CATEGORIES ----
async function getCategories(req, res, next) {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM categories WHERE tenant_id = $1 ORDER BY name',
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function createCategory(req, res, next) {
  const { name } = req.body;
  try {
    const { rows } = await pool.query(
      'INSERT INTO categories (tenant_id, name) VALUES ($1, $2) RETURNING *',
      [req.tenantId, name]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function updateCategory(req, res, next) {
  const { id } = req.params;
  const { name } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE categories SET name=$1 WHERE id=$2 AND tenant_id=$3 RETURNING *',
      [name, id, req.tenantId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Catégorie introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function deleteCategory(req, res, next) {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM categories WHERE id=$1 AND tenant_id=$2', [id, req.tenantId]);
    res.status(204).end();
  } catch (err) { next(err); }
}

// ---- PRODUCTS ----
async function getProducts(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, c.name AS category_name,
        json_agg(json_build_object(
          'id', v.id, 'name', v.name, 'sku', v.sku,
          'price', v.price, 'image_url', v.image_url, 'is_active', v.is_active
        )) AS variants
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_variants v ON v.product_id = p.id AND v.tenant_id = p.tenant_id
       WHERE p.tenant_id = $1
       GROUP BY p.id, c.name
       ORDER BY p.name`,
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

async function getProduct(req, res, next) {
  const { id } = req.params;
  try {
    const { rows } = await pool.query(
      `SELECT p.*, c.name AS category_name,
        json_agg(json_build_object(
          'id', v.id, 'name', v.name, 'sku', v.sku,
          'price', v.price, 'image_url', v.image_url, 'is_active', v.is_active
        )) AS variants
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_variants v ON v.product_id = p.id AND v.tenant_id = p.tenant_id
       WHERE p.id = $1 AND p.tenant_id = $2
       GROUP BY p.id, c.name`,
      [id, req.tenantId]
    );
    if (!rows.length) return res.status(404).json({ message: 'Produit introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function createProduct(req, res, next) {
  const { name, description, category_id, variants } = req.body;
  const productImage = req.files?.product_image?.[0];

  if (!name) return res.status(400).json({ message: 'Nom du produit obligatoire' });

  let parsedVariants = [];
  try {
    parsedVariants = typeof variants === 'string' ? JSON.parse(variants) : (variants || []);
  } catch {
    return res.status(400).json({ message: 'Format des variantes invalide' });
  }

  if (!parsedVariants.length) return res.status(400).json({ message: 'Au moins une variante est requise' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const productImageUrl = productImage
      ? await saveFile(productImage, req.tenantId, 'article')
      : null;

    const { rows: [product] } = await client.query(
      'INSERT INTO products (tenant_id, name, description, category_id, image_url, tva_rate) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [req.tenantId, name, description || null, category_id || null, productImageUrl, req.body.tva_rate ?? 20]
    );

    const createdVariants = [];
    for (let i = 0; i < parsedVariants.length; i++) {
      const v = parsedVariants[i];
      if (!v.price && v.price !== 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ message: `Prix obligatoire pour la variante ${i + 1}` });
      }

      const variantName = parsedVariants.length === 1
        ? name
        : `${name} - ${v.name || `Variante ${i + 1}`}`;

      const sku = `SKU-${Date.now()}-${i + 1}`;

      const variantImg = req.files?.[`variant_image_${i}`]?.[0];
      const variantImageUrl = variantImg
        ? await saveFile(variantImg, req.tenantId, 'article')
        : null;

      const { rows: [variant] } = await client.query(
        `INSERT INTO product_variants (tenant_id, product_id, name, sku, price, image_url)
         VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
        [req.tenantId, product.id, variantName, sku, v.price, variantImageUrl]
      );
      createdVariants.push(variant);
    }

    await client.query('COMMIT');
    res.status(201).json({ ...product, variants: createdVariants });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function updateProduct(req, res, next) {
  const { id } = req.params;
  const { name, description, category_id, is_active, variants } = req.body;
  const productImage = req.files?.product_image?.[0];

  if (!name) return res.status(400).json({ message: 'Nom du produit obligatoire' });

  let parsedVariants = [];
  try {
    parsedVariants = typeof variants === 'string' ? JSON.parse(variants) : (variants || []);
  } catch {
    return res.status(400).json({ message: 'Format des variantes invalide' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let imageFields = '';
    if (productImage) {
      const url = await saveFile(productImage, req.tenantId, 'article');
      imageFields = `, image_url='${url}'`;
    }

    const { rows } = await client.query(
      `UPDATE products SET name=$1, description=$2, category_id=$3, is_active=$4, tva_rate=$7${imageFields}
       WHERE id=$5 AND tenant_id=$6 RETURNING *`,
      [name, description || null, category_id || null, is_active ?? true, id, req.tenantId, req.body.tva_rate ?? 20]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: 'Produit introuvable' });
    }

    for (let i = 0; i < parsedVariants.length; i++) {
      const v = parsedVariants[i];
      const variantName = parsedVariants.length === 1 ? name : `${name} - ${v.name || `Variante ${i + 1}`}`;
      const variantImg = req.files?.[`variant_image_${i}`]?.[0];

      if (v.id) {
        let imgUpdate = '';
        if (variantImg) {
          const url = await saveFile(variantImg, req.tenantId, 'article');
          imgUpdate = `, image_url='${url}'`;
        }
        await client.query(
          `UPDATE product_variants SET name=$1, price=$2${imgUpdate} WHERE id=$3 AND tenant_id=$4`,
          [variantName, v.price, v.id, req.tenantId]
        );
      } else {
        const sku = `SKU-${Date.now()}-${i + 1}`;
        const variantImageUrl = variantImg ? await saveFile(variantImg, req.tenantId, 'article') : null;
        await client.query(
          `INSERT INTO product_variants (tenant_id, product_id, name, sku, price, image_url)
           VALUES ($1,$2,$3,$4,$5,$6)`,
          [req.tenantId, id, variantName, sku, v.price, variantImageUrl]
        );
      }
    }

    await client.query('COMMIT');

    const { rows: [product] } = await client.query(
      `SELECT p.*, c.name AS category_name,
        json_agg(json_build_object('id',v.id,'name',v.name,'sku',v.sku,'price',v.price,'image_url',v.image_url,'is_active',v.is_active)) AS variants
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_variants v ON v.product_id = p.id AND v.tenant_id = p.tenant_id
       WHERE p.id=$1 AND p.tenant_id=$2
       GROUP BY p.id, c.name`,
      [id, req.tenantId]
    );
    res.json(product);
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

async function deleteProduct(req, res, next) {
  const { id } = req.params;
  try {
    await pool.query('UPDATE products SET is_active=false WHERE id=$1 AND tenant_id=$2', [id, req.tenantId]);
    res.status(204).end();
  } catch (err) { next(err); }
}

// ---- VARIANTS ----
async function createVariant(req, res, next) {
  const { product_id } = req.params;
  const { name, sku, price } = req.body;
  try {
    const image_url = req.file ? await saveFile(req.file, req.tenantId, 'article') : null;
    const { rows } = await pool.query(
      `INSERT INTO product_variants (tenant_id, product_id, name, sku, price, image_url)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [req.tenantId, product_id, name, sku || null, price, image_url]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
}

async function updateVariant(req, res, next) {
  const { id } = req.params;
  const { name, sku, price, is_active } = req.body;

  try {
    const fields = ['name=$1', 'sku=$2', 'price=$3', 'is_active=$4'];
    const values = [name, sku || null, price, is_active ?? true];
    if (req.file) {
      const url = await saveFile(req.file, req.tenantId, 'article');
      fields.push(`image_url=$${values.length + 1}`);
      values.push(url);
    }
    values.push(id, req.tenantId);

    const { rows } = await pool.query(
      `UPDATE product_variants SET ${fields.join(',')} WHERE id=$${values.length - 1} AND tenant_id=$${values.length} RETURNING *`,
      values
    );
    if (!rows.length) return res.status(404).json({ message: 'Variante introuvable' });
    res.json(rows[0]);
  } catch (err) { next(err); }
}

async function deleteVariant(req, res, next) {
  const { id } = req.params;
  try {
    await pool.query('UPDATE product_variants SET is_active=false WHERE id=$1 AND tenant_id=$2', [id, req.tenantId]);
    res.status(204).end();
  } catch (err) { next(err); }
}

async function getProductsForOrder(req, res, next) {
  try {
    const { rows } = await pool.query(
      `SELECT
        p.id, p.name, p.description, p.image_url, p.is_active,
        c.name AS category_name,
        json_agg(json_build_object(
          'id', v.id,
          'name', v.name,
          'sku', v.sku,
          'price', v.price,
          'image_url', v.image_url,
          'is_active', v.is_active,
          'stock_warehouse', COALESCE(sw.quantity, 0)
        ) ORDER BY v.name) AS variants
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN product_variants v ON v.product_id = p.id AND v.tenant_id = p.tenant_id AND v.is_active = true
       LEFT JOIN stock_warehouse sw ON sw.variant_id = v.id AND sw.tenant_id = p.tenant_id
       WHERE p.tenant_id = $1 AND p.is_active = true
       GROUP BY p.id, c.name
       ORDER BY p.name`,
      [req.tenantId]
    );
    res.json(rows);
  } catch (err) { next(err); }
}

module.exports = {
  getCategories, createCategory, updateCategory, deleteCategory,
  getProducts, getProduct, createProduct, updateProduct, deleteProduct,
  createVariant, updateVariant, deleteVariant,
  getProductsForOrder
};
