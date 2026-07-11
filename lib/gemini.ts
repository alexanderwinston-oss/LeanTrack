import { CoachAnalysis, FoodAnalysisResult, GeneratedRecipe, MealPlan } from './types';

const GEMINI_PROXY_URL = 'https://loopcraft-pi.vercel.app/api/gemini';
const GEMINI_ENDPOINT = '/v1beta/models/gemini-2.5-flash:generateContent';
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

export async function callGemini(body: object, disableThinking = false, temperature = 0): Promise<any> {
  const generationConfig: any = { temperature };
  if (disableThinking) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  const requestBody = { ...body, generationConfig };

  const response = await fetchWithTimeout(GEMINI_PROXY_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ endpoint: GEMINI_ENDPOINT, body: requestBody }),
  });

  const data = await response.json();
  if (!response.ok) {
    const errorMsg = data?.error?.message ?? 'Erreur API';
    const isQuota = response.status === 429 || errorMsg.toLowerCase().includes('quota');
    throw new Error(isQuota ? 'QUOTA_EXCEEDED' : `[${response.status}] ${errorMsg}`);
  }
  return data;
}

export function safeParseJSON<T>(text: string, fallback: T): T {
  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return fallback;
    return parsed as T;
  } catch {
    return fallback;
  }
}

export function extractText(data: any): string {
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
  const promptText = `${base64Image
    ? 'Analyse cette photo de repas.'
    : 'Analyse ce repas décrit par l\'utilisateur.'}
${userComment
    ? `\nINFORMATION UTILISATEUR PRIORITAIRE : "${userComment}"\nCette information prime sur toute estimation visuelle.`
    : ''}

=== RÈGLES STRICTES — RESPECTE-LES DANS L'ORDRE ===

RÈGLE 1 — ÉTIQUETTE NUTRITIONNELLE (priorité absolue) :
Si la photo montre une étiquette nutritionnelle lisible sur un emballage :
→ Lis les valeurs DIRECTEMENT sur l'étiquette. Ne jamais estimer si l'étiquette est lisible.
→ Si l'étiquette indique des valeurs pour 100g, calcule pour la portion visible ou indiquée.
→ Si l'étiquette indique une portion (ex: "1 part 400g"), utilise ces valeurs directement.
→ Indique dans remarques : "Valeurs lues directement sur l'étiquette nutritionnelle."

RÈGLE 2 — POIDS INDIQUÉ PAR L'UTILISATEUR (priorité haute) :
Parse tout poids mentionné dans l'information utilisateur, quel que soit le format —
tous ces formats sont ÉQUIVALENTS et doivent être reconnus :
→ "50g" ou "50 g" ou "50gr" ou "50 gr" ou "50grammes" ou "50 grammes" → quantite_estimee_g = 50
→ "0.4kg" ou "0.4 kg" ou "0,4 kg" → quantite_estimee_g = 400
→ "2 portions" → estime le poids de 2 portions standard du plat identifié
Procède dans cet ordre exact :
1. Cherche activement un poids explicite dans le texte utilisateur, sous n'importe
   lequel des formats ci-dessus (espace ou non avant l'unité, unité abrégée ou complète).
2. Si un poids est trouvé : quantite_estimee_g = ce poids exactement, et
   quantity_source = "mentioned". Calcule calories et macros pour EXACTEMENT ce
   poids (jamais pour 100g par défaut) — pars des valeurs nutritionnelles pour
   100g de l'aliment identifié puis mets à l'échelle. Exemple : "50 gr de brownie"
   → identifie "brownie", calcule sa valeur pour 100g, puis multiplie par 0.5.
   Ce poids override toute estimation visuelle.
3. Si aucun poids n'est mentionné : estime une portion réaliste du plat identifié
   (jamais 100g par défaut sauf si c'est réellement la portion estimée) et mets
   quantity_source = "estimated".
4. quantity_source = "default" UNIQUEMENT si rien ne permet ni de lire ni
   d'estimer un poids (cas rarissime).

RÈGLE 3 — PRÉCISION CALORIQUE (tables CIQUAL France) :
Utilise des valeurs précises issues des tables CIQUAL françaises.
Ne jamais arrondir à des multiples de 50 ou 100 sauf si c'est la vraie valeur.
Références de précision :
→ Steak haché 15%MG 100g : 194 kcal | P:20g C:0g L:12g
→ Pain burger 50g : 131 kcal | P:5g C:25g L:2g
→ Burger complet 200g (steak+pain+sauce) : ~450-500 kcal selon la sauce
→ Chipolata cuite 55g : 155 kcal | P:8g C:1g L:14g
→ Œuf dur moyen 50g : 74 kcal | P:6g C:0.5g L:5g
→ Couscous cuit 200g : 224 kcal | P:8g C:44g L:2g

RÈGLE 4 — DÉTECTION BOISSON (stricte) :
is_drink = true UNIQUEMENT si le sujet PRINCIPAL de la photo ou description
est une boisson liquide (verre d'eau, bouteille, café, jus, soda...).
is_drink = false si :
→ Une boisson est visible en arrière-plan
→ L'utilisateur décrit principalement de la nourriture solide
→ La boisson est un accompagnement mineur
En cas de doute → is_drink = false.

Retourne UNIQUEMENT ce JSON valide sans markdown ni explication :
{
  "aliment_principal": "string (nom précis en français)",
  "aliments_detectes": ["string avec quantité ex: 'Steak haché 150g'"],
  "quantite_estimee_g": number,
  "calories_estimees": number,
  "proteines_g": number,
  "glucides_g": number,
  "lipides_g": number,
  "confiance": "haute" | "moyenne" | "faible",
  "remarques": "string (méthode: estimation visuelle / étiquette / CIQUAL codes utilisés)",
  "is_drink": boolean,
  "volume_ml": number,
  "drink_type": "water" | "other",
  "quantity_source": "mentioned" | "estimated" | "default"
}`;

  const parts: any[] = [];
  if (base64Image) {
    parts.push({ inline_data: { mime_type: 'image/jpeg', data: base64Image } });
  }
  parts.push({ text: promptText });

  const data = await callGemini({ contents: [{ parts }] }, false, 0);

  const fallback: FoodAnalysisResult = {
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
    quantity_source: 'default',
  };
  const parsed = safeParseJSON<FoodAnalysisResult>(extractText(data), fallback);
  return {
    ...fallback,
    ...parsed,
    calories_estimees: typeof parsed.calories_estimees === 'number' ? parsed.calories_estimees : 0,
    proteines_g: typeof parsed.proteines_g === 'number' ? parsed.proteines_g : 0,
    glucides_g: typeof parsed.glucides_g === 'number' ? parsed.glucides_g : 0,
    lipides_g: typeof parsed.lipides_g === 'number' ? parsed.lipides_g : 0,
    quantite_estimee_g: typeof parsed.quantite_estimee_g === 'number' ? parsed.quantite_estimee_g : 100,
    is_drink: typeof parsed.is_drink === 'boolean' ? parsed.is_drink : false,
    volume_ml: typeof parsed.volume_ml === 'number' ? parsed.volume_ml : 0,
    quantity_source: ['mentioned', 'estimated', 'default'].includes(parsed.quantity_source)
      ? parsed.quantity_source
      : 'estimated',
  };
}

