import express from 'express';
import Database from 'better-sqlite3';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import path from 'path';

// Import initial data
import { MOCK_PROJECTS, MOCK_SUITES, MOCK_HEADERS, MOCK_BODIES, MOCK_ENDPOINTS, MOCK_REPORTS } from './constants.ts';

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// Initialize SQLite database
const dbFile = path.join(process.cwd(), 'database.sqlite');
const db = new Database(dbFile);

// Setup tables
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, data TEXT);
  CREATE TABLE IF NOT EXISTS suites (id TEXT PRIMARY KEY, data TEXT);
  CREATE TABLE IF NOT EXISTS headers (id TEXT PRIMARY KEY, data TEXT);
  CREATE TABLE IF NOT EXISTS bodies (id TEXT PRIMARY KEY, data TEXT);
  CREATE TABLE IF NOT EXISTS endpoints (id TEXT PRIMARY KEY, data TEXT);
  CREATE TABLE IF NOT EXISTS reports (id TEXT PRIMARY KEY, data TEXT);
  CREATE TABLE IF NOT EXISTS environments (name TEXT PRIMARY KEY);
`);

// Seed data if empty
const seedData = () => {
  const getCount = (table: string) => db.prepare(`SELECT count(*) as count FROM ${table}`).get() as { count: number };
  
  if (getCount('projects').count === 0) {
    const insert = db.prepare('INSERT INTO projects (id, data) VALUES (?, ?)');
    const insertMany = db.transaction((items) => {
      for (const item of items) insert.run(item.id, JSON.stringify(item));
    });
    insertMany(MOCK_PROJECTS);
  }

  if (getCount('suites').count === 0) {
    const insert = db.prepare('INSERT INTO suites (id, data) VALUES (?, ?)');
    const insertMany = db.transaction((items) => {
      for (const item of items) insert.run(item.id, JSON.stringify(item));
    });
    insertMany(MOCK_SUITES);
  }

  if (getCount('headers').count === 0) {
    const insert = db.prepare('INSERT INTO headers (id, data) VALUES (?, ?)');
    const insertMany = db.transaction((items) => {
      for (const item of items) insert.run(item.id, JSON.stringify(item));
    });
    insertMany(MOCK_HEADERS);
  }

  if (getCount('bodies').count === 0) {
    const insert = db.prepare('INSERT INTO bodies (id, data) VALUES (?, ?)');
    const insertMany = db.transaction((items) => {
      for (const item of items) insert.run(item.id, JSON.stringify(item));
    });
    insertMany(MOCK_BODIES);
  }

  if (getCount('endpoints').count === 0) {
    const insert = db.prepare('INSERT INTO endpoints (id, data) VALUES (?, ?)');
    const insertMany = db.transaction((items) => {
      for (const item of items) insert.run(item.id, JSON.stringify(item));
    });
    insertMany(MOCK_ENDPOINTS);
  }

  if (getCount('reports').count === 0) {
    const insert = db.prepare('INSERT INTO reports (id, data) VALUES (?, ?)');
    const insertMany = db.transaction((items) => {
      for (const item of items) insert.run(item.id, JSON.stringify(item));
    });
    insertMany(MOCK_REPORTS);
  }

  if (getCount('environments').count === 0) {
    const insert = db.prepare('INSERT INTO environments (name) VALUES (?)');
    const insertMany = db.transaction((items) => {
      for (const item of items) insert.run(item);
    });
    insertMany(['DEV', 'SIT', 'UAT', 'PROD']);
  }
};

seedData();

// Generic CRUD endpoints
const resources = ['projects', 'suites', 'headers', 'bodies', 'endpoints', 'reports'];

resources.forEach(resource => {
  // GET all
  app.get(`/api/${resource}`, (req, res) => {
    try {
      const rows = db.prepare(`SELECT data FROM ${resource}`).all() as any[];
      res.json(rows.map(r => JSON.parse(r.data)));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET one
  app.get(`/api/${resource}/:id`, (req, res) => {
    try {
      const row = db.prepare(`SELECT data FROM ${resource} WHERE id = ?`).get(req.params.id) as any;
      if (!row) return res.status(404).json({ error: 'Not found' });
      res.json(JSON.parse(row.data));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST create
  app.post(`/api/${resource}`, (req, res) => {
    try {
      const data = req.body;
      if (!data.id) {
        data.id = Math.random().toString(36).substring(2, 9);
      }
      db.prepare(`INSERT INTO ${resource} (id, data) VALUES (?, ?)`).run(data.id, JSON.stringify(data));
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH update
  app.patch(`/api/${resource}/:id`, (req, res) => {
    try {
      const row = db.prepare(`SELECT data FROM ${resource} WHERE id = ?`).get(req.params.id) as any;
      if (!row) return res.status(404).json({ error: 'Not found' });
      
      const existingData = JSON.parse(row.data);
      const updatedData = { ...existingData, ...req.body };
      
      db.prepare(`UPDATE ${resource} SET data = ? WHERE id = ?`).run(JSON.stringify(updatedData), req.params.id);
      res.json(updatedData);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE
  app.delete(`/api/${resource}/:id`, (req, res) => {
    try {
      db.prepare(`DELETE FROM ${resource} WHERE id = ?`).run(req.params.id);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
});

// Environments endpoints
app.get('/api/environments', (req, res) => {
  try {
    const rows = db.prepare(`SELECT name FROM environments`).all() as any[];
    res.json(rows.map(r => r.name));
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/environments', (req, res) => {
  try {
    const { name } = req.body;
    db.prepare(`INSERT INTO environments (name) VALUES (?)`).run(name);
    res.json(name);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/environments/:name', (req, res) => {
  try {
    db.prepare(`DELETE FROM environments WHERE name = ?`).run(req.params.name);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function startServer() {
  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
