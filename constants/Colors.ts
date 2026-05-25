export const Colors = {
  bgPrimary: '#0f172a',
  bgSurface: '#1e293b',
  bgElevated: '#334155',
  accent: '#10b981',
  accentSubtle: 'rgba(16, 185, 129, 0.12)',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  textMuted: '#64748b',
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#38bdf8',
  border: '#334155',
  // macro colors
  proteinColor: '#60a5fa',
  carbsColor: '#f59e0b',
  fatColor: '#f87171',
  waterColor: '#38bdf8',
  // radius
  radius: 12,
  radiusPill: 20,
} as const;

export type ColorKey = keyof typeof Colors;

// Legacy default export for compatibility
export default Colors;
