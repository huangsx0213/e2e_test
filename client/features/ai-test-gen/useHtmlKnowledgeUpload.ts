import { useEffect, useRef, useState } from 'react';

import { api } from '@/shared/services/api';
import type {
  HtmlInformationLevel,
  HtmlKnowledgePageDto,
  HtmlKnowledgePageStatus,
  HtmlKnowledgeSetDto,
  HtmlKnowledgeSetStatus,
} from '@/shared/services/api';

const MAX_FILES = 20;
const MAX_PAGE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;
const MAX_FILE_NAME_CODE_POINTS = 255;
const MAX_CONCURRENT_UPLOADS = 2;
const CLEANUP_TIMEOUT_MS = 1_000;

export type HtmlKnowledgeUploadPhase =
  | 'empty'
  | 'invalid'
  | 'preparing'
  | 'ready'
  | 'failed';

export type HtmlKnowledgeUploadRowStatus = HtmlKnowledgePageStatus | 'UPLOADING';

export interface HtmlKnowledgeUploadRow {
  readonly pageId: string;
  readonly fileName: string;
  readonly byteSize: number;
  readonly status: HtmlKnowledgeUploadRowStatus;
  readonly canRetry: boolean;
  readonly errorMessage: string | null;
  readonly pageTitle: string | null;
  readonly informationLevel: HtmlInformationLevel | null;
  readonly warnings: readonly string[];
}

export interface HtmlKnowledgeUploadController {
  readonly rows: readonly HtmlKnowledgeUploadRow[];
  readonly totalBytes: number;
  readonly phase: HtmlKnowledgeUploadPhase;
  readonly readySetId?: string;
  readonly error?: string;
  readonly isBlockingStart: boolean;
  selectFiles(files: File[]): Promise<void>;
  retryPage(pageId: string): Promise<void>;
  retrySet(): Promise<void>;
  removePage(pageId: string): Promise<void>;
  reset(): Promise<void>;
  releaseAfterStart(setId: string): void;
}

interface UploadViewState {
  readonly rows: readonly HtmlKnowledgeUploadRow[];
  readonly totalBytes: number;
  readonly phase: HtmlKnowledgeUploadPhase;
  readonly readySetId?: string;
  readonly error?: string;
}

interface SelectedFile {
  readonly localId: string;
  file: File | null;
  readonly byteSize: number;
  readonly displayName: string;
  readonly nameKey: string;
}

interface UploadEntry {
  readonly selected: SelectedFile;
  row: HtmlKnowledgeUploadRow;
  controller?: AbortController;
  uploadPromise?: Promise<void>;
  removing: boolean;
}

interface ActiveSet {
  readonly generation: number;
  readonly projectId: string;
  readonly setId: string;
  readonly generationController: AbortController;
  readonly mutationController: AbortController;
  status: HtmlKnowledgeSetStatus;
  entries: UploadEntry[];
  deleted: boolean;
  replacementPending: boolean;
  removalEpoch: number;
  setRetry: 'finalize' | 'delete-all' | null;
  mutationTail: Promise<void>;
  finalizePromise?: Promise<void>;
}

interface UploadGate {
  active: number;
  readonly waiters: Array<() => void>;
}

const EMPTY_VIEW: UploadViewState = {
  rows: [],
  totalBytes: 0,
  phase: 'empty',
};

function retainedFiles(selected: readonly SelectedFile[]): File[] {
  return selected.flatMap((item) => item.file ? [item.file] : []);
}

function releaseRetainedState(
  active: ActiveSet | null,
  selected: readonly SelectedFile[],
): void {
  const retained = new Set(selected);
  for (const entry of active?.entries ?? []) retained.add(entry.selected);
  for (const item of retained) item.file = null;
  if (active) active.entries = [];
}

