import {
  RECORDER_STATE_CHANGED_EVENT,
  STEP_RECORDED_EVENT,
  ELEMENT_RECORDED_EVENT,
  API_RECORDED_EVENT,
  AI_RECORDER_START_EVENT,
  AI_RECORDER_STOP_EVENT,
  AI_RECORDER_TAKEOVER_COMPLETE_EVENT,
  AI_RECORDER_PROVIDER_CONFIG_REQUEST_EVENT,
  AI_RECORDER_PROVIDER_CONFIG_RESPONSE_EVENT,
  AI_RECORDER_COMPLETE_EVENT,
} from 'shared/recording/protocol';
import type { StepInfo, ApiRecordedInfo, ApiFilterConfig, DecryptedProviderConfig } from 'shared/recording/protocol';
import type { UIElement } from 'shared/contracts';
import type { RecorderState } from './recorder/protocol.ts';
import {
  startRecording as recorderV2StartRecording,
  stopRecording as recorderV2StopRecording,
} from './recorder/index.ts';
import { AIRecordingSession, SessionAbortedError } from './recorder/ai-recording-session.ts';
import { bridgeConsolidatedStep } from './recorder/recording-bridge.ts';
import { extractSecretValues } from './recorder/refiner.ts';

type SendMsg = (event: string, data: any) => void;
type RecordingLogger = Pick<Console, 'info' | 'error' | 'warn'>;

/**
 * WS 事件订阅能力。Agent 端通过此接口订阅 AI_RECORDER_PROVIDER_CONFIG_RESPONSE
 * 等双向通信事件。index.ts 负责把底层 ws.on('message') 路由到这里。
 */
export interface WsEventSubscription {
  onWsEvent: (event: string, handler: (data: any) => void) => void;
  offWsEvent: (event: string, handler: (data: any) => void) => void;
}

interface RecordingControlDeps {
  agentId: string;
  logger: RecordingLogger;
  sendMsg: SendMsg;
  emitRecordingEvent: (event: string, data: any) => void;
  resetAfterStop: () => void;
  setAgentStatus: (status: 'idle' | 'busy') => void;
  setIsRecordingActive: (value: boolean) => void;
  /** WS 事件订阅能力，AI 录制需要通过 WS 双向通信获取 providerConfig */
  wsEvents?: WsEventSubscription;
}

// === AI 录制状态（模块级，跨消息保持） ===
// takeover 回调表：runId → { resolve, clearTimeout }
// 当 AI_RECORDER_TAKEOVER_COMPLETE 到达时，唤醒等待中的 executeNlStep
interface TakeoverCallback {
  resolve: (value: boolean) => void;
  clearTimeout: () => void;
}
const takeoverCallbacks = new Map<string, TakeoverCallback>();

// 当前活跃的 AI 录制 session（用于 AI_RECORDER_STOP 中止）
let currentAiSession: AbortController | null = null;

/**
 * 通过 WS 双向通信获取解密后的 providerConfig。
 *
 * 流程：
 *   1. Agent 发送 AI_RECORDER_PROVIDER_CONFIG_REQUEST
 *   2. Server 解密后通过 AI_RECORDER_PROVIDER_CONFIG_RESPONSE 回传
 *   3. 按 runId + providerConfigId 路由响应
 *
 * 设计要点：API key 不落盘、不缓存，每次 run 实时获取，run 结束后立即释放。
 * 全程走 WS，避免"Agent 无 HTTP 能力"与"Agent 回调 HTTP 接口"的矛盾。
 */
async function fetchProviderConfigViaWs(
  deps: RecordingControlDeps,
  runId: string,
  providerConfigId: string,
): Promise<DecryptedProviderConfig> {
  if (!deps.wsEvents) {
    throw new Error('WS event subscription not available (deps.wsEvents missing)');
  }

  return new Promise<DecryptedProviderConfig>((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Provider config request timeout'));
    }, 10_000);

    const onResponse = (data: any) => {
      // 按 runId + providerConfigId 路由响应，避免并发 run 串扰
      if (data?.runId !== runId) return;
      if (data?.providerConfigId !== providerConfigId) return;
      cleanup();
      resolve(data.providerConfig as DecryptedProviderConfig);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      deps.wsEvents!.offWsEvent(AI_RECORDER_PROVIDER_CONFIG_RESPONSE_EVENT, onResponse);
    };

    deps.wsEvents.onWsEvent(AI_RECORDER_PROVIDER_CONFIG_RESPONSE_EVENT, onResponse);
    // 必须用 emitRecordingEvent 包装成 RECORDING_EVENT 信封，
    // 否则 Server 的 ws-relay（监听 RECORDING_EVENT）收不到此 REQUEST。
    deps.emitRecordingEvent(AI_RECORDER_PROVIDER_CONFIG_REQUEST_EVENT, { runId, providerConfigId });
  });
}

