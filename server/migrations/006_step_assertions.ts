import { Log } from '../shared/services/logger';
import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration006StepAssertions: Migration = {
  id: '006_step_assertions',
  up: () => {
    try {
      const tables = ['suite_steps', 'case_steps', 'module_steps'];
      const columns = [
        { name: 'assertions', type: 'TEXT' },
        { name: 'wait_for_network', type: 'TEXT' },
        { name: 'network_mocks', type: 'TEXT' }
      ];
      
      for (const table of tables) {
        const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
        
        for (const column of columns) {
          const hasColumn = tableInfo.some(col => col.name === column.name);
          if (!hasColumn) {
            db.exec(`
              ALTER TABLE ${table} ADD COLUMN ${column.name} ${column.type};
            `);
          }
        }
      }
    } catch (error) {
      Log.for('migrate').error(`Migration 006 failed: ${error}`);
      throw error;
    }
  },
};
