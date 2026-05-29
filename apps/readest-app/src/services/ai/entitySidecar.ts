import type {
  EntityAliasRecord,
  EntityFactRecord,
  EntitySidecarEntity,
  EntitySidecarHit,
  EntitySidecarIndex,
  TextChunk,
} from './types';

export const ENTITY_SIDECAR_VERSION = 1;

const MAX_FACTS_PER_ENTITY = 16;
const MAX_FACT_LENGTH = 180;
const MAX_ALIASES_PER_ENTITY = 12;
const MAX_QUERY_COUNT = 4;
const HONORIFICS = ['先生', '女士', '小姐', '队长', '教授'];
const ENTITY_NAME_PATTERN =
  /(?:[\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z0-9·]{1,23}|\d[\d-]{1,12})/u;
const PAREN_ALIAS_PATTERN =
  /([\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z0-9·]{1,23})[（(]([^）)\n]{2,24})[）)]/gu;
const NUMBERED_ENTITY_PATTERN = /\b\d[\d-]{1,12}\b/gu;
const CALLED_ALIAS_PATTERN =
  /([\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z0-9·]{1,23})[，,、\s]*(?:又称|也叫|即|被称为)([\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z0-9·]{1,23})/gu;
const TITLE_NAME_PATTERN =
  /([\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z0-9·]{1,20})(先生|女士|小姐|队长|教授)/gu;
const ALIAS_PREFIX_PATTERN = /^(?:后来|此后|随后|然后|接着|原来|其实|而|但|他|她|它|这位|那位)+/u;
const ROLE_DESCRIPTOR_PATTERN =
  /([\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z0-9·]{1,23})(?:先生|女士|小姐|队长|教授)?是[^。！？!?；;\n]{0,18}的([\p{Script=Han}A-Za-z][\p{Script=Han}A-Za-z0-9·]{1,18}(?:导师|老师|教员|队长|教授|看守者|医生|船长))/gu;
const GENERIC_ROLE_ALIASES = new Set([
  '老师',
  '导师',
  '教员',
  '队长',
  '教授',
  '医生',
  '船长',
  '先生',
  '女士',
  '小姐',
]);

interface EntityDraft {
  id: string;
  canonicalName: string;
  aliases: Map<string, EntityAliasRecord>;
  facts: EntityFactRecord[];
}

const normalizeEntityText = (value: string): string =>
  value.replace(/\s+/g, '').trim().toLowerCase();

const sentenceCandidates = (text: string): string[] =>
  text
    .split(/(?<=[。！？!?；;])|\n+/u)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

const stripHonorific = (value: string): string => {
  for (const honorific of HONORIFICS) {
    if (value.endsWith(honorific) && value.length > honorific.length + 1) {
      return value.slice(0, -honorific.length);
    }
  }
  return value;
};

const cleanAliasText = (text: string): string => text.trim().replace(ALIAS_PREFIX_PATTERN, '');

const makeAlias = (
  text: string,
  chunk: TextChunk,
  confidence: 'high' | 'medium',
): EntityAliasRecord | null => {
  const trimmed = cleanAliasText(text);
  if (!ENTITY_NAME_PATTERN.test(trimmed)) return null;
  return {
    text: trimmed,
    normalizedText: normalizeEntityText(trimmed),
    chunkId: chunk.id,
    sectionIndex: chunk.sectionIndex,
    pageNumber: chunk.pageNumber,
    confidence,
  };
};

const relatedAliasKeys = (aliases: Iterable<string>): Set<string> => {
  const keys = new Set<string>();
  for (const alias of aliases) {
    const normalized = normalizeEntityText(alias);
    keys.add(normalized);
    const stripped = normalizeEntityText(stripHonorific(alias));
    if (stripped) keys.add(stripped);
  }
  return keys;
};

const getOrCreateDraft = (drafts: EntityDraft[], aliases: string[]): EntityDraft => {
  const keys = relatedAliasKeys(aliases);
  const existing = drafts.find((draft) =>
    [...draft.aliases.keys()].some((aliasKey) => keys.has(aliasKey)),
  );
  if (existing) return existing;

  const canonicalName = aliases[0]!.trim();
  const draft: EntityDraft = {
    id: `entity-${drafts.length + 1}`,
    canonicalName,
    aliases: new Map(),
    facts: [],
  };
  drafts.push(draft);
  return draft;
};

const addAlias = (draft: EntityDraft, alias: EntityAliasRecord | null): void => {
  if (!alias || draft.aliases.size >= MAX_ALIASES_PER_ENTITY) return;
  if (!draft.aliases.has(alias.normalizedText)) draft.aliases.set(alias.normalizedText, alias);
};

const addFact = (draft: EntityDraft, chunk: TextChunk, sentence: string): void => {
  if (draft.facts.length >= MAX_FACTS_PER_ENTITY) return;
  const text = sentence.slice(0, MAX_FACT_LENGTH).trim();
  if (!text || draft.facts.some((fact) => fact.chunkId === chunk.id && fact.text === text)) return;
  draft.facts.push({
    id: `${draft.id}:fact-${draft.facts.length + 1}`,
    chunkId: chunk.id,
    sectionIndex: chunk.sectionIndex,
    pageNumber: chunk.pageNumber,
    ...(chunk.endPageNumber !== undefined ? { endPageNumber: chunk.endPageNumber } : {}),
    ...(chunk.sortIndex !== undefined ? { sortIndex: chunk.sortIndex } : {}),
    text,
  });
};

