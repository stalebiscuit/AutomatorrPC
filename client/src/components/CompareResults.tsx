import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { Category } from '@automatorr/shared';
import { makePairKey } from '@automatorr/shared';
import { api, ApiClientError } from '../lib/api.js';
import { trackView } from '../lib/session.js';
import { useDebouncedValue } from '../hooks/useDebouncedValue.js';
import { SectionHead } from './Eyebrow.js';
import { ComponentCard } from './ComponentCard.js';
import { VsSpine } from './VsSpine.js';
import { VerdictPanel } from './VerdictPanel.js';
import { CompareSkeleton } from './Skeletons.js';

interface Props {
  category: Category;
  slugA: string;
  slugB: string;
}

export function CompareResults({ category, slugA, slugB }: Props) {
  // Debounce the pair so rapid swaps don't spam the API (spec §3).
  const debounced = useDebouncedValue(`${slugA}::${slugB}`, 250);
  const [a, b] = debounced.split('::');
  const ready = !!a && !!b && a !== b;

  const compareQ = useQuery({
    queryKey: ['compare', category, a, b],
    queryFn: () => api.compare(category, a as string, b as string),
    enabled: ready,
  });

  const verdictQ = useQuery({
    queryKey: ['verdict', category, a, b],
    queryFn: () => api.verdict(category, a as string, b as string),
    enabled: ready,
  });

  // Fire a view event once a comparison resolves (logged for trends).
  useEffect(() => {
    if (compareQ.data && a && b) {
      trackView({ category, pairKey: makePairKey(category, a, b) });
    }
  }, [compareQ.data, a, b, category]);

  return (
    <section aria-label="Head to head">
      <SectionHead index="02" label="HEAD TO HEAD" />

      {compareQ.isLoading && <CompareSkeleton />}

      {compareQ.isError && (
        <div className="state error" role="alert">
          <p>
            {compareQ.error instanceof ApiClientError
              ? compareQ.error.message
              : 'Could not load this comparison.'}
          </p>
          <button type="button" className="cta outline" onClick={() => void compareQ.refetch()}>
            Retry
          </button>
        </div>
      )}

      {compareQ.data && (
        <>
          <div className="grid">
            <ComponentCard
              component={compareQ.data.a}
              rows={compareQ.data.rows}
              side="a"
              win={compareQ.data.scorecard.winnerSlug === compareQ.data.a.slug}
            />
            <VsSpine />
            <ComponentCard
              component={compareQ.data.b}
              rows={compareQ.data.rows}
              side="b"
              win={compareQ.data.scorecard.winnerSlug === compareQ.data.b.slug}
            />
          </div>

          <VerdictPanel
            result={compareQ.data}
            verdict={verdictQ.data}
            loadingVerdict={verdictQ.isLoading}
          />
        </>
      )}
    </section>
  );
}
