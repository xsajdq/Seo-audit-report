// Klient API: uruchamia audyt przez SSE i przekazuje zdarzenia do callbacków.
export function startAudit(params, handlers) {
  const qs = new URLSearchParams(params).toString();
  const es = new EventSource(`/api/audit/stream?${qs}`);
  let currentId = null;

  es.onmessage = (e) => {
    let data;
    try {
      data = JSON.parse(e.data);
    } catch {
      return;
    }
    if (data.type === 'start') currentId = data.id;
    handlers.onEvent?.(data);
    if (data.type === 'done') {
      handlers.onDone?.(data.result, currentId);
      es.close();
    } else if (data.type === 'error') {
      handlers.onError?.(data.message);
      es.close();
    }
  };
  es.onerror = () => {
    handlers.onError?.('Utracono połączenie ze strumieniem audytu.');
    es.close();
  };

  return {
    id: () => currentId,
    cancel: () => {
      if (currentId) {
        fetch(`/api/audit/${currentId}/cancel`, { method: 'POST' }).catch(() => {});
      }
      es.close();
    },
  };
}

export async function matchKeywords(resultId, keywords, brand) {
  const r = await fetch(`/api/result/${resultId}/keywords`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ keywords, brand }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `Błąd ${r.status}`);
  }
  return r.json();
}

export async function getKnowledgeGraph(resultId) {
  const r = await fetch(`/api/result/${resultId}/knowledge-graph`);
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `Błąd ${r.status}`);
  }
  return r.json();
}

export async function analyzeContentGap(resultId, competitors, maxPages) {
  const r = await fetch(`/api/result/${resultId}/content-gap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ competitors, maxPages }),
  });
  if (!r.ok) {
    const e = await r.json().catch(() => ({}));
    throw new Error(e.error || `Błąd ${r.status}`);
  }
  return r.json();
}

export async function analyzePageContent(resultId, url, useApi) {
  const r = await fetch(`/api/result/${resultId}/page-analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, useApi }),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Błąd ${r.status}`);
  return data;
}

async function postJson(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Błąd ${r.status}`);
  return data;
}

export const generateContentPlan = (id, body) => postJson(`/api/result/${id}/content-plan`, body);
export const generateBrief = (id, body) => postJson(`/api/result/${id}/brief`, body);
export const scoreDraft = (id, body) => postJson(`/api/result/${id}/score-draft`, body);
export const linkSuggestions = (id, url) => postJson(`/api/result/${id}/link-suggestions`, { url });
export const expandKeyword = (seed, deep = true) => postJson('/api/keywords/expand', { seed, deep });

export async function downloadContentPlanXlsx(id, body) {
  const r = await fetch(`/api/result/${id}/content-plan?format=xlsx`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('Nie udało się pobrać pliku.');
  const blob = await r.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'content-plan.xlsx';
  document.body.appendChild(a); a.click(); a.remove();
}

export async function getHistory() {
  const r = await fetch('/api/history'); return r.ok ? r.json() : { audits: [], projects: [] };
}
export async function loadHistoryAudit(id) {
  const r = await fetch(`/api/history/${id}`);
  if (!r.ok) throw new Error('Nie udało się wczytać audytu.');
  return r.json();
}
export async function compareHistory(a, b) {
  const r = await fetch(`/api/history/compare?a=${a}&b=${b}`);
  if (!r.ok) throw new Error('Nie udało się porównać.');
  return r.json();
}
export async function deleteHistory(id) {
  await fetch(`/api/history/${id}`, { method: 'DELETE' });
}

export async function getHealth() {
  try {
    const r = await fetch('/api/health');
    return await r.json();
  } catch {
    return { ok: false, renderAvailable: false };
  }
}
