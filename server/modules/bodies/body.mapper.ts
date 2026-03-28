import type { BodyTemplate } from '../../../client/types';
import { asId, asOptionalText, asText, normalizeStringRecord } from '../../utils.ts';

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
