export type SaleType =
  | 'Yearling Sale'
  | 'Weanling Sale'
  | 'Breeding Stock Sale'
  | 'Ready-to-Run Sale'
  | 'Tried Horse Sale'
  | 'Private Sale';

export const SALE_TYPES: SaleType[] = [
  'Yearling Sale',
  'Weanling Sale',
  'Breeding Stock Sale',
  'Ready-to-Run Sale',
  'Tried Horse Sale',
  'Private Sale',
];

export interface Sale {
  id: string;
  createdAt: Date;

  /** Required — Horse ID this sale record is attached to */
  horse_id: string;

  /** Required — ISO date string YYYY-MM-DD */
  sale_date: string;

  /** Required — Type of sale */
  sale_type: SaleType;

  /** Required — Sale company / venue (e.g. Magic Millions, Karaka) */
  venue: string;

  /** Optional — Lot number */
  lot?: string;

  /** Optional — Hammer / sale price */
  price?: number;

  /** Optional — Currency code (defaults to AUD) */
  currency?: string;

  /** Optional — Party ID of the buyer (owner / agent) */
  buyer_party_id?: string;

  /** Optional — Vendor / consignor name */
  vendor?: string;

  /** Optional — Free-text notes */
  notes?: string;
}
