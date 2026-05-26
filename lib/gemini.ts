import Constants from 'expo-constants';
import { FoodAnalysisResult, MealPlan } from './types';

const API_KEY = Constants.expoConfig?.extra?.geminiApiKey ?? '';
const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const TIMEOUT_MS = 30000;

async function fetchWithTimeout(url: string, options: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function callGemini(body: object, disableThinking = false, temperature = 0): Promise<any> {
  if (!API_KEY) throw new Error('Clé API manquante dans app.json');

  const generationConfig: any = { temperature };
  if (disableThinking) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const requestBody = { ...body, generationConfig };

  const response = await fetchWithTimeout(`${BASE_URL}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(`[${response.status}] ${data?.error?.message ?? 'Erreur API'}`);
  }
  return data;
}

function safeParseJSON<T>(text: string, fallback: T): T {
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean) as T;
  } catch {
    return fallback;
  }
}

function extractText(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts ?? [];
  return parts
    .filter((p: any) => p.text && !p.thought)
    .map((p: any) => p.text as string)
    .join('') || '{}';
}

export async function analyzeFoodPhoto(
  base64Image: string | null,
  userComment = ''
): Promise<FoodAnalysisResult> {
  const parts: any[] = [];

  if (base64Image) {
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: base64Image } });
  }

  const promptText = `Analyse ${base64Image ? 'cette photo de repas' : 'ce repas décrit'} et estime les valeurs nutritionnelles.
${userComment ? `Information prioritaire de l'utilisateur : "${userComment}". Cette information prime sur ce que montre la photo.` : ''}

Règles strictes pour la précision :
- Utilise les valeurs de la table CIQUAL (base nutritionnelle française officielle)
- Pour les plats composés, décompose chaque ingrédient visible
- Estime le poids en grammes selon les portions FRANÇAISES standard
- Si plusieurs portions sont visibles, estime le total
- Sois CONSISTANT : pour un même plat, tu dois toujours retourner les mêmes valeurs
- Ne sur-estime pas les lipides des plats grillés ou cuits à la vapeur
- Pour la mayo : 1 cuillère à soupe = 15g = 100 kcal (mayo normale), 50 kcal (mayo allégée)
- Si tu détectes un verre d'eau, une bouteille, ou tout liquide :
  * Estime le volume en ml (verre standard = 250ml, grande bouteille = 500ml)
  * Pour l'eau plate : calories = 0, macros = 0
  * Pour les boissons sucrées : calcule normalement les calories

Retourne UNIQUEMENT ce JSON sans markdown :
{
  "aliment_principal": "string (nom précis du plat en français)",
  "aliments_detectes": ["string (avec quantité estimée ex: '2 oeufs durs 100g')"],
  "quantite_estimee_g": number (poids total en grammes),
  "calories_estimees": number (kcal total, pas /100g),
  "proteines_g": number,
  "glucides_g": number,
  "lipides_g": number,
  "confiance": "haute" | "moyenne" | "faible",
  "remarques": "string (méthodologie utilisée, ex: basé sur CIQUAL code 1234)",
  "is_drink": boolean (true si l'image montre une boisson, de l'eau, un jus, du café, du thé etc.),
  "volume_ml": number (volume estimé en ml si is_drink est true, 0 sinon),
  "drink_type": "water" | "other" (si is_drink true : "water" pour l'eau plate, "other" pour jus/soda/café/thé)
}`;

  parts.push({ text: promptText });

  const data = await callGemini({ contents: [{ parts }] }, false, 0);

  return safeParseJSON<FoodAnalysisResult>(extractText(data), {
    aliment_principal: 'Non identifié',
    aliments_detectes: [],
    quantite_estimee_g: 100,
    calories_estimees: 0,
    proteines_g: 0,
    glucides_g: 0,
    lipides_g: 0,
    confiance: 'faible',
    remarques: 'Analyse échouée — ajoute manuellement',
    is_drink: false,
    volume_ml: 0,
    drink_type: 'other',
  });
}

export async function generateMealPlan(
  calorieTarget: number,
  protein_g: number,
  carbs_g: number,
  fat_g: number,
  goal: string
): Promise<MealPlan> {
  const data = await callGemini({
    contents: [{
      parts: [{
        text: `Génère un plan alimentaire 7 jours pour :
- Objectif : ${goal} — ${calorieTarget} kcal/jour
- Protéines : ${protein_g}g | Glucides : ${carbs_g}g | Lipides : ${fat_g}g
- Cuisine française, aliments courants en supermarché, repas simples < 30 min

Retourne UNIQUEMENT ce JSON sans markdown :
{
  "plan": [
    {
      "jour": "Lundi",
      "total_calories": number,
      "repas": [
        {
          "type": "petit_dejeuner" | "dejeuner" | "diner" | "collation",
          "nom": "string",
          "description": "string",
          "calories": number,
          "proteines_g": number,
          "glucides_g": number,
          "lipides_g": number,
          "ingredients": ["string"]
        }
      ]
    }
  ]
}`,
      }],
    }],
  }, true, 0);

  return safeParseJSON<MealPlan>(extractText(data), { plan: [] });
}