export function useHtmlKnowledgeUpload(
  projectId: string | null,
): HtmlKnowledgeUploadController {
  const [view, setView] = useState<UploadViewState>(EMPTY_VIEW);
  const mountedRef = useRef(false);
  const generationRef = useRef(0);
  const activeSetRef = useRef<ActiveSet | null>(null);
  const selectedFilesRef = useRef<SelectedFile[]>([]);
  const controllersRef = useRef(new Set<AbortController>());
  const uploadGateRef = useRef<UploadGate>({ active: 0, waiters: [] });

  useEffect(() => {
    mountedRef.current = true;
    replaceView(EMPTY_VIEW);

    return () => {
      mountedRef.current = false;
      generationRef.current += 1;
      const active = activeSetRef.current;
      active?.generationController.abort();
      active?.mutationController.abort();
      abortAllUploads();
      activeSetRef.current = null;
      const selected = selectedFilesRef.current;
      selectedFilesRef.current = [];
      if (active && shouldDeleteSet(active)) {
        void deleteSetBestEffort(active.projectId, active.setId);
      }
      releaseRetainedState(active, selected);
    };
  }, [projectId]);

  function replaceView(next: UploadViewState): void {
    if (mountedRef.current) setView(next);
  }

  function commitView(generation: number, next: UploadViewState): void {
    if (!mountedRef.current || generationRef.current !== generation) return;
    replaceView(next);
  }

  function isCurrent(active: ActiveSet): boolean {
    return mountedRef.current
      && generationRef.current === active.generation
      && activeSetRef.current === active;
  }

  function abortAllUploads(): void {
    for (const controller of controllersRef.current) controller.abort();
    controllersRef.current.clear();
  }

  function shouldDeleteSet(active: ActiveSet): boolean {
    return active.status !== 'BOUND' && !active.deleted;
  }

  async function deleteSetBestEffort(oldProjectId: string, setId: string): Promise<void> {
    const controller = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<void>((resolve) => {
      timeoutId = setTimeout(() => {
        controller.abort();
        resolve();
      }, CLEANUP_TIMEOUT_MS);
    });
    try {
      await Promise.race([
        api.testGen.htmlKnowledge.deleteSet(oldProjectId, setId, controller.signal),
        timeout,
      ]);
    } catch {
      // The server also expires abandoned unbound sets.
    } finally {
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    }
  }

  function enqueueSetMutation(
    active: ActiveSet,
    mutation: () => Promise<void>,
  ): Promise<void> {
    const run = active.mutationTail.then(async () => {
      if (isCurrent(active) && !active.mutationController.signal.aborted) {
        await mutation();
      }
    });
    active.mutationTail = run.catch(() => undefined);
    return run;
  }

  function snapshotRows(active: ActiveSet): HtmlKnowledgeUploadRow[] {
    return active.entries.map((entry) => ({
      ...entry.row,
      warnings: [...entry.row.warnings],
    }));
  }

  function publishActive(
    active: ActiveSet,
    phase: HtmlKnowledgeUploadPhase,
    error?: string,
  ): void {
    if (!isCurrent(active)) return;
    commitView(active.generation, {
      rows: snapshotRows(active),
      totalBytes: active.entries.reduce(
        (total, entry) => total + entry.selected.byteSize,
        0,
      ),
      phase,
      ...(error ? { error } : {}),
      ...(phase === 'ready' && active.status === 'READY'
        ? { readySetId: active.setId }
        : {}),
    });
  }

  async function clearCurrentSelection(): Promise<void> {
    const oldActive = activeSetRef.current;
    oldActive?.generationController.abort();
    oldActive?.mutationController.abort();
    abortAllUploads();
    activeSetRef.current = null;
    const oldSelected = selectedFilesRef.current;
    selectedFilesRef.current = [];
    if (oldActive && shouldDeleteSet(oldActive)) {
      void deleteSetBestEffort(oldActive.projectId, oldActive.setId);
    }
    releaseRetainedState(oldActive, oldSelected);
  }

  async function replaceSelection(
    files: File[],
    operationProjectId: string | null,
  ): Promise<void> {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const validation = validateSelection(files, generation);
    commitView(generation, validation.view);

    await clearCurrentSelection();
    if (!mountedRef.current || generationRef.current !== generation) return;
    selectedFilesRef.current = validation.selected;

    if (files.length === 0 || validation.view.phase === 'invalid') return;
    if (!operationProjectId) {
      commitView(generation, {
        ...validation.view,
        phase: 'failed',
        error: 'Select a project before uploading HTML knowledge',
      });
      return;
    }

    let created: HtmlKnowledgeSetDto;
    try {
      created = await api.testGen.htmlKnowledge.createSet(operationProjectId, {
        pages: validation.selected.map((selected) => ({
          fileName: selected.displayName,
          byteSize: selected.byteSize,
        })),
      });
    } catch (error) {
      if (mountedRef.current && generationRef.current === generation) {
        const message = errorMessage(error, 'Failed to create HTML knowledge set');
        commitView(generation, {
          ...validation.view,
          phase: 'failed',
          error: message,
        });
      }
      return;
    }

    if (!mountedRef.current || generationRef.current !== generation) {
      await deleteSetBestEffort(operationProjectId, created.knowledgeSetId);
      return;
    }

    let entries: UploadEntry[];
    try {
      entries = mapCreatedPages(validation.selected, created);
    } catch (error) {
      await deleteSetBestEffort(operationProjectId, created.knowledgeSetId);
      if (mountedRef.current && generationRef.current === generation) {
        const message = errorMessage(error, 'Invalid HTML knowledge manifest response');
        commitView(generation, {
          ...validation.view,
          phase: 'failed',
          error: message,
        });
      }
      return;
    }

    const active: ActiveSet = {
      generation,
      projectId: operationProjectId,
      setId: created.knowledgeSetId,
      generationController: new AbortController(),
      mutationController: new AbortController(),
      status: created.status,
      entries,
      deleted: false,
      replacementPending: false,
      removalEpoch: 0,
      setRetry: null,
      mutationTail: Promise.resolve(),
    };
    activeSetRef.current = active;
    publishActive(active, 'preparing');

    if (active.status === 'READY') {
      if (active.entries.every((entry) => entry.row.status === 'READY')) {
        publishActive(active, 'ready');
      } else {
        publishActive(active, 'failed');
      }
      return;
    }
    if (active.status !== 'UPLOADING') {
      publishActive(active, 'failed');
      return;
    }

    await uploadEntries(active, active.entries.filter(
      (entry) => entry.row.status !== 'READY',
    ));
    await finishUploads(active);
  }

  async function uploadEntries(
    active: ActiveSet,
    entries: readonly UploadEntry[],
  ): Promise<void> {
    await Promise.all(entries.map((entry) => uploadEntry(active, entry)));
  }

  async function uploadEntry(active: ActiveSet, entry: UploadEntry): Promise<void> {
    if (!isCurrent(active) || entry.removing || active.status !== 'UPLOADING') return;
    if (entry.uploadPromise) {
      await entry.uploadPromise;
      return;
    }

    const uploadPromise = performUpload(active, entry);
    entry.uploadPromise = uploadPromise;
    try {
      await uploadPromise;
    } finally {
      if (entry.uploadPromise === uploadPromise) entry.uploadPromise = undefined;
    }
  }

  async function withUploadSlot<T>(work: () => Promise<T>): Promise<T> {
    const gate = uploadGateRef.current;
    if (gate.active >= MAX_CONCURRENT_UPLOADS) {
      await new Promise<void>((resolve) => gate.waiters.push(resolve));
    } else {
      gate.active += 1;
    }

    try {
      return await work();
    } finally {
      const next = gate.waiters.shift();
      if (next) next();
      else gate.active -= 1;
    }
  }

  async function performUpload(active: ActiveSet, entry: UploadEntry): Promise<void> {
    let controller: AbortController | undefined;
    try {
      const page = await withUploadSlot(async () => {
        if (!isCurrent(active) || entry.removing || active.status !== 'UPLOADING') {
          return undefined;
        }
        controller = new AbortController();
        entry.controller = controller;
        controllersRef.current.add(controller);
        entry.row = {
          ...entry.row,
          status: 'UPLOADING',
          errorMessage: null,
        };
        publishActive(active, 'preparing');
        const file = entry.selected.file;
        if (!file) return undefined;
        try {
          return await api.testGen.htmlKnowledge.uploadPage(
            active.projectId,
            active.setId,
            entry.row.pageId,
            file,
            controller.signal,
          );
        } finally {
          controllersRef.current.delete(controller);
          if (entry.controller === controller) entry.controller = undefined;
        }
      });
      if (!page) return;
      if (!isCurrent(active) || entry.removing) return;
      entry.row = rowFromPage(page);
      publishUploadProgress(active);
    } catch (error) {
      if (
        !isCurrent(active)
        || entry.removing
        || controller?.signal.aborted
        || active.generationController.signal.aborted
      ) return;
      await reconcileFailedUpload(active, entry, error);
      if (!entry.removing) publishUploadProgress(active);
    }
  }

  function publishUploadProgress(active: ActiveSet): void {
    publishActive(
      active,
      active.entries.some((candidate) => candidate.row.status === 'FAILED')
        ? 'failed'
        : 'preparing',
    );
  }

  async function reconcileFailedUpload(
    active: ActiveSet,
    entry: UploadEntry,
    uploadError: unknown,
  ): Promise<void> {
    const message = errorMessage(uploadError, 'HTML page upload failed');
    let persisted: HtmlKnowledgeSetDto | undefined;
    try {
      persisted = await api.testGen.htmlKnowledge.getSet(
        active.projectId,
        active.setId,
        active.generationController.signal,
      );
    } catch {
      // The original failure remains the most useful retry message.
    }
    if (!isCurrent(active) || entry.removing) return;

    if (persisted) {
      updateSetStatus(active, persisted.status);
      const persistedPage = persisted.pages.find((page) => page.pageId === entry.row.pageId);
      if (persistedPage?.status === 'READY') {
        entry.row = rowFromPage(persistedPage);
        return;
      }
      if (persistedPage) {
        entry.row = {
          ...rowFromPage(persistedPage),
          status: 'FAILED',
          canRetry: true,
          errorMessage: persistedPage.errorMessage ?? message,
        };
        return;
      }
    }

    entry.row = {
      ...entry.row,
      status: 'FAILED',
      canRetry: true,
      errorMessage: message,
    };
  }

  async function finishUploads(active: ActiveSet): Promise<void> {
    if (!isCurrent(active) || active.entries.length === 0) return;
    if (active.replacementPending || active.entries.some((entry) => entry.removing)) {
      publishActive(active, 'preparing');
      return;
    }
    if (active.entries.every((entry) => entry.row.status === 'READY')) {
      if (active.status === 'READY') {
        publishActive(active, 'ready');
      } else if (active.status === 'UPLOADING') {
        await finalizeActive(active);
      } else {
        publishActive(active, 'failed');
      }
      return;
    }

    publishActive(
      active,
      active.entries.some((entry) => entry.row.status === 'FAILED')
        ? 'failed'
        : 'preparing',
    );
  }

  async function finalizeActive(active: ActiveSet): Promise<void> {
    if (!isCurrent(active)) return;
    if (active.finalizePromise) {
      await active.finalizePromise;
      return;
    }

    const finalizePromise = enqueueSetMutation(active, async () => {
      if (
        active.replacementPending
        || active.entries.some((entry) => entry.removing)
        || active.status !== 'UPLOADING'
      ) return;
      await performFinalize(active);
    });
    active.finalizePromise = finalizePromise;
    try {
      await finalizePromise;
    } finally {
      if (active.finalizePromise === finalizePromise) active.finalizePromise = undefined;
    }
  }

  async function performFinalize(active: ActiveSet): Promise<void> {
    active.setRetry = null;
    publishActive(active, 'preparing');
    try {
      const finalized = await api.testGen.htmlKnowledge.finalizeSet(
        active.projectId,
        active.setId,
        active.mutationController.signal,
      );
      if (!isCurrent(active)) return;
      mergePersistedPages(active, finalized);
      updateSetStatus(active, finalized.status);
      if (
        finalized.status === 'READY'
        && active.entries.every((entry) => entry.row.status === 'READY')
      ) {
        publishActive(active, 'ready');
      } else {
        active.setRetry = 'finalize';
        publishActive(active, 'failed', 'HTML knowledge set did not become READY');
      }
    } catch (finalizeError) {
      if (!isCurrent(active) || active.mutationController.signal.aborted) return;
      const finalizeMessage = errorMessage(
        finalizeError,
        'HTML knowledge finalization failed',
      );
      let persisted: HtmlKnowledgeSetDto | undefined;
      try {
        persisted = await api.testGen.htmlKnowledge.getSet(
          active.projectId,
          active.setId,
          active.mutationController.signal,
        );
      } catch {
        // Keep the same set and page IDs available for another finalize attempt.
      }
      if (!isCurrent(active)) return;

      if (persisted) {
        mergePersistedPages(active, persisted);
        updateSetStatus(active, persisted.status);
      }
      if (
        persisted?.status === 'READY'
        && active.entries.every((entry) => entry.row.status === 'READY')
      ) {
        publishActive(active, 'ready');
      } else {
        active.setRetry = 'finalize';
        publishActive(active, 'failed', finalizeMessage);
      }
    }
  }

  function updateSetStatus(active: ActiveSet, status: HtmlKnowledgeSetStatus): void {
    active.status = status;
  }

  function mergePersistedPages(
    active: ActiveSet,
    persisted: HtmlKnowledgeSetDto,
  ): void {
    const byId = new Map(persisted.pages.map((page) => [page.pageId, page]));
    for (const entry of active.entries) {
      const page = byId.get(entry.row.pageId);
      if (!page) continue;
      entry.row = rowFromPage(page);
    }
  }

  async function retryPage(pageId: string): Promise<void> {
    const active = activeSetRef.current;
    if (!active || !isCurrent(active)) return;
    const entry = active.entries.find((candidate) => candidate.row.pageId === pageId);
    if (!entry || entry.removing) return;

    if (active.status !== 'UPLOADING' || !entry.row.canRetry) return;

    entry.row = {
      ...entry.row,
      status: 'UPLOADING',
      errorMessage: null,
    };
    publishUploadProgress(active);
    await uploadEntry(active, entry);
    await finishUploads(active);
  }

  async function retrySet(): Promise<void> {
    const active = activeSetRef.current;
    if (active && isCurrent(active)) {
      if (active.setRetry === 'delete-all') {
        active.setRetry = null;
        await Promise.all(active.entries.map((entry) => removePage(entry.row.pageId)));
        return;
      }
      if (
        active.setRetry === 'finalize'
        && active.status === 'UPLOADING'
        && active.entries.length > 0
        && active.entries.every((entry) => entry.row.status === 'READY')
      ) {
        await finalizeActive(active);
      }
      return;
    }

    const selected = selectedFilesRef.current;
    const files = retainedFiles(selected);
    if (files.length > 0) {
      await replaceSelection(files, projectId);
    }
  }

  async function removePage(pageId: string): Promise<void> {
    const active = activeSetRef.current;
    if (!active) {
      const selected = selectedFilesRef.current;
      if (!selected.some((candidate) => candidate.localId === pageId)) return;
      await replaceSelection(
        retainedFiles(selected.filter((candidate) => candidate.localId !== pageId)),
        projectId,
      );
      return;
    }
    if (!isCurrent(active) || active.status === 'BOUND') return;
    const entry = active.entries.find((candidate) => candidate.row.pageId === pageId);
    if (!entry || entry.removing) return;

    entry.removing = true;
    const removalEpoch = active.removalEpoch;
    entry.controller?.abort();
    publishActive(active, 'preparing');
    let rebuildFiles: File[] | undefined;

    await enqueueSetMutation(active, async () => {
      if (active.removalEpoch !== removalEpoch || !entry.removing) return;
      const retainedEntries = active.entries.filter((candidate) => !candidate.removing);
      if (retainedEntries.length === 0) {
        try {
          await api.testGen.htmlKnowledge.deleteSet(
            active.projectId,
            active.setId,
            active.mutationController.signal,
          );
          active.deleted = true;
        } catch (removeError) {
          if (!isCurrent(active) || active.mutationController.signal.aborted) return;
          active.removalEpoch += 1;
          active.setRetry = 'delete-all';
          for (const candidate of active.entries) candidate.removing = false;
          publishActive(
            active,
            'failed',
            errorMessage(removeError, 'Failed to remove HTML knowledge set'),
          );
          return;
        }
        if (!isCurrent(active)) return;
        active.generationController.abort();
        active.mutationController.abort();
        abortAllUploads();
        activeSetRef.current = null;
        const selected = selectedFilesRef.current;
        selectedFilesRef.current = [];
        const nextGeneration = generationRef.current + 1;
        generationRef.current = nextGeneration;
        commitView(nextGeneration, EMPTY_VIEW);
        releaseRetainedState(active, selected);
        return;
      }

      if (active.status === 'READY') {
        if (!active.replacementPending) {
          active.replacementPending = true;
          rebuildFiles = retainedFiles(retainedEntries.map((candidate) => candidate.selected));
        }
        return;
      }
      if (active.status !== 'UPLOADING') {
        entry.removing = false;
        return;
      }

      try {
        const persisted = await api.testGen.htmlKnowledge.deletePage(
          active.projectId,
          active.setId,
          entry.row.pageId,
          active.mutationController.signal,
        );
        if (!isCurrent(active)) return;
        active.entries = active.entries.filter((candidate) => candidate !== entry);
        selectedFilesRef.current = active.entries.map((candidate) => candidate.selected);
        mergePersistedPages(active, persisted);
        updateSetStatus(active, persisted.status);
        return;
      } catch (removeError) {
        if (!isCurrent(active) || active.mutationController.signal.aborted) return;
        let persisted: HtmlKnowledgeSetDto | undefined;
        try {
          persisted = await api.testGen.htmlKnowledge.getSet(
            active.projectId,
            active.setId,
            active.mutationController.signal,
          );
        } catch {
          // Keep the page locally retryable when deletion cannot be confirmed.
        }
        if (!isCurrent(active)) return;

        if (persisted && !persisted.pages.some((page) => page.pageId === pageId)) {
          active.entries = active.entries.filter((candidate) => candidate !== entry);
          selectedFilesRef.current = active.entries.map((candidate) => candidate.selected);
          updateSetStatus(active, persisted.status);
          mergePersistedPages(active, persisted);
          return;
        }
        if (persisted?.status === 'READY') {
          if (!active.replacementPending) {
            active.replacementPending = true;
            rebuildFiles = retainedFiles(active.entries
              .filter((candidate) => !candidate.removing)
              .map((candidate) => candidate.selected));
          }
          return;
        }

        entry.removing = false;
        entry.row = {
          ...entry.row,
          status: 'FAILED',
          canRetry: false,
          errorMessage: errorMessage(removeError, 'Failed to remove HTML page'),
        };
        publishActive(active, 'failed');
      }
    });

    if (!isCurrent(active) || active.removalEpoch !== removalEpoch) return;
    if (rebuildFiles) {
      await replaceSelection(rebuildFiles, active.projectId);
      return;
    }
    await finishUploads(active);
  }

  async function reset(): Promise<void> {
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    const active = activeSetRef.current;
    active?.generationController.abort();
    active?.mutationController.abort();
    abortAllUploads();
    activeSetRef.current = null;
    const selected = selectedFilesRef.current;
    selectedFilesRef.current = [];
    commitView(generation, EMPTY_VIEW);
    if (active && shouldDeleteSet(active)) {
      void deleteSetBestEffort(active.projectId, active.setId);
    }
    releaseRetainedState(active, selected);
  }

  function releaseAfterStart(setId: string): void {
    const active = activeSetRef.current;
    if (
      !active
      || !isCurrent(active)
      || active.status !== 'READY'
      || active.setId !== setId
    ) return;
    active.generationController.abort();
    active.mutationController.abort();
    abortAllUploads();
    activeSetRef.current = null;
    const selected = selectedFilesRef.current;
    selectedFilesRef.current = [];
    generationRef.current += 1;
    releaseRetainedState(active, selected);
  }

  return {
    rows: view.rows,
    totalBytes: view.totalBytes,
    phase: view.phase,
    readySetId: view.readySetId,
    error: view.error,
    isBlockingStart: view.phase !== 'empty' && view.phase !== 'ready',
    selectFiles: (files) => replaceSelection([...files], projectId),
    retryPage,
    retrySet,
    removePage,
    reset,
    releaseAfterStart,
  };
}

