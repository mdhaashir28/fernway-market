// Meeranji Supermarket colours: deep green, warm amber, calm neutrals.
// Text colours meet WCAG AA contrast (4.5:1) on their backgrounds.

export const colors = {
  primary: '#1B6B45', // deep green — buttons, links, active tab
  primaryDark: '#134D32',
  primaryDarker: '#0F3D2A',
  primarySoft: '#E3F1E8',
  primaryTint: '#F1F8F3',
  accent: '#F2A93B', // amber — highlights (use dark text on it)
  accentSoft: '#FDF0D9',
  accentText: '#8A5300',

  background: '#F6F7F2',
  surface: '#FFFFFF',
  surfaceAlt: '#EEF1EC',
  border: '#E1E5E0',
  borderStrong: '#C9D0CA',

  text: '#18211C',
  textMuted: '#5B665F',
  textOnPrimary: '#FFFFFF',

  danger: '#B42318',
  dangerSoft: '#FDE8E7',
  info: '#175CD3',
  infoSoft: '#E3EEFD',
  violet: '#6B3FC6',
  violetSoft: '#EFE8FC',
  teal: '#0E6A83',
  tealSoft: '#DFF4F8',
} as const;

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const font = {
  small: 13,
  body: 16,
  large: 18,
  title: 22,
  hero: 28,
} as const;

export const shadow = {
  shadowColor: '#0F1F17',
  shadowOpacity: 0.08,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;
