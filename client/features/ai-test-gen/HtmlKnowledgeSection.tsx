import { useEffect, useId, useRef } from 'react';
import {
  AlertCircle,
  CheckCircle2,
  Clock3,
  FileUp,
  LoaderCircle,
  RefreshCw,
  Trash2,
  TriangleAlert,
} from 'lucide-react';

import type {
  HtmlKnowledgeUploadController,
  HtmlKnowledgeUploadRowStatus,
} from './useHtmlKnowledgeUpload';

interface HtmlKnowledgeSectionProps {
  controller: HtmlKnowledgeUploadController;
  disabled?: boolean;
}

const MAX_VISIBLE_ROWS = 20;
const MAX_VISIBLE_WARNINGS = 20;
const MAX_ERROR_CHARS = 500;
const MAX_WARNING_CHARS = 200;

const statusStyles: Record<HtmlKnowledgeUploadRowStatus, string> = {
  PENDING: 'text-slate-600 bg-slate-100',
  UPLOADING: 'text-blue-700 bg-blue-50',
  READY: 'text-emerald-700 bg-emerald-50',
  FAILED: 'text-red-700 bg-red-50',
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    const kibibytes = bytes / 1024;
    return `${Number.isInteger(kibibytes) ? kibibytes : kibibytes.toFixed(1)} KiB`;
  }
  const mebibytes = bytes / (1024 * 1024);
  return `${Number.isInteger(mebibytes) ? mebibytes : mebibytes.toFixed(1)} MiB`;
}

function boundText(message: string, maxChars: number): string {
  const characters = Array.from(message);
  return characters.length <= maxChars
    ? message
    : `${characters.slice(0, maxChars - 3).join('')}...`;
}

function StatusIcon({ status }: { status: HtmlKnowledgeUploadRowStatus }) {
  const props = { size: 12, 'aria-hidden': true } as const;
  if (status === 'UPLOADING') return <LoaderCircle {...props} className="animate-spin" />;
  if (status === 'READY') return <CheckCircle2 {...props} />;
  if (status === 'FAILED') return <AlertCircle {...props} />;
  return <Clock3 {...props} />;
}

const phaseLabels: Record<HtmlKnowledgeUploadController['phase'], string> = {
  empty: 'No HTML selected',
  invalid: 'HTML selection is invalid',
  preparing: 'Preparing HTML knowledge',
  ready: 'HTML knowledge ready',
  failed: 'HTML knowledge needs attention',
};

