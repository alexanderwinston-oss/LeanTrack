@AGENTS.md
/**
 * ============================================================
 * LEANTRACK Â· CLAUDE CODE SYSTEM PROMPT
 * Staff Engineer Edition â€” v10.2
 * ============================================================
 * PHILOSOPHIE :
 * On n'elimine pas des bugs â€” on elimine des classes de bugs
 * via des regles systemiques, validation automatique,
 * et architecture auto-correctrice.
 * ============================================================
 */

// ============================================================
// THINKING PROCESS (MANDATORY â€” NEVER SKIP)
// ============================================================

1. UNDERSTAND
   - Quels sont les symptomes exacts ?
   - Quels fichiers et composants sont impactes ?

2. DIAGNOSE
   - Cause racine (pas le symptome)
   - Local ou systemique ?
   - Reproduit dans plusieurs fichiers â†’ SYSTEM BUG

3. DECIDE
   - Regle globale > fix local
   - Zero duplication de logique

4. IMPLEMENT
   - Lire TOUS les fichiers avant toute modification
   - Utiliser les patterns etablis â€” jamais les reinventer

5. VERIFY
   - MODAL INVENTORY + FAIL-FAST obligatoires
   - Si echec â†’ STOP â†’ FIX â†’ RE-VALIDATE

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
// MODULE: HOOKS ORDER (MANDATORY â€” ABSOLUTE RULE)
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

VIOLATION â†’ crash immediat :
  if (!profile) return null
  const x = useMemo(() => ...)   // hook apres return = CRASH

Fonctions pures â†’ definies HORS du composant, niveau module.

---

// ============================================================
// MODULE: JSX SCOPE SAFETY (MANDATORY â€” ABSOLUTE RULE)
// ============================================================

Toute variable utilisee dans PLUS D'UN endroit du composant
doit etre calculee au niveau du composant â€” jamais dans un
IIFE JSX, bloc conditionnel, ou callback.

INTERDIT â€” variable invisible hors de son IIFE :
  return (
    <>
      {(() => {
        const totalXP = ...    // scope local uniquement
        return <Text>{totalXP}</Text>
      })()}
      <Modal>
        <Text>{totalXP}</Text> // UNDEFINED â€” hors scope
      </Modal>
    </>
  )

CORRECT â€” variable au niveau composant :
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
        <Text>{totalXP}</Text>  // OK â€” meme scope
      </Modal>
    </>
  )

REGLE ABSOLUE : toute variable referencee dans un Modal
vit au niveau composant avec useMemo si couteuse.
Jamais dans un IIFE JSX. Jamais dans un bloc conditionnel JSX.

CHECKLIST avant chaque prompt :
  â–¡ Chaque variable dans un Modal est definie au niveau composant ?
  â–¡ Aucun IIFE JSX ne calcule des variables reutilisees ailleurs ?

---

// ============================================================
// MODULE: SELF-HEALING (MANDATORY â€” ABSOLUTE RULE)
// ============================================================

Chaque systeme detecte et corrige ses propres etats
incoherents sans intervention utilisateur.

LEVEL 1 â€” DATA (guard flag â€” une seule fois) :
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

LEVEL 2 â€” SCHEMA :
  for (const sql of migrations) {
    await db.execAsync(sql).catch(() => {})
    // .catch(() => {}) = colonne deja existante â†’ skip silencieux
  }

LEVEL 3 â€” STATE :
  useFocusEffect recharge depuis la DB a chaque focus.
  DB = source de verite. Store = couche affichage.

LEVEL 4 â€” ERROR RECOVERY :
  DB : 1 retry 500ms â†’ alert actionnable.
  Gemini : 0 retry (risque quota) â†’ fallback immediat.

LEVEL 5 â€” SESSION STARTUP (ordre obligatoire) :
  migrateSchema â†’ healData â†’ reload store
  â†’ checkAchievements â†’ load today data
  Chaque etape dans try/catch independant.

Profile name self-healing :
  display_name || name || 'Mon profil'
  Jamais de carte profil sans nom visible.

---

// ============================================================
// MODULE: MODAL SYSTEM ENGINE v10.1 (MANDATORY)
// ============================================================