function validateSelection(files: readonly File[], generation: number): {
  selected: SelectedFile[];
  view: UploadViewState;
} {
  if (files.length === 0) return { selected: [], view: EMPTY_VIEW };

  const errors = files.map(() => [] as string[]);
  const normalizedNames = files.map((file, index) => {
    const normalized = normalizeFileName(file.name, errors[index]);
    return normalized;
  });
  const totalBytes = files.reduce((total, file) => total + file.size, 0);

  if (files.length > MAX_FILES) {
    for (const rowErrors of errors) {
      rowErrors.push(`HTML knowledge supports at most ${MAX_FILES} files`);
    }
  }
  files.forEach((file, index) => {
    if (file.size > MAX_PAGE_BYTES) {
      errors[index].push('HTML page exceeds 512 KiB');
    }
  });
  if (totalBytes > MAX_TOTAL_BYTES) {
    for (const rowErrors of errors) {
      rowErrors.push('HTML knowledge selection exceeds 5 MiB');
    }
  }

  const indexesByName = new Map<string, number[]>();
  normalizedNames.forEach((name, index) => {
    if (!name) return;
    const indexes = indexesByName.get(name.key) ?? [];
    indexes.push(index);
    indexesByName.set(name.key, indexes);
  });
  for (const indexes of indexesByName.values()) {
    if (indexes.length < 2) continue;
    for (const index of indexes) errors[index].push('Duplicate HTML file name');
  }

  const isInvalid = errors.some((rowErrors) => rowErrors.length > 0);
  const selected = files.map((file, index): SelectedFile => ({
    localId: `local-${generation}-${index + 1}`,
    file,
    byteSize: file.size,
    displayName: normalizedNames[index]?.displayName ?? file.name,
    nameKey: normalizedNames[index]?.key ?? `invalid-${index}`,
  }));
  const rows = selected.map((item, index): HtmlKnowledgeUploadRow => ({
    pageId: item.localId,
    fileName: item.displayName,
    byteSize: item.byteSize,
    status: isInvalid ? 'FAILED' : 'PENDING',
    canRetry: false,
    errorMessage: isInvalid
      ? errors[index].join('; ') || 'Selection contains invalid HTML files'
      : null,
    pageTitle: null,
    informationLevel: null,
    warnings: [],
  }));

  return {
    selected,
    view: {
      rows,
      totalBytes,
      phase: isInvalid ? 'invalid' : 'preparing',
    },
  };
}

