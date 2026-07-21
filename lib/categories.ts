export interface CategoryDef {
  group: string;
  metric: string;
  unit: string;
  label: string;
  emoji: string;
}

export const CATEGORY_DEFS: CategoryDef[] = [
  { group: "Countries", metric: "Population", unit: "people", label: "Population", emoji: "🌍" },
  { group: "Countries", metric: "Area", unit: "km²", label: "Area", emoji: "🌍" },
  { group: "Countries", metric: "GDP", unit: "USD", label: "GDP", emoji: "🌍" },
  { group: "Cities", metric: "Population", unit: "people", label: "Population", emoji: "🏙️" },
  { group: "Cities", metric: "Elevation", unit: "m", label: "Elevation", emoji: "🏙️" },
  { group: "Mountains", metric: "Height", unit: "m", label: "Height", emoji: "🏔️" },
  { group: "Planets", metric: "Diameter", unit: "km", label: "Diameter", emoji: "🪐" },
  { group: "Planets", metric: "Distance from Sun", unit: "million km", label: "Distance from Sun", emoji: "🪐" },
  { group: "Movies", metric: "Box Office", unit: "USD", label: "Box Office", emoji: "🎬" },
  { group: "Movies", metric: "Budget", unit: "USD", label: "Budget", emoji: "🎬" },
];

export const ROUNDS_PER_GAME = 10;
export const ROUND_TIMER_SECONDS = 15;
export const TIEBREAKER_TIMER_SECONDS = 15;
export const MAX_PLAYERS = 8;
