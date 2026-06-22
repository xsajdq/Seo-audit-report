import React, { useState } from 'react';

const PRESETS = [10, 25, 50, 100, 250, 500];

export default function AuditForm({ onStart, renderAvailable }) {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState('limit'); // limit | all
  const [maxPages, setMaxPages] = useState(50);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [opts, setOpts] = useState({
    respectRobots: true,
    includeSubdomains: false,
    checkExternalLinks: false,
    renderJs: false,
    useSitemap: true,
    concurrency: 5,
  });

  function submit(e) {
    e.preventDefault();
    if (!url.trim()) return;
    onStart({
      url: url.trim(),
      maxPages: mode === 'all' ? 'all' : String(maxPages),
      respectRobots: String(opts.respectRobots),
      includeSubdomains: String(opts.includeSubdomains),
      checkExternalLinks: String(opts.checkExternalLinks),
      renderJs: String(opts.renderJs && renderAvailable),
      useSitemap: String(opts.useSitemap),
      concurrency: String(opts.concurrency),
    });
  }

  const toggle = (k) => setOpts((o) => ({ ...o, [k]: !o[k] }));

  return (
    <form className="card form" onSubmit={submit}>
      <h2>Rozpocznij audyt</h2>
      <p className="muted">Podaj adres strony, którą chcesz przeskanować. Narzędzie sprawdzi dziesiątki elementów technicznego SEO.</p>

      <label className="field">
        <span>Adres strony</span>
        <input
          type="text"
          placeholder="np. example.com lub https://example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          autoFocus
        />
      </label>

      <div className="field">
        <span>Zakres skanowania</span>
        <div className="seg">
          <button type="button" className={mode === 'limit' ? 'active' : ''} onClick={() => setMode('limit')}>
            Wybrana liczba podstron
          </button>
          <button type="button" className={mode === 'all' ? 'active' : ''} onClick={() => setMode('all')}>
            Wszystkie podstrony
          </button>
        </div>
      </div>

      {mode === 'limit' && (
        <div className="field">
          <span>Liczba podstron: <b>{maxPages}</b></span>
          <div className="presets">
            {PRESETS.map((n) => (
              <button type="button" key={n} className={maxPages === n ? 'chip active' : 'chip'} onClick={() => setMaxPages(n)}>
                {n}
              </button>
            ))}
          </div>
          <input type="range" min="1" max="1000" value={maxPages} onChange={(e) => setMaxPages(Number(e.target.value))} />
        </div>
      )}
      {mode === 'all' && (
        <div className="note">⚠️ Skanowanie wszystkich podstron może potrwać dłużej w przypadku dużych witryn.</div>
      )}

      <button type="button" className="link-btn" onClick={() => setShowAdvanced((s) => !s)}>
        {showAdvanced ? '▾ Ukryj' : '▸ Pokaż'} opcje zaawansowane
      </button>

      {showAdvanced && (
        <div className="advanced">
          <Check label="Respektuj robots.txt" checked={opts.respectRobots} onChange={() => toggle('respectRobots')} />
          <Check label="Używaj sitemap.xml do wykrywania stron" checked={opts.useSitemap} onChange={() => toggle('useSitemap')} />
          <Check label="Uwzględnij subdomeny" checked={opts.includeSubdomains} onChange={() => toggle('includeSubdomains')} />
          <Check label="Sprawdzaj niedziałające linki zewnętrzne" checked={opts.checkExternalLinks} onChange={() => toggle('checkExternalLinks')} />
          <Check
            label={`Renderuj JavaScript (Core Web Vitals)${renderAvailable ? '' : ' — niedostępne, zainstaluj Chromium'}`}
            checked={opts.renderJs && renderAvailable}
            disabled={!renderAvailable}
            onChange={() => toggle('renderJs')}
          />
          <label className="field inline">
            <span>Równoległość: {opts.concurrency}</span>
            <input type="range" min="1" max="10" value={opts.concurrency} onChange={(e) => setOpts((o) => ({ ...o, concurrency: Number(e.target.value) }))} />
          </label>
        </div>
      )}

      <button type="submit" className="btn primary big" disabled={!url.trim()}>
        Uruchom audyt →
      </button>
    </form>
  );
}

function Check({ label, checked, onChange, disabled }) {
  return (
    <label className={`check ${disabled ? 'disabled' : ''}`}>
      <input type="checkbox" checked={checked} onChange={onChange} disabled={disabled} />
      <span>{label}</span>
    </label>
  );
}