function normalizeFileName(
  fileName: string,
  errors: string[],
): { displayName: string; key: string } | undefined {
  let displayName: string;
  try {
    displayName = fileName.normalize('NFC');
  } catch {
    errors.push('HTML file name must not contain control characters');
    return undefined;
  }
  if (displayName.length === 0) errors.push('HTML file name is required');
  if (Array.from(displayName).length > MAX_FILE_NAME_CODE_POINTS) {
    errors.push('HTML file name exceeds 255 Unicode code points');
  }
  if (/[\\/]/u.test(displayName)) {
    errors.push('HTML file name must not contain path separators');
  }
  if (/\p{Cc}|\p{Cf}|\p{Cs}/u.test(displayName)) {
    errors.push('HTML file name must not contain control characters');
  }
  if (!/^.+\.html?$/iu.test(displayName)) {
    errors.push('HTML file name must end in .html or .htm');
  }
  return {
    displayName,
    key: displayName.toLocaleLowerCase('en-US'),
  };
}

function mapCreatedPages(
  selected: readonly SelectedFile[],
  created: HtmlKnowledgeSetDto,
): UploadEntry[] {
  if (created.pages.length !== selected.length) {
    throw new Error('HTML knowledge manifest response has the wrong page count');
  }
  const pagesByName = new Map<string, HtmlKnowledgePageDto>();
  for (const page of created.pages) {
    const key = page.fileName.normalize('NFC').toLocaleLowerCase('en-US');
    if (pagesByName.has(key)) {
      throw new Error('HTML knowledge manifest response contains duplicate page names');
    }
    pagesByName.set(key, page);
  }

  return selected.map((item): UploadEntry => {
    const page = pagesByName.get(item.nameKey);
    if (!page || page.expectedByteSize !== item.byteSize || !page.pageId) {
      throw new Error('HTML knowledge manifest response does not match the selected files');
    }
    return {
      selected: item,
      row: rowFromPage(page),
      removing: false,
    };
  });
}

function rowFromPage(page: HtmlKnowledgePageDto): HtmlKnowledgeUploadRow {
  return {
    pageId: page.pageId,
    fileName: page.fileName,
    byteSize: page.expectedByteSize,
    status: page.status,
    canRetry: page.status === 'FAILED',
    errorMessage: page.errorMessage,
    pageTitle: page.pageTitle,
    informationLevel: page.informationLevel,
    warnings: [...page.warnings],
  };
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
