import dotenv from 'dotenv';
import path from 'path';

// Explicitly load .env from the root directory
dotenv.config({ path: path.join(process.cwd(), '.env') });

import { startServer } from './app/startServer.ts';

startServer();
