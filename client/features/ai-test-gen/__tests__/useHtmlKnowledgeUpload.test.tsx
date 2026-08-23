import { StrictMode, type ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  HtmlKnowledgePageDto,
  HtmlKnowledgePageStatus,
  HtmlKnowledgeSetDto,
  HtmlKnowledgeSetStatus,
} from '@/shared/services/api';

const htmlKnowledgeApi = vi.hoisted(() => ({
  createSet: vi.fn(),
  getSet: vi.fn(),
  uploadPage: vi.fn(),
  deletePage: vi.fn(),
  deleteSet: vi.fn(),
  finalizeSet: vi.fn(),
}));

vi.mock('@/shared/services/api', () => ({
  api: { testGen: { htmlKnowledge: htmlKnowledgeApi } },
}));

import { useHtmlKnowledgeUpload } from '../useHtmlKnowledgeUpload';

const timestamp = '2026-08-21T00:00:00.000Z';

function makeFile(name: string, size = 20): File {
  return new File([new Uint8Array(size)], name, { type: 'text/html' });
}

function makeFileWithExactName(name: string, size = 20): File {
  const file = makeFile('placeholder.html', size);
  Object.defineProperty(file, 'name', { configurable: true, value: name });
  return file;
}

function makePage(
  file: File,
  index: number,
  status: HtmlKnowledgePageStatus = 'PENDING',
  overrides: Partial<HtmlKnowledgePageDto> = {},
): HtmlKnowledgePageDto {
  return {
    pageId: `page-${index + 1}`,
    fileName: file.name.normalize('NFC'),
    expectedByteSize: file.size,
    status,
    errorMessage: status === 'FAILED' ? 'Upload failed' : null,
    pageTitle: status === 'READY' ? file.name.replace(/\.html?$/iu, '') : null,
    byteSize: status === 'READY' ? file.size : null,
    informationLevel: status === 'READY' ? 'NORMAL' : null,
    warnings: [],
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

function makeSet(
  setId: string,
  pages: readonly HtmlKnowledgePageDto[],
  status: HtmlKnowledgeSetStatus = 'UPLOADING',
): HtmlKnowledgeSetDto {
  return {
    knowledgeSetId: setId,
    status,
    pageCount: pages.length,
    totalBytes: pages.reduce((total, page) => total + page.expectedByteSize, 0),
    indexVersion: 1,
    pages,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function readyPage(page: HtmlKnowledgePageDto, overrides: Partial<HtmlKnowledgePageDto> = {}) {
  return {
    ...page,
    status: 'READY' as const,
    errorMessage: null,
    pageTitle: page.fileName.replace(/\.html?$/iu, ''),
    byteSize: page.expectedByteSize,
    informationLevel: 'NORMAL' as const,
    warnings: [],
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((fulfill, fail) => {
    resolve = fulfill;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function installSuccessfulFlow(
  files: readonly File[],
  setId = 'set-1',
  pageOverrides: Readonly<Record<string, Partial<HtmlKnowledgePageDto>>> = {},
) {
  const pendingPages = files.map((file, index) => makePage(file, index));
  const readyPages = pendingPages.map((page) => readyPage(page, pageOverrides[page.fileName]));
  htmlKnowledgeApi.createSet.mockResolvedValue(makeSet(setId, pendingPages));
  htmlKnowledgeApi.uploadPage.mockImplementation(
    (_projectId: string, _setId: string, pageId: string) => {
      const page = readyPages.find((candidate) => candidate.pageId === pageId);
      if (!page) throw new Error(`Unknown page ${pageId}`);
      return Promise.resolve(page);
    },
  );
  htmlKnowledgeApi.finalizeSet.mockResolvedValue(makeSet(setId, readyPages, 'READY'));
  htmlKnowledgeApi.getSet.mockResolvedValue(makeSet(setId, readyPages));
  htmlKnowledgeApi.deletePage.mockResolvedValue(makeSet(setId, readyPages));
  htmlKnowledgeApi.deleteSet.mockResolvedValue({ success: true });
  return { pendingPages, readyPages };
}

beforeEach(() => {
  vi.clearAllMocks();
  htmlKnowledgeApi.deleteSet.mockResolvedValue({ success: true });
});

describe('useHtmlKnowledgeUpload validation', () => {
  it('starts empty and permits a run without HTML knowledge', () => {
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));

    expect(result.current.rows).toEqual([]);
    expect(result.current.totalBytes).toBe(0);
    expect(result.current.phase).toBe('empty');
    expect(result.current.readySetId).toBeUndefined();
    expect(result.current.isBlockingStart).toBe(false);
  });

  it('shows all selected rows but creates no set when more than 20 files are selected', async () => {
    const files = Array.from({ length: 21 }, (_, index) => makeFile(`page-${index}.html`, 1));
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));

    await act(async () => result.current.selectFiles(files));

    expect(result.current.phase).toBe('invalid');
    expect(result.current.rows).toHaveLength(21);
    expect(result.current.rows.every((row) => row.status === 'FAILED')).toBe(true);
    expect(result.current.rows.every((row) => row.canRetry === false)).toBe(true);
    expect(result.current.rows.some((row) => /20/u.test(row.errorMessage ?? ''))).toBe(true);
    expect(result.current.isBlockingStart).toBe(true);
    expect(htmlKnowledgeApi.createSet).not.toHaveBeenCalled();
  });

  it.each([
    ['an unsupported extension', [makeFile('page.txt')], /\.html|\.htm/iu],
    ['a page over 512 KiB', [makeFile('large.html', 512 * 1024 + 1)], /512 KiB/iu],
    [
      'a set over 5 MiB',
      Array.from({ length: 11 }, (_, index) => makeFile(`large-${index}.html`, 500 * 1024)),
      /5 MiB/iu,
    ],
    ['a slash in a name', [makeFileWithExactName('folder/page.html')], /path separator/iu],
    ['a backslash in a name', [makeFileWithExactName('folder\\page.html')], /path separator/iu],
    ['a control character in a name', [makeFileWithExactName('bad\u0001.html')], /control/iu],
    ['a format control in a name', [makeFileWithExactName('bad\u200e.html')], /control/iu],
    ['an unpaired surrogate in a name', [makeFileWithExactName('bad\ud800.html')], /control/iu],
    [
      'a name over 255 Unicode code points',
      [makeFileWithExactName(`${'x'.repeat(251)}.html`)],
      /255 Unicode code points/iu,
    ],
  ])('rejects %s before making an API request', async (_label, files, message) => {
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));

    await act(async () => result.current.selectFiles(files as File[]));

    expect(result.current.phase).toBe('invalid');
    expect(result.current.rows.some((row) => message.test(row.errorMessage ?? ''))).toBe(true);
    expect(htmlKnowledgeApi.createSet).not.toHaveBeenCalled();
  });

  it('rejects NFC-normalized, case-folded duplicate names before creating a set', async () => {
    const files = [makeFile('Cafe\u0301.HTML'), makeFile('CAFÉ.html')];
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));

    await act(async () => result.current.selectFiles(files));

    expect(result.current.phase).toBe('invalid');
    expect(result.current.rows.every((row) => /duplicate/iu.test(row.errorMessage ?? ''))).toBe(true);
    expect(htmlKnowledgeApi.createSet).not.toHaveBeenCalled();
  });

  it('accepts the exact count, per-page, and total-byte limits', async () => {
    const files = Array.from(
      { length: 20 },
      (_, index) => makeFile(
        index === 0 ? `${'x'.repeat(250)}.html` : `page-${index}.html`,
        index < 10 ? 512 * 1024 : 0,
      ),
    );
    installSuccessfulFlow(files);
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));

    await act(async () => result.current.selectFiles(files));

    expect(result.current.phase).toBe('ready');
    expect(result.current.totalBytes).toBe(5 * 1024 * 1024);
    expect(htmlKnowledgeApi.createSet).toHaveBeenCalledTimes(1);
  });

  it('treats an empty replacement as no HTML selection', async () => {
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));

    await act(async () => result.current.selectFiles([]));

    expect(result.current.phase).toBe('empty');
    expect(result.current.rows).toEqual([]);
    expect(htmlKnowledgeApi.createSet).not.toHaveBeenCalled();
  });
});

