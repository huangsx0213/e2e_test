import type { TestStep } from '../../shared/contracts/index.ts';
import type { DbStepRow } from '../../shared/db/types.ts';
import { asId, asOptionalText, asText, textFromDb } from '../../shared/utils/index.ts';

export function normalizeStep(input: Partial<TestStep>): TestStep {
  return {
    id: asId(input.id, 'step'),
    action: asText(input.action, 'click') as TestStep['action'],
    target: asText(input.target),
    data: asText(input.data),
    description: asText(input.description),
    headerProfileId: asOptionalText(input.headerProfileId),
    bodyTemplateId: asOptionalText(input.bodyTemplateId),
    endpointId: asOptionalText(input.endpointId),
    screenshot: typeof input.screenshot === 'boolean' ? input.screenshot : undefined,
    enabled: typeof input.enabled === 'boolean' ? input.enabled : true,
    extractors: Array.isArray(input.extractors) ? input.extractors : undefined,
    assertions: Array.isArray(input.assertions) ? input.assertions : undefined,
    waitForNetwork: input.waitForNetwork,
    networkMocks: Array.isArray(input.networkMocks) ? input.networkMocks : undefined,
    failureStrategy: input.failureStrategy,
    metadata: {
      ...(typeof input.metadata === 'object' && input.metadata !== null ? input.metadata : {}),
      ...(input.failureStrategy != null ? { failureStrategy: input.failureStrategy } : {}),
    },
  };
}

export function deserializeStep(row: DbStepRow): TestStep {
  let extractors;
  let assertions;
  let waitForNetwork;
  let networkMocks;
  let metadata;
  
  try {
    if (row.extractors) extractors = JSON.parse(row.extractors);
    if (row.assertions) assertions = JSON.parse(row.assertions);
    if (row.wait_for_network) waitForNetwork = JSON.parse(row.wait_for_network);
    if (row.network_mocks) networkMocks = JSON.parse(row.network_mocks);
    if (row.metadata) metadata = JSON.parse(row.metadata);
  } catch (e) {
    console.error('Failed to parse step JSON fields', e);
  }

return {
    id: row.id,
    action: row.action as TestStep['action'],
    target: row.target,
    data: row.data,
    description: row.description,
    headerProfileId: textFromDb(row.header_profile_id),
    bodyTemplateId: textFromDb(row.body_template_id),
    endpointId: textFromDb(row.endpoint_id),
    screenshot: row.screenshot === 1,
    enabled: row.enabled !== 0,
    extractors,
    assertions,
    waitForNetwork,
    networkMocks,
    metadata,
    failureStrategy: (metadata as any)?.failureStrategy ?? undefined,
  };
}
