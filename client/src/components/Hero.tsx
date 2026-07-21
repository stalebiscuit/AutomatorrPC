import { Eyebrow } from './Eyebrow.js';

/** Hero — eyebrow + headline (no forced break) + intro line (spec §3, mockup). */
export function Hero() {
  return (
    <section className="hero">
      <Eyebrow>THE NEW STANDARD</Eyebrow>
      <h1>
        Pit any two parts against each other<span className="ac">.</span>
      </h1>
      <p>Pick a category, choose two components.</p>
    </section>
  );
}
