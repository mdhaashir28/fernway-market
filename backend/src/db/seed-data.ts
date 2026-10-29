// Sample catalogue for LOCAL DEVELOPMENT and DEMOS.
//
// NOTE: Every price and stock quantity here is SAMPLE DATA, not an official or
// current price. The store owner should check and change them in the staff
// dashboard (Products → Edit) before taking real orders.
//
// Prices are in Indian rupees, stored in paise (the "cents" of a rupee):
// 4500 = ₹45.00. `unitLabel` is the package size shown to customers.
// Products with a matching file in backend/seed-images/products/<SKU>.jpg get
// that photo; the rest show a "Photo coming soon" placeholder until a photo is
// uploaded in the dashboard.

export interface SeedCategory {
  slug: string;
  name: string;
  description: string;
  sortOrder: number;
}

export interface SeedProduct {
  sku: string;
  category: string; // category slug
  name: string;
  brand?: string;
  priceCents: number; // paise
  unitLabel: string; // package size
  stock: number;
  lowStockThreshold?: number;
  isActive?: boolean;
  description: string;
}

/**
 * Bump this when you add products to the sample catalogue: existing
 * development/demo databases then pick up the new products on the next start
 * (once — see syncSampleCatalog in seed.ts).
 */
export const SAMPLE_DATA_VERSION = 'catalogue-5-checked-photos';

/**
 * Sample photos added after these products already existed. On the next start
 * they are given to these products, but only where the product has no photo yet
 * (a photo staff uploaded is never replaced).
 */
export const photosAddedLater = ['RD-001', 'RD-003', 'RD-009'];

/** Sample photos that moved to a new file (old address → new address). */
export const renamedSamplePhotos: [string, string][] = [
  ['/sample-images/FV-006.png', '/sample-images/FV-006.jpg'],
  ['/sample-images/FZ-003.png', '/sample-images/FZ-003.jpg'],
];

/**
 * Sample photos taken out because they didn't clearly show the product
 * (MF-002 showed minced beef, not mutton). Those products show "Image needed"
 * until the store uploads a photo; a photo staff uploaded is never touched.
 */
export const withdrawnSamplePhotos = ['/sample-images/MF-002.jpg'];

/** Brand used for staples that the store weighs and packs itself. */
const STORE_PACKED = 'Store packed';

export const seedCategories: SeedCategory[] = [
  { slug: 'rice-dals', name: 'Rice, Dals & Grains', sortOrder: 1, description: 'Ponni, idli and dosa rice, dals and ragi' },
  { slug: 'spices', name: 'Spices & Masalas', sortOrder: 2, description: 'Masala powders, whole spices and tamarind' },
  { slug: 'fruit-veg', name: 'Fruit & Veg', sortOrder: 3, description: 'Fresh fruit, vegetables and salad' },
  { slug: 'dairy-eggs', name: 'Dairy & Eggs', sortOrder: 4, description: 'Milk, curd, cheese, butter and eggs' },
  { slug: 'bakery', name: 'Bakery', sortOrder: 5, description: 'Bread, rolls and pastries baked every morning' },
  { slug: 'pantry', name: 'Pantry', sortOrder: 6, description: 'Noodles, sauces, oils, spreads and tins' },
  { slug: 'snacks', name: 'Snacks & Sweets', sortOrder: 7, description: 'Chips, chocolate, biscuits and popcorn' },
  { slug: 'drinks', name: 'Drinks', sortOrder: 8, description: 'Coffee, tea, juice, water and soft drinks' },
  { slug: 'personal-care', name: 'Personal Care', sortOrder: 9, description: 'Soaps, shampoos, toothpaste and skin care' },
  { slug: 'household', name: 'Household', sortOrder: 10, description: 'Detergents, dishwash, cleaners and everyday essentials' },
  { slug: 'meat-fish', name: 'Meat & Fish', sortOrder: 11, description: 'Fresh meat, poultry and seafood' },
  { slug: 'frozen', name: 'Frozen', sortOrder: 12, description: 'Ice cream, frozen meals and frozen fruit' },
];

/** Where the first sample catalogue put each category, so updateOlderSampleData() can move them. */
export const previousCategoryOrder: Record<string, number> = {
  'fruit-veg': 1,
  bakery: 2,
  'dairy-eggs': 3,
  'meat-fish': 4,
  pantry: 5,
  drinks: 6,
  snacks: 7,
  frozen: 8,
  household: 9,
};

