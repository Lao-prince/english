import { createRoot } from 'react-dom/client';
import './styles.css';

function App() {
  return (
    <main className="mx-auto grid min-h-dvh max-w-xl content-center px-6 py-12">
      <h1 className="text-4xl font-semibold tracking-tight">English Space</h1>
      <p className="mt-4 text-lg text-slate-600 dark:text-slate-300">
        A private space for English lessons, scheduling, and learning materials.
      </p>
    </main>
  );
}

const root = document.getElementById('root');
if (!root) throw new Error('Missing application root');
createRoot(root).render(<App />);
