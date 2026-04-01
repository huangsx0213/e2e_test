import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration005: Migration = {
  id: '005_scenario_iteration_strategy',
  up: () => {
    db.exec(`
      ALTER TABLE scenario_suites ADD COLUMN iteration_strategy TEXT DEFAULT 'SCENARIO_DRIVEN';

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
      
      CREATE INDEX IF NOT EXISTS idx_scenario_variables_scenario ON scenario_variables(scenario_id, position);
      CREATE INDEX IF NOT EXISTS idx_scenario_rows_scenario ON scenario_data_rows(scenario_id, row_index);
    `);
  },
};
