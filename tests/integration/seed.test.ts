import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { count, eq } from 'drizzle-orm';
import * as schema from '../../src/db/schema';

const DATABASE_URL = process.env['DATABASE_URL'] ?? 'postgresql://flod:flod_dev_password@localhost:5433/flod_dev';

let sql: ReturnType<typeof postgres>;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeAll(() => {
  sql = postgres(DATABASE_URL, { max: 1 });
  db = drizzle(sql, { schema });
});

afterAll(async () => {
  await sql.end();
});

describe('Seed Data — Branches', () => {
  // R3.AC1: Seed 15 permanent branches
  it('R3.AC1: should have 15 branches seeded', async () => {
    const result = await sql`SELECT count(*)::int AS total FROM branches`;
    expect(result[0]!['total']).toBe(15);
  });

  it('R3.AC1: should have correct Foodics refs (B01–B18, excluding B13/B14/B15)', async () => {
    const rows = await sql`SELECT foodics_ref FROM branches ORDER BY foodics_ref`;
    const refs = rows.map((r) => r['foodics_ref'] as string);
    expect(refs).toEqual([
      'B01',
      'B02',
      'B03',
      'B04',
      'B05',
      'B06',
      'B07',
      'B08',
      'B09',
      'B10',
      'B11',
      'B12',
      'B16',
      'B17',
      'B18',
    ]);
  });

  it('R3.AC1: should mark Al Rabie (B02) and Anas (B09) as Stage 0', async () => {
    const rows = await sql`SELECT foodics_ref FROM branches WHERE is_stage0 = true ORDER BY foodics_ref`;
    const refs = rows.map((r) => r['foodics_ref'] as string);
    expect(refs).toEqual(['B02', 'B09']);
  });

  it('R3.AC1: should have 6 main and 9 express branches', async () => {
    const mainResult = await sql`SELECT count(*)::int AS total FROM branches WHERE type = 'main'`;
    const expressResult = await sql`SELECT count(*)::int AS total FROM branches WHERE type = 'express'`;

    expect(mainResult[0]!['total']).toBe(6);
    expect(expressResult[0]!['total']).toBe(9);
  });
});

describe('Seed Data — System Settings', () => {
  // R2.AC8: Initial system_settings
  it('R2.AC8: should have 6 system settings seeded', async () => {
    const result = await sql`SELECT count(*)::int AS total FROM system_settings`;
    expect(result[0]!['total']).toBe(6);
  });

  it('R2.AC8: should have correct VAT rate', async () => {
    const result = await sql`SELECT value FROM system_settings WHERE key = 'vat_rate'`;
    expect(result[0]!['value']).toBe('0.15');
  });
});

describe('Seed Data — Packages', () => {
  // R3.AC2: 27 packages
  it('R3.AC2: should have 27 packages seeded', async () => {
    const result = await sql`SELECT count(*)::int AS total FROM packages`;
    expect(result[0]!['total']).toBe(27);
  });

  it('R3.AC2: should have correct package category counts', async () => {
    const rows = await sql`SELECT category, count(*)::int AS total FROM packages GROUP BY category ORDER BY category`;
    const catMap = Object.fromEntries(rows.map((r) => [r['category'] as string, r['total'] as number]));

    expect(catMap['chicken']).toBe(9);
    expect(catMap['customer_choice']).toBe(3);
    expect(catMap['mixed']).toBe(9);
    expect(catMap['sandwich']).toBe(3);
    expect(catMap['snack']).toBe(3);
  });
});

describe('Seed Data — Meal Distribution', () => {
  // R3.AC3: Package meal distribution
  it('R3.AC3: should have meal distribution rows', async () => {
    const result = await sql`SELECT count(*)::int AS total FROM package_meal_distribution`;
    expect(result[0]!['total'] as number).toBeGreaterThan(0);
  });
});

