import OpenAI from 'openai';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.js';
import { createStore } from '../server/store.js';
import { chunkText, cosine, retrieve } from '../server/rag.js';
import { isPublicAddress, validateUrl } from '../server/url.js';
import { createAI } from '../server/ai.js';

test('chunk boundaries preserve all text with overlap and bounded lengths', () => {
  const text = 'A useful sentence about knowledge. '.repeat(180);
  const chunks = chunkText(text);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every(c => c.length <= 1600));
  for (let i = 1; i < chunks.length; i++) assert.ok(chunks[i - 1].includes(chunks[i].slice(0, 100)));
  assert.deepEqual(chunkText('   '), []);
  assert.deepEqual(chunkText('One short note.'), ['One short note.']);
  assert.equal(chunkText('字'.repeat(4000)).length, 3);
});

test('cosine retrieval ranks semantically supplied vectors and excludes unrelated chunks', () => {
  assert.equal(cosine([1, 0], [1, 0]), 1);
  assert.equal(cosine([0, 0], [1, 0]), 0);
  assert.equal(cosine([1], [1, 0]), -1);
  const found = retrieve([{ id: 'a', vector: [0, 1] }, { id: 'b', vector: [1, 0] }, { id: 'c', vector: [.8, .2] }], [1, 0]);
  assert.deepEqual(found.map(c => c.id), ['b', 'c']);
});

test('URL protection rejects private IPv4, IPv6, mapped addresses and unsafe protocols', async () => {
  for (const address of ['127.0.0.1', '10.0.0.1', '169.254.169.254', '192.168.1.1', '::1', 'fc00::1', '::ffff:127.0.0.1', '0.0.0.0']) assert.equal(isPublicAddress(address), false, address);
  assert.equal(isPublicAddress('93.184.216.34'), true);
  for (const url of ['file:///etc/passwd', 'http://user:pass@example.com', 'http://127.0.0.1', 'http://[::1]', 'http://example.com:1234']) await assert.rejects(validateUrl(url));
});

async function fixture(t, overrides = {}) {
  const store = createStore(':memory:');
  const calls = [];
  const ai = { model: 'test-model', embed: async texts => texts.map(text => /garden/i.test(text) ? [0, 1] : [1, 0]), answer: async (question, sources) => { calls.push({ question, sources }); return 'The launch is on Friday. [1]'; }, ...overrides };
  const app = createApp({ store, ai, logger: { log() {}, error() {} }, fetchUrl: async url => ({ title: 'Release plan', url, content: 'The launch is on Friday.', rawContent: '<html><p>The launch is on Friday.</p></html>' }) });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); store.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(path, body) { const response = await fetch(base + path, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}); return { status: response.status, data: await response.json() }; }
  return { store, request, calls, base };
}

test('all endpoints: note + URL ingestion, metadata, stored vectors, retrieval, grounded citations', async t => {
  const { request, store, calls } = await fixture(t);
  assert.deepEqual((await request('/items')).data.items, []);
  assert.equal((await request('/query', { question: 'When is launch?' })).data.citations.length, 0);
  const saved = await request('/ingest', { type: 'note', content: 'Launch plan\nThe launch is on Friday.' });
  assert.equal(saved.status, 201); assert.equal(saved.data.item.type, 'note'); assert.ok(saved.data.item.createdAt); assert.ok(saved.data.item.id);
  assert.equal(saved.data.chunkCount, 1);
  const url = await request('/ingest', { type: 'url', url: 'https://example.com' });
  assert.equal(url.status, 201); assert.equal(url.data.item.url, 'https://example.com');
  assert.equal((await request('/api/items')).data.items.length, 2);
  assert.equal(store.chunks('test-model').length, 2);
  assert.equal(store.chunks('different-model').length, 0);
  const answer = await request('/query', { question: 'When is the launch?' });
  assert.equal(answer.status, 200); assert.match(answer.data.answer, /Friday/); assert.equal(answer.data.citations[0].number, 1); assert.match(answer.data.citations[0].snippet, /Friday/);
  assert.equal(calls.length, 1); assert.ok(calls[0].sources.length);
  const unrelated = await request('/query', { question: 'How does a garden grow?' });
  assert.equal(unrelated.data.citations.length, 0); assert.equal(calls.length, 1);
});

