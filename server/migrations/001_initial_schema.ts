import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration001InitialSchema: Migration = {
  id: '001_initial_schema',
  up: () => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS environments (
        name TEXT PRIMARY KEY,
        position INTEGER NOT NULL DEFAULT 0,
        variables TEXT NOT NULL DEFAULT '{}'
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS suites (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS headers (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS bodies (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        content_type TEXT NOT NULL,
        content TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS endpoints (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        method TEXT
      );

      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        suite_id TEXT NOT NULL,
        suite_name TEXT,
        environment TEXT,
        start_time INTEGER NOT NULL,
        end_time INTEGER,
        status TEXT NOT NULL,
        pass_rate REAL NOT NULL,
        total_cases INTEGER,
        passed_cases INTEGER,
        failed_cases INTEGER
      );

      CREATE TABLE IF NOT EXISTS settings (
        id TEXT PRIMARY KEY,
        current_project_id TEXT NOT NULL DEFAULT '',
        current_environment TEXT NOT NULL DEFAULT '',
        headless_mode INTEGER NOT NULL DEFAULT 1,
        viewport_width INTEGER NOT NULL DEFAULT 1920,
        viewport_height INTEGER NOT NULL DEFAULT 1080
      );

      CREATE TABLE IF NOT EXISTS project_pages (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_elements (
        id TEXT PRIMARY KEY,
        page_id TEXT NOT NULL REFERENCES project_pages(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        selector_type TEXT NOT NULL,
        value TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        original_html TEXT,
        page_url TEXT,
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS project_modules (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS module_params (
        id TEXT PRIMARY KEY,
        module_id TEXT NOT NULL REFERENCES project_modules(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        default_value TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS module_steps (
        id TEXT PRIMARY KEY,
        module_id TEXT NOT NULL REFERENCES project_modules(id) ON DELETE CASCADE,
        action TEXT NOT NULL,
        target TEXT NOT NULL,
        data TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        header_profile_id TEXT,
        body_template_id TEXT,
        endpoint_id TEXT,
        screenshot INTEGER,
        enabled INTEGER NOT NULL DEFAULT 1,
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scenarios (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scenario_suites (
        id TEXT PRIMARY KEY,
        scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
        suite_id TEXT NOT NULL,
        iteration_strategy TEXT DEFAULT 'SCENARIO',
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scenario_suite_variable_overrides (
        scenario_suite_id TEXT NOT NULL REFERENCES scenario_suites(id) ON DELETE CASCADE,
        item_key TEXT NOT NULL,
        item_value TEXT NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (scenario_suite_id, item_key)
      );

      CREATE TABLE IF NOT EXISTS suite_variables (
        id TEXT PRIMARY KEY,
        suite_id TEXT NOT NULL REFERENCES suites(id) ON DELETE CASCADE,
        variable_key TEXT NOT NULL,
        variable_value TEXT NOT NULL,
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS suite_data_rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        suite_id TEXT NOT NULL REFERENCES suites(id) ON DELETE CASCADE,
        row_index INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS suite_data_row_values (
        row_id INTEGER NOT NULL REFERENCES suite_data_rows(id) ON DELETE CASCADE,
        item_key TEXT NOT NULL,
        item_value TEXT NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (row_id, item_key)
      );

      CREATE TABLE IF NOT EXISTS suite_cases (
        id TEXT PRIMARY KEY,
        suite_id TEXT NOT NULL REFERENCES suites(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS case_steps (
        id TEXT PRIMARY KEY,
        case_id TEXT NOT NULL REFERENCES suite_cases(id) ON DELETE CASCADE,
        step_group TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT NOT NULL,
        data TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        header_profile_id TEXT,
        body_template_id TEXT,
        endpoint_id TEXT,
        screenshot INTEGER,
        enabled INTEGER NOT NULL DEFAULT 1,
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS suite_steps (
        id TEXT PRIMARY KEY,
        suite_id TEXT NOT NULL REFERENCES suites(id) ON DELETE CASCADE,
        step_group TEXT NOT NULL,
        action TEXT NOT NULL,
        target TEXT NOT NULL,
        data TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        header_profile_id TEXT,
        body_template_id TEXT,
        endpoint_id TEXT,
        screenshot INTEGER,
        enabled INTEGER NOT NULL DEFAULT 1,
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS header_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        header_id TEXT NOT NULL REFERENCES headers(id) ON DELETE CASCADE,
        item_key TEXT NOT NULL,
        item_value TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS body_default_values (
        body_id TEXT NOT NULL REFERENCES bodies(id) ON DELETE CASCADE,
        item_key TEXT NOT NULL,
        item_value TEXT NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (body_id, item_key)
      );

      CREATE TABLE IF NOT EXISTS endpoint_base_urls (
        endpoint_id TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
        environment TEXT NOT NULL,
        url TEXT NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (endpoint_id, environment)
      );

      CREATE TABLE IF NOT EXISTS endpoint_parameters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        endpoint_id TEXT NOT NULL REFERENCES endpoints(id) ON DELETE CASCADE,
        item_key TEXT NOT NULL,
        item_value TEXT NOT NULL,
        enabled INTEGER NOT NULL,
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS report_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        report_id TEXT NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
        step_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        status TEXT NOT NULL,
        message TEXT NOT NULL,
        screenshot TEXT,
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS execution_runs (
        id TEXT PRIMARY KEY,
        report_id TEXT NOT NULL,
        type TEXT NOT NULL,
        project_id TEXT NOT NULL,
        environment TEXT NOT NULL,
        suite_id TEXT,
        case_id TEXT,
        scenario_id TEXT,
        plan_id TEXT,
        status TEXT NOT NULL DEFAULT 'PENDING',
        started_at INTEGER,
        finished_at INTEGER,
        error_message TEXT
      );

      CREATE TABLE IF NOT EXISTS scenario_variables (
        id TEXT PRIMARY KEY,
        scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
        variable_key TEXT NOT NULL,
        variable_value TEXT NOT NULL,
        position INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scenario_data_rows (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
        row_index INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS scenario_data_row_values (
        row_id INTEGER NOT NULL REFERENCES scenario_data_rows(id) ON DELETE CASCADE,
        item_key TEXT NOT NULL,
        item_value TEXT NOT NULL,
        position INTEGER NOT NULL,
        PRIMARY KEY (row_id, item_key)
      );

      CREATE TABLE IF NOT EXISTS test_plans (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        position INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS test_plan_scenarios (
        id TEXT PRIMARY KEY,
        plan_id TEXT NOT NULL REFERENCES test_plans(id) ON DELETE CASCADE,
        scenario_id TEXT NOT NULL REFERENCES scenarios(id) ON DELETE CASCADE,
        position INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_project_pages_project ON project_pages(project_id, position);
      CREATE INDEX IF NOT EXISTS idx_project_elements_page ON project_elements(page_id, position);
      CREATE INDEX IF NOT EXISTS idx_project_modules_project ON project_modules(project_id, position);
      CREATE INDEX IF NOT EXISTS idx_module_params_module ON module_params(module_id, position);
      CREATE INDEX IF NOT EXISTS idx_module_steps_module ON module_steps(module_id, position);
      CREATE INDEX IF NOT EXISTS idx_scenarios_project ON scenarios(project_id, position);
      CREATE INDEX IF NOT EXISTS idx_scenario_suites_scenario ON scenario_suites(scenario_id, position);
      CREATE INDEX IF NOT EXISTS idx_suite_variables_suite ON suite_variables(suite_id, position);
      CREATE INDEX IF NOT EXISTS idx_suite_rows_suite ON suite_data_rows(suite_id, row_index);
      CREATE INDEX IF NOT EXISTS idx_suite_cases_suite ON suite_cases(suite_id, position);
      CREATE INDEX IF NOT EXISTS idx_case_steps_case ON case_steps(case_id, step_group, position);
      CREATE INDEX IF NOT EXISTS idx_suite_steps_suite ON suite_steps(suite_id, step_group, position);
      CREATE INDEX IF NOT EXISTS idx_header_items_header ON header_items(header_id, position);
      CREATE INDEX IF NOT EXISTS idx_body_defaults_body ON body_default_values(body_id, position);
      CREATE INDEX IF NOT EXISTS idx_endpoint_base_urls_endpoint ON endpoint_base_urls(endpoint_id, position);
      CREATE INDEX IF NOT EXISTS idx_endpoint_parameters_endpoint ON endpoint_parameters(endpoint_id, position);
      CREATE INDEX IF NOT EXISTS idx_report_logs_report ON report_logs(report_id, position);
      CREATE INDEX IF NOT EXISTS idx_execution_runs_status ON execution_runs(status);
      CREATE INDEX IF NOT EXISTS idx_execution_runs_report ON execution_runs(report_id);
      CREATE INDEX IF NOT EXISTS idx_scenario_variables_scenario ON scenario_variables(scenario_id, position);
      CREATE INDEX IF NOT EXISTS idx_scenario_rows_scenario ON scenario_data_rows(scenario_id, row_index);
    `);
  },
};
