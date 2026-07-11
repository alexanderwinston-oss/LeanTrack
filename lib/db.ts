import * as SQLite from 'expo-sqlite';
import { AchievementStats, DailyEntry, DailyTotals, Meal, MealPlan, Recipe, UserProfile, WeightEntry } from './types';
import { AchievementDef, ALL_ACHIEVEMENTS } from './achievements';
import { CALORIE_TARGET_MAX_RATIO, CALORIE_TARGET_MIN_RATIO, getLocalDateString } from './utils';
import { calcFullProfile } from './nutrition';

let _db: SQLite.SQLiteDatabase | null = null;
let _activeProfileId: string | null = null;
let _healRanThisSession = false;
let _recoveryRanThisSession = false;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync('leantrack.db');
  }
  return _db;
}

export async function getCurrentProfileId(): Promise<string> {
  if (_activeProfileId) return _activeProfileId;
  const db = await getDB();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?', ['active_profile_id']
  );
  _activeProfileId = row?.value ?? 'default';
  return _activeProfileId;
}

export function clearProfileIdCache(): void {
  _activeProfileId = null;
}

// ─── Generic settings key-value store ──────────────────────────────────────

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM settings WHERE key = ?', [key]
  );
  return row?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value]
  );
}

async function safeAlterAdd(
  db: SQLite.SQLiteDatabase,
  table: string,
  column: string,
  definition: string
): Promise<void> {
  try {
    await db.execAsync(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  } catch {
    // Column already exists — ignore
  }
}

// Runs once to recover the main profile if onboarding overwrote it with defaults.
// Detectable by: name empty + calorie_target ~2007 (fresh onboarding defaults).
export async function recoverMainProfile(): Promise<void> {
  if (_recoveryRanThisSession) return;
  _recoveryRanThisSession = true;

  const db = await getDB();
  const profileId = await getCurrentProfileId();
  const p = await db.getFirstAsync<any>(
    'SELECT name, calorie_target, target_date FROM user_profile WHERE profile_id = ?', [profileId]
  );
  if (!p) return;

  const nameOk = p.name && p.name.trim().length > 0;
  const calOk = p.calorie_target && p.calorie_target > 2100;
  if (nameOk && calOk) return; // Nothing to recover

  const targetDate = p.target_date || getLocalDateString(new Date(Date.now() + 180 * 24 * 60 * 60 * 1000));
  const recovered = calcFullProfile({
    name: 'Alexander', age: 30, gender: 'homme',
    weight_current: 107.5, weight_target: 94, height: 177,
    activity_level: 'modere', goal: 'perte', target_date: targetDate,
  });

  await db.runAsync(
    `UPDATE user_profile SET
      name = ?, display_name = ?, age = ?, gender = ?,
      weight_current = ?, weight_initial = ?, weight_target = ?, height = ?,
      activity_level = ?, goal = ?, target_date = ?,
      calorie_target = ?, tdee = ?,
      protein_target = ?, carbs_target = ?, fat_target = ?, water_target = ?,
      onboarding_completed = 1
    WHERE profile_id = ?`,
    [
      'Alexander', 'Alexander', 30, 'homme',
      107.5, 110, 94, 177,
      'modere', 'perte', targetDate,
      recovered.calorie_target, recovered.tdee,
      recovered.protein_target, recovered.carbs_target,
      recovered.fat_target, recovered.water_target,
      profileId,
    ]
  );
}

export async function healData(): Promise<void> {
  if (_healRanThisSession) return;
  _healRanThisSession = true;

  const db = await getDB();
  const profileId = await getCurrentProfileId();
  const profile = await db.getFirstAsync<any>(
    'SELECT * FROM user_profile WHERE profile_id = ?', [profileId]
  );
  if (!profile) return;

  const fixes: Record<string, any> = {};

  if (!profile.weight_initial || profile.weight_initial === 0) {
    const logs = await db.getAllAsync<{ weight: number }>(
      'SELECT weight FROM weight_log WHERE profile_id = ? ORDER BY date ASC', [profileId]
    );
    fixes.weight_initial = logs.length > 0
      ? Math.max(...logs.map((l: any) => l.weight))
      : profile.weight_current;
  }

  if (!profile.calorie_target || profile.calorie_target === 0
      || !profile.tdee || profile.tdee === 0) {
    const recalc = calcFullProfile({
      name: profile.name,
      age: profile.age,
      gender: profile.gender,
      weight_current: profile.weight_current,
      weight_target: profile.weight_target,
      height: profile.height,
      activity_level: profile.activity_level,
      goal: profile.goal,
      target_date: profile.target_date || '',
    });
    fixes.calorie_target = recalc.calorie_target;
    fixes.protein_target = recalc.protein_target;
    fixes.carbs_target   = recalc.carbs_target;
    fixes.fat_target     = recalc.fat_target;
    fixes.water_target   = recalc.water_target;
    fixes.tdee           = recalc.tdee;
  }

  if (Object.keys(fixes).length === 0) return;
  const sets = Object.keys(fixes).map(k => `${k} = ?`).join(', ');
  await db.runAsync(
    `UPDATE user_profile SET ${sets} WHERE profile_id = ?`,
    [...Object.values(fixes), profileId]
  );
}

export async function initDB(): Promise<void> {
  const db = await getDB();

  // Core schema
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      age INTEGER NOT NULL,
      gender TEXT NOT NULL,
      weight_initial REAL DEFAULT NULL,
      weight_current REAL NOT NULL,
      weight_target REAL NOT NULL,
      height REAL NOT NULL,
      activity_level TEXT NOT NULL,
      goal TEXT NOT NULL,
      target_date TEXT NOT NULL,
      tdee REAL NOT NULL,
      calorie_target REAL NOT NULL,
      protein_target REAL NOT NULL,
      carbs_target REAL NOT NULL,
      fat_target REAL NOT NULL,
      water_target REAL NOT NULL,
      notifications_enabled INTEGER NOT NULL DEFAULT 0,
      onboarding_completed INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS meals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      meal_type TEXT NOT NULL,
      food_name TEXT NOT NULL,
      quantity_g REAL NOT NULL,
      calories REAL NOT NULL,
      protein REAL NOT NULL,
      carbs REAL NOT NULL,
      fat REAL NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      photo_uri TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      base_calories REAL DEFAULT NULL,
      base_protein REAL DEFAULT NULL,
      base_carbs REAL DEFAULT NULL,
      base_fat REAL DEFAULT NULL,
      base_quantity_g REAL DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS water_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      amount_ml INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS weight_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      weight REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS meal_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_json TEXT NOT NULL,
      generated_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT NOT NULL,
      profile_id TEXT NOT NULL DEFAULT 'default',
      unlocked_at TEXT,
      lost_at TEXT,
      PRIMARY KEY (id, profile_id)
    );

    CREATE TABLE IF NOT EXISTS water_favorites (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL,
      amount_ml INTEGER NOT NULL,
      label TEXT,
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS recipes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      servings INTEGER DEFAULT 2,
      calories_per_serving INTEGER DEFAULT 0,
      protein_g REAL DEFAULT 0,
      carbs_g REAL DEFAULT 0,
      fat_g REAL DEFAULT 0,
      prep_time_minutes INTEGER DEFAULT 0,
      cook_time_minutes INTEGER DEFAULT 0,
      ingredients_json TEXT DEFAULT '[]',
      steps_json TEXT DEFAULT '[]',
      profile_id TEXT DEFAULT 'default',
      created_at TEXT DEFAULT (datetime('now', 'localtime'))
    );

    CREATE TABLE IF NOT EXISTS coach_analyses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL,
      week_start TEXT NOT NULL,
      analysis_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      UNIQUE(profile_id, week_start)
    );
  `);

  // Safe column migrations for features added after initial release
  const migrations: [string, string, string][] = [
    ['meals', 'notes', "TEXT DEFAULT ''"],
    ['meals', 'profile_id', "TEXT NOT NULL DEFAULT 'default'"],
    ['meals', 'base_calories', 'REAL DEFAULT NULL'],
    ['meals', 'base_protein', 'REAL DEFAULT NULL'],
    ['meals', 'base_carbs', 'REAL DEFAULT NULL'],
    ['meals', 'base_fat', 'REAL DEFAULT NULL'],
    ['meals', 'base_quantity_g', 'REAL DEFAULT NULL'],
    ['water_log', 'profile_id', "TEXT NOT NULL DEFAULT 'default'"],
    ['weight_log', 'profile_id', "TEXT NOT NULL DEFAULT 'default'"],
    // achievements schema migrated via achievements_pk_v2 below
    ['user_profile', 'profile_id', "TEXT DEFAULT 'default'"],
    ['user_profile', 'emoji_color', "TEXT DEFAULT '#10b981'"],
    ['user_profile', 'display_name', "TEXT DEFAULT ''"],
    ['user_profile', 'is_active', 'INTEGER DEFAULT 0'],
    ['user_profile', 'weight_initial', 'REAL DEFAULT NULL'],
  ];
  for (const [table, col, def] of migrations) {
    await safeAlterAdd(db, table, col, def);
  }

  // Migration : rebuild achievements table with composite PRIMARY KEY (id, profile_id)
  const achievementsMigrated = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM settings WHERE key = 'achievements_pk_v2'"
  );
  if (!achievementsMigrated) {
    await db.execAsync(`
      DROP TABLE IF EXISTS achievements;
      CREATE TABLE achievements (
        id TEXT NOT NULL,
        profile_id TEXT NOT NULL DEFAULT 'default',
        unlocked_at TEXT,
        lost_at TEXT,
        PRIMARY KEY (id, profile_id)
      );
    `);
    await db.runAsync(
      "INSERT OR REPLACE INTO settings (key, value) VALUES ('achievements_pk_v2', '1')"
    );
  }

  // Activate default profile on first run
  await db.execAsync(`
    INSERT OR IGNORE INTO settings (key, value) VALUES ('active_profile_id', 'default');
    UPDATE user_profile SET is_active = 1, profile_id = 'default' WHERE id = 1 AND is_active = 0;
  `);
}

// ─── Profile helpers ────────────────────────────────────────────────────────

function rowToProfile(row: any): UserProfile {
  return {
    ...row,
    notifications_enabled: row.notifications_enabled === 1,
    onboarding_completed: row.onboarding_completed === 1,
    is_active: row.is_active === 1,
  };
}

export async function getProfile(): Promise<UserProfile | null> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  const row = await db.getFirstAsync<any>(
    'SELECT * FROM user_profile WHERE profile_id = ?', [profileId]
  );
  if (!row) {
    // Backward compat fallback
    const fallback = await db.getFirstAsync<any>('SELECT * FROM user_profile WHERE id = 1');
    return fallback ? rowToProfile(fallback) : null;
  }
  return rowToProfile(row);
}

export async function getAllProfiles(): Promise<UserProfile[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<any>(
    'SELECT * FROM user_profile ORDER BY is_active DESC, id ASC'
  );
  return rows.map(rowToProfile);
}

export async function saveProfile(data: UserProfile): Promise<void> {
  const db = await getDB();
  const profileId = data.profile_id ?? await getCurrentProfileId();

  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM user_profile WHERE profile_id = ?', [profileId]
  );

  if (existing) {
    await db.runAsync(
      `UPDATE user_profile SET
        name = ?, age = ?, gender = ?, weight_current = ?, weight_target = ?,
        height = ?, activity_level = ?, goal = ?, target_date = ?, tdee = ?,
        calorie_target = ?, protein_target = ?, carbs_target = ?, fat_target = ?,
        water_target = ?, notifications_enabled = ?, onboarding_completed = ?,
        emoji_color = COALESCE(?, emoji_color), display_name = COALESCE(?, display_name),
        is_active = COALESCE(?, is_active)
       WHERE profile_id = ?`,
      [
        data.name, data.age, data.gender, data.weight_current, data.weight_target,
        data.height, data.activity_level, data.goal, data.target_date,
        data.tdee, data.calorie_target, data.protein_target, data.carbs_target,
        data.fat_target, data.water_target,
        data.notifications_enabled ? 1 : 0,
        data.onboarding_completed ? 1 : 0,
        data.emoji_color ?? null,
        data.display_name ?? null,
        data.is_active !== undefined ? (data.is_active ? 1 : 0) : null,
        profileId,
      ]
    );
  } else {
    await db.runAsync(
      `INSERT INTO user_profile
        (profile_id, name, age, gender, weight_initial, weight_current, weight_target, height, activity_level,
         goal, target_date, tdee, calorie_target, protein_target, carbs_target, fat_target,
         water_target, notifications_enabled, onboarding_completed, emoji_color, display_name, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        profileId, data.name, data.age, data.gender,
        data.weight_initial ?? data.weight_current,
        data.weight_current, data.weight_target,
        data.height, data.activity_level, data.goal, data.target_date,
        data.tdee, data.calorie_target, data.protein_target, data.carbs_target,
        data.fat_target, data.water_target,
        data.notifications_enabled ? 1 : 0,
        data.onboarding_completed ? 1 : 0,
        data.emoji_color ?? '#10b981',
        data.display_name ?? data.name,
        data.is_active ? 1 : 0,
      ]
    );
  }
}

