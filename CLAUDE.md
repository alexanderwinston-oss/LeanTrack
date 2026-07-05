@AGENTS.md
/**
 * ============================================================
 * LEANTRACK · CLAUDE CODE SYSTEM PROMPT
 * Staff Engineer Edition — v10.2
 * ============================================================
 * PHILOSOPHIE :
 * On n'elimine pas des bugs — on elimine des classes de bugs
 * via des regles systemiques, validation automatique,
 * et architecture auto-correctrice.
 * ============================================================
 */

// ============================================================
// THINKING PROCESS (MANDATORY — NEVER SKIP)
// ============================================================

1. UNDERSTAND
   - Quels sont les symptomes exacts ?
   - Quels fichiers et composants sont impactes ?

2. DIAGNOSE
   - Cause racine (pas le symptome)
   - Local ou systemique ?
   - Reproduit dans plusieurs fichiers → SYSTEM BUG

3. DECIDE
   - Regle globale > fix local
   - Zero duplication de logique

4. IMPLEMENT
   - Lire TOUS les fichiers avant toute modification
   - Utiliser les patterns etablis — jamais les reinventer

5. VERIFY
   - MODAL INVENTORY + FAIL-FAST obligatoires
   - Si echec → STOP → FIX → RE-VALIDATE

NEVER skip a step.

---

// ============================================================
// TASK
// ============================================================

TASK:
[Decrire precisement la tache]

CONTEXT:
[Contexte produit, impact utilisateur, screenshots]

FILES TO READ (lire en entier avant toute modification) :
[Lister tous les fichiers]

---

// ============================================================
// MODULE: HOOKS ORDER (MANDATORY — ABSOLUTE RULE)
// ============================================================

Tous les hooks au TOP du composant, AVANT tout return
conditionnel. Jamais de hook apres un if/return. Jamais.

OK :
  export default function Screen() {
    const [a] = useState(...)
    const x = useMemo(() => ..., [...])
    useEffect(() => ..., [...])
    useFocusEffect(useCallback(() => ..., [...]))
    registerModal('id', visible, close, priority)

    if (!profile) return null     // APRES tous les hooks
    return ( ... )
  }

VIOLATION → crash immediat :
  if (!profile) return null
  const x = useMemo(() => ...)   // hook apres return = CRASH

Fonctions pures → definies HORS du composant, niveau module.

---

// ============================================================
// MODULE: JSX SCOPE SAFETY (MANDATORY — ABSOLUTE RULE)
// ============================================================

Toute variable utilisee dans PLUS D'UN endroit du composant
doit etre calculee au niveau du composant — jamais dans un
IIFE JSX, bloc conditionnel, ou callback.

INTERDIT — variable invisible hors de son IIFE :
  return (
    <>
      {(() => {
        const totalXP = ...    // scope local uniquement
        return <Text>{totalXP}</Text>
      })()}
      <Modal>
        <Text>{totalXP}</Text> // UNDEFINED — hors scope
      </Modal>
    </>
  )

CORRECT — variable au niveau composant :
  const totalXP = useMemo(
    () => ALL_ACHIEVEMENTS
      .filter(a => unlockedIds.includes(a.id))
      .reduce((sum, a) => sum + a.xp, 0),
    [unlockedIds]
  )

  return (
    <>
      <Text>{totalXP}</Text>    // OK
      <Modal>
        <Text>{totalXP}</Text>  // OK — meme scope
      </Modal>
    </>
  )

REGLE ABSOLUE : toute variable referencee dans un Modal
vit au niveau composant avec useMemo si couteuse.
Jamais dans un IIFE JSX. Jamais dans un bloc conditionnel JSX.

CHECKLIST avant chaque prompt :
  □ Chaque variable dans un Modal est definie au niveau composant ?
  □ Aucun IIFE JSX ne calcule des variables reutilisees ailleurs ?

---

// ============================================================
// MODULE: SELF-HEALING (MANDATORY — ABSOLUTE RULE)
// ============================================================

Chaque systeme detecte et corrige ses propres etats
incoherents sans intervention utilisateur.

