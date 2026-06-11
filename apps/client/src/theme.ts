import { Platform } from 'react-native';

/**
 * Alcovia design language — "Aurora Study Desk"
 *
 * A deep midnight-indigo canvas lit by a soft aurora glow. Frosted-glass
 * surfaces, a custom display typeface for numerals/titles, and a warm amber
 * reserved exclusively for rewards so coins always feel earned.
 *
 * Device A is lit violet; Device B is lit teal — so in a two-tab demo you can
 * tell the devices apart at a glance.
 */

export const T = {
  // canvas
  bg: '#070713',
  bgElev: '#0d0d1f',

  // glass surfaces
  glass: 'rgba(255,255,255,0.045)',
  glassStrong: 'rgba(255,255,255,0.08)',
  border: 'rgba(255,255,255,0.09)',
  borderStrong: 'rgba(255,255,255,0.16)',

  // brand
  violet: '#8b5cf6',
  violetDeep: '#7c3aed',
  teal: '#2dd4bf',
  tealDeep: '#06b6d4',
  indigo: '#6366f1',

  // semantic
  gold: '#fbbf24',
  goldDeep: '#f59e0b',
  green: '#34d399',
  rose: '#fb7185',
  roseDeep: '#f43f5e',

  // ink
  text: '#f5f6fb',
  textDim: '#aab2c5',
  muted: '#6b7390',
  faint: '#3a3f57',
} as const;

export const ACCENTS: Record<string, { glow: string; solid: string; soft: string }> = {
  'device-A': { glow: 'rgba(139,92,246,0.55)', solid: '#8b5cf6', soft: 'rgba(139,92,246,0.14)' },
  'device-B': { glow: 'rgba(45,212,191,0.5)', solid: '#2dd4bf', soft: 'rgba(45,212,191,0.13)' },
};

export function accentFor(deviceId: string) {
  return ACCENTS[deviceId] ?? ACCENTS['device-A'];
}

// Display font for numerals + titles, body font for everything else.
export const FONT_DISPLAY = Platform.OS === 'web' ? "'Space Grotesk', sans-serif" : undefined;
export const FONT_BODY = Platform.OS === 'web' ? "'Inter', sans-serif" : undefined;

let injected = false;

/**
 * Web-only: load Google Fonts and paint a full-page aurora gradient behind the
 * app. `glow` tints the aurora to the current device's accent so the whole
 * canvas shifts colour when you switch devices.
 */
export function injectWebStyles(glow: string = ACCENTS['device-A'].glow): void {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;

  if (!injected) {
    injected = true;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap';
    document.head.appendChild(link);

    const style = document.createElement('style');
    style.id = 'alcovia-global';
    document.head.appendChild(style);
  }

  const style = document.getElementById('alcovia-global');
  if (style) {
    style.textContent = `
      html, body, #root { height: 100%; }
      body {
        margin: 0;
        font-family: 'Inter', -apple-system, sans-serif;
        background:
          radial-gradient(900px 600px at 12% -8%, ${glow}, transparent 60%),
          radial-gradient(800px 520px at 100% 6%, rgba(45,212,191,0.16), transparent 55%),
          radial-gradient(700px 700px at 50% 120%, rgba(99,102,241,0.18), transparent 60%),
          ${T.bg};
        background-attachment: fixed;
      }
      * { font-family: 'Inter', -apple-system, sans-serif; }
      ::selection { background: ${glow}; color: #fff; }
      ::-webkit-scrollbar { width: 10px; height: 10px; }
      ::-webkit-scrollbar-track { background: transparent; }
      ::-webkit-scrollbar-thumb {
        background: rgba(255,255,255,0.12);
        border-radius: 8px;
        border: 2px solid transparent;
        background-clip: padding-box;
      }
      ::-webkit-scrollbar-thumb:hover { background: rgba(255,255,255,0.22); background-clip: padding-box; }
      @keyframes alcovia-rise { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    `;
  }
}

// Helper for web-only box shadows / blur without breaking native.
export function webShadow(color: string, blur = 40, spread = 0): object {
  if (Platform.OS !== 'web') return {};
  return { boxShadow: `0 0 ${blur}px ${spread}px ${color}` } as object;
}

export function webBlur(px = 14): object {
  if (Platform.OS !== 'web') return {};
  return { backdropFilter: `blur(${px}px)`, WebkitBackdropFilter: `blur(${px}px)` } as object;
}
