import { PageInfo } from '@/types/book';
import { BookDoc } from '@/libs/document';
import { FoliateView } from '@/types/view';

export const getRendererPageInfo = (view: FoliateView | null): PageInfo | null => {
  const renderer = view?.renderer;
  if (!renderer || renderer.scrolled || renderer.pages <= 0) return null;

  return {
    current: Math.max(0, Math.min(renderer.pages - 1, renderer.page)),
    total: renderer.pages,
  };
};

export const getReflowableFullBookPageInfo = ({
  bookDoc,
  section,
  location,
  renderedPageInfo,
}: {
  bookDoc: BookDoc;
  section: PageInfo;
  location: PageInfo;
  renderedPageInfo: PageInfo | null;
}): PageInfo => {
  if (!renderedPageInfo || renderedPageInfo.total <= 0) return location;

  const currentSectionSize = bookDoc.sections[section.current]?.size ?? 0;
  const totalSize = bookDoc.sections.reduce(
    (sum, item) => sum + (item.linear !== 'no' && item.size > 0 ? item.size : 0),
    0,
  );
  if (currentSectionSize <= 0 || totalSize <= 0) return location;

  const pagesPerSize = renderedPageInfo.total / currentSectionSize;
  const total = Math.max(1, Math.round(totalSize * pagesPerSize));
  const sizeBefore = bookDoc.sections
    .slice(0, section.current)
    .reduce((sum, item) => sum + (item.linear !== 'no' && item.size > 0 ? item.size : 0), 0);
  const sectionProgress = Math.max(
    0,
    Math.min(1, renderedPageInfo.current / renderedPageInfo.total),
  );
  const current = Math.max(
    0,
    Math.min(
      total - 1,
      Math.floor((sizeBefore + sectionProgress * currentSectionSize) * pagesPerSize),
    ),
  );

  return { current, total };
};
