import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LEGAL_UPDATED, LEGAL_VERSION } from '../lib/legal.js';

/**
 * Legal document content (launch-polish P1). Single source of truth for the
 * four public legal pages, rendered by LegalPage. Drafted from industry
 * patterns (PCPartPicker disclaimer/disclosure structure) for an Australian
 * information service monetised by affiliate links.
 *
 * ⚠️ Have an Australian solicitor review before public launch — especially
 * the Australian Consumer Law carve-outs. Bump LEGAL_VERSION in lib/legal.ts
 * on material changes so visitors re-acknowledge.
 */

export type LegalSlug = 'terms' | 'disclaimer' | 'disclosure' | 'privacy';

export interface LegalDoc {
  slug: LegalSlug;
  title: string;
  body: ReactNode;
}

const Meta = () => (
  <p className="legal-meta">
    Last updated {LEGAL_UPDATED} · Version {LEGAL_VERSION}
  </p>
);

const terms: LegalDoc = {
  slug: 'terms',
  title: 'Terms of Use',
  body: (
    <>
      <Meta />

      <h2>1. Acceptance of these terms</h2>
      <p>
        Speccify (speccify.info, &ldquo;Speccify&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is
        operated from Australia. By accessing or using Speccify you agree to these Terms of Use, our{' '}
        <Link to="/legal/disclaimer">Disclaimer</Link>,{' '}
        <Link to="/legal/disclosure">Affiliate Disclosure</Link> and{' '}
        <Link to="/legal/privacy">Privacy Policy</Link>. If you do not agree, please do not use the
        site.
      </p>
      <p>
        We may update these terms from time to time. If we make a material change, the site will ask
        you to acknowledge the updated terms on your next visit. Continued use of the site after a
        change means you accept the updated terms.
      </p>

      <h2>2. The service</h2>
      <p>
        Speccify is a free information and planning tool for PC hardware. We publish component
        specifications, benchmark-derived performance scores, compatibility guidance, and retail
        pricing collected from Australian retailers, and we provide tools to compare parts and plan
        complete builds.
      </p>
      <p>
        <strong>Speccify is not a retailer, reseller, or marketplace.</strong> We do not sell
        anything, hold stock, process payments, or fulfil orders.
      </p>

      <h2>3. Accuracy of information (no warranty)</h2>
      <p>
        We aim to keep specifications, compatibility guidance, benchmark-derived scores and prices
        accurate and current, and we refresh pricing data daily. However, all content on Speccify is
        provided <strong>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</strong>, without
        warranty of any kind, express or implied, including any warranty that the site or its
        compatibility guidance will be error-free.
      </p>
      <p>
        Information may be incomplete, out of date, or wrong due to source errors, retailer changes,
        or human error. Performance scores and verdicts are statistical estimates derived from
        published benchmark data; real-world performance varies.{' '}
        <strong>
          Always confirm specifications, compatibility, price and availability with the retailer and
          the manufacturer before purchasing.
        </strong>
      </p>
      <p>
        If you spot an error, please tell us via the feedback form and we will look into it
        promptly.
      </p>

      <h2>4. Purchases and third-party retailers</h2>
      <p>
        When you follow an outbound link from Speccify, you leave this site. Any purchase you make
        is made solely between you and the retailer, on the retailer&rsquo;s terms, prices and
        policies. Speccify is not a party to, and accepts no responsibility for, any transaction,
        delivery, availability, warranty claim, refund or dispute between you and any retailer.
        Nothing on Speccify constitutes an offer to sell by us or by any retailer.
      </p>

      <h2>5. Affiliate links</h2>
      <p>
        Some outbound links on Speccify are affiliate links, meaning we may earn a commission if you
        make a purchase after following them, at no additional cost to you. Affiliate compensation
        never affects scores, rankings, verdicts or the order in which prices are displayed. See our{' '}
        <Link to="/legal/disclosure">Affiliate Disclosure</Link> for details.
      </p>

      <h2>6. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          scrape, harvest, or bulk-download the Speccify catalogue, prices, or scores, or access the
          site by automated means, without our prior written permission;
        </li>
        <li>
          interfere with, overload, or disrupt the site or its infrastructure, or attempt to gain
          unauthorised access to any part of it;
        </li>
        <li>
          submit feedback or other content that is unlawful, abusive, deceptive, or infringes
          anyone&rsquo;s rights; or
        </li>
        <li>use the site for any unlawful purpose.</li>
      </ul>
      <p>We may restrict or block access for breach of this section.</p>

      <h2>7. Intellectual property</h2>
      <p>
        The Speccify name, logo, site design, editorial content and the curated compilation of the
        catalogue are owned by us. You may not reproduce them for commercial purposes without
        permission.
      </p>
      <p>
        Product names, brand names, logos and trademarks displayed on the site belong to their
        respective manufacturers and owners, and are used for identification purposes only. Their
        use does not imply any affiliation with, or endorsement by, those owners. Benchmark-derived
        data is attributed to its source where applicable.
      </p>

      <h2>8. Your submissions</h2>
      <p>
        If you submit feedback, ideas, corrections or suggestions to Speccify, you grant us a
        perpetual, irrevocable, worldwide, royalty-free licence to use, reproduce, adapt and act on
        that submission for any purpose connected with operating and improving the service, without
        any obligation or compensation to you. Do not submit anything confidential.
      </p>

      <h2>9. Liability</h2>
      <p>To the maximum extent permitted by law:</p>
      <ul>
        <li>
          Speccify excludes all liability for any loss or damage (including indirect or
          consequential loss, loss of profits, or loss of data) arising from your use of, or
          reliance on, the site or its content, or from any transaction with a retailer; and
        </li>
        <li>
          our total aggregate liability for any claim arising out of or in connection with the site
          is limited to AUD $100.
        </li>
      </ul>
      <p>
        <strong>Australian Consumer Law.</strong> Nothing in these terms excludes, restricts or
        modifies any consumer guarantee, right or remedy under the Australian Consumer Law or any
        other law that cannot lawfully be excluded or limited. To the extent our liability under
        such laws can be limited, it is limited (at our option) to re-supplying the relevant service
        or paying the cost of having it re-supplied.
      </p>

      <h2>10. Indemnity</h2>
      <p>
        You indemnify us against any claim, loss or expense (including reasonable legal costs)
        arising from your breach of these terms or your misuse of the site.
      </p>

      <h2>11. General</h2>
      <p>
        These terms are governed by the laws of New South Wales, Australia, and you submit to the
        non-exclusive jurisdiction of its courts. If any part of these terms is found
        unenforceable, the rest remains in effect. A failure to enforce a term is not a waiver of
        it.
      </p>

      <h2>12. Contact</h2>
      <p>
        Questions about these terms: use the feedback form on the site or the contact details on our{' '}
        <Link to="/about">About</Link> page.
      </p>
    </>
  ),
};

const disclaimer: LegalDoc = {
  slug: 'disclaimer',
  title: 'Disclaimer',
  body: (
    <>
      <Meta />
      <p>
        Speccify is an independent, free comparison and PC-building tool. We aggregate
        specifications from manufacturer datasheets and curated sources, derive performance scores
        from published benchmark data, and refresh Australian retail prices daily.
      </p>
      <p>
        <strong>We work hard to keep this data accurate, and we still can&rsquo;t guarantee it.</strong>{' '}
        Prices change by the hour, retailers relist products, and specs occasionally contain source
        or transcription errors. Everything on this site is provided &ldquo;as is&rdquo;, without
        warranty of any kind.
      </p>
      <p>
        Performance scores and verdicts are statistical estimates derived from benchmark data;
        real-world performance varies by workload, configuration, drivers and the silicon lottery.
        Compatibility checks are guidance, not a guarantee that parts will physically fit or
        function together in every configuration.
      </p>
      <p>
        <strong>
          Before you buy anything, confirm the price, specification and compatibility on the
          retailer&rsquo;s own site.
        </strong>{' '}
        Your purchase is made with the retailer, not with Speccify, and is governed by the
        retailer&rsquo;s terms.
      </p>
      <p>
        Some outbound links are affiliate links; see our{' '}
        <Link to="/legal/disclosure">Disclosure</Link>. Commissions never influence scores, rankings
        or verdicts.
      </p>
      <p>Found an error? Tell us via the feedback form and we will fix data issues promptly.</p>
    </>
  ),
};

const disclosure: LegalDoc = {
  slug: 'disclosure',
  title: 'Affiliate Disclosure',
  body: (
    <>
      <Meta />
      <p>
        Speccify earns compensation through affiliate relationships with some of the retailers
        linked on this site. When you buy through one of these links we may receive a commission, at
        no additional cost to you.
      </p>
      <p>
        <strong>Affiliate compensation never affects anything you see on Speccify.</strong>{' '}
        Performance scores are computed by a deterministic formula from published benchmark data;
        verdicts are generated from the scorecard; prices are listed lowest-first regardless of
        which store pays us. We link the cheapest store we know of, whether or not it has an
        affiliate program.
      </p>
      <p>Affiliate income is what keeps Speccify free and its data refreshed daily.</p>
    </>
  ),
};

const privacy: LegalDoc = {
  slug: 'privacy',
  title: 'Privacy Policy',
  body: (
    <>
      <Meta />

      <h2>1. Who we are</h2>
      <p>
        Speccify (speccify.info) is a free PC-hardware comparison and build-planning tool operated
        from Australia. This policy explains what information the site handles and why. The short
        version: <strong>no accounts, no advertising trackers, and we never sell data.</strong>
      </p>

      <h2>2. What we collect</h2>
      <ul>
        <li>
          <strong>An anonymous session identifier.</strong> A random ID stored in your browser so
          the site can count usage (for example, how many people compared two parts). It is not
          linked to your name, email, or any account, and we make no attempt to identify you from
          it.
        </li>
        <li>
          <strong>Anonymised usage events.</strong> Searches, part views, and outbound
          &ldquo;Buy&rdquo; clicks are recorded against the anonymous session ID and used only in
          aggregate, to see which parts and stores people care about.
        </li>
        <li>
          <strong>Builds you save.</strong> If you use &ldquo;Save &amp; share&rdquo; in the PC
          Builder, the parts list is stored and given a short link. Anyone with the link can view
          the build. No personal details are attached.
        </li>
        <li>
          <strong>Feedback you send.</strong> Your message, its category, the page you sent it
          from, and (only if you choose to provide one) your email address, used solely to reply
          to you.
        </li>
        <li>
          <strong>Standard server logs.</strong> Like nearly every website, our server records IP
          addresses and browser user-agents in short-lived technical logs used for security and
          abuse prevention.
        </li>
      </ul>

      <h2>3. What we don&rsquo;t collect</h2>
      <p>
        No user accounts or passwords. No payment details (we don&rsquo;t sell anything; purchases
        happen on retailer sites). No advertising trackers or third-party analytics scripts. We do
        not sell, rent, or share personal information with anyone for marketing.
      </p>

      <h2>4. Cookies and local storage</h2>
      <p>Speccify stores a small number of values in your browser:</p>
      <table className="legal-table">
        <thead>
          <tr>
            <th>Key</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Theme preference</td>
            <td>Remembers light/dark mode</td>
          </tr>
          <tr>
            <td>
              <code>sp_legal_ack</code>
            </td>
            <td>Remembers that you&rsquo;ve acknowledged our terms popup (and which version)</td>
          </tr>
          <tr>
            <td>
              <code>sp_currency</code>
            </td>
            <td>Remembers your display-currency preference</td>
          </tr>
          <tr>
            <td>Session ID</td>
            <td>The anonymous usage identifier described above</td>
          </tr>
          <tr>
            <td>
              <code>sp_at</code> / <code>sp_rt</code>
            </td>
            <td>Staff sign-in cookies, set only for site administrators, never for visitors</td>
          </tr>
        </tbody>
      </table>
      <p>
        There are no third-party or advertising cookies on Speccify, which is why you don&rsquo;t
        see a cookie-consent banner: the popup you see on first visit is a terms acknowledgement,
        not a cookie consent request.
      </p>

      <h2>5. Third parties</h2>
      <ul>
        <li>
          <strong>Retailers.</strong> Outbound links take you to retailer websites, which have their
          own privacy policies. Affiliate networks associated with some links may set their own
          cookies <strong>after you leave Speccify</strong>; those are governed by the
          retailer&rsquo;s and network&rsquo;s policies, not ours.
        </li>
        <li>
          <strong>Email delivery.</strong> If you provide an email with feedback (or are a site
          administrator signing in), the email is handled by our email delivery provider solely to
          deliver that message.
        </li>
      </ul>

      <h2>6. Retention and your rights</h2>
      <p>
        Usage events are retained for aggregate analytics. Feedback (including any email address in
        it) is kept while it is useful for improving the site and deleted on request. You can ask us
        at any time to access or delete information you have submitted. Contact us via the
        feedback form or the contact details on the <Link to="/about">About</Link> page.
      </p>
      <p>
        We handle personal information in line with the Australian Privacy Principles. If we make
        material changes to this policy, the site will ask you to acknowledge the update on your
        next visit.
      </p>
    </>
  ),
};

export const LEGAL_DOCS: Record<LegalSlug, LegalDoc> = { terms, disclaimer, disclosure, privacy };

export function isLegalSlug(v: string | undefined): v is LegalSlug {
  return v === 'terms' || v === 'disclaimer' || v === 'disclosure' || v === 'privacy';
}