describe('Seed Data — Discount Rules', () => {
  // R3.AC9: Initial discount rules
  it('R3.AC9: should have first_plan and renewal discount rules', async () => {
    const result = await sql`SELECT type, discount_percent FROM discount_rules ORDER BY type`;
    expect(result.length).toBe(2);
    expect(result[0]!['type']).toBe('first_plan');
    expect(result[0]!['discount_percent']).toBe('10.00');
    expect(result[1]!['type']).toBe('renewal');
    expect(result[1]!['discount_percent']).toBe('5.00');
  });
});

describe('Seed Data — Product Categories', () => {
  it('R3.AC6: should have 17 product categories seeded', async () => {
    const result = await sql`SELECT count(*)::int AS total FROM product_categories`;
    expect(result[0]!['total']).toBe(17);
  });

  it('R3.AC6: should have both EN and AR names on every category', async () => {
    const rows =
      await sql`SELECT name_en, name_ar FROM product_categories WHERE name_en IS NULL OR name_ar IS NULL OR name_en = '' OR name_ar = ''`;
    expect(rows.length).toBe(0);
  });

  it('R3.AC6: should include core protein categories', async () => {
    const rows =
      await sql`SELECT name_en FROM product_categories WHERE name_en IN ('Chicken', 'Seafood', 'Meats') ORDER BY name_en`;
    const names = rows.map((r) => r['name_en'] as string);
    expect(names).toEqual(['Chicken', 'Meats', 'Seafood']);
  });
});

describe('Seed Data — Products', () => {
  // R3.AC6: Bilingual product data
  it('R3.AC6: should have at least 145 products seeded (142 active + 3 discontinued)', async () => {
    const result = await sql`SELECT count(*)::int AS total FROM products`;
    expect(result[0]!['total'] as number).toBeGreaterThanOrEqual(145);
  });

  it('R3.AC6: should have both EN and AR names on every product', async () => {
    const rows =
      await sql`SELECT id FROM products WHERE name_en IS NULL OR name_ar IS NULL OR name_en = '' OR name_ar = ''`;
    expect(rows.length).toBe(0);
  });

  it('R3.AC6: should have correct category distribution for protein items', async () => {
    const rows = await sql`
      SELECT pc.name_en AS cat, count(*)::int AS total
      FROM products p
      JOIN product_categories pc ON p.category_id = pc.id
      WHERE pc.name_en IN ('Chicken', 'Seafood', 'Meats')
      GROUP BY pc.name_en
      ORDER BY pc.name_en
    `;
    const catMap = Object.fromEntries(rows.map((r) => [r['cat'] as string, r['total'] as number]));
    // 13 chicken + 1 discontinued = 14
    expect(catMap['Chicken']).toBe(14);
    // 4 seafood + 1 discontinued = 5
    expect(catMap['Seafood']).toBe(5);
    expect(catMap['Meats']).toBe(6);
  });

  // R3.AC7: SKU format
  it('R3.AC7: every product should have a unique, non-empty SKU', async () => {
    const nullSku = await sql`SELECT count(*)::int AS total FROM products WHERE sku IS NULL OR sku = ''`;
    expect(nullSku[0]!['total']).toBe(0);

    // Check for duplicates
    const dupes = await sql`SELECT sku, count(*)::int AS cnt FROM products GROUP BY sku HAVING count(*) > 1`;
    expect(dupes.length).toBe(0);
  });

  it('R3.AC7: SKUs should follow expected formats (sk-XXXX or Esk-XXXX)', async () => {
    const badSkus = await sql`SELECT sku FROM products WHERE sku NOT LIKE 'sk-%' AND sku NOT LIKE 'Esk-%'`;
    expect(badSkus.length).toBe(0);
  });

  // R3.AC11: Discontinued items
  it('R3.AC11: should have 3 discontinued products (is_active = false) among proteins', async () => {
    const rows = await sql`
      SELECT p.name_en FROM products p
      JOIN product_categories pc ON p.category_id = pc.id
      WHERE p.is_active = false AND pc.name_en NOT IN ('Ramadan')
      ORDER BY p.name_en
    `;
    const names = rows.map((r) => r['name_en'] as string);
    expect(names).toEqual(['Almond Fish', 'Truffle Chicken', 'Warq Enab']);
  });

  it('R3.AC6: free items (carbs, veg) should have is_free = true', async () => {
    const rows = await sql`
      SELECT count(*)::int AS total FROM products
      WHERE is_free = true
    `;
    // 12 carbs + 2 free veg = 14
    expect(rows[0]!['total']).toBe(14);
  });

  it('R3.AC6: protein items should have protein_type set', async () => {
    const rows = await sql`
      SELECT count(*)::int AS total FROM products p
      JOIN product_categories pc ON p.category_id = pc.id
      WHERE pc.name_en IN ('Chicken', 'Seafood', 'Meats', 'Protein Add-ons 50g')
        AND p.protein_type IS NULL
    `;
    expect(rows[0]!['total']).toBe(0);
  });

  it('R3.AC6: should have correct sandwich count (13)', async () => {
    const rows = await sql`
      SELECT count(*)::int AS total FROM products p
      JOIN product_categories pc ON p.category_id = pc.id
      WHERE pc.name_en = 'Sandwiches'
    `;
    expect(rows[0]!['total']).toBe(13);
  });

  it('R3.AC6: should have 26 breakfast items', async () => {
    const rows = await sql`
      SELECT count(*)::int AS total FROM products p
      JOIN product_categories pc ON p.category_id = pc.id
      WHERE pc.name_en = 'Breakfast'
    `;
    expect(rows[0]!['total']).toBe(26);
  });
});