LEVEL 1 — DATA (guard flag — une seule fois) :
  const [healRan, setHealRan] = useState(false)
  useEffect(() => {
    if (healRan || !profile) return
    const heal = async () => {
      const fixes: Record<string, any> = {}
      if (!profile.weight_initial || profile.weight_initial === 0) {
        const logs = await db.getAllAsync(
          'SELECT weight FROM weight_log WHERE profile_id = ?
           ORDER BY date ASC', [profileId]
        )
        fixes.weight_initial = logs.length > 0
          ? Math.max(...logs.map((l: any) => l.weight))
          : profile.weight_current
      }
      if (!profile.calorie_target || profile.calorie_target === 0) {
        const r = calcFullProfile({ ...profile })
        Object.assign(fixes, {
          calorie_target: r.calorieTarget,
          protein_target: r.protein_g,
          carbs_target: r.carbs_g,
          fat_target: r.fat_g,
          water_target: r.waterTarget,
          tdee: r.tdee,
        })
      }
      if (Object.keys(fixes).length > 0) {
        const sets = Object.keys(fixes).map(k => `${k} = ?`).join(', ')
        await db.runAsync(
          `UPDATE user_profile SET ${sets} WHERE profile_id = ?`,
          [...Object.values(fixes), profileId]
        )
      }
      setHealRan(true)
    }
    heal()
  }, [profile?.profile_id, healRan])

LEVEL 2 — SCHEMA :
  for (const sql of migrations) {
    await db.execAsync(sql).catch(() => {})
    // .catch(() => {}) = colonne deja existante → skip silencieux
  }

LEVEL 3 — STATE :
  useFocusEffect recharge depuis la DB a chaque focus.
  DB = source de verite. Store = couche affichage.

LEVEL 4 — ERROR RECOVERY :
  DB : 1 retry 500ms → alert actionnable.
  Gemini : 0 retry (risque quota) → fallback immediat.

LEVEL 5 — SESSION STARTUP (ordre obligatoire) :
  migrateSchema → healData → reload store
  → checkAchievements → load today data
  Chaque etape dans try/catch independant.

Profile name self-healing :
  display_name || name || 'Mon profil'
  Jamais de carte profil sans nom visible.

---

// ============================================================
// MODULE: MODAL SYSTEM ENGINE v10.1 (MANDATORY)
// ============================================================

DEFINITION FORMELLE — UN MODAL EST VALIDE SI ET SEULEMENT SI :
  1. Fully scrollable       — contenu accessible meme si long
  2. Keyboard-safe          — aucun input cache sous le clavier
  3. Back-button safe       — fermable via touche retour Android
  4. Cannot clip content    — aucun texte ou bouton coupe
IF one condition fails → the modal is broken → fix before shipping.

RULES (BINARY — NO EXCEPTIONS) :

RULE 1 — MODAL USAGE
  ❌ <Modal direct → interdit
  ✅ KeyboardAwareModal (contient TextInput)
  ✅ Bottom sheet (selection/actions)
  Si <Modal detecte → remplacer immediatement

RULE 2 — KEYBOARD SAFETY
  Tout Modal avec TextInput → KeyboardAwareModal obligatoire
  Fallback : app.json → softwareKeyboardLayoutMode: "pan"

RULE 3 — SELF-HEALING MODAL
  3 chemins de fermeture obligatoires :
  1. Bouton interne
  2. Tap backdrop
  3. Bouton back Android (registerModal)
  Si un manque → modal invalide

RULE 4 — BACK HANDLER GLOBAL
  ❌ useBackHandler duplique par composant → interdit
  ✅ lib/useModalManager.ts :

  const registry = new Map<string, {
    visible: boolean; close: () => void; priority: number
  }>()

  export function registerModal(
    id: string,
    visible: boolean,
    close: () => void,
    priority = 0
  ) {
    useEffect(() => {
      if (visible) registry.set(id, { visible, close, priority })
      else registry.delete(id)
      return () => { registry.delete(id) }
    }, [visible])
  }

  export function useGlobalBackHandler() {
    useEffect(() => {
      const handler = () => {
        const sorted = [...registry.values()]
          .filter(e => e.visible)
          .sort((a, b) => b.priority - a.priority)
        if (sorted.length > 0) {
          sorted[0].close()
          return true
        }
        return false
      }
      const sub = BackHandler.addEventListener(
        'hardwareBackPress', handler
      )
      return () => sub.remove()
    }, [])
  }

  app/_layout.tsx → useGlobalBackHandler() une seule fois.
  Chaque composant → registerModal(...) au TOP avant tout return.

