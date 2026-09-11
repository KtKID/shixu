import { createRoot } from 'react-dom/client';
import App, { parseSectionHash } from './App';
import './index.css';
import '../../components/settings/cards.css';

const rootEl = document.getElementById('root');
if (rootEl === null) throw new Error('missing #root');
createRoot(rootEl).render(<App initialSection={parseSectionHash(window.location.hash)} />);