function generateProfileId(): string {
  return `profile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

export async function createProfile(data: Partial<UserProfile>): Promise<string> {
  const db = await getDB();
  const profileId = generateProfileId();
  const initWeight = data.weight_current ?? 70;
  await db.runAsync(
    `INSERT INTO user_profile
      (profile_id, name, age, gender, weight_initial, weight_current, weight_target, height, activity_level,
       goal, target_date, tdee, calorie_target, protein_target, carbs_target, fat_target,
       water_target, notifications_enabled, onboarding_completed, emoji_color, display_name, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      profileId, data.name ?? 'Nouveau profil', data.age ?? 25, data.gender ?? 'homme',
      initWeight, initWeight, data.weight_target ?? 65, data.height ?? 170,
      data.activity_level ?? 'modere', data.goal ?? 'perte',
      data.target_date ?? '', data.tdee ?? 2000, data.calorie_target ?? 1800,
      data.protein_target ?? 150, data.carbs_target ?? 200, data.fat_target ?? 60,
      data.water_target ?? 2000,
      0, 0,
      data.emoji_color ?? '#10b981',
      data.display_name ?? data.name ?? 'Nouveau profil',
      0,
    ]
  );
  return profileId;
}

export async function switchProfile(profileId: string): Promise<void> {
  const db = await getDB();
  const exists = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM user_profile WHERE profile_id = ?', [profileId]
  );
  if (!exists) throw new Error(`Profil introuvable : ${profileId}`);
  await db.execAsync(`UPDATE user_profile SET is_active = 0`);
  await db.runAsync(`UPDATE user_profile SET is_active = 1 WHERE profile_id = ?`, [profileId]);
  await db.runAsync(
    `INSERT OR REPLACE INTO settings (key, value) VALUES ('active_profile_id', ?)`,
    [profileId]
  );
  _activeProfileId = profileId;
}

