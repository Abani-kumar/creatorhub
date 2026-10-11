/** Deterministic, generated "film frame" artwork for seeded content (synthetic data, no stock images). */

const PALETTES: [string, string, string][] = [
  ['#1B1F3B', '#4B5BD8', '#FF5D7A'],
  ['#0F2F2B', '#1F8F7A', '#F6C85F'],
  ['#2B1B33', '#8A4FBF', '#FF9E7A'],
  ['#14213D', '#2A6FDB', '#7DE0C3'],
  ['#2D1B1B', '#C0443A', '#FFD27A'],
  ['#102A43', '#3E7CB1', '#F5A9B8'],
  ['#1E2A1E', '#5F9C57', '#F2E08A'],
  ['#2A2340', '#6C63D6', '#F28AB2'],
];

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function escapeXml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function thumbnailSvg(seed: string, title?: string | null): string {
  const h = hash(seed);
  const [bg, mid, accent] = PALETTES[h % PALETTES.length];
  const label = title?.trim() ? escapeXml(title.trim().slice(0, 48)) : '';
  const cx = 200 + (h % 880);
  const cy = 120 + ((h >> 4) % 480);
  const r = 140 + ((h >> 8) % 160);
  const angle = (h >> 12) % 60 - 30;
  const bandY = 80 + ((h >> 16) % 400);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720" preserveAspectRatio="xMidYMid slice">
<defs>
<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${mid}"/></linearGradient>
<radialGradient id="r" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${accent}" stop-opacity="0.95"/><stop offset="1" stop-color="${accent}" stop-opacity="0"/></radialGradient>
</defs>
<rect width="1280" height="720" fill="url(#g)"/>
<circle cx="${cx}" cy="${cy}" r="${r * 1.9}" fill="url(#r)" opacity="0.55"/>
<g transform="rotate(${angle} 640 360)"><rect x="-200" y="${bandY}" width="1700" height="120" fill="#fff" opacity="0.07"/><rect x="-200" y="${bandY + 160}" width="1700" height="26" fill="${accent}" opacity="0.5"/></g>
<circle cx="${cx}" cy="${cy}" r="${r * 0.55}" fill="${accent}" opacity="0.9"/>
<path d="M0 640 Q320 ${560 + (h % 60)} 640 620 T1280 ${600 + ((h >> 3) % 50)} V720 H0Z" fill="#000" opacity="0.28"/>
${label ? `<text x="64" y="620" fill="#fff" font-family="system-ui,sans-serif" font-size="42" font-weight="600" opacity="0.92">${label}</text>` : ''}
</svg>`;
}
