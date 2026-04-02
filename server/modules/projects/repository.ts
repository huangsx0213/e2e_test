import type { Page, Project, TestModule, TestScenario, UIElement } from '../../shared/contracts/index.ts';
import { db } from '../../shared/db/client.ts';
import type {
  DbBaseProjectRow,
  DbElementRow,
  DbModuleParamRow,
  DbModuleRow,
  DbPageRow,
  DbScenarioRow,
  DbScenarioSuiteRow,
  DbStepRow,
} from '../../shared/db/types.ts';
import { nullableText } from '../../shared/utils/index.ts';
import { deserializeStep } from '../common/mapper.ts';
import { normalizeProject } from './mapper.ts';

export function saveProject(projectInput: Partial<Project>): Project {
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
            INSERT INTO project_elements (id, page_id, name, selector_type, value, description, position)
            VALUES (?, ?, ?, ?, ?, ?, ?)
          `,
        ).run(
          element.id,
          page.id,
          element.name,
          element.selectorType,
          element.value,
          element.description || '',
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
              position
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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

export function getProject(projectId: string): Project | undefined {
  const base = db
    .prepare('SELECT id, name, description FROM projects WHERE id = ?')
    .get(projectId) as DbBaseProjectRow | undefined;

  if (!base) {
    return undefined;
  }

  const pages = db.prepare(
    `
      SELECT id, name, description
      FROM project_pages
      WHERE project_id = ?
      ORDER BY position
    `,
  ).all(projectId) as DbPageRow[];

  const projectPages: Page[] = pages.map((page) => {
    const elements = db.prepare(
      `
        SELECT id, name, selector_type, value, description
        FROM project_elements
        WHERE page_id = ?
        ORDER BY position
      `,
    ).all(page.id) as DbElementRow[];

    return {
      id: page.id,
      name: page.name,
      description: page.description,
      elements: elements.map((element) => ({
        id: element.id,
        name: element.name,
        selectorType: element.selector_type as UIElement['selectorType'],
        value: element.value,
        description: element.description,
      })),
    };
  });

  const modules = db.prepare(
    `
      SELECT id, name, description
      FROM project_modules
      WHERE project_id = ?
      ORDER BY position
    `,
  ).all(projectId) as DbModuleRow[];

  const projectModules: TestModule[] = modules.map((module) => {
    const params = db.prepare(
      `
        SELECT id, name, default_value, description
        FROM module_params
        WHERE module_id = ?
        ORDER BY position
      `,
    ).all(module.id) as DbModuleParamRow[];

    const steps = db.prepare(
      `
        SELECT id, action, target, data, description, header_profile_id, body_template_id, endpoint_id, screenshot, enabled
        FROM module_steps
        WHERE module_id = ?
        ORDER BY position
      `,
    ).all(module.id) as DbStepRow[];

    return {
      id: module.id,
      name: module.name,
      description: module.description,
      params: params.map((param) => ({
        id: param.id,
        name: param.name,
        defaultValue: param.default_value,
        description: param.description,
      })),
      steps: steps.map((step) => deserializeStep(step)),
    };
  });

  const scenarios = db.prepare(
    `
      SELECT id, name, description
      FROM scenarios
      WHERE project_id = ?
      ORDER BY position
    `,
  ).all(projectId) as DbScenarioRow[];

  const projectScenarios: TestScenario[] = scenarios.map((scenario) => {
    const suites = db.prepare(
      `
        SELECT id, suite_id
        FROM scenario_suites
        WHERE scenario_id = ?
        ORDER BY position
      `,
    ).all(scenario.id) as DbScenarioSuiteRow[];

    const variables = db.prepare(
      `
        SELECT id, variable_key, variable_value
        FROM scenario_variables
        WHERE scenario_id = ?
        ORDER BY position
      `,
    ).all(scenario.id) as Array<{ id: string; variable_key: string; variable_value: string }>;

    const dataRowsRecords = db.prepare(
      `
        SELECT dr.id, dr.row_index, drv.item_key, drv.item_value
        FROM scenario_data_rows dr
        LEFT JOIN scenario_data_row_values drv ON dr.id = drv.row_id
        WHERE dr.scenario_id = ?
        ORDER BY dr.row_index, drv.position
      `,
    ).all(scenario.id) as Array<{ id: number; row_index: number; item_key: string; item_value: string }>;

    const dataRows: Record<string, string>[] = [];
    let currentRowIndex = -1;
    let currentRow: Record<string, string> | null = null;

    for (const record of dataRowsRecords) {
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
      variables: variables.map((v) => ({
        id: v.id,
        key: v.variable_key,
        value: v.variable_value,
      })),
      dataRows,
      suites: suites.map((scenarioSuite) => {
        const overrides = db.prepare(
          `
            SELECT item_key, item_value
            FROM scenario_suite_variable_overrides
            WHERE scenario_suite_id = ?
            ORDER BY position
          `,
        ).all(scenarioSuite.id) as Array<{ item_key: string; item_value: string }>;

        return {
          id: scenarioSuite.id,
          suiteId: scenarioSuite.suite_id,
          variableOverrides: Object.fromEntries(
            overrides.map((override) => [override.item_key, override.item_value]),
          ),
        };
      }),
    };
  });

  const plans = db.prepare(
    `
      SELECT id, name, description
      FROM test_plans
      WHERE project_id = ?
      ORDER BY position
    `,
  ).all(projectId) as Array<{ id: string; name: string; description: string }>;

  const projectPlans = plans.map((plan) => {
    const planScenarios = db.prepare(
      `
        SELECT id, scenario_id
        FROM test_plan_scenarios
        WHERE plan_id = ?
        ORDER BY position
      `,
    ).all(plan.id) as Array<{ id: string; scenario_id: string }>;

    return {
      id: plan.id,
      projectId,
      name: plan.name,
      description: plan.description,
      scenarios: planScenarios.map((ps) => ({
        id: ps.id,
        scenarioId: ps.scenario_id,
      })),
    };
  });

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

export function listProjects(): Project[] {
  const rows = db.prepare('SELECT id FROM projects ORDER BY rowid').all() as Array<{
    id: string;
  }>;

  return rows
    .map((row) => getProject(row.id))
    .filter((project): project is Project => Boolean(project));
}

export function deleteProject(projectId: string): void {
  db.prepare('DELETE FROM projects WHERE id = ?').run(projectId);
}

export const projectRepository = {
  list: listProjects,
  get: getProject,
  save: saveProject,
  remove: deleteProject,
};
