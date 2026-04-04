import { db } from '../shared/db/client.ts';
import type { Migration } from './types.ts';

export const migration002EnvironmentVariables: Migration = {
  id: '002_environment_variables',
  up: () => {
    try {
      // Check if the column exists
      const tableInfo = db.prepare("PRAGMA table_info(environments)").all() as Array<{ name: string }>;
      const hasVariables = tableInfo.some(col => col.name === 'variables');
      
      if (!hasVariables) {
        db.exec(`
          ALTER TABLE environments ADD COLUMN variables TEXT NOT NULL DEFAULT '{}';
        `);
      }
    } catch (error) {
      console.error('Migration 002 failed:', error);
      throw error;
    }
  },
};
