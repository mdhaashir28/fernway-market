// Sample catalogue used for LOCAL DEVELOPMENT ONLY.
// Prices are in Indian rupees, stored in paise (the "cents" of a rupee):
// 4500 = ₹45.00. Change or extend freely.

export interface SeedCategory {
  slug: string;
  name: string;
  icon: string;
  description: string;
}

export interface SeedProduct {
  sku: string;
  category: string; // category slug
  name: string;
  icon: string;
  priceCents: number; // paise
  unitLabel: string;
  stock: number;
  lowStockThreshold?: number;
  isActive?: boolean;
  description: string;
}

export const seedCategories: SeedCategory[] = [
  { slug: 'fruit-veg', name: 'Fruit & Veg', icon: '🥦', description: 'Fresh fruit, vegetables and salad' },
  { slug: 'bakery', name: 'Bakery', icon: '🥖', description: 'Bread, rolls and pastries baked every morning' },
  { slug: 'dairy-eggs', name: 'Dairy & Eggs', icon: '🧀', description: 'Milk, cheese, yogurt, butter and eggs' },
  { slug: 'meat-fish', name: 'Meat & Fish', icon: '🍗', description: 'Fresh meat, poultry and seafood' },
  { slug: 'pantry', name: 'Pantry', icon: '🥫', description: 'Pasta, rice, tins, oils and spreads' },
  { slug: 'drinks', name: 'Drinks', icon: '🧃', description: 'Juice, water, coffee, tea and soft drinks' },
  { slug: 'snacks', name: 'Snacks & Sweets', icon: '🍪', description: 'Crisps, chocolate, biscuits and popcorn' },
  { slug: 'frozen', name: 'Frozen', icon: '🧊', description: 'Ice cream, frozen meals and frozen fruit' },
  { slug: 'household', name: 'Household', icon: '🧽', description: 'Cleaning and everyday essentials' },
];

