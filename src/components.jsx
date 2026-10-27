import { useState } from 'react';
import { ArrowUpRight, Plus, FileText, Link2, LoaderCircle, ArrowUp, Sparkles, Inbox } from 'lucide-react';
import { api } from './api';

function LoadingLines({ label, compact = false }) {
  return <div className={compact ? 'loading-lines compact' : 'loading-lines'} role="status" aria-label={label}>
    <span className="sr-only">{label}</span>
    <span className="skeleton skeleton-heading" aria-hidden="true" />
    <span className="skeleton skeleton-line" aria-hidden="true" />
    <span className="skeleton skeleton-line skeleton-short" aria-hidden="true" />
  </div>;
}

export function AddContent({ onSaved }) {
  const [type, setType] = useState('note');
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function submit(event) {
    event.preventDefault(); setError(''); setSuccess('');
    if (!value.trim()) return setError(type === 'note' ? 'Write a note before saving.' : 'Enter a website URL.');
    if (type === 'url') { try { if (!['http:', 'https:'].includes(new URL(value).protocol)) throw Error(); } catch { return setError('Enter a complete URL starting with https:// or http://.'); } }
    setBusy(true);
    try { const data = await api('/ingest', { type, [type === 'note' ? 'content' : 'url']: value }); onSaved(data.item); setValue(''); setSuccess('Saved and ready for your questions.'); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <section className="panel capture" aria-labelledby="capture-title">
    <div className="section-heading"><span className="icon-tile"><Plus size={19}/></span><h2 id="capture-title">A little knowledge goes a long way.</h2></div>
    <div className="segmented" aria-label="Content type">{[['note', FileText, 'Write a note'], ['url', Link2, 'Save a URL']].map(([id, Icon, label]) => <button key={id} type="button" aria-pressed={type === id} disabled={busy} className={type === id ? 'selected' : ''} onClick={() => { setType(id); setValue(''); setError(''); setSuccess(''); }}><Icon size={16}/>{label}</button>)}</div>
    <form onSubmit={submit}>
      <label htmlFor="content">{type === 'note' ? 'Your note' : 'Website URL'}</label>
      {type === 'note' ? <textarea id="content" maxLength={50000} value={value} onChange={e => { setValue(e.target.value); setError(''); setSuccess(''); }} placeholder="An idea, a useful passage, something worth remembering…" disabled={busy} aria-invalid={!!error} aria-describedby="capture-feedback"/> : <input id="content" type="url" maxLength={2048} value={value} onChange={e => { setValue(e.target.value); setError(''); setSuccess(''); }} placeholder="https://example.com/article" disabled={busy} aria-invalid={!!error} aria-describedby="capture-feedback"/>}
      <div className="form-bottom"><span className="hint">{type === 'note' ? `${value.length.toLocaleString()} / 50,000 characters` : 'Public articles & text pages'}</span><button className="primary" disabled={busy}>{busy ? <LoaderCircle className="spin" size={16}/> : <Plus size={16}/>} {busy ? type === 'url' ? 'Fetching & processing…' : 'Processing note…' : 'Save to inbox'}</button></div>
      <div id="capture-feedback" aria-live="polite">{busy && <LoadingLines label={type === 'url' ? 'Fetching and indexing the page' : 'Indexing your note'} compact/>}{error && <p className="error" role="alert">{error}</p>}{success && <p className="success">{success}</p>}</div>
    </form>
  </section>;
}
export function SavedItems({ items, loading, error, retry }) {
  return <section aria-labelledby="items-title" className="saved-section"><div className="list-heading"><h2 id="items-title">Your saved knowledge <span className="count">{items.length}</span></h2><span className="eyebrow">NEWEST FIRST</span></div>
    {loading ? <div className="items"><LoadingLines label="Loading saved items"/><LoadingLines label="Loading more saved items"/></div> : error ? <div className="panel"><p className="error" role="alert">{error}</p><button className="secondary" onClick={retry}>Try again</button></div> : !items.length ? <div className="empty-library"><Inbox size={28}/><h3>A home for your useful finds.</h3><p>Save your first note or URL above. Your knowledge will appear here.</p></div> : <div className="items">{items.map(item => <article className="item-card" key={item.id} id={`item-${item.id}`}><div className="item-top"><span className={`source-label ${item.type}`} >{item.type === 'url' ? <Link2 size={14}/> : <FileText size={14}/>} {item.type === 'url' ? 'WEBSITE' : 'NOTE'}</span><time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></div><h3>{item.title}</h3>{item.url && <a className="source-url" href={item.url} target="_blank" rel="noreferrer">{new URL(item.url).hostname}<ArrowUpRight size={14}/></a>}<details><summary>Read saved content</summary><p className="saved-content">{item.content}</p></details></article>)}</div>}
  </section>;
}
export function AskQuestions({ hasItems }) {
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState(null);
  const [asked, setAsked] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (!question.trim()) return setError('Enter a question about your saved content.');
    setBusy(true); setResult(null); setAsked(question.trim());
    try { setResult(await api('/query', { question })); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  function answerText(text) {
    return text.split(/(\[\d+\])/g).map((part, i) => /^\[\d+\]$/.test(part) && result.citations.some(c => c.number === Number(part.slice(1, -1))) ? <a className="citation-link" key={i} href={`#citation-${part.slice(1, -1)}`} aria-label={`Read source ${part}`}>{part}</a> : part);
  }
  return <section className="panel ask" aria-labelledby="ask-title"><div className="ask-header"><span className="icon-tile accent"><Sparkles size={20}/></span><span className="eyebrow">CONNECT THE DOTS</span></div><h2 id="ask-title">Your knowledge. <span>A new perspective.</span></h2><p className="intro">Ask a question. Find an answer grounded in the things you’ve saved.</p>
    <form onSubmit={submit}><label htmlFor="question">What would you like to know?</label><textarea id="question" value={question} onChange={e => { setQuestion(e.target.value); setError(''); }} maxLength={2000} disabled={busy} aria-invalid={!!error} aria-describedby="query-feedback" placeholder="What do my notes say about…"/><button className="primary ask-button" disabled={busy || !question.trim()}>{busy ? <LoaderCircle className="spin" size={17}/> : <Sparkles size={17}/>} {busy ? 'Finding your answer…' : 'Ask your inbox'}{!busy && <ArrowUp size={18}/>}</button><div id="query-feedback" aria-live="polite">{!hasItems && !error && <p className="hint">Save a note or URL to get answers grounded in your content.</p>}{error && <p className="error" role="alert">{error}</p>}</div></form>
    <div className="answer-area" aria-live="polite" aria-busy={busy}>{busy ? <div className="answer-loading"><span className="eyebrow">READING YOUR SOURCES</span><LoadingLines label="Generating an answer from your sources" compact/><p>Finding relevant passages and connecting the details…</p></div> : result ? <><div className="answer-heading"><Sparkles size={16}/><h3>From your inbox</h3></div><p className="asked">{asked}</p><p className="answer-text">{answerText(result.answer)}</p>{result.citations.length > 0 && <div className="citations"><h4>Sources behind this answer <span className="count">{result.citations.length}</span></h4>{result.citations.map(c => <article className="citation" id={`citation-${c.number}`} key={c.number}><div className="citation-title"><span className="citation-number">{c.number}</span><h3>{c.title}</h3></div><p>{c.snippet}</p><a href={c.url || `#item-${c.itemId}`} target={c.url ? '_blank' : undefined} rel={c.url ? 'noreferrer' : undefined}>{c.url ? 'Open website' : 'View saved note'}<ArrowUpRight size={14}/></a></article>)}</div>}</> : <div className="answer-empty"><div className="outline-symbol"><Sparkles size={26}/></div><h3>Less searching. More understanding.</h3><p>{hasItems ? 'Ask your first question to bring your saved ideas together.' : 'Add a little knowledge to your inbox, then let your curiosity take it from there.'}</p><span className="grounded"><span/> Answers with sources, always in context.</span></div>}</div>
  </section>;
}

export function LoadingWorkspace() {
  return <div className="workspace-loading" aria-busy="true" aria-label="Loading your knowledge inbox">
    <div className="page-heading-loading" aria-hidden="true">
      <span className="skeleton skeleton-heading" />
      <span className="skeleton skeleton-title" />
      <span className="skeleton skeleton-line skeleton-short" />
    </div>
    <div className="workspace">
      <div className="left-column">
        <section className="panel capture-loading">
          <LoadingLines label="Loading content form" compact />
          <span className="skeleton skeleton-tabs" aria-hidden="true" />
          <span className="skeleton skeleton-field" aria-hidden="true" />
          <span className="skeleton skeleton-button" aria-hidden="true" />
        </section>
        <div className="saved-section items">
          <LoadingLines label="Loading saved knowledge" />
          <LoadingLines label="Loading saved sources" />
        </div>
      </div>
      <section className="panel ask-loading">
        <LoadingLines label="Loading question form" compact />
        <span className="skeleton skeleton-field" aria-hidden="true" />
        <span className="skeleton skeleton-button" aria-hidden="true" />
        <div className="answer-area"><LoadingLines label="Loading answer area" compact /></div>
      </section>
    </div>
  </div>;
}