test('invalid inputs, malformed JSON and missing endpoints return structured errors', async t => {
  const { request, base } = await fixture(t);
  for (const body of [{}, { type: 'note', content: ' ' }, { type: 'note', content: 42 }, { type: 'note', content: 'a'.repeat(50001) }, { type: 'other', content: 'x' }]) assert.equal((await request('/ingest', body)).status, 400);
  for (const question of ['', ' ', 42, 'x'.repeat(2001)]) assert.equal((await request('/query', { question })).status, 400);
  assert.equal((await request('/missing')).status, 404);
  const malformed = await fetch(base + '/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(malformed.status, 400); assert.ok((await malformed.json()).error.requestId);
});

test('failed embedding does not save partial records; invalid citations fail clearly', async t => {
  const first = await fixture(t, { embed: async () => { throw Error('provider failed'); } });
  assert.equal((await first.request('/ingest', { type: 'note', content: 'A note' })).status, 500);
  assert.equal(first.store.list().length, 0);
  const second = await fixture(t, { answer: async () => 'Invented answer [99]' });
  await second.request('/ingest', { type: 'note', content: 'A note' });
  assert.equal((await second.request('/query', { question: 'Explain?' })).status, 502);
});

test('SQLite persists content and vectors across restarts and rolls back failed transactions', () => {
  const directory = mkdtempSync(join(tmpdir(), 'knowledge-test-'));
  let store;
  try {
    const path = join(directory, 'inbox.sqlite'); store = createStore(path);
    const item = { id: 'item-1', type: 'note', title: 'Note', content: 'A note', rawContent: ' A note ', url: null, createdAt: new Date().toISOString() };
    store.save(item, ['A note'], [[1, 0]], 'test');
    assert.throws(() => store.save({ ...item, id: 'item-2' }, ['broken'], [undefined], 'test'));
    assert.equal(store.list().length, 1);
    store.close(); store = createStore(path);
    assert.equal(store.list()[0].content, 'A note'); assert.deepEqual(store.chunks('test')[0].vector, [1, 0]);
  } finally { store?.close(); rmSync(directory, { recursive: true, force: true }); }
});

test('missing AI configuration produces an actionable error', async () => {
  const previous = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try { await assert.rejects(createAI().embed(['hello']), error => error.status === 503 && error.code === 'AI_NOT_CONFIGURED'); }
  finally { if (previous !== undefined) process.env.OPENAI_API_KEY = previous; }
});

for (const [status, providerCode, type, expectedStatus, expectedCode, message] of [
  [429, 'credit_balance_exhausted', 'insufficient_quota', 429, 'AI_QUOTA_EXCEEDED', /Add credits/],
  [429, 'insufficient_quota', 'insufficient_quota', 429, 'AI_QUOTA_EXCEEDED', /credit balance/],
  [429, 'project_spend_limit_exceeded', 'insufficient_quota', 429, 'AI_QUOTA_EXCEEDED', /project spend limit/],
  [429, 'rate_limit_exceeded', 'rate_limit_error', 429, 'AI_RATE_LIMITED', /Wait/],
  [401, 'invalid_api_key', 'authentication_error', 503, 'AI_AUTH_FAILED', /API key/],
  [500, 'server_error', 'server_error', 502, 'AI_UNAVAILABLE', /unavailable/],
]) {
  test('ingestion classifies provider error: ' + providerCode, async t => {
    const upstream = new OpenAI.APIError(status, { code: providerCode, type, message: 'sensitive upstream details' }, undefined, new Headers());
    const { request, store } = await fixture(t, { embed: async () => { throw upstream; } });
    const result = await request('/ingest', { type: 'note', content: 'A note to index' });
    assert.equal(result.status, expectedStatus);
    assert.equal(result.data.error.code, expectedCode);
    assert.match(result.data.error.message, message);
    assert.ok(!JSON.stringify(result.data).includes('sensitive upstream details'));
    assert.equal(store.list().length, 0);
  });
}
