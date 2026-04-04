import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load .env from the root directory
dotenv.config({ path: path.join(__dirname, '../.env') });

import { startServer } from './app/startServer.ts';

startServer();
