import { useEffect, useState } from 'react';
import { Moon, Sun, Layers2, ArrowDownLeft } from 'lucide-react';
import { api } from './api';
import { AddContent, SavedItems, AskQuestions, LoadingWorkspace } from './components';
export default function App() {
  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('inbox-theme') || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); } catch { return 'light'; } });
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => { document.documentElement.dataset.theme = theme; try { localStorage.setItem('inbox-theme', theme); } catch {} }, [theme]);
  async function loadItems() { setLoading(true); setError(''); try { const data = await api('/items'); setItems(data.items); } catch (err) { setError(err.message); } finally { setLoading(false); } }
  useEffect(() => { loadItems(); }, []);
  return <><a className="skip-link" href="#main">Skip to content</a><header className="app-header"><a className="brand" href="/" aria-label="AI Knowledge Inbox home"><span className="brand-mark"><Layers2 size={24}/></span><span>turium<span className="brand-ai">ai</span><small>KNOWLEDGE INBOX</small></span></a><div className="header-right"><span className="workspace-label">A little space for big ideas</span><button className="theme-toggle" onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} theme`}>{theme === 'light' ? <Moon size={19}/> : <Sun size={19}/>}</button></div></header><main id="main">{loading ? <LoadingWorkspace/> : <><div className="page-heading"><div><div className="eyebrow"><span className="small-line"/> YOUR PERSONAL KNOWLEDGE SPACE</div><h1>Keep the good stuff.<br className="mobile-break"/> <span>Make sense of it.</span></h1><p>Notes, links, and the answers hiding between them. All in one inbox.</p></div><ArrowDownLeft className="heading-arrow" size={40} strokeWidth={1.3}/></div><div className="workspace"><div className="left-column"><AddContent onSaved={item => setItems(old => [item, ...old])}/><SavedItems items={items} loading={loading} error={error} retry={loadItems}/></div><AskQuestions hasItems={items.length > 0}/></div></>}</main></>;
}