export const seedProducts: SeedProduct[] = [
  // Rice, Dals & Grains (store packed)
  { sku: 'RD-001', category: 'rice-dals', name: 'Toor Dal (Thuvaram Paruppu)', brand: STORE_PACKED, priceCents: 15500, unitLabel: '1 kg', stock: 60, description: 'Split pigeon peas, cleaned and packed in store — the everyday dal for sambar, paruppu and kootu.' },
  { sku: 'RD-002', category: 'rice-dals', name: 'Urad Dal, Whole White (Gundu Ulundhu)', brand: STORE_PACKED, priceCents: 15000, unitLabel: '1 kg', stock: 45, description: 'Whole skinned black gram for soft idli and crisp dosa batter, vadai and tempering.' },
  { sku: 'RD-003', category: 'rice-dals', name: 'Chana Dal (Kadalai Paruppu)', brand: STORE_PACKED, priceCents: 9800, unitLabel: '1 kg', stock: 50, description: 'Split Bengal gram for vadai, kootu, chutney and tempering.' },
  { sku: 'RD-004', category: 'rice-dals', name: 'Moong Dal (Paasi Paruppu)', brand: STORE_PACKED, priceCents: 12800, unitLabel: '1 kg', stock: 40, description: 'Split yellow moong dal for pongal, payasam and light, quick-cooking dal.' },
  { sku: 'RD-005', category: 'rice-dals', name: 'Masoor Dal (Mysore Paruppu)', brand: STORE_PACKED, priceCents: 10500, unitLabel: '1 kg', stock: 35, description: 'Split red lentils that cook quickly without soaking — good for dal and kuzhambu.' },
  { sku: 'RD-006', category: 'rice-dals', name: 'Ponni Boiled Rice', brand: STORE_PACKED, priceCents: 34000, unitLabel: '5 kg', stock: 40, description: 'Medium-grain Ponni parboiled rice that cooks soft and separate — the everyday rice for meals.' },
  { sku: 'RD-007', category: 'rice-dals', name: 'Ponni Boiled Rice', brand: STORE_PACKED, priceCents: 157500, unitLabel: '25 kg bag', stock: 12, lowStockThreshold: 5, description: 'Ponni parboiled rice in a 25 kg bag for the month.' },
  { sku: 'RD-008', category: 'rice-dals', name: 'Ponni Raw Rice (Pachai Arisi)', brand: STORE_PACKED, priceCents: 6400, unitLabel: '1 kg', stock: 30, description: 'Raw Ponni rice for sweet pongal, ven pongal and payasam.' },
  { sku: 'RD-009', category: 'rice-dals', name: 'Idli Rice (Idli Arisi)', brand: STORE_PACKED, priceCents: 5200, unitLabel: '1 kg', stock: 50, description: 'Short-grain parboiled rice for soft, fluffy idlis. Soak with urad dal and grind.' },
  { sku: 'RD-010', category: 'rice-dals', name: 'Dosa Rice (Dosai Arisi)', brand: STORE_PACKED, priceCents: 5600, unitLabel: '1 kg', stock: 35, description: 'Rice for dosa batter that gives thin, golden, crisp dosas.' },
  { sku: 'RD-011', category: 'rice-dals', name: 'Ragi, Whole (Kezhvaragu)', brand: STORE_PACKED, priceCents: 6200, unitLabel: '1 kg', stock: 25, description: 'Whole finger millet, cleaned — for sprouting, malt or grinding at home.' },
  { sku: 'RD-012', category: 'rice-dals', name: 'Ragi Flour (Kezhvaragu Maavu)', brand: STORE_PACKED, priceCents: 3800, unitLabel: '500 g', stock: 30, description: 'Finger millet flour for ragi dosa, kali, koozh and porridge.' },

  // Spices & Masalas (store packed)
  { sku: 'SP-001', category: 'spices', name: 'Turmeric Powder (Manjal Thool)', brand: STORE_PACKED, priceCents: 3600, unitLabel: '100 g', stock: 50, description: 'Bright, earthy ground turmeric for sambar, kuzhambu, poriyal and rasam.' },
  { sku: 'SP-002', category: 'spices', name: 'Red Chilli Powder (Milagai Thool)', brand: STORE_PACKED, priceCents: 4200, unitLabel: '100 g', stock: 45, description: 'Ground dried red chillies for heat and colour in curries and fries.' },
  { sku: 'SP-003', category: 'spices', name: 'Coriander Powder (Malli Thool)', brand: STORE_PACKED, priceCents: 3000, unitLabel: '100 g', stock: 45, description: 'Ground coriander seeds with a warm, citrusy aroma for kuzhambu and curries.' },
  { sku: 'SP-004', category: 'spices', name: 'Cumin Seeds (Seeragam)', brand: STORE_PACKED, priceCents: 5500, unitLabel: '100 g', stock: 40, description: 'Whole cumin for tempering, rasam, jeera rice and buttermilk.' },
  { sku: 'SP-005', category: 'spices', name: 'Mustard Seeds (Kadugu)', brand: STORE_PACKED, priceCents: 1800, unitLabel: '100 g', stock: 60, description: 'Small dark mustard seeds — the first crackle of every South Indian tempering.' },
  { sku: 'SP-006', category: 'spices', name: 'Black Pepper, Whole (Milagu)', brand: STORE_PACKED, priceCents: 8200, unitLabel: '100 g', stock: 30, description: 'Whole black peppercorns for rasam, pepper chicken, pongal and milagu kuzhambu.' },
  { sku: 'SP-007', category: 'spices', name: 'Sambar Powder', brand: STORE_PACKED, priceCents: 7200, unitLabel: '200 g', stock: 40, description: 'A roasted blend of coriander, chilli, dals and spices for everyday sambar.' },
  { sku: 'SP-008', category: 'spices', name: 'Rasam Powder', brand: STORE_PACKED, priceCents: 4000, unitLabel: '100 g', stock: 30, description: 'Peppery, cumin-rich blend for quick tomato or lemon rasam.' },
  { sku: 'SP-009', category: 'spices', name: 'Tamarind, Seedless (Puli)', brand: STORE_PACKED, priceCents: 5500, unitLabel: '250 g', stock: 35, description: 'Seedless tamarind block for kuzhambu, rasam, puliyodharai and chutneys. Soak in warm water and squeeze.' },

  // Fruit & Veg
  { sku: 'FV-001', category: 'fruit-veg', name: 'Bananas', priceCents: 4500, unitLabel: '6 pcs', stock: 80, description: 'Ripe, sweet bananas — perfect for breakfast, smoothies or baking.' },
  { sku: 'FV-002', category: 'fruit-veg', name: 'Gala Apples', priceCents: 19900, unitLabel: '1 kg', stock: 40, description: 'Crisp, juicy apples with a mild, sweet flavour.' },
  { sku: 'FV-003', category: 'fruit-veg', name: 'Hass Avocados', priceCents: 14900, unitLabel: 'each', stock: 6, description: 'Creamy avocados, ready to eat in 1–2 days.' },
  { sku: 'FV-004', category: 'fruit-veg', name: 'Vine Tomatoes', priceCents: 4000, unitLabel: '500 g', stock: 35, description: 'Fragrant tomatoes ripened on the vine.' },
  { sku: 'FV-005', category: 'fruit-veg', name: 'Carrots', priceCents: 6000, unitLabel: '1 kg', stock: 50, description: 'Sweet, crunchy carrots for snacking, halwa, curries or soups.' },
  { sku: 'FV-006', category: 'fruit-veg', name: 'Broccoli', priceCents: 7900, unitLabel: 'each', stock: 25, description: 'Fresh green broccoli heads, great steamed or stir-fried.' },
  { sku: 'FV-007', category: 'fruit-veg', name: 'Strawberries', priceCents: 19900, unitLabel: '400 g punnet', stock: 0, description: 'Sweet, juicy strawberries picked at their best.' },
  { sku: 'FV-008', category: 'fruit-veg', name: 'Lemons', priceCents: 3000, unitLabel: 'pack of 4', stock: 30, description: 'Juicy lemons for cooking, lemon rice, nimbu pani and pickles.' },
  { sku: 'FV-009', category: 'fruit-veg', name: 'Baby Spinach', priceCents: 4900, unitLabel: '200 g bag', stock: 18, description: 'Washed and ready-to-eat tender spinach leaves.' },
  { sku: 'FV-010', category: 'fruit-veg', name: 'Pumpkin', priceCents: 8900, unitLabel: 'each', stock: 0, isActive: false, description: 'Seasonal pumpkin — back soon.' },

  // Dairy & Eggs
  { sku: 'DE-001', category: 'dairy-eggs', name: 'Full Cream Milk', priceCents: 6800, unitLabel: '1 L', stock: 60, description: 'Fresh full cream milk from local dairies.' },
  { sku: 'DE-002', category: 'dairy-eggs', name: 'Free-Range Eggs', priceCents: 12000, unitLabel: '12 pack', stock: 40, description: 'Large free-range eggs.' },
  { sku: 'DE-003', category: 'dairy-eggs', name: 'Mature Cheddar', priceCents: 45000, unitLabel: '400 g', stock: 22, description: 'Rich, tangy cheddar aged for 9 months.' },
  { sku: 'DE-004', category: 'dairy-eggs', name: 'Greek-Style Yogurt', priceCents: 13000, unitLabel: '500 g', stock: 15, description: 'Thick and creamy natural yogurt.' },
  { sku: 'DE-005', category: 'dairy-eggs', name: 'Salted Butter', priceCents: 14000, unitLabel: '250 g', stock: 30, description: 'Creamy salted butter, great on warm toast.' },
  { sku: 'DE-006', category: 'dairy-eggs', name: 'Nestlé a+ Nourish Toned Milk', brand: 'Nestlé a+', priceCents: 7600, unitLabel: '1 L carton', stock: 36, description: 'Long-life toned milk in a carton — keeps unopened without a fridge. Refrigerate after opening.' },
  { sku: 'DE-007', category: 'dairy-eggs', name: 'Nestlé a+ Dahi', brand: 'Nestlé a+', priceCents: 5000, unitLabel: '400 g cup', stock: 20, description: 'Set curd for curd rice, raita and buttermilk. Keep refrigerated.' },
  { sku: 'DE-008', category: 'dairy-eggs', name: 'Nestlé Everyday Dairy Whitener', brand: 'Everyday', priceCents: 23500, unitLabel: '400 g pouch', stock: 24, description: 'Dairy whitener powder for a creamy cup of tea or coffee.' },

  // Bakery
  { sku: 'BK-001', category: 'bakery', name: 'Sourdough Loaf', priceCents: 22000, unitLabel: '800 g', stock: 12, description: 'Slow-fermented sourdough with a crisp, chewy crust.' },
  { sku: 'BK-002', category: 'bakery', name: 'Butter Croissants', priceCents: 18000, unitLabel: 'pack of 4', stock: 4, description: 'Flaky, all-butter croissants baked in store.' },
  { sku: 'BK-003', category: 'bakery', name: 'Seeded Bagels', priceCents: 15000, unitLabel: 'pack of 5', stock: 20, description: 'Soft, chewy bagels topped with mixed seeds.' },
  { sku: 'BK-004', category: 'bakery', name: 'French Baguette', priceCents: 9000, unitLabel: 'each', stock: 25, description: 'Classic crusty baguette, baked fresh daily.' },

  // Pantry
  { sku: 'PA-001', category: 'pantry', name: 'Spaghetti', priceCents: 12000, unitLabel: '500 g', stock: 70, description: 'Durum wheat spaghetti, cooks in 10 minutes.' },
  { sku: 'PA-002', category: 'pantry', name: 'Basmati Rice', priceCents: 16000, unitLabel: '1 kg', stock: 45, description: 'Fragrant, aged long-grain basmati rice for biryani and pulao.' },
  { sku: 'PA-003', category: 'pantry', name: 'Chopped Tomatoes', priceCents: 11000, unitLabel: '400 g can', stock: 90, description: 'Italian chopped tomatoes in rich juice.' },
  { sku: 'PA-004', category: 'pantry', name: 'Extra Virgin Olive Oil', priceCents: 65000, unitLabel: '500 ml', stock: 16, description: 'Cold-pressed olive oil with a fruity, peppery finish.' },
  { sku: 'PA-005', category: 'pantry', name: 'Crunchy Peanut Butter', priceCents: 19900, unitLabel: '340 g jar', stock: 25, description: 'Roasted peanuts with no added sugar.' },
  { sku: 'PA-006', category: 'pantry', name: 'Wildflower Honey', priceCents: 25000, unitLabel: '350 g jar', stock: 12, description: 'Smooth, golden honey from local beekeepers.' },
  { sku: 'PA-007', category: 'pantry', name: 'Maggi 2-Minute Masala Noodles', brand: 'Maggi', priceCents: 5600, unitLabel: '280 g (4 × 70 g)', stock: 80, description: "Nestlé's instant masala noodles with tastemaker — a quick snack or tiffin." },
  { sku: 'PA-008', category: 'pantry', name: 'Maggi Rich Tomato Ketchup', brand: 'Maggi', priceCents: 15500, unitLabel: '1 kg bottle', stock: 20, description: 'Thick tomato ketchup from Nestlé for snacks, sandwiches and fries.' },
  { sku: 'PA-009', category: 'pantry', name: 'Nestlé Milkmaid Sweetened Condensed Milk', brand: 'Milkmaid', priceCents: 15000, unitLabel: '380 g tin', stock: 18, description: 'Sweetened condensed milk for payasam, kesari, burfi and desserts.' },

  // Snacks & Sweets
  { sku: 'SN-001', category: 'snacks', name: 'Salted Potato Chips', priceCents: 9900, unitLabel: '150 g', stock: 40, description: 'Thick-cut potato chips with a pinch of sea salt.' },
  { sku: 'SN-002', category: 'snacks', name: 'Dark Chocolate 70%', priceCents: 17500, unitLabel: '100 g', stock: 35, description: 'Smooth dark chocolate made with 70% cocoa.' },
  { sku: 'SN-003', category: 'snacks', name: 'Chocolate Chip Cookies', priceCents: 12000, unitLabel: '200 g', stock: 28, description: 'Crunchy cookies packed with chocolate chips.' },
  { sku: 'SN-004', category: 'snacks', name: 'Salted Popcorn', priceCents: 6000, unitLabel: '100 g', stock: 2, description: 'Light and crunchy popcorn with a pinch of salt.' },
  { sku: 'SN-005', category: 'snacks', name: 'Nestlé KitKat 4 Finger', brand: 'KitKat', priceCents: 4000, unitLabel: '37.3 g bar', stock: 60, description: 'Crisp wafer fingers covered in milk chocolate.' },
  { sku: 'SN-006', category: 'snacks', name: 'Nestlé Munch Chocolate Wafer', brand: 'Munch', priceCents: 5000, unitLabel: 'pack of 10 bars', stock: 40, description: 'Crunchy chocolate-coated wafer bars — handy for lunch boxes.' },

  // Drinks
  { sku: 'DR-001', category: 'drinks', name: 'Orange Juice', priceCents: 12000, unitLabel: '1 L', stock: 40, description: '100% orange juice with no added sugar.' },
  { sku: 'DR-002', category: 'drinks', name: 'Sparkling Water', priceCents: 9000, unitLabel: '750 ml', stock: 80, description: 'Naturally sourced sparkling mineral water.' },
  { sku: 'DR-003', category: 'drinks', name: 'Ground Coffee', priceCents: 45000, unitLabel: '250 g', stock: 20, description: 'Medium roast with notes of chocolate and caramel.' },
  { sku: 'DR-004', category: 'drinks', name: 'Assam Tea Bags', priceCents: 22000, unitLabel: '100 bags', stock: 25, description: 'A strong, full-bodied everyday tea — perfect for chai.' },
  { sku: 'DR-005', category: 'drinks', name: 'Cola', priceCents: 24000, unitLabel: '6 × 300 ml', stock: 30, description: 'Classic cola in cans.' },
  { sku: 'DR-006', category: 'drinks', name: 'Nescafé Classic Instant Coffee', brand: 'Nescafé', priceCents: 20000, unitLabel: '50 g jar', stock: 25, description: "Nestlé's pure instant coffee — stir into hot milk or water." },
  { sku: 'DR-007', category: 'drinks', name: 'Nescafé Sunrise Instant Coffee-Chicory Mix', brand: 'Nescafé', priceCents: 22500, unitLabel: '100 g', stock: 20, description: 'Instant coffee blended with chicory for a strong, filter-style cup.' },

  // Personal Care (Hindustan Unilever brands)
  { sku: 'PC-001', category: 'personal-care', name: 'Lux Soft Glow Rose & Vitamin E Soap', brand: 'Lux', priceCents: 15000, unitLabel: '4 × 100 g', stock: 40, description: 'Rose-scented beauty soap bars from Hindustan Unilever.' },
  { sku: 'PC-002', category: 'personal-care', name: 'Lifebuoy Total 10 Soap', brand: 'Lifebuoy', priceCents: 12500, unitLabel: '4 × 100 g', stock: 50, description: 'Everyday family bathing soap from Hindustan Unilever.' },
  { sku: 'PC-003', category: 'personal-care', name: 'Dove Cream Beauty Bathing Bar', brand: 'Dove', priceCents: 19900, unitLabel: '3 × 100 g', stock: 24, description: 'Gentle, moisturising bathing bar for soft skin.' },
  { sku: 'PC-004', category: 'personal-care', name: 'Pears Pure & Gentle Soap', brand: 'Pears', priceCents: 23500, unitLabel: '3 × 125 g', stock: 20, description: 'The classic transparent glycerine soap.' },
  { sku: 'PC-005', category: 'personal-care', name: 'Hamam Neem, Tulsi & Aloe Vera Soap', brand: 'Hamam', priceCents: 15500, unitLabel: '3 × 150 g', stock: 45, description: 'Family soap with neem, tulsi and aloe vera.' },
  { sku: 'PC-006', category: 'personal-care', name: 'Clinic Plus Strong & Long Shampoo', brand: 'Clinic Plus', priceCents: 19900, unitLabel: '355 ml', stock: 22, description: 'Everyday family shampoo for strong, long hair.' },
  { sku: 'PC-007', category: 'personal-care', name: 'Sunsilk Stunning Black Shine Shampoo', brand: 'Sunsilk', priceCents: 14000, unitLabel: '180 ml', stock: 18, description: 'Shampoo for dark, shiny-looking hair.' },
  { sku: 'PC-008', category: 'personal-care', name: 'Dove Intense Repair Shampoo', brand: 'Dove', priceCents: 18500, unitLabel: '180 ml', stock: 6, description: 'Nourishing shampoo for dry, damaged hair.' },
  { sku: 'PC-009', category: 'personal-care', name: 'Close Up Ever Fresh Red Hot Gel Toothpaste', brand: 'Close Up', priceCents: 11000, unitLabel: '150 g', stock: 35, description: 'Red gel toothpaste for fresh breath.' },
  { sku: 'PC-010', category: 'personal-care', name: 'Pepsodent Germicheck Toothpaste', brand: 'Pepsodent', priceCents: 9900, unitLabel: '150 g', stock: 35, description: 'Everyday family toothpaste.' },
  { sku: 'PC-011', category: 'personal-care', name: 'Vaseline Intensive Care Deep Moisture Body Lotion', brand: 'Vaseline', priceCents: 45000, unitLabel: '400 ml', stock: 12, description: 'Body lotion for dry skin.' },

  // Household (HH-005 onwards: Hindustan Unilever brands)
  { sku: 'HH-001', category: 'household', name: 'Dishwash Liquid', priceCents: 11000, unitLabel: '500 ml', stock: 30, description: 'Tough on grease, gentle on hands.' },
  { sku: 'HH-002', category: 'household', name: 'Toilet Tissue', priceCents: 39900, unitLabel: '9 rolls', stock: 20, description: 'Soft and strong 3-ply toilet tissue.' },
  { sku: 'HH-003', category: 'household', name: 'Kitchen Sponges', priceCents: 9900, unitLabel: 'pack of 4', stock: 35, description: 'Dual-sided scrub sponges.' },
  { sku: 'HH-004', category: 'household', name: 'Laundry Detergent', priceCents: 49900, unitLabel: '1.5 L', stock: 8, description: 'Concentrated liquid detergent for 40 washes.' },
  { sku: 'HH-005', category: 'household', name: 'Surf Excel Easy Wash Detergent Powder', brand: 'Surf Excel', priceCents: 14000, unitLabel: '1 kg', stock: 40, description: 'Detergent powder for bucket and hand washing, from Hindustan Unilever.' },
  { sku: 'HH-006', category: 'household', name: 'Surf Excel Detergent Bar', brand: 'Surf Excel', priceCents: 3500, unitLabel: '250 g', stock: 50, description: 'Detergent bar for scrubbing collars, cuffs and tough stains.' },
  { sku: 'HH-007', category: 'household', name: 'Rin Detergent Powder', brand: 'Rin', priceCents: 10500, unitLabel: '1 kg', stock: 35, description: 'Detergent powder for bright whites, from Hindustan Unilever.' },
  { sku: 'HH-008', category: 'household', name: 'Rin Detergent Bar', brand: 'Rin', priceCents: 2500, unitLabel: '250 g', stock: 60, description: 'Everyday detergent bar for hand washing.' },
  { sku: 'HH-009', category: 'household', name: 'Wheel Active 2 in 1 Detergent Powder', brand: 'Wheel', priceCents: 7000, unitLabel: '1 kg', stock: 45, description: 'Value detergent powder for everyday laundry, from Hindustan Unilever.' },
  { sku: 'HH-010', category: 'household', name: 'Vim Dishwash Bar', brand: 'Vim', priceCents: 3000, unitLabel: '300 g', stock: 50, description: 'Lemon dishwash bar for pots, pans and plates.' },
  { sku: 'HH-011', category: 'household', name: 'Vim Dishwash Liquid Gel, Lemon', brand: 'Vim', priceCents: 11000, unitLabel: '500 ml bottle', stock: 25, description: 'Dishwash gel that cuts through grease — a little goes a long way.' },
  { sku: 'HH-012', category: 'household', name: 'Domex Disinfectant Toilet Cleaner', brand: 'Domex', priceCents: 10500, unitLabel: '500 ml', stock: 20, description: 'Thick toilet cleaner, from Hindustan Unilever. Keep out of reach of children.' },
  { sku: 'HH-013', category: 'household', name: 'Comfort After Wash Fabric Conditioner, Morning Fresh', brand: 'Comfort', priceCents: 23000, unitLabel: '860 ml', stock: 15, description: 'Fabric conditioner for soft, fresh-smelling clothes. Add to the last rinse.' },

  // Meat & Fish
  { sku: 'MF-001', category: 'meat-fish', name: 'Chicken Breast Fillets', priceCents: 29900, unitLabel: '500 g', stock: 20, description: 'Skinless, boneless chicken breast fillets.' },
  { sku: 'MF-002', category: 'meat-fish', name: 'Mutton Keema', priceCents: 42000, unitLabel: '500 g', stock: 3, description: 'Freshly minced mutton — ideal for keema, kebabs and cutlets.' },
  { sku: 'MF-003', category: 'meat-fish', name: 'Salmon Fillets', priceCents: 69900, unitLabel: '2 pack, 240 g', stock: 10, description: 'Boneless, skin-on salmon fillets.' },
  // Hidden by default for this store; tick "Visible to customers" in the dashboard to sell it.
  { sku: 'MF-004', category: 'meat-fish', name: 'Smoked Bacon', priceCents: 35000, unitLabel: '300 g', stock: 18, isActive: false, description: 'Dry-cured, oak-smoked bacon rashers.' },

  // Frozen
  { sku: 'FZ-001', category: 'frozen', name: 'Vanilla Ice Cream', priceCents: 25000, unitLabel: '1 L tub', stock: 15, description: 'Creamy ice cream made with real vanilla.' },
  { sku: 'FZ-002', category: 'frozen', name: 'Margherita Pizza', priceCents: 29900, unitLabel: 'each', stock: 20, description: 'Stone-baked pizza with tomato and mozzarella.' },
  { sku: 'FZ-003', category: 'frozen', name: 'Mixed Berries', priceCents: 45000, unitLabel: '500 g', stock: 14, description: 'Blueberries, raspberries and blackberries — great in smoothies.' },
  { sku: 'FZ-004', category: 'frozen', name: 'Fish Fingers', priceCents: 32000, unitLabel: '10 pack', stock: 24, description: 'Crispy breaded fish fingers.' },
];