export async function deleteProfile(profileId: string): Promise<void> {
  const activeId = await getCurrentProfileId();
  if (profileId === activeId) {
    throw new Error('Impossible de supprimer le profil actif.');
  }
  const db = await getDB();
  await db.runAsync('DELETE FROM meals WHERE profile_id = ?', [profileId]);
  await db.runAsync('DELETE FROM water_log WHERE profile_id = ?', [profileId]);
  await db.runAsync('DELETE FROM weight_log WHERE profile_id = ?', [profileId]);
  await db.runAsync('DELETE FROM achievements WHERE profile_id = ?', [profileId]);
  await db.runAsync('DELETE FROM user_profile WHERE profile_id = ?', [profileId]);
}

export async function resetAllData(profileId: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM meals WHERE profile_id = ?', [profileId]);
  await db.runAsync('DELETE FROM water_log WHERE profile_id = ?', [profileId]);
  await db.runAsync('DELETE FROM weight_log WHERE profile_id = ?', [profileId]);
  await db.runAsync('DELETE FROM achievements WHERE profile_id = ?', [profileId]);
  await db.runAsync(
    'UPDATE user_profile SET onboarding_completed = 0 WHERE profile_id = ?',
    [profileId]
  );
}

// ─── Meals ────────────────────────────────────────────────────────────────────

