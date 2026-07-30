import { createRoot } from 'react-dom/client';
import { App } from './App';
import { OpenProjectDialog } from './dialogs/OpenProjectDialog';
import { initTheme } from './theme';
import { initLocale } from './i18n';
import './style.css';

initTheme();
initLocale();

function getRoute(): string {
  const hash = window.location.hash || '';
  const match = hash.match(/^#?\/?([^?&]*)/);
  return match ? match[1] : '';
}

function Root() {
  const route = getRoute();
  if (route === 'open-project') return <OpenProjectDialog />;
  return <App />;
}

createRoot(document.getElementById('root')!).render(<Root />);
