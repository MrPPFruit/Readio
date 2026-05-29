import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

import { isTauriAppPlatform } from '@/services/environment';
import type { AIBookDownloadLink, AIBookSearchResult } from './types';

const DIRECT_DOWNLOAD_HOSTS = new Set(['gutendex.com', 'www.gutenberg.org', 'gutenberg.org']);
const DIRECT_DOWNLOAD_EXTENSIONS = new Set(['.epub', '.epub3.images', '.pdf', '.mobi', '.txt']);
const BOOK_CONTENT_TYPES = new Set([
  'application/epub+zip',
  'application/pdf',
  'application/x-mobipocket-ebook',
  'text/plain',
]);

const isDirectDownloadPath = (url: URL) => {
  const pathname = url.pathname.toLowerCase();
  return [...DIRECT_DOWNLOAD_EXTENSIONS].some((extension) => pathname.endsWith(extension));
};

const isAllowedDirectDownloadUrl = (url: string) => {
  try {
    const parsedUrl = new URL(url);
    return (
      parsedUrl.protocol === 'https:' &&
      DIRECT_DOWNLOAD_HOSTS.has(parsedUrl.hostname) &&
      isDirectDownloadPath(parsedUrl)
    );
  } catch {
    return false;
  }
};

export const canDirectDownloadAIBookFile = (result: AIBookSearchResult, link: AIBookDownloadLink) =>
  result.risk === 'direct-open' &&
  link.risk === 'direct-open' &&
  link.source === result.source &&
  isAllowedDirectDownloadUrl(link.url);

const EXTENSION_BY_TYPE: Record<string, string> = {
  'application/epub+zip': 'epub',
  'application/pdf': 'pdf',
  'application/x-mobipocket-ebook': 'mobi',
  'text/plain': 'txt',
};

const getFilenameFromUrl = (url: string) => {
  const pathname = new URL(url).pathname;
  const filename = pathname.split('/').filter(Boolean).pop();
  return filename || 'book';
};

const getExtension = (contentType: string | null, link: AIBookDownloadLink) => {
  if (link.filename?.includes('.')) return '';
  const contentTypeBase = contentType?.split(';')[0]?.toLowerCase() ?? link.mimeType?.split(';')[0];
  return contentTypeBase ? EXTENSION_BY_TYPE[contentTypeBase] : link.format;
};

export const downloadAIBookFile = async (
  result: AIBookSearchResult,
  link: AIBookDownloadLink,
): Promise<File> => {
  if (!canDirectDownloadAIBookFile(result, link)) {
    throw new Error('Direct download is not allowed for this source');
  }

  const response = await (isTauriAppPlatform() ? tauriFetch(link.url) : fetch(link.url));
  const finalUrl = response.url || link.url;
  if (!isAllowedDirectDownloadUrl(finalUrl)) {
    throw new Error('Downloaded response is not from an allowed source');
  }
  if (!response.ok) throw new Error('Failed to download book');

  const blob = await response.blob();
  const contentType = response.headers.get('Content-Type') || link.mimeType || blob.type;
  const contentTypeBase = contentType?.split(';')[0]?.toLowerCase();
  if (contentTypeBase && !BOOK_CONTENT_TYPES.has(contentTypeBase)) {
    throw new Error('Downloaded response is not a book file');
  }
  const baseFilename = link.filename || getFilenameFromUrl(link.url);
  const extension = getExtension(contentType, link);
  const filename = extension ? `${baseFilename}.${extension}` : baseFilename;

  return new File([blob], filename, { type: contentType || blob.type });
};
