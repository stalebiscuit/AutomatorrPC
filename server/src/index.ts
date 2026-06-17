import { makePairKey, type Category } from '@automatorr/shared';

// Phase 0 placeholder — the Express bootstrap lands in Phase 1.
const category: Category = 'cpu';
console.log('Automatorr server scaffold online.', makePairKey(category, 'a', 'b'));
