import * as SQLite from 'expo-sqlite';
import { DailyTotals, Meal, MealPlan, UserProfile, WeightEntry } from './types';

let _db: SQLite.SQLiteDatabase | null = null;

async function getDB(): Promise<SQLite.SQLiteDatabase> {
  if (!_db) {
    _db = await SQLite.openDatabaseAsync('leantrack.db');
  }
  return _db;
}

export async function initDB(): Promise<void> {
  const db = await getDB();
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS user_profile (
      id INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      age INTEGER NOT NULL,
      gender TEXT NOT NULL,
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
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS water_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      amount_ml INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS weight_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      weight REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS meal_plan (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_json TEXT NOT NULL,
      generated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS achievements (
      id TEXT PRIMARY KEY,
      unlocked_at TEXT NOT NULL
    );
  `);
}

export async function getProfile(): Promise<UserProfile | null> {
  const db = await getDB();
  const row = await db.getFirstAsync<any>('SELECT * FROM user_profile WHERE id = 1');
  if (!row) return null;
  return {
    ...row,
    notifications_enabled: row.notifications_enabled === 1,
    onboarding_completed: row.onboarding_completed === 1,
  };
}

export async function saveProfile(data: UserProfile): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT OR REPLACE INTO user_profile
      (id, name, age, gender, weight_current, weight_target, height, activity_level, goal,
       target_date, tdee, calorie_target, protein_target, carbs_target, fat_target,
       water_target, notifications_enabled, onboarding_completed)
     VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.name, data.age, data.gender, data.weight_current, data.weight_target,
      data.height, data.activity_level, data.goal, data.target_date,
      data.tdee, data.calorie_target, data.protein_target, data.carbs_target,
      data.fat_target, data.water_target,
      data.notifications_enabled ? 1 : 0,
      data.onboarding_completed ? 1 : 0,
    ]
  );
}

export async function addMeal(meal: Meal): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    `INSERT INTO meals (date, meal_type, food_name, quantity_g, calories, protein, carbs, fat, source, photo_uri)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [meal.date, meal.meal_type, meal.food_name, meal.quantity_g, meal.calories,
     meal.protein, meal.carbs, meal.fat, meal.source, meal.photo_uri ?? null]
  );
}

export async function deleteMeal(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM meals WHERE id = ?', [id]);
}

export async function getMealsForDate(date: string): Promise<Meal[]> {
  const db = await getDB();
  return db.getAllAsync<Meal>('SELECT * FROM meals WHERE date = ? ORDER BY created_at ASC', [date]);
}

export async function getDailyTotals(date: string): Promise<DailyTotals> {
  const db = await getDB();
  const row = await db.getFirstAsync<any>(
    `SELECT
       COALESCE(SUM(calories), 0) as calories,
       COALESCE(SUM(protein), 0)  as protein,
       COALESCE(SUM(carbs), 0)    as carbs,
       COALESCE(SUM(fat), 0)      as fat
     FROM meals WHERE date = ?`,
    [date]
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

export async function addWater(date: string, ml: number): Promise<void> {
  const db = await getDB();
  await db.runAsync('INSERT INTO water_log (date, amount_ml) VALUES (?, ?)', [date, ml]);
}

export async function getWaterForDate(date: string): Promise<number> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ total: number }>(
    'SELECT COALESCE(SUM(amount_ml), 0) as total FROM water_log WHERE date = ?',
    [date]
  );
  return row?.total ?? 0;
}

export async function getWaterLogsForDate(date: string): Promise<{ id: number; amount_ml: number; created_at: string }[]> {
  const db = await getDB();
  return db.getAllAsync('SELECT id, amount_ml, created_at FROM water_log WHERE date = ? ORDER BY created_at ASC', [date]);
}

export async function deleteWaterEntry(id: number): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM water_log WHERE id = ?', [id]);
}

export async function logWeight(date: string, weight: number): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    'INSERT OR REPLACE INTO weight_log (date, weight) VALUES (?, ?)',
    [date, weight]
  );
}

export async function getWeightHistory(days: number): Promise<WeightEntry[]> {
  const db = await getDB();
  return db.getAllAsync<WeightEntry>(
    `SELECT date, weight FROM weight_log
     ORDER BY date DESC LIMIT ?`,
    [days]
  );
}

export async function getAllWeightEntries(): Promise<WeightEntry[]> {
  const db = await getDB();
  return db.getAllAsync<WeightEntry>(
    'SELECT date, weight FROM weight_log ORDER BY date DESC'
  );
}

export async function updateWeightEntry(date: string, weight: number): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM weight_log WHERE date = ?', [date]);
  await db.runAsync('INSERT INTO weight_log (date, weight) VALUES (?, ?)', [date, weight]);
}

export async function deleteWeightEntry(date: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM weight_log WHERE date = ?', [date]);
}

