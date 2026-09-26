import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { Toaster } from 'sonner';

import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import './index.css';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <App />
          <Toaster
            position="bottom-right"
            toastOptions={{
              unstyled: true,
              classNames: {
                toast: 'flex w-[356px] items-start gap-3 border-2 border-ink bg-sheet px-4 py-3 font-sans text-ink',
                title: 'font-semibold',
                description: 'text-sm text-ink-2',
                error: '!border-red [&_[data-title]]:text-red',
                success: '[&_[data-icon]]:text-ink',
              },
            }}
          />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