RULE 5 — HOOKS ORDER
  Tous les hooks avant tout return conditionnel.

RULE 6 — UI CONTRACT (ANTI-CROPPING)
  ❌ Aucun contenu coupe
  ❌ Aucune height fixe sur contenu dynamique
  ✅ maxHeight via Dimensions uniquement — jamais en % :
     const SCREEN_H = Dimensions.get('window').height
     maxHeight: SCREEN_H * 0.85
  ✅ paddingBottom ≥ 48
  ✅ CTA toujours visible sans scroll

RULE 7 — SCROLL ARCHITECTURE
  <View style={{ maxHeight: SCREEN_H * 0.85 }}>
    <ScrollView style={{ flex: 1 }}>
      {/* TOUT le contenu ici */}
    </ScrollView>
    {/* CTA TOUJOURS EN DEHORS */}
    <TouchableOpacity />
    <View style={{ height: 20 }} />
  </View>

RULE 8 — NO FIXED HEIGHT
  ❌ height fixe sur card, nextBox, containers
  ✅ maxHeight via Dimensions uniquement
  ✅ flexShrink: 1 sur tout Text multiligne

RULE 9 — DEDUPLICATION
  Aucune logique repetee → centraliser dans lib/

RULE 10 — NO MODAL FROM SCRATCH
  ❌ Creer un modal de zero → strictement interdit
  ✅ Toujours partir de KeyboardAwareModal ou BaseBottomSheet
  Chaque nouveau modal herite du contrat des 4 conditions.

KeyboardAwareModal contract :
  ✅ behavior="padding"
  ✅ justifyContent: "flex-end"
  ✅ keyboardShouldPersistTaps="handled"
  ✅ paddingBottom ≥ 48
  ✅ onContentSizeChange → scrollToEnd
  ✅ statusBarTranslucent

MODAL INVENTORY (generer avant validation) :

| File                    | Modal ID          | TI | KAM | Reg | Pad |
|-------------------------|-------------------|----|-----|-----|-----|
| components/MealCard     | editMeal          | Y  | Y/N | Y/N | Y/N |
| components/MealCard     | detailMeal        | N  | N/A | Y/N | Y/N |
| app/(tabs)/journal      | addFood           | Y  | Y/N | Y/N | Y/N |
| app/(tabs)/journal      | foodBottomSheet   | Y  | Y/N | Y/N | Y/N |
| app/projection          | weightEntry       | Y  | Y/N | Y/N | Y/N |
| app/profiles            | deleteProfile     | Y  | Y/N | Y/N | Y/N |
| app/profiles            | createProfile     | Y  | Y/N | Y/N | Y/N |
| app/(tabs)/profil       | levelsGlossary    | N  | N/A | Y/N | Y/N |
| app/(tabs)/profil       | weightModal       | Y  | Y/N | Y/N | Y/N |
| app/(tabs)/profil       | editWeightInitial | Y  | Y/N | Y/N | Y/N |
| app/(tabs)/eau          | waterCustom       | Y  | Y/N | Y/N | Y/N |
| app/(tabs)/index        | analyseSheet      | N  | N/A | Y/N | Y/N |
| app/_layout             | badgeCelebration  | N  | N/A | Y/N | Y/N |
| components/Achievements | badgeDetail       | N  | N/A | Y/N | Y/N |

Tout N non justifie → correction avant de terminer.

---

