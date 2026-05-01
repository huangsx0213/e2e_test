import type { TestCase, TestSuite } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import { BaseCrudRepository } from '../../shared/db/BaseCrudRepository.ts';
import type {
  DbBaseSuiteRow,
  DbCaseRow,
  DbStepRow,
  DbSuiteVariableRow,
} from '../../shared/db/types.ts';
import { nullableText, textFromDb } from '../../shared/utils/index.ts';
import { deserializeStep } from '../common/mapper.ts';
import { normalizeSuite } from './mapper.ts';

class SuiteRepository extends BaseCrudRepository<TestSuite> {
  protected table = 'suites';

  get(suiteId: string): TestSuite | undefined {
    const base = db
      .prepare('SELECT id, project_id, name, description FROM suites WHERE id = ?')
      .get(suiteId) as DbBaseSuiteRow | undefined;
    if (!base) return undefined;

    const variables = db.prepare(
      'SELECT id, variable_key, variable_value FROM suite_variables WHERE suite_id = ? ORDER BY position',
    ).all(suiteId) as DbSuiteVariableRow[];

    const rows = db.prepare(
      'SELECT id, row_index FROM suite_data_rows WHERE suite_id = ? ORDER BY row_index',
    ).all(suiteId) as Array<{ id: number; row_index: number }>;

    const dataRows = rows.map((row) => {
      const values = db.prepare(
        'SELECT item_key, item_value FROM suite_data_row_values WHERE row_id = ? ORDER BY position',
      ).all(row.id) as Array<{ item_key: string; item_value: string }>;
      return Object.fromEntries(values.map((value) => [value.item_key, value.item_value]));
    });

    const suiteSetupSteps = db.prepare(
      `SELECT id, action, target, data, description, header_profile_id, body_template_id,
              endpoint_id, screenshot, enabled, metadata, extractors, assertions, wait_for_network, network_mocks
        FROM suite_steps WHERE suite_id = ? AND step_group = 'setup' ORDER BY position`,
    ).all(suiteId) as DbStepRow[];

    const suiteTeardownSteps = db.prepare(
      `SELECT id, action, target, data, description, header_profile_id, body_template_id,
              endpoint_id, screenshot, enabled, metadata, extractors, assertions, wait_for_network, network_mocks
        FROM suite_steps WHERE suite_id = ? AND step_group = 'teardown' ORDER BY position`,
    ).all(suiteId) as DbStepRow[];

    const cases = db.prepare(
      'SELECT id, name, description FROM suite_cases WHERE suite_id = ? ORDER BY position',
    ).all(suiteId) as DbCaseRow[];

    const suiteCases: TestCase[] = cases.map((testCase) => {
      const mainSteps = db.prepare(
        `SELECT id, action, target, data, description, header_profile_id, body_template_id,
                endpoint_id, screenshot, enabled, metadata, extractors, assertions, wait_for_network, network_mocks
          FROM case_steps WHERE case_id = ? AND step_group = 'main' ORDER BY position`,
      ).all(testCase.id) as DbStepRow[];

      const setupSteps = db.prepare(
        `SELECT id, action, target, data, description, header_profile_id, body_template_id,
                endpoint_id, screenshot, enabled, metadata, extractors, assertions, wait_for_network, network_mocks
          FROM case_steps WHERE case_id = ? AND step_group = 'setup' ORDER BY position`,
      ).all(testCase.id) as DbStepRow[];

      const teardownSteps = db.prepare(
        `SELECT id, action, target, data, description, header_profile_id, body_template_id,
                endpoint_id, screenshot, enabled, metadata, extractors, assertions, wait_for_network, network_mocks
          FROM case_steps WHERE case_id = ? AND step_group = 'teardown' ORDER BY position`,
      ).all(testCase.id) as DbStepRow[];

      return {
        id: testCase.id,
        name: testCase.name,
        description: testCase.description,
        steps: mainSteps.map((step) => deserializeStep(step)),
        setupSteps: setupSteps.map((step) => deserializeStep(step)),
        teardownSteps: teardownSteps.map((step) => deserializeStep(step)),
      };
    });

    return {
      id: base.id,
      projectId: textFromDb(base.project_id),
      name: base.name,
      description: base.description,
      cases: suiteCases,
      variables: variables.map((variable) => ({
        id: variable.id,
        key: variable.variable_key,
        value: variable.variable_value,
      })),
      dataRows,
      setupSteps: suiteSetupSteps.map((step) => deserializeStep(step)),
      teardownSteps: suiteTeardownSteps.map((step) => deserializeStep(step)),
    };
  }

