import type { Page, Project, TestModule, TestScenario, UIElement } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import { BaseCrudRepository } from '../../shared/db/BaseCrudRepository.ts';
import type {
  DbBaseProjectRow,
  DbElementRow,
  DbModuleParamRow,
  DbModuleRow,
  DbPageRow,
  DbPlanScenarioRow,
  DbScenarioDataRowRow,
  DbScenarioRow,
  DbScenarioSuiteRow,
  DbStepRow,
  DbSuiteOverrideRow,
} from '../../shared/db/types.ts';
import { nullableText } from '../../shared/utils/index.ts';
import { deserializeStep } from '../common/mapper.ts';
import { normalizeProject } from './mapper.ts';

class ProjectRepository extends BaseCrudRepository<Project> {
  protected table = 'projects';

  save(projectInput: Partial<Project>): Project {
  const project = normalizeProject(projectInput);

  const transaction = db.transaction(() => {
    db.prepare(
      `
        INSERT INTO projects (id, name, description)
        VALUES (?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          name = excluded.name,
          description = excluded.description
      `,
    ).run(project.id, project.name, project.description || '');

    db.prepare('DELETE FROM project_pages WHERE project_id = ?').run(project.id);
    db.prepare('DELETE FROM project_modules WHERE project_id = ?').run(project.id);
    db.prepare('DELETE FROM scenarios WHERE project_id = ?').run(project.id);

    for (const [pageIndex, page] of (project.pages || []).entries()) {
      db.prepare(
        `
          INSERT INTO project_pages (id, project_id, name, description, position)
          VALUES (?, ?, ?, ?, ?)
        `,
      ).run(page.id, project.id, page.name, page.description, pageIndex);

      for (const [elementIndex, element] of page.elements.entries()) {
        db.prepare(
          `
            INSERT INTO project_elements (id, page_id, name, selector_type, value, description, original_html, page_url, metadata, position)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        ).run(
          element.id,
          page.id,
          element.name,
          element.selectorType,
          element.value,
          element.description || '',
          element.originalHtml || null,
          element.pageUrl || null,
          element.metadata ? JSON.stringify(element.metadata) : null,
          elementIndex,
        );
      }
    }

    for (const [moduleIndex, module] of project.modules.entries()) {
      db.prepare(
        `
          INSERT INTO project_modules (id, project_id, name, description, position)
          VALUES (?, ?, ?, ?, ?)
        `,
      ).run(module.id, project.id, module.name, module.description || '', moduleIndex);

      for (const [paramIndex, param] of (module.params || []).entries()) {
        db.prepare(
          `
            INSERT INTO module_params (id, module_id, name, default_value, description, position)
            VALUES (?, ?, ?, ?, ?, ?)
          `,
        ).run(
          param.id,
          module.id,
          param.name,
          param.defaultValue || '',
          param.description || '',
          paramIndex,
        );
      }

      for (const [stepIndex, step] of module.steps.entries()) {
        db.prepare(
          `
            INSERT INTO module_steps (
              id,
              module_id,
              action,
              target,
              data,
              description,
              header_profile_id,
              body_template_id,
              endpoint_id,
              screenshot,
              enabled,
              extractors,
              assertions,
              wait_for_network,
              network_mocks,
              position
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `,
        ).run(
          step.id,
          module.id,
          step.action,
          step.target,
          step.data,
          step.description || '',
          nullableText(step.headerProfileId),
          nullableText(step.bodyTemplateId),
          nullableText(step.endpointId),
          step.screenshot ? 1 : null,
          step.enabled === false ? 0 : 1,
          step.extractors ? JSON.stringify(step.extractors) : null,
          step.assertions ? JSON.stringify(step.assertions) : null,
          step.waitForNetwork ? JSON.stringify(step.waitForNetwork) : null,
          step.networkMocks ? JSON.stringify(step.networkMocks) : null,
          stepIndex,
        );
      }
    }

    for (const [scenarioIndex, scenario] of (project.scenarios || []).entries()) {
      db.prepare(
        `
          INSERT INTO scenarios (id, project_id, name, description, position)
          VALUES (?, ?, ?, ?, ?)
        `,
      ).run(
        scenario.id,
        project.id,
        scenario.name,
        scenario.description || '',
        scenarioIndex,
      );

      db.prepare('DELETE FROM scenario_variables WHERE scenario_id = ?').run(scenario.id);
      db.prepare('DELETE FROM scenario_data_rows WHERE scenario_id = ?').run(scenario.id);

      for (const [variableIndex, variable] of (scenario.variables || []).entries()) {
        db.prepare(
          `
            INSERT INTO scenario_variables (id, scenario_id, variable_key, variable_value, position)
            VALUES (?, ?, ?, ?, ?)
          `,
        ).run(variable.id, scenario.id, variable.key, variable.value, variableIndex);
      }

      for (const [rowIndex, row] of (scenario.dataRows || []).entries()) {
        const rowResult = db
          .prepare('INSERT INTO scenario_data_rows (scenario_id, row_index) VALUES (?, ?)')
          .run(scenario.id, rowIndex);
        const rowId = Number(rowResult.lastInsertRowid);

        let colIndex = 0;
        for (const [key, value] of Object.entries(row)) {
          db.prepare(
            `
              INSERT INTO scenario_data_row_values (row_id, item_key, item_value, position)
              VALUES (?, ?, ?, ?)
            `,
          ).run(rowId, key, value, colIndex++);
        }
      }

      for (const [suiteIndex, scenarioSuite] of scenario.suites.entries()) {
        db.prepare(
          `
            INSERT INTO scenario_suites (id, scenario_id, suite_id, position)
            VALUES (?, ?, ?, ?)
          `,
        ).run(scenarioSuite.id, scenario.id, scenarioSuite.suiteId, suiteIndex);

        for (const [overrideIndex, [key, value]] of Object.entries(
          scenarioSuite.variableOverrides || {},
        ).entries()) {
          db.prepare(
            `
              INSERT INTO scenario_suite_variable_overrides (
                scenario_suite_id,
                item_key,
                item_value,
                position
              )
              VALUES (?, ?, ?, ?)
            `,
          ).run(scenarioSuite.id, key, value, overrideIndex);
        }
      }
    }

    db.prepare('DELETE FROM test_plans WHERE project_id = ?').run(project.id);

    for (const [planIndex, plan] of (project.plans || []).entries()) {
      db.prepare(
        `
          INSERT INTO test_plans (id, project_id, name, description, position)
          VALUES (?, ?, ?, ?, ?)
        `,
      ).run(
        plan.id,
        project.id,
        plan.name,
        plan.description || '',
        planIndex,
      );

      for (const [scenarioIndex, scenario] of (plan.scenarios || []).entries()) {
        db.prepare(
          `
            INSERT INTO test_plan_scenarios (id, plan_id, scenario_id, position)
            VALUES (?, ?, ?, ?)
          `,
        ).run(scenario.id, plan.id, scenario.scenarioId, scenarioIndex);
      }
    }
  });

  transaction();
  return getProject(project.id) || project;
}

get(projectId: string): Project | undefined {
  const base = db
    .prepare('SELECT id, name, description FROM projects WHERE id = ?')
    .get(projectId) as DbBaseProjectRow | undefined;

  if (!base) {
    return undefined;
  }

  // ── Batched queries (13 total) ──────────────────────────────────────

  // 1. Pages
  const pages = db.prepare(
    `SELECT id, name, description FROM project_pages WHERE project_id = ? ORDER BY position`,
  ).all(projectId) as DbPageRow[];

  // 2. All elements for every page in the project
  const allElements = db.prepare(
    `SELECT id, page_id, name, selector_type, value, description, original_html, page_url, metadata
       FROM project_elements
     WHERE page_id IN (SELECT id FROM project_pages WHERE project_id = ?)
     ORDER BY position`,
  ).all(projectId) as DbElementRow[];

  // 3. Modules
  const modules = db.prepare(
    `SELECT id, name, description FROM project_modules WHERE project_id = ? ORDER BY position`,
  ).all(projectId) as DbModuleRow[];

  // 4. All module params
  const allParams = db.prepare(
    `SELECT id, module_id, name, default_value, description
     FROM module_params
     WHERE module_id IN (SELECT id FROM project_modules WHERE project_id = ?)
     ORDER BY position`,
  ).all(projectId) as DbModuleParamRow[];

  // 5. All module steps
  const allSteps = db.prepare(
    `SELECT id, module_id, action, target, data, description, header_profile_id, body_template_id, endpoint_id, screenshot, enabled, extractors, assertions, wait_for_network, network_mocks
     FROM module_steps
     WHERE module_id IN (SELECT id FROM project_modules WHERE project_id = ?)
     ORDER BY position`,
  ).all(projectId) as DbStepRow[];

  // 6. Scenarios
  const scenarios = db.prepare(
    `SELECT id, name, description FROM scenarios WHERE project_id = ? ORDER BY position`,
  ).all(projectId) as DbScenarioRow[];

  // 7. All scenario suites
  const allSuites = db.prepare(
    `SELECT id, scenario_id, suite_id
     FROM scenario_suites
     WHERE scenario_id IN (SELECT id FROM scenarios WHERE project_id = ?)
     ORDER BY position`,
  ).all(projectId) as DbScenarioSuiteRow[];

  // 8. All suite variable overrides
  const allOverrides = db.prepare(
    `SELECT scenario_suite_id, item_key, item_value
     FROM scenario_suite_variable_overrides
     WHERE scenario_suite_id IN (
       SELECT ss.id FROM scenario_suites ss
       INNER JOIN scenarios s ON s.id = ss.scenario_id
       WHERE s.project_id = ?
     )
     ORDER BY position`,
  ).all(projectId) as DbSuiteOverrideRow[];

  // 9. All scenario variables
  const allVariables = db.prepare(
    `SELECT id, scenario_id, variable_key, variable_value
     FROM scenario_variables
     WHERE scenario_id IN (SELECT id FROM scenarios WHERE project_id = ?)
     ORDER BY position`,
  ).all(projectId) as Array<{ id: string; scenario_id: string; variable_key: string; variable_value: string }>;

  // 10. All scenario data rows (joined with values)
  const allDataRows = db.prepare(
    `SELECT dr.id, dr.scenario_id, dr.row_index, drv.item_key, drv.item_value
     FROM scenario_data_rows dr
     LEFT JOIN scenario_data_row_values drv ON dr.id = drv.row_id
     WHERE dr.scenario_id IN (SELECT id FROM scenarios WHERE project_id = ?)
     ORDER BY dr.row_index, drv.position`,
  ).all(projectId) as DbScenarioDataRowRow[];

  // 11. Test plans
  const plans = db.prepare(
    `SELECT id, name, description FROM test_plans WHERE project_id = ? ORDER BY position`,
  ).all(projectId) as Array<{ id: string; name: string; description: string }>;

  // 12. All plan scenarios
  const allPlanScenarios = db.prepare(
    `SELECT id, plan_id, scenario_id
     FROM test_plan_scenarios
     WHERE plan_id IN (SELECT id FROM test_plans WHERE project_id = ?)
     ORDER BY position`,
  ).all(projectId) as DbPlanScenarioRow[];

  // ── In-memory grouping ──────────────────────────────────────────────

  const elementsByPageId = new Map<string, DbElementRow[]>();
  for (const el of allElements) {
    let arr = elementsByPageId.get(el.page_id);
    if (!arr) { arr = []; elementsByPageId.set(el.page_id, arr); }
    arr.push(el);
  }

  const paramsByModuleId = new Map<string, DbModuleParamRow[]>();
  for (const p of allParams) {
    let arr = paramsByModuleId.get(p.module_id);
    if (!arr) { arr = []; paramsByModuleId.set(p.module_id, arr); }
    arr.push(p);
  }

  const stepsByModuleId = new Map<string, DbStepRow[]>();
  for (const s of allSteps) {
    let arr = stepsByModuleId.get(s.module_id);
    if (!arr) { arr = []; stepsByModuleId.set(s.module_id, arr); }
    arr.push(s);
  }

  const suitesByScenarioId = new Map<string, DbScenarioSuiteRow[]>();
  for (const su of allSuites) {
    let arr = suitesByScenarioId.get(su.scenario_id);
    if (!arr) { arr = []; suitesByScenarioId.set(su.scenario_id, arr); }
    arr.push(su);
  }

  const overridesBySuiteId = new Map<string, DbSuiteOverrideRow[]>();
  for (const o of allOverrides) {
    let arr = overridesBySuiteId.get(o.scenario_suite_id);
    if (!arr) { arr = []; overridesBySuiteId.set(o.scenario_suite_id, arr); }
    arr.push(o);
  }

  const variablesByScenarioId = new Map<string, Array<{ id: string; variable_key: string; variable_value: string }>>();
  for (const v of allVariables) {
    let arr = variablesByScenarioId.get(v.scenario_id);
    if (!arr) { arr = []; variablesByScenarioId.set(v.scenario_id, arr); }
    arr.push(v);
  }

  const dataRowsByScenarioId = new Map<string, DbScenarioDataRowRow[]>();
  for (const dr of allDataRows) {
    let arr = dataRowsByScenarioId.get(dr.scenario_id);
    if (!arr) { arr = []; dataRowsByScenarioId.set(dr.scenario_id, arr); }
    arr.push(dr);
  }

  const planScenariosByPlanId = new Map<string, DbPlanScenarioRow[]>();
  for (const ps of allPlanScenarios) {
    let arr = planScenariosByPlanId.get(ps.plan_id);
    if (!arr) { arr = []; planScenariosByPlanId.set(ps.plan_id, arr); }
    arr.push(ps);
  }

  // ── Assemble object graph ───────────────────────────────────────────

  const projectPages: Page[] = pages.map((page) => ({
    id: page.id,
    name: page.name,
    description: page.description,
    elements: (elementsByPageId.get(page.id) || []).map((element) => ({
      id: element.id,
      name: element.name,
      selectorType: element.selector_type as UIElement['selectorType'],
      value: element.value,
      description: element.description,
      originalHtml: element.original_html || undefined,
      pageUrl: element.page_url || undefined,
      metadata: (() => {
        if (!element.metadata) return undefined;
        try {
          return JSON.parse(element.metadata);
        } catch {
          return undefined;
        }
      })(),
    })),
  }));

  const projectModules: TestModule[] = modules.map((mod) => ({
    id: mod.id,
    name: mod.name,
    description: mod.description,
    params: (paramsByModuleId.get(mod.id) || []).map((param) => ({
      id: param.id,
      name: param.name,
      defaultValue: param.default_value,
      description: param.description,
    })),
    steps: (stepsByModuleId.get(mod.id) || []).map((step) => deserializeStep(step)),
  }));

  const projectScenarios: TestScenario[] = scenarios.map((scenario) => {
    const suiteRows = suitesByScenarioId.get(scenario.id) || [];
    const variableRows = variablesByScenarioId.get(scenario.id) || [];
    const dataRowRecords = dataRowsByScenarioId.get(scenario.id) || [];

    const dataRows: Record<string, string>[] = [];
    let currentRowIndex = -1;
    let currentRow: Record<string, string> | null = null;
    for (const record of dataRowRecords) {
      if (record.row_index !== currentRowIndex) {
        if (currentRow) dataRows.push(currentRow);
        currentRow = {};
        currentRowIndex = record.row_index;
      }
      if (record.item_key && currentRow) {
        currentRow[record.item_key] = record.item_value;
      }
    }
    if (currentRow) dataRows.push(currentRow);

    return {
      id: scenario.id,
      name: scenario.name,
      description: scenario.description,
      variables: variableRows.map((v) => ({
        id: v.id,
        key: v.variable_key,
        value: v.variable_value,
      })),
      dataRows,
      suites: suiteRows.map((scenarioSuite) => {
        const overrides = overridesBySuiteId.get(scenarioSuite.id) || [];
        return {
          id: scenarioSuite.id,
          suiteId: scenarioSuite.suite_id,
          variableOverrides: Object.fromEntries(
            overrides.map((o) => [o.item_key, o.item_value]),
          ),
        };
      }),
    };
  });

  const projectPlans = plans.map((plan) => ({
    id: plan.id,
    projectId,
    name: plan.name,
    description: plan.description,
    scenarios: (planScenariosByPlanId.get(plan.id) || []).map((ps) => ({
      id: ps.id,
      scenarioId: ps.scenario_id,
    })),
  }));

  return {
    id: base.id,
    name: base.name,
    description: base.description,
    pages: projectPages,
    modules: projectModules,
    scenarios: projectScenarios,
    plans: projectPlans,
  };
}

}

const _repo = new ProjectRepository();

export const listProjects = () => _repo.list();
export const getProject = (id: string) => _repo.get(id);
export const saveProject = (input: Partial<Project>) => _repo.save(input);
export const deleteProject = (id: string) => _repo.remove(id);

export const projectRepository = {
  list: _repo.list.bind(_repo),
  get: _repo.get.bind(_repo),
  save: _repo.save.bind(_repo),
  remove: _repo.remove.bind(_repo),
};
