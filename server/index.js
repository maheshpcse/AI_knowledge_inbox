import { createApp } from './app.js';
import { createAI } from './ai.js';
import { createStore } from './store.js';
const store = createStore(process.env.DATABASE_PATH || './data/inbox.sqlite');
const server = createApp({ store, ai: createAI() }).listen(Number(process.env.PORT || 3001), '127.0.0.1', () => console.log(JSON.stringify({ event: 'listening', url: `http://127.0.0.1:${process.env.PORT || 3001}` })));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => { store.close(); process.exit(0); }));
