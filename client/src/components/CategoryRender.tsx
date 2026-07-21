import type { BuilderCategory } from '@automatorr/shared';

/**
 * Per-category Automatorr-branded render used when a component has no imageUrl,
 * so the thumb slot is never empty (spec §3). Winner cards tint to lime.
 */
export function CategoryRender({ category, win }: { category: BuilderCategory; win: boolean }) {
  const stroke = win ? '#c2e830' : '#c783ff';
  const accent = win ? '#ffffff' : '#c2e830';
  const fill = win ? 'rgba(194,232,48,0.08)' : 'rgba(199,131,255,0.06)';
  // Fill the container (thumb box, picker cell, selection cell) at any size; keep aspect ratio.
  const common = {
    width: '100%',
    height: '100%',
    viewBox: '0 0 150 86',
    preserveAspectRatio: 'xMidYMid meet' as const,
    fill: 'none' as const,
  };

  if (category === 'gpu') {
    return (
      <svg {...common} role="img" aria-label="Graphics card">
        <rect x="20" y="26" width="110" height="40" rx="6" stroke={stroke} strokeWidth="1.4" fill={fill} />
        <circle cx="50" cy="46" r="11" stroke={stroke} strokeWidth="1.2" />
        <circle cx="92" cy="46" r="11" stroke={stroke} strokeWidth="1.2" />
        <path d="M50 39l3-3M92 39l3-3" stroke={accent} strokeWidth="1.6" strokeLinecap="round" />
        <path d="M20 66h110M30 66v6M120 66v6" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    );
  }
  if (category === 'ram') {
    return (
      <svg {...common} role="img" aria-label="Memory module">
        <rect x="30" y="20" width="90" height="44" rx="4" stroke={stroke} strokeWidth="1.4" fill={fill} />
        <path d="M40 64v6M55 64v6M70 64v6M85 64v6M100 64v6M110 64v6" stroke={stroke} strokeWidth="1.2" strokeLinecap="round" />
        <rect x="40" y="28" width="14" height="20" rx="2" stroke={stroke} strokeWidth="1" />
        <rect x="58" y="28" width="14" height="20" rx="2" stroke={stroke} strokeWidth="1" />
        <rect x="76" y="28" width="14" height="20" rx="2" stroke={accent} strokeWidth="1.2" />
        <rect x="94" y="28" width="14" height="20" rx="2" stroke={stroke} strokeWidth="1" />
      </svg>
    );
  }
  if (category === 'storage') {
    return (
      <svg {...common} role="img" aria-label="Storage drive">
        <rect x="34" y="18" width="82" height="50" rx="6" stroke={stroke} strokeWidth="1.4" fill={fill} />
        <circle cx="75" cy="43" r="16" stroke={stroke} strokeWidth="1.2" />
        <circle cx="75" cy="43" r="4" stroke={accent} strokeWidth="1.4" />
        <path d="M75 27a16 16 0 0 1 14 8" stroke={accent} strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  // CPU — echoes the mockup's chip render.
  if (category === 'cpu') {
  return (
    <svg {...common} role="img" aria-label="Processor">
      <rect x="45" y="13" width="60" height="60" rx="7" stroke={stroke} strokeWidth="1.4" fill="rgba(255,255,255,0.02)" />
      <rect x="55" y="26" width="40" height="34" rx="4" stroke={stroke} strokeWidth="1.2" fill={fill} />
      <path d="M58 31l6-6" stroke={accent} strokeWidth="1.6" strokeLinecap="round" />
      <g stroke={stroke} strokeWidth="1.2" opacity="0.66" strokeLinecap="round">
        <path d="M53 13v-5M63 13v-5M73 13v-5M83 13v-5M93 13v-5" />
        <path d="M53 73v5M63 73v5M73 73v5M83 73v5M93 73v5" />
        <path d="M45 23h-5M45 33h-5M45 43h-5M45 53h-5M45 63h-5" />
        <path d="M105 23h5M105 33h5M105 43h5M105 53h5M105 63h5" />
      </g>
    </svg>
  );
  }

  // Generic part (cooler / motherboard / case / psu / os / monitor).
  return (
    <svg {...common} role="img" aria-label="Component">
      <rect x="30" y="18" width="90" height="50" rx="8" stroke={stroke} strokeWidth="1.4" fill={fill} />
      <rect x="44" y="30" width="62" height="26" rx="4" stroke={stroke} strokeWidth="1.2" />
      <path d="M52 43h46" stroke={accent} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
