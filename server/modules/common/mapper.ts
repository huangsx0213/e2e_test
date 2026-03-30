import type { TestStep } from '../../shared/contracts/index.ts';
import type { DbStepRow } from '../../shared/db/types.ts';
import { asId, asOptionalText, asText, textFromDb } from '../../shared/utils/index.ts';

export function normalizeStep(input: Partial<TestStep>): TestStep {
  return {
    id: asId(input.id, 'step'),
    action: asText(input.action, 'CLICK') as TestStep['action'],
    target: asText(input.target),
    data: asText(input.data),
    description: asText(input.description),
    headerProfileId: asOptionalText(input.headerProfileId),
    bodyTemplateId: asOptionalText(input.bodyTemplateId),
    endpointId: asOptionalText(input.endpointId),
    screenshot: typeof input.screenshot === 'boolean' ? input.screenshot : undefined,
  };
}

export function deserializeStep(row: DbStepRow): TestStep {
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
  };
}
