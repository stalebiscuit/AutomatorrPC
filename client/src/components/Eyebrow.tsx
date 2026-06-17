import type { ReactNode } from 'react';

/** Underscore-cursor eyebrow with a blinking lime caret (brand signature §4). */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="eyebrow">
      {children}
      <span className="cursor" aria-hidden="true" />
    </span>
  );
}

/** Bracketed section index + eyebrow, e.g. `[02] HEAD TO HEAD_`. */
export function SectionHead({ index, label }: { index: string; label: string }) {
  return (
    <div className="sec-head">
      <span className="idx">[{index}]</span>
      <Eyebrow>{label}</Eyebrow>
    </div>
  );
}