export async function addMeal(meal: Meal): Promise<void> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  await db.runAsync(
    `INSERT INTO meals
      (date, meal_type, food_name, quantity_g, calories, protein, carbs, fat, source, photo_uri, notes, profile_id,
       base_calories, base_protein, base_carbs, base_fat, base_quantity_g)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      meal.date, meal.meal_type, meal.food_name, meal.quantity_g,
      meal.calories, meal.protein, meal.carbs, meal.fat,
      meal.source, meal.photo_uri ?? null, meal.notes ?? '', profileId,
      meal.calories, meal.protein, meal.carbs, meal.fat, meal.quantity_g,
    ]
  );
}

export async function updateMeal(id: number, updates: Partial<Meal>): Promise<void> {
  const db = await getDB();
  const fields: string[] = [];
  const values: any[] = [];
  const allowed: (keyof Meal)[] = ['food_name', 'quantity_g', 'calories', 'protein', 'carbs', 'fat', 'meal_type', 'notes'];
  for (const key of allowed) {
    if (updates[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(updates[key]);
    }
  }
  if (!fields.length) return;
  values.push(id);
  await db.runAsync(`UPDATE meals SET ${fields.join(', ')} WHERE id = ?`, values);
}

export async function deleteMeal(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM meals WHERE id = ?', [id]);
}

export async function getMealsForDate(date: string): Promise<Meal[]> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  return db.getAllAsync<Meal>(
    'SELECT * FROM meals WHERE date = ? AND profile_id = ? ORDER BY created_at ASC',
    [date, profileId]
  );
}

export async function getDailyTotals(date: string): Promise<DailyTotals> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  const row = await db.getFirstAsync<any>(
    `SELECT
       COALESCE(SUM(calories), 0) as calories,
       COALESCE(SUM(protein), 0)  as protein,
       COALESCE(SUM(carbs), 0)    as carbs,
       COALESCE(SUM(fat), 0)      as fat
     FROM meals WHERE date = ? AND profile_id = ?`,
    [date, profileId]
  );
  const water = await getWaterForDate(date);
  return {
    date,
    calories: Math.round(row?.calories ?? 0),
    protein: Math.round(row?.protein ?? 0),
    carbs: Math.round(row?.carbs ?? 0),
    fat: Math.round(row?.fat ?? 0),
    water_ml: water,
  };
}

// ─── Water ────────────────────────────────────────────────────────────────────

export async function addWater(date: string, ml: number): Promise<void> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  await db.runAsync(
    'INSERT INTO water_log (date, amount_ml, profile_id) VALUES (?, ?, ?)',
    [date, ml, profileId]
  );
}

export async function getWaterForDate(date: string): Promise<number> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  const row = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(amount_ml), 0) as total FROM water_log WHERE date = ? AND profile_id = ?',
    [date, profileId]
  );
  return row?.total ?? 0;
}

export async function getWaterLogsForDate(
  date: string
): Promise<{ id: number; amount_ml: number; created_at: string }[]> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  return db.getAllAsync(
    'SELECT id, amount_ml, created_at FROM water_log WHERE date = ? AND profile_id = ? ORDER BY created_at ASC',
    [date, profileId]
  );
}

export async function deleteWaterEntry(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM water_log WHERE id = ?', [id]);
}

const MAX_WATER_FAVORITES = 8;

export async function getWaterFavorites(): Promise<
  { id: number; amount_ml: number; label: string | null }[]
> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  const own = await db.getAllAsync<{ id: number; amount_ml: number; label: string | null }>(
    'SELECT id, amount_ml, label FROM water_favorites WHERE profile_id = ? ORDER BY created_at DESC',
    [profileId]
  );
  if (own.length > 0 || profileId === 'default') return own;
  // Fallback for favorites saved under the legacy 'default' profile_id before
  // this profile's own scoping was in sync — only used when this profile has
  // none of its own, so it never leaks into a profile that already has favorites.
  return db.getAllAsync(
    'SELECT id, amount_ml, label FROM water_favorites WHERE profile_id = ? ORDER BY created_at DESC',
    ['default']
  );
}

export async function addWaterFavorite(amount_ml: number, label?: string): Promise<void> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  const count = await db.getFirstAsync<{ c: number }>(
    'SELECT COUNT(*) as c FROM water_favorites WHERE profile_id = ?',
    [profileId]
  );
  if ((count?.c ?? 0) >= MAX_WATER_FAVORITES) {
    throw new Error('MAX_FAVORITES');
  }
  await db.runAsync(
    'INSERT INTO water_favorites (profile_id, amount_ml, label) VALUES (?, ?, ?)',
    [profileId, amount_ml, label ?? `${amount_ml} ml`]
  );
}

export async function deleteWaterFavorite(id: number): Promise<void> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  await db.runAsync(
    'DELETE FROM water_favorites WHERE id = ? AND (profile_id = ? OR profile_id = \'default\')',
    [id, profileId]
  );
}

// ─── Weight ──────────────────────────────────────────────────────────────────

export async function logWeight(date: string, weight: number): Promise<void> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  await db.runAsync(
    'INSERT OR REPLACE INTO weight_log (date, weight, profile_id) VALUES (?, ?, ?)',
    [date, weight, profileId]
  );
}

export async function getWeightHistory(days: number): Promise<WeightEntry[]> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  return db.getAllAsync<WeightEntry>(
    'SELECT date, weight FROM weight_log WHERE profile_id = ? ORDER BY date DESC LIMIT ?',
    [profileId, days]
  );
}

export async function getAllWeightEntries(): Promise<WeightEntry[]> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  return db.getAllAsync<WeightEntry>(
    'SELECT date, weight FROM weight_log WHERE profile_id = ? ORDER BY date DESC',
    [profileId]
  );
}

export async function updateWeightEntry(date: string, weight: number): Promise<void> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM weight_log WHERE date = ? AND profile_id = ?', [date, profileId]);
    await db.runAsync(
      'INSERT INTO weight_log (date, weight, profile_id) VALUES (?, ?, ?)',
      [date, weight, profileId]
    );
  });
}

export async function deleteWeightEntry(date: string): Promise<void> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  await db.runAsync('DELETE FROM weight_log WHERE date = ? AND profile_id = ?', [date, profileId]);
}

export async function updateWeightInitial(weight: number): Promise<void> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  await db.runAsync(
    'UPDATE user_profile SET weight_initial = ? WHERE profile_id = ?',
    [weight, profileId]
  );
}

export async function recalculateTargetsAfterWeighIn(newWeight: number): Promise<void> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  const row = await db.getFirstAsync<any>(
    'SELECT * FROM user_profile WHERE profile_id = ?', [profileId]
  );
  if (!row) return;
  const updated = calcFullProfile({
    name: row.name,
    age: row.age,
    gender: row.gender,
    weight_current: newWeight,
    weight_target: row.weight_target,
    height: row.height,
    activity_level: row.activity_level,
    goal: row.goal,
    target_date: row.target_date,
  });
  await db.runAsync(
    `UPDATE user_profile SET weight_current=?, tdee=?, calorie_target=?, protein_target=?,
     carbs_target=?, fat_target=?, water_target=? WHERE profile_id=?`,
    [newWeight, updated.tdee, updated.calorie_target, updated.protein_target,
     updated.carbs_target, updated.fat_target, updated.water_target, profileId]
  );
}

export async function checkAllAchievements(): Promise<AchievementDef[]> {
  const profile = await getProfile();
  if (!profile) return [];
  return checkAndUnlockAchievements(profile);
}

// ─── Weekly data ─────────────────────────────────────────────────────────────

export async function getWeeklyData(startDate: string, endDate: string): Promise<DailyEntry[]> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();

  const mealRows = await db.getAllAsync<{
    date: string;
    total_calories: number;
    total_protein: number;
    total_carbs: number;
    total_fat: number;
  }>(
    `SELECT date,
       COALESCE(SUM(calories), 0) as total_calories,
       COALESCE(SUM(protein), 0) as total_protein,
       COALESCE(SUM(carbs), 0) as total_carbs,
       COALESCE(SUM(fat), 0) as total_fat
     FROM meals WHERE date BETWEEN ? AND ? AND profile_id = ?
     GROUP BY date`,
    [startDate, endDate, profileId]
  );

  const waterRows = await db.getAllAsync<{ date: string; total: number }>(
    `SELECT date, COALESCE(SUM(amount_ml), 0) as total
     FROM water_log WHERE date BETWEEN ? AND ? AND profile_id = ?
     GROUP BY date`,
    [startDate, endDate, profileId]
  );

  const mealMap = new Map(mealRows.map((r) => [r.date, r]));
  const waterMap = new Map(waterRows.map((r) => [r.date, r.total]));

  const result: DailyEntry[] = [];
  const cursor = new Date(startDate);
  const end = new Date(endDate);
  while (cursor <= end) {
    const dateStr = getLocalDateString(cursor);
    const m = mealMap.get(dateStr);
    result.push({
      date: dateStr,
      total_calories: m?.total_calories ?? 0,
      total_protein: m?.total_protein ?? 0,
      total_carbs: m?.total_carbs ?? 0,
      total_fat: m?.total_fat ?? 0,
      water_ml: waterMap.get(dateStr) ?? 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

export async function getMealNamesForRange(
  startDate: string, endDate: string
): Promise<{ date: string; food_name: string }[]> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  return db.getAllAsync<{ date: string; food_name: string }>(
    `SELECT date, food_name FROM meals
     WHERE date BETWEEN ? AND ? AND profile_id = ?
     ORDER BY date ASC, created_at ASC`,
    [startDate, endDate, profileId]
  );
}

export async function getWeightEntriesForRange(
  startDate: string, endDate: string
): Promise<WeightEntry[]> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  return db.getAllAsync<WeightEntry>(
    'SELECT date, weight FROM weight_log WHERE date BETWEEN ? AND ? AND profile_id = ? ORDER BY date ASC',
    [startDate, endDate, profileId]
  );
}

// ─── Coach IA (weekly analysis cache) ──────────────────────────────────────────

export async function getCoachAnalysis(
  weekStart: string
): Promise<{ analysis_json: string; created_at: string } | null> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  return db.getFirstAsync<{ analysis_json: string; created_at: string }>(
    'SELECT analysis_json, created_at FROM coach_analyses WHERE profile_id = ? AND week_start = ?',
    [profileId, weekStart]
  );
}

export async function saveCoachAnalysis(weekStart: string, analysisJson: string): Promise<void> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  await db.runAsync(
    `INSERT INTO coach_analyses (profile_id, week_start, analysis_json, created_at)
     VALUES (?, ?, ?, datetime('now', 'localtime'))
     ON CONFLICT(profile_id, week_start)
     DO UPDATE SET analysis_json = excluded.analysis_json, created_at = excluded.created_at`,
    [profileId, weekStart, analysisJson]
  );
}

export async function deleteCoachAnalysis(weekStart: string): Promise<void> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  await db.runAsync(
    'DELETE FROM coach_analyses WHERE profile_id = ? AND week_start = ?',
    [profileId, weekStart]
  );
}

// ─── Meal plan ───────────────────────────────────────────────────────────────

export async function saveMealPlan(json: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM meal_plan');
  await db.runAsync('INSERT INTO meal_plan (plan_json) VALUES (?)', [json]);
}

export async function getMealPlan(): Promise<MealPlan | null> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ plan_json: string }>(
    'SELECT plan_json FROM meal_plan ORDER BY id DESC LIMIT 1'
  );
  if (!row) return null;
  try { return JSON.parse(row.plan_json) as MealPlan; } catch { return null; }
}

// ─── Achievements ─────────────────────────────────────────────────────────────

export async function getUnlockedAchievements(): Promise<string[]> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  const rows = await db.getAllAsync<{ id: string }>(
    'SELECT id FROM achievements WHERE profile_id = ? AND (lost_at IS NULL)',
    [profileId]
  );
  return rows.map((r) => r.id);
}

export async function getAchievementsStatus(): Promise<
  { id: string; unlocked_at: string; lost_at: string | null }[]
> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  return db.getAllAsync(
    'SELECT id, unlocked_at, lost_at FROM achievements WHERE profile_id = ?',
    [profileId]
  );
}

function computeMaxStreak(datesDesc: string[]): number {
  if (!datesDesc.length) return 0;
  let max = 1, cur = 1;
  for (let i = 0; i < datesDesc.length - 1; i++) {
    const d1 = new Date(datesDesc[i] + 'T00:00:00');
    const d2 = new Date(datesDesc[i + 1] + 'T00:00:00');
    const diff = Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 1) { cur++; max = Math.max(max, cur); }
    else cur = 1;
  }
  return max;
}

function computeStreakFromDates(datesDesc: string[]): number {
  if (!datesDesc.length) return 0;
  let streak = 0;
  const today = new Date(getLocalDateString() + 'T00:00:00');
  for (let i = 0; i < datesDesc.length; i++) {
    const diff = Math.round(
      (today.getTime() - new Date(datesDesc[i] + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diff === i || diff === i + 1) streak++;
    else break;
  }
  return streak;
}

export async function getAchievementStats(profile: UserProfile): Promise<AchievementStats> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();

  const [waterEntryRow, waterGoalDays, mealCountRow, photoMealRow, loggingDaysRow,
         calorieGoalDays, lowCarbRow, weightCountRow, firstWeightRow] = await Promise.all([
    db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) as c FROM water_log WHERE profile_id = ?', [profileId]
    ),
    db.getAllAsync<{ date: string }>(
      `SELECT date FROM (
        SELECT date, SUM(amount_ml) as total FROM water_log WHERE profile_id = ?
        GROUP BY date HAVING total >= ?
      ) ORDER BY date DESC`,
      [profileId, profile.water_target]
    ),
    db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) as c FROM meals WHERE profile_id = ?', [profileId]
    ),
    db.getFirstAsync<{ c: number }>(
      "SELECT COUNT(*) as c FROM meals WHERE profile_id = ? AND source = 'photo'", [profileId]
    ),
    db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(DISTINCT date) as c FROM meals WHERE profile_id = ?', [profileId]
    ),
    db.getAllAsync<{ date: string }>(
      `SELECT date FROM (
        SELECT date, SUM(calories) as total FROM meals WHERE profile_id = ?
        GROUP BY date HAVING total >= ? AND total <= ?
      ) ORDER BY date DESC`,
      [profileId, profile.calorie_target * CALORIE_TARGET_MIN_RATIO, profile.calorie_target * CALORIE_TARGET_MAX_RATIO]
    ),
    db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM (
        SELECT date, SUM(carbs) as total FROM meals WHERE profile_id = ?
        GROUP BY date HAVING total < 200
      )`, [profileId]
    ),
    db.getFirstAsync<{ c: number }>(
      'SELECT COUNT(*) as c FROM weight_log WHERE profile_id = ?', [profileId]
    ),
    db.getFirstAsync<{ weight: number }>(
      'SELECT weight FROM weight_log WHERE profile_id = ? ORDER BY date ASC LIMIT 1', [profileId]
    ),
  ]);

  const waterGoalStreak = computeStreakFromDates(waterGoalDays.map((r) => r.date));
  const bestWaterGoalStreak = computeMaxStreak(waterGoalDays.map((r) => r.date));
  const calorieStreak = computeStreakFromDates(calorieGoalDays.map((r) => r.date));
  const bestCalorieStreak = computeMaxStreak(calorieGoalDays.map((r) => r.date));

  const appDays = await db.getAllAsync<{ date: string }>(
    `SELECT DISTINCT date FROM meals WHERE profile_id = ?
     UNION
     SELECT DISTINCT date FROM water_log WHERE profile_id = ?
     ORDER BY date DESC`,
    [profileId, profileId]
  );
  const appStreak = computeStreakFromDates(appDays.map((r) => r.date));
  const bestAppStreak = computeMaxStreak(appDays.map((r) => r.date));

  const latestWeightRow = await db.getFirstAsync<{ weight: number }>(
    'SELECT weight FROM weight_log WHERE profile_id = ? ORDER BY date DESC LIMIT 1', [profileId]
  );

  let weightLost = 0;
  let progressPercent = 0;
  if (firstWeightRow || profile.weight_initial) {
    const initial = profile.weight_initial ?? firstWeightRow?.weight ?? profile.weight_current;
    const current = latestWeightRow?.weight ?? profile.weight_current;
    const target = profile.weight_target;
    if (profile.goal === 'perte') {
      weightLost = initial - current;
      const total = initial - target;
      progressPercent = total > 0 ? Math.min(Math.max((weightLost / total) * 100, 0), 100) : 0;
    } else if (profile.goal === 'prise') {
      weightLost = current - initial;
      const total = target - initial;
      progressPercent = total > 0 ? Math.min(Math.max((weightLost / total) * 100, 0), 100) : 0;
    } else {
      progressPercent = Math.abs(current - target) <= 1 ? 100 : 0;
    }
  }

  // ── New stats ─────────────────────────────────────────────────────────────────

  const mealDates = await db.getAllAsync<{ date: string }>(
    'SELECT DISTINCT date FROM meals WHERE profile_id = ? ORDER BY date DESC',
    [profileId]
  );
  const loggingStreak = computeStreakFromDates(mealDates.map((r) => r.date));
  const bestLoggingStreak = computeMaxStreak(mealDates.map((r) => r.date));

  const proteinGoalDays = await db.getAllAsync<{ date: string }>(
    `SELECT date FROM (
      SELECT date, SUM(protein) as total FROM meals
      WHERE profile_id = ?
      GROUP BY date HAVING total >= ? AND total <= ?
    ) ORDER BY date DESC`,
    [profileId, profile.protein_target * 0.9, profile.protein_target * 1.1]
  );
  const proteinGoalStreak = computeStreakFromDates(proteinGoalDays.map((r) => r.date));
  const bestProteinGoalStreak = computeMaxStreak(proteinGoalDays.map((r) => r.date));

  const recentWeights = await db.getAllAsync<{ weight: number; date: string }>(
    'SELECT weight, date FROM weight_log WHERE profile_id = ? ORDER BY date DESC LIMIT 10',
    [profileId]
  );
  let consecutiveWeightDeclines = 0;
  for (let i = 0; i < recentWeights.length - 1; i++) {
    if (recentWeights[i].weight < recentWeights[i + 1].weight) consecutiveWeightDeclines++;
    else break;
  }

  const daysUsingApp = appDays.length;

  const allActivityDates = appDays.map((r) => r.date).slice().sort();
  let hasReturnedAfterAbsence = false;
  for (let i = 1; i < allActivityDates.length; i++) {
    const gap = Math.round(
      (new Date(allActivityDates[i]).getTime() - new Date(allActivityDates[i - 1]).getTime())
      / (1000 * 60 * 60 * 24)
    );
    if (gap >= 3 && gap <= 5) { hasReturnedAfterAbsence = true; break; }
  }

  const overeatingRow = await db.getFirstAsync<{ c: number }>(
    `SELECT COUNT(*) as c FROM (
      SELECT date FROM meals WHERE profile_id = ?
      GROUP BY date HAVING SUM(calories) > ?
    )`,
    [profileId, profile.calorie_target * 1.2]
  );
  const hasLoggedDespiteOvereating = (overeatingRow?.c ?? 0) >= 1;

  const mealsSchema = await db.getFirstAsync<{ sql: string }>(
    "SELECT sql FROM sqlite_master WHERE type='table' AND name='meals'"
  );
  const hasCreatedAt = mealsSchema?.sql?.includes('created_at');
  const hasLoggedAt = mealsSchema?.sql?.includes('logged_at');
  let hasLoggedLateNight = false;
  let hasLoggedEarlyMorning = false;
  if (hasCreatedAt || hasLoggedAt) {
    const timeField = hasCreatedAt ? 'created_at' : 'logged_at';
    const lateRow = await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM meals WHERE profile_id = ?
       AND CAST(strftime('%H', ${timeField}) AS INTEGER) >= 23`,
      [profileId]
    );
    const earlyRow = await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM meals WHERE profile_id = ?
       AND CAST(strftime('%H', ${timeField}) AS INTEGER) < 6`,
      [profileId]
    );
    hasLoggedLateNight = (lateRow?.c ?? 0) >= 1;
    hasLoggedEarlyMorning = (earlyRow?.c ?? 0) >= 1;
  }

  return {
    totalWaterEntries: waterEntryRow?.c ?? 0,
    waterGoalDaysCount: waterGoalDays.length,
    waterGoalStreak,
    bestWaterGoalStreak,
    totalMeals: mealCountRow?.c ?? 0,
    photoMeals: photoMealRow?.c ?? 0,
    loggingDays: loggingDaysRow?.c ?? 0,
    calorieGoalDays: calorieGoalDays.length,
    calorieStreak,
    bestCalorieStreak,
    lowCarbDays: lowCarbRow?.c ?? 0,
    weightEntries: weightCountRow?.c ?? 0,
    weightLost,
    progressPercent,
    appStreak,
    bestAppStreak,
    loggingStreak,
    bestLoggingStreak,
    proteinGoalStreak,
    bestProteinGoalStreak,
    consecutiveWeightDeclines,
    daysUsingApp,
    hasReturnedAfterAbsence,
    hasLoggedDespiteOvereating,
    hasLoggedLateNight,
    hasLoggedEarlyMorning,
  };
}

