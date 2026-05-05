/*
 * 录制模块共享协议
 * 定义录制事件、状态、payload 类型，供 client/server/agent 三端共用
 */

import type { TestStep, UIElement, HeaderProfile, BodyTemplate, ApiEndpoint } from '../contracts/index.ts';

export type RecorderMode = 'ui' | 'api' | 'all';

/**
 * 录制生命周期状态枚举
 */
export type RecorderLifecycleStatus =
  | 'RECEIVED'   // 服务端已收到录制请求
  | 'STARTED'    // 录制已开始
  | 'STOPPED'    // 录制已停止
  | 'FAILED';    // 录制启动失败

export interface ApiRecordedInfo {
  url: string;
  method: string;
  headers: Record<string, string>;
  postData?: string | null;
  status: number;
  projectId?: string;
}

/**
 * 录制事件信封
 * 所有录制事件都通过 RECORDING_EVENT 发送，内层 event 区分具体事件类型
 */
export interface RecordingEnvelope {
  event: string;
  data: RecordingEvent['data'] & { agentId?: string };
}

/**
 * 录制状态变更事件
 */
export interface RecorderStateChangedEvent {
  event: 'recorder-state-changed';
  data: {
    status: RecorderLifecycleStatus;
    caseId?: string;
    suiteId?: string;
    mode?: RecorderMode;
    message?: string;
  };
}

export interface StepInfo {
  action: string;
  element?: UIElement;
  dataValue?: string;
  step?: TestStep;
}

/**
 * UI 步骤录制事件
 */
export interface StepRecordedEvent {
  event: 'step-recorded';
  data: {
    projectId: string;
    stepInfo: StepInfo;
    type: 'UI' | 'API';
    caseId?: string;
    suiteId?: string;
  };
}

/**
 * 元素录制事件
 */
export interface ElementRecordedEvent {
  event: 'element-recorded';
  data: {
    projectId: string;
    pageId?: string;
    element: UIElement;
    caseId?: string;
    suiteId?: string;
  };
}

/**
 * API 录制事件
 */
export interface ApiRecordedEvent {
  event: 'api-recorded';
  data: {
    projectId: string;
    environment?: string;
    pageId?: string;
    apiInfo: ApiRecordedInfo;
    caseId?: string;
    suiteId?: string;
  };
}

/**
 * 录制事件联合类型
 */
export type RecordingEvent =
  | RecorderStateChangedEvent
  | StepRecordedEvent
  | ElementRecordedEvent
  | ApiRecordedEvent;

/**
 * 录制事件名称常量
 */
export const RECORDING_EVENT = 'RECORDING_EVENT';
export const STEP_RECORDED_EVENT = 'step-recorded';
export const ELEMENT_RECORDED_EVENT = 'element-recorded';
export const API_RECORDED_EVENT = 'api-recorded';
export const RECORDER_STATE_CHANGED_EVENT = 'recorder-state-changed';