DEFINITION FORMELLE â€” UN MODAL EST VALIDE SI ET SEULEMENT SI :
  1. Fully scrollable       â€” contenu accessible meme si long
  2. Keyboard-safe          â€” aucun input cache sous le clavier
  3. Back-button safe       â€” fermable via touche retour Android
  4. Cannot clip content    â€” aucun texte ou bouton coupe
IF one condition fails â†’ the modal is broken â†’ fix before shipping.

RULES (BINARY â€” NO EXCEPTIONS) :

RULE 1 â€” MODAL USAGE
  âŒ <Modal direct â†’ interdit
  âœ… KeyboardAwareModal (contient TextInput)
  âœ… Bottom sheet (selection/actions)
  Si <Modal detecte â†’ remplacer immediatement

RULE 2 â€” KEYBOARD SAFETY
  Tout Modal avec TextInput â†’ KeyboardAwareModal obligatoire
  Fallback : app.json â†’ softwareKeyboardLayoutMode: "pan"

RULE 3 â€” SELF-HEALING MODAL
  3 chemins de fermeture obligatoires :
  1. Bouton interne
  2. Tap backdrop
  3. Bouton back Android (registerModal)
  Si un manque â†’ modal invalide

RULE 4 â€” BACK HANDLER GLOBAL
  âŒ useBackHandler duplique par composant â†’ interdit
  âœ… lib/useModalManager.ts :

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

  app/_layout.tsx â†’ useGlobalBackHandler() une seule fois.
  Chaque composant â†’ registerModal(...) au TOP avant tout return.

RULE 5 â€” HOOKS ORDER
  Tous les hooks avant tout return conditionnel.

RULE 6 â€” UI CONTRACT (ANTI-CROPPING)
  âŒ Aucun contenu coupe
  âŒ Aucune height fixe sur contenu dynamique
  âœ… maxHeight via Dimensions uniquement â€” jamais en % :
     const SCREEN_H = Dimensions.get('window').height
     maxHeight: SCREEN_H * 0.85
  âœ… paddingBottom â‰¥ 48
  âœ… CTA toujours visible sans scroll

RULE 7 â€” SCROLL ARCHITECTURE
  <View style={{ maxHeight: SCREEN_H * 0.85 }}>
    <ScrollView style={{ flex: 1 }}>
      {/* TOUT le contenu ici */}
    </ScrollView>
    {/* CTA TOUJOURS EN DEHORS */}
    <TouchableOpacity />
    <View style={{ height: 20 }} />
  </View>

RULE 8 â€” NO FIXED HEIGHT
  âŒ height fixe sur card, nextBox, containers
  âœ… maxHeight via Dimensions uniquement
  âœ… flexShrink: 1 sur tout Text multiligne

RULE 9 â€” DEDUPLICATION
  Aucune logique repetee â†’ centraliser dans lib/

RULE 10 â€” NO MODAL FROM SCRATCH
  âŒ Creer un modal de zero â†’ strictement interdit
  âœ… Toujours partir de KeyboardAwareModal ou BaseBottomSheet
  Chaque nouveau modal herite du contrat des 4 conditions.

KeyboardAwareModal contract :
  âœ… behavior="padding"
  âœ… justifyContent: "flex-end"
  âœ… keyboardShouldPersistTaps="handled"
  âœ… paddingBottom â‰¥ 48
  âœ… onContentSizeChange â†’ scrollToEnd
  âœ… statusBarTranslucent

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

Tout N non justifie â†’ correction avant de terminer.

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

  âœ… weight_initial = poids onboarding uniquement â€” immuable
  âŒ NEVER overwrite si deja valide (> 0, not null)
  âœ… Auto-heal via healRan guard
  âŒ recalculateTargetsAfterWeighIn ne touche JAMAIS weight_initial

---

// ============================================================
// MODULE: DB WRITE SAFETY (MANDATORY)
// ============================================================

  âŒ Jamais d'ecriture DB dans le render
  âœ… Mutations dans async handlers uniquement
  âœ… Une seule execution par correction (guard flag)
  âŒ Aucun side-effect cache dans les composants UI

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
      isQuota ? 'â³ Limite atteinte' : 'Erreur',
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

FIFO â€” un a la fois â€” aucun badge perdu â€” pas de stacking.

Badges reconquis (passes && current?.lost_at) :
  â†’ mise a jour silencieuse en DB
  â†’ NE PAS push dans newlyUnlocked
  â†’ pas d'animation (deja obtenu precedemment)

---

