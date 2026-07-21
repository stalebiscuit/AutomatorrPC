import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { CompareResult, Component } from '@automatorr/shared';
import { VerdictPanel } from '../src/components/VerdictPanel.js';

function comp(slug: string, brand: string, name: string): Component {
  return {
    id: slug,
    category: 'cpu',
    brand,
    name,
    slug,
    imageUrl: null,
    specs: {},
    benchmark: { ubRaw: 1, ubSource: 't' },
    performanceIndex: 1000,
    prices: [],
    provenance: { specSourceUrl: 'https://e.com', seededAt: '2026-01-01T00:00:00Z', unknownFields: [] },
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const result: CompareResult = {
  category: 'cpu',
  a: comp('intel-core-i9-14900k', 'Intel', 'Intel Core i9-14900K'),
  b: comp('amd-ryzen-7-7800x3d', 'AMD', 'AMD Ryzen 7 7800X3D'),
  rows: [],
  scorecard: {
    winnerSlug: 'intel-core-i9-14900k',
    loserSlug: 'amd-ryzen-7-7800x3d',
    tally: { a: 4, b: 2, total: 6 },
    deltas: [{ label: 'PERFORMANCE', value: '+8.3%' }],
    tags: ['Gaming'],
    crossSubtype: false,
  },
};

describe('VerdictPanel', () => {
  it('renders the scorecard with winner tally, deltas and tags', () => {
    render(<VerdictPanel result={result} verdict={{ scorecard: result.scorecard, prose: 'Placeholder prose.', generated: false }} loadingVerdict={false} />);
    expect(screen.getByText('Winner scorecard')).toBeInTheDocument();
    expect(screen.getByText('+8.3%')).toBeInTheDocument();
    expect(screen.getByText('GAMING')).toBeInTheDocument();
    expect(screen.getByText(/AI verdict — coming soon/i)).toBeInTheDocument();
    // headline uses "outclasses" for same-category
    expect(screen.getByText(/outclasses/i)).toBeInTheDocument();
  });
});