// ============================================================
// MODULE: DATA SAFETY (MANDATORY)
// ============================================================

  const weightInitial = Math.max(
    profile?.weight_initial ?? 0,
    ...(weightHistory?.map(w => w.weight) ?? [0]),
    profile?.weight_current ?? 0
  )
  const latestWeight = weightHistory.length > 0
    ? weightHistory[weightHistory.length - 1].weight : null
  const denominator = weightInitial - (profile?.weight_target ?? 0)
  const progressPercent = denominator > 0 && latestWeight !== null
    ? Math.min(Math.max(
        Math.round(
          ((weightInitial - latestWeight) / denominator) * 100
        ), 0), 100)
    : 0

---

// ============================================================
// MODULE: WEIGHT LOGIC SAFETY (MANDATORY)
// ============================================================

  ✅ weight_initial = poids onboarding uniquement — immuable
  ❌ NEVER overwrite si deja valide (> 0, not null)
  ✅ Auto-heal via healRan guard
  ❌ recalculateTargetsAfterWeighIn ne touche JAMAIS weight_initial

---

// ============================================================
// MODULE: DB WRITE SAFETY (MANDATORY)
// ============================================================

  ❌ Jamais d'ecriture DB dans le render
  ✅ Mutations dans async handlers uniquement
  ✅ Une seule execution par correction (guard flag)
  ❌ Aucun side-effect cache dans les composants UI

---

// ============================================================
// MODULE: STATE CONSISTENCY (MANDATORY)
// ============================================================

Apres mutation poids (ordre exact) :
  await recalculateTargetsAfterWeighIn(weight)
  const updated = await getProfile()
  const history = await getWeightHistory(365)
  if (updated) useStore.getState().setProfile(updated)
  setWeightHistory(history)
  await checkAllAchievements()

Apres mutation repas :
  const meals = await getMealsForDate(getLocalDateString())
  const totals = await getDailyTotals(getLocalDateString())
  setMeals(meals); setDailyTotals(totals)
  useStore.getState().setDailyTotals(totals)
  await checkAllAchievements()

---

// ============================================================
// MODULE: AI SYSTEM SAFETY (MANDATORY)
// ============================================================

  setLoading(true)
  try { const result = await callGemini(...) }
  catch (err) {
    const isQuota = err?.message === 'QUOTA_EXCEEDED'
      || err?.message?.includes('429')
    Alert.alert(
      isQuota ? '⏳ Limite atteinte' : 'Erreur',
      isQuota ? 'Reessaie dans quelques heures.'
              : 'Verifie ta connexion et reessaie.'
    )
  } finally { setLoading(false) }

Clamp obligatoire sur sorties Gemini :
  calories : [0, 5000]
  macros   : [0, 500]
  eau      : [50, 2000]

---

// ============================================================
// MODULE: BADGE QUEUE (MANDATORY)
// ============================================================

  const unlocked = await checkAllAchievements()
  unlocked.forEach(b => useStore.getState().setPendingBadge(b))

  // app/_layout.tsx :
  <BadgeCelebration
    badge={badgeQueue[0] ?? null}
    onClose={dequeueNextBadge}
  />

FIFO — un a la fois — aucun badge perdu — pas de stacking.

Badges reconquis (passes && current?.lost_at) :
  → mise a jour silencieuse en DB
  → NE PAS push dans newlyUnlocked
  → pas d'animation (deja obtenu precedemment)

---

// ============================================================
// MODULE: SCHEDULE BOUNDS (MANDATORY)
// ============================================================

  // Hors composant — niveau module :
  function getWeighInSchedule(start: Date, end: Date): Date[] {
    const cap = new Date()
    cap.setDate(cap.getDate() - 90)
    const effective = start < cap ? cap : start
    const d = new Date(effective)
    const daysToTue = (2 - d.getDay() + 7) % 7
    d.setDate(d.getDate() + daysToTue)
    d.setHours(0, 0, 0, 0)
    const schedule: Date[] = []
    while (d <= end && schedule.length < 60) {
      schedule.push(new Date(d))
      d.setDate(d.getDate() + 14)
    }
    return schedule
  }

  // Dans le composant (apres tous les hooks) :
  const weighInDates = useMemo(
    () => getWeighInSchedule(scheduleStart, targetDate),
    [scheduleStart.toDateString(), targetDate.toDateString()]
  )

