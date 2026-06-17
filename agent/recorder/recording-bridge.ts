/**
 * RecordingBridge — step+element 双发射桥接
 *
 * 把 AIRecordingSession 输出的 RecorderStepPayload 转为和人工录制完全一致的
 * WS 事件（step-recorded + element-recorded），确保 RecordingService 能正常处理。
 *
 * 逻辑从 RecordingManager.emitConsolidatedStep() (index.ts:245-304) 提取，
 * 最终应让 emitConsolidatedStep 也调用 bridgeConsolidatedStep，消除重复。
 */

import { locatorRefToLegacyDef, locatorRefToName } from './locator.ts';
import type { RecorderStepPayload, LocatorRef } from './protocol.ts';
import type { UIElement, TestStep } from '../../shared/contracts/index.ts';
import type { StepInfo, StepRecordedEvent, ElementRecordedEvent } from '../../shared/recording/protocol.ts';

/**
 * Bridge 回调必须发射完整的 StepRecordedEvent['data'] / ElementRecordedEvent['data']，
 * 因为这些数据会直接进入 WS RECORDING_EVENT 信封，由 ws-handlers.ts 的
 * registerRecordingWsHandlers() 路由到 RecordingService 处理。
 * RecordingService.handleStepRecorded 需要 { projectId, stepInfo, type, caseId, suiteId }，
 * RecordingService.handleElementRecorded 需要 { projectId, pageId?, element }。
 * 如果缺少 projectId，handleStepRecorded 会因 `if (!project || !stepInfo) return;` 静默丢弃。
 */
export interface BridgeCallbacks {
  emitStepRecorded: (data: StepRecordedEvent['data']) => void;
  emitElementRecorded: (data: ElementRecordedEvent['data']) => void;
}

export function bridgeConsolidatedStep(
  cleanStep: RecorderStepPayload,
  projectId: string,
  caseId: string,
  suiteId: string,
  callbacks: BridgeCallbacks,
): void {
  const locator = cleanStep.locator;
  const legacy = locator ? locatorRefToLegacyDef(locator) : undefined;
  const elementName = locator ? locatorRefToName(locator) : '';
  const dataValue = cleanStep.value || '';

  const stepRecord: TestStep = {
    id: `step-${Math.random().toString(36).slice(2, 10)}`,
    action: cleanStep.action,
    target: cleanStep.action === 'goto' ? (cleanStep.value || '') : elementName,
    data: dataValue,
    description: buildStepDescription(cleanStep.action, locator, dataValue),
    isVerified: true,
    metadata: {
      recorder: {
        locator,
        locatorCandidates: cleanStep.locatorCandidates,
        legacyLocator: legacy,
        framePath: cleanStep.metadata?.framePath as string[] || [],
        pageUrl: cleanStep.pageUrl,
        timestamp: cleanStep.timestamp,
      },
    },
  };

  const uiElement: UIElement | undefined = locator && legacy ? {
    ...legacy,
    id: `el-${Math.random().toString(36).slice(2, 10)}`,
    name: elementName,
    pageUrl: cleanStep.pageUrl,
    metadata: stepRecord.metadata,
  } : undefined;

  // 和人工录制一致：每次 consolidated step 同时发射 step + element
  // 发射完整的 StepRecordedEvent['data']，包含 projectId/type/caseId/suiteId
  callbacks.emitStepRecorded({
    projectId,
    stepInfo: {
      action: cleanStep.action,
      element: uiElement,
      dataValue,
      step: stepRecord,
    },
    type: 'UI',
    caseId,
    suiteId,
  });

  if (locator && legacy) {
    // 发射完整的 ElementRecordedEvent['data']，包含 projectId
    callbacks.emitElementRecorded({
      projectId,
      element: {
        id: `el-${Math.random().toString(36).slice(2, 10)}`,
        name: elementName,
        selectorType: legacy.selectorType,
        value: legacy.value,
        description: elementName,
        pageUrl: cleanStep.pageUrl,
        locators: [legacy],
        metadata: {
          recorder: {
            locator,
            framePath: cleanStep.metadata?.framePath as string[] || [],
          },
        },
      },
      caseId,
      suiteId,
    });
  }
}

export function buildStepDescription(action: string, locator?: LocatorRef, value?: string): string {
  if (action === 'goto') return `Navigate to ${value || 'URL'}`;
  const name = locatorRefToName(locator) || 'unknown element';
  switch (action) {
    case 'click': return `Click on ${name}`;
    case 'dblclick': return `Double click on ${name}`;
    case 'fill': return `Type "${value}" into ${name}`;
    case 'press': return `Press ${value} key on ${name}`;
    case 'selectOption': return `Select "${value}" in ${name}`;
    case 'check': return `Check ${name}`;
    case 'uncheck': return `Uncheck ${name}`;
    case 'hover': return `Hover over ${name}`;
    case 'dragTo': return `Drag ${name} to destination`;
    case 'setInputFiles': return `Upload file(s) to ${name}: ${value}`;
    default: return value ? `${action} on ${name}: ${value}` : `${action} on ${name}`;
  }
}
