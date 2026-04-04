import fs from 'node:fs';
import path from 'path';
import { db } from '../shared/db/client.ts';

export function runSeed() {
  const seedDataFile = path.join(process.cwd(), 'server', 'migrations', 'seed_data.json');
  if (!fs.existsSync(seedDataFile)) {
    console.log('⚠️ No seed data found.');
    return;
  }

  const data = JSON.parse(fs.readFileSync(seedDataFile, 'utf8'));
  console.log('🌱 Applying database seeds...');

  db.transaction(() => {
    for (const [table, rows] of Object.entries(data)) {
      if (!Array.isArray(rows) || rows.length === 0) continue;

      const columns = Object.keys(rows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      
      try {
        const stmt = db.prepare(`INSERT OR REPLACE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`);
        
        for (const row of (rows as any[])) {
          const values = columns.map(col => row[col]);
          stmt.run(...values);
        }
      } catch (err) {
        console.warn(`Could not seed table ${table}:`, err.message);
      }
    }
  })();
  
  console.log('✅ Seeding complete.');
}