describe('useHtmlKnowledgeUpload upload state', () => {
  it('creates one complete manifest, maps server page IDs, and retains warnings', async () => {
    const login = makeFile('login.html', 17);
    const shell = makeFile('shell.htm', 19);
    const loginPending = makePage(login, 0, 'PENDING', { pageId: 'server-login' });
    const shellPending = makePage(shell, 1, 'PENDING', { pageId: 'server-shell' });
    htmlKnowledgeApi.createSet.mockResolvedValue(
      makeSet('set-1', [shellPending, loginPending]),
    );
    htmlKnowledgeApi.uploadPage.mockImplementation(
      (_projectId: string, _setId: string, pageId: string) => Promise.resolve(
        pageId === 'server-login'
          ? readyPage(loginPending)
          : readyPage(shellPending, {
              informationLevel: 'LOW_INFORMATION',
              warnings: ['Only a root mount element was found'],
            }),
      ),
    );
    htmlKnowledgeApi.finalizeSet.mockResolvedValue(makeSet('set-1', [
      readyPage(shellPending, {
        informationLevel: 'LOW_INFORMATION',
        warnings: ['Only a root mount element was found'],
      }),
      readyPage(loginPending),
    ], 'READY'));
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));

    await act(async () => result.current.selectFiles([login, shell]));

    expect(htmlKnowledgeApi.createSet).toHaveBeenCalledWith('project-1', {
      pages: [
        { fileName: 'login.html', byteSize: 17 },
        { fileName: 'shell.htm', byteSize: 19 },
      ],
    });
    expect(htmlKnowledgeApi.uploadPage).toHaveBeenCalledWith(
      'project-1', 'set-1', 'server-login', login, expect.any(AbortSignal),
    );
    expect(htmlKnowledgeApi.uploadPage).toHaveBeenCalledWith(
      'project-1', 'set-1', 'server-shell', shell, expect.any(AbortSignal),
    );
    expect(result.current.rows).toEqual([
      expect.objectContaining({ pageId: 'server-login', fileName: 'login.html', status: 'READY' }),
      expect.objectContaining({
        pageId: 'server-shell',
        fileName: 'shell.htm',
        status: 'READY',
        informationLevel: 'LOW_INFORMATION',
        warnings: ['Only a root mount element was found'],
      }),
    ]);
    expect(result.current.phase).toBe('ready');
    expect(result.current.readySetId).toBe('set-1');
    expect(result.current.isBlockingStart).toBe(false);
  });

  it('uploads with at most two workers and exposes pending/uploading row states', async () => {
    const files = [makeFile('one.html'), makeFile('two.html'), makeFile('three.html')];
    const pages = files.map((file, index) => makePage(file, index));
    const uploads = new Map(pages.map((page) => [page.pageId, deferred<HtmlKnowledgePageDto>()]));
    let active = 0;
    let maximumActive = 0;
    htmlKnowledgeApi.createSet.mockResolvedValue(makeSet('set-1', pages));
    htmlKnowledgeApi.uploadPage.mockImplementation(
      (_projectId: string, _setId: string, pageId: string) => {
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        return uploads.get(pageId)!.promise.finally(() => { active -= 1; });
      },
    );
    htmlKnowledgeApi.finalizeSet.mockResolvedValue(
      makeSet('set-1', pages.map((page) => readyPage(page)), 'READY'),
    );
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));

    let selection!: Promise<void>;
    act(() => { selection = result.current.selectFiles(files); });
    await waitFor(() => expect(htmlKnowledgeApi.uploadPage).toHaveBeenCalledTimes(2));

    expect(result.current.phase).toBe('preparing');
    expect(result.current.rows.map((row) => row.status)).toEqual([
      'UPLOADING',
      'UPLOADING',
      'PENDING',
    ]);
    expect(result.current.isBlockingStart).toBe(true);
    expect(maximumActive).toBe(2);

    await act(async () => {
      uploads.get('page-1')!.resolve(readyPage(pages[0]));
      await Promise.resolve();
    });
    await waitFor(() => expect(htmlKnowledgeApi.uploadPage).toHaveBeenCalledTimes(3));
    expect(maximumActive).toBe(2);

    await act(async () => {
      uploads.get('page-2')!.resolve(readyPage(pages[1]));
      uploads.get('page-3')!.resolve(readyPage(pages[2]));
      await selection;
    });

    expect(result.current.rows.every((row) => row.status === 'READY')).toBe(true);
    expect(result.current.phase).toBe('ready');
    expect(htmlKnowledgeApi.finalizeSet).toHaveBeenCalledTimes(1);
  });

  it('publishes a READY row immediately while a peer upload remains pending', async () => {
    const files = [makeFile('ready-first.html'), makeFile('still-pending.html')];
    const pages = files.map((file, index) => makePage(file, index));
    const uploads = new Map(pages.map((page) => [page.pageId, deferred<HtmlKnowledgePageDto>()]));
    htmlKnowledgeApi.createSet.mockResolvedValue(makeSet('set-1', pages));
    htmlKnowledgeApi.uploadPage.mockImplementation(
      (_projectId: string, _setId: string, pageId: string) => uploads.get(pageId)!.promise,
    );
    htmlKnowledgeApi.finalizeSet.mockResolvedValue(
      makeSet('set-1', pages.map((page) => readyPage(page)), 'READY'),
    );
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));
    let selection!: Promise<void>;
    act(() => { selection = result.current.selectFiles(files); });
    await waitFor(() => expect(htmlKnowledgeApi.uploadPage).toHaveBeenCalledTimes(2));

    await act(async () => {
      uploads.get('page-1')!.resolve(readyPage(pages[0]));
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.rows.map((row) => row.status)).toEqual([
      'READY',
      'UPLOADING',
    ]));
    expect(result.current.phase).toBe('preparing');
    expect(htmlKnowledgeApi.finalizeSet).not.toHaveBeenCalled();

    await act(async () => {
      uploads.get('page-2')!.resolve(readyPage(pages[1]));
      await selection;
    });
  });

  it('publishes a reconciled FAILED row while a peer upload remains pending', async () => {
    const files = [makeFile('failed-first.html'), makeFile('still-pending.html')];
    const pages = files.map((file, index) => makePage(file, index));
    const firstUpload = deferred<HtmlKnowledgePageDto>();
    const secondUpload = deferred<HtmlKnowledgePageDto>();
    htmlKnowledgeApi.createSet.mockResolvedValue(makeSet('set-1', pages));
    htmlKnowledgeApi.uploadPage.mockImplementation(
      (_projectId: string, _setId: string, pageId: string) => pageId === 'page-1'
        ? firstUpload.promise
        : secondUpload.promise,
    );
    htmlKnowledgeApi.getSet.mockResolvedValue(makeSet('set-1', pages));
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));
    let selection!: Promise<void>;
    act(() => { selection = result.current.selectFiles(files); });
    await waitFor(() => expect(htmlKnowledgeApi.uploadPage).toHaveBeenCalledTimes(2));

    await act(async () => {
      firstUpload.reject(new Error('Upload response lost'));
      await Promise.resolve();
    });

    await waitFor(() => expect(result.current.rows.map((row) => row.status)).toEqual([
      'FAILED',
      'UPLOADING',
    ]));
    expect(result.current.rows[0].errorMessage).toMatch(/response lost/iu);
    expect(result.current.phase).toBe('failed');

    await act(async () => {
      secondUpload.resolve(readyPage(pages[1]));
      await selection;
    });
  });

  it('uses the same two upload slots for concurrent retryPage calls', async () => {
    const files = [makeFile('one.html'), makeFile('two.html'), makeFile('three.html')];
    const pages = files.map((file, index) => makePage(file, index));
    const attempts = new Map<string, number>();
    const retryUploads = new Map(pages.map((page) => [
      page.pageId,
      deferred<HtmlKnowledgePageDto>(),
    ]));
    let active = 0;
    let maximumActive = 0;
    htmlKnowledgeApi.createSet.mockResolvedValue(makeSet('set-1', pages));
    htmlKnowledgeApi.getSet.mockResolvedValue(makeSet('set-1', pages));
    htmlKnowledgeApi.uploadPage.mockImplementation(
      (_projectId: string, _setId: string, pageId: string) => {
        const attempt = (attempts.get(pageId) ?? 0) + 1;
        attempts.set(pageId, attempt);
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        const request = attempt === 1
          ? Promise.reject(new Error(`Initial ${pageId} upload failed`))
          : retryUploads.get(pageId)!.promise;
        return request.finally(() => { active -= 1; });
      },
    );
    htmlKnowledgeApi.finalizeSet.mockResolvedValue(
      makeSet('set-1', pages.map((page) => readyPage(page)), 'READY'),
    );
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));
    await act(async () => result.current.selectFiles(files));
    expect(result.current.rows.every((row) => row.status === 'FAILED')).toBe(true);

    let retries!: Promise<void>[];
    act(() => {
      retries = pages.map((page) => result.current.retryPage(page.pageId));
    });
    await waitFor(() => expect(active).toBeGreaterThan(0));

    expect(active).toBe(2);
    expect(maximumActive).toBe(2);
    expect(htmlKnowledgeApi.uploadPage).toHaveBeenCalledTimes(5);

    await act(async () => {
      retryUploads.get('page-1')!.resolve(readyPage(pages[0]));
      await Promise.resolve();
    });
    await waitFor(() => expect(htmlKnowledgeApi.uploadPage).toHaveBeenCalledTimes(6));
    expect(active).toBe(2);
    expect(maximumActive).toBe(2);

    await act(async () => {
      retryUploads.get('page-2')!.resolve(readyPage(pages[1]));
      retryUploads.get('page-3')!.resolve(readyPage(pages[2]));
      await Promise.all(retries);
    });
    expect(result.current.phase).toBe('ready');
  });

  it('queues retryPage behind two active initial uploads', async () => {
    const files = [makeFile('retry.html'), makeFile('initial-two.html'), makeFile('initial-three.html')];
    const pages = files.map((file, index) => makePage(file, index));
    const secondInitial = deferred<HtmlKnowledgePageDto>();
    const thirdInitial = deferred<HtmlKnowledgePageDto>();
    const retry = deferred<HtmlKnowledgePageDto>();
    const attempts = new Map<string, number>();
    let active = 0;
    let maximumActive = 0;
    htmlKnowledgeApi.createSet.mockResolvedValue(makeSet('set-1', pages));
    htmlKnowledgeApi.getSet.mockResolvedValue(makeSet('set-1', pages));
    htmlKnowledgeApi.uploadPage.mockImplementation(
      (_projectId: string, _setId: string, pageId: string) => {
        const attempt = (attempts.get(pageId) ?? 0) + 1;
        attempts.set(pageId, attempt);
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        let request: Promise<HtmlKnowledgePageDto>;
        if (pageId === 'page-1') {
          request = attempt === 1
            ? Promise.reject(new Error('First upload failed'))
            : retry.promise;
        } else {
          request = pageId === 'page-2' ? secondInitial.promise : thirdInitial.promise;
        }
        return request.finally(() => { active -= 1; });
      },
    );
    htmlKnowledgeApi.finalizeSet.mockResolvedValue(
      makeSet('set-1', pages.map((page) => readyPage(page)), 'READY'),
    );
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));
    let selection!: Promise<void>;
    act(() => { selection = result.current.selectFiles(files); });
    await waitFor(() => expect(htmlKnowledgeApi.uploadPage).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(result.current.rows[0].status).toBe('FAILED'));
    expect(active).toBe(2);

    let retryPromise!: Promise<void>;
    act(() => { retryPromise = result.current.retryPage('page-1'); });
    await act(async () => { await Promise.resolve(); });

    expect(result.current.rows[0]).toEqual(expect.objectContaining({
      status: 'UPLOADING',
      canRetry: true,
    }));
    expect(htmlKnowledgeApi.uploadPage).toHaveBeenCalledTimes(3);
    expect(active).toBe(2);
    expect(maximumActive).toBe(2);

    await act(async () => {
      secondInitial.resolve(readyPage(pages[1]));
      await Promise.resolve();
    });
    await waitFor(() => expect(htmlKnowledgeApi.uploadPage).toHaveBeenCalledTimes(4));
    expect(active).toBe(2);
    expect(maximumActive).toBe(2);

    await act(async () => {
      thirdInitial.resolve(readyPage(pages[2]));
      retry.resolve(readyPage(pages[0]));
      await Promise.all([selection, retryPromise]);
    });
    expect(result.current.phase).toBe('ready');
  });

  it('keeps File objects memory-only and never reads them as text', async () => {
    const file = makeFile('login.html');
    const text = vi.fn().mockResolvedValue('<h1>Do not read</h1>');
    Object.defineProperty(file, 'text', { configurable: true, value: text });
    const storageWrite = vi.spyOn(Storage.prototype, 'setItem');
    installSuccessfulFlow([file]);
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));

    await act(async () => result.current.selectFiles([file]));

    expect(text).not.toHaveBeenCalled();
    expect(storageWrite).not.toHaveBeenCalled();
    expect(htmlKnowledgeApi.uploadPage.mock.calls[0][3]).toBe(file);
    expect(result.current.rows[0]).not.toHaveProperty('file');
    storageWrite.mockRestore();
  });
});