const collectAliasesFromChunk = (chunk: TextChunk): string[][] => {
  const groups: string[][] = [];

  for (const match of chunk.text.matchAll(TITLE_NAME_PATTERN)) {
    const baseName = match[1]?.trim();
    const titledName = match[0]?.trim();
    if (baseName && titledName) groups.push([baseName, titledName]);
  }

  for (const match of chunk.text.matchAll(PAREN_ALIAS_PATTERN)) {
    const baseName = match[1]?.trim();
    const alias = match[2]?.trim();
    if (baseName && alias && !GENERIC_ROLE_ALIASES.has(alias)) groups.push([baseName, alias]);
  }

  for (const match of chunk.text.matchAll(CALLED_ALIAS_PATTERN)) {
    const baseName = cleanAliasText(match[1] ?? '');
    const alias = cleanAliasText(match[2] ?? '');
    if (baseName && alias && !GENERIC_ROLE_ALIASES.has(alias)) groups.push([baseName, alias]);
  }

  for (const match of chunk.text.matchAll(ROLE_DESCRIPTOR_PATTERN)) {
    const baseName = match[1]?.trim();
    const alias = match[2]?.trim();
    if (baseName && alias && !GENERIC_ROLE_ALIASES.has(alias)) groups.push([baseName, alias]);
  }

  for (const match of chunk.text.matchAll(NUMBERED_ENTITY_PATTERN)) {
    const numberedEntity = match[0]?.trim();
    if (numberedEntity) groups.push([numberedEntity]);
  }

  return groups;
};

export function buildEntitySidecarForChunks(chunks: TextChunk[]): EntitySidecarIndex {
  const drafts: EntityDraft[] = [];
  const bookHash = chunks[0]?.bookHash ?? '';

  for (const chunk of chunks) {
    for (const aliasGroup of collectAliasesFromChunk(chunk)) {
      const draft = getOrCreateDraft(drafts, aliasGroup);
      aliasGroup.forEach((aliasText, index) =>
        addAlias(draft, makeAlias(aliasText, chunk, index === 0 ? 'high' : 'medium')),
      );
      for (const sentence of sentenceCandidates(chunk.text)) {
        if (aliasGroup.some((alias) => sentence.includes(alias))) addFact(draft, chunk, sentence);
      }
    }
  }

  const entities: EntitySidecarEntity[] = drafts
    .filter((draft) => draft.aliases.size > 0 && draft.facts.length > 0)
    .map((draft) => ({
      id: draft.id,
      canonicalName: draft.canonicalName,
      aliases: [...draft.aliases.values()],
      facts: draft.facts,
    }));

  return {
    bookHash,
    entities,
    meta: {
      version: ENTITY_SIDECAR_VERSION,
      aliasCount: entities.reduce((count, entity) => count + entity.aliases.length, 0),
      factCount: entities.reduce((count, entity) => count + entity.facts.length, 0),
      chunkCount: chunks.length,
      createdAt: Date.now(),
    },
  };
}

export function searchEntitySidecar(
  sidecar: EntitySidecarIndex | null | undefined,
  query: string,
  options: { maxPage?: number; topK?: number } = {},
): EntitySidecarHit[] {
  if (!sidecar) return [];
  const queryKey = normalizeEntityText(query);
  const hits: EntitySidecarHit[] = [];

  for (const entity of sidecar.entities) {
    const aliasHits = entity.aliases.filter((alias) => queryKey.includes(alias.normalizedText));
    if (aliasHits.length === 0) continue;
    const aliasScore = Math.max(...aliasHits.map((alias) => (alias.confidence === 'high' ? 4 : 3)));
    for (const fact of entity.facts) {
      const boundaryPage = fact.endPageNumber ?? fact.pageNumber;
      if (options.maxPage !== undefined && boundaryPage > options.maxPage) continue;
      hits.push({
        chunkId: fact.chunkId,
        entityId: entity.id,
        hitType: aliasHits.length > 0 ? 'alias' : 'fact',
        score: aliasScore + Math.min(2, entity.facts.length / 8),
        sectionIndex: fact.sectionIndex,
        pageNumber: fact.pageNumber,
        ...(fact.endPageNumber !== undefined ? { endPageNumber: fact.endPageNumber } : {}),
        ...(fact.sortIndex !== undefined ? { sortIndex: fact.sortIndex } : {}),
        aliases: entity.aliases.map((alias) => alias.text),
      });
    }
  }

  return hits
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.sortIndex ?? a.pageNumber) - (b.sortIndex ?? b.pageNumber) ||
        a.chunkId.localeCompare(b.chunkId),
    )
    .slice(0, options.topK ?? 8);
}

export function buildEntityExpandedQueries(query: string, hits: EntitySidecarHit[]): string[] {
  const queries: string[] = [];
  const seen = new Set<string>();

  for (const hit of hits) {
    const aliasQuery = hit.aliases.slice(0, MAX_QUERY_COUNT).join(' ').trim();
    if (!aliasQuery || seen.has(aliasQuery)) continue;
    seen.add(aliasQuery);
    queries.push(aliasQuery);
  }

  if (queries.length === 0) return [];
  return queries.filter(
    (expandedQuery) => normalizeEntityText(expandedQuery) !== normalizeEntityText(query),
  );
}
