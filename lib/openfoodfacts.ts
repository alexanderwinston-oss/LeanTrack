import { FoodItem } from './types';

const TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function safeNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return isNaN(n) ? 0 : n;
}

export async function searchFood(query: string, page = 1): Promise<FoodItem[]> {
  if (!query.trim()) return [];

  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&action=process&json=1&page_size=50&page=${page}&lc=fr&cc=fr`;

  const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'LeanTrack/1.0' } });
  if (!res.ok) throw new Error(`OpenFoodFacts error: ${res.status}`);

  const data = await res.json();
  const products: any[] = data.products ?? [];

  return products
    .filter((p) => p.product_name && p.nutriments?.['energy-kcal_100g'] != null)
    .map((p) => ({
      name: p.product_name_fr ?? p.product_name ?? 'Inconnu',
      brand: p.brands ?? undefined,
      calories_100g: safeNumber(p.nutriments['energy-kcal_100g']),
      protein_100g: safeNumber(p.nutriments.proteins_100g),
      carbs_100g: safeNumber(p.nutriments.carbohydrates_100g),
      fat_100g: safeNumber(p.nutriments.fat_100g),
    }));
}
