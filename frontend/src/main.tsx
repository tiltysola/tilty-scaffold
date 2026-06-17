import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import { Toaster } from '@/shadcn/components/ui/sonner';
import { TooltipProvider } from '@/shadcn/components/ui/tooltip';

import Router from './router';

import './shadcn/index.css';

const container = document.getElementById('app');

if (!container) {
  throw new Error('Missing #app root element');
}

createRoot(container).render(
  <StrictMode>
    <TooltipProvider>
      <BrowserRouter>
        <Router />
      </BrowserRouter>
      <Toaster richColors />
    </TooltipProvider>
  </StrictMode>,
);
