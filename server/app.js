import express from 'express';
import OpenAI from 'openai';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { AppError, publicError } from './errors.js';
import { chunkText, retrieve } from './rag.js';
import { fetchPage } from './url.js';
export function createApp({ store, ai, fetchUrl = fetchPage, logger = console }) {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    const started = Date.now(); req.id = randomUUID();
    res.setHeader('X-Request-Id', req.id);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.on('finish', () => logger.log(JSON.stringify({ event: 'request', requestId: req.id, method: req.method, path: req.path, status: res.statusCode, durationMs: Date.now() - started })));
    next();
  });
  app.use(express.json({ limit: '256kb' }));
  const router = express.Router();
  router.get('/items', (_req, res) => res.json({ items: store.list() }));
  router.post('/ingest', async (req, res) => {
    const { type, content, url } = req.body || {};
    if (!['note', 'url'].includes(type)) throw new AppError(400, 'INVALID_TYPE', 'Choose note or url as the source type.');
    const input = type === 'note' ? content : url;
    if (typeof input !== 'string' || !input.trim() || input.length > (type === 'note' ? 50000 : 2048)) throw new AppError(400, 'INVALID_INPUT', type === 'note' ? 'Enter a note between 1 and 50,000 characters.' : 'Enter a URL between 1 and 2,048 characters.');
    const source = type === 'url' ? await fetchUrl(input.trim()) : { content: input.trim(), rawContent: input, title: input.trim().split('\n')[0].slice(0, 100), url: null };
    const chunks = chunkText(source.content);
    const vectors = await ai.embed(chunks);
    const item = { id: randomUUID(), type, ...source, createdAt: new Date().toISOString() };
    store.save(item, chunks, vectors, ai.model);
    const { rawContent, ...publicItem } = item;
    res.status(201).json({ item: publicItem, chunkCount: chunks.length });
  });
  router.post('/query', async (req, res) => {
    const question = req.body?.question;
    if (typeof question !== 'string' || !question.trim() || question.length > 2000) throw new AppError(400, 'INVALID_QUESTION', 'Enter a question between 1 and 2,000 characters.');
    const chunks = store.chunks(ai.model);
    if (!chunks.length) return res.json({ answer: 'Save a note or URL first so I have sources to work with.', citations: [] });
    const [vector] = await ai.embed([question.trim()]);
    const sources = retrieve(chunks, vector);
    if (!sources.length) return res.json({ answer: 'I could not find relevant information in your saved content. Try adding a source about this topic.', citations: [] });
    const answer = await ai.answer(question.trim(), sources);
    const cited = [...answer.matchAll(/\[(\d+)\]/g)].map(m => Number(m[1]));
    if (cited.some(n => n < 1 || n > sources.length)) throw new AppError(502, 'INVALID_CITATION', 'The AI returned an invalid citation. Please ask again.');
    res.json({ answer, citations: sources.map((s, i) => ({ number: i + 1, itemId: s.item_id, chunkId: s.id, title: s.title, url: s.url, type: s.type, snippet: s.content, score: Number(s.score.toFixed(4)) })).filter(c => cited.includes(c.number)) });
  });
  app.use('/api', router);
  app.use('/', router);
  const dist = resolve('dist');
  if (existsSync(dist)) { app.use(express.static(dist)); app.get('/', (_req, res) => res.sendFile(resolve(dist, 'index.html'))); }
  app.use((_req, _res, next) => next(new AppError(404, 'NOT_FOUND', 'Endpoint not found.')));
  app.use((error, req, res, _next) => {
    const failure = publicError(error);
    // Log only diagnostic identifiers, never upstream messages, keys, or content.
    const provider = error instanceof OpenAI.APIError ? {
      providerStatus: error.status, providerCode: error.code,
      providerType: error.type, providerRequestId: error.request_id,
    } : {};
    logger.error(JSON.stringify({ event: 'error', requestId: req.id, status: failure.status, code: failure.code, ...provider }));
    res.status(failure.status).json({ error: { code: failure.code, message: failure.message, requestId: req.id } });
  });
  return app;
}
