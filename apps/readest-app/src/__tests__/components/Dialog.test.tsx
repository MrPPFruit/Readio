import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import Dialog from '@/components/Dialog';

vi.mock('@/context/EnvContext', () => ({
  useEnv: () => ({ appService: { isAndroidApp: false, hasSafeAreaInset: false } }),
}));

vi.mock('@/store/themeStore', () => ({
  useThemeStore: () => ({ systemUIVisible: false, statusBarHeight: 0, safeAreaInsets: {} }),
}));

vi.mock('@/store/deviceStore', () => ({
  useDeviceControlStore: () => ({
    acquireBackKeyInterception: vi.fn(),
    releaseBackKeyInterception: vi.fn(),
  }),
}));

vi.mock('@/hooks/useTranslation', () => ({
  useTranslation: () => (key: string) => key,
}));

afterEach(cleanup);

describe('Dialog modal layering', () => {
  it('lets only the topmost dialog handle Escape and focus trapping', () => {
    const closeParent = vi.fn();
    const closeChild = vi.fn();

    render(
      <>
        <Dialog isOpen title='父级弹窗' onClose={closeParent}>
          <button type='button'>父级操作</button>
        </Dialog>
        <Dialog
          isOpen
          title='子级弹窗'
          snapHeight={0.4}
          dragHandleLabel='下拉关闭子级弹窗'
          header={<div className='sr-only'>子级弹窗</div>}
          onClose={closeChild}
        >
          <button type='button'>子级操作</button>
        </Dialog>
      </>,
    );

    const parentDialog = screen.getByRole('dialog', { name: '父级弹窗' });
    const childDialog = screen.getByRole('dialog', { name: '子级弹窗' });
    const childHandle = within(childDialog).getByRole('button', { name: '下拉关闭子级弹窗' });
    const childAction = within(childDialog).getByRole('button', { name: '子级操作' });

    childAction.focus();
    fireEvent.keyDown(window, { key: 'Tab' });
    expect(document.activeElement).toBe(childHandle);
    expect(within(parentDialog).getByRole('button', { name: '父级操作' })).not.toBe(
      document.activeElement,
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(closeChild).toHaveBeenCalledTimes(1);
    expect(closeParent).not.toHaveBeenCalled();
  });

  it('does not close a nondismissible dialog from the drag handle', () => {
    const onClose = vi.fn();

    render(
      <Dialog
        isOpen
        title='不可关闭弹窗'
        snapHeight={0.4}
        dismissible={false}
        dragHandleLabel='下拉关闭不可关闭弹窗'
        header={<div className='sr-only'>不可关闭弹窗</div>}
        onClose={onClose}
      >
        <button type='button'>保留</button>
      </Dialog>,
    );

    const dialog = screen.getByRole('dialog', { name: '不可关闭弹窗' });
    const handle = within(dialog).getByRole('button', { name: '下拉关闭不可关闭弹窗' });

    fireEvent.click(handle);
    fireEvent.mouseDown(handle, { clientY: 20, clientX: 0 });
    fireEvent.mouseUp(window, { clientY: 700, clientX: 0 });
    fireEvent.keyDown(window, { key: 'Escape' });

    expect(onClose).not.toHaveBeenCalled();
  });
});