/**
 * Example delivery zones around the store in Pernambut (fees in paise).
 * SAMPLE VALUES — confirm the areas, PIN codes and fees, then edit them in the
 * staff dashboard (Delivery zones).
 */
export const seedDeliveryZones = [
  // ₹30 delivery, free over ₹500
  { name: 'Pernambut', postcodePrefixes: ['635810'], feeCents: 3000, freeDeliveryThresholdCents: 50000, minOrderCents: 0 },
  // ₹50 delivery, free over ₹999, minimum order ₹199
  { name: 'Ambur & Gudiyattam', postcodePrefixes: ['635802', '632602'], feeCents: 5000, freeDeliveryThresholdCents: 99900, minOrderCents: 19900 },
];

/** The sample customer's delivery address (inside the first delivery zone). */
export const sampleCustomerAddress = {
  line1: '10 Sample Street',
  city: 'Pernambut',
  postcode: '635810',
  instructions: 'Demo address — please call before delivering',
};

/**
 * Tamil names shown when the app is in Tamil (staff can edit them in the
 * dashboard). Branded products keep their English pack names.
 * Please have a native speaker check these before going live.
 */
export const categoryNamesTa: Record<string, string> = {
  'rice-dals': 'அரிசி, பருப்பு & தானியங்கள்',
  spices: 'மசாலாப் பொருட்கள்',
  'fruit-veg': 'பழங்கள் & காய்கறிகள்',
  'dairy-eggs': 'பால் பொருட்கள் & முட்டை',
  bakery: 'பேக்கரி',
  pantry: 'சமையலறைப் பொருட்கள்',
  snacks: 'தின்பண்டங்கள் & இனிப்புகள்',
  drinks: 'பானங்கள்',
  'personal-care': 'தனிநபர் பராமரிப்பு',
  household: 'வீட்டு உபயோகப் பொருட்கள்',
  'meat-fish': 'இறைச்சி & மீன்',
  frozen: 'உறைந்த உணவுகள்',
};