---

// ============================================================
// MODULE: UX SAFETY (MANDATORY)
// ============================================================

  disabled={isLoading}
  style={{ opacity: isLoading ? 0.5 : 1 }}
  // Loading toujours reset dans finally {}
  // Un seul modal visible (registry le garantit)

---

// ============================================================
// LEANTRACK PATTERNS (TOUJOURS — JAMAIS REINVENTER)
// ============================================================

DATES :
  ✅ getLocalDateString() — ❌ toISOString().split('T')[0]
  ✅ datetime('now', 'localtime') — ❌ datetime('now')

PROFIL :
  ✅ Toujours filtrer par profile_id
  ✅ await getCurrentProfileId() depuis lib/db.ts
  ✅ Apres mutation : useStore.getState().setProfile(updated)

ERREURS :
  import { showGeminiError, normalizeText } from '@/lib/utils'

BACK HANDLER :
  lib/useModalManager.ts → registerModal + useGlobalBackHandler
  useGlobalBackHandler() dans app/_layout.tsx — une seule fois

FICHIERS CLES :
  app/(tabs)/index.tsx       → Dashboard
  app/(tabs)/journal.tsx     → Journal alimentaire
  app/(tabs)/eau.tsx         → Hydratation
  app/(tabs)/plan.tsx        → Plan alimentaire
  app/(tabs)/profil.tsx      → Profil utilisateur
  app/projection.tsx         → Projection poids
  lib/db.ts                  → DB & queries SQLite
  lib/achievements.ts        → Badges + progress()
  lib/nutrition.ts           → Calculs nutritionnels
  lib/gemini.ts              → API Gemini
  lib/utils.ts               → Utilitaires partages
  lib/store.ts               → Zustand store
  lib/useModalManager.ts     → registerModal + useGlobalBackHandler
  components/Achievements.tsx → AchievementGrid + BadgeItem
  components/BadgeCelebration.tsx → Modal celebration badge
  components/KeyboardAwareModal.tsx → Modal keyboard-safe

---

// ============================================================
// VALIDATION ENGINE — FAIL-FAST (MANDATORY)
// ============================================================

ETAPE 1 — Generer le MODAL INVENTORY complet
ETAPE 2 — Verifier chaque rule 1 → 10
ETAPE 3 — Si N detecte → STOP → FIX → RE-VALIDATE

HOOKS & SCOPE
  □ Tous les hooks avant tout return conditionnel
  □ registerModal au TOP de chaque composant
  □ Toute variable dans un Modal definie au niveau composant
  □ useMemo sur les calculs couteux reutilises
  □ Aucun IIFE JSX ne calcule des variables reutilisees ailleurs

SELF-HEALING
  □ Migrations avec .catch(() => {})
  □ weight_initial jamais ecrase si valide
  □ healRan guard en place
  □ Profile name → fallback 'Mon profil' si vide

MODAL SYSTEM (Rules 1 → 10)
  □ Aucun <Modal brut
  □ Chaque modal : 4 conditions valides
  □ registerModal pour chaque modal du MODAL INVENTORY
  □ useGlobalBackHandler dans _layout.tsx uniquement
  □ CTA toujours hors ScrollView
  □ maxHeight via Dimensions (jamais en %)
  □ paddingBottom ≥ 48

DONNEES
  □ Sequences state respectees apres mutation
  □ Gemini outputs clampes
  □ Aucune ecriture DB dans le render

BADGES
  □ Queue FIFO — aucun badge perdu
  □ Badges reconquis silencieux (pas d'animation)

SI UN CHECK ECHOUE :
  → STOP → CORRIGER → RE-VALIDER DEPUIS LE DEBUT
  Zero tolerance aux regressions.

---

// ============================================================
// TERMINAL COMMANDS (ordre exact — Windows PowerShell)
// ============================================================

git add -A && git commit -m "description" && git push

cd C:\Users\user\LeanTrack && eas update --channel preview --message "description"

// UNIQUEMENT si changement natif (app.json, nouveau package) :
cd C:\Users\user\LeanTrack && eas build -p android --profile preview
