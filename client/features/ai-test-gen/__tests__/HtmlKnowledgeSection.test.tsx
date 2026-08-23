import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { HtmlKnowledgeSection } from '../HtmlKnowledgeSection';
import type {
  HtmlKnowledgeUploadController,
  HtmlKnowledgeUploadRow,
} from '../useHtmlKnowledgeUpload';

function makeRow(
  pageId: string,
  fileName: string,
  status: HtmlKnowledgeUploadRow['status'],
  overrides: Partial<HtmlKnowledgeUploadRow> = {},
): HtmlKnowledgeUploadRow {
  return {
    pageId,
    fileName,
    byteSize: 512,
    status,
    canRetry: status === 'FAILED',
    errorMessage: null,
    pageTitle: null,
    informationLevel: null,
    warnings: [],
    ...overrides,
  };
}

function makeController(
  overrides: Partial<HtmlKnowledgeUploadController> = {},
): HtmlKnowledgeUploadController {
  return {
    rows: [],
    totalBytes: 0,
    phase: 'empty',
    isBlockingStart: false,
    selectFiles: vi.fn().mockResolvedValue(undefined),
    retryPage: vi.fn().mockResolvedValue(undefined),
    retrySet: vi.fn().mockResolvedValue(undefined),
    removePage: vi.fn().mockResolvedValue(undefined),
    reset: vi.fn().mockResolvedValue(undefined),
    releaseAfterStart: vi.fn(),
    ...overrides,
  };
}