export async function saveMealPlan(json: string): Promise<void> {
  const db = await getDB();
  await db.runAsync('DELETE FROM meal_plan');
  await db.runAsync('INSERT INTO meal_plan (plan_json) VALUES (?)', [json]);
}

export async function getMealPlan(): Promise<MealPlan | null> {
  const db = await getDB();
  const row = await db.getFirstAsync<{ plan_json: string }>('SELECT plan_json FROM meal_plan ORDER BY id DESC LIMIT 1');
  if (!row) return null;
  try {
    return JSON.parse(row.plan_json) as MealPlan;
  } catch {
    return null;
  }
}

export async function getUnlockedAchievements(): Promise<string[]> {
  const db = await getDB();
  const rows = await db.getAllAsync<{ id: string }>('SELECT id FROM achievements');
  return rows.map((r) => r.id);
}

export async function unlockAchievement(id: string): Promise<void> {
  const db = await getDB();
  await db.runAsync(
    'INSERT OR IGNORE INTO achievements (id, unlocked_at) VALUES (?, ?)',
    [id, new Date().toISOString()]
  );
}

export async function checkAndUnlockAchievements(profile: UserProfile): Promise<string[]> {
  const db = await getDB();
  const unlocked = await getUnlockedAchievements();
  const newlyUnlocked: string[] = [];

  async function tryUnlock(id: string, check: () => Promise<boolean>) {
    if (unlocked.includes(id)) return;
    try {
      if (await check()) {
        await db.runAsync(
          'INSERT OR IGNORE INTO achievements (id, unlocked_at) VALUES (?, ?)',
          [id, new Date().toISOString()]
        );
        newlyUnlocked.push(id);
      }
    } catch {}
  }

  await tryUnlock('water_first', async () => {
    const r = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM water_log');
    return (r?.c ?? 0) > 0;
  });

  await tryUnlock('water_goal_1', async () => {
    const r = await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) as c FROM (SELECT date, SUM(amount_ml) as total FROM water_log GROUP BY date HAVING total >= ?)`,
      [profile.water_target]
    );
    return (r?.c ?? 0) > 0;
  });

  await tryUnlock('water_hydro_master', async () => {
    const rows = await db.getAllAsync<{ date: string; total: number }>(
      `SELECT date, SUM(amount_ml) as total FROM water_log GROUP BY date ORDER BY date DESC LIMIT 7`
    );
    return rows.length >= 7 && rows.every((r) => r.total >= profile.water_target);
  });

  await tryUnlock('meal_first', async () => {
    const r = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM meals');
    return (r?.c ?? 0) > 0;
  });

  await tryUnlock('calories_perfect_week', async () => {
    const rows = await db.getAllAsync<{ date: string; total: number }>(
      `SELECT date, SUM(calories) as total FROM meals GROUP BY date ORDER BY date DESC LIMIT 7`
    );
    if (rows.length < 7) return false;
    const t = profile.calorie_target;
    return rows.every((r) => r.total >= t * 0.8 && r.total <= t * 1.1);
  });

  await tryUnlock('streak_30', async () => {
    const s = await getStreakDays();
    return s >= 30;
  });

  await tryUnlock('weight_first', async () => {
    const r = await db.getFirstAsync<{ c: number }>('SELECT COUNT(*) as c FROM weight_log');
    return (r?.c ?? 0) > 0;
  });

  const firstWeightRow = await db.getFirstAsync<{ weight: number }>(
    'SELECT weight FROM weight_log ORDER BY date ASC LIMIT 1'
  );
  if (firstWeightRow) {
    const initial = firstWeightRow.weight;
    await tryUnlock('weight_1kg', async () => {
      const diff = initial - profile.weight_current;
      return profile.goal === 'perte' ? diff >= 1 : -diff >= 1;
    });
    await tryUnlock('weight_halfway', async () => {
      const totalDiff = Math.abs(initial - profile.weight_target);
      if (totalDiff === 0) return false;
      return Math.abs(initial - profile.weight_current) / totalDiff >= 0.5;
    });
  }

  await tryUnlock('weight_goal', async () => {
    if (profile.goal === 'perte') return profile.weight_current <= profile.weight_target;
    if (profile.goal === 'prise') return profile.weight_current >= profile.weight_target;
    return Math.abs(profile.weight_current - profile.weight_target) <= 1;
  });

  return newlyUnlocked;
}

export async function getStreakDays(): Promise<number> {
  const db = await getDB();
  const rows = await db.getAllAsync<{ date: string }>(
    `SELECT DISTINCT date FROM meals ORDER BY date DESC LIMIT 30`
  );
  if (!rows.length) return 0;
  let streak = 0;
  const today = new Date();
  for (let i = 0; i < rows.length; i++) {
    const d = new Date(rows[i].date);
    const diff = Math.round((today.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === i || diff === i + 1) {
      streak++;
    } else {
      break;
    }
  }
  return streak;
}