export async function generateMealPlan(
  calorieTarget: number,
  protein_g: number,
  carbs_g: number,
  fat_g: number,
  goal: string,
  ingredientList?: string,
  weeklyBudgetEuros?: number
): Promise<MealPlan> {
  const data = await callGemini({
    contents: [{
      parts: [{
        text: `Génère un plan alimentaire 7 jours pour :
- Objectif : ${goal} — ${calorieTarget} kcal/jour
- Protéines : ${protein_g}g | Glucides : ${carbs_g}g | Lipides : ${fat_g}g
- Cuisine française, aliments courants en supermarché, repas simples < 30 min
${ingredientList?.trim()
  ? `\nCONTRAINTE INGRÉDIENTS (OBLIGATOIRE) : utilise UNIQUEMENT ces ingrédients disponibles : ${ingredientList}. N'utilise aucun autre ingrédient non mentionné.`
  : ''}
${weeklyBudgetEuros && weeklyBudgetEuros > 0
  ? `\nCONTRAINTE BUDGET STRICTE ET OBLIGATOIRE :
Budget total pour 7 jours : ${weeklyBudgetEuros}€ maximum.
Budget par jour : ${(weeklyBudgetEuros / 7).toFixed(1)}€ maximum.
Pour respecter ce budget :
→ Favorise : œufs, légumineuses, riz, pâtes, légumes de saison, poulet bas de gamme, sardines
→ Evite : saumon, viandes nobles, fruits exotiques, produits bio premium
→ Chaque jour DOIT coûter moins de ${(weeklyBudgetEuros / 7).toFixed(1)}€ en courses
→ Si le budget est très serré (< 10€/jour), propose des repas végétariens simples`
  : ''}

RÈGLE NOM (STRICTE ET NON NÉGOCIABLE) : Le champ "nom" = noms des aliments uniquement, 2-4 mots max. Exemples valides : "Fromage blanc amandes", "Oeufs brouillés pain". Exemples invalides : "Petit-déjeuner campagnard", tout adjectif qualitatif.

RÈGLE QUANTITÉS (OBLIGATOIRE) : Chaque ingrédient DOIT avoir une quantité précise en grammes ou ml ou unités.
Format : "[quantité][unité] [nom]". Exemples corrects : "80g flocons d'avoine", "200ml lait demi-écrémé", "150g blanc de poulet émincé", "1 œuf entier (60g)", "30g fromage blanc 0%". JAMAIS un ingrédient sans quantité.

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
          "ingredients": ["string avec quantité OBLIGATOIRE ex: '80g flocons d\\'avoine'"]
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

export async function generateRecipe(
  description: string,
  servings: number,
  calorieTarget: number,
  availableIngredients?: string
): Promise<GeneratedRecipe> {
  const data = await callGemini({
    contents: [{
      parts: [{
        text: `Génère une recette de cuisine française pour ${servings} personnes basée sur : "${description}".
${availableIngredients ? `Utilise de préférence ces ingrédients disponibles : ${availableIngredients}` : ''}
Objectif : environ ${Math.round(calorieTarget / 3)} kcal par portion.

Retourne UNIQUEMENT ce JSON sans markdown :
{
  "name": "string",
  "description": "string (1-2 phrases appétissantes)",
  "servings": ${servings},
  "calories_per_serving": number,
  "protein_g": number,
  "carbs_g": number,
  "fat_g": number,
  "prep_time_minutes": number,
  "cook_time_minutes": number,
  "ingredients": [
    { "name": "string", "quantity": "string", "unit": "string" }
  ],
  "steps": ["string (étape numérotée)"]
}`,
      }],
    }],
  }, true, 0);

  return safeParseJSON<GeneratedRecipe>(extractText(data), {
    name: description,
    description: '',
    servings,
    calories_per_serving: 0,
    protein_g: 0,
    carbs_g: 0,
    fat_g: 0,
    prep_time_minutes: 30,
    cook_time_minutes: 20,
    ingredients: [],
    steps: [],
  });
}

export interface CoachAnalysisDayInput {
  date: string;
  total_calories: number;
  total_protein: number;
  total_carbs: number;
  total_fat: number;
  water_ml: number;
  meal_names: string[];
}

export interface CoachAnalysisTargets {
  calorieTarget: number;
  proteinTarget: number;
  carbsTarget: number;
  fatTarget: number;
  waterTarget: number;
}

export async function generateCoachAnalysis(
  days: CoachAnalysisDayInput[],
  targets: CoachAnalysisTargets,
  weightEntries: { date: string; weight: number }[],
  goal: string
): Promise<CoachAnalysis> {
  const daysSummary = days.map((d) => (
    `${d.date} : ${Math.round(d.total_calories)}/${targets.calorieTarget} kcal | `
    + `P:${Math.round(d.total_protein)}/${targets.proteinTarget}g `
    + `G:${Math.round(d.total_carbs)}/${targets.carbsTarget}g `
    + `L:${Math.round(d.total_fat)}/${targets.fatTarget}g | `
    + `Eau:${d.water_ml}/${targets.waterTarget}ml | `
    + `Repas: ${d.meal_names.length > 0 ? d.meal_names.join(', ') : 'aucun repas loggé'}`
  )).join('\n');

  const weightSummary = weightEntries.length > 0
    ? weightEntries.map((w) => `${w.date} : ${w.weight}kg`).join(', ')
    : 'Aucune pesée cette semaine';

  const goalLabel = goal === 'perte' ? 'perte de poids' : goal === 'prise' ? 'prise de masse' : 'maintien';

  const promptText = `Tu es un coach nutrition bienveillant. Analyse la semaine suivante d'un utilisateur dont l'objectif est : ${goalLabel}.

DONNÉES DE LA SEMAINE (jour par jour) :
${daysSummary}

PESÉES DE LA SEMAINE :
${weightSummary}

=== RÈGLES STRICTES ===
- Réponds en français, tutoie l'utilisateur ("tu").
- Ton encourageant mais honnête, pratique. Aucune affirmation médicale. Ne culpabilise jamais l'utilisateur.
- Les recommandations doivent être concrètes et actionnables, basées sur les données réelles ci-dessus
  (ex: "Prépare tes repas du jeudi à l'avance — c'est ton jour le plus irrégulier"), jamais génériques.
- N'invente aucune donnée non présente ci-dessus.

Retourne UNIQUEMENT ce JSON valide, sans markdown, sans préambule, sans texte avant ou après :
{
  "resume": "string (2-3 phrases résumant la semaine)",
  "points_forts": ["string", "string"],
  "points_faibles": ["string", "string"],
  "recommandations": ["string", "string", "string"]
}`;

  const data = await callGemini({
    contents: [{ parts: [{ text: promptText }] }],
  }, true, 0.3);

  const fallback: CoachAnalysis = {
    resume: '',
    points_forts: [],
    points_faibles: [],
    recommandations: [],
  };
  return safeParseJSON<CoachAnalysis>(extractText(data), fallback);
}
