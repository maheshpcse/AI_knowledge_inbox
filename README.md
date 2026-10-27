# AI Knowledge Inbox

A small, single-user React + Express application for saving notes and web pages, then asking questions with source-backed AI answers. Built for the Turium AI full-stack assessment. No authentication, hosted database, or additional infrastructure.

## Run locally

Requires **Node.js 24+**, npm, and an OpenAI API key with access to the configured models.

```powershell
npm install
Copy-Item .env.example .env
# Set OPENAI_API_KEY in .env (server-side only)
npm run dev
```

Open **http://localhost:5173**. API: **http://127.0.0.1:3001**. On Windows with a restrictive PowerShell execution policy, use `npm.cmd` instead of `npm`. If npm cannot write its default cache, add `--cache .npm-cache` to `npm install`.

For a single-process production build:

```sh
npm run build
npm start
```

Open **http://127.0.0.1:3001**. `npm test` runs backend unit and HTTP integration tests. The server binds to loopback intentionally: this unauthenticated assessment app is for local use.

Only `OPENAI_API_KEY` must be supplied. Create it at https://platform.openai.com/api-keys and paste it into your local `.env`. Model names are built-in defaults, and SQLite creates its database file automatically; no database account or server is needed. The remaining environment variables are optional overrides.

Configuration is in `.env.example`: API key, embedding model (`text-embedding-3-small`), answer model (`gpt-4.1-mini`), API port, SQLite path. If changing the API port in development, update the proxy target in `vite.config.js`. No credentials are bundled into the frontend. Without a key, the UI and saved-item listing work, while ingestion returns an actionable 503 error. There is no fake AI fallback. OpenAI requests incur usage charges.

## How it works

1. A note is validated, or a URL is fetched on the server. HTML is stored raw and readable text extracted; navigation, scripts, forms, and style content are excluded.
2. Text is split into chunks of up to **1,600 characters**, preferring nearby paragraph, sentence, or word boundaries, with **240 characters of overlap**. This simple strategy preserves context across boundaries and bounds token sizes even for dense text. It is not a tokenizer or document-aware parser.
3. OpenAI embeds the chunks in one batch. The item, raw source, UTC timestamp, type, chunk text, model identifier, and vectors are committed together in a SQLite transaction. A failed AI call leaves no partially saved item.
4. Questions are embedded with the same model. Cosine similarity ranks stored vectors; the top five chunks with score >= 0.2 become context. This heuristic threshold is not a calibrated confidence score.
5. The Responses API answers using only retrieved passages, with numbered inline references. Citation numbers are validated against retrieved chunks and returned with exact snippets and source metadata. The UI links references to their source cards. Empty retrieval returns a helpful message without invoking generation.

The generation prompt treats saved pages as untrusted data and asks for abstention when evidence is insufficient. This reduces, but does not eliminate, hallucination and prompt injection; citations do not prove factual support.

## API

| Method | Route | Request | Success |
| --- | --- | --- | --- |
| POST | `/ingest` | `{ "type": "note", "content": "The launch is Friday." }` | 201 `{ item, chunkCount }` |
| POST | `/ingest` | `{ "type": "url", "url": "https://example.com" }` | 201 `{ item, chunkCount }` |
| GET | `/items` | — | 200 `{ items: [...] }` |
| POST | `/query` | `{ "question": "When is the launch?" }` | 200 `{ answer, citations: [...] }` |

The same routes are available under `/api` for the frontend. An item contains `id`, `type`, `title`, `url`, `content`, and `createdAt`. A citation contains `number`, `itemId`, `chunkId`, `title`, `url`, `type`, `snippet`, and `score`. Raw HTML is retained in storage and never rendered in the browser. AI output is rendered as text, not HTML.

Errors use `{ "error": { "code": "...", "message": "...", "requestId": "..." } }`. Statuses include 400 validation, 413 oversized request, 422 unreadable/unsupported URL, 429 upstream rate limit, 502 upstream AI/invalid citation, 503 missing API configuration, and 504 URL timeout. JSON logs record request ID, path, status, and duration without source content or credentials.

Limits: 50,000 characters per note/extracted page, 2,048 per URL, 2,000 per question, 2 MB URL responses, four redirects, 12-second deadline per fetched URL, and 45-second timeout per AI request with no automatic retries. Only public HTTP(S) pages on standard ports are supported. Each redirect is validated and DNS is pinned to a verified public address to reduce SSRF risk. JavaScript-rendered pages, PDFs, login-required pages, and blocked scrapers are not supported.

## Design and organization

The single-screen UI uses assessment **Palette A**: Arctic Powder, Nocturnal, Mystic Mint, and restrained Forsytha/Deep Saffron accents. Nunito Sans is bundled locally. Light/dark themes, responsive columns, keyboard focus, labelled inputs, live feedback, loading states, reduced-motion support, and citation anchors keep the required interactions accessible without additional screens.

- `src/`: React app, focused forms/list/answer components, API helper, theme CSS.
- `server/app.js`: validation, routes, structured request/error logging.
- `server/ai.js`: OpenAI embeddings and generation.
- `server/rag.js`: chunking and similarity retrieval.
- `server/store.js`: SQLite schema and transactions.
- `server/url.js`: bounded public-URL fetching and text extraction.
- `tests/`: chunking, vector ranking, URL validation, API behavior, persistence, atomic writes, failures, and citations.

## Tradeoffs and production considerations

**Storage:** SQLite with JSON vectors keeps setup minimal and persists across restarts; no vector service is needed. Searches load vectors into memory and scan them in O(chunks × dimensions). Synchronous SQLite operations and returning all saved items are appropriate for a small personal inbox, not a large collection.

**Scaling:** Move embeddings to an indexed vector store as data grows. Introduce bounded worker queues, backpressure, pagination, retries with idempotency, rate limits, and caching as needed. Ingestion currently runs asynchronously within the HTTP request; it is not a durable background job. Keep the browser open while saving.

**Production:** Add authentication and per-user isolation before exposing the app, TLS, secrets management, quotas, content retention controls, SQLite backups/migrations, monitoring, retrieval evaluations, and hardened network egress rules. Add tokenizer-aware/document-aware chunking and better extraction only where real data warrants them. Content and questions are sent to OpenAI; answer storage is disabled via `store: false`. Review provider retention policies before using sensitive data.

**Model changes:** Vectors are tagged by embedding model and only matching vectors are searched. Changing the embedding model requires re-ingesting existing content (or a future reindex migration). Do not mix embedding spaces.

**Verification limits:** Automated tests use an injected deterministic AI service to validate orchestration without credentials or cost. They do not establish live semantic quality or OpenAI availability. To verify live: configure your key, save a launch-date note, save a public URL, restart the server to confirm persistence, ask about the launch date, and follow the returned citation. Also ask an unrelated question and inspect abstention. Inspect desktop/mobile layouts and both themes in your browser.

Official integration references: [embeddings](https://developers.openai.com/api/docs/guides/embeddings), [text generation](https://developers.openai.com/api/docs/guides/text).

This directory is ready to push to a GitHub repository; no remote is preconfigured.

### OpenAI quota errors

`AI_QUOTA_EXCEEDED` means API credits or a spend/usage limit must be addressed in OpenAI Platform. `credit_balance_exhausted` specifically requires adding API credits. Waiting and retrying does not replenish credits. `AI_RATE_LIMITED` means temporary request throttling. The server logs only safe provider diagnostic codes, not your key or submitted content. See https://developers.openai.com/api/docs/guides/error-codes.
