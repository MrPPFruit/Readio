export interface AggregationSearchDomain {
  id: string;
  label: string;
  host: string;
  searchPath: string;
}

export const AGGREGATION_DOMAIN_STATUS_TTL_MS = 6 * 60 * 60 * 1000;

export const AGGREGATION_SEARCH_DOMAINS: AggregationSearchDomain[] = [
  { id: 'z-library', label: 'Z-Library', host: 'z-library.bz', searchPath: '/s/?q=' },
  {
    id: 'annas-archive',
    label: 'Anna’s Archive',
    host: 'annas-archive.is',
    searchPath: '/search?q=',
  },
  {
    id: 'annas-archive-gs',
    label: 'Anna’s Archive',
    host: 'annas-archive.gs',
    searchPath: '/search?q=',
  },
  {
    id: 'annas-archive-li',
    label: 'Anna’s Archive',
    host: 'annas-archive.li',
    searchPath: '/search?q=',
  },
  { id: 'libgen', label: 'LibGen', host: 'libgen.li', searchPath: '/index.php?req=' },
];

export const BLOCKED_AGGREGATION_HOSTS = new Set(['z-lib.is']);

export const buildAggregationSearchUrl = (id: string, query: string) => {
  const domain = AGGREGATION_SEARCH_DOMAINS.find((candidate) => candidate.id === id);
  if (!domain || BLOCKED_AGGREGATION_HOSTS.has(domain.host)) return undefined;
  const encodedQuery = new URLSearchParams({ q: query }).toString().replace(/^q=/u, '');
  return `https://${domain.host}${domain.searchPath}${encodedQuery}`;
};
