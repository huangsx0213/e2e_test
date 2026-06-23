import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration000InitialSchema: Migration = {
  id: '000_initial_schema',
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
        description TEXT NOT NULL DEFAULT '',
        position INTEGER NOT NULL DEFAULT 0
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
        viewport_height INTEGER NOT NULL DEFAULT 1080,
        record_video INTEGER NOT NULL DEFAULT 1,
        ai_provider_configs TEXT NOT NULL DEFAULT '{}'
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
        metadata TEXT,
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
        position INTEGER NOT NULL,
        extractors TEXT,
        assertions TEXT,
        wait_for_network TEXT,
        network_mocks TEXT
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
        metadata TEXT,
        position INTEGER NOT NULL,
        extractors TEXT,
        assertions TEXT,
        wait_for_network TEXT,
        network_mocks TEXT
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
        metadata TEXT,
        position INTEGER NOT NULL,
        extractors TEXT,
        assertions TEXT,
        wait_for_network TEXT,
        network_mocks TEXT
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
        position INTEGER NOT NULL,
        level TEXT NOT NULL DEFAULT 'info',
        metadata TEXT
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
        error_message TEXT,
        agent_id TEXT
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

      CREATE TABLE IF NOT EXISTS dynamic_variables (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        expression TEXT NOT NULL,
        description TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000),
        evaluation_strategy TEXT NOT NULL DEFAULT 'EVERY_TIME'
      );

      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        os TEXT NOT NULL DEFAULT 'unknown',
        version TEXT NOT NULL DEFAULT 'unknown',
        status TEXT NOT NULL DEFAULT 'offline',
        labels TEXT NOT NULL DEFAULT '[]',
        last_seen INTEGER NOT NULL DEFAULT 0
      );

      CREATE TABLE IF NOT EXISTS requirements (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        parent_id TEXT REFERENCES requirements(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        priority TEXT NOT NULL DEFAULT 'MEDIUM',
        risk_level TEXT NOT NULL DEFAULT 'MEDIUM',
        type TEXT NOT NULL DEFAULT 'functional',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        position INTEGER NOT NULL DEFAULT 0,
        metadata TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        level TEXT NOT NULL DEFAULT 'story',
        tags TEXT NOT NULL DEFAULT '[]',
        dependencies TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS natural_language_test_cases (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        requirement_id TEXT,
        condition_id TEXT,
        technique_applied TEXT,
        priority TEXT NOT NULL DEFAULT 'medium',
        category TEXT,
        preconditions TEXT NOT NULL DEFAULT '[]',
        test_data TEXT NOT NULL DEFAULT '[]',
        steps TEXT NOT NULL DEFAULT '[]',
        postconditions TEXT NOT NULL DEFAULT '[]',
        tags TEXT NOT NULL DEFAULT '[]',
        self_review TEXT,
        review_summary TEXT,
        change_log TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        generated_suite_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        schema_version INTEGER NOT NULL DEFAULT 2,
        recorder_readiness TEXT NOT NULL DEFAULT 'needs_review',
        readiness_issues TEXT NOT NULL DEFAULT '[]'
      );

      CREATE TABLE IF NOT EXISTS test_gen_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'RUNNING',
        phase TEXT NOT NULL DEFAULT 'init',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        state TEXT,
        current_batch INTEGER NOT NULL DEFAULT 0,
        total_batches INTEGER NOT NULL DEFAULT 0,
        provider_config_name TEXT,
        provider_type TEXT,
        model_name TEXT,
        prompt_version TEXT,
        created_by TEXT,
        approved_by TEXT DEFAULT '[]',
        mode TEXT DEFAULT 'draft',
        token_usage TEXT DEFAULT '{}',
        token_limit INTEGER,
        error_count INTEGER NOT NULL DEFAULT 0,
        config TEXT,
        thread_id TEXT,
        thinking_data TEXT
      );

      CREATE TABLE IF NOT EXISTS test_gen_agent_logs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES test_gen_runs(id) ON DELETE CASCADE,
        batch INTEGER NOT NULL,
        agent_name TEXT NOT NULL,
        phase TEXT NOT NULL,
        input_prompt TEXT,
        output_data TEXT,
        token_usage TEXT,
        latency_ms INTEGER,
        raw_trace TEXT,
        status TEXT NOT NULL DEFAULT 'RUNNING',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        error_message TEXT,
        error_raw_response TEXT,
        tool_history TEXT,
        thinking_text TEXT
      );

      CREATE TABLE IF NOT EXISTS test_gen_audit_log (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES test_gen_runs(id) ON DELETE CASCADE,
        checkpoint_id TEXT NOT NULL,
        action TEXT NOT NULL,
        user_id TEXT NOT NULL,
        snapshot TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS provider_configs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL DEFAULT '',
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        endpoint TEXT,
        encrypted_api_key TEXT NOT NULL,
        deployment TEXT,
        api_version TEXT,
        model TEXT,
        fallback_config_ids TEXT DEFAULT '[]',
        monthly_token_limit INTEGER,
        is_active BOOLEAN NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        models TEXT,
        reasoning_effort TEXT DEFAULT 'high',
        reasoning_summary TEXT DEFAULT 'auto',
        text_verbosity TEXT DEFAULT 'medium'
      );

      CREATE TABLE IF NOT EXISTS agent_cache (
        cache_key TEXT PRIMARY KEY,
        input_hash TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        model TEXT NOT NULL,
        output TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        expires_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS business_flows (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        type TEXT NOT NULL DEFAULT 'happy-path',
        status TEXT NOT NULL DEFAULT 'DRAFT',
        steps TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS test_gen_prompt_overrides (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        agent_name TEXT NOT NULL,
        custom_prompt TEXT,
        model_override TEXT,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(project_id, agent_name)
      );

      CREATE TABLE IF NOT EXISTS ai_driven_recording_runs (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        nl_case_id TEXT NOT NULL,
        provider_config_id TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        started_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        total_steps INTEGER NOT NULL DEFAULT 0,
        completed_steps INTEGER NOT NULL DEFAULT 0,
        failed_steps INTEGER NOT NULL DEFAULT 0,
        result_suite_id TEXT,
        result_case_id TEXT,
        replay_report TEXT,
        error TEXT,
        options TEXT,
        token_usage TEXT,
        FOREIGN KEY (nl_case_id) REFERENCES natural_language_test_cases(id)
      );

      CREATE TABLE IF NOT EXISTS ai_driven_recording_step_logs (
        id TEXT PRIMARY KEY,
        run_id TEXT NOT NULL REFERENCES ai_driven_recording_runs(id) ON DELETE CASCADE,
        nl_step_index INTEGER NOT NULL,
        instruction TEXT NOT NULL,
        expected TEXT,
        success INTEGER NOT NULL DEFAULT 0,
        assertions TEXT,
        recorded_step_count INTEGER NOT NULL DEFAULT 0,
        retry_count INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER,
        error TEXT,
        provenance TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
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
      CREATE INDEX IF NOT EXISTS idx_suites_position ON suites(project_id, position);
      CREATE INDEX IF NOT EXISTS idx_test_gen_runs_status ON test_gen_runs(status);
      CREATE INDEX IF NOT EXISTS idx_test_gen_runs_thread_id ON test_gen_runs(thread_id);
      CREATE INDEX IF NOT EXISTS dynamic_variables_project_id_idx ON dynamic_variables(project_id);
      CREATE INDEX IF NOT EXISTS idx_ai_rec_project ON ai_driven_recording_runs(project_id);
      CREATE INDEX IF NOT EXISTS idx_ai_rec_status ON ai_driven_recording_runs(status);
      CREATE INDEX IF NOT EXISTS idx_ai_rec_step_run ON ai_driven_recording_step_logs(run_id);
    `);
  },
};