describe('useHtmlKnowledgeUpload recovery and mutation', () => {
  it('exposes a set error and retrySet recreates a failed manifest from retained Files', async () => {
    const file = makeFile('login.html');
    const pending = makePage(file, 0);
    const ready = readyPage(pending);
    htmlKnowledgeApi.createSet
      .mockRejectedValueOnce(new Error('Set creation unavailable'))
      .mockResolvedValueOnce(makeSet('set-1', [pending]));
    htmlKnowledgeApi.uploadPage.mockResolvedValue(ready);
    htmlKnowledgeApi.finalizeSet.mockResolvedValue(makeSet('set-1', [ready], 'READY'));
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));

    await act(async () => result.current.selectFiles([file]));

    expect(result.current.phase).toBe('failed');
    expect(result.current.error).toMatch(/creation unavailable/iu);
    expect(result.current.rows[0]).toEqual(expect.objectContaining({
      status: 'PENDING',
      errorMessage: null,
      canRetry: false,
    }));

    await act(async () => result.current.retrySet());

    expect(htmlKnowledgeApi.createSet).toHaveBeenNthCalledWith(2, 'project-1', {
      pages: [{ fileName: 'login.html', byteSize: file.size }],
    });
    expect(htmlKnowledgeApi.uploadPage.mock.calls[0][3]).toBe(file);
    expect(result.current.phase).toBe('ready');
    expect(result.current.error).toBeUndefined();
    expect(result.current.readySetId).toBe('set-1');
  });

  it('reconciles a lost upload response and continues when the persisted page is READY', async () => {
    const file = makeFile('login.html');
    const pending = makePage(file, 0);
    const persisted = readyPage(pending);
    htmlKnowledgeApi.createSet.mockResolvedValue(makeSet('set-1', [pending]));
    htmlKnowledgeApi.uploadPage.mockRejectedValue(new TypeError('Network connection lost'));
    htmlKnowledgeApi.getSet.mockResolvedValue(makeSet('set-1', [persisted]));
    htmlKnowledgeApi.finalizeSet.mockResolvedValue(makeSet('set-1', [persisted], 'READY'));
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));

    await act(async () => result.current.selectFiles([file]));

    expect(htmlKnowledgeApi.getSet).toHaveBeenCalledWith(
      'project-1', 'set-1', expect.any(AbortSignal),
    );
    expect(htmlKnowledgeApi.createSet).toHaveBeenCalledTimes(1);
    expect(result.current.rows[0]).toEqual(expect.objectContaining({
      pageId: 'page-1',
      status: 'READY',
    }));
    expect(result.current.phase).toBe('ready');
  });

  it('keeps the same set and page IDs retryable when upload persistence is not READY', async () => {
    const file = makeFile('login.html');
    const pending = makePage(file, 0);
    const ready = readyPage(pending);
    const retryUpload = deferred<HtmlKnowledgePageDto>();
    htmlKnowledgeApi.createSet.mockResolvedValue(makeSet('set-1', [pending]));
    htmlKnowledgeApi.uploadPage
      .mockRejectedValueOnce(new Error('Upload response lost'))
      .mockReturnValueOnce(retryUpload.promise);
    htmlKnowledgeApi.getSet.mockResolvedValue(makeSet('set-1', [pending]));
    htmlKnowledgeApi.finalizeSet.mockResolvedValue(makeSet('set-1', [ready], 'READY'));
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));

    await act(async () => result.current.selectFiles([file]));

    expect(result.current.phase).toBe('failed');
    expect(result.current.rows[0]).toEqual(expect.objectContaining({
      pageId: 'page-1',
      status: 'FAILED',
      errorMessage: expect.stringMatching(/response lost/iu),
      canRetry: true,
    }));

    let retryPromise!: Promise<void>;
    act(() => { retryPromise = result.current.retryPage('page-1'); });
    await waitFor(() => expect(result.current.rows[0]).toEqual(expect.objectContaining({
      status: 'UPLOADING',
      canRetry: true,
    })));
    await act(async () => {
      retryUpload.resolve(ready);
      await retryPromise;
    });

    expect(htmlKnowledgeApi.createSet).toHaveBeenCalledTimes(1);
    expect(htmlKnowledgeApi.uploadPage).toHaveBeenNthCalledWith(
      2, 'project-1', 'set-1', 'page-1', file, expect.any(AbortSignal),
    );
    expect(result.current.phase).toBe('ready');
    expect(result.current.readySetId).toBe('set-1');
  });

  it('reconciles a lost finalize response to a persisted READY set', async () => {
    const file = makeFile('login.html');
    const pending = makePage(file, 0);
    const ready = readyPage(pending);
    htmlKnowledgeApi.createSet.mockResolvedValue(makeSet('set-1', [pending]));
    htmlKnowledgeApi.uploadPage.mockResolvedValue(ready);
    htmlKnowledgeApi.finalizeSet.mockRejectedValue(new TypeError('Finalize response lost'));
    htmlKnowledgeApi.getSet.mockResolvedValue(makeSet('set-1', [ready], 'READY'));
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));

    await act(async () => result.current.selectFiles([file]));

    expect(result.current.phase).toBe('ready');
    expect(result.current.readySetId).toBe('set-1');
    expect(htmlKnowledgeApi.getSet).toHaveBeenCalledWith(
      'project-1', 'set-1', expect.any(AbortSignal),
    );
  });

  it('exposes a set error and retrySet retries finalization without retrying a READY page', async () => {
    const file = makeFile('login.html');
    const pending = makePage(file, 0);
    const ready = readyPage(pending);
    htmlKnowledgeApi.createSet.mockResolvedValue(makeSet('set-1', [pending]));
    htmlKnowledgeApi.uploadPage.mockResolvedValue(ready);
    htmlKnowledgeApi.finalizeSet
      .mockRejectedValueOnce(new Error('Finalize unavailable'))
      .mockResolvedValueOnce(makeSet('set-1', [ready], 'READY'));
    htmlKnowledgeApi.getSet.mockResolvedValue(makeSet('set-1', [ready], 'UPLOADING'));
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));

    await act(async () => result.current.selectFiles([file]));

    expect(result.current.phase).toBe('failed');
    expect(result.current.error).toMatch(/Finalize unavailable/iu);
    expect(result.current.readySetId).toBeUndefined();
    expect(result.current.rows[0].status).toBe('READY');

    await act(async () => result.current.retryPage('page-1'));
    expect(htmlKnowledgeApi.finalizeSet).toHaveBeenCalledTimes(1);

    await act(async () => result.current.retrySet());

    expect(htmlKnowledgeApi.uploadPage).toHaveBeenCalledTimes(1);
    expect(htmlKnowledgeApi.finalizeSet).toHaveBeenCalledTimes(2);
    expect(result.current.phase).toBe('ready');
    expect(result.current.error).toBeUndefined();
    expect(result.current.readySetId).toBe('set-1');
  });

  it('deletes a failed page from an uploading set and finalizes the remainder', async () => {
    const files = [makeFile('ready.html'), makeFile('failed.html')];
    const pending = files.map((file, index) => makePage(file, index));
    const firstReady = readyPage(pending[0]);
    htmlKnowledgeApi.createSet.mockResolvedValue(makeSet('set-1', pending));
    htmlKnowledgeApi.uploadPage.mockImplementation(
      (_projectId: string, _setId: string, pageId: string) => pageId === 'page-1'
        ? Promise.resolve(firstReady)
        : Promise.reject(new Error('Parser rejected page')),
    );
    htmlKnowledgeApi.getSet.mockResolvedValue(makeSet('set-1', [
      firstReady,
      { ...pending[1], status: 'FAILED', errorMessage: 'Parser rejected page' },
    ]));
    htmlKnowledgeApi.deletePage.mockResolvedValue(makeSet('set-1', [firstReady]));
    htmlKnowledgeApi.finalizeSet.mockResolvedValue(makeSet('set-1', [firstReady], 'READY'));
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));

    await act(async () => result.current.selectFiles(files));
    expect(result.current.phase).toBe('failed');
    expect(result.current.rows[1]).toEqual(expect.objectContaining({
      status: 'FAILED',
      canRetry: true,
      errorMessage: 'Parser rejected page',
    }));

    await act(async () => result.current.removePage('page-2'));

    expect(htmlKnowledgeApi.deletePage).toHaveBeenCalledWith(
      'project-1', 'set-1', 'page-2', expect.any(AbortSignal),
    );
    expect(result.current.rows).toHaveLength(1);
    expect(result.current.rows[0].pageId).toBe('page-1');
    expect(result.current.phase).toBe('ready');
  });

  it('aborts an in-flight page upload and calls deletePage while the set is UPLOADING', async () => {
    const files = [makeFile('remove.html'), makeFile('retain.html')];
    const pending = files.map((file, index) => makePage(file, index));
    const retainedReady = readyPage(pending[1]);
    let removedSignal: AbortSignal | undefined;
    htmlKnowledgeApi.createSet.mockResolvedValue(makeSet('set-1', pending));
    htmlKnowledgeApi.uploadPage.mockImplementation(
      (
        _projectId: string,
        _setId: string,
        pageId: string,
        _file: File,
        signal?: AbortSignal,
      ) => {
        if (pageId === 'page-2') return Promise.resolve(retainedReady);
        removedSignal = signal;
        return new Promise<HtmlKnowledgePageDto>((_resolve, reject) => {
          signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          );
        });
      },
    );
    htmlKnowledgeApi.deletePage.mockResolvedValue(makeSet('set-1', [retainedReady]));
    htmlKnowledgeApi.finalizeSet.mockResolvedValue(
      makeSet('set-1', [retainedReady], 'READY'),
    );
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));
    let selection!: Promise<void>;
    act(() => { selection = result.current.selectFiles(files); });
    await waitFor(() => expect(htmlKnowledgeApi.uploadPage).toHaveBeenCalledTimes(2));

    await act(async () => result.current.removePage('page-1'));
    await selection;

    expect(removedSignal?.aborted).toBe(true);
    expect(htmlKnowledgeApi.deletePage).toHaveBeenCalledWith(
      'project-1', 'set-1', 'page-1', expect.any(AbortSignal),
    );
    expect(htmlKnowledgeApi.deleteSet).not.toHaveBeenCalled();
    expect(result.current.rows).toEqual([
      expect.objectContaining({ pageId: 'page-2', status: 'READY' }),
    ]);
    expect(result.current.phase).toBe('ready');
  });

  it('deletes the set and returns empty when the final page is removed', async () => {
    const file = makeFile('failed.html');
    const pending = makePage(file, 0);
    htmlKnowledgeApi.createSet.mockResolvedValue(makeSet('set-1', [pending]));
    htmlKnowledgeApi.uploadPage.mockRejectedValue(new Error('Upload failed'));
    htmlKnowledgeApi.getSet.mockResolvedValue(makeSet('set-1', [pending]));
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));

    await act(async () => result.current.selectFiles([file]));
    await act(async () => result.current.removePage('page-1'));

    expect(htmlKnowledgeApi.deleteSet).toHaveBeenCalledWith(
      'project-1', 'set-1', expect.any(AbortSignal),
    );
    expect(htmlKnowledgeApi.deletePage).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('empty');
    expect(result.current.rows).toEqual([]);
  });

  it('atomically removes both pages without finalizing while removals are pending', async () => {
    const files = [makeFile('one.html'), makeFile('two.html')];
    const pending = files.map((file, index) => makePage(file, index));
    const ready = pending.map((page) => readyPage(page));
    htmlKnowledgeApi.createSet.mockResolvedValue(makeSet('set-1', pending));
    htmlKnowledgeApi.uploadPage.mockImplementation(
      (_projectId: string, _setId: string, pageId: string) => Promise.resolve(
        ready.find((page) => page.pageId === pageId),
      ),
    );
    htmlKnowledgeApi.finalizeSet.mockRejectedValueOnce(new Error('Finalize unavailable'));
    htmlKnowledgeApi.getSet.mockResolvedValue(makeSet('set-1', ready, 'UPLOADING'));
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));
    await act(async () => result.current.selectFiles(files));
    expect(result.current.phase).toBe('failed');
    htmlKnowledgeApi.finalizeSet.mockClear();
    htmlKnowledgeApi.finalizeSet.mockResolvedValue(makeSet('set-1', ready, 'READY'));
    htmlKnowledgeApi.deletePage.mockResolvedValue(makeSet('set-1', ready));

    await act(async () => {
      await Promise.all([
        result.current.removePage('page-1'),
        result.current.removePage('page-2'),
      ]);
    });

    expect(htmlKnowledgeApi.deleteSet).toHaveBeenCalledWith(
      'project-1', 'set-1', expect.any(AbortSignal),
    );
    expect(htmlKnowledgeApi.finalizeSet).not.toHaveBeenCalled();
    expect(result.current.rows).toEqual([]);
    expect(result.current.phase).toBe('empty');
  });

  it('restores a failed remove-all atomically and cancels queued sibling removals', async () => {
    const files = [makeFile('one.html'), makeFile('two.html')];
    const pending = files.map((file, index) => makePage(file, index));
    const ready = pending.map((page) => readyPage(page));
    htmlKnowledgeApi.createSet.mockResolvedValue(makeSet('set-1', pending));
    htmlKnowledgeApi.uploadPage.mockImplementation(
      (_projectId: string, _setId: string, pageId: string) => Promise.resolve(
        ready.find((page) => page.pageId === pageId),
      ),
    );
    htmlKnowledgeApi.finalizeSet.mockRejectedValueOnce(new Error('Finalize unavailable'));
    htmlKnowledgeApi.getSet.mockResolvedValue(makeSet('set-1', ready, 'UPLOADING'));
    htmlKnowledgeApi.deleteSet
      .mockRejectedValueOnce(new Error('Delete set unavailable'))
      .mockResolvedValue({ success: true });
    htmlKnowledgeApi.deletePage.mockResolvedValue(makeSet('set-1', [ready[0]]));
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));
    await act(async () => result.current.selectFiles(files));
    htmlKnowledgeApi.finalizeSet.mockClear();
    htmlKnowledgeApi.finalizeSet.mockResolvedValue(makeSet('set-1', ready, 'READY'));

    await act(async () => {
      await Promise.all([
        result.current.removePage('page-1'),
        result.current.removePage('page-2'),
      ]);
    });

    expect(htmlKnowledgeApi.deleteSet).toHaveBeenCalledTimes(1);
    expect(htmlKnowledgeApi.deletePage).not.toHaveBeenCalled();
    expect(htmlKnowledgeApi.finalizeSet).not.toHaveBeenCalled();
    expect(result.current.rows.map((row) => row.status)).toEqual(['READY', 'READY']);
    expect(result.current.phase).toBe('failed');
    expect(result.current.error).toMatch(/Delete set unavailable/iu);

    await act(async () => result.current.retrySet());

    expect(htmlKnowledgeApi.deleteSet).toHaveBeenCalledTimes(2);
    expect(result.current.rows).toEqual([]);
    expect(result.current.phase).toBe('empty');
  });

  it('rebuilds a finalized immutable set from retained Files after removal', async () => {
    const first = makeFile('first.html', 11);
    const retained = makeFile('retained.html', 13);
    const firstPages = [makePage(first, 0), makePage(retained, 1)];
    const rebuiltPending = makePage(retained, 0, 'PENDING', { pageId: 'rebuilt-page' });
    htmlKnowledgeApi.createSet
      .mockResolvedValueOnce(makeSet('set-1', firstPages))
      .mockResolvedValueOnce(makeSet('set-2', [rebuiltPending]));
    htmlKnowledgeApi.uploadPage.mockImplementation(
      (_projectId: string, setId: string, pageId: string) => {
        if (setId === 'set-2') return Promise.resolve(readyPage(rebuiltPending));
        const page = firstPages.find((candidate) => candidate.pageId === pageId)!;
        return Promise.resolve(readyPage(page));
      },
    );
    htmlKnowledgeApi.finalizeSet
      .mockResolvedValueOnce(makeSet('set-1', firstPages.map((page) => readyPage(page)), 'READY'))
      .mockResolvedValueOnce(makeSet('set-2', [readyPage(rebuiltPending)], 'READY'));
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));

    await act(async () => result.current.selectFiles([first, retained]));
    await act(async () => result.current.removePage('page-1'));

    expect(htmlKnowledgeApi.deleteSet).toHaveBeenCalledWith(
      'project-1', 'set-1', expect.any(AbortSignal),
    );
    expect(htmlKnowledgeApi.createSet).toHaveBeenNthCalledWith(2, 'project-1', {
      pages: [{ fileName: 'retained.html', byteSize: 13 }],
    });
    expect(htmlKnowledgeApi.uploadPage).toHaveBeenCalledWith(
      'project-1', 'set-2', 'rebuilt-page', retained, expect.any(AbortSignal),
    );
    expect(result.current.rows).toEqual([
      expect.objectContaining({ pageId: 'rebuilt-page', fileName: 'retained.html', status: 'READY' }),
    ]);
    expect(result.current.readySetId).toBe('set-2');
  });
});

