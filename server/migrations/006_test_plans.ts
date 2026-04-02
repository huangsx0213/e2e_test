import { Database } from 'better-sqlite3';

export function up(db: Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS test_plans (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS test_plan_scenarios (
      id TEXT PRIMARY KEY,
      plan_id TEXT NOT NULL,
      scenario_id TEXT NOT NULL,
      position INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (plan_id) REFERENCES test_plans(id) ON DELETE CASCADE,
      FOREIGN KEY (scenario_id) REFERENCES scenarios(id) ON DELETE CASCADE
    );

    ALTER TABLE execution_runs ADD COLUMN plan_id TEXT;
  `);
}

export function down(db: Database) {
  db.exec(`
    DROP TABLE IF EXISTS test_plan_scenarios;
    DROP TABLE IF EXISTS test_plans;
    -- Note: SQLite doesn't support dropping columns easily, so we leave plan_id in execution_runs
  `);
}
