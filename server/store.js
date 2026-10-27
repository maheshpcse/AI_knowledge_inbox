import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
export function createStore(path = './data/inbox.sqlite') {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS items (id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL, url TEXT, content TEXT NOT NULL, raw_content TEXT NOT NULL, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chunks (id TEXT PRIMARY KEY, item_id TEXT NOT NULL REFERENCES items(id), content TEXT NOT NULL, vector TEXT NOT NULL, model TEXT NOT NULL);`);
  const publicItem = row => ({ id: row.id, type: row.type, title: row.title, url: row.url, content: row.content, createdAt: row.created_at });
  return {
    list: () => db.prepare('SELECT id,type,title,url,content,created_at FROM items ORDER BY created_at DESC').all().map(publicItem),
    chunks: model => db.prepare('SELECT c.id,c.item_id,c.content,c.vector,i.title,i.url,i.type FROM chunks c JOIN items i ON i.id=c.item_id WHERE c.model=?').all(model).map(c => ({ ...c, vector: JSON.parse(c.vector) })),
    save(item, chunks, vectors, model) {
      db.exec('BEGIN');
      try {
        db.prepare('INSERT INTO items VALUES (?,?,?,?,?,?,?)').run(item.id, item.type, item.title, item.url, item.content, item.rawContent, item.createdAt);
        const stmt = db.prepare('INSERT INTO chunks VALUES (?,?,?,?,?)');
        chunks.forEach((content, i) => stmt.run(`${item.id}-${i}`, item.id, content, JSON.stringify(vectors[i]), model));
        db.exec('COMMIT');
      } catch (error) { db.exec('ROLLBACK'); throw error; }
    },
    close: () => db.close()
  };
}
