import { afterEach, describe, expect, it, vi } from 'vitest';

import { api } from '../api';
import type {
  HtmlInformationLevel,
  HtmlKnowledgePageDto,
  HtmlKnowledgePageStatus,
  HtmlKnowledgeSetDto,
  HtmlKnowledgeSetStatus,
} from '../api';
import type { StartConfig } from '../../test-gen-run/types';

const createdAt = '2026-08-21T00:00:00.000Z';

const page: HtmlKnowledgePageDto = {
  pageId: 'page-1',
  fileName: 'login.html',
  expectedByteSize: 18,
  status: 'READY',
  errorMessage: null,
  pageTitle: 'Sign in',
  byteSize: 18,
  informationLevel: 'NORMAL',
  warnings: [],
  createdAt,
  updatedAt: createdAt,
};

const set: HtmlKnowledgeSetDto = {
  knowledgeSetId: 'set-1',
  status: 'UPLOADING',
  pageCount: 1,
  totalBytes: 18,
  indexVersion: 1,
  pages: [page],
  createdAt,
  updatedAt: createdAt,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('api.testGen.htmlKnowledge', () => {
  it('creates a set with the exact project-scoped JSON request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(set, 201));
    vi.stubGlobal('fetch', fetchMock);
    const manifest = { pages: [{ fileName: 'login.html', byteSize: 18 }] };

    await expect(api.testGen.htmlKnowledge.createSet('project-1', manifest)).resolves.toEqual(set);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/test-gen/project-1/html-knowledge-sets',
      {
        method: 'POST',
        body: JSON.stringify(manifest),
        headers: { 'Content-Type': 'application/json' },
      },
    );
  });

  it('gets a safe set DTO from the exact set route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(set));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await expect(
      api.testGen.htmlKnowledge.getSet('project-1', 'set-1', controller.signal),
    ).resolves.toEqual(set);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/test-gen/project-1/html-knowledge-sets/set-1',
      {
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  });

  it('puts the original File bytes with the HTML content type and abort signal', async () => {
    type UploadBody = Parameters<typeof api.testGen.htmlKnowledge.uploadPage>[3];
    type UsesExactFile = UploadBody extends File
      ? File extends UploadBody
        ? true
        : false
      : false;
    const usesExactFile: UsesExactFile = true;
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(page));
    vi.stubGlobal('fetch', fetchMock);
    const file = new File([new Uint8Array([0x3c, 0x68, 0x31, 0x3e])], 'login.html', {
      type: 'application/octet-stream',
    });
    const controller = new AbortController();

    await expect(
      api.testGen.htmlKnowledge.uploadPage(
        'project-1',
        'set-1',
        'page-1',
        file,
        controller.signal,
      ),
    ).resolves.toEqual(page);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/test-gen/project-1/html-knowledge-sets/set-1/pages/page-1',
      {
        method: 'PUT',
        body: file,
        signal: controller.signal,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      },
    );
    const request = fetchMock.mock.calls[0][1] as RequestInit;
    expect(request.body).toBe(file);
    expect(usesExactFile).toBe(true);
    expect(request.headers).not.toEqual(expect.objectContaining({
      'Content-Type': 'application/json',
    }));
  });

  it('deletes a page from the exact nested route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(set));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await expect(
      api.testGen.htmlKnowledge.deletePage(
        'project-1', 'set-1', 'page-1', controller.signal,
      ),
    ).resolves.toEqual(set);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/test-gen/project-1/html-knowledge-sets/set-1/pages/page-1',
      {
        method: 'DELETE',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  });

  it('deletes an unbound set from the exact set route', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ success: true }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await expect(
      api.testGen.htmlKnowledge.deleteSet('project-1', 'set-1', controller.signal),
    ).resolves.toEqual({ success: true });

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/test-gen/project-1/html-knowledge-sets/set-1',
      {
        method: 'DELETE',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  });

  it('finalizes a set through the exact finalize route', async () => {
    const readySet = { ...set, status: 'READY' as const };
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(readySet));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();

    await expect(
      api.testGen.htmlKnowledge.finalizeSet('project-1', 'set-1', controller.signal),
    ).resolves.toEqual(readySet);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/test-gen/project-1/html-knowledge-sets/set-1/finalize',
      {
        method: 'POST',
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  });
});

describe('HTML knowledge API types', () => {
  it('uses uppercase wire statuses and exposes safe DTO fields only', () => {
    const setStatus: HtmlKnowledgeSetStatus = 'BOUND';
    const pageStatus: HtmlKnowledgePageStatus = 'FAILED';
    const informationLevel: HtmlInformationLevel = 'LOW_INFORMATION';
    type UnsafeSetKeys = Extract<
      keyof HtmlKnowledgeSetDto,
      'pageGraph' | 'requirementSnapshot' | 'requirementSnapshotHash' | 'runId'
    >;
    type UnsafePageKeys = Extract<
      keyof HtmlKnowledgePageDto,
      'normalizedHtml' | 'knowledgeIndex' | 'sha256'
    >;
    const hasNoUnsafeSetKeys: UnsafeSetKeys extends never ? true : false = true;
    const hasNoUnsafePageKeys: UnsafePageKeys extends never ? true : false = true;

    expect([setStatus, pageStatus, informationLevel]).toEqual([
      'BOUND',
      'FAILED',
      'LOW_INFORMATION',
    ]);
    expect(hasNoUnsafeSetKeys).toBe(true);
    expect(hasNoUnsafePageKeys).toBe(true);
  });

  it('types test-gen start with the shared StartConfig including a knowledge set ID', () => {
    type StartArgument = Parameters<typeof api.testGen.start>[1];
    type IsAny<T> = 0 extends (1 & T) ? true : false;
    type IsExact = StartArgument extends StartConfig
      ? StartConfig extends StartArgument
        ? true
        : false
      : false;
    const isAny: IsAny<StartArgument> = false;
    const isExact: IsExact = true;
    const config: StartArgument = {
      requirementIds: ['REQ-1'],
      mode: 'auto',
      htmlKnowledgeSetId: 'set-1',
    };

    expect(isAny).toBe(false);
    expect(isExact).toBe(true);
    expect(config.htmlKnowledgeSetId).toBe('set-1');
  });
});
