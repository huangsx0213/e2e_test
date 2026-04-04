import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration003StepExtractors: Migration = {
  id: '003_step_extractors',
  up: () => {
    try {
      const tables = ['suite_steps', 'case_steps', 'module_steps'];
      
      for (const table of tables) {
        const tableInfo = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
        const hasExtractors = tableInfo.some(col => col.name === 'extractors');
        
        if (!hasExtractors) {
          db.exec(`
            ALTER TABLE ${table} ADD COLUMN extractors TEXT;
          `);
        }
      }
    } catch (error) {
      console.error('Migration 003 failed:', error);
      throw error;
    }
  },
};
