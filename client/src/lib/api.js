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

export async function getHealth() {
  try {
    const r = await fetch('/api/health');
    return await r.json();
  } catch {
    return { ok: false, renderAvailable: false };
  }
}
