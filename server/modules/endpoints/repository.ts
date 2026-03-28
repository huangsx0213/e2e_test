import type { ApiEndpoint } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import type {
  DbEndpointBaseUrlRow,
  DbEndpointParameterRow,
  DbEndpointRow,
} from '../../shared/db/types.ts';
import { nullableText, textFromDb } from '../../shared/utils/index.ts';
import { normalizeApiEndpoint } from './mapper.ts';

export function saveApiEndpoint(endpointInput: Partial<ApiEndpoint>): ApiEndpoint {
  const endpoint = normalizeApiEndpoint(endpointInput);

  const transaction = db.transaction(() => {
    db.prepare(
      `
        INSERT INTO endpoints (id, project_id, name, description, method)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          project_id = excluded.project_id,
          name = excluded.name,
          description = excluded.description,
          method = excluded.method
      `,
    ).run(
      endpoint.id,
      nullableText(endpoint.projectId),
      endpoint.name,
      endpoint.description || '',
      nullableText(endpoint.method),
    );

    db.prepare('DELETE FROM endpoint_base_urls WHERE endpoint_id = ?').run(endpoint.id);
    db.prepare('DELETE FROM endpoint_parameters WHERE endpoint_id = ?').run(endpoint.id);

    for (const [index, [environment, url]] of Object.entries(endpoint.baseUrls).entries()) {
      db.prepare(
        `
          INSERT INTO endpoint_base_urls (endpoint_id, environment, url, position)
          VALUES (?, ?, ?, ?)
        `,
      ).run(endpoint.id, environment, url, index);
    }

    for (const [index, parameter] of (endpoint.parameters || []).entries()) {
      db.prepare(
        `
          INSERT INTO endpoint_parameters (endpoint_id, item_key, item_value, enabled, position)
          VALUES (?, ?, ?, ?, ?)
        `,
      ).run(
        endpoint.id,
        parameter.key,
        parameter.value,
        parameter.enabled ? 1 : 0,
        index,
      );
    }
  });

  transaction();
  return getApiEndpoint(endpoint.id) || endpoint;
}

export function getApiEndpoint(endpointId: string): ApiEndpoint | undefined {
  const base = db
    .prepare('SELECT id, project_id, name, description, method FROM endpoints WHERE id = ?')
    .get(endpointId) as DbEndpointRow | undefined;

  if (!base) {
    return undefined;
  }

  const baseUrls = db.prepare(
    `
      SELECT environment, url
      FROM endpoint_base_urls
      WHERE endpoint_id = ?
      ORDER BY position
    `,
  ).all(endpointId) as DbEndpointBaseUrlRow[];

  const parameters = db.prepare(
    `
      SELECT item_key, item_value, enabled
      FROM endpoint_parameters
      WHERE endpoint_id = ?
      ORDER BY position
    `,
  ).all(endpointId) as DbEndpointParameterRow[];

  return {
    id: base.id,
    projectId: textFromDb(base.project_id),
    name: base.name,
    description: base.description,
    method: textFromDb(base.method) as ApiEndpoint['method'],
    baseUrls: Object.fromEntries(baseUrls.map((item) => [item.environment, item.url])),
    parameters: parameters.map((parameter) => ({
      key: parameter.item_key,
      value: parameter.item_value,
      enabled: Boolean(parameter.enabled),
    })),
  };
}

export function listApiEndpoints(): ApiEndpoint[] {
  const rows = db.prepare('SELECT id FROM endpoints ORDER BY rowid').all() as Array<{
    id: string;
  }>;

  return rows
    .map((row) => getApiEndpoint(row.id))
    .filter((endpoint): endpoint is ApiEndpoint => Boolean(endpoint));
}

export function deleteApiEndpoint(endpointId: string): void {
  db.prepare('DELETE FROM endpoints WHERE id = ?').run(endpointId);
}

export const endpointRepository = {
  list: listApiEndpoints,
  get: getApiEndpoint,
  save: saveApiEndpoint,
  remove: deleteApiEndpoint,
};
