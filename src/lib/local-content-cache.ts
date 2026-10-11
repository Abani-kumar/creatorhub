import type { ContentView, Paginated } from './types';

const KEY = 'creatorhub:local-content';

function readAll(): Record<string, ContentView> {
  if (typeof sessionStorage === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ContentView>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(map: Record<string, ContentView>): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* quota / private mode: details fetch may 404 on a hosted demo; ignore */
  }
}

/** Remember an item this tab just created or updated (Vercel instances do not share the JSON store). */
export function rememberContent(item: ContentView): void {
  const map = readAll();
  map[item.id] = item;
  writeAll(map);
}

export function forgetContent(id: string): void {
  const map = readAll();
  if (!(id in map)) return;
  delete map[id];
  writeAll(map);
}

export function forgetAllLocalContent(): void {
  if (typeof sessionStorage === 'undefined') return;
  sessionStorage.removeItem(KEY);
}

export function readLocalContent(id: string): ContentView | undefined {
  return readAll()[id];
}

export function listLocalContent(): ContentView[] {
  return Object.values(readAll());
}

/** Prepend items this tab saved that the current list response does not yet include. */
export function mergeLocalContentIntoPage(page: Paginated<ContentView>, listUrl: string): Paginated<ContentView> {
  const locals = listLocalContent();
  if (!locals.length) return page;
  const qs = listUrl.includes('?') ? listUrl.slice(listUrl.indexOf('?') + 1) : '';
  const sp = new URLSearchParams(qs);
  const status = sp.get('status') ?? 'all';
  const q = (sp.get('q') ?? '').toLowerCase();
  const extras = locals.filter((c) => {
    if (page.items.some((i) => i.id === c.id)) return false;
    if (status !== 'all' && c.status !== status) return false;
    if (q && !c.title.toLowerCase().includes(q)) return false;
    return true;
  });
  if (!extras.length) return page;
  return { ...page, items: [...extras, ...page.items], total: page.total + extras.length };
}
