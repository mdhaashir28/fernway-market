// Sample catalogue for LOCAL DEVELOPMENT and DEMOS.
//
// ⚠️ Every price and stock quantity here is SAMPLE DATA, not an official or
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
  icon: string;
  description: string;
  sortOrder: number;
}

export interface SeedProduct {
  sku: string;
  category: string; // category slug
  name: string;
  brand?: string;
  icon: string;
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
export const SAMPLE_DATA_VERSION = 'catalogue-2-meeranji';

/** Brand used for staples that the store weighs and packs itself. */
const STORE_PACKED = 'Store packed';

export const seedCategories: SeedCategory[] = [
  { slug: 'rice-dals', name: 'Rice, Dals & Grains', icon: '🌾', sortOrder: 1, description: 'Ponni, idli and dosa rice, dals and ragi' },
  { slug: 'spices', name: 'Spices & Masalas', icon: '🌶️', sortOrder: 2, description: 'Masala powders, whole spices and tamarind' },
  { slug: 'fruit-veg', name: 'Fruit & Veg', icon: '🥦', sortOrder: 3, description: 'Fresh fruit, vegetables and salad' },
  { slug: 'dairy-eggs', name: 'Dairy & Eggs', icon: '🧀', sortOrder: 4, description: 'Milk, curd, cheese, butter and eggs' },
  { slug: 'bakery', name: 'Bakery', icon: '🥖', sortOrder: 5, description: 'Bread, rolls and pastries baked every morning' },
  { slug: 'pantry', name: 'Pantry', icon: '🥫', sortOrder: 6, description: 'Noodles, sauces, oils, spreads and tins' },
  { slug: 'snacks', name: 'Snacks & Sweets', icon: '🍪', sortOrder: 7, description: 'Chips, chocolate, biscuits and popcorn' },
  { slug: 'drinks', name: 'Drinks', icon: '🧃', sortOrder: 8, description: 'Coffee, tea, juice, water and soft drinks' },
  { slug: 'personal-care', name: 'Personal Care', icon: '🧴', sortOrder: 9, description: 'Soaps, shampoos, toothpaste and skin care' },
  { slug: 'household', name: 'Household', icon: '🧽', sortOrder: 10, description: 'Detergents, dishwash, cleaners and everyday essentials' },
  { slug: 'meat-fish', name: 'Meat & Fish', icon: '🍗', sortOrder: 11, description: 'Fresh meat, poultry and seafood' },
  { slug: 'frozen', name: 'Frozen', icon: '🧊', sortOrder: 12, description: 'Ice cream, frozen meals and frozen fruit' },
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
  { sku: 'RD-001', category: 'rice-dals', name: 'Toor Dal (Thuvaram Paruppu)', brand: STORE_PACKED, icon: '🫘', priceCents: 15500, unitLabel: '1 kg', stock: 60, description: 'Split pigeon peas, cleaned and packed in store — the everyday dal for sambar, paruppu and kootu.' },
  { sku: 'RD-002', category: 'rice-dals', name: 'Urad Dal, Whole White (Gundu Ulundhu)', brand: STORE_PACKED, icon: '🫘', priceCents: 15000, unitLabel: '1 kg', stock: 45, description: 'Whole skinned black gram for soft idli and crisp dosa batter, vadai and tempering.' },
  { sku: 'RD-003', category: 'rice-dals', name: 'Chana Dal (Kadalai Paruppu)', brand: STORE_PACKED, icon: '🫘', priceCents: 9800, unitLabel: '1 kg', stock: 50, description: 'Split Bengal gram for vadai, kootu, chutney and tempering.' },
  { sku: 'RD-004', category: 'rice-dals', name: 'Moong Dal (Paasi Paruppu)', brand: STORE_PACKED, icon: '🫘', priceCents: 12800, unitLabel: '1 kg', stock: 40, description: 'Split yellow moong dal for pongal, payasam and light, quick-cooking dal.' },
  { sku: 'RD-005', category: 'rice-dals', name: 'Masoor Dal (Mysore Paruppu)', brand: STORE_PACKED, icon: '🫘', priceCents: 10500, unitLabel: '1 kg', stock: 35, description: 'Split red lentils that cook quickly without soaking — good for dal and kuzhambu.' },
  { sku: 'RD-006', category: 'rice-dals', name: 'Ponni Boiled Rice', brand: STORE_PACKED, icon: '🍚', priceCents: 34000, unitLabel: '5 kg', stock: 40, description: 'Medium-grain Ponni parboiled rice that cooks soft and separate — the everyday rice for meals.' },
  { sku: 'RD-007', category: 'rice-dals', name: 'Ponni Boiled Rice', brand: STORE_PACKED, icon: '🍚', priceCents: 157500, unitLabel: '25 kg bag', stock: 12, lowStockThreshold: 5, description: 'Ponni parboiled rice in a 25 kg bag for the month.' },
  { sku: 'RD-008', category: 'rice-dals', name: 'Ponni Raw Rice (Pachai Arisi)', brand: STORE_PACKED, icon: '🍚', priceCents: 6400, unitLabel: '1 kg', stock: 30, description: 'Raw Ponni rice for sweet pongal, ven pongal and payasam.' },
  { sku: 'RD-009', category: 'rice-dals', name: 'Idli Rice (Idli Arisi)', brand: STORE_PACKED, icon: '🍚', priceCents: 5200, unitLabel: '1 kg', stock: 50, description: 'Short-grain parboiled rice for soft, fluffy idlis. Soak with urad dal and grind.' },
  { sku: 'RD-010', category: 'rice-dals', name: 'Dosa Rice (Dosai Arisi)', brand: STORE_PACKED, icon: '🍚', priceCents: 5600, unitLabel: '1 kg', stock: 35, description: 'Rice for dosa batter that gives thin, golden, crisp dosas.' },
  { sku: 'RD-011', category: 'rice-dals', name: 'Ragi, Whole (Kezhvaragu)', brand: STORE_PACKED, icon: '🌾', priceCents: 6200, unitLabel: '1 kg', stock: 25, description: 'Whole finger millet, cleaned — for sprouting, malt or grinding at home.' },
  { sku: 'RD-012', category: 'rice-dals', name: 'Ragi Flour (Kezhvaragu Maavu)', brand: STORE_PACKED, icon: '🌾', priceCents: 3800, unitLabel: '500 g', stock: 30, description: 'Finger millet flour for ragi dosa, kali, koozh and porridge.' },

  // Spices & Masalas (store packed)
  { sku: 'SP-001', category: 'spices', name: 'Turmeric Powder (Manjal Thool)', brand: STORE_PACKED, icon: '🟡', priceCents: 3600, unitLabel: '100 g', stock: 50, description: 'Bright, earthy ground turmeric for sambar, kuzhambu, poriyal and rasam.' },
  { sku: 'SP-002', category: 'spices', name: 'Red Chilli Powder (Milagai Thool)', brand: STORE_PACKED, icon: '🌶️', priceCents: 4200, unitLabel: '100 g', stock: 45, description: 'Ground dried red chillies for heat and colour in curries and fries.' },
  { sku: 'SP-003', category: 'spices', name: 'Coriander Powder (Malli Thool)', brand: STORE_PACKED, icon: '🌿', priceCents: 3000, unitLabel: '100 g', stock: 45, description: 'Ground coriander seeds with a warm, citrusy aroma for kuzhambu and curries.' },
  { sku: 'SP-004', category: 'spices', name: 'Cumin Seeds (Seeragam)', brand: STORE_PACKED, icon: '🌱', priceCents: 5500, unitLabel: '100 g', stock: 40, description: 'Whole cumin for tempering, rasam, jeera rice and buttermilk.' },
  { sku: 'SP-005', category: 'spices', name: 'Mustard Seeds (Kadugu)', brand: STORE_PACKED, icon: '🟤', priceCents: 1800, unitLabel: '100 g', stock: 60, description: 'Small dark mustard seeds — the first crackle of every South Indian tempering.' },
  { sku: 'SP-006', category: 'spices', name: 'Black Pepper, Whole (Milagu)', brand: STORE_PACKED, icon: '⚫', priceCents: 8200, unitLabel: '100 g', stock: 30, description: 'Whole black peppercorns for rasam, pepper chicken, pongal and milagu kuzhambu.' },
  { sku: 'SP-007', category: 'spices', name: 'Sambar Powder', brand: STORE_PACKED, icon: '🍲', priceCents: 7200, unitLabel: '200 g', stock: 40, description: 'A roasted blend of coriander, chilli, dals and spices for everyday sambar.' },
  { sku: 'SP-008', category: 'spices', name: 'Rasam Powder', brand: STORE_PACKED, icon: '🍲', priceCents: 4000, unitLabel: '100 g', stock: 30, description: 'Peppery, cumin-rich blend for quick tomato or lemon rasam.' },
  { sku: 'SP-009', category: 'spices', name: 'Tamarind, Seedless (Puli)', brand: STORE_PACKED, icon: '🟫', priceCents: 5500, unitLabel: '250 g', stock: 35, description: 'Seedless tamarind block for kuzhambu, rasam, puliyodharai and chutneys. Soak in warm water and squeeze.' },

  // Fruit & Veg
  { sku: 'FV-001', category: 'fruit-veg', name: 'Bananas', icon: '🍌', priceCents: 4500, unitLabel: '6 pcs', stock: 80, description: 'Ripe, sweet bananas — perfect for breakfast, smoothies or baking.' },
  { sku: 'FV-002', category: 'fruit-veg', name: 'Gala Apples', icon: '🍎', priceCents: 19900, unitLabel: '1 kg', stock: 40, description: 'Crisp, juicy apples with a mild, sweet flavour.' },
  { sku: 'FV-003', category: 'fruit-veg', name: 'Hass Avocados', icon: '🥑', priceCents: 14900, unitLabel: 'each', stock: 6, description: 'Creamy avocados, ready to eat in 1–2 days.' },
  { sku: 'FV-004', category: 'fruit-veg', name: 'Vine Tomatoes', icon: '🍅', priceCents: 4000, unitLabel: '500 g', stock: 35, description: 'Fragrant tomatoes ripened on the vine.' },
  { sku: 'FV-005', category: 'fruit-veg', name: 'Carrots', icon: '🥕', priceCents: 6000, unitLabel: '1 kg', stock: 50, description: 'Sweet, crunchy carrots for snacking, halwa, curries or soups.' },
  { sku: 'FV-006', category: 'fruit-veg', name: 'Broccoli', icon: '🥦', priceCents: 7900, unitLabel: 'each', stock: 25, description: 'Fresh green broccoli heads, great steamed or stir-fried.' },
  { sku: 'FV-007', category: 'fruit-veg', name: 'Strawberries', icon: '🍓', priceCents: 19900, unitLabel: '400 g punnet', stock: 0, description: 'Sweet, juicy strawberries picked at their best.' },
  { sku: 'FV-008', category: 'fruit-veg', name: 'Lemons', icon: '🍋', priceCents: 3000, unitLabel: 'pack of 4', stock: 30, description: 'Juicy lemons for cooking, lemon rice, nimbu pani and pickles.' },
  { sku: 'FV-009', category: 'fruit-veg', name: 'Baby Spinach', icon: '🥬', priceCents: 4900, unitLabel: '200 g bag', stock: 18, description: 'Washed and ready-to-eat tender spinach leaves.' },
  { sku: 'FV-010', category: 'fruit-veg', name: 'Pumpkin', icon: '🎃', priceCents: 8900, unitLabel: 'each', stock: 0, isActive: false, description: 'Seasonal pumpkin — back soon.' },

  // Dairy & Eggs
  { sku: 'DE-001', category: 'dairy-eggs', name: 'Full Cream Milk', icon: '🥛', priceCents: 6800, unitLabel: '1 L', stock: 60, description: 'Fresh full cream milk from local dairies.' },
  { sku: 'DE-002', category: 'dairy-eggs', name: 'Free-Range Eggs', icon: '🥚', priceCents: 12000, unitLabel: '12 pack', stock: 40, description: 'Large free-range eggs.' },
  { sku: 'DE-003', category: 'dairy-eggs', name: 'Mature Cheddar', icon: '🧀', priceCents: 45000, unitLabel: '400 g', stock: 22, description: 'Rich, tangy cheddar aged for 9 months.' },
  { sku: 'DE-004', category: 'dairy-eggs', name: 'Greek-Style Yogurt', icon: '🥣', priceCents: 13000, unitLabel: '500 g', stock: 15, description: 'Thick and creamy natural yogurt.' },
  { sku: 'DE-005', category: 'dairy-eggs', name: 'Salted Butter', icon: '🧈', priceCents: 14000, unitLabel: '250 g', stock: 30, description: 'Creamy salted butter, great on warm toast.' },
  { sku: 'DE-006', category: 'dairy-eggs', name: 'Nestlé a+ Nourish Toned Milk', brand: 'Nestlé a+', icon: '🥛', priceCents: 7600, unitLabel: '1 L carton', stock: 36, description: 'Long-life toned milk in a carton — keeps unopened without a fridge. Refrigerate after opening.' },
  { sku: 'DE-007', category: 'dairy-eggs', name: 'Nestlé a+ Dahi', brand: 'Nestlé a+', icon: '🥣', priceCents: 5000, unitLabel: '400 g cup', stock: 20, description: 'Set curd for curd rice, raita and buttermilk. Keep refrigerated.' },
  { sku: 'DE-008', category: 'dairy-eggs', name: 'Nestlé Everyday Dairy Whitener', brand: 'Everyday', icon: '🥛', priceCents: 23500, unitLabel: '400 g pouch', stock: 24, description: 'Dairy whitener powder for a creamy cup of tea or coffee.' },

  // Bakery
  { sku: 'BK-001', category: 'bakery', name: 'Sourdough Loaf', icon: '🍞', priceCents: 22000, unitLabel: '800 g', stock: 12, description: 'Slow-fermented sourdough with a crisp, chewy crust.' },
  { sku: 'BK-002', category: 'bakery', name: 'Butter Croissants', icon: '🥐', priceCents: 18000, unitLabel: 'pack of 4', stock: 4, description: 'Flaky, all-butter croissants baked in store.' },
  { sku: 'BK-003', category: 'bakery', name: 'Seeded Bagels', icon: '🥯', priceCents: 15000, unitLabel: 'pack of 5', stock: 20, description: 'Soft, chewy bagels topped with mixed seeds.' },
  { sku: 'BK-004', category: 'bakery', name: 'French Baguette', icon: '🥖', priceCents: 9000, unitLabel: 'each', stock: 25, description: 'Classic crusty baguette, baked fresh daily.' },

  // Pantry
  { sku: 'PA-001', category: 'pantry', name: 'Spaghetti', icon: '🍝', priceCents: 12000, unitLabel: '500 g', stock: 70, description: 'Durum wheat spaghetti, cooks in 10 minutes.' },
  { sku: 'PA-002', category: 'pantry', name: 'Basmati Rice', icon: '🍚', priceCents: 16000, unitLabel: '1 kg', stock: 45, description: 'Fragrant, aged long-grain basmati rice for biryani and pulao.' },
  { sku: 'PA-003', category: 'pantry', name: 'Chopped Tomatoes', icon: '🥫', priceCents: 11000, unitLabel: '400 g can', stock: 90, description: 'Italian chopped tomatoes in rich juice.' },
  { sku: 'PA-004', category: 'pantry', name: 'Extra Virgin Olive Oil', icon: '🫒', priceCents: 65000, unitLabel: '500 ml', stock: 16, description: 'Cold-pressed olive oil with a fruity, peppery finish.' },
  { sku: 'PA-005', category: 'pantry', name: 'Crunchy Peanut Butter', icon: '🥜', priceCents: 19900, unitLabel: '340 g jar', stock: 25, description: 'Roasted peanuts with no added sugar.' },
  { sku: 'PA-006', category: 'pantry', name: 'Wildflower Honey', icon: '🍯', priceCents: 25000, unitLabel: '350 g jar', stock: 12, description: 'Smooth, golden honey from local beekeepers.' },
  { sku: 'PA-007', category: 'pantry', name: 'Maggi 2-Minute Masala Noodles', brand: 'Maggi', icon: '🍜', priceCents: 5600, unitLabel: '280 g (4 × 70 g)', stock: 80, description: "Nestlé's instant masala noodles with tastemaker — a quick snack or tiffin." },
  { sku: 'PA-008', category: 'pantry', name: 'Maggi Rich Tomato Ketchup', brand: 'Maggi', icon: '🍅', priceCents: 15500, unitLabel: '1 kg bottle', stock: 20, description: 'Thick tomato ketchup from Nestlé for snacks, sandwiches and fries.' },
  { sku: 'PA-009', category: 'pantry', name: 'Nestlé Milkmaid Sweetened Condensed Milk', brand: 'Milkmaid', icon: '🥫', priceCents: 15000, unitLabel: '380 g tin', stock: 18, description: 'Sweetened condensed milk for payasam, kesari, burfi and desserts.' },

  // Snacks & Sweets
  { sku: 'SN-001', category: 'snacks', name: 'Salted Potato Chips', icon: '🥔', priceCents: 9900, unitLabel: '150 g', stock: 40, description: 'Thick-cut potato chips with a pinch of sea salt.' },
  { sku: 'SN-002', category: 'snacks', name: 'Dark Chocolate 70%', icon: '🍫', priceCents: 17500, unitLabel: '100 g', stock: 35, description: 'Smooth dark chocolate made with 70% cocoa.' },
  { sku: 'SN-003', category: 'snacks', name: 'Chocolate Chip Cookies', icon: '🍪', priceCents: 12000, unitLabel: '200 g', stock: 28, description: 'Crunchy cookies packed with chocolate chips.' },
  { sku: 'SN-004', category: 'snacks', name: 'Salted Popcorn', icon: '🍿', priceCents: 6000, unitLabel: '100 g', stock: 2, description: 'Light and crunchy popcorn with a pinch of salt.' },
  { sku: 'SN-005', category: 'snacks', name: 'Nestlé KitKat 4 Finger', brand: 'KitKat', icon: '🍫', priceCents: 4000, unitLabel: '37.3 g bar', stock: 60, description: 'Crisp wafer fingers covered in milk chocolate.' },
  { sku: 'SN-006', category: 'snacks', name: 'Nestlé Munch Chocolate Wafer', brand: 'Munch', icon: '🍫', priceCents: 5000, unitLabel: 'pack of 10 bars', stock: 40, description: 'Crunchy chocolate-coated wafer bars — handy for lunch boxes.' },

  // Drinks
  { sku: 'DR-001', category: 'drinks', name: 'Orange Juice', icon: '🧃', priceCents: 12000, unitLabel: '1 L', stock: 40, description: '100% orange juice with no added sugar.' },
  { sku: 'DR-002', category: 'drinks', name: 'Sparkling Water', icon: '💧', priceCents: 9000, unitLabel: '750 ml', stock: 80, description: 'Naturally sourced sparkling mineral water.' },
  { sku: 'DR-003', category: 'drinks', name: 'Ground Coffee', icon: '☕', priceCents: 45000, unitLabel: '250 g', stock: 20, description: 'Medium roast with notes of chocolate and caramel.' },
  { sku: 'DR-004', category: 'drinks', name: 'Assam Tea Bags', icon: '🍵', priceCents: 22000, unitLabel: '100 bags', stock: 25, description: 'A strong, full-bodied everyday tea — perfect for chai.' },
  { sku: 'DR-005', category: 'drinks', name: 'Cola', icon: '🥤', priceCents: 24000, unitLabel: '6 × 300 ml', stock: 30, description: 'Classic cola in cans.' },
  { sku: 'DR-006', category: 'drinks', name: 'Nescafé Classic Instant Coffee', brand: 'Nescafé', icon: '☕', priceCents: 20000, unitLabel: '50 g jar', stock: 25, description: "Nestlé's pure instant coffee — stir into hot milk or water." },
  { sku: 'DR-007', category: 'drinks', name: 'Nescafé Sunrise Instant Coffee-Chicory Mix', brand: 'Nescafé', icon: '☕', priceCents: 22500, unitLabel: '100 g', stock: 20, description: 'Instant coffee blended with chicory for a strong, filter-style cup.' },

  // Personal Care (Hindustan Unilever brands)
  { sku: 'PC-001', category: 'personal-care', name: 'Lux Soft Glow Rose & Vitamin E Soap', brand: 'Lux', icon: '🧼', priceCents: 15000, unitLabel: '4 × 100 g', stock: 40, description: 'Rose-scented beauty soap bars from Hindustan Unilever.' },
  { sku: 'PC-002', category: 'personal-care', name: 'Lifebuoy Total 10 Soap', brand: 'Lifebuoy', icon: '🧼', priceCents: 12500, unitLabel: '4 × 100 g', stock: 50, description: 'Everyday family bathing soap from Hindustan Unilever.' },
  { sku: 'PC-003', category: 'personal-care', name: 'Dove Cream Beauty Bathing Bar', brand: 'Dove', icon: '🧼', priceCents: 19900, unitLabel: '3 × 100 g', stock: 24, description: 'Gentle, moisturising bathing bar for soft skin.' },
  { sku: 'PC-004', category: 'personal-care', name: 'Pears Pure & Gentle Soap', brand: 'Pears', icon: '🧼', priceCents: 23500, unitLabel: '3 × 125 g', stock: 20, description: 'The classic transparent glycerine soap.' },
  { sku: 'PC-005', category: 'personal-care', name: 'Hamam Neem, Tulsi & Aloe Vera Soap', brand: 'Hamam', icon: '🧼', priceCents: 15500, unitLabel: '3 × 150 g', stock: 45, description: 'Family soap with neem, tulsi and aloe vera.' },
  { sku: 'PC-006', category: 'personal-care', name: 'Clinic Plus Strong & Long Shampoo', brand: 'Clinic Plus', icon: '🧴', priceCents: 19900, unitLabel: '355 ml', stock: 22, description: 'Everyday family shampoo for strong, long hair.' },
  { sku: 'PC-007', category: 'personal-care', name: 'Sunsilk Stunning Black Shine Shampoo', brand: 'Sunsilk', icon: '🧴', priceCents: 14000, unitLabel: '180 ml', stock: 18, description: 'Shampoo for dark, shiny-looking hair.' },
  { sku: 'PC-008', category: 'personal-care', name: 'Dove Intense Repair Shampoo', brand: 'Dove', icon: '🧴', priceCents: 18500, unitLabel: '180 ml', stock: 6, description: 'Nourishing shampoo for dry, damaged hair.' },
  { sku: 'PC-009', category: 'personal-care', name: 'Close Up Ever Fresh Red Hot Gel Toothpaste', brand: 'Close Up', icon: '🪥', priceCents: 11000, unitLabel: '150 g', stock: 35, description: 'Red gel toothpaste for fresh breath.' },
  { sku: 'PC-010', category: 'personal-care', name: 'Pepsodent Germicheck Toothpaste', brand: 'Pepsodent', icon: '🪥', priceCents: 9900, unitLabel: '150 g', stock: 35, description: 'Everyday family toothpaste.' },
  { sku: 'PC-011', category: 'personal-care', name: 'Vaseline Intensive Care Deep Moisture Body Lotion', brand: 'Vaseline', icon: '🧴', priceCents: 45000, unitLabel: '400 ml', stock: 12, description: 'Body lotion for dry skin.' },

  // Household (HH-005 onwards: Hindustan Unilever brands)
  { sku: 'HH-001', category: 'household', name: 'Dishwash Liquid', icon: '🧴', priceCents: 11000, unitLabel: '500 ml', stock: 30, description: 'Tough on grease, gentle on hands.' },
  { sku: 'HH-002', category: 'household', name: 'Toilet Tissue', icon: '🧻', priceCents: 39900, unitLabel: '9 rolls', stock: 20, description: 'Soft and strong 3-ply toilet tissue.' },
  { sku: 'HH-003', category: 'household', name: 'Kitchen Sponges', icon: '🧽', priceCents: 9900, unitLabel: 'pack of 4', stock: 35, description: 'Dual-sided scrub sponges.' },
  { sku: 'HH-004', category: 'household', name: 'Laundry Detergent', icon: '🫧', priceCents: 49900, unitLabel: '1.5 L', stock: 8, description: 'Concentrated liquid detergent for 40 washes.' },
  { sku: 'HH-005', category: 'household', name: 'Surf Excel Easy Wash Detergent Powder', brand: 'Surf Excel', icon: '🫧', priceCents: 14000, unitLabel: '1 kg', stock: 40, description: 'Detergent powder for bucket and hand washing, from Hindustan Unilever.' },
  { sku: 'HH-006', category: 'household', name: 'Surf Excel Detergent Bar', brand: 'Surf Excel', icon: '🧼', priceCents: 3500, unitLabel: '250 g', stock: 50, description: 'Detergent bar for scrubbing collars, cuffs and tough stains.' },
  { sku: 'HH-007', category: 'household', name: 'Rin Detergent Powder', brand: 'Rin', icon: '🫧', priceCents: 10500, unitLabel: '1 kg', stock: 35, description: 'Detergent powder for bright whites, from Hindustan Unilever.' },
  { sku: 'HH-008', category: 'household', name: 'Rin Detergent Bar', brand: 'Rin', icon: '🧼', priceCents: 2500, unitLabel: '250 g', stock: 60, description: 'Everyday detergent bar for hand washing.' },
  { sku: 'HH-009', category: 'household', name: 'Wheel Active 2 in 1 Detergent Powder', brand: 'Wheel', icon: '🫧', priceCents: 7000, unitLabel: '1 kg', stock: 45, description: 'Value detergent powder for everyday laundry, from Hindustan Unilever.' },
  { sku: 'HH-010', category: 'household', name: 'Vim Dishwash Bar', brand: 'Vim', icon: '🧽', priceCents: 3000, unitLabel: '300 g', stock: 50, description: 'Lemon dishwash bar for pots, pans and plates.' },
  { sku: 'HH-011', category: 'household', name: 'Vim Dishwash Liquid Gel, Lemon', brand: 'Vim', icon: '🧴', priceCents: 11000, unitLabel: '500 ml bottle', stock: 25, description: 'Dishwash gel that cuts through grease — a little goes a long way.' },
  { sku: 'HH-012', category: 'household', name: 'Domex Disinfectant Toilet Cleaner', brand: 'Domex', icon: '🚽', priceCents: 10500, unitLabel: '500 ml', stock: 20, description: 'Thick toilet cleaner, from Hindustan Unilever. Keep out of reach of children.' },
  { sku: 'HH-013', category: 'household', name: 'Comfort After Wash Fabric Conditioner, Morning Fresh', brand: 'Comfort', icon: '🫧', priceCents: 23000, unitLabel: '860 ml', stock: 15, description: 'Fabric conditioner for soft, fresh-smelling clothes. Add to the last rinse.' },

  // Meat & Fish
  { sku: 'MF-001', category: 'meat-fish', name: 'Chicken Breast Fillets', icon: '🍗', priceCents: 29900, unitLabel: '500 g', stock: 20, description: 'Skinless, boneless chicken breast fillets.' },
  { sku: 'MF-002', category: 'meat-fish', name: 'Mutton Keema', icon: '🥩', priceCents: 42000, unitLabel: '500 g', stock: 3, description: 'Freshly minced mutton — ideal for keema, kebabs and cutlets.' },
  { sku: 'MF-003', category: 'meat-fish', name: 'Salmon Fillets', icon: '🐟', priceCents: 69900, unitLabel: '2 pack, 240 g', stock: 10, description: 'Boneless, skin-on salmon fillets.' },
  // Hidden by default for this store; tick "Visible to customers" in the dashboard to sell it.
  { sku: 'MF-004', category: 'meat-fish', name: 'Smoked Bacon', icon: '🥓', priceCents: 35000, unitLabel: '300 g', stock: 18, isActive: false, description: 'Dry-cured, oak-smoked bacon rashers.' },

  // Frozen
  { sku: 'FZ-001', category: 'frozen', name: 'Vanilla Ice Cream', icon: '🍨', priceCents: 25000, unitLabel: '1 L tub', stock: 15, description: 'Creamy ice cream made with real vanilla.' },
  { sku: 'FZ-002', category: 'frozen', name: 'Margherita Pizza', icon: '🍕', priceCents: 29900, unitLabel: 'each', stock: 20, description: 'Stone-baked pizza with tomato and mozzarella.' },
  { sku: 'FZ-003', category: 'frozen', name: 'Mixed Berries', icon: '🫐', priceCents: 45000, unitLabel: '500 g', stock: 14, description: 'Blueberries, raspberries and blackberries — great in smoothies.' },
  { sku: 'FZ-004', category: 'frozen', name: 'Fish Fingers', icon: '🐠', priceCents: 32000, unitLabel: '10 pack', stock: 24, description: 'Crispy breaded fish fingers.' },
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
