import { CFI, TOCItem } from '@/libs/document';

export const findParentPath = (toc: TOCItem[], href: string): TOCItem[] => {
  for (const item of toc) {
    if (item.href === href) {
      return [item];
    }
    if (item.subitems) {
      const path = findParentPath(item.subitems, href);
      if (path.length) {
        return [item, ...path];
      }
    }
  }
  return [];
};

interface TocLabelItem {
  label: string;
  href?: string;
  subitems?: TocLabelItem[];
}

const isPartLikeLabel = (label: string) =>
  /^第[\d一二三四五六七八九十百千万零〇两]+[部卷篇册]/.test(label.trim()) ||
  /^(part|volume|book)\s+\S+/i.test(label.trim());

const findLabelPath = (toc: TocLabelItem[], href: string): TocLabelItem[] => {
  for (const item of toc) {
    if (item.href === href) return [item];
    if (item.subitems) {
      const path = findLabelPath(item.subitems, href);
      if (path.length) return [item, ...path];
    }
  }
  return [];
};

const findPrecedingPart = (toc: TocLabelItem[], currentItem: TocLabelItem): TocLabelItem | null => {
  let precedingPart: TocLabelItem | null = null;
  for (const item of toc) {
    if (item === currentItem || (currentItem.href && item.href === currentItem.href)) {
      return precedingPart;
    }
    if (item.label && isPartLikeLabel(item.label)) precedingPart = item;
  }
  return null;
};

export const getTocDisplayLabel = (
  toc: TocLabelItem[] | undefined,
  currentItem: TocLabelItem | null | undefined,
): string | undefined => {
  if (!currentItem?.label) return undefined;
  if (!toc?.length) return currentItem.label;

  if (isPartLikeLabel(currentItem.label)) return currentItem.label;

  const path = currentItem.href ? findLabelPath(toc, currentItem.href) : [];
  const parent = path.length >= 2 ? path[path.length - 2] : findPrecedingPart(toc, currentItem);
  if (!parent?.label || !isPartLikeLabel(parent.label)) return currentItem.label;
  if (currentItem.label.includes(parent.label)) return currentItem.label;

  return `${parent.label} · ${currentItem.label}`;
};

const findInSubitems = (item: TOCItem, cfi: string): TOCItem | null => {
  if (!item.subitems?.length) return null;
  return findTocItemBS(item.subitems, cfi);
};

export const findTocItemBS = (toc: TOCItem[], cfi: string): TOCItem | null => {
  if (!cfi) return null;
  let left = 0;
  let right = toc.length - 1;
  let result: TOCItem | null = null;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const item = toc[mid]!;
    const currentCfi = toc[mid]!.cfi || '';
    const comparison = CFI.compare(currentCfi, cfi);
    if (comparison === 0) {
      return findInSubitems(item, cfi) ?? item;
    } else if (comparison < 0) {
      result = findInSubitems(item, cfi) ?? item;
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return result;
};