export async function checkAndUnlockAchievements(profile: UserProfile): Promise<AchievementDef[]> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  const stats = await getAchievementStats(profile);

  const rows = await db.getAllAsync<{ id: string; unlocked_at: string; lost_at: string | null }>(
    'SELECT id, unlocked_at, lost_at FROM achievements WHERE profile_id = ?',
    [profileId]
  );
  const statusMap = new Map(rows.map((r) => [r.id, r]));
  const newlyUnlocked: AchievementDef[] = [];

  for (const achievement of ALL_ACHIEVEMENTS) {
    const passes = achievement.check(stats);
    const current = statusMap.get(achievement.id);

    if (passes && !current) {
      await db.runAsync(
        'INSERT OR IGNORE INTO achievements (id, unlocked_at, profile_id) VALUES (?, ?, ?)',
        [achievement.id, new Date().toISOString(), profileId]
      );
      newlyUnlocked.push(achievement);
    } else if (passes && current?.lost_at) {
      // Reconquered badge — restore silently, no re-animation
      await db.runAsync(
        'UPDATE achievements SET lost_at = NULL, unlocked_at = ? WHERE id = ? AND profile_id = ?',
        [new Date().toISOString(), achievement.id, profileId]
      );
    } else if (!passes && current && !current.lost_at) {
      await db.runAsync(
        'UPDATE achievements SET unlocked_at = NULL, lost_at = ? WHERE id = ? AND profile_id = ?',
        [new Date().toISOString(), achievement.id, profileId]
      );
    }
  }

  return newlyUnlocked;
}

