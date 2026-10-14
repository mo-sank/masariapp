/**
 * Youth-Relevant Stock Categories and Context Tags (Phase 2).
 *
 * Maps stock tickers to relatable consumer brands, products, and categories
 * so high schoolers immediately understand what real-world business they are analyzing.
 */

export type YouthCategoryKey = 'all' | 'gaming' | 'streetwear' | 'entertainment' | 'food';

export interface YouthCategory {
  key: YouthCategoryKey;
  label: string;
  emoji: string;
}

export const YOUTH_CATEGORIES: readonly YouthCategory[] = [
  { key: 'all', label: 'All', emoji: '🔥' },
  { key: 'gaming', label: 'Gaming & Tech', emoji: '🎮' },
  { key: 'streetwear', label: 'Sneakers & Trends', emoji: '👟' },
  { key: 'entertainment', label: 'Streaming & Media', emoji: '🎬' },
  { key: 'food', label: 'Food & Snacks', emoji: '🍔' },
] as const;

/** Category membership by symbol. */
export const SYMBOL_CATEGORIES: Record<string, YouthCategoryKey[]> = {
  AAPL: ['gaming', 'entertainment'],
  MSFT: ['gaming'],
  NVDA: ['gaming'],
  AMD: ['gaming'],
  INTC: ['gaming'],
  QCOM: ['gaming'],
  DIS: ['entertainment'],
  NFLX: ['entertainment'],
  META: ['entertainment'],
  GOOGL: ['gaming', 'entertainment'],
  NKE: ['streetwear'],
  AMZN: ['streetwear', 'entertainment'],
  TGT: ['streetwear', 'food'],
  WMT: ['streetwear', 'food'],
  COST: ['streetwear', 'food'],
  KO: ['food'],
  PEP: ['food'],
  SBUX: ['food'],
  MCD: ['food'],
  TSLA: ['gaming'],
};

/** High school friendly product/brand descriptors. */
export const YOUTH_CONTEXT_TAGS: Record<string, { subtitle: string; highlights: string[] }> = {
  AAPL: {
    subtitle: 'iPhone, Mac & App Store',
    highlights: ['iPhones & iPads', 'App Store & Apple Arcade', 'Mac & AirPods'],
  },
  MSFT: {
    subtitle: 'Xbox, Minecraft & AI',
    highlights: ['Xbox Console & Game Pass', 'Minecraft', 'Windows & Copilot AI'],
  },
  NVDA: {
    subtitle: 'GeForce GPUs & AI Chips',
    highlights: ['GeForce PC Gaming Graphics', 'AI Supercomputing', 'RTX Ray Tracing'],
  },
  DIS: {
    subtitle: 'Disney+, Marvel & Theme Parks',
    highlights: ['Marvel & Star Wars', 'Disney+ Streaming', 'Disneyland & World'],
  },
  NKE: {
    subtitle: 'Air Jordans & Sportswear',
    highlights: ['Jordan Brand', 'Dunks & Air Force 1s', 'Athlete Sponsorships'],
  },
  KO: {
    subtitle: 'Coca-Cola, Sprite & Fanta',
    highlights: ['Coca-Cola & Coke Zero', 'Sprite & Fanta', 'Minute Maid & BodyArmor'],
  },
  SBUX: {
    subtitle: 'Frappuccinos, Cold Brew & Drinks',
    highlights: ['Frappuccinos & Refreshers', 'Iced Matcha & Cold Brew', 'Rewards App'],
  },
  MCD: {
    subtitle: 'Burgers, Fries & McFlurries',
    highlights: ['Big Macs & McNuggets', 'World-Famous Fries', 'App Deals & Delivery'],
  },
  GOOGL: {
    subtitle: 'YouTube, Search & Android',
    highlights: ['YouTube & Shorts', 'Google Search & Maps', 'Android & Pixel Phones'],
  },
  AMZN: {
    subtitle: 'Prime Delivery, Twitch & AWS',
    highlights: ['2-Day Prime Delivery', 'Twitch Streaming', 'Kindle & Alexa'],
  },
  META: {
    subtitle: 'Instagram, WhatsApp & Quest VR',
    highlights: ['Instagram & Reels', 'WhatsApp Messaging', 'Meta Quest VR Gaming'],
  },
  NFLX: {
    subtitle: 'Stranger Things, Squid Game & Movies',
    highlights: ['Global TV Streaming', 'Original Movies & Anime', 'Mobile Games'],
  },
  TSLA: {
    subtitle: 'Electric Vehicles & Robotics',
    highlights: ['Cybertruck & Model 3/Y', 'Supercharger Network', 'Optimus Robot & AI'],
  },
  PEP: {
    subtitle: 'Pepsi, Doritos & Gatorade',
    highlights: ['Doritos, Cheetos & Lay’s', 'Gatorade Sports Drinks', 'Pepsi & Mountain Dew'],
  },
  COST: {
    subtitle: 'Bulk Snacks & $1.50 Hot Dogs',
    highlights: ['Kirkland Signature Snacks', 'Famous $1.50 Hot Dog Combo', 'Wholesale Savings'],
  },
  AMD: {
    subtitle: 'Ryzen Processors & Radeon GPUs',
    highlights: ['Ryzen Gaming CPUs', 'PlayStation & Xbox Chips', 'Radeon Graphics'],
  },
  TGT: {
    subtitle: 'Fashion, Dorm Trends & Snacks',
    highlights: ['Trend Collabs & Apparel', 'Dorm & Beauty Essentials', 'Drive Up Pickup'],
  },
};

/** Get relatable subtitle for an instrument symbol. */
export function getYouthSubtitle(symbol: string): string | null {
  return YOUTH_CONTEXT_TAGS[symbol.toUpperCase()]?.subtitle ?? null;
}

/** Check if a symbol matches a given youth category. */
export function matchesYouthCategory(symbol: string, category: YouthCategoryKey): boolean {
  if (category === 'all') return true;
  const categories = SYMBOL_CATEGORIES[symbol.toUpperCase()] ?? [];
  return categories.includes(category);
}
