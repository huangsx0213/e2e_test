import type { BodyTemplate } from '../../shared/contracts/index.ts';
import { asId, asOptionalText, asText, normalizeStringRecord } from '../../shared/utils/index.ts';

export function normalizeBodyTemplate(input: Partial<BodyTemplate>): BodyTemplate {
  return {
    id: asId(input.id, 'body'),
    projectId: asOptionalText(input.projectId),
    name: asText(input.name, 'New Body Template'),
    description: asText(input.description),
    contentType: asText(input.contentType, 'application/json') as BodyTemplate['contentType'],
    content: asText(input.content),
    defaultValues: normalizeStringRecord(input.defaultValues),
  };
}