export async function handleRecordingControlMessage(parsed: any, deps: RecordingControlDeps): Promise<boolean> {
  if (parsed.event === 'RECORDING_START') {
    const { targetUrl, projectId, apiFilter, apiFilterConfig, environment, caseId, suiteId, mode } = parsed.data || {};
    deps.logger.info(`[AGENT] Received Recording Start: ${projectId} case=${caseId}`);

    try {
      deps.setIsRecordingActive(true);
      deps.setAgentStatus('busy');
      deps.sendMsg('AGENT_HEARTBEAT', { agentId: deps.agentId, status: 'busy' });
      deps.emitRecordingEvent(RECORDER_STATE_CHANGED_EVENT, { status: 'RECEIVED', caseId, suiteId, mode });

      await recorderV2StartRecording(
        targetUrl,
        projectId,
        apiFilterConfig || apiFilter,
        (element: UIElement) => {
          deps.emitRecordingEvent(ELEMENT_RECORDED_EVENT, { projectId, element, caseId, suiteId });
        },
        (stepInfo: StepInfo) => {
          deps.emitRecordingEvent(STEP_RECORDED_EVENT, { projectId, stepInfo, type: 'UI', caseId, suiteId });
        },
        (apiInfo: ApiRecordedInfo) => {
          deps.emitRecordingEvent(API_RECORDED_EVENT, { projectId, environment, apiInfo, caseId, suiteId });
        },
        (state: RecorderState) => {
          deps.emitRecordingEvent(RECORDER_STATE_CHANGED_EVENT, { state, caseId, suiteId });
          if (state.action === 'STOP') {
            deps.resetAfterStop();
          }
        },
        mode,
      );

      return true;
    } catch (error) {
      deps.logger.error('[AGENT] Failed to start recording:', error);
      deps.setIsRecordingActive(false);
      deps.setAgentStatus('idle');
      deps.sendMsg('AGENT_HEARTBEAT', { agentId: deps.agentId, status: 'idle' });
      deps.emitRecordingEvent(RECORDER_STATE_CHANGED_EVENT, {
        status: 'FAILED',
        message: error instanceof Error ? error.message : String(error),
        mode,
      });
      return true;
    }
  }

  if (parsed.event === 'RECORDING_STOP') {
    deps.logger.info('[AGENT] Received Recording Stop');

    try {
      await recorderV2StopRecording();
    } finally {
      deps.resetAfterStop();
    }

    return true;
  }

  // === AI 驱动录制事件（与 RECORDING_START/STOP 平级，独立 WS 事件类型） ===

  if (parsed.event === AI_RECORDER_START_EVENT) {
    const { runId, projectId, nlCase, providerConfigId, model, options, caseId, suiteId, startUrl } = parsed.data || {};
    deps.logger.info(`[AGENT] Received AI Recorder Start: run=${runId} nlCase=${nlCase?.id} model=${model}`);

    try {
      deps.setIsRecordingActive(true);
      deps.setAgentStatus('busy');
      deps.sendMsg('AGENT_HEARTBEAT', { agentId: deps.agentId, status: 'busy' });

      // AbortController 必须先于 provider-config 请求创建并注册到 currentAiSession：
      // 否则 STOP 在 fetch 挂起期间到达会被静默丢弃（currentAiSession 仍为 null），
      // 响应返回后浏览器照常启动。
      const controller = new AbortController();
      currentAiSession = controller;

      // 1. 通过 WS 双向通信获取解密后的 providerConfig（API key 不落盘）
      const providerConfig = await fetchProviderConfigViaWs(deps, runId, providerConfigId);

      // 如果前端指定了 model，覆盖 providerConfig 的默认模型。
      // Azure 路径下 buildStagehandModelName 优先取 deployment，
      // 因此覆盖时必须同步 deployment，否则 UI 选择的模型会被无视。
      if (model) {
        providerConfig.model = model;
        if (providerConfig.type === 'azure-openai') {
          providerConfig.deployment = model;
        }
      }

      // STOP 可能落在 fetch 窗口内；此时不得启动浏览器，直接以用户中止终态收尾
      if (controller.signal.aborted) throw new SessionAbortedError();

      // 2. 初始化 AIRecordingSession + RecordingBridge
      const session = new AIRecordingSession();

      // live consolidated step 会立即被 Server 持久化，发射前需按与 refiner
      // 同一份 secrets（同规则同来源）脱敏，避免明文密码/token 落库
      const secrets = extractSecretValues(nlCase.testData);

      // 3. 执行 AI 录制
      //    onConsolidatedStep 通过 bridge 发射 step-recorded + element-recorded
      //    onEvent 发射 step:start/complete/failed/takeover 等进度事件
      const result = await session.start({
        nlCase,
        providerConfig,
        options,
        signal: controller.signal,
        ...(startUrl ? { startUrl } : {}),
        onConsolidatedStep: (step) => {
          bridgeConsolidatedStep(step, projectId, caseId, suiteId, {
            secrets,
            emitStepRecorded: (stepEventData) => {
              deps.emitRecordingEvent(STEP_RECORDED_EVENT, stepEventData);
            },
            emitElementRecorded: (elementEventData) => {
              deps.emitRecordingEvent(ELEMENT_RECORDED_EVENT, elementEventData);
            },
          });
        },
        onEvent: (event, data) => {
          // 进度事件附带 runId/caseId/suiteId，便于 Server 侧 SSE 桥接
          deps.emitRecordingEvent(event, { ...data, runId, caseId, suiteId });
        },
        onTakeoverRequest: async (_nlStepIndex, _instruction) => {
          // step:takeover 事件已由 executeNlStep 内部 emit，此处仅等待
          // AI_RECORDER_TAKEOVER_COMPLETE 或超时（120s）
          // Server 收到 step:takeover 后通过 SSE 推送给前端，前端引导用户手动操作
          return new Promise<boolean>((resolve) => {
            const timeout = setTimeout(() => {
              // 超时路径同样清理，避免 takeoverCallbacks Map 泄漏
              takeoverCallbacks.delete(runId);
              resolve(false);
            }, 120_000);
            takeoverCallbacks.set(runId, {
              resolve,
              clearTimeout: () => clearTimeout(timeout),
            });
          });
        },
      });

      // 4. 上报完成（refinedSteps 为 Server 落库契约字段，见 ws-relay.handleAiRecorderComplete）
      deps.emitRecordingEvent(AI_RECORDER_COMPLETE_EVENT, {
        runId,
        result: {
          refinedSteps: result.steps,
          stepBoundaries: result.stepBoundaries,
          replayCandidateSuite: result.replayCandidateSuite,
          replayReport: result.replayReport,
        },
        caseId,
        suiteId,
      });
      return true;
    } catch (error) {
      const aborted = error instanceof SessionAbortedError;
      // 用户主动中止是正常终态，不打错误日志
      if (!aborted) deps.logger.error('[AGENT] AI Recorder failed:', error);
      deps.emitRecordingEvent(AI_RECORDER_COMPLETE_EVENT, {
        runId,
        error: aborted
          ? 'Recording aborted by user'
          : (error instanceof Error ? error.message : String(error)),
        caseId,
        suiteId,
      });
      return true;
    } finally {
      currentAiSession = null;
      deps.resetAfterStop();
    }
  }

  if (parsed.event === AI_RECORDER_STOP_EVENT) {
    const { runId } = parsed.data || {};
    deps.logger.info(`[AGENT] Received AI Recorder Stop: run=${runId}`);
    // 仅触发中止；状态复位统一由 START 处理器的 finally 负责，
    // 避免 session 仍在收尾时 Agent 就被标记 idle。
    currentAiSession?.abort();
    const cb = takeoverCallbacks.get(runId);
    if (cb) {
      cb.clearTimeout();
      cb.resolve(false);
      takeoverCallbacks.delete(runId);
    }
    return true;
  }

  if (parsed.event === AI_RECORDER_TAKEOVER_COMPLETE_EVENT) {
    const { runId } = parsed.data || {};
    deps.logger.info(`[AGENT] Received AI Recorder Takeover Complete: run=${runId}`);
    const cb = takeoverCallbacks.get(runId);
    if (cb) {
      cb.clearTimeout();
      cb.resolve(true);
      takeoverCallbacks.delete(runId);
    }
    return true;
  }

  return false;
}