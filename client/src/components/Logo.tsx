/**
 * Speccify brand lockup (launch-polish P5, revised): the original circuit-"S"
 * hero glyph acts as the S, followed by "peccify" in the display face, so the
 * lockup reads "Speccify". The "Powered by Automatorr" credit stays removed.
 */
const HERO_GLYPH = '/speccify-hero-token-snapped.png';

interface Props {
  /** 'full' = glyph + "peccify" (header); 'mark' = glyph only (footer, modals). */
  variant?: 'full' | 'mark';
  /** Glyph height in px; the wordmark scales with it. */
  size?: number;
}

function Mark({ size }: { size: number }) {
  return (
    <img
      className="logo-glyph"
      src={HERO_GLYPH}
      alt=""
      aria-hidden="true"
      style={{ height: size, width: size }}
    />
  );
}

export function Logo({ variant = 'full', size = 30 }: Props) {
  if (variant === 'mark') return <Mark size={size} />;
  return (
    <span className="logo-lockup">
      <Mark size={size} />
      <span className="logo-word" style={{ fontSize: size * 0.78 }}>
        peccify
      </span>
    </span>
  );
}