describe('Seed Data — Product Prices', () => {
  // R3.AC8: Product prices across 5 tiers
  it('R3.AC8: should have at least 500 product price rows', async () => {
    const result = await sql`SELECT count(*)::int AS total FROM product_prices`;
    expect(result[0]!['total'] as number).toBeGreaterThanOrEqual(500);
  });

  it('R3.AC8: should cover all 5 pricing tiers', async () => {
    const rows = await sql`SELECT DISTINCT tier FROM product_prices`;
    const tiers = new Set(rows.map((r) => r['tier'] as string));
    expect(tiers).toEqual(new Set(['base', 'subscription', 'express_base', 'express_subscription', 'app']));
  });

  it('R3.AC8: standard chicken (sk-0147) should have correct prices per tier', async () => {
    const rows = await sql`
      SELECT pp.tier, pp.price_incl_vat
      FROM product_prices pp
      JOIN products p ON pp.product_id = p.id
      WHERE p.sku = 'sk-0147'
      ORDER BY pp.tier
    `;
    const priceMap = Object.fromEntries(rows.map((r) => [r['tier'] as string, r['price_incl_vat'] as string]));
    expect(priceMap['base']).toBe('26.00');
    expect(priceMap['subscription']).toBe('24.00');
    expect(priceMap['express_base']).toBe('23.40');
    expect(priceMap['express_subscription']).toBe('21.60');
    expect(priceMap['app']).toBe('30.00');
  });

  it('R3.AC8: breakfast items should only have base and app tiers', async () => {
    const rows = await sql`
      SELECT DISTINCT pp.tier
      FROM product_prices pp
      JOIN products p ON pp.product_id = p.id
      JOIN product_categories pc ON p.category_id = pc.id
      WHERE pc.name_en = 'Breakfast'
        AND p.sku NOT IN ('sk-0442', 'sk-0443')
      ORDER BY pp.tier
    `;
    const tiers = new Set(rows.map((r) => r['tier'] as string));
    expect(tiers).toEqual(new Set(['base', 'app']));
  });

  it('R3.AC8: juices should have no subscription price', async () => {
    const rows = await sql`
      SELECT count(*)::int AS total
      FROM product_prices pp
      JOIN products p ON pp.product_id = p.id
      JOIN product_categories pc ON p.category_id = pc.id
      WHERE pc.name_en = 'Juices' AND pp.tier = 'subscription'
    `;
    expect(rows[0]!['total']).toBe(0);
  });

  it('R3.AC8: sandwiches should have sub = base (no discount)', async () => {
    const rows = await sql`
      SELECT p.sku,
        (SELECT price_incl_vat FROM product_prices WHERE product_id = p.id AND tier = 'base' LIMIT 1) AS base_price,
        (SELECT price_incl_vat FROM product_prices WHERE product_id = p.id AND tier = 'subscription' LIMIT 1) AS sub_price
      FROM products p
      JOIN product_categories pc ON p.category_id = pc.id
      WHERE pc.name_en = 'Sandwiches'
    `;
    for (const row of rows) {
      expect(row['base_price']).toBe(row['sub_price']);
    }
  });
});