describe('useHtmlKnowledgeUpload lifecycle', () => {
  function installAbortableUpload(file: File) {
    const pending = makePage(file, 0);
    htmlKnowledgeApi.createSet.mockResolvedValue(makeSet('set-1', [pending]));
    let uploadSignal: AbortSignal | undefined;
    htmlKnowledgeApi.uploadPage.mockImplementation(
      (
        _projectId: string,
        _setId: string,
        _pageId: string,
        _file: File,
        signal?: AbortSignal,
      ) => {
        uploadSignal = signal;
        return new Promise<HtmlKnowledgePageDto>((_resolve, reject) => {
          signal?.addEventListener('abort', () => {
            reject(new DOMException('Aborted', 'AbortError'));
          }, { once: true });
        });
      },
    );
    return { getSignal: () => uploadSignal };
  }

  it('releases upload slots before reconciliation and aborts old generation GETs', async () => {
    const oldFiles = [makeFile('old-one.html'), makeFile('old-two.html')];
    const oldPages = oldFiles.map((file, index) => makePage(file, index));
    const newFile = makeFile('new.html');
    const newPage = makePage(newFile, 0, 'PENDING', { pageId: 'new-page' });
    const reconciliationSignals: AbortSignal[] = [];
    htmlKnowledgeApi.createSet
      .mockResolvedValueOnce(makeSet('old-set', oldPages))
      .mockResolvedValueOnce(makeSet('new-set', [newPage]));
    htmlKnowledgeApi.uploadPage
      .mockRejectedValueOnce(new Error('Old upload one failed'))
      .mockRejectedValueOnce(new Error('Old upload two failed'))
      .mockResolvedValueOnce(readyPage(newPage));
    htmlKnowledgeApi.getSet.mockImplementation(
      (_projectId: string, _setId: string, signal?: AbortSignal) => {
        if (signal) reconciliationSignals.push(signal);
        return new Promise<HtmlKnowledgeSetDto>(() => undefined);
      },
    );
    htmlKnowledgeApi.finalizeSet.mockResolvedValue(
      makeSet('new-set', [readyPage(newPage)], 'READY'),
    );
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));
    act(() => { void result.current.selectFiles(oldFiles); });
    await waitFor(() => expect(htmlKnowledgeApi.getSet).toHaveBeenCalledTimes(2));

    await act(async () => result.current.reset());
    let newSelection!: Promise<void>;
    act(() => { newSelection = result.current.selectFiles([newFile]); });

    await waitFor(() => expect(htmlKnowledgeApi.uploadPage).toHaveBeenCalledTimes(3));
    await act(async () => newSelection);
    expect(reconciliationSignals).toHaveLength(2);
    expect(reconciliationSignals.every((signal) => signal.aborted)).toBe(true);
    expect(result.current.readySetId).toBe('new-set');
  });

  it('starts a new manifest while an aborted old finalize never settles', async () => {
    const oldFile = makeFile('old.html');
    const newFile = makeFile('new.html');
    const oldPage = makePage(oldFile, 0, 'PENDING', { pageId: 'old-page' });
    const newPage = makePage(newFile, 0, 'PENDING', { pageId: 'new-page' });
    let oldFinalizeSignal: AbortSignal | undefined;
    htmlKnowledgeApi.createSet
      .mockResolvedValueOnce(makeSet('old-set', [oldPage]))
      .mockResolvedValueOnce(makeSet('new-set', [newPage]));
    htmlKnowledgeApi.uploadPage.mockImplementation(
      (_projectId: string, setId: string) => Promise.resolve(
        setId === 'old-set' ? readyPage(oldPage) : readyPage(newPage),
      ),
    );
    htmlKnowledgeApi.finalizeSet.mockImplementation(
      (_projectId: string, setId: string, signal?: AbortSignal) => {
        if (setId === 'old-set') {
          oldFinalizeSignal = signal;
          return new Promise<HtmlKnowledgeSetDto>(() => undefined);
        }
        return Promise.resolve(makeSet('new-set', [readyPage(newPage)], 'READY'));
      },
    );
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));
    act(() => { void result.current.selectFiles([oldFile]); });
    await waitFor(() => expect(htmlKnowledgeApi.finalizeSet).toHaveBeenCalledTimes(1));

    let replacement!: Promise<void>;
    act(() => { replacement = result.current.selectFiles([newFile]); });

    await waitFor(() => expect(htmlKnowledgeApi.createSet).toHaveBeenCalledTimes(2));
    await act(async () => replacement);
    expect(oldFinalizeSignal?.aborted).toBe(true);
    expect(result.current.readySetId).toBe('new-set');
    expect(result.current.rows).toEqual([
      expect.objectContaining({ pageId: 'new-page', fileName: 'new.html' }),
    ]);
    expect(result.current.rows[0]).not.toHaveProperty('file');
  });

  it('resets and starts a new manifest while an old delete is pending, then ignores completion', async () => {
    const oldFile = makeFile('old.html');
    const newFile = makeFile('new.html');
    const oldPage = makePage(oldFile, 0, 'PENDING', { pageId: 'old-page' });
    const newPage = makePage(newFile, 0, 'PENDING', { pageId: 'new-page' });
    const oldDelete = deferred<{ success: boolean }>();
    let oldDeleteSignal: AbortSignal | undefined;
    htmlKnowledgeApi.createSet
      .mockResolvedValueOnce(makeSet('old-set', [oldPage]))
      .mockResolvedValueOnce(makeSet('new-set', [newPage]));
    htmlKnowledgeApi.uploadPage.mockImplementation(
      (_projectId: string, setId: string) => Promise.resolve(
        setId === 'old-set' ? readyPage(oldPage) : readyPage(newPage),
      ),
    );
    htmlKnowledgeApi.finalizeSet.mockImplementation(
      (_projectId: string, setId: string) => Promise.resolve(
        setId === 'old-set'
          ? makeSet('old-set', [readyPage(oldPage)], 'READY')
          : makeSet('new-set', [readyPage(newPage)], 'READY'),
      ),
    );
    htmlKnowledgeApi.deleteSet.mockReset();
    htmlKnowledgeApi.deleteSet
      .mockImplementationOnce(
        (_projectId: string, _setId: string, signal?: AbortSignal) => {
          oldDeleteSignal = signal;
          return oldDelete.promise;
        },
      )
      .mockResolvedValue({ success: true });
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));
    await act(async () => result.current.selectFiles([oldFile]));
    let oldRemoval!: Promise<void>;
    act(() => { oldRemoval = result.current.removePage('old-page'); });
    await waitFor(() => expect(htmlKnowledgeApi.deleteSet).toHaveBeenCalledTimes(1));

    await act(async () => result.current.reset());
    expect(result.current.phase).toBe('empty');

    let replacement!: Promise<void>;
    act(() => { replacement = result.current.selectFiles([newFile]); });

    await waitFor(() => expect(htmlKnowledgeApi.createSet).toHaveBeenCalledTimes(2));
    await act(async () => replacement);
    expect(oldDeleteSignal?.aborted).toBe(true);
    expect(result.current.readySetId).toBe('new-set');
    expect(result.current.rows[0]).toEqual(expect.objectContaining({
      pageId: 'new-page',
      fileName: 'new.html',
    }));

    await act(async () => {
      oldDelete.resolve({ success: true });
      await oldRemoval;
    });
    expect(result.current.readySetId).toBe('new-set');
    expect(result.current.rows[0].fileName).toBe('new.html');
  });

  it('reset aborts work and best-effort deletes with the captured project ID', async () => {
    const file = makeFile('login.html');
    const upload = installAbortableUpload(file);
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-old'));
    let selection!: Promise<void>;
    act(() => { selection = result.current.selectFiles([file]); });
    await waitFor(() => expect(htmlKnowledgeApi.uploadPage).toHaveBeenCalledTimes(1));

    await act(async () => result.current.reset());
    await selection;

    expect(upload.getSignal()?.aborted).toBe(true);
    expect(htmlKnowledgeApi.deleteSet).toHaveBeenCalledWith(
      'project-old', 'set-1', expect.any(AbortSignal),
    );
    expect(result.current.phase).toBe('empty');
    expect(result.current.rows).toEqual([]);
  });

  it('project change aborts and deletes the old set using the old project ID', async () => {
    const file = makeFile('login.html');
    const upload = installAbortableUpload(file);
    const { result, rerender } = renderHook(
      ({ projectId }) => useHtmlKnowledgeUpload(projectId),
      { initialProps: { projectId: 'project-old' as string | null } },
    );
    act(() => { void result.current.selectFiles([file]); });
    await waitFor(() => expect(htmlKnowledgeApi.uploadPage).toHaveBeenCalledTimes(1));

    rerender({ projectId: 'project-new' });

    await waitFor(() => {
      expect(htmlKnowledgeApi.deleteSet).toHaveBeenCalledWith(
        'project-old', 'set-1', expect.any(AbortSignal),
      );
    });
    expect(upload.getSignal()?.aborted).toBe(true);
    expect(result.current.phase).toBe('empty');
  });

  it('unmount aborts work, deletes the unbound set, and ignores late responses', async () => {
    const file = makeFile('login.html');
    const pending = makePage(file, 0);
    const upload = deferred<HtmlKnowledgePageDto>();
    htmlKnowledgeApi.createSet.mockResolvedValue(makeSet('set-1', [pending]));
    htmlKnowledgeApi.uploadPage.mockReturnValue(upload.promise);
    const { result, unmount } = renderHook(() => useHtmlKnowledgeUpload('project-old'));
    act(() => { void result.current.selectFiles([file]); });
    await waitFor(() => expect(htmlKnowledgeApi.uploadPage).toHaveBeenCalledTimes(1));
    const signal = htmlKnowledgeApi.uploadPage.mock.calls[0][4] as AbortSignal;

    unmount();
    upload.resolve(readyPage(pending));
    await Promise.resolve();
    await Promise.resolve();

    expect(signal.aborted).toBe(true);
    expect(htmlKnowledgeApi.deleteSet).toHaveBeenCalledWith(
      'project-old', 'set-1', expect.any(AbortSignal),
    );
    expect(htmlKnowledgeApi.finalizeSet).not.toHaveBeenCalled();
  });

  it('transfers ownership only for the exact ready set and releases retained mutable state', async () => {
    const file = makeFile('login.html');
    installSuccessfulFlow([file]);
    const { result, unmount } = renderHook(() => useHtmlKnowledgeUpload('project-1'));
    await act(async () => result.current.selectFiles([file]));
    const safeRows = result.current.rows;
    const createCalls = htmlKnowledgeApi.createSet.mock.calls.length;

    act(() => result.current.releaseAfterStart('set-1'));
    expect(result.current.rows).toBe(safeRows);
    expect(result.current.rows[0]).not.toHaveProperty('file');
    await act(async () => result.current.removePage('page-1'));
    expect(htmlKnowledgeApi.createSet).toHaveBeenCalledTimes(createCalls);
    await act(async () => result.current.reset());
    unmount();

    expect(htmlKnowledgeApi.deleteSet).not.toHaveBeenCalled();
    expect(result.current.phase).toBe('empty');
  });

  it('does not transfer a newer set when an older start completes late', async () => {
    const firstFile = makeFile('first.html');
    const secondFile = makeFile('second.html');
    const firstPage = makePage(firstFile, 0, 'PENDING', { pageId: 'first-page' });
    const secondPage = makePage(secondFile, 0, 'PENDING', { pageId: 'second-page' });
    htmlKnowledgeApi.createSet
      .mockResolvedValueOnce(makeSet('set-a', [firstPage]))
      .mockResolvedValueOnce(makeSet('set-b', [secondPage]));
    htmlKnowledgeApi.uploadPage.mockImplementation(
      (_projectId: string, setId: string) => Promise.resolve(
        setId === 'set-a' ? readyPage(firstPage) : readyPage(secondPage),
      ),
    );
    htmlKnowledgeApi.finalizeSet
      .mockResolvedValueOnce(makeSet('set-a', [readyPage(firstPage)], 'READY'))
      .mockResolvedValueOnce(makeSet('set-b', [readyPage(secondPage)], 'READY'));
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'));
    await act(async () => result.current.selectFiles([firstFile]));
    expect(result.current.readySetId).toBe('set-a');

    await act(async () => result.current.selectFiles([secondFile]));
    expect(result.current.readySetId).toBe('set-b');
    act(() => result.current.releaseAfterStart('set-a'));
    await act(async () => result.current.reset());

    expect(htmlKnowledgeApi.deleteSet).toHaveBeenCalledWith(
      'project-1', 'set-a', expect.any(AbortSignal),
    );
    expect(htmlKnowledgeApi.deleteSet).toHaveBeenCalledWith(
      'project-1', 'set-b', expect.any(AbortSignal),
    );
    expect(result.current.phase).toBe('empty');
  });

  it('uses operation generations to ignore and clean up a stale create response', async () => {
    const staleFile = makeFile('stale.html');
    const currentFile = makeFile('current.html');
    const stalePage = makePage(staleFile, 0, 'PENDING', { pageId: 'stale-page' });
    const currentPage = makePage(currentFile, 0, 'PENDING', { pageId: 'current-page' });
    const staleCreate = deferred<HtmlKnowledgeSetDto>();
    htmlKnowledgeApi.createSet
      .mockReturnValueOnce(staleCreate.promise)
      .mockResolvedValueOnce(makeSet('current-set', [currentPage]));
    htmlKnowledgeApi.uploadPage.mockResolvedValue(readyPage(currentPage));
    htmlKnowledgeApi.finalizeSet.mockResolvedValue(
      makeSet('current-set', [readyPage(currentPage)], 'READY'),
    );
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StrictMode>{children}</StrictMode>
    );
    const { result } = renderHook(() => useHtmlKnowledgeUpload('project-1'), { wrapper });

    let staleSelection!: Promise<void>;
    act(() => { staleSelection = result.current.selectFiles([staleFile]); });
    await waitFor(() => expect(htmlKnowledgeApi.createSet).toHaveBeenCalledTimes(1));
    await act(async () => result.current.selectFiles([currentFile]));
    expect(result.current.readySetId).toBe('current-set');

    await act(async () => {
      staleCreate.resolve(makeSet('stale-set', [stalePage]));
      await staleSelection;
    });

    expect(htmlKnowledgeApi.deleteSet).toHaveBeenCalledWith(
      'project-1', 'stale-set', expect.any(AbortSignal),
    );
    expect(htmlKnowledgeApi.uploadPage).toHaveBeenCalledTimes(1);
    expect(result.current.readySetId).toBe('current-set');
    expect(result.current.rows[0].fileName).toBe('current.html');
  });
});