describe('HtmlKnowledgeSection', () => {
  it('renders the optional multi-file picker and permanent safety disclosures', () => {
    const controller = makeController();
    render(<HtmlKnowledgeSection controller={controller} />);

    const picker = screen.getByLabelText('Choose HTML files');
    expect(picker).toHaveAttribute('type', 'file');
    expect(picker).toHaveAttribute('multiple');
    expect(picker).toHaveAttribute('accept', '.html,.htm,text/html');
    expect(screen.getByText('Choose HTML files')).toBeVisible();
    expect(screen.getByText('0 files')).toBeInTheDocument();
    expect(screen.getByText('0 B')).toBeInTheDocument();
    expect(screen.getByText(
      'Relevant HTML excerpts may be sent to the configured AI provider.',
    )).toBeVisible();
    expect(screen.getByText(
      'Scripts are not executed and linked resources are not fetched.',
    )).toBeVisible();
  });

  it('passes every selection to the controller and clears the native input value', () => {
    const selectFiles = vi.fn().mockResolvedValue(undefined);
    const controller = makeController({ selectFiles });
    render(<HtmlKnowledgeSection controller={controller} />);
    const picker = screen.getByLabelText('Choose HTML files') as HTMLInputElement;
    const files = [
      new File(['<h1>Login</h1>'], 'login.html', { type: 'text/html' }),
      new File(['<h1>Home</h1>'], 'home.htm', { type: 'text/html' }),
    ];

    fireEvent.change(picker, { target: { files } });
    expect(selectFiles).toHaveBeenNthCalledWith(1, files);
    expect(picker.value).toBe('');

    fireEvent.change(picker, { target: { files } });
    expect(selectFiles).toHaveBeenNthCalledWith(2, files);
    expect(picker.value).toBe('');
  });

  it('shows count, total size, statuses, and a LOW_INFORMATION warning', () => {
    const rows = [
      makeRow('page-1', 'pending.html', 'PENDING'),
      makeRow('page-2', 'uploading.html', 'UPLOADING'),
      makeRow('page-3', 'ready.html', 'READY'),
      makeRow('page-4', 'shell.html', 'READY', {
        informationLevel: 'LOW_INFORMATION',
        warnings: ['Only a root mount element was found'],
      }),
      makeRow('page-5', 'failed.html', 'FAILED', {
        errorMessage: 'Parser rejected this page',
      }),
    ];
    const controller = makeController({
      rows,
      totalBytes: 1536,
      phase: 'failed',
      isBlockingStart: true,
    });
    render(<HtmlKnowledgeSection controller={controller} />);

    expect(screen.getByText('5 files')).toBeInTheDocument();
    expect(screen.getByText('1.5 KiB')).toBeInTheDocument();
    for (const status of ['PENDING', 'UPLOADING', 'FAILED']) {
      const statusBadge = screen.getByText(status);
      expect(statusBadge).toBeInTheDocument();
      expect(statusBadge.closest('span')?.querySelector('svg')).toBeInTheDocument();
    }
    const readyBadges = screen.getAllByText('READY');
    expect(readyBadges).toHaveLength(2);
    expect(readyBadges.every((badge) => badge.closest('span')?.querySelector('svg'))).toBe(true);
    expect(screen.getByText(
      'Low information. A rendered DOM snapshot may provide better knowledge.',
    )).toBeInTheDocument();
    expect(screen.getByText('Only a root mount element was found')).toBeInTheDocument();
    expect(screen.getByText('Parser rejected this page')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Retry uploading.html' })).not.toBeInTheDocument();
  });

  it('does not offer Retry for local validation failures and explains the next action', () => {
    const controller = makeController({
      rows: [makeRow('local-1', 'invalid.txt', 'FAILED', {
        canRetry: false,
        errorMessage: 'HTML file name must end in .html or .htm',
      })],
      totalBytes: 20,
      phase: 'invalid',
      isBlockingStart: true,
    });
    render(<HtmlKnowledgeSection controller={controller} />);

    expect(screen.queryByRole('button', { name: 'Retry invalid.txt' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove invalid.txt' })).toBeVisible();
    expect(screen.getByText(
      'Validation errors cannot be retried. Remove invalid files or choose a new valid selection.',
    )).toBeVisible();
  });

  it('offers Retry for a retryable server page failure', () => {
    const retryPage = vi.fn().mockResolvedValue(undefined);
    const controller = makeController({
      rows: [makeRow('server-page', 'failed.html', 'FAILED', {
        canRetry: true,
        errorMessage: 'Server indexing failed',
      })],
      totalBytes: 20,
      phase: 'failed',
      isBlockingStart: true,
      retryPage,
    });
    render(<HtmlKnowledgeSection controller={controller} />);

    fireEvent.click(screen.getByRole('button', { name: 'Retry failed.html' }));
    expect(retryPage).toHaveBeenCalledWith('server-page');
  });

  it('uses only set-level Retry when manifest creation fails', () => {
    const retryPage = vi.fn().mockResolvedValue(undefined);
    const retrySet = vi.fn().mockResolvedValue(undefined);
    const controller = makeController({
      rows: [makeRow('local-1', 'login.html', 'PENDING', { canRetry: false })],
      totalBytes: 20,
      phase: 'failed',
      error: 'Set creation unavailable',
      isBlockingStart: true,
      retryPage,
      retrySet,
    });
    render(<HtmlKnowledgeSection controller={controller} />);

    expect(screen.queryByRole('button', { name: 'Retry login.html' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry HTML knowledge set' }));
    expect(retrySet).toHaveBeenCalledTimes(1);
    expect(retryPage).not.toHaveBeenCalled();
  });

  it('renders bounded warnings with an icon for every page status and information level', () => {
    const longNormalWarning = `Parser truncated static text ${'x'.repeat(250)} END-OF-WARNING`;
    const normalWarnings = [
      longNormalWarning,
      ...Array.from({ length: 20 }, (_, index) => `Normal parser warning ${index + 1}`),
    ];
    const rows = [
      makeRow('page-pending', 'pending.html', 'PENDING', {
        warnings: ['Pending page warning'],
      }),
      makeRow('page-uploading', 'uploading.html', 'UPLOADING', {
        warnings: ['Uploading page warning'],
      }),
      makeRow('page-normal', 'normal.html', 'READY', {
        informationLevel: 'NORMAL',
        warnings: normalWarnings,
      }),
      makeRow('page-low', 'low.html', 'READY', {
        informationLevel: 'LOW_INFORMATION',
        warnings: ['Low-information parser warning'],
      }),
      makeRow('page-failed', 'failed.html', 'FAILED', {
        warnings: ['Failed page warning'],
      }),
    ];
    render(<HtmlKnowledgeSection controller={makeController({
      rows,
      totalBytes: rows.reduce((total, row) => total + row.byteSize, 0),
      phase: 'failed',
      isBlockingStart: true,
    })} />);

    for (const [fileName, warning] of [
      ['pending.html', 'Pending page warning'],
      ['uploading.html', 'Uploading page warning'],
      ['low.html', 'Low-information parser warning'],
      ['failed.html', 'Failed page warning'],
    ]) {
      const warningRegion = screen.getByLabelText(`Warnings for ${fileName}`);
      expect(within(warningRegion).getByText(warning)).toBeInTheDocument();
      expect(warningRegion.querySelector('svg')).toBeInTheDocument();
    }

    const normalWarningRegion = screen.getByLabelText('Warnings for normal.html');
    expect(within(normalWarningRegion).getAllByRole('listitem')).toHaveLength(20);
    expect(within(normalWarningRegion).getByText(/Parser truncated static text/iu)).toBeInTheDocument();
    expect(within(normalWarningRegion).queryByText(/END-OF-WARNING/u)).not.toBeInTheDocument();
    expect(within(normalWarningRegion).queryByText('Normal parser warning 20')).not.toBeInTheDocument();
    expect(screen.getByText(/Low information\. A rendered DOM snapshot/iu)).toBeInTheDocument();
  });

  it('announces one atomic progress summary with counts, phase, and busy state', () => {
    const rows = [
      makeRow('page-pending', 'pending.html', 'PENDING'),
      makeRow('page-uploading', 'uploading.html', 'UPLOADING'),
      makeRow('page-ready', 'ready.html', 'READY'),
      makeRow('page-low', 'low.html', 'READY', {
        informationLevel: 'LOW_INFORMATION',
      }),
      makeRow('page-failed', 'failed.html', 'FAILED'),
    ];
    render(<HtmlKnowledgeSection controller={makeController({
      rows,
      totalBytes: rows.reduce((total, row) => total + row.byteSize, 0),
      phase: 'preparing',
      isBlockingStart: true,
    })} />);

    const progress = screen.getByRole('status');
    expect(progress).toHaveAttribute('aria-live', 'polite');
    expect(progress).toHaveAttribute('aria-atomic', 'true');
    expect(progress).toHaveAttribute('aria-busy', 'true');
    expect(progress).toHaveTextContent(/phase: preparing/iu);
    expect(progress).toHaveTextContent(/1 pending/iu);
    expect(progress).toHaveTextContent(/1 uploading/iu);
    expect(progress).toHaveTextContent(/2 ready/iu);
    expect(progress).toHaveTextContent(/1 failed/iu);
    expect(progress).toHaveTextContent(/1 low information/iu);
    expect(screen.getByText('Preparing HTML knowledge')).toBeVisible();
  });

  it('disables upload mutations while a start attempt owns the selection', () => {
    const selectFiles = vi.fn().mockResolvedValue(undefined);
    const retryPage = vi.fn().mockResolvedValue(undefined);
    const retrySet = vi.fn().mockResolvedValue(undefined);
    const removePage = vi.fn().mockResolvedValue(undefined);
    const controller = makeController({
      rows: [makeRow('page-1', 'failed.html', 'FAILED', {
        errorMessage: 'Upload failed',
      })],
      totalBytes: 512,
      phase: 'failed',
      error: 'Finalization failed',
      isBlockingStart: true,
      selectFiles,
      retryPage,
      retrySet,
      removePage,
    });
    render(<HtmlKnowledgeSection controller={controller} disabled />);

    const picker = screen.getByLabelText('Choose HTML files');
    const retry = screen.getByRole('button', { name: 'Retry failed.html' });
    const remove = screen.getByRole('button', { name: 'Remove failed.html' });
    const retrySetButton = screen.getByRole('button', { name: 'Retry HTML knowledge set' });
    expect(picker).toBeDisabled();
    expect(retry).toBeDisabled();
    expect(remove).toBeDisabled();
    expect(retrySetButton).toBeDisabled();

    fireEvent.change(picker, {
      target: { files: [new File(['replacement'], 'replacement.html')] },
    });
    fireEvent.click(retry);
    fireEvent.click(remove);
    fireEvent.click(retrySetButton);
    expect(selectFiles).not.toHaveBeenCalled();
    expect(retryPage).not.toHaveBeenCalled();
    expect(removePage).not.toHaveBeenCalled();
    expect(retrySet).not.toHaveBeenCalled();
  });

  it('keeps retry focus while uploading, then moves it to the READY status', async () => {
    const retryPage = vi.fn().mockResolvedValue(undefined);
    const controller = makeController({
      rows: [makeRow('page-1', 'retry.html', 'FAILED')],
      totalBytes: 512,
      phase: 'failed',
      isBlockingStart: true,
      retryPage,
    });
    const { rerender } = render(<HtmlKnowledgeSection controller={controller} />);
    const retry = screen.getByRole('button', { name: 'Retry retry.html' });
    retry.focus();
    expect(document.activeElement).toBe(retry);

    rerender(<HtmlKnowledgeSection controller={{
      ...controller,
      rows: [makeRow('page-1', 'retry.html', 'UPLOADING', { canRetry: true })],
      phase: 'preparing',
    }} />);

    const retrying = screen.getByRole('button', { name: 'Retry retry.html' });
    expect(retrying).toBe(retry);
    expect(retrying).not.toBeDisabled();
    expect(retrying).toHaveAttribute('aria-disabled', 'true');
    expect(document.activeElement).toBe(retrying);
    fireEvent.click(retrying);
    expect(retryPage).not.toHaveBeenCalled();

    rerender(<HtmlKnowledgeSection controller={{
      ...controller,
      rows: [makeRow('page-1', 'retry.html', 'READY', {
        informationLevel: 'NORMAL',
      })],
      phase: 'ready',
      readySetId: 'set-1',
      isBlockingStart: false,
    }} />);

    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByLabelText('retry.html status READY'),
    ));
  });

  it('moves focus after row removal to the next, previous, then file picker', async () => {
    const controller = makeController({
      rows: [
        makeRow('page-1', 'first.html', 'READY'),
        makeRow('page-2', 'second.html', 'READY'),
        makeRow('page-3', 'third.html', 'READY'),
      ],
      totalBytes: 1536,
      phase: 'ready',
      readySetId: 'set-1',
    });
    const { rerender } = render(<HtmlKnowledgeSection controller={controller} />);
    screen.getByRole('button', { name: 'Remove second.html' }).focus();

    rerender(<HtmlKnowledgeSection controller={{
      ...controller,
      rows: [
        makeRow('page-1', 'first.html', 'READY'),
        makeRow('page-3', 'third.html', 'READY'),
      ],
      totalBytes: 1024,
    }} />);
    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Remove third.html' }),
    ));

    screen.getByRole('button', { name: 'Remove third.html' }).focus();
    rerender(<HtmlKnowledgeSection controller={{
      ...controller,
      rows: [makeRow('page-1', 'first.html', 'READY')],
      totalBytes: 512,
    }} />);
    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Remove first.html' }),
    ));

    screen.getByRole('button', { name: 'Remove first.html' }).focus();
    rerender(<HtmlKnowledgeSection controller={{
      ...controller,
      rows: [],
      totalBytes: 0,
      phase: 'empty',
      readySetId: undefined,
    }} />);
    await waitFor(() => expect(document.activeElement).toBe(
      screen.getByLabelText('Choose HTML files'),
    ));
  });

  it('uses contrasting helper/action colors, strong focus styles, and alert semantics', () => {
    const controller = makeController({
      rows: [makeRow('page-1', 'failed.html', 'FAILED', {
        errorMessage: 'Parser failed',
      })],
      totalBytes: 512,
      phase: 'failed',
      error: 'Set failed',
      isBlockingStart: true,
    });
    render(<HtmlKnowledgeSection controller={controller} />);

    const picker = screen.getByLabelText('Choose HTML files');
    const pickerControl = picker.closest('label');
    const retry = screen.getByRole('button', { name: 'Retry failed.html' });
    const remove = screen.getByRole('button', { name: 'Remove failed.html' });
    const failedRow = screen.getByText('failed.html').closest('li')!;
    expect(screen.getByText('Up to 20 .html or .htm files')).toHaveClass('text-slate-600');
    expect(within(failedRow).getByText('512 B')).toHaveClass('text-slate-600');
    expect(pickerControl?.className).toContain('has-[:focus-visible]:ring-2');
    expect(retry).toHaveClass('text-slate-600', 'focus-visible:ring-2');
    expect(remove).toHaveClass('text-slate-600', 'focus-visible:ring-2');
    expect(screen.getByRole('alert', { name: 'Error for failed.html' })).toHaveTextContent('Parser failed');
    expect(screen.getByRole('alert', { name: 'HTML knowledge set error' })).toHaveTextContent('Set failed');
  });

  it('provides accessible retry/remove actions, bounds errors, and caps the list at 20 rows', () => {
    const retryPage = vi.fn().mockResolvedValue(undefined);
    const retrySet = vi.fn().mockResolvedValue(undefined);
    const removePage = vi.fn().mockResolvedValue(undefined);
    const rows = Array.from({ length: 21 }, (_, index) => makeRow(
      `page-${index + 1}`,
      `page-${index + 1}.html`,
      index === 0 ? 'FAILED' : 'READY',
      index === 0
        ? { errorMessage: `Parser failed ${'x'.repeat(600)} END-OF-UNBOUNDED-ERROR` }
        : {},
    ));
    const controller = makeController({
      rows,
      totalBytes: rows.reduce((total, row) => total + row.byteSize, 0),
      phase: 'failed',
      error: `Set finalization failed ${'y'.repeat(600)} END-OF-SET-ERROR`,
      isBlockingStart: true,
      retryPage,
      retrySet,
      removePage,
    });
    render(<HtmlKnowledgeSection controller={controller} />);

    expect(screen.getByText('21 files')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /^Remove .+\.html$/u })).toHaveLength(20);
    expect(screen.queryByText('page-21.html')).not.toBeInTheDocument();
    expect(screen.queryByText(/END-OF-UNBOUNDED-ERROR/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/END-OF-SET-ERROR/u)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Retry page-1.html' }));
    expect(retryPage).toHaveBeenCalledWith('page-1');
    fireEvent.click(screen.getByRole('button', { name: 'Remove page-1.html' }));
    expect(removePage).toHaveBeenCalledWith('page-1');

    const setAlert = screen.getByRole('alert', { name: 'HTML knowledge set error' });
    fireEvent.click(within(setAlert).getByRole('button', { name: 'Retry HTML knowledge set' }));
    expect(retrySet).toHaveBeenCalledTimes(1);
  });
});
