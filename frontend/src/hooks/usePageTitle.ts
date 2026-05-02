import { useEffect } from 'react';

const APP_NAME = 'MTG Swapper';

/**
 * Sets document.title for the current page.
 *
 * Usage:
 *   usePageTitle('My Collection');
 *   // → "My Collection · MTG Swapper"
 *
 *   usePageTitle(undefined);
 *   // → "MTG Swapper"  (fallback for loading states)
 *
 * WHY NOT react-helmet-async?
 * For a SPA with straightforward titling needs, document.title is sufficient
 * and avoids adding a dependency. react-helmet-async becomes worthwhile when
 * you need SSR support or want to manage other <head> tags (og:title, etc.).
 *
 * The cleanup resets to the app name when the component unmounts, so
 * navigating away never leaves a stale title.
 */
export function usePageTitle(pageTitle?: string) {
  useEffect(() => {
    document.title = pageTitle ? `${pageTitle} · ${APP_NAME}` : APP_NAME;
    return () => {
      document.title = APP_NAME;
    };
  }, [pageTitle]);
}
