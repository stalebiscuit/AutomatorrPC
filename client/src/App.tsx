import type { Category } from '@automatorr/shared';

// Phase 0 placeholder — the real app shell lands in Phase 6.
const categories: Category[] = ['cpu', 'gpu', 'ram', 'storage'];

export default function App() {
  return (
    <main style={{ padding: 24 }}>
      <h1>Automatorr</h1>
      <p>Scaffold online. Categories: {categories.join(', ')}.</p>
    </main>
  );
}