export const seedProducts: SeedProduct[] = [
  // Fruit & Veg
  { sku: 'FV-001', category: 'fruit-veg', name: 'Bananas', icon: '🍌', priceCents: 4500, unitLabel: '6 pcs', stock: 80, description: 'Ripe, sweet bananas — perfect for breakfast, smoothies or baking.' },
  { sku: 'FV-002', category: 'fruit-veg', name: 'Gala Apples', icon: '🍎', priceCents: 19900, unitLabel: '1 kg', stock: 40, description: 'Crisp, juicy apples with a mild, sweet flavour.' },
  { sku: 'FV-003', category: 'fruit-veg', name: 'Hass Avocados', icon: '🥑', priceCents: 14900, unitLabel: 'each', stock: 6, description: 'Creamy avocados, ready to eat in 1–2 days.' },
  { sku: 'FV-004', category: 'fruit-veg', name: 'Vine Tomatoes', icon: '🍅', priceCents: 4000, unitLabel: '500 g', stock: 35, description: 'Fragrant tomatoes ripened on the vine.' },
  { sku: 'FV-005', category: 'fruit-veg', name: 'Carrots', icon: '🥕', priceCents: 6000, unitLabel: '1 kg', stock: 50, description: 'Sweet, crunchy carrots for snacking, halwa, curries or soups.' },
  { sku: 'FV-006', category: 'fruit-veg', name: 'Broccoli', icon: '🥦', priceCents: 7900, unitLabel: 'each', stock: 25, description: 'Fresh green broccoli heads, great steamed or stir-fried.' },
  { sku: 'FV-007', category: 'fruit-veg', name: 'Strawberries', icon: '🍓', priceCents: 19900, unitLabel: '400 g punnet', stock: 0, description: 'Sweet, juicy strawberries picked at their best.' },
  { sku: 'FV-008', category: 'fruit-veg', name: 'Lemons', icon: '🍋', priceCents: 3000, unitLabel: 'pack of 4', stock: 30, description: 'Juicy lemons for cooking, nimbu pani and pickles.' },
  { sku: 'FV-009', category: 'fruit-veg', name: 'Baby Spinach', icon: '🥬', priceCents: 4900, unitLabel: '200 g bag', stock: 18, description: 'Washed and ready-to-eat tender spinach leaves.' },
  { sku: 'FV-010', category: 'fruit-veg', name: 'Pumpkin', icon: '🎃', priceCents: 8900, unitLabel: 'each', stock: 0, isActive: false, description: 'Seasonal pumpkin — back soon.' },

  // Bakery
  { sku: 'BK-001', category: 'bakery', name: 'Sourdough Loaf', icon: '🍞', priceCents: 22000, unitLabel: '800 g', stock: 12, description: 'Slow-fermented sourdough with a crisp, chewy crust.' },
  { sku: 'BK-002', category: 'bakery', name: 'Butter Croissants', icon: '🥐', priceCents: 18000, unitLabel: 'pack of 4', stock: 4, description: 'Flaky, all-butter croissants baked in store.' },
  { sku: 'BK-003', category: 'bakery', name: 'Seeded Bagels', icon: '🥯', priceCents: 15000, unitLabel: 'pack of 5', stock: 20, description: 'Soft, chewy bagels topped with mixed seeds.' },
  { sku: 'BK-004', category: 'bakery', name: 'French Baguette', icon: '🥖', priceCents: 9000, unitLabel: 'each', stock: 25, description: 'Classic crusty baguette, baked fresh daily.' },

  // Dairy & Eggs
  { sku: 'DE-001', category: 'dairy-eggs', name: 'Full Cream Milk', icon: '🥛', priceCents: 6800, unitLabel: '1 L', stock: 60, description: 'Fresh full cream milk from local dairies.' },
  { sku: 'DE-002', category: 'dairy-eggs', name: 'Free-Range Eggs', icon: '🥚', priceCents: 12000, unitLabel: '12 pack', stock: 40, description: 'Large free-range eggs.' },
  { sku: 'DE-003', category: 'dairy-eggs', name: 'Mature Cheddar', icon: '🧀', priceCents: 45000, unitLabel: '400 g', stock: 22, description: 'Rich, tangy cheddar aged for 9 months.' },
  { sku: 'DE-004', category: 'dairy-eggs', name: 'Greek-Style Yogurt', icon: '🥣', priceCents: 13000, unitLabel: '500 g', stock: 15, description: 'Thick and creamy natural yogurt.' },
  { sku: 'DE-005', category: 'dairy-eggs', name: 'Salted Butter', icon: '🧈', priceCents: 14000, unitLabel: '250 g', stock: 30, description: 'Creamy salted butter, great on warm toast.' },

  // Meat & Fish
  { sku: 'MF-001', category: 'meat-fish', name: 'Chicken Breast Fillets', icon: '🍗', priceCents: 29900, unitLabel: '500 g', stock: 20, description: 'Skinless, boneless chicken breast fillets.' },
  { sku: 'MF-002', category: 'meat-fish', name: 'Mutton Keema', icon: '🥩', priceCents: 42000, unitLabel: '500 g', stock: 3, description: 'Freshly minced mutton — ideal for keema, kebabs and cutlets.' },
  { sku: 'MF-003', category: 'meat-fish', name: 'Salmon Fillets', icon: '🐟', priceCents: 69900, unitLabel: '2 pack, 240 g', stock: 10, description: 'Boneless, skin-on salmon fillets.' },
  { sku: 'MF-004', category: 'meat-fish', name: 'Smoked Bacon', icon: '🥓', priceCents: 35000, unitLabel: '300 g', stock: 18, description: 'Dry-cured, oak-smoked bacon rashers.' },

  // Pantry
  { sku: 'PA-001', category: 'pantry', name: 'Spaghetti', icon: '🍝', priceCents: 12000, unitLabel: '500 g', stock: 70, description: 'Durum wheat spaghetti, cooks in 10 minutes.' },
  { sku: 'PA-002', category: 'pantry', name: 'Basmati Rice', icon: '🍚', priceCents: 16000, unitLabel: '1 kg', stock: 45, description: 'Fragrant, aged long-grain basmati rice.' },
  { sku: 'PA-003', category: 'pantry', name: 'Chopped Tomatoes', icon: '🥫', priceCents: 11000, unitLabel: '400 g can', stock: 90, description: 'Italian chopped tomatoes in rich juice.' },
  { sku: 'PA-004', category: 'pantry', name: 'Extra Virgin Olive Oil', icon: '🫒', priceCents: 65000, unitLabel: '500 ml', stock: 16, description: 'Cold-pressed olive oil with a fruity, peppery finish.' },
  { sku: 'PA-005', category: 'pantry', name: 'Crunchy Peanut Butter', icon: '🥜', priceCents: 19900, unitLabel: '340 g jar', stock: 25, description: 'Roasted peanuts with no added sugar.' },
  { sku: 'PA-006', category: 'pantry', name: 'Wildflower Honey', icon: '🍯', priceCents: 25000, unitLabel: '350 g jar', stock: 12, description: 'Smooth, golden honey from local beekeepers.' },

  // Drinks
  { sku: 'DR-001', category: 'drinks', name: 'Orange Juice', icon: '🧃', priceCents: 12000, unitLabel: '1 L', stock: 40, description: '100% orange juice with no added sugar.' },
  { sku: 'DR-002', category: 'drinks', name: 'Sparkling Water', icon: '💧', priceCents: 9000, unitLabel: '750 ml', stock: 80, description: 'Naturally sourced sparkling mineral water.' },
  { sku: 'DR-003', category: 'drinks', name: 'Ground Coffee', icon: '☕', priceCents: 45000, unitLabel: '250 g', stock: 20, description: 'Medium roast with notes of chocolate and caramel.' },
  { sku: 'DR-004', category: 'drinks', name: 'Assam Tea Bags', icon: '🍵', priceCents: 22000, unitLabel: '100 bags', stock: 25, description: 'A strong, full-bodied everyday tea — perfect for chai.' },
  { sku: 'DR-005', category: 'drinks', name: 'Cola', icon: '🥤', priceCents: 24000, unitLabel: '6 × 300 ml', stock: 30, description: 'Classic cola in cans.' },

  // Snacks & Sweets
  { sku: 'SN-001', category: 'snacks', name: 'Salted Potato Chips', icon: '🥔', priceCents: 9900, unitLabel: '150 g', stock: 40, description: 'Thick-cut potato chips with a pinch of sea salt.' },
  { sku: 'SN-002', category: 'snacks', name: 'Dark Chocolate 70%', icon: '🍫', priceCents: 17500, unitLabel: '100 g', stock: 35, description: 'Smooth dark chocolate made with 70% cocoa.' },
  { sku: 'SN-003', category: 'snacks', name: 'Chocolate Chip Cookies', icon: '🍪', priceCents: 12000, unitLabel: '200 g', stock: 28, description: 'Crunchy cookies packed with chocolate chips.' },
  { sku: 'SN-004', category: 'snacks', name: 'Salted Popcorn', icon: '🍿', priceCents: 6000, unitLabel: '100 g', stock: 2, description: 'Light and crunchy popcorn with a pinch of salt.' },

  // Frozen
  { sku: 'FZ-001', category: 'frozen', name: 'Vanilla Ice Cream', icon: '🍨', priceCents: 25000, unitLabel: '1 L tub', stock: 15, description: 'Creamy ice cream made with real vanilla.' },
  { sku: 'FZ-002', category: 'frozen', name: 'Margherita Pizza', icon: '🍕', priceCents: 29900, unitLabel: 'each', stock: 20, description: 'Stone-baked pizza with tomato and mozzarella.' },
  { sku: 'FZ-003', category: 'frozen', name: 'Mixed Berries', icon: '🫐', priceCents: 45000, unitLabel: '500 g', stock: 14, description: 'Blueberries, raspberries and blackberries — great in smoothies.' },
  { sku: 'FZ-004', category: 'frozen', name: 'Fish Fingers', icon: '🐠', priceCents: 32000, unitLabel: '10 pack', stock: 24, description: 'Crispy breaded fish fingers.' },

  // Household
  { sku: 'HH-001', category: 'household', name: 'Dishwash Liquid', icon: '🧴', priceCents: 11000, unitLabel: '500 ml', stock: 30, description: 'Tough on grease, gentle on hands.' },
  { sku: 'HH-002', category: 'household', name: 'Toilet Tissue', icon: '🧻', priceCents: 39900, unitLabel: '9 rolls', stock: 20, description: 'Soft and strong 3-ply toilet tissue.' },
  { sku: 'HH-003', category: 'household', name: 'Kitchen Sponges', icon: '🧽', priceCents: 9900, unitLabel: 'pack of 4', stock: 35, description: 'Dual-sided scrub sponges.' },
  { sku: 'HH-004', category: 'household', name: 'Laundry Detergent', icon: '🫧', priceCents: 49900, unitLabel: '1.5 L', stock: 8, description: 'Concentrated liquid detergent for 40 washes.' },
];

/** Example delivery zones (fees in paise). Edit these in the staff dashboard (Delivery zones). */
export const seedDeliveryZones = [
  // ₹30 delivery, free over ₹500
  { name: 'Central', postcodePrefixes: ['1000'], feeCents: 3000, freeDeliveryThresholdCents: 50000, minOrderCents: 0 },
  // ₹50 delivery, free over ₹999, minimum order ₹199
  { name: 'Outer neighbourhoods', postcodePrefixes: ['1001', '1002'], feeCents: 5000, freeDeliveryThresholdCents: 99900, minOrderCents: 19900 },
];
