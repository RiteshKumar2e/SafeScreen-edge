import { useEffect } from 'react';

const SITE = 'SafeScreen Edge';

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

/** Sets the document title, meta description and Open Graph tags for a page. */
export function usePageMeta(title: string, description: string) {
  useEffect(() => {
    const full = title.includes(SITE) ? title : `${title} | ${SITE}`;
    document.title = full;
    setMeta('name', 'description', description);
    setMeta('property', 'og:title', full);
    setMeta('property', 'og:description', description);
  }, [title, description]);
}