// Kept for backward compat — callers that only want IDs
export async function unlockAchievement(id: string): Promise<void> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  await db.runAsync(
    'INSERT OR IGNORE INTO achievements (id, unlocked_at, profile_id) VALUES (?, ?, ?)',
    [id, new Date().toISOString(), profileId]
  );
}

// ─── Recipes ─────────────────────────────────────────────────────────────────

export async function saveRecipe(recipe: Omit<Recipe, 'id' | 'created_at'>): Promise<number> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  const result = await db.runAsync(
    `INSERT INTO recipes
      (name, description, servings, calories_per_serving, protein_g, carbs_g, fat_g,
       prep_time_minutes, cook_time_minutes, ingredients_json, steps_json, profile_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      recipe.name, recipe.description, recipe.servings,
      recipe.calories_per_serving, recipe.protein_g, recipe.carbs_g, recipe.fat_g,
      recipe.prep_time_minutes, recipe.cook_time_minutes,
      recipe.ingredients_json, recipe.steps_json,
      recipe.profile_id ?? profileId,
    ]
  );
  return result.lastInsertRowId;
}

export async function getRecipes(): Promise<Recipe[]> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  return db.getAllAsync<Recipe>(
    'SELECT * FROM recipes WHERE profile_id = ? ORDER BY created_at DESC',
    [profileId]
  );
}

export async function deleteRecipe(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM recipes WHERE id = ?', [id]);
}

// ─── Streak / Stats ──────────────────────────────────────────────────────────

export async function getStreakDays(): Promise<number> {
  const db = await getDB();
  const profileId = await getCurrentProfileId();
  const rows = await db.getAllAsync<{ date: string }>(
    'SELECT DISTINCT date FROM meals WHERE profile_id = ? ORDER BY date DESC LIMIT 30',
    [profileId]
  );
  if (!rows.length) return 0;
  let streak = 0;
  const today = new Date(getLocalDateString() + 'T00:00:00');
  for (let i = 0; i < rows.length; i++) {
    const diff = Math.round(
      (today.getTime() - new Date(rows[i].date + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24)
    );
    if (diff === i || diff === i + 1) streak++;
    else break;
  }
  return streak;
}

