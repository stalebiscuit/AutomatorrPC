import type { CompatibilityResult } from '@automatorr/shared';

const COPY: Record<CompatibilityResult['status'], string> = {
  ok: 'Compatibility: no issues found.',
  warnings: 'Compatibility: potential issues — review below.',
  incompatible: 'Compatibility: incompatible parts — must be resolved.',
};

/** Green / amber / red banner mirroring the PCPartPicker compatibility notice. */
export function CompatibilityBanner({ result }: { result: CompatibilityResult }) {
  return (
    <div className={`compat-banner compat-${result.status}`} role="status">
      <strong>{COPY[result.status]}</strong>
      {result.violations.length > 0 && (
        <ul className="compat-list">
          {result.violations.map((v) => (
            <li key={v.rule} className={`compat-item sev-${v.severity}`}>
              <span className="compat-sev">{v.severity === 'hard' ? 'Incompatible' : 'Warning'}</span>
              {v.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
