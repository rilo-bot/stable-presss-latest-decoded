// Load the SAME environment the API uses. The worker's cwd is apps/worker, so
// dotenv's default lookup would miss apps/server/.env — point it there
// explicitly. This module MUST be imported FIRST (before db.ts), because
// db.ts reads MONGODB_URI at module-load time; CommonJS evaluates imports in
// source order, so a bare `import './env.js'` at the top of index.ts runs this
// before any db-touching module is required.

import { config } from 'dotenv';
import path from 'node:path';

config({ path: path.resolve(__dirname, '../../server/.env') });
