import { GoogleGenerativeAI } from '@google/generative-ai';
import Constants from 'expo-constants';
import { FoodAnalysisResult, MealPlan } from './types';

const genAI = new GoogleGenerativeAI(
  Constants.expoConfig?.extra?.geminiApiKey ?? ''
);

const visionModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });
const textModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-lite' });

async function callWithRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err: any) {
      const is429 =
        err?.message?.includes('429') ||
        err?.status === 429 ||
        err?.message?.includes('quota');
      if (is429 && i < retries - 1) {
        await new Promise(res => setTimeout(res, (i + 1) * 4000));
        continue;
      }
      throw err;
    }
  }
  throw new Error('Max retries reached');
}

export async function analyzeFoodPhoto(base64Image: string): Promise<FoodAnalysisResult> {
  return callWithRetry(async () => {
    const imagePart = {
      inlineData: {
        data: base64Image,
        mimeType: 'image/jpeg' as const,
      },
    };

    const prompt = `Analyse cette photo de repas. Retourne UNIQUEMENT un JSON valide sans markdown ni explication :
{
  "aliment_principal": "string",
  "aliments_detectes": ["string"],
  "quantite_estimee_g": number,
  "calories_estimees": number,
  "proteines_g": number,
  "glucides_g": number,
  "lipides_g": number,
  "confiance": "haute",
  "remarques": "string"
}
Base-toi sur les portions standard françaises.`;

    const result = await visionModel.generateContent([prompt, imagePart]);
    const text = result.response.text();
    const clean = text.replace(/```json|```/g, '').trim();
    return JSON.parse(clean) as FoodAnalysisResult;
  });
}

export async function generateMealPlan(
  calorieTarget: number,
  protein_g: number,
  carbs_g: number,
  fat_g: number,
  goal: string
): Promise<MealPlan> {
  return callWithRetry(async () => {
    const prompt = `Génère un plan alimentaire 7 jours pour :
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
          "type": "petit_dejeuner",
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
}`;

    const result = await textModel.generateContent(prompt);
    const text = result.response.text();
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean) as MealPlan;
    parsed.generated_at = new Date().toISOString();
    return parsed;
  });
}
