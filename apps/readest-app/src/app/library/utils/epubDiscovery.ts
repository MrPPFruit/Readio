import { AppService } from '@/types/system';
import { findLocalEpubFiles } from '@/utils/bridge';
import { requestStoragePermission } from '@/utils/permission';
import { joinPaths } from '@/utils/path';
import { isEpubPath } from './libraryUtils';
import { SelectedFile } from '@/hooks/useFileSelector';

interface DiscoveredEpubFile {
  path: string;
  basePath?: string;
}

export const resolveEpubImportFiles = async (
  appService: AppService,
  selectImportDirectory: () => Promise<string | undefined>,
): Promise<SelectedFile[]> => {
  if (appService.isAndroidApp) {
    if (!(await requestStoragePermission())) return [];
    const result = await findLocalEpubFiles();
    return result.files.map((file: DiscoveredEpubFile) => ({
      path: file.path,
      basePath: file.basePath,
    }));
  }

  const importDirectory = await selectImportDirectory();
  if (!importDirectory) return [];
  const files = await appService.readDirectory(importDirectory, 'None');
  const epubFiles = files.filter((file) => isEpubPath(file.path));

  return await Promise.all(
    epubFiles.map(async (file) => ({
      path: await joinPaths(importDirectory, file.path),
      basePath: importDirectory,
    })),
  );
};
