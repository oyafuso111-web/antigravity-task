import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import * as Sentry from "@sentry/react"
import './index.css'
import App from './App.tsx'

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  tracePropagationTargets: ["localhost", /^https:\/\/yourserver\.io\/api/],
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});

// ---------------------------------------------------------------------------
// AGGRESSIVE cleanup: force-unregister ALL service workers and purge all
// related caches/IndexedDB.  The old SW's backgroundSync was intercepting
// Supabase REST API calls, causing data inconsistency.
// ---------------------------------------------------------------------------
(async () => {
  try {
    // 1. Unregister ALL service workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const reg of registrations) {
        const ok = await reg.unregister();
        console.log('[sw-cleanup] Unregistered service worker:', ok);
      }
    }
    // 2. Delete Workbox backgroundSync IndexedDB database
    if ('indexedDB' in window) {
      indexedDB.deleteDatabase('workbox-background-sync');
    }
    // 3. Clear ALL caches (not just workbox-related ones)
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        await caches.delete(name);
        console.log('[sw-cleanup] Deleted cache:', name);
      }
    }
  } catch (e) {
    console.warn('[sw-cleanup] Cleanup failed (non-critical):', e);
  }
})();

// ---------------------------------------------------------------------------
// Diagnostic utility – run  window.__debugSync()  in the browser console
// to check Supabase connectivity, auth state, and pending tasks.
// ---------------------------------------------------------------------------
import { supabase } from './lib/supabase'
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).__debugSync = async () => {
  console.group('🔍 Antigravity Sync Diagnostic');

  // 1. Auth
  const { data: { session } } = await supabase.auth.getSession();
  console.log('Auth session:', session ? `✅ user=${session.user.id}` : '❌ NO SESSION');

  // 2. DB tasks
  if (session) {
    const { data, error } = await supabase.from('tasks').select('id, title, created_at').order('created_at', { ascending: false }).limit(20);
    if (error) {
      console.error('DB query error:', error);
    } else {
      console.log(`DB tasks (latest 20): ${data?.length ?? 0} rows`);
      console.table(data);
    }
  }

  // 3. Pending tasks in localStorage
  try {
    const pending = JSON.parse(localStorage.getItem('antigravity_pending_tasks') || '[]');
    console.log(`Pending tasks in localStorage: ${pending.length}`);
    if (pending.length > 0) console.table(pending.map((t: { id: string; title: string }) => ({ id: t.id, title: t.title })));
  } catch { console.log('Pending tasks: (none)'); }

  // 4. Service Worker status
  if ('serviceWorker' in navigator) {
    const reg = await navigator.serviceWorker.getRegistration();
    console.log('Service Worker:', reg ? `active=${!!reg.active}, waiting=${!!reg.waiting}` : 'none');
  }

  console.groupEnd();
};
console.log('💡 Run  window.__debugSync()  in console to diagnose sync issues');

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
