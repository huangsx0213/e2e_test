import { Log } from './shared/services/logger';
import { runMigrations } from './migrations/index.ts';

runMigrations();

Log.for('migrate').info('Migrations complete');
