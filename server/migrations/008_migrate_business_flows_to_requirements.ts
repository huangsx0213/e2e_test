import { db } from '../shared/db/client.ts';
import { Log } from '../shared/services/logger.ts';
import { randomId } from '../shared/utils/index.ts';
import type { Migration } from './types.ts';

export const migration008MigrateBusinessFlows: Migration = {
  id: '008_migrate_business_flows_to_requirements',
  up: () => {
    // Check if business_flows table exists
    const tableExists = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='business_flows'"
    ).get();

    if (!tableExists) {
      Log.for('migration-008').info('business_flows table not found, skipping migration');
      return;
    }

    const flows = db.prepare('SELECT * FROM business_flows').all() as any[];
    if (flows.length === 0) {
      Log.for('migration-008').info('No business flows to migrate');
      return;
    }

    const projectsWithFlows = new Set(flows.map(f => f.project_id));

    for (const projectId of projectsWithFlows) {
      // Create "System Flows" epic if not exists
      const existingEpic = db.prepare(
        "SELECT id FROM requirements WHERE project_id = ? AND title = 'System Flows' AND level = 'epic'"
      ).get(projectId);

      let epicId: string;
      if (existingEpic) {
        epicId = (existingEpic as any).id;
      } else {
        epicId = randomId('req');
        db.prepare(`
          INSERT INTO requirements (id, project_id, parent_id, title, description, dependencies, level, status, position, human_id, flow_type, type, is_flow, related_requirement_ids)
          VALUES (?, ?, NULL, 'System Flows', 'Auto-created epic for migrated business flows', '[]', 'epic', 'APPROVED', 0, 'FLOW-0', NULL, 'functional', 0, '[]')
        `).run(epicId, projectId);
        Log.for('migration-008').info(`Created System Flows epic for project ${projectId}`);
      }

      // Migrate each flow
      const projectFlows = flows.filter(f => f.project_id === projectId);
      let position = 0;
      for (const flow of projectFlows) {
        const storyId = flow.id;
        const existingStory = db.prepare('SELECT id FROM requirements WHERE id = ?').get(storyId);
        if (existingStory) {
          Log.for('migration-008').info(`Flow story ${storyId} already exists, skipping`);
          continue;
        }

        db.prepare(`
          INSERT INTO requirements (id, project_id, parent_id, title, description, dependencies, level, status, position, human_id, flow_type, type, is_flow, related_requirement_ids)
          VALUES (?, ?, ?, ?, ?, '[]', 'story', ?, ?, NULL, NULL, 'functional', 1, '[]')
        `).run(
          storyId,
          projectId,
          epicId,
          flow.name,
          flow.description || '',
          flow.status || 'DRAFT',
          position++,
        );

        // Create AC for each step
        const steps = JSON.parse(flow.steps || '[]');
        for (const step of steps) {
          const acId = randomId('req');
          const requirementIds = JSON.stringify(step.requirementIds || []);
          db.prepare(`
            INSERT INTO requirements (id, project_id, parent_id, title, description, dependencies, level, status, position, human_id, flow_type, type, is_flow, related_requirement_ids)
            VALUES (?, ?, ?, ?, '', '[]', 'ac', 'DRAFT', ?, NULL, 'flow', 'functional', 0, ?)
          `).run(
            acId,
            projectId,
            storyId,
            step.actionSummary || `Step ${step.sequence}`,
            step.sequence || 0,
            requirementIds,
          );
        }

        Log.for('migration-008').info(`Migrated flow ${flow.name} (${steps.length} steps)`);
      }
    }

    Log.for('migration-008').info(`Migration complete: ${flows.length} flows migrated`);
  },
};