  save(suiteInput: Partial<TestSuite>): TestSuite {
    const suite = normalizeSuite(suiteInput);

    const transaction = db.transaction(() => {
      db.prepare(
        `INSERT INTO suites (id, project_id, name, description) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
        project_id = excluded.project_id,
        name = excluded.name,
        description = excluded.description`,
      ).run(suite.id, nullableText(suite.projectId), suite.name, suite.description || '');

      const existingCaseIds = new Set(
        (db.prepare('SELECT id FROM suite_cases WHERE suite_id = ?').all(suite.id) as Array<{ id: string }>).map(r => r.id),
      );
      const payloadCaseIds = new Set(suite.cases.map(c => c.id));
      for (const oldId of existingCaseIds) {
        if (!payloadCaseIds.has(oldId)) {
          db.prepare('DELETE FROM suite_cases WHERE id = ?').run(oldId);
        }
      }

      db.prepare('DELETE FROM suite_variables WHERE suite_id = ?').run(suite.id);
      db.prepare('DELETE FROM suite_data_rows WHERE suite_id = ?').run(suite.id);
      db.prepare('DELETE FROM suite_steps WHERE suite_id = ?').run(suite.id);

      for (const [variableIndex, variable] of (suite.variables || []).entries()) {
        db.prepare(
          'INSERT INTO suite_variables (id, suite_id, variable_key, variable_value, position) VALUES (?, ?, ?, ?, ?)',
        ).run(variable.id, suite.id, variable.key, variable.value, variableIndex);
      }

      for (const [rowIndex, row] of (suite.dataRows || []).entries()) {
        const rowResult = db
          .prepare('INSERT INTO suite_data_rows (suite_id, row_index) VALUES (?, ?)')
          .run(suite.id, rowIndex);
        const rowId = Number(rowResult.lastInsertRowid);

        for (const [valueIndex, [key, value]] of Object.entries(row).entries()) {
          db.prepare(
            'INSERT INTO suite_data_row_values (row_id, item_key, item_value, position) VALUES (?, ?, ?, ?)',
          ).run(rowId, key, value, valueIndex);
        }
      }

      const insertStep = (table: string, parentColumn: string, parentId: string, stepGroup: string, step: typeof suite.setupSteps[0], stepIndex: number) => {
        db.prepare(
          `INSERT INTO ${table} (
            id, ${parentColumn}, step_group, action, target, data, description,
            header_profile_id, body_template_id, endpoint_id, screenshot, enabled, metadata,
            extractors, assertions, wait_for_network, network_mocks, position
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
          step.id, parentId, stepGroup,
          step.action, step.target, step.data, step.description || '',
          nullableText(step.headerProfileId), nullableText(step.bodyTemplateId), nullableText(step.endpointId),
          step.screenshot ? 1 : null, step.enabled === false ? 0 : 1,
          step.metadata ? JSON.stringify(step.metadata) : null,
          step.extractors ? JSON.stringify(step.extractors) : null,
          step.assertions ? JSON.stringify(step.assertions) : null,
          step.waitForNetwork ? JSON.stringify(step.waitForNetwork) : null,
          step.networkMocks ? JSON.stringify(step.networkMocks) : null,
          stepIndex,
        );
      };

      for (const [stepIndex, step] of (suite.setupSteps || []).entries()) {
        insertStep('suite_steps', 'suite_id', suite.id, 'setup', step, stepIndex);
      }

      for (const [stepIndex, step] of (suite.teardownSteps || []).entries()) {
        insertStep('suite_steps', 'suite_id', suite.id, 'teardown', step, stepIndex);
      }

      const upsertStep = (caseId: string, stepGroup: string, step: typeof suite.setupSteps[0], stepIndex: number) => {
        db.prepare(
          `INSERT INTO case_steps (
            id, case_id, step_group, action, target, data, description,
            header_profile_id, body_template_id, endpoint_id, screenshot, enabled, metadata,
            extractors, assertions, wait_for_network, network_mocks, position
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            action = excluded.action,
            target = excluded.target,
            data = excluded.data,
            description = excluded.description,
            header_profile_id = excluded.header_profile_id,
            body_template_id = excluded.body_template_id,
            endpoint_id = excluded.endpoint_id,
            screenshot = excluded.screenshot,
            enabled = excluded.enabled,
            metadata = excluded.metadata,
            extractors = excluded.extractors,
            assertions = excluded.assertions,
            wait_for_network = excluded.wait_for_network,
            network_mocks = excluded.network_mocks,
            position = excluded.position`,
        ).run(
          step.id, caseId, stepGroup,
          step.action, step.target, step.data, step.description || '',
          nullableText(step.headerProfileId), nullableText(step.bodyTemplateId), nullableText(step.endpointId),
          step.screenshot ? 1 : null, step.enabled === false ? 0 : 1,
          step.metadata ? JSON.stringify(step.metadata) : null,
          step.extractors ? JSON.stringify(step.extractors) : null,
          step.assertions ? JSON.stringify(step.assertions) : null,
          step.waitForNetwork ? JSON.stringify(step.waitForNetwork) : null,
          step.networkMocks ? JSON.stringify(step.networkMocks) : null,
          stepIndex,
        );
      };

      for (const [caseIndex, testCase] of suite.cases.entries()) {
        db.prepare(
          `INSERT INTO suite_cases (id, suite_id, name, description, position) VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            name = excluded.name,
            description = excluded.description,
            position = excluded.position`,
        ).run(testCase.id, suite.id, testCase.name, testCase.description || '', caseIndex);

        const existingStepIds = new Set(
          (db.prepare('SELECT id FROM case_steps WHERE case_id = ?').all(testCase.id) as Array<{ id: string }>).map(r => r.id),
        );
        const payloadStepIds = new Set<string>();

        for (const [stepIndex, step] of testCase.steps.entries()) {
          upsertStep(testCase.id, 'main', step, stepIndex);
          payloadStepIds.add(step.id);
        }

        for (const [stepIndex, step] of (testCase.setupSteps || []).entries()) {
          upsertStep(testCase.id, 'setup', step, stepIndex);
          payloadStepIds.add(step.id);
        }

        for (const [stepIndex, step] of (testCase.teardownSteps || []).entries()) {
          upsertStep(testCase.id, 'teardown', step, stepIndex);
          payloadStepIds.add(step.id);
        }

        for (const oldStepId of existingStepIds) {
          if (!payloadStepIds.has(oldStepId)) {
            db.prepare('DELETE FROM case_steps WHERE id = ?').run(oldStepId);
          }
        }
      }
    });

    transaction();
    return this.get(suite.id) || suite;
  }

  remove(suiteId: string): void {
    const transaction = db.transaction(() => {
      db.prepare('DELETE FROM scenario_suites WHERE suite_id = ?').run(suiteId);
      db.prepare(`DELETE FROM ${this.table} WHERE id = ?`).run(suiteId);
    });
    transaction();
  }
}

const _repo = new SuiteRepository();

export const listSuites = () => _repo.list();
export const getSuite = (id: string) => _repo.get(id);
export const saveSuite = (input: Partial<TestSuite>) => _repo.save(input);
export const deleteSuite = (id: string) => _repo.remove(id);

export const suiteRepository = {
  list: _repo.list.bind(_repo),
  get: _repo.get.bind(_repo),
  save: _repo.save.bind(_repo),
  remove: _repo.remove.bind(_repo),
};
