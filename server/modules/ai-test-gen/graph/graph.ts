import { StateGraph, START, END, type BaseCheckpointSaver } from '@langchain/langgraph';
import type { AIProvider } from '../../../../shared/ai/provider.ts';
import { TestGenStateAnnotation, type TestGenState } from './state.ts';
import {
  makePreparationNode,
  makeAnalystNode,
  makeDesignerNode,
  makeQualityNode,
  makeCheckpoint,
  makeCompleteNode,
} from './nodes/index.ts';
import type { AgentObserver } from './nodes/types.ts';
import { ANALYST_SKILLS, DESIGNER_SKILLS, QUALITY_SKILLS } from './skills.ts';

export interface BuildGraphOptions {
  provider: AIProvider;
  observer?: AgentObserver;
  modelName?: string;
  tokenLimit?: number | null;
  timeoutMs?: number;
  useCache?: boolean;
  signal?: AbortSignal;
  checkpointer?: BaseCheckpointSaver;
}

export function buildTestGenGraph(opts: BuildGraphOptions) {
  const { observer, timeoutMs = 300_000, signal, checkpointer } = opts;

  // 创建 ChatModel 实例
  // 实际使用时应根据 provider.type 创建对应的 ChatModel
  // 这里提供接口，由上层注入 model
  console.log(`[test-gen:graph] building LangGraph state graph with 8 nodes...`);

  // 创建各节点
  const preparationNode = makePreparationNode({ observer });
  const analystNode = makeAnalystNode({
    provider: opts.provider,
    observer,
    skills: ANALYST_SKILLS,
    timeoutMs,
    signal,
  });
  const designerNode = makeDesignerNode({
    provider: opts.provider,
    observer,
    skills: DESIGNER_SKILLS,
    timeoutMs,
    signal,
  });
  const qualityNode = makeQualityNode({
    provider: opts.provider,
    observer,
    skills: QUALITY_SKILLS,
    timeoutMs,
    signal,
  });
  const checkpoint1 = makeCheckpoint(1);
  const checkpoint2 = makeCheckpoint(2);
  const checkpoint3 = makeCheckpoint(3);
  const completeNode = makeCompleteNode({ observer });

  const graph = new StateGraph(TestGenStateAnnotation)
    .addNode('preparation', preparationNode)
    .addNode('analyst', analystNode)
    .addNode('checkpoint_1', checkpoint1, { ends: ['analyst', 'designer'] })
    .addNode('designer', designerNode)
    .addNode('checkpoint_2', checkpoint2, { ends: ['designer', 'quality'] })
    .addNode('quality', qualityNode)
    .addNode('checkpoint_3', checkpoint3, { ends: ['quality', 'complete'] })
    .addNode('complete', completeNode);

  graph.addEdge(START, 'preparation');
  graph.addEdge('preparation', 'analyst');
  graph.addEdge('analyst', 'checkpoint_1');
  graph.addEdge('designer', 'checkpoint_2');
  graph.addEdge('quality', 'checkpoint_3');
  graph.addEdge('complete', END);

  console.log(`[test-gen:graph] compiling graph${checkpointer ? ' with checkpointer' : ''}...`);
  const compiled = graph.compile({ checkpointer });
  console.log(`[test-gen:graph] graph compiled`);

  return compiled;
}

export type CompiledTestGenGraph = ReturnType<typeof buildTestGenGraph>;
export { type TestGenState };