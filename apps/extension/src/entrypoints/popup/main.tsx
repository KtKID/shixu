import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

const rootEl = document.getElementById('root');
if (rootEl === null) throw new Error('missing #root');
createRoot(rootEl).render(<App />);
