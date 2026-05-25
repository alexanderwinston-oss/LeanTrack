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

async function callGemini(body: object): Promise<any> {
  if (!API_KEY) throw new Error('Clé API manquante dans app.json');

  const response = await fetchWithTimeout(`${BASE_URL}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
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
  return data?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
}

export async function analyzeFoodPhoto(base64Image: string): Promise<FoodAnalysisResult> {
  const data = await callGemini({
    contents: [{
      parts: [
        {
          inline_data: {
            mime_type: 'image/jpeg',
            data: base64Image,
          },
        },
        {
          text: `Analyse cette photo de repas. Retourne UNIQUEMENT un JSON valide sans markdown ni explication :
{
  "aliment_principal": "string",
  "aliments_detectes": ["string"],
  "quantite_estimee_g": number,
  "calories_estimees": number,
  "proteines_g": number,
  "glucides_g": number,
  "lipides_g": number,
  "confiance": "haute" | "moyenne" | "faible",
  "remarques": "string"
}
Base-toi sur les portions standard françaises. Sois précis sur les macros.`,
        },
      ],
    }],
  });

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
  });

  return safeParseJSON<MealPlan>(extractText(data), { plan: [] });
}