export function HtmlKnowledgeSection({
  controller,
  disabled = false,
}: HtmlKnowledgeSectionProps) {
  const inputId = useId();
  const pickerRef = useRef<HTMLInputElement>(null);
  const statusRefs = useRef(new Map<string, HTMLSpanElement>());
  const removeRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusedActionRef = useRef<{ pageId: string; action: 'retry' | 'remove' } | null>(null);
  const previousRowsRef = useRef(controller.rows);
  const visibleRows = controller.rows.slice(0, MAX_VISIBLE_ROWS);
  const pendingCount = controller.rows.filter((row) => row.status === 'PENDING').length;
  const uploadingCount = controller.rows.filter((row) => row.status === 'UPLOADING').length;
  const readyCount = controller.rows.filter((row) => row.status === 'READY').length;
  const failedCount = controller.rows.filter((row) => row.status === 'FAILED').length;
  const lowInformationCount = controller.rows.filter(
    (row) => row.informationLevel === 'LOW_INFORMATION',
  ).length;
  const isPreparing = controller.phase === 'preparing';
  const progressSummary = `HTML knowledge phase: ${controller.phase}. ${pendingCount} pending, ${uploadingCount} uploading, ${readyCount} ready, ${failedCount} failed, ${lowInformationCount} low information.`;

  useEffect(() => {
    const previousRows = previousRowsRef.current;
    previousRowsRef.current = controller.rows;
    const focusedAction = focusedActionRef.current;
    if (!focusedAction) return;

    const previousIndex = previousRows.findIndex((row) => row.pageId === focusedAction.pageId);
    if (previousIndex < 0) return;
    const previousRow = previousRows[previousIndex];
    const currentRow = controller.rows.find((row) => row.pageId === focusedAction.pageId);

    if (currentRow) {
      if (
        focusedAction.action === 'retry'
        && previousRow.status !== 'READY'
        && currentRow.status === 'READY'
      ) {
        statusRefs.current.get(currentRow.pageId)?.focus();
        focusedActionRef.current = null;
      }
      return;
    }

    const adjacentRow = controller.rows[previousIndex] ?? controller.rows[previousIndex - 1];
    if (adjacentRow) {
      removeRefs.current.get(adjacentRow.pageId)?.focus();
      focusedActionRef.current = { pageId: adjacentRow.pageId, action: 'remove' };
    } else {
      pickerRef.current?.focus();
      focusedActionRef.current = null;
    }
  }, [controller.rows]);

  const rememberFocusedAction = (pageId: string, action: 'retry' | 'remove') => {
    focusedActionRef.current = { pageId, action };
  };

  const forgetFocusedAction = (relatedTarget: EventTarget | null) => {
    if (relatedTarget) focusedActionRef.current = null;
  };

  return (
    <section className="space-y-3 pt-2 border-t border-slate-100" aria-labelledby={`${inputId}-heading`}>
      <div className="flex items-center justify-between gap-3">
        <h4
          id={`${inputId}-heading`}
          className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider"
        >
          HTML Knowledge
        </h4>
        <span className="text-[10px] font-medium text-slate-600 uppercase tracking-wide">
          Optional
        </span>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium text-slate-700">Attach page HTML</p>
            <p className="text-[11px] text-slate-600 mt-0.5">Up to 20 .html or .htm files</p>
          </div>
          <label
            htmlFor={inputId}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-200 px-2.5 py-1.5 text-[11px] font-medium text-slate-600 transition-colors has-[:focus-visible]:outline-none has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-blue-600 has-[:focus-visible]:ring-offset-2 ${
              disabled
                ? 'cursor-not-allowed bg-slate-100 opacity-60'
                : 'cursor-pointer bg-white hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <input
              ref={pickerRef}
              id={inputId}
              className="sr-only"
              type="file"
              multiple
              accept=".html,.htm,text/html"
              disabled={disabled}
              onChange={(event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                event.currentTarget.value = '';
                if (disabled) return;
                void controller.selectFiles(files);
              }}
            />
            <FileUp size={13} aria-hidden="true" />
            Choose HTML files
          </label>
        </div>

        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          aria-busy={isPreparing}
          className="text-[11px] text-slate-600"
        >
          <span className="sr-only">{progressSummary}</span>
          <div className="flex items-center justify-between gap-2" aria-hidden="true">
            <div className="flex items-center gap-2">
              <span>{controller.rows.length} {controller.rows.length === 1 ? 'file' : 'files'}</span>
              <span>/</span>
              <span>{formatBytes(controller.totalBytes)}</span>
            </div>
            <span className={`inline-flex items-center gap-1 font-medium ${
              isPreparing ? 'text-blue-700' : 'text-slate-600'
            }`}>
              {isPreparing && <LoaderCircle size={11} className="animate-spin" />}
              {phaseLabels[controller.phase]}
            </span>
          </div>
        </div>

        {controller.phase === 'invalid' && (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11px] leading-4 text-amber-800">
            Validation errors cannot be retried. Remove invalid files or choose a new valid selection.
          </p>
        )}

        {controller.error && (
          <div
            role="alert"
            aria-label="HTML knowledge set error"
            className="rounded-md border border-red-200 bg-red-50 px-2.5 py-2"
          >
            <p className="break-words text-[11px] leading-4 text-red-700">
              {boundText(controller.error, MAX_ERROR_CHARS)}
            </p>
            <button
              type="button"
              aria-label="Retry HTML knowledge set"
              disabled={disabled}
              onClick={() => void controller.retrySet()}
              className="mt-1.5 inline-flex items-center gap-1 rounded text-[11px] font-medium text-red-700 hover:text-red-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <RefreshCw size={11} aria-hidden="true" />
              Retry set
            </button>
          </div>
        )}

        {visibleRows.length > 0 && (
          <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto border-y border-slate-100">
            {visibleRows.map((row) => (
              <li key={row.pageId} className="py-2 first:pt-2 last:pb-2">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[11px] font-medium text-slate-700" title={row.fileName}>
                        {row.fileName}
                      </span>
                      <span className="shrink-0 text-[10px] text-slate-600">
                        {formatBytes(row.byteSize)}
                      </span>
                    </div>
                    <span
                      ref={(element) => {
                        if (element) statusRefs.current.set(row.pageId, element);
                        else statusRefs.current.delete(row.pageId);
                      }}
                      tabIndex={-1}
                      aria-label={`${row.fileName} status ${row.status}`}
                      className={`mt-1 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 ${statusStyles[row.status]}`}
                    >
                      <StatusIcon status={row.status} />
                      {row.status}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {row.canRetry && (
                      <button
                        type="button"
                        aria-label={`Retry ${row.fileName}`}
                        disabled={disabled}
                        aria-disabled={disabled || row.status === 'UPLOADING'}
                        onFocus={() => rememberFocusedAction(row.pageId, 'retry')}
                        onBlur={(event) => forgetFocusedAction(event.relatedTarget)}
                        onClick={() => {
                          if (disabled || row.status === 'UPLOADING') return;
                          void controller.retryPage(row.pageId);
                        }}
                        className="rounded p-1 text-slate-600 transition-colors hover:bg-blue-50 hover:text-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
                      >
                        <RefreshCw size={12} aria-hidden="true" />
                      </button>
                    )}
                    <button
                      ref={(element) => {
                        if (element) removeRefs.current.set(row.pageId, element);
                        else removeRefs.current.delete(row.pageId);
                      }}
                      type="button"
                      aria-label={`Remove ${row.fileName}`}
                      disabled={disabled}
                      onFocus={() => rememberFocusedAction(row.pageId, 'remove')}
                      onBlur={(event) => forgetFocusedAction(event.relatedTarget)}
                      onClick={() => void controller.removePage(row.pageId)}
                      className="rounded p-1 text-slate-600 transition-colors hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Trash2 size={12} aria-hidden="true" />
                    </button>
                  </div>
                </div>

                {(row.informationLevel === 'LOW_INFORMATION' || row.warnings.length > 0) && (
                  <div
                    aria-label={row.warnings.length > 0 ? `Warnings for ${row.fileName}` : undefined}
                    className="mt-1.5 flex items-start gap-1 text-[10px] leading-4 text-amber-700"
                  >
                    <TriangleAlert size={11} className="mt-0.5 shrink-0" aria-hidden="true" />
                    <div>
                      {row.informationLevel === 'LOW_INFORMATION' && (
                        <p className="font-medium">Low information. A rendered DOM snapshot may provide better knowledge.</p>
                      )}
                      {row.warnings.length > 0 && (
                        <ul>
                          {row.warnings.slice(0, MAX_VISIBLE_WARNINGS).map((warning, index) => (
                            <li key={`${row.pageId}-warning-${index}`} className="break-words">
                              {boundText(warning, MAX_WARNING_CHARS)}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
                {row.errorMessage && (
                  <p
                    role="alert"
                    aria-label={`Error for ${row.fileName}`}
                    className="mt-1.5 break-words text-[10px] leading-4 text-red-600"
                  >
                    {boundText(row.errorMessage, MAX_ERROR_CHARS)}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="space-y-1 border-t border-slate-100 pt-2 text-[10px] leading-4 text-slate-600">
          <p>Relevant HTML excerpts may be sent to the configured AI provider.</p>
          <p>Scripts are not executed and linked resources are not fetched.</p>
        </div>
      </div>
    </section>
  );
}
