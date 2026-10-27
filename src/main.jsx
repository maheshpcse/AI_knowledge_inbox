import React from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/nunito-sans/400.css';
import '@fontsource/nunito-sans/600.css';
import '@fontsource/nunito-sans/700.css';
import App from './App.jsx';
import './styles.css';
import { installScrollReset } from './scrollReset';

const disposeScrollReset = installScrollReset();
if (import.meta.hot) import.meta.hot.dispose(disposeScrollReset);

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