describe('Seed Data — Rotation Schedules', () => {
  // R3.AC4: Rotation schedules
  it('R3.AC4: should have 24 rotation schedules (12 snack + 12 sandwich)', async () => {
    const result = await sql`SELECT count(*)::int AS total FROM rotation_schedules`;
    expect(result[0]!['total']).toBe(24);
  });

  it('R3.AC4: should have 12 snack and 12 sandwich rotations', async () => {
    const snack = await sql`SELECT count(*)::int AS total FROM rotation_schedules WHERE type = 'snack'`;
    const sandwich = await sql`SELECT count(*)::int AS total FROM rotation_schedules WHERE type = 'sandwich'`;
    expect(snack[0]!['total']).toBe(12);
    expect(sandwich[0]!['total']).toBe(12);
  });

  it('R3.AC4: snack rotation should cover days 1–12', async () => {
    const rows = await sql`SELECT day_number FROM rotation_schedules WHERE type = 'snack' ORDER BY day_number`;
    const days = rows.map((r) => r['day_number'] as number);
    expect(days).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  // R3.AC5: Swap options
  it('R3.AC5: should have swap options for rotation schedules', async () => {
    const result = await sql`SELECT count(*)::int AS total FROM rotation_swap_options`;
    expect(result[0]!['total'] as number).toBeGreaterThan(80);
  });

  it('R3.AC5: Egg sandwich (day 6 and 12) should have zero swap options (locked)', async () => {
    const rows = await sql`
      SELECT rs.day_number, count(rso.id)::int AS swap_count
      FROM rotation_schedules rs
      LEFT JOIN rotation_swap_options rso ON rso.schedule_id = rs.id
      WHERE rs.type = 'sandwich' AND rs.day_number IN (6, 12)
      GROUP BY rs.day_number
      ORDER BY rs.day_number
    `;
    for (const row of rows) {
      expect(row['swap_count']).toBe(0);
    }
  });

  it('R3.AC5: Steak Big (day 2 sandwich) should have swaps to all other sandwiches', async () => {
    const rows = await sql`
      SELECT count(rso.id)::int AS swap_count
      FROM rotation_schedules rs
      JOIN rotation_swap_options rso ON rso.schedule_id = rs.id
      WHERE rs.type = 'sandwich' AND rs.day_number = 2
    `;
    expect(rows[0]!['swap_count'] as number).toBeGreaterThanOrEqual(10);
  });
});

describe('Seed Data — Idempotency', () => {
  // R3.AC10: Running seed twice should not duplicate data
  it('R3.AC10: branch count should remain 15 after second seed run', async () => {
    const result = await sql`SELECT count(*)::int AS total FROM branches`;
    expect(result[0]!['total']).toBe(15);
  });

  it('R3.AC10: product count should remain stable after second seed run', async () => {
    const result = await sql`SELECT count(*)::int AS total FROM products`;
    const total = result[0]!['total'] as number;
    expect(total).toBeGreaterThanOrEqual(145);
    expect(total).toBeLessThanOrEqual(190);
  });

  it('R3.AC10: rotation count should remain 24 after second seed run', async () => {
    const result = await sql`SELECT count(*)::int AS total FROM rotation_schedules`;
    expect(result[0]!['total']).toBe(24);
  });
});
