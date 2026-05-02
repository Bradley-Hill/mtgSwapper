import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// Import i18n config before App so translations are ready before any component renders.
// The side-effect import calls i18n.init() which is synchronous for bundled JSON resources.
import './i18n/config';
import './index.scss';
import App from './App.tsx';

// Created outside the component tree so the cache survives re-renders.
// If created inside, every render would wipe the cache — defeating the purpose.
const queryClient = new QueryClient();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