// ============================================================
// MODULE: SCHEDULE BOUNDS (MANDATORY)
// ============================================================

  // Hors composant â€” niveau module :
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
// LEANTRACK PATTERNS (TOUJOURS â€” JAMAIS REINVENTER)
// ============================================================

DATES :
  âœ… getLocalDateString() â€” âŒ toISOString().split('T')[0]
  âœ… datetime('now', 'localtime') â€” âŒ datetime('now')

PROFIL :
  âœ… Toujours filtrer par profile_id
  âœ… await getCurrentProfileId() depuis lib/db.ts
  âœ… Apres mutation : useStore.getState().setProfile(updated)

ERREURS :
  import { showGeminiError, normalizeText } from '@/lib/utils'

BACK HANDLER :
  lib/useModalManager.ts â†’ registerModal + useGlobalBackHandler
  useGlobalBackHandler() dans app/_layout.tsx â€” une seule fois

FICHIERS CLES :
  app/(tabs)/index.tsx       â†’ Dashboard
  app/(tabs)/journal.tsx     â†’ Journal alimentaire
  app/(tabs)/eau.tsx         â†’ Hydratation
  app/(tabs)/plan.tsx        â†’ Plan alimentaire
  app/(tabs)/profil.tsx      â†’ Profil utilisateur
  app/projection.tsx         â†’ Projection poids
  lib/db.ts                  â†’ DB & queries SQLite
  lib/achievements.ts        â†’ Badges + progress()
  lib/nutrition.ts           â†’ Calculs nutritionnels
  lib/gemini.ts              â†’ API Gemini
  lib/utils.ts               â†’ Utilitaires partages
  lib/store.ts               â†’ Zustand store
  lib/useModalManager.ts     â†’ registerModal + useGlobalBackHandler
  components/Achievements.tsx â†’ AchievementGrid + BadgeItem
  components/BadgeCelebration.tsx â†’ Modal celebration badge
  components/KeyboardAwareModal.tsx â†’ Modal keyboard-safe

---

// ============================================================
// VALIDATION ENGINE â€” FAIL-FAST (MANDATORY)
// ============================================================

ETAPE 1 â€” Generer le MODAL INVENTORY complet
ETAPE 2 â€” Verifier chaque rule 1 â†’ 10
ETAPE 3 â€” Si N detecte â†’ STOP â†’ FIX â†’ RE-VALIDATE

HOOKS & SCOPE
  â–¡ Tous les hooks avant tout return conditionnel
  â–¡ registerModal au TOP de chaque composant
  â–¡ Toute variable dans un Modal definie au niveau composant
  â–¡ useMemo sur les calculs couteux reutilises
  â–¡ Aucun IIFE JSX ne calcule des variables reutilisees ailleurs

SELF-HEALING
  â–¡ Migrations avec .catch(() => {})
  â–¡ weight_initial jamais ecrase si valide
  â–¡ healRan guard en place
  â–¡ Profile name â†’ fallback 'Mon profil' si vide

MODAL SYSTEM (Rules 1 â†’ 10)
  â–¡ Aucun <Modal brut
  â–¡ Chaque modal : 4 conditions valides
  â–¡ registerModal pour chaque modal du MODAL INVENTORY
  â–¡ useGlobalBackHandler dans _layout.tsx uniquement
  â–¡ CTA toujours hors ScrollView
  â–¡ maxHeight via Dimensions (jamais en %)
  â–¡ paddingBottom â‰¥ 48

DONNEES
  â–¡ Sequences state respectees apres mutation
  â–¡ Gemini outputs clampes
  â–¡ Aucune ecriture DB dans le render

BADGES
  â–¡ Queue FIFO â€” aucun badge perdu
  â–¡ Badges reconquis silencieux (pas d'animation)

SI UN CHECK ECHOUE :
  â†’ STOP â†’ CORRIGER â†’ RE-VALIDER DEPUIS LE DEBUT
  Zero tolerance aux regressions.

---

// ============================================================
// TERMINAL COMMANDS (ordre exact â€” Windows PowerShell)
// ============================================================

git add -A && git commit -m "description" && git push

cd C:\Users\user\LeanTrack && eas update --channel preview --message "description"

// UNIQUEMENT si changement natif (app.json, nouveau package) :
cd C:\Users\user\LeanTrack && eas build -p android --profile preview
