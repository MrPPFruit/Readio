import clsx from 'clsx';
import { MdInfoOutline, MdRssFeed } from 'react-icons/md';
import { IoFileTray } from 'react-icons/io5';
import { readioFeatures } from '@/config/features';
import { useEnv } from '@/context/EnvContext';
import { useTranslation } from '@/hooks/useTranslation';
import MenuItem from '@/components/MenuItem';
import Menu from '@/components/Menu';
import { eventDispatcher } from '@/utils/event';

interface ImportMenuProps {
  setIsDropdownOpen?: (open: boolean) => void;
  onImportBooksFromFiles: () => void;
  onImportBooksFromDirectory?: () => void;
  onImportEpubsFromDirectory?: () => void;
  onOpenCatalogManager: () => void;
}

const ImportMenu: React.FC<ImportMenuProps> = ({
  setIsDropdownOpen,
  onImportBooksFromFiles,
  onImportBooksFromDirectory,
  onImportEpubsFromDirectory,
  onOpenCatalogManager,
}) => {
  const _ = useTranslation();
  const { appService } = useEnv();

  const handleImportFromFiles = () => {
    onImportBooksFromFiles();
    setIsDropdownOpen?.(false);
  };

  const handleImportFromDirectory = () => {
    onImportBooksFromDirectory?.();
    setIsDropdownOpen?.(false);
  };

  const handleImportEpubsFromDirectory = () => {
    onImportEpubsFromDirectory?.();
    setIsDropdownOpen?.(false);
  };

  const handleOpenCatalogManager = () => {
    onOpenCatalogManager();
    setIsDropdownOpen?.(false);
  };

  const renderInfoButton = (label: string, description: string) => (
    <button
      type='button'
      aria-label={`${label}说明`}
      title={description}
      className='text-base-content/45 hover:text-base-content/70 flex min-h-8 min-w-8 items-center justify-center rounded-full'
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        eventDispatcher.dispatch('toast', {
          message: description,
          timeout: 3000,
          type: 'info',
        });
      }}
    >
      <MdInfoOutline className='h-4 w-4' />
    </button>
  );

  return (
    <Menu
      className={clsx('dropdown-content bg-base-100 rounded-box !relative z-[1] mt-3 p-2 shadow')}
      onCancel={() => setIsDropdownOpen?.(false)}
    >
      <MenuItem
        label={_('选择文件导入')}
        description={_('选择一个或多个 EPUB、PDF、TXT 文件导入。')}
        Icon={<IoFileTray className='h-5 w-5' />}
        siblings={renderInfoButton(
          _('选择文件导入'),
          _('选择一个或多个 EPUB、PDF、TXT 文件导入。'),
        )}
        onClick={handleImportFromFiles}
      />
      {onImportBooksFromDirectory && (
        <MenuItem
          label={_('选择文件夹导入')}
          description={_('选择文件夹，导入其中所有支持的书籍文件。')}
          Icon={<IoFileTray className='h-5 w-5' />}
          siblings={renderInfoButton(
            _('选择文件夹导入'),
            _('选择文件夹，导入其中所有支持的书籍文件。'),
          )}
          onClick={handleImportFromDirectory}
        />
      )}
      {onImportEpubsFromDirectory && (
        <MenuItem
          label={_('一键导入本地 EPUB')}
          description={_('自动搜索本机 EPUB 文件并批量导入。')}
          Icon={<IoFileTray className='h-5 w-5' />}
          siblings={renderInfoButton(
            _('一键导入本地 EPUB'),
            _('自动搜索本机 EPUB 文件并批量导入。'),
          )}
          onClick={handleImportEpubsFromDirectory}
        />
      )}
      {readioFeatures.opds && (
        <MenuItem
          label={appService?.isOnlineCatalogsAccessible ? _('Online Library') : _('OPDS Catalogs')}
          Icon={<MdRssFeed className='h-5 w-5' />}
          onClick={handleOpenCatalogManager}
        />
      )}
    </Menu>
  );
};

export default ImportMenu;
