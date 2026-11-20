/**
 * Guest reviews. Only add REAL reviews from real guests, with permission.
 * The reviews section stays hidden while this list is empty.
 */
export type Review = {
  author: string;
  origin?: string;
  date: string; // ISO yyyy-mm
  quote: { en?: string; el?: string };
  source?: "direct" | "airbnb" | "booking";
};

export const reviews: Review[] = [];
