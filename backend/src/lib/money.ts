import { config } from '../config.js';

// Indian number grouping (₹1,00,000) for rupees, standard grouping otherwise.
const locale = config.CURRENCY === 'INR' ? 'en-IN' : 'en-US';
const withDecimals = new Intl.NumberFormat(locale, { style: 'currency', currency: config.CURRENCY });
const wholeOnly = new Intl.NumberFormat(locale, { style: 'currency', currency: config.CURRENCY, maximumFractionDigits: 0 });

/** 4500 → "₹45", 4550 → "₹45.50" (used in messages shown to customers) */
export const formatMoney = (cents: number) => (cents % 100 === 0 ? wholeOnly : withDecimals).format(cents / 100);
