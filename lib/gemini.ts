import { GoogleGenerativeAI } from '@google/generative-ai';
import Constants from 'expo-constants';
import { FoodAnalysisResult, Goal, MealPlan } from './types';

function getClient(): GoogleGenerativeAI {
  const key = Constants.expoConfig?.extra?.geminiApiKey as string;
  if (!key) throw new Error('Gemini API key manquante');
  return new GoogleGenerativeAI(key);
}

function extractJSON(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) return fenced[1].trim();
  const braces = text.match(/(\{[\s\S]*\})/);
  if (braces) return braces[1].trim();
  return text.trim();
}

export async function analyzeFoodPhoto(base64Image: string): Promise<FoodAnalysisResult> {
  const genai = getClient();
  const model = genai.getGenerativeModel({ model: 'gemini-1.5-flash' }, { apiVersion: 'v1' });

  const prompt = `Tu es un expert en nutrition. Analyse cette photo de repas et retourne UNIQUEMENT un JSON valide (sans markdown) avec ces champs exacts :
{
  "aliment_principal": "nom du plat principal",
  "aliments_detectes": ["liste", "des", "aliments"],
  "quantite_estimee_g": 350,
  "calories_estimees": 450,
  "proteines_g": 30,
  "glucides_g": 45,
  "lipides_g": 15,
  "confiance": "haute|moyenne|faible",
  "remarques": "observations utiles"
}
Utilise les portions françaises standard. Sois précis sur les macros.`;

  const result = await model.generateContent([
    { text: prompt },
    { inlineData: { mimeType: 'image/jpeg', data: base64Image } },
  ]);

  const text = result.response.text();
  try {
    return JSON.parse(extractJSON(text)) as FoodAnalysisResult;
  } catch {
    return {
      aliment_principal: 'Repas analysé',
      aliments_detectes: [],
      quantite_estimee_g: 300,
      calories_estimees: 400,
      proteines_g: 20,
      glucides_g: 40,
      lipides_g: 15,
      confiance: 'faible',
      remarques: 'Analyse partielle, données approximatives.',
    };
  }
}

export async function generateMealPlan(
  calorieTarget: number,
  protein_g: number,
  carbs_g: number,
  fat_g: number,
  goal: Goal
): Promise<MealPlan> {
  const genai = getClient();
  const model = genai.getGenerativeModel({ model: 'gemini-1.5-flash' }, { apiVersion: 'v1' });

  const goalLabel = goal === 'perte' ? 'perte de poids' : goal === 'prise' ? 'prise de masse' : 'maintien du poids';

  const prompt = `Tu es diététicien expert en cuisine française. Génère un plan alimentaire de 7 jours pour un objectif de ${goalLabel}.
Objectifs : ${calorieTarget} kcal/jour, ${protein_g}g protéines, ${carbs_g}g glucides, ${fat_g}g lipides.
Utilise des aliments disponibles en supermarché français. Cuisine simple et savoureuse.

Retourne UNIQUEMENT ce JSON valide (sans markdown) :
{
  "objectif_calorique": ${calorieTarget},
  "jours": [
    {
      "jour": "Lundi",
      "petit_dejeuner": {
        "nom": "nom du repas",
        "calories": 400,
        "proteines_g": 20,
        "glucides_g": 50,
        "lipides_g": 12,
        "ingredients": ["ingrédient 1", "ingrédient 2"],
        "preparation": "description courte"
      },
      "dejeuner": { ... },
      "diner": { ... },
      "collation": { ... },
      "total_calories": 2000
    }
    // répète pour Mardi, Mercredi, Jeudi, Vendredi, Samedi, Dimanche
  ]
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  try {
    const parsed = JSON.parse(extractJSON(text)) as MealPlan;
    parsed.generated_at = new Date().toISOString();
    return parsed;
  } catch {
    throw new Error('Impossible de parser le plan alimentaire généré. Réessaie.');
  }
}
