/**
 * Icecat Live JSON API client (Task 3). One request = one product, identified by
 * GTIN, Brand+ProductCode, or icecat_id. Auth: `shopname` param (username) +
 * `api-token` header. Full contract: iceclog.com "Manual for Icecat JSON Product
 * Requests". Uses the same injectable Fetcher abstraction as the price scraper so
 * it's testable without live calls.
 */
import type { Fetcher } from '../../pricing/PriceProvider.js';

const DEFAULT_BASE = 'https://live.icecat.biz/api';
const defaultFetcher: Fetcher = (url, init) => fetch(url, init as RequestInit);

/** Browser-like headers — Icecat's edge (Cloudflare) rejects header-less clients. */
export const BROWSER_HEADERS: Record<string, string> = {
  'user-agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  accept: 'application/json,text/plain,*/*',
  'accept-language': 'en-AU,en;q=0.9',
  'sec-ch-ua': '"Chromium";v="126", "Not.A/Brand";v="24"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"macOS"',
};

export interface IcecatIdentifier {
  gtin?: string;
  brand?: string;
  productCode?: string;
  icecatId?: string | number;
}

export interface IcecatClientOptions {
  username: string;
  apiToken?: string;
  contentToken?: string;
  /** Full Icecat key (paid) — needed for brand-restricted products (StatusCode 9) */
  appKey?: string;
  lang?: string;
  baseUrl?: string;
}

/** Minimal shape of the fields we consume from a datasheet. */
export interface IcecatData {
  GeneralInfo?: {
    IcecatId?: number;
    Title?: string;
    Brand?: string;
    BrandPartCode?: string;
    ProductName?: string;
    EndOfLifeDate?: string;
    GTIN?: string[];
    Category?: { CategoryID?: string; Name?: { Value?: string } };
  };
  /** granular content=essentialinfo shape (brand/name live here, not GeneralInfo) */
  EssentialInfo?: {
    Brand?: string;
    ProductCode?: string;
    ProductName?: string;
    GTIN?: string[];
  };
  Image?: { HighPic?: string; Pic500x500?: string; LowPic?: string };
  Gallery?: { Pic500x500?: string; HighPic?: string; IsMain?: string }[];
  FeaturesGroups?: IcecatFeatureGroup[];
  ContentErrors?: string;
}

export interface IcecatFeatureGroup {
  FeatureGroup?: { Name?: { Value?: string } };
  Features?: IcecatFeature[];
}

export interface IcecatFeature {
  Value?: string;
  RawValue?: string;
  PresentationValue?: string;
  Feature?: { Name?: { Value?: string }; Measure?: { Signs?: { _?: string } } };
}

interface IcecatResponse {
  msg?: string;
  data?: IcecatData;
  statusCode?: number;
  message?: string;
}

export class IcecatError extends Error {
  /** HTTP status when the failure came from the API (403 = gated, 404 = not found). */
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'IcecatError';
    this.status = status;
  }
}

export class IcecatClient {
  private readonly fetcher: Fetcher;
  constructor(
    private readonly opts: IcecatClientOptions,
    fetcher?: Fetcher,
  ) {
    this.fetcher = fetcher ?? defaultFetcher;
  }

  /** Fetch one product datasheet. `content` is the granular selector ('' = full). */
  async fetchProduct(id: IcecatIdentifier, content = ''): Promise<IcecatData> {
    const url = new URL(this.opts.baseUrl ?? DEFAULT_BASE);
    url.searchParams.set('lang', this.opts.lang ?? 'EN');
    url.searchParams.set('shopname', this.opts.username);
    if (id.gtin) url.searchParams.set('GTIN', id.gtin);
    else if (id.icecatId !== undefined) url.searchParams.set('icecat_id', String(id.icecatId));
    else if (id.brand && id.productCode) {
      url.searchParams.set('Brand', id.brand);
      url.searchParams.set('ProductCode', id.productCode);
    } else {
      throw new IcecatError('Need a GTIN, icecat_id, or brand + productCode');
    }
    if (this.opts.appKey) url.searchParams.set('app_key', this.opts.appKey);
    url.searchParams.set('content', content);

    const headers: Record<string, string> = { ...BROWSER_HEADERS };
    if (this.opts.apiToken) headers['api-token'] = this.opts.apiToken;
    if (this.opts.contentToken) headers['content-token'] = this.opts.contentToken;

    const res = await this.fetcher(url.toString(), { headers });
    if (!res.ok) throw new IcecatError(`Icecat HTTP ${res.status}`, res.status);
    const json = JSON.parse(await res.text()) as IcecatResponse;

    // Error shapes: {statusCode,message} or data.ContentErrors.
    if (json.statusCode || json.message) {
      throw new IcecatError(`Icecat: ${json.message ?? `status ${json.statusCode}`}`);
    }
    if (!json.data) throw new IcecatError(`Icecat: empty response (msg=${json.msg ?? 'none'})`);
    if (json.data.ContentErrors) throw new IcecatError(`Icecat: ${json.data.ContentErrors}`);
    return json.data;
  }
}
