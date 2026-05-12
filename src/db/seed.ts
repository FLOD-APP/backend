import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import {
  branches,
  packages,
  packageMealDistribution,
  productCategories,
  products,
  productPrices,
  rotationSchedules,
  rotationSwapOptions,
  discountRules,
  systemSettings,
} from './schema.js';

async function main() {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    console.error('DATABASE_URL environment variable is required');
    process.exit(1);
  }

  const sql = postgres(databaseUrl, { max: 1 });
  const db = drizzle(sql);

  // ── System Settings ────────────────────────────────────
  console.log('Seeding system_settings...');
  await db
    .insert(systemSettings)
    .values([
      { key: 'vat_rate', value: '0.15', description: 'Saudi Arabia VAT rate' },
      { key: 'renewal_discount_percent', value: '5', description: 'Renewal discount percentage' },
      {
        key: 'renewal_discount_cutoff_days',
        value: '30',
        description: 'Max days since last subscription to qualify for renewal discount',
      },
      { key: 'first_plan_discount_percent', value: '10', description: 'First subscription discount percentage' },
      { key: 'delivery_fee_per_day', value: '12', description: 'Delivery fee per day in SAR' },
      { key: 'prices_include_vat', value: 'true', description: 'All prices in the system are VAT-inclusive' },
    ])
    .onConflictDoNothing();

  // ── Branches (15 permanent) ────────────────────────────
  console.log('Seeding branches...');
  await db
    .insert(branches)
    .values([
      { foodicsRef: 'B01', nameEn: 'Aljazera (Al Jazeera)', nameAr: 'الجزيرة', type: 'main' as const, isStage0: false },
      { foodicsRef: 'B02', nameEn: 'Rabie (Al Rabie)', nameAr: 'الربيع', type: 'main' as const, isStage0: true },
      {
        foodicsRef: 'B03',
        nameEn: 'Tatweer',
        nameAr: 'التطوير',
        type: 'express' as const,
        expressClassification: 'grab_and_go' as const,
        isStage0: false,
      },
      {
        foodicsRef: 'B04',
        nameEn: 'MoD (Ministry of Defence)',
        nameAr: 'وزارة الدفاع',
        type: 'express' as const,
        expressClassification: 'grab_and_go' as const,
        isStage0: false,
      },
      { foodicsRef: 'B05', nameEn: 'Turkey (Turki)', nameAr: 'تركي', type: 'main' as const, isStage0: false },
      { foodicsRef: 'B06', nameEn: 'Osman (Othman)', nameAr: 'عثمان', type: 'main' as const, isStage0: false },
      {
        foodicsRef: 'B07',
        nameEn: 'Riyadh Bank KAFD',
        nameAr: 'بنك الرياض كافد',
        type: 'express' as const,
        expressClassification: 'buffet' as const,
        isStage0: false,
      },
      {
        foodicsRef: 'B08',
        nameEn: 'Albilad (Bank Albilad)',
        nameAr: 'بنك البلاد',
        type: 'express' as const,
        expressClassification: 'buffet' as const,
        isStage0: false,
      },
      {
        foodicsRef: 'B09',
        nameEn: 'Anas (Anas Bin Malik)',
        nameAr: 'أنس بن مالك',
        type: 'main' as const,
        isStage0: true,
      },
      {
        foodicsRef: 'B10',
        nameEn: 'Tadawul',
        nameAr: 'تداول',
        type: 'express' as const,
        expressClassification: 'grab_and_go' as const,
        isStage0: false,
      },
      { foodicsRef: 'B11', nameEn: 'Quds (Al Quds)', nameAr: 'القدس', type: 'main' as const, isStage0: false },
      {
        foodicsRef: 'B12',
        nameEn: 'Saudi Investment Bank',
        nameAr: 'البنك السعودي للاستثمار',
        type: 'express' as const,
        expressClassification: 'buffet' as const,
        isStage0: false,
      },
      {
        foodicsRef: 'B16',
        nameEn: 'ZATCA',
        nameAr: 'هيئة الزكاة',
        type: 'express' as const,
        expressClassification: 'grab_and_go' as const,
        isStage0: false,
      },
      {
        foodicsRef: 'B17',
        nameEn: 'Murabba',
        nameAr: 'المربع',
        type: 'express' as const,
        expressClassification: 'grab_and_go' as const,
        isStage0: false,
      },
      {
        foodicsRef: 'B18',
        nameEn: 'Expo',
        nameAr: 'إكسبو',
        type: 'express' as const,
        expressClassification: 'grab_and_go' as const,
        isStage0: false,
      },
    ])
    .onConflictDoNothing();

  // ── Product Categories (19 from price list) ───────────
  console.log('Seeding product_categories...');
  const categoryRows = [
    { nameEn: 'Chicken', nameAr: 'الدجاج', sortOrder: 1, inSubscription: true },
    { nameEn: 'Seafood', nameAr: 'البحريات', sortOrder: 2, inSubscription: true },
    { nameEn: 'Meats', nameAr: 'اللحوم', sortOrder: 3, inSubscription: true },
    { nameEn: 'Sandwiches', nameAr: 'الساندوتش', sortOrder: 4, inSubscription: true },
    { nameEn: 'Soups', nameAr: 'الشوربة', sortOrder: 5, inSubscription: true },
    { nameEn: 'Sauces', nameAr: 'الصوصات', sortOrder: 6, inSubscription: false },
    { nameEn: 'Juices', nameAr: 'العصائر', sortOrder: 7, inSubscription: false },
    { nameEn: 'Side Dishes', nameAr: 'الأطباق الجانبية', sortOrder: 8, inSubscription: true },
    { nameEn: 'Salads', nameAr: 'سلطات', sortOrder: 9, inSubscription: true },
    { nameEn: 'Desserts', nameAr: 'حلا', sortOrder: 10, inSubscription: true },
    { nameEn: 'Beverages', nameAr: 'المشروبات', sortOrder: 11, inSubscription: false },
    { nameEn: 'Breakfast', nameAr: 'الفطور', sortOrder: 12, inSubscription: false },
    { nameEn: 'Ramadan', nameAr: 'منتجات رمضان', sortOrder: 13, inSubscription: false },
    { nameEn: 'Carb 150g', nameAr: 'كارب 150 جم', sortOrder: 14, inSubscription: true },
    { nameEn: 'Vegetables', nameAr: 'خضار', sortOrder: 15, inSubscription: true },
    { nameEn: 'Protein Add-ons 50g', nameAr: 'بروتين إضافي 50 جم', sortOrder: 16, inSubscription: true },
    { nameEn: 'Carb Add-ons 50g', nameAr: 'كارب إضافي 50 جم', sortOrder: 17, inSubscription: true },
  ];
  await db.insert(productCategories).values(categoryRows).onConflictDoNothing();

  // ── Products (186 items) ──────────────────────────────
  console.log('Seeding products...');
  // Look up category IDs
  const cats = await sql`SELECT id, name_en FROM product_categories`;
  function catId(nameEn: string): string {
    const row = cats.find((c) => c['name_en'] === nameEn);
    if (!row) throw new Error(`Category not found: ${nameEn}`);
    return row['id'] as string;
  }

  type ProductRow = typeof products.$inferInsert;
  const productRows: ProductRow[] = [
    // ── Chicken (13) ───────────────────────────────────────
    {
      categoryId: catId('Chicken'),
      sku: 'sk-0147',
      nameEn: 'Flod Chicken',
      nameAr: 'فلود دجاج',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Chicken'),
      sku: 'sk-0148',
      nameEn: 'Sweet & Sour Chicken',
      nameAr: 'دجاج حامض حلو',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Chicken'),
      sku: 'sk-0150',
      nameEn: 'Grilled Chicken',
      nameAr: 'دجاج مشوي',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Chicken'),
      sku: 'sk-0173',
      nameEn: 'Indian Chicken',
      nameAr: 'دجاج هندي',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Chicken'),
      sku: 'sk-0338',
      nameEn: 'Ginger Chicken',
      nameAr: 'دجاج بالزنجبيل',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Chicken'),
      sku: 'sk-0354',
      nameEn: 'Green Curry Chicken',
      nameAr: 'دجاج كاري أخضر',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Chicken'),
      sku: 'sk-0355',
      nameEn: 'Red Curry Chicken',
      nameAr: 'دجاج كاري أحمر',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Chicken'),
      sku: 'sk-0386',
      nameEn: 'Spicy Chicken',
      nameAr: 'دجاج حار',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Chicken'),
      sku: 'sk-0387',
      nameEn: 'Barbecue Chicken',
      nameAr: 'دجاج باربكيو',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Chicken'),
      sku: 'sk-0451',
      nameEn: 'Chicken Szechuan',
      nameAr: 'دجاج سيشوان',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Chicken'),
      sku: 'sk-0530',
      nameEn: 'Szechuan w/ Noodles',
      nameAr: 'سيشوان مع نودلز',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Chicken'),
      sku: 'sk-0533',
      nameEn: 'S&S w/ Noodles',
      nameAr: 'حامض حلو مع نودلز',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Chicken'),
      sku: 'sk-0549',
      nameEn: 'Chicken Strips Meal',
      nameAr: 'وجبة ستربس دجاج',
      proteinType: 'chicken',
    },

    // ── Seafood (4) ────────────────────────────────────────
    {
      categoryId: catId('Seafood'),
      sku: 'sk-0155',
      nameEn: 'Grilled Salmon',
      nameAr: 'سلمون مشوي',
      proteinType: 'salmon',
    },
    {
      categoryId: catId('Seafood'),
      sku: 'sk-0156',
      nameEn: 'Salmon Lemon Sauce',
      nameAr: 'سلمون صوص ليمون',
      proteinType: 'salmon',
    },
    {
      categoryId: catId('Seafood'),
      sku: 'sk-0153',
      nameEn: 'Pesto Shrimp',
      nameAr: 'ربيان بستو',
      proteinType: 'shrimp',
    },
    {
      categoryId: catId('Seafood'),
      sku: 'sk-0154',
      nameEn: 'Sweet & Sour Fillet',
      nameAr: 'فيليه حامض حلو',
      proteinType: 'almond_fish',
    },

    // ── Meats (6) ──────────────────────────────────────────
    { categoryId: catId('Meats'), sku: 'sk-0151', nameEn: 'Beef Sizzling', nameAr: 'لحم سيزلينق', proteinType: 'beef' },
    { categoryId: catId('Meats'), sku: 'sk-0152', nameEn: 'Flod Steak', nameAr: 'ستيك فلود', proteinType: 'beef' },
    { categoryId: catId('Meats'), sku: 'sk-0375', nameEn: 'Beef Radish', nameAr: 'لحم بالفجل', proteinType: 'beef' },
    { categoryId: catId('Meats'), sku: 'sk-0377', nameEn: 'Beef Burger', nameAr: 'برقر لحم', proteinType: 'beef' },
    {
      categoryId: catId('Meats'),
      sku: 'sk-0532',
      nameEn: 'Beef Sizzling w/ Noodles',
      nameAr: 'لحم سيزلينق مع نودلز',
      proteinType: 'beef',
    },
    {
      categoryId: catId('Meats'),
      sku: 'sk-0541',
      nameEn: 'Flod Chilli Beef',
      nameAr: 'لحم فلود تشيلي',
      proteinType: 'beef',
    },

    // ── Sandwiches (13) ────────────────────────────────────
    { categoryId: catId('Sandwiches'), sku: 'sk-0358', nameEn: 'Caprese Big', nameAr: 'كابريزي كبير' },
    { categoryId: catId('Sandwiches'), sku: 'sk-0357', nameEn: 'Tuna Big', nameAr: 'تونا كبير' },
    { categoryId: catId('Sandwiches'), sku: 'sk-0356', nameEn: 'Club Big', nameAr: 'كلوب كبير' },
    { categoryId: catId('Sandwiches'), sku: 'sk-0359', nameEn: 'Chicken Pesto Big', nameAr: 'دجاج بستو كبير' },
    { categoryId: catId('Sandwiches'), sku: 'sk-0360', nameEn: 'Smoked Salmon Big', nameAr: 'سلمون مدخن كبير' },
    { categoryId: catId('Sandwiches'), sku: 'sk-0361', nameEn: 'Tuna Small', nameAr: 'تونا صغير' },
    { categoryId: catId('Sandwiches'), sku: 'sk-0362', nameEn: 'Club Small', nameAr: 'كلوب صغير' },
    { categoryId: catId('Sandwiches'), sku: 'sk-0364', nameEn: 'Smoked Salmon Small', nameAr: 'سلمون مدخن صغير' },
    { categoryId: catId('Sandwiches'), sku: 'sk-0365', nameEn: 'Egg Sandwich', nameAr: 'ساندوتش بيض' },
    { categoryId: catId('Sandwiches'), sku: 'sk-0366', nameEn: 'Halloumi Sandwich', nameAr: 'ساندوتش حلومي' },
    { categoryId: catId('Sandwiches'), sku: 'sk-0367', nameEn: 'Steak Big', nameAr: 'ستيك كبير' },
    {
      categoryId: catId('Sandwiches'),
      sku: 'sk-0552',
      nameEn: 'Chicken Strips Sandwich',
      nameAr: 'ساندوتش ستربس دجاج',
    },
    {
      categoryId: catId('Sandwiches'),
      sku: 'sk-0553',
      nameEn: 'Grilled Chicken Sandwich',
      nameAr: 'ساندوتش دجاج مشوي',
    },

    // ── Soups (4) ──────────────────────────────────────────
    { categoryId: catId('Soups'), sku: 'sk-0291', nameEn: 'Harira Soup', nameAr: 'شوربة حريرة' },
    { categoryId: catId('Soups'), sku: 'sk-0292', nameEn: 'Lentil Soup', nameAr: 'شوربة عدس' },
    { categoryId: catId('Soups'), sku: 'sk-0337', nameEn: 'Broccoli Soup', nameAr: 'شوربة بروكلي' },
    { categoryId: catId('Soups'), sku: 'sk-0371', nameEn: 'Veggie Sawa Soup', nameAr: 'شوربة خضار ساوا' },

    // ── Sauces (4) ─────────────────────────────────────────
    { categoryId: catId('Sauces'), sku: 'sk-sauce-rita', nameEn: 'Rita Sauce', nameAr: 'صوص ريتا' },
    { categoryId: catId('Sauces'), sku: 'sk-sauce-tahina', nameEn: 'Tahina Sauce', nameAr: 'صوص طحينة' },
    { categoryId: catId('Sauces'), sku: 'sk-sauce-dakos', nameEn: 'Dakos Sauce', nameAr: 'صوص داكوس' },
    { categoryId: catId('Sauces'), sku: 'sk-sauce-tapenade', nameEn: 'Tapenade Sauce', nameAr: 'صوص تابيناد' },

    // ── Juices (4) ─────────────────────────────────────────
    { categoryId: catId('Juices'), sku: 'sk-0333', nameEn: 'Beetroot Juice 250ml', nameAr: 'عصير شمندر 250 مل' },
    { categoryId: catId('Juices'), sku: 'sk-0334', nameEn: 'Orange Juice 250ml', nameAr: 'عصير برتقال 250 مل' },
    { categoryId: catId('Juices'), sku: 'sk-0335', nameEn: 'Red Apple Juice 250ml', nameAr: 'عصير تفاح أحمر 250 مل' },
    {
      categoryId: catId('Juices'),
      sku: 'sk-0373',
      nameEn: 'Orange Carrot Juice 250ml',
      nameAr: 'عصير برتقال جزر 250 مل',
    },

    // ── Side Dishes (3) ────────────────────────────────────
    { categoryId: catId('Side Dishes'), sku: 'sk-0340', nameEn: 'Okra', nameAr: 'بامية' },
    { categoryId: catId('Side Dishes'), sku: 'sk-0339', nameEn: 'Molokhia', nameAr: 'ملوخية' },
    { categoryId: catId('Side Dishes'), sku: 'sk-0342', nameEn: 'Steak Fries', nameAr: 'بطاطس ستيك' },

    // ── Salads (7) ─────────────────────────────────────────
    { categoryId: catId('Salads'), sku: 'sk-0293', nameEn: 'Green Salad', nameAr: 'سلطة خضرا' },
    { categoryId: catId('Salads'), sku: 'sk-0295', nameEn: 'Fruit Salad', nameAr: 'سلطة فواكه' },
    { categoryId: catId('Salads'), sku: 'sk-0296', nameEn: 'Fruit Sliced', nameAr: 'فواكه مقطعة' },
    { categoryId: catId('Salads'), sku: 'sk-0297', nameEn: 'Beetroot Salad', nameAr: 'سلطة شمندر' },
    { categoryId: catId('Salads'), sku: 'sk-0344', nameEn: 'Nicoise Salad', nameAr: 'سلطة نيسواز' },
    { categoryId: catId('Salads'), sku: 'sk-0383', nameEn: 'Diet Salad', nameAr: 'سلطة دايت' },
    { categoryId: catId('Salads'), sku: 'sk-0449', nameEn: 'Caesar Salad', nameAr: 'سلطة سيزر' },

    // ── Desserts (13) ──────────────────────────────────────
    { categoryId: catId('Desserts'), sku: 'sk-0294', nameEn: 'Oat Red Berry', nameAr: 'شوفان توت أحمر' },
    { categoryId: catId('Desserts'), sku: 'sk-0317', nameEn: 'Blueberry Cheesecake', nameAr: 'تشيزكيك بلوبيري' },
    { categoryId: catId('Desserts'), sku: 'sk-0318', nameEn: 'Tiramisu', nameAr: 'تيراميسو' },
    { categoryId: catId('Desserts'), sku: 'sk-0319', nameEn: 'Muffin Cake', nameAr: 'مافن كيك' },
    { categoryId: catId('Desserts'), sku: 'sk-0343', nameEn: 'Toffee Cake', nameAr: 'كيك توفي' },
    { categoryId: catId('Desserts'), sku: 'sk-0370', nameEn: 'Masoub', nameAr: 'معصوب' },
    { categoryId: catId('Desserts'), sku: 'sk-0381', nameEn: 'Eclair', nameAr: 'اكليرا' },
    { categoryId: catId('Desserts'), sku: 'sk-0385', nameEn: 'Protein Brownie', nameAr: 'براوني بروتين' },
    { categoryId: catId('Desserts'), sku: 'sk-0460', nameEn: 'Coco Strawberry', nameAr: 'كوكو فراولة' },
    { categoryId: catId('Desserts'), sku: 'sk-0523', nameEn: 'Creme Brulee', nameAr: 'كريم بروليه' },
    { categoryId: catId('Desserts'), sku: 'sk-0524', nameEn: 'Panna Cotta Espresso', nameAr: 'بانا كوتا اسبريسو' },
    { categoryId: catId('Desserts'), sku: 'sk-0550', nameEn: 'Choco Chips Cake', nameAr: 'كيك شوكو تسيبس' },
    { categoryId: catId('Desserts'), sku: 'sk-0551', nameEn: 'Home Granola', nameAr: 'جرانولا بالتوت الاحمر' },

    // ── Beverages (9) ──────────────────────────────────────
    { categoryId: catId('Beverages'), sku: 'sk-0001', nameEn: 'Pepsi Diet', nameAr: 'بيبسي دايت' },
    { categoryId: catId('Beverages'), sku: 'sk-0002', nameEn: '7 Up Diet', nameAr: 'سفن أب دايت' },
    { categoryId: catId('Beverages'), sku: 'sk-0157', nameEn: 'Protein Milk Nada', nameAr: 'حليب بروتين ندى' },
    { categoryId: catId('Beverages'), sku: 'sk-0199', nameEn: 'Cola Light', nameAr: 'كولا لايت' },
    { categoryId: catId('Beverages'), sku: 'sk-0332', nameEn: 'Laban', nameAr: 'لبن' },
    { categoryId: catId('Beverages'), sku: 'sk-0353', nameEn: 'Protein Yogurt Nada', nameAr: 'زبادي بروتين ندى' },
    { categoryId: catId('Beverages'), sku: 'sk-0397', nameEn: 'Water 330ml', nameAr: 'ماء 330 مل' },
    { categoryId: catId('Beverages'), sku: 'sk-0528', nameEn: 'Kinza Lemon', nameAr: 'كنزا ليمون' },
    { categoryId: catId('Beverages'), sku: 'sk-0529', nameEn: 'Kinza Diet Kola', nameAr: 'كنزا دايت كولا' },

    // ── Breakfast (26) ─────────────────────────────────────
    { categoryId: catId('Breakfast'), sku: 'sk-0427', nameEn: 'Crepe Halawa', nameAr: 'كريب حلاوة' },
    { categoryId: catId('Breakfast'), sku: 'sk-0428', nameEn: 'Crepe Nutella', nameAr: 'كريب نوتيلا' },
    { categoryId: catId('Breakfast'), sku: 'sk-0429', nameEn: 'Crepe Pistachio', nameAr: 'كريب فستق' },
    { categoryId: catId('Breakfast'), sku: 'sk-0430', nameEn: 'Crepe Peanut', nameAr: 'كريب فول سوداني' },
    { categoryId: catId('Breakfast'), sku: 'sk-0431', nameEn: 'Crepe Chicken', nameAr: 'كريب دجاج' },
    { categoryId: catId('Breakfast'), sku: 'sk-0432', nameEn: 'Crepe Cheese', nameAr: 'كريب جبن' },
    { categoryId: catId('Breakfast'), sku: 'sk-0433', nameEn: 'Smoked Turkey Crepe', nameAr: 'كريب ديك رومي مدخن' },
    { categoryId: catId('Breakfast'), sku: 'sk-0434', nameEn: 'Waffle Nutella', nameAr: 'وافل نوتيلا' },
    { categoryId: catId('Breakfast'), sku: 'sk-0435', nameEn: 'Waffle Pistachio', nameAr: 'وافل فستق' },
    { categoryId: catId('Breakfast'), sku: 'sk-0436', nameEn: 'Waffle Peanut', nameAr: 'وافل فول سوداني' },
    { categoryId: catId('Breakfast'), sku: 'sk-0437', nameEn: 'Waffle Syrup & Honey', nameAr: 'وافل شيرة وعسل' },
    { categoryId: catId('Breakfast'), sku: 'sk-0438', nameEn: 'Pancake Syrup & Honey', nameAr: 'بانكيك شيرة وعسل' },
    { categoryId: catId('Breakfast'), sku: 'sk-0439', nameEn: 'Pancake Nutella', nameAr: 'بانكيك نوتيلا' },
    { categoryId: catId('Breakfast'), sku: 'sk-0440', nameEn: 'Pancake Pistachio', nameAr: 'بانكيك فستق' },
    { categoryId: catId('Breakfast'), sku: 'sk-0441a', nameEn: 'Pancake Peanut', nameAr: 'بانكيك فول سوداني' },
    { categoryId: catId('Breakfast'), sku: 'sk-0350', nameEn: 'Oats Soup', nameAr: 'شوربة شوفان' },
    { categoryId: catId('Breakfast'), sku: 'sk-0349', nameEn: 'Oatmeal Fruits', nameAr: 'شوفان بالفواكه' },
    { categoryId: catId('Breakfast'), sku: 'sk-0348', nameEn: 'Oatmeal Oats', nameAr: 'شوفان' },
    { categoryId: catId('Breakfast'), sku: 'sk-0446', nameEn: 'Boiled Egg', nameAr: 'بيض مسلوق' },
    { categoryId: catId('Breakfast'), sku: 'sk-0441', nameEn: 'Omelette Egg', nameAr: 'بيض اومليت' },
    { categoryId: catId('Breakfast'), sku: 'sk-0441b', nameEn: 'Omelette Egg Avocado', nameAr: 'بيض اومليت أفوكادو' },
    { categoryId: catId('Breakfast'), sku: 'sk-0442', nameEn: 'Smoked Cold Cut Meal', nameAr: 'وجبة لحوم باردة مدخنة' },
    { categoryId: catId('Breakfast'), sku: 'sk-0443', nameEn: 'Mix Cheese Meal', nameAr: 'وجبة أجبان مشكلة' },
    { categoryId: catId('Breakfast'), sku: 'sk-0447', nameEn: 'Meat Mqlql', nameAr: 'مقلقل لحم' },
    { categoryId: catId('Breakfast'), sku: 'sk-0448', nameEn: 'Chicken Mqlql', nameAr: 'مقلقل دجاج' },
    { categoryId: catId('Breakfast'), sku: 'sk-0534', nameEn: 'Roast Beef Crepe', nameAr: 'كريب روست بيف' },

    // ── Ramadan (3) ────────────────────────────────────────
    {
      categoryId: catId('Ramadan'),
      sku: 'sk-0321',
      nameEn: 'Sambosa + Kebba',
      nameAr: 'سمبوسة + كبة',
      isActive: false,
    },
    { categoryId: catId('Ramadan'), sku: 'sk-0389', nameEn: 'Basbosa', nameAr: 'بسبوسة', isActive: false },
    {
      categoryId: catId('Ramadan'),
      sku: 'sk-0450',
      nameEn: 'Bancota Konafa',
      nameAr: 'بانكوتا كنافة',
      isActive: false,
    },

    // ── Carb 150g (12) — all free ──────────────────────────
    {
      categoryId: catId('Carb 150g'),
      sku: 'sk-0402',
      nameEn: 'Kabsa Rice 150g',
      nameAr: 'رز كبسة 150 جم',
      isFree: true,
    },
    {
      categoryId: catId('Carb 150g'),
      sku: 'sk-0403',
      nameEn: 'Fried Rice 150g',
      nameAr: 'رز مقلي 150 جم',
      isFree: true,
    },
    {
      categoryId: catId('Carb 150g'),
      sku: 'sk-0407',
      nameEn: 'White Rice 150g',
      nameAr: 'رز أبيض 150 جم',
      isFree: true,
    },
    {
      categoryId: catId('Carb 150g'),
      sku: 'sk-0408',
      nameEn: 'Biryani Rice 150g',
      nameAr: 'رز برياني 150 جم',
      isFree: true,
    },
    {
      categoryId: catId('Carb 150g'),
      sku: 'sk-0409',
      nameEn: 'Sayadia Rice 150g',
      nameAr: 'رز صيادية 150 جم',
      isFree: true,
    },
    { categoryId: catId('Carb 150g'), sku: 'sk-0413', nameEn: 'Without Carb', nameAr: 'بدون كارب', isFree: true },
    { categoryId: catId('Carb 150g'), sku: 'sk-0404', nameEn: 'Bourghol 150g', nameAr: 'برغل 150 جم', isFree: true },
    {
      categoryId: catId('Carb 150g'),
      sku: 'sk-0410',
      nameEn: 'Mash Chors 150g',
      nameAr: 'هريسة شورس 150 جم',
      isFree: true,
    },
    {
      categoryId: catId('Carb 150g'),
      sku: 'sk-0411',
      nameEn: 'Mash Potato 150g',
      nameAr: 'بطاطس مهروسة 150 جم',
      isFree: true,
    },
    {
      categoryId: catId('Carb 150g'),
      sku: 'sk-0412',
      nameEn: 'Sweet Potato 150g',
      nameAr: 'بطاطس حلوة 150 جم',
      isFree: true,
    },
    {
      categoryId: catId('Carb 150g'),
      sku: 'sk-0405',
      nameEn: 'Pink Pasta 150g',
      nameAr: 'باستا بينك 150 جم',
      isFree: true,
    },
    {
      categoryId: catId('Carb 150g'),
      sku: 'sk-0406',
      nameEn: 'Pesto Pasta 150g',
      nameAr: 'باستا بستو 150 جم',
      isFree: true,
    },

    // ── Vegetables (3) ─────────────────────────────────────
    { categoryId: catId('Vegetables'), sku: 'sk-0170', nameEn: 'Without Veg', nameAr: 'بدون خضار', isFree: true },
    {
      categoryId: catId('Vegetables'),
      sku: 'sk-0189',
      nameEn: 'Free Veg 50g',
      nameAr: 'خضار مجاني 50 جم',
      isFree: true,
    },
    { categoryId: catId('Vegetables'), sku: 'sk-0416', nameEn: 'Broccoli', nameAr: 'بروكلي' },

    // ── Protein Add-ons 50g (18) ───────────────────────────
    {
      categoryId: catId('Protein Add-ons 50g'),
      sku: 'sk-0526',
      nameEn: 'S&S Fillet Extra 50g',
      nameAr: 'فيليه حامض حلو إضافي 50 جم',
      proteinType: 'almond_fish',
    },
    {
      categoryId: catId('Protein Add-ons 50g'),
      sku: 'Esk-0182',
      nameEn: 'Pesto Shrimp Extra 50g',
      nameAr: 'ربيان بستو إضافي 50 جم',
      proteinType: 'shrimp',
    },
    {
      categoryId: catId('Protein Add-ons 50g'),
      sku: 'Esk-0181',
      nameEn: 'Salmon Lemon Extra 50g',
      nameAr: 'سلمون ليمون إضافي 50 جم',
      proteinType: 'salmon',
    },
    {
      categoryId: catId('Protein Add-ons 50g'),
      sku: 'Esk-0180',
      nameEn: 'Grilled Salmon Extra 50g',
      nameAr: 'سلمون مشوي إضافي 50 جم',
      proteinType: 'salmon',
    },
    {
      categoryId: catId('Protein Add-ons 50g'),
      sku: 'sk-0463',
      nameEn: 'Chicken Szechuan Extra 50g',
      nameAr: 'سيشوان دجاج إضافي 50 جم',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Protein Add-ons 50g'),
      sku: 'Esk-0147',
      nameEn: 'Flod Chicken Extra 50g',
      nameAr: 'فلود دجاج إضافي 50 جم',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Protein Add-ons 50g'),
      sku: 'Esk-0148',
      nameEn: 'S&S Chicken Extra 50g',
      nameAr: 'دجاج حامض حلو إضافي 50 جم',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Protein Add-ons 50g'),
      sku: 'Esk-0150',
      nameEn: 'Grilled Chicken Extra 50g',
      nameAr: 'دجاج مشوي إضافي 50 جم',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Protein Add-ons 50g'),
      sku: 'Esk-0173',
      nameEn: 'Indian Chicken Extra 50g',
      nameAr: 'دجاج هندي إضافي 50 جم',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Protein Add-ons 50g'),
      sku: 'Esk-0338',
      nameEn: 'Ginger Chicken Extra 50g',
      nameAr: 'دجاج زنجبيل إضافي 50 جم',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Protein Add-ons 50g'),
      sku: 'Esk-0354',
      nameEn: 'Green Curry Chicken Extra 50g',
      nameAr: 'كاري أخضر دجاج إضافي 50 جم',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Protein Add-ons 50g'),
      sku: 'Esk-0355',
      nameEn: 'Red Curry Chicken Extra 50g',
      nameAr: 'كاري أحمر دجاج إضافي 50 جم',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Protein Add-ons 50g'),
      sku: 'Esk-0386',
      nameEn: 'Spicy Chicken Extra 50g',
      nameAr: 'دجاج حار إضافي 50 جم',
      proteinType: 'chicken',
    },
    {
      categoryId: catId('Protein Add-ons 50g'),
      sku: 'sk-0543',
      nameEn: 'Flod Chilli Beef Extra 50g',
      nameAr: 'لحم تشيلي إضافي 50 جم',
      proteinType: 'beef',
    },
    {
      categoryId: catId('Protein Add-ons 50g'),
      sku: 'Esk-0375',
      nameEn: 'Beef Radish Extra 50g',
      nameAr: 'لحم فجل إضافي 50 جم',
      proteinType: 'beef',
    },
    {
      categoryId: catId('Protein Add-ons 50g'),
      sku: 'Esk-0152',
      nameEn: 'Flod Steak Extra 50g',
      nameAr: 'ستيك فلود إضافي 50 جم',
      proteinType: 'beef',
    },
    {
      categoryId: catId('Protein Add-ons 50g'),
      sku: 'Esk-0151',
      nameEn: 'Beef Sizzling Extra 50g',
      nameAr: 'لحم سيزلينق إضافي 50 جم',
      proteinType: 'beef',
    },
    {
      categoryId: catId('Protein Add-ons 50g'),
      sku: 'Esk-0387',
      nameEn: 'BBQ Chicken Extra 50g',
      nameAr: 'دجاج باربكيو إضافي 50 جم',
      proteinType: 'chicken',
    },

    // ── Carb Add-ons 50g (11) ──────────────────────────────
    {
      categoryId: catId('Carb Add-ons 50g'),
      sku: 'Esk-0407',
      nameEn: 'White Rice Extra 50g',
      nameAr: 'رز أبيض إضافي 50 جم',
    },
    {
      categoryId: catId('Carb Add-ons 50g'),
      sku: 'Esk-0408',
      nameEn: 'Biryani Rice Extra 50g',
      nameAr: 'رز برياني إضافي 50 جم',
    },
    {
      categoryId: catId('Carb Add-ons 50g'),
      sku: 'Esk-0409',
      nameEn: 'Sayadia Rice Extra 50g',
      nameAr: 'رز صيادية إضافي 50 جم',
    },
    {
      categoryId: catId('Carb Add-ons 50g'),
      sku: 'Esk-0402',
      nameEn: 'Kabsa Rice Extra 50g',
      nameAr: 'رز كبسة إضافي 50 جم',
    },
    {
      categoryId: catId('Carb Add-ons 50g'),
      sku: 'Esk-0403',
      nameEn: 'Fried Rice Extra 50g',
      nameAr: 'رز مقلي إضافي 50 جم',
    },
    {
      categoryId: catId('Carb Add-ons 50g'),
      sku: 'Esk-0404',
      nameEn: 'Bourghol Extra 50g',
      nameAr: 'برغل إضافي 50 جم',
    },
    {
      categoryId: catId('Carb Add-ons 50g'),
      sku: 'Esk-0411',
      nameEn: 'Mash Potato Extra 50g',
      nameAr: 'بطاطس مهروسة إضافي 50 جم',
    },
    {
      categoryId: catId('Carb Add-ons 50g'),
      sku: 'Esk-0411h',
      nameEn: 'Hollandes Potato Extra 50g',
      nameAr: 'بطاطس هولنديز إضافي 50 جم',
    },
    {
      categoryId: catId('Carb Add-ons 50g'),
      sku: 'Esk-0405',
      nameEn: 'Pink Pasta Extra 50g',
      nameAr: 'باستا بينك إضافي 50 جم',
    },
    {
      categoryId: catId('Carb Add-ons 50g'),
      sku: 'Esk-0406',
      nameEn: 'Pesto Pasta Extra 50g',
      nameAr: 'باستا بستو إضافي 50 جم',
    },
    {
      categoryId: catId('Carb Add-ons 50g'),
      sku: 'Esk-0410',
      nameEn: 'Mash Chors Extra 50g',
      nameAr: 'هريسة شورس إضافي 50 جم',
    },

    // ── Discontinued items (3) — from menu file cross-reference
    {
      categoryId: catId('Chicken'),
      sku: 'sk-disc-truffle',
      nameEn: 'Truffle Chicken',
      nameAr: 'دجاج ترافل',
      proteinType: 'chicken',
      isActive: false,
    },
    {
      categoryId: catId('Seafood'),
      sku: 'sk-disc-almond-fish',
      nameEn: 'Almond Fish',
      nameAr: 'سمك لوز',
      proteinType: 'almond_fish',
      isActive: false,
    },
    {
      categoryId: catId('Side Dishes'),
      sku: 'sk-disc-warq-enab',
      nameEn: 'Warq Enab',
      nameAr: 'ورق عنب',
      isActive: false,
    },
  ];
  await db.insert(products).values(productRows).onConflictDoNothing();
  console.log(`Seeded ${productRows.length} products`);

  // ── Product Prices (5 tiers) ─────────────────────────────
  console.log('Seeding product_prices...');
  const prods = await sql`SELECT id, sku FROM products`;
  function prodId(sku: string): string {
    const row = prods.find((p) => p['sku'] === sku);
    if (!row) throw new Error(`Product not found: ${sku}`);
    return row['id'] as string;
  }

  // Tiers: base, subscription, express_base, express_subscription, app
  // Prices are VAT-inclusive (all FLOD prices include 15% VAT)
  type PriceRow = typeof productPrices.$inferInsert;
  type Tier = 'base' | 'subscription' | 'express_base' | 'express_subscription' | 'app';

  // Helper: generate price rows from a compact spec
  // [sku, base, sub|null, express|null, expSub|null, app]
  // Uses a fixed effectiveFrom date so onConflictDoNothing() works across seed runs
  const SEED_EFFECTIVE_DATE = '2026-05-07'; // Date of Abu Talin's price list
  type PriceSpec = [string, number, number | null, number | null, number | null, number];
  function priceRows(specs: PriceSpec[]): PriceRow[] {
    const rows: PriceRow[] = [];
    for (const [sku, base, sub, express, expSub, app] of specs) {
      const pid = prodId(sku);
      const tiers: [Tier, number | null][] = [
        ['base', base],
        ['subscription', sub],
        ['express_base', express],
        ['express_subscription', expSub],
        ['app', app],
      ];
      for (const [tier, price] of tiers) {
        if (price != null) {
          rows.push({ productId: pid, tier, priceInclVat: price.toFixed(2), effectiveFrom: SEED_EFFECTIVE_DATE });
        }
      }
    }
    return rows;
  }

  const allPriceRows: PriceRow[] = [
    // ── Chicken (13) ──────────────────────────────────
    ...priceRows([
      ['sk-0147', 26, 24, 23.4, 21.6, 30],
      ['sk-0148', 26, 24, 23.4, 21.6, 30],
      ['sk-0150', 26, 24, 23.4, 21.6, 30],
      ['sk-0173', 26, 24, 23.4, 21.6, 30],
      ['sk-0338', 26, 24, 23.4, 21.6, 30],
      ['sk-0354', 26, 24, 23.4, 21.6, 30],
      ['sk-0355', 26, 24, 23.4, 21.6, 30],
      ['sk-0386', 26, 24, 23.4, 21.6, 30],
      ['sk-0387', 28, 24, 25.2, 21.6, 32],
      ['sk-0451', 28, 24, 25.2, 21.6, 32],
      ['sk-0530', 34, 34, 31.2, 31.2, 38],
      ['sk-0533', 32, 32, 29.4, 29.4, 36],
      ['sk-0549', 28, 24, 25.2, 21.6, 32],
    ]),
    // ── Seafood (4) ───────────────────────────────────
    ...priceRows([
      ['sk-0155', 44, 42, 39.6, 37.8, 49],
      ['sk-0156', 44, 42, 39.6, 37.8, 49],
      ['sk-0153', 39, 37, 35.1, 33.3, 44],
      ['sk-0154', 35, 33, 31.5, 29.7, 39],
    ]),
    // ── Meats (6) ─────────────────────────────────────
    ...priceRows([
      ['sk-0151', 36, 35, 32.4, 31.5, 41],
      ['sk-0152', 36, 35, 32.4, 31.5, 41],
      ['sk-0375', 36, 35, 32.4, 31.5, 41],
      ['sk-0377', 36, 36, null, null, 41], // No express
      ['sk-0532', 42, 42, 38.4, 37.8, 45],
      ['sk-0541', 38, 35, 34.2, 31.5, 43],
    ]),
    // ── Sandwiches (13) — sub = base (no discount) ───
    ...priceRows([
      ['sk-0358', 29, 29, 26.1, 29, 33],
      ['sk-0357', 28, 28, 25.2, 28, 32],
      ['sk-0356', 25, 25, 22.5, 25, 29],
      ['sk-0359', 27, 27, 22.5, 27, 31],
      ['sk-0360', 35, 35, 31.5, 35, 39],
      ['sk-0361', 16, 16, 12.6, 16, 20],
      ['sk-0362', 16, 16, 13.5, 16, 20],
      ['sk-0364', 20, 20, 16.2, 20, 24],
      ['sk-0365', 13, 13, 11.7, 13, 17],
      ['sk-0366', 17, 17, 14.4, 17, 21],
      ['sk-0367', 29, 29, 25.2, 29, 33],
      ['sk-0552', 20, 20, 18, 20, 24],
      ['sk-0553', 20, 20, 18, 20, 24],
    ]),
    // ── Soups (4) — sub all SAR 6, exp sub = base ────
    ...priceRows([
      ['sk-0291', 15, 6, 13.5, 15, 18],
      ['sk-0292', 9, 6, 8.1, 9, 12],
      ['sk-0337', 12, 6, 10.8, 12, 15],
      ['sk-0371', 12, 6, 10.8, 12, 15],
    ]),
    // ── Sauces (4) — uniform SAR 2, app SAR 3 ───────
    ...priceRows([
      ['sk-sauce-rita', 2, 2, 2, 2, 3],
      ['sk-sauce-tahina', 2, 2, 2, 2, 3],
      ['sk-sauce-dakos', 2, 2, 2, 2, 3],
      ['sk-sauce-tapenade', 2, 2, 2, 2, 3],
    ]),
    // ── Juices (4) — no subscription price ───────────
    ...priceRows([
      ['sk-0333', 15, null, 13.5, 15, 18],
      ['sk-0334', 14, null, 12.6, 14, 17],
      ['sk-0335', 14, null, 12.6, 14, 17],
      ['sk-0373', 14, null, 12.6, 14, 17],
    ]),
    // ── Side Dishes (3) ──────────────────────────────
    ...priceRows([
      ['sk-0340', 12, 12, 10.8, 10.8, 15],
      ['sk-0339', 9, 9, 8.1, 8.1, 12],
      ['sk-0342', 9, 9, 8.1, 8.1, 12],
    ]),
    // ── Salads (7) — some sub > base (intentional) ──
    ...priceRows([
      ['sk-0293', 9, 12, 8.1, 10.8, 13],
      ['sk-0295', 9, 12, 8.1, 10.8, 12],
      ['sk-0296', 14, 12, 12.6, 10.8, 18],
      ['sk-0297', 12, 12, 10.8, 10.8, 16],
      ['sk-0344', 18, 18, 16.2, 16.2, 22],
      ['sk-0383', 20, 20, 18, 18, 26],
      ['sk-0449', 29, 29, 26.1, 26.1, 35],
    ]),
    // ── Desserts (13) — some sub > base (averaging) ─
    ...priceRows([
      ['sk-0294', 12, 12, 10.8, 10.8, 16],
      ['sk-0317', 13, 12, 11.7, 10.8, 17],
      ['sk-0318', 13, 12, 11.7, 10.8, 17],
      ['sk-0319', 9, 12, 8.1, 10.8, 12],
      ['sk-0343', 12, 12, 10.8, 10.8, 16],
      ['sk-0370', 14, 14, 12.6, 12.6, 18],
      ['sk-0381', 15, 12, 13.5, 10.8, 19],
      ['sk-0385', 20, 20, 18, 18, 24],
      ['sk-0460', 18, 12, 16.2, 10.8, 22],
      ['sk-0523', 13, 12, 11.7, 10.8, 17],
      ['sk-0524', 9, 12, 8.1, 10.8, 13],
      ['sk-0550', 17, 12, 15.3, 10.8, 21],
      ['sk-0551', 17, 12, 15.3, 10.8, 21],
    ]),
    // ── Beverages (9) — most have no sub price ──────
    ...priceRows([
      ['sk-0001', 5, null, 4.5, null, 6], // Pepsi Diet — use max express price
      ['sk-0002', 5, null, 4.5, null, 6], // 7 Up Diet
      ['sk-0157', 7, 7, 7, null, 9], // Protein Milk Nada
      ['sk-0199', 5, null, 4.5, null, 6], // Cola Light
      ['sk-0332', 3, null, 3, null, 5], // Laban
      ['sk-0353', 7, 7, 7, null, 9], // Protein Yogurt Nada
      ['sk-0397', 1, 1, 1, null, 2], // Water 330ml
      ['sk-0528', 4, null, 4, null, 6], // Kinza Lemon
      ['sk-0529', 4, null, 4, null, 6], // Kinza Diet Kola
    ]),
    // ── Breakfast (26) — base + app only ────────────
    ...priceRows([
      ['sk-0427', 16, null, null, null, 19],
      ['sk-0428', 16, null, null, null, 19],
      ['sk-0429', 16, null, null, null, 19],
      ['sk-0430', 16, null, null, null, 19],
      ['sk-0431', 26, null, null, null, 29],
      ['sk-0432', 21, null, null, null, 24],
      ['sk-0433', 23, null, null, null, 26],
      ['sk-0434', 17, null, null, null, 20],
      ['sk-0435', 17, null, null, null, 20],
      ['sk-0436', 17, null, null, null, 20],
      ['sk-0437', 17, null, null, null, 20],
      ['sk-0438', 19, null, null, null, 22],
      ['sk-0439', 19, null, null, null, 22],
      ['sk-0440', 19, null, null, null, 22],
      ['sk-0441a', 19, null, null, null, 22],
      ['sk-0350', 9, null, null, null, 12],
      ['sk-0349', 15, null, null, null, 18],
      ['sk-0348', 12, null, null, null, 15],
      ['sk-0446', 10, null, null, null, 13],
      ['sk-0441', 11, null, null, null, 14],
      ['sk-0441b', 16, null, null, null, 19],
      ['sk-0442', 32, null, 28.8, null, 35], // Has express
      ['sk-0443', 29, null, 26.1, null, 32], // Has express
      ['sk-0447', 25, null, null, null, 28],
      ['sk-0448', 21, null, null, null, 24],
      ['sk-0534', 29, null, null, null, 32],
    ]),
    // ── Ramadan (3) ─────────────────────────────────
    ...priceRows([
      ['sk-0321', 10, 7, null, null, 13],
      ['sk-0389', 13, 13, null, null, 16],
      ['sk-0450', 13, 12, null, null, 16],
    ]),
    // ── Vegetables — only Broccoli has a price ──────
    ...priceRows([['sk-0416', 4, 4, 4, 4, 4]]),
    // ── Protein Add-ons 50g ─────────────────────────
    ...priceRows([
      ['sk-0526', 12, 12, 10.8, 10.8, 14],
      ['Esk-0182', 14, 14, 12.6, 12.6, 16],
      ['Esk-0181', 15, 15, 13.5, 13.5, 17],
      ['Esk-0180', 15, 15, 13.5, 13.5, 17],
      ['sk-0463', 9, 8, 8.1, 8.1, 11],
      ['Esk-0147', 8, 8, 7.2, 7.2, 10],
      ['Esk-0148', 8, 8, 7.2, 7.2, 10],
      ['Esk-0150', 8, 8, 7.2, 7.2, 10],
      ['Esk-0173', 8, 8, 7.2, 7.2, 10],
      ['Esk-0338', 8, 8, 7.2, 7.2, 10],
      ['Esk-0354', 8, 8, 7.2, 7.2, 10],
      ['Esk-0355', 8, 8, 7.2, 7.2, 10],
      ['Esk-0386', 8, 8, 7.2, 7.2, 10],
      ['sk-0543', 13, 12, 11.7, 11.7, 15],
      ['Esk-0375', 12, 12, 10.8, 10.8, 14],
      ['Esk-0152', 12, 12, 10.8, 10.8, 14],
      ['Esk-0151', 12, 12, 10.8, 10.8, 14],
      ['Esk-0387', 8, 8, 7.2, 7.2, 10],
    ]),
    // ── Carb Add-ons 50g ────────────────────────────
    // Rice varieties: 2/2/1.8/1.8/4
    ...priceRows([
      ['Esk-0407', 2, 2, 1.8, 1.8, 4],
      ['Esk-0408', 2, 2, 1.8, 1.8, 4],
      ['Esk-0409', 2, 2, 1.8, 1.8, 4],
      ['Esk-0402', 2, 2, 1.8, 1.8, 4],
      ['Esk-0403', 2, 2, 1.8, 1.8, 4],
      ['Esk-0404', 2, 2, 1.8, 1.8, 4],
    ]),
    // Potato varieties: 3/2/2.7/2.7/5
    ...priceRows([
      ['Esk-0411', 3, 2, 2.7, 2.7, 5],
      ['Esk-0411h', 3, 2, 2.7, 2.7, 5],
    ]),
    // Pasta + Mash Chors: 4/2/3.6/3.6/6
    ...priceRows([
      ['Esk-0405', 4, 2, 3.6, 3.6, 6],
      ['Esk-0406', 4, 2, 3.6, 3.6, 6],
      ['Esk-0410', 4, 2, 3.6, 3.6, 6],
    ]),
  ];

  // Check if prices already exist (idempotency — unique constraint doesn't handle NULL branchId)
  const existingPriceCount =
    await sql`SELECT count(*)::int AS total FROM product_prices WHERE effective_from = ${SEED_EFFECTIVE_DATE}`;
  if ((existingPriceCount[0]!['total'] as number) === 0) {
    // Insert in batches of 100 to avoid hitting Postgres parameter limit
    for (let i = 0; i < allPriceRows.length; i += 100) {
      const batch = allPriceRows.slice(i, i + 100);
      await db.insert(productPrices).values(batch).onConflictDoNothing();
    }
  }
  console.log(`Seeded ${allPriceRows.length} product prices`);

  // ── Packages (27 rows) ─────────────────────────────────
  console.log('Seeding packages...');
  type PkgRow = typeof packages.$inferInsert;
  const pkgRows: PkgRow[] = [
    // 1-Meal Mixed × 3 durations
    {
      category: 'mixed',
      nameEn: '1 Meal Mixed',
      nameAr: '١ وجبة متنوع',
      mealsPerDay: 1,
      durationDays: 12,
      totalMeals: 12,
      priceInclVat: '370.00',
      sortOrder: 1,
    },
    {
      category: 'mixed',
      nameEn: '1 Meal Mixed',
      nameAr: '١ وجبة متنوع',
      mealsPerDay: 1,
      durationDays: 18,
      totalMeals: 18,
      priceInclVat: '552.00',
      sortOrder: 2,
    },
    {
      category: 'mixed',
      nameEn: '1 Meal Mixed',
      nameAr: '١ وجبة متنوع',
      mealsPerDay: 1,
      durationDays: 24,
      totalMeals: 24,
      priceInclVat: '740.00',
      sortOrder: 3,
    },
    // 1-Meal Chicken × 3
    {
      category: 'chicken',
      nameEn: '1 Meal Chicken',
      nameAr: '١ وجبة دجاج',
      mealsPerDay: 1,
      durationDays: 12,
      totalMeals: 12,
      priceInclVat: '288.00',
      sortOrder: 4,
    },
    {
      category: 'chicken',
      nameEn: '1 Meal Chicken',
      nameAr: '١ وجبة دجاج',
      mealsPerDay: 1,
      durationDays: 18,
      totalMeals: 18,
      priceInclVat: '432.00',
      sortOrder: 5,
    },
    {
      category: 'chicken',
      nameEn: '1 Meal Chicken',
      nameAr: '١ وجبة دجاج',
      mealsPerDay: 1,
      durationDays: 24,
      totalMeals: 24,
      priceInclVat: '576.00',
      sortOrder: 6,
    },
    // 2-Meal Mixed × 3
    {
      category: 'mixed',
      nameEn: '2 Meal Mixed',
      nameAr: '٢ وجبة متنوع',
      mealsPerDay: 2,
      durationDays: 12,
      totalMeals: 24,
      priceInclVat: '720.00',
      sortOrder: 7,
    },
    {
      category: 'mixed',
      nameEn: '2 Meal Mixed',
      nameAr: '٢ وجبة متنوع',
      mealsPerDay: 2,
      durationDays: 18,
      totalMeals: 36,
      priceInclVat: '1079.00',
      sortOrder: 8,
    },
    {
      category: 'mixed',
      nameEn: '2 Meal Mixed',
      nameAr: '٢ وجبة متنوع',
      mealsPerDay: 2,
      durationDays: 24,
      totalMeals: 48,
      priceInclVat: '1440.00',
      sortOrder: 9,
    },
    // 2-Meal Chicken × 3
    {
      category: 'chicken',
      nameEn: '2 Meal Chicken',
      nameAr: '٢ وجبة دجاج',
      mealsPerDay: 2,
      durationDays: 12,
      totalMeals: 24,
      priceInclVat: '576.00',
      sortOrder: 10,
    },
    {
      category: 'chicken',
      nameEn: '2 Meal Chicken',
      nameAr: '٢ وجبة دجاج',
      mealsPerDay: 2,
      durationDays: 18,
      totalMeals: 36,
      priceInclVat: '864.00',
      sortOrder: 11,
    },
    {
      category: 'chicken',
      nameEn: '2 Meal Chicken',
      nameAr: '٢ وجبة دجاج',
      mealsPerDay: 2,
      durationDays: 24,
      totalMeals: 48,
      priceInclVat: '1152.00',
      sortOrder: 12,
    },
    // 3-Meal Mixed × 3
    {
      category: 'mixed',
      nameEn: '3 Meal Mixed',
      nameAr: '٣ وجبة متنوع',
      mealsPerDay: 3,
      durationDays: 12,
      totalMeals: 36,
      priceInclVat: '1063.00',
      sortOrder: 13,
    },
    {
      category: 'mixed',
      nameEn: '3 Meal Mixed',
      nameAr: '٣ وجبة متنوع',
      mealsPerDay: 3,
      durationDays: 18,
      totalMeals: 54,
      priceInclVat: '1601.00',
      sortOrder: 14,
    },
    {
      category: 'mixed',
      nameEn: '3 Meal Mixed',
      nameAr: '٣ وجبة متنوع',
      mealsPerDay: 3,
      durationDays: 24,
      totalMeals: 72,
      priceInclVat: '2126.00',
      sortOrder: 15,
    },
    // 3-Meal Chicken × 3
    {
      category: 'chicken',
      nameEn: '3 Meal Chicken',
      nameAr: '٣ وجبة دجاج',
      mealsPerDay: 3,
      durationDays: 12,
      totalMeals: 36,
      priceInclVat: '864.00',
      sortOrder: 16,
    },
    {
      category: 'chicken',
      nameEn: '3 Meal Chicken',
      nameAr: '٣ وجبة دجاج',
      mealsPerDay: 3,
      durationDays: 18,
      totalMeals: 54,
      priceInclVat: '1296.00',
      sortOrder: 17,
    },
    {
      category: 'chicken',
      nameEn: '3 Meal Chicken',
      nameAr: '٣ وجبة دجاج',
      mealsPerDay: 3,
      durationDays: 24,
      totalMeals: 72,
      priceInclVat: '1728.00',
      sortOrder: 18,
    },
    // Snack × 3
    {
      category: 'snack',
      nameEn: 'Snack Mixed',
      nameAr: 'سناك متنوع',
      mealsPerDay: 1,
      durationDays: 12,
      totalMeals: 12,
      priceInclVat: '158.00',
      sortOrder: 19,
    },
    {
      category: 'snack',
      nameEn: 'Snack Mixed',
      nameAr: 'سناك متنوع',
      mealsPerDay: 1,
      durationDays: 18,
      totalMeals: 18,
      priceInclVat: '224.00',
      sortOrder: 20,
    },
    {
      category: 'snack',
      nameEn: 'Snack Mixed',
      nameAr: 'سناك متنوع',
      mealsPerDay: 1,
      durationDays: 24,
      totalMeals: 24,
      priceInclVat: '316.00',
      sortOrder: 21,
    },
    // Sandwich × 3
    {
      category: 'sandwich',
      nameEn: 'Sandwich Mixed',
      nameAr: 'ساندوتش متنوع',
      mealsPerDay: 1,
      durationDays: 12,
      totalMeals: 12,
      priceInclVat: '240.00',
      sortOrder: 22,
    },
    {
      category: 'sandwich',
      nameEn: 'Sandwich Mixed',
      nameAr: 'ساندوتش متنوع',
      mealsPerDay: 1,
      durationDays: 18,
      totalMeals: 18,
      priceInclVat: '362.00',
      sortOrder: 23,
    },
    {
      category: 'sandwich',
      nameEn: 'Sandwich Mixed',
      nameAr: 'ساندوتش متنوع',
      mealsPerDay: 1,
      durationDays: 24,
      totalMeals: 24,
      priceInclVat: '480.00',
      sortOrder: 24,
    },
    // Customer Choice × 3 (placeholder pricing — BL-059 needs manual pricing)
    {
      category: 'customer_choice',
      nameEn: 'Customer Choice',
      nameAr: 'اختيار العميل',
      mealsPerDay: 1,
      durationDays: 12,
      totalMeals: 12,
      priceInclVat: '0.00',
      sortOrder: 25,
      isActive: false,
    },
    {
      category: 'customer_choice',
      nameEn: 'Customer Choice',
      nameAr: 'اختيار العميل',
      mealsPerDay: 1,
      durationDays: 18,
      totalMeals: 18,
      priceInclVat: '0.00',
      sortOrder: 26,
      isActive: false,
    },
    {
      category: 'customer_choice',
      nameEn: 'Customer Choice',
      nameAr: 'اختيار العميل',
      mealsPerDay: 1,
      durationDays: 24,
      totalMeals: 24,
      priceInclVat: '0.00',
      sortOrder: 27,
      isActive: false,
    },
  ];
  await db.insert(packages).values(pkgRows).onConflictDoNothing();

  // ── Meal Distribution ──────────────────────────────────
  console.log('Seeding package_meal_distribution...');
  // We need to look up package IDs by category+meals+duration
  const pkgs = await sql`SELECT id, category, meals_per_day, duration_days FROM packages`;

  function findPkg(cat: string, meals: number, dur: number): string {
    const row = pkgs.find((p) => p['category'] === cat && p['meals_per_day'] === meals && p['duration_days'] === dur);
    if (!row) throw new Error(`Package not found: ${cat}/${meals}/${dur}`);
    return row['id'] as string;
  }

  // Meal distribution data from handover Section 3
  type DistRow = { packageId: string; proteinType: string; mealCount: number };
  const distRows: DistRow[] = [
    // 1-Meal Mixed
    { packageId: findPkg('mixed', 1, 12), proteinType: 'chicken', mealCount: 5 },
    { packageId: findPkg('mixed', 1, 12), proteinType: 'beef', mealCount: 3 },
    { packageId: findPkg('mixed', 1, 12), proteinType: 'salmon', mealCount: 1 },
    { packageId: findPkg('mixed', 1, 12), proteinType: 'almond_fish', mealCount: 2 },
    { packageId: findPkg('mixed', 1, 12), proteinType: 'shrimp', mealCount: 1 },

    { packageId: findPkg('mixed', 1, 18), proteinType: 'chicken', mealCount: 8 },
    { packageId: findPkg('mixed', 1, 18), proteinType: 'beef', mealCount: 4 },
    { packageId: findPkg('mixed', 1, 18), proteinType: 'salmon', mealCount: 2 },
    { packageId: findPkg('mixed', 1, 18), proteinType: 'almond_fish', mealCount: 3 },
    { packageId: findPkg('mixed', 1, 18), proteinType: 'shrimp', mealCount: 1 },

    { packageId: findPkg('mixed', 1, 24), proteinType: 'chicken', mealCount: 10 },
    { packageId: findPkg('mixed', 1, 24), proteinType: 'beef', mealCount: 6 },
    { packageId: findPkg('mixed', 1, 24), proteinType: 'salmon', mealCount: 2 },
    { packageId: findPkg('mixed', 1, 24), proteinType: 'almond_fish', mealCount: 4 },
    { packageId: findPkg('mixed', 1, 24), proteinType: 'shrimp', mealCount: 2 },

    // 1-Meal Chicken (all chicken)
    { packageId: findPkg('chicken', 1, 12), proteinType: 'chicken', mealCount: 12 },
    { packageId: findPkg('chicken', 1, 18), proteinType: 'chicken', mealCount: 18 },
    { packageId: findPkg('chicken', 1, 24), proteinType: 'chicken', mealCount: 24 },

    // 2-Meal Mixed
    { packageId: findPkg('mixed', 2, 12), proteinType: 'chicken', mealCount: 12 },
    { packageId: findPkg('mixed', 2, 12), proteinType: 'beef', mealCount: 5 },
    { packageId: findPkg('mixed', 2, 12), proteinType: 'salmon', mealCount: 2 },
    { packageId: findPkg('mixed', 2, 12), proteinType: 'almond_fish', mealCount: 3 },
    { packageId: findPkg('mixed', 2, 12), proteinType: 'shrimp', mealCount: 2 },

    { packageId: findPkg('mixed', 2, 18), proteinType: 'chicken', mealCount: 18 },
    { packageId: findPkg('mixed', 2, 18), proteinType: 'beef', mealCount: 7 },
    { packageId: findPkg('mixed', 2, 18), proteinType: 'salmon', mealCount: 3 },
    { packageId: findPkg('mixed', 2, 18), proteinType: 'almond_fish', mealCount: 5 },
    { packageId: findPkg('mixed', 2, 18), proteinType: 'shrimp', mealCount: 3 },

    { packageId: findPkg('mixed', 2, 24), proteinType: 'chicken', mealCount: 24 },
    { packageId: findPkg('mixed', 2, 24), proteinType: 'beef', mealCount: 10 },
    { packageId: findPkg('mixed', 2, 24), proteinType: 'salmon', mealCount: 4 },
    { packageId: findPkg('mixed', 2, 24), proteinType: 'almond_fish', mealCount: 6 },
    { packageId: findPkg('mixed', 2, 24), proteinType: 'shrimp', mealCount: 4 },

    // 2-Meal Chicken
    { packageId: findPkg('chicken', 2, 12), proteinType: 'chicken', mealCount: 24 },
    { packageId: findPkg('chicken', 2, 18), proteinType: 'chicken', mealCount: 36 },
    { packageId: findPkg('chicken', 2, 24), proteinType: 'chicken', mealCount: 48 },

    // 3-Meal Mixed
    { packageId: findPkg('mixed', 3, 12), proteinType: 'chicken', mealCount: 19 },
    { packageId: findPkg('mixed', 3, 12), proteinType: 'beef', mealCount: 8 },
    { packageId: findPkg('mixed', 3, 12), proteinType: 'salmon', mealCount: 2 },
    { packageId: findPkg('mixed', 3, 12), proteinType: 'almond_fish', mealCount: 4 },
    { packageId: findPkg('mixed', 3, 12), proteinType: 'shrimp', mealCount: 3 },

    { packageId: findPkg('mixed', 3, 18), proteinType: 'chicken', mealCount: 28 },
    { packageId: findPkg('mixed', 3, 18), proteinType: 'beef', mealCount: 12 },
    { packageId: findPkg('mixed', 3, 18), proteinType: 'salmon', mealCount: 3 },
    { packageId: findPkg('mixed', 3, 18), proteinType: 'almond_fish', mealCount: 6 },
    { packageId: findPkg('mixed', 3, 18), proteinType: 'shrimp', mealCount: 5 },

    { packageId: findPkg('mixed', 3, 24), proteinType: 'chicken', mealCount: 38 },
    { packageId: findPkg('mixed', 3, 24), proteinType: 'beef', mealCount: 16 },
    { packageId: findPkg('mixed', 3, 24), proteinType: 'salmon', mealCount: 4 },
    { packageId: findPkg('mixed', 3, 24), proteinType: 'almond_fish', mealCount: 8 },
    { packageId: findPkg('mixed', 3, 24), proteinType: 'shrimp', mealCount: 6 },

    // 3-Meal Chicken
    { packageId: findPkg('chicken', 3, 12), proteinType: 'chicken', mealCount: 36 },
    { packageId: findPkg('chicken', 3, 18), proteinType: 'chicken', mealCount: 54 },
    { packageId: findPkg('chicken', 3, 24), proteinType: 'chicken', mealCount: 72 },
  ];
  await db.insert(packageMealDistribution).values(distRows).onConflictDoNothing();

  // ── Discount Rules ─────────────────────────────────────
  console.log('Seeding discount_rules...');
  // discount_rules has no natural unique key for auto-applied rules (code is NULL),
  // so we check-before-insert to ensure idempotency
  const existingDiscounts = await sql`SELECT type FROM discount_rules WHERE type IN ('first_plan', 'renewal')`;
  const existingTypes = new Set(existingDiscounts.map((r) => r['type'] as string));

  const discountRows: Array<typeof discountRules.$inferInsert> = [];
  if (!existingTypes.has('first_plan')) {
    discountRows.push({
      type: 'first_plan' as const,
      discountPercent: '10.00',
      appliesTo: ['main_meals'],
      isActive: true,
    });
  }
  if (!existingTypes.has('renewal')) {
    discountRows.push({ type: 'renewal' as const, discountPercent: '5.00', appliesTo: ['main_meals'], isActive: true });
  }
  if (discountRows.length > 0) {
    await db.insert(discountRules).values(discountRows);
  }

  // ── Rotation Schedules (24 rows) & Swap Options (~80 rows) ──
  console.log('Seeding rotation_schedules and swap options...');

  // Snack rotation (12-day cycle) — from handover Section 4
  // Maps product English names to SKUs for rotation items
  const snackSchedule: Array<{ day: number; sku: string; price: string; swapSkus: string[] }> = [
    { day: 1, sku: 'sk-0293', price: '9.00', swapSkus: ['sk-0319', 'sk-0295'] }, // Green Salad → Muffin, Fruit Salad
    {
      day: 2,
      sku: 'sk-0381',
      price: '15.00',
      swapSkus: ['sk-0297', 'sk-0294', 'sk-0319', 'sk-0295', 'sk-0370', 'sk-0317', 'sk-0523'],
    }, // Eclair → Beetroot, Oatmeal, Muffin, Fruit Salad, Masoub, Cheesecake, Creme Brulee
    { day: 3, sku: 'sk-0297', price: '12.00', swapSkus: ['sk-0293', 'sk-0319', 'sk-0295'] }, // Beetroot Salad → Green, Muffin, Fruit Salad
    { day: 4, sku: 'sk-0294', price: '12.00', swapSkus: ['sk-0293', 'sk-0319', 'sk-0295', 'sk-0297'] }, // Oat Red Berry → Green, Muffin, Fruit, Beetroot
    { day: 5, sku: 'sk-0319', price: '9.00', swapSkus: ['sk-0293', 'sk-0295'] }, // Muffin Cake → Green, Fruit Salad
    { day: 6, sku: 'sk-0295', price: '9.00', swapSkus: ['sk-0293', 'sk-0319'] }, // Fruit Salad → Green, Muffin
    {
      day: 7,
      sku: 'sk-0550',
      price: '17.00',
      swapSkus: ['sk-0297', 'sk-0294', 'sk-0319', 'sk-0295', 'sk-0370', 'sk-0317', 'sk-0523', 'sk-0551'],
    }, // Choco Chips → Beetroot, Oatmeal, Muffin, Fruit, Masoub, Cheesecake, Creme Brulee, Granola
    {
      day: 8,
      sku: 'sk-0370',
      price: '14.00',
      swapSkus: ['sk-0319', 'sk-0295', 'sk-0297', 'sk-0294', 'sk-0317', 'sk-0523'],
    }, // Masoub → Muffin, Fruit, Beetroot, Oatmeal, Cheesecake, Creme Brulee
    {
      day: 9,
      sku: 'sk-0460',
      price: '18.00',
      swapSkus: [
        'sk-0293',
        'sk-0295',
        'sk-0297',
        'sk-0294',
        'sk-0319',
        'sk-0370',
        'sk-0317',
        'sk-0523',
        'sk-0550',
        'sk-0551',
        'sk-0381',
      ],
    }, // Coco Strawberry → ALL
    {
      day: 10,
      sku: 'sk-0317',
      price: '13.00',
      swapSkus: ['sk-0293', 'sk-0297', 'sk-0294', 'sk-0319', 'sk-0295', 'sk-0523'],
    }, // Cheesecake → Green, Beetroot, Oatmeal, Muffin, Fruit, Creme Brulee
    {
      day: 11,
      sku: 'sk-0551',
      price: '17.00',
      swapSkus: ['sk-0297', 'sk-0294', 'sk-0319', 'sk-0295', 'sk-0370', 'sk-0317', 'sk-0523'],
    }, // Home Granola → Beetroot, Oatmeal, Muffin, Fruit, Masoub, Cheesecake, Creme Brulee
    {
      day: 12,
      sku: 'sk-0523',
      price: '13.00',
      swapSkus: ['sk-0293', 'sk-0297', 'sk-0294', 'sk-0319', 'sk-0295', 'sk-0317'],
    }, // Creme Brulee → Green, Beetroot, Oatmeal, Muffin, Fruit, Cheesecake
  ];

  // Sandwich rotation (12-day cycle) — from handover Section 4
  const sandwichSchedule: Array<{ day: number; sku: string; price: string; swapSkus: string[] }> = [
    { day: 1, sku: 'sk-0362', price: '16.00', swapSkus: ['sk-0365', 'sk-0361'] }, // Club Small → Egg, Tuna Small
    {
      day: 2,
      sku: 'sk-0367',
      price: '29.00',
      swapSkus: [
        'sk-0358',
        'sk-0357',
        'sk-0356',
        'sk-0359',
        'sk-0360',
        'sk-0361',
        'sk-0362',
        'sk-0364',
        'sk-0365',
        'sk-0366',
        'sk-0552',
        'sk-0553',
      ],
    }, // Steak Big → ALL
    { day: 3, sku: 'sk-0366', price: '17.00', swapSkus: ['sk-0365', 'sk-0362', 'sk-0361'] }, // Halloumi → Egg, Club Small, Tuna Small
    { day: 4, sku: 'sk-0359', price: '27.00', swapSkus: ['sk-0360', 'sk-0366', 'sk-0362', 'sk-0361', 'sk-0365'] }, // Chicken Pesto Big → Salmon Big, Halloumi, Club Small, Tuna Small, Egg
    { day: 5, sku: 'sk-0364', price: '20.00', swapSkus: ['sk-0362', 'sk-0361', 'sk-0365', 'sk-0366'] }, // Salmon Small → Club Small, Tuna Small, Egg, Halloumi
    { day: 6, sku: 'sk-0365', price: '13.00', swapSkus: [] }, // Egg → none (cheapest, locked)
    { day: 7, sku: 'sk-0366', price: '17.00', swapSkus: ['sk-0365', 'sk-0362', 'sk-0361'] }, // Halloumi → Egg, Club Small, Tuna Small
    { day: 8, sku: 'sk-0361', price: '16.00', swapSkus: ['sk-0362', 'sk-0365'] }, // Tuna Small → Club Small, Egg
    { day: 9, sku: 'sk-0362', price: '16.00', swapSkus: ['sk-0365', 'sk-0361'] }, // Club Small → Egg, Tuna Small
    { day: 10, sku: 'sk-0359', price: '27.00', swapSkus: ['sk-0360', 'sk-0366', 'sk-0362', 'sk-0361', 'sk-0365'] }, // Chicken Pesto Big → Salmon Big, Halloumi, Club Small, Tuna Small, Egg
    {
      day: 11,
      sku: 'sk-0358',
      price: '29.00',
      swapSkus: [
        'sk-0358',
        'sk-0357',
        'sk-0356',
        'sk-0359',
        'sk-0360',
        'sk-0361',
        'sk-0362',
        'sk-0364',
        'sk-0365',
        'sk-0366',
        'sk-0552',
        'sk-0553',
      ],
    }, // Caprese Big → ALL
    { day: 12, sku: 'sk-0365', price: '13.00', swapSkus: [] }, // Egg → none (locked)
  ];

  // Insert snack rotation
  for (const entry of snackSchedule) {
    const pid = prodId(entry.sku);
    await db
      .insert(rotationSchedules)
      .values({
        type: 'snack' as const,
        dayNumber: entry.day,
        productId: pid,
        priceInclVat: entry.price,
      })
      .onConflictDoNothing();
  }

  // Insert sandwich rotation
  for (const entry of sandwichSchedule) {
    const pid = prodId(entry.sku);
    await db
      .insert(rotationSchedules)
      .values({
        type: 'sandwich' as const,
        dayNumber: entry.day,
        productId: pid,
        priceInclVat: entry.price,
      })
      .onConflictDoNothing();
  }

  // Look up rotation schedule IDs and insert swap options
  const schedules = await sql`SELECT id, type, day_number FROM rotation_schedules`;
  function schedId(type: string, day: number): string {
    const row = schedules.find((s) => s['type'] === type && s['day_number'] === day);
    if (!row) throw new Error(`Schedule not found: ${type}/${day}`);
    return row['id'] as string;
  }

  let swapCount = 0;
  for (const entry of snackSchedule) {
    const sid = schedId('snack', entry.day);
    for (const swapSku of entry.swapSkus) {
      await db
        .insert(rotationSwapOptions)
        .values({
          scheduleId: sid,
          swapProductId: prodId(swapSku),
        })
        .onConflictDoNothing();
      swapCount++;
    }
  }
  for (const entry of sandwichSchedule) {
    const sid = schedId('sandwich', entry.day);
    for (const swapSku of entry.swapSkus) {
      await db
        .insert(rotationSwapOptions)
        .values({
          scheduleId: sid,
          swapProductId: prodId(swapSku),
        })
        .onConflictDoNothing();
      swapCount++;
    }
  }
  console.log(`Seeded 24 rotation schedules, ${swapCount} swap options`);

  console.log('Seed complete.');
  await sql.end();
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
