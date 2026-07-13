export const Colors = {
  bgPrimary: '#F5FBF5',
  bgSurface: '#FFFFFF',
  bgElevated: '#EAEFE9',
  accent: '#226A4C',
  accentSubtle: 'rgba(34, 106, 76, 0.10)',
  accentContainer: '#AAF2CC',
  textPrimary: '#171D19',
  textSecondary: '#404943',
  textMuted: '#707973',
  danger: '#BA1A1A',
  warning: '#f59e0b',
  info: '#3D6473',
  border: '#C0C9C1',
  borderStrong: '#707973',
  trackBg: '#DCE4DC',
  // macro colors
  proteinColor: '#60a5fa',
  carbsColor: '#f59e0b',
  fatColor: '#f87171',
  waterColor: '#3D6473',
  waterColorLight: '#38bdf8',
  // radius
  radius: 12,
  radiusPill: 20,
  radiusCard: 20,
  radiusButton: 28,
  radiusChip: 8,
} as const;

export type ColorKey = keyof typeof Colors;

// Legacy default export for compatibility
export default Colors;
