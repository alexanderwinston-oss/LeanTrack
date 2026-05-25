import { FoodItem } from './types';

export async function searchFood(query: string): Promise<FoodItem[]> {
  if (!query.trim()) return [];

  const url = `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&action=process&json=1&page_size=15&lc=fr&cc=fr`;

  const res = await fetch(url, { headers: { 'User-Agent': 'LeanTrack/1.0' } });
  if (!res.ok) throw new Error(`OpenFoodFacts error: ${res.status}`);

  const data = await res.json();
  const products: any[] = data.products ?? [];

  return products
    .filter((p) => p.product_name && p.nutriments?.['energy-kcal_100g'] != null)
    .map((p) => ({
      name: p.product_name_fr ?? p.product_name ?? 'Inconnu',
      brand: p.brands ?? undefined,
      calories_100g: Number(p.nutriments['energy-kcal_100g'] ?? 0),
      protein_100g: Number(p.nutriments.proteins_100g ?? 0),
      carbs_100g: Number(p.nutriments.carbohydrates_100g ?? 0),
      fat_100g: Number(p.nutriments.fat_100g ?? 0),
    }))
    .slice(0, 15);
}