export const productNamesTa: Record<string, string> = {
  'RD-001': 'துவரம் பருப்பு',
  'RD-002': 'குண்டு உளுந்து',
  'RD-003': 'கடலைப் பருப்பு',
  'RD-004': 'பாசிப் பருப்பு',
  'RD-005': 'மைசூர் பருப்பு',
  'RD-006': 'பொன்னி புழுங்கல் அரிசி',
  'RD-007': 'பொன்னி புழுங்கல் அரிசி',
  'RD-008': 'பொன்னி பச்சரிசி',
  'RD-009': 'இட்லி அரிசி',
  'RD-010': 'தோசை அரிசி',
  'RD-011': 'கேழ்வரகு (முழு)',
  'RD-012': 'கேழ்வரகு மாவு',
  'SP-001': 'மஞ்சள் தூள்',
  'SP-002': 'மிளகாய்த் தூள்',
  'SP-003': 'மல்லித் தூள்',
  'SP-004': 'சீரகம்',
  'SP-005': 'கடுகு',
  'SP-006': 'மிளகு (முழு)',
  'SP-007': 'சாம்பார் பொடி',
  'SP-008': 'ரசப் பொடி',
  'SP-009': 'புளி (கொட்டை நீக்கியது)',
  'FV-001': 'வாழைப்பழம்',
  'FV-002': 'ஆப்பிள்',
  'FV-003': 'அவகேடோ',
  'FV-004': 'தக்காளி',
  'FV-005': 'கேரட்',
  'FV-006': 'ப்ரோக்கோலி',
  'FV-007': 'ஸ்ட்ராபெர்ரி',
  'FV-008': 'எலுமிச்சை',
  'FV-009': 'பசலைக் கீரை',
  'FV-010': 'பூசணிக்காய்',
  'DE-001': 'பால் (முழு கொழுப்பு)',
  'DE-002': 'முட்டை',
  'DE-005': 'வெண்ணெய்',
  'DE-007': 'நெஸ்லே a+ தயிர்',
  'MF-001': 'கோழி நெஞ்சுக்கறி',
  'MF-002': 'ஆட்டுக்கறி கீமா',
  'PA-002': 'பாஸ்மதி அரிசி',
  'PA-006': 'தேன்',
};

/** Example bundle offers. Offers are OFF until a manager switches them on (Store settings). */
export const seedPromotions = [
  {
    name: 'Sambar combo',
    nameTa: 'சாம்பார் காம்போ',
    description: 'Toor dal, sambar powder and tamarind together.',
    discountCents: 2000,
    items: [
      { sku: 'RD-001', quantity: 1 },
      { sku: 'SP-007', quantity: 1 },
      { sku: 'SP-009', quantity: 1 },
    ],
  },
  {
    name: 'Idli batter pack',
    nameTa: 'இட்லி மாவு பேக்',
    description: 'Idli rice and whole urad dal for a fresh batch of batter.',
    discountCents: 1500,
    items: [
      { sku: 'RD-009', quantity: 2 },
      { sku: 'RD-002', quantity: 1 },
    ],
  },
];
