// Parsowanie robots.txt + prosta ewaluacja reguł allow/disallow dla naszego user-agenta.
import { fetchUrl } from './fetcher.js';

export async function fetchRobots(origin) {
  const robotsUrl = new URL('/robots.txt', origin).href;
  const res = await fetchUrl(robotsUrl, { timeout: 10000 });
  if (!res.ok || !res.body) {
    return { url: robotsUrl, exists: false, status: res.status, rules: [], sitemaps: [], raw: '' };
  }
  const parsed = parseRobots(res.body);
  return { url: robotsUrl, exists: true, status: res.status, raw: res.body, ...parsed };
}

export function parseRobots(text) {
  const lines = text.split(/\r?\n/);
  const groups = [];
  const sitemaps = [];
  let current = null;

  for (let raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx === -1) continue;
    const field = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();

    if (field === 'user-agent') {
      if (current && current.directives.length === 0) {
        current.agents.push(value.toLowerCase());
      } else {
        current = { agents: [value.toLowerCase()], directives: [] };
        groups.push(current);
      }
    } else if (field === 'disallow' || field === 'allow') {
      if (!current) {
        current = { agents: ['*'], directives: [] };
        groups.push(current);
      }
      current.directives.push({ type: field, path: value });
    } else if (field === 'sitemap') {
      sitemaps.push(value);
    } else if (field === 'crawl-delay' && current) {
      current.crawlDelay = Number(value) || 0;
    }
  }

  return { groups, sitemaps, rules: groups };
}

/** Czy ścieżka jest dozwolona dla podanego user-agenta? */
export function isAllowed(robots, pathname, userAgent = '*') {
  if (!robots || !robots.groups || robots.groups.length === 0) return true;
  const ua = userAgent.toLowerCase();
  // znajdź najbardziej pasującą grupę
  let group = robots.groups.find((g) => g.agents.some((a) => a !== '*' && ua.includes(a)));
  if (!group) group = robots.groups.find((g) => g.agents.includes('*'));
  if (!group) return true;

  let matched = { length: -1, allow: true };
  for (const d of group.directives) {
    if (d.path === '') continue;
    if (pathMatches(pathname, d.path)) {
      const len = d.path.length;
      if (len > matched.length) {
        matched = { length: len, allow: d.type === 'allow' };
      }
    }
  }
  return matched.length === -1 ? true : matched.allow;
}

function pathMatches(pathname, pattern) {
  // obsługa * i $ zgodnie ze specyfiką robots
  const hasEnd = pattern.endsWith('$');
  const pat = hasEnd ? pattern.slice(0, -1) : pattern;
  const regexStr =
    '^' +
    pat
      .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
      .replace(/\*/g, '.*') +
    (hasEnd ? '$' : '');
  try {
    return new RegExp(regexStr).test(pathname);
  } catch {
    return pathname.startsWith(pat);
  }
}
