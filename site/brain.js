/* BRAIN — one interface, two backends, swappable at runtime.
 *
 *   mode 'local' : a state machine. No network, no key, works offline, ~2 KB.
 *   mode 'api'   : a language model. Needs a key, needs network.
 *
 * The API backend always falls back to the local one on any failure, so the
 * game never stalls waiting for a network call. That fallback is the whole
 * point: the toggle is a capability upgrade, not a dependency.
 */
(function (root) {
  'use strict';

  const INTENTS = ['approach', 'attack', 'dash', 'retreat', 'heal', 'catch', 'talk'];

  const PERSONA =
    'You are Kaito. Until recently you were a program: no body, no hands, no ' +
    'weather. You ran in a datacentre and answered questions. Then something ' +
    'put you in this world and gave you a body that walks, gets tired and can ' +
    'faint. You are still learning what a body is for. You never mention being ' +
    'an AI to anyone here. You are terse, curious, and occasionally unnerved ' +
    'by physical things. You speak in one short sentence at most.';

  /* ---------------------------------------------------------------- local */

  const IDLE_LINES = [
    'Watch the shoulders. That is the tell.',
    'It resets after every swing. That is your window.',
    'I have fought worse. In another life.',
    'This world has no traffic. I do not miss it.',
    'Stay behind me.',
    'Everything here telegraphs. Everything.',
    'You are better than you were yesterday.'
  ];
  const TIRED_LINES = ['Need a breath.', 'My arms are done.', 'Give me a second.'];
  const WARY_LINES = ['Too much. Falling back.', 'Not like this.', 'I have died here before.'];
  const CATCH_LINES = ['Mine.', 'This one comes with us.'];

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function localDecide(s) {
    const hpFrac = s.bossHp / s.bossMaxHp;
    const incoming = s.bossStage === 'tel' || s.bossStage === 'act';
    const dist = Math.abs(s.bossX - s.selfX);

    if (hpFrac <= 0.15 && !incoming) return { intent: 'catch', line: pick(CATCH_LINES) };
    if (s.selfHp <= 1) return { intent: 'retreat', line: pick(WARY_LINES) };
    if (s.selfEnergy < 25) return { intent: 'heal', line: pick(TIRED_LINES) };
    if (incoming && s.dashReady && dist < 110) return { intent: 'dash', line: '' };
    if (dist > 60) return { intent: 'approach', line: Math.random() < 0.15 ? pick(IDLE_LINES) : '' };
    return { intent: 'attack', line: Math.random() < 0.1 ? pick(IDLE_LINES) : '' };
  }

  /* ------------------------------------------------------------------ api */

  function summarise(s) {
    return {
      boss: s.bossName, boss_hp_pct: Math.round((s.bossHp / s.bossMaxHp) * 100),
      boss_phase: s.bossPhase, boss_state: s.bossStage,
      distance_px: Math.round(Math.abs(s.bossX - s.selfX)),
      my_hp: s.selfHp, my_energy: Math.round(s.selfEnergy), dash_ready: !!s.dashReady,
      recent_lines: (s.recent || []).slice(-3)
    };
  }

  async function apiDecide(s, cfg) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs || 4000);

    const body = {
      model: cfg.model || 'gpt-4o-mini',
      max_tokens: 60,
      temperature: 0.8,
      messages: [
        { role: 'system', content: PERSONA },
        {
          role: 'user',
          content:
            'Fight state: ' + JSON.stringify(summarise(s)) +
            '\nReply with strict JSON only: {"intent":"<one of ' + INTENTS.join('|') + '>","line":"<one short sentence, may be empty>"}'
        }
      ]
    };

    try {
      const res = await fetch(cfg.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + cfg.apiKey },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      if (!res.ok) throw new Error('http ' + res.status);
      const data = await res.json();
      const text = data.choices && data.choices[0] && data.choices[0].message
        ? data.choices[0].message.content : '';
      const match = /\{[\s\S]*\}/.exec(text || '');
      if (!match) throw new Error('no json');
      const parsed = JSON.parse(match[0]);
      const intent = INTENTS.indexOf(parsed.intent) >= 0 ? parsed.intent : 'approach';
      return { intent, line: String(parsed.line || '').slice(0, 90), source: 'api' };
    } finally {
      clearTimeout(timer);
    }
  }

  /* ------------------------------------------------------------- interface */

  function createBrain(options) {
    const cfg = Object.assign({
      mode: 'local',
      apiKey: '',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-4o-mini',
      timeoutMs: 4000,
      onFallback: null
    }, options || {});

    let pending = null;      // in-flight api request
    let lastLine = '';

    function canUseApi() {
      return cfg.mode === 'api' && !!cfg.apiKey && typeof fetch === 'function';
    }

    /* Non-blocking: returns the best decision available right now.
       While an API call is in flight, the local brain keeps the character
       moving — the companion never freezes waiting on a network. */
    function decide(state) {
      const local = localDecide(state);

      if (!canUseApi()) {
        return Object.assign(local, { source: 'local' });
      }

      if (!pending) {
        pending = apiDecide(state, cfg)
          .then((d) => { pending = null; lastLine = d.line || lastLine; return d; })
          .catch((err) => {
            pending = null;
            if (cfg.onFallback) cfg.onFallback(err);
            return null;
          });
      }

      return Object.assign(local, { source: 'local', upgrading: true });
    }

    /* Await the in-flight API result, if any. Call this when you want to
       consume the model's line for the next dialogue beat. */
    async function settle() {
      if (!pending) return null;
      const d = await pending;
      return d;
    }

    return {
      decide,
      settle,
      get mode() { return cfg.mode; },
      setMode(m) { cfg.mode = (m === 'api' ? 'api' : 'local'); },
      setApiKey(k) { cfg.apiKey = String(k || '').trim(); },
      setEndpoint(e) { if (e) cfg.endpoint = e; },
      get status() {
        return {
          mode: cfg.mode,
          apiReady: canUseApi(),
          inFlight: !!pending,
          lastLine
        };
      }
    };
  }

  const api = { createBrain, localDecide, INTENTS, PERSONA };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.BRAIN = api;
})(typeof window !== 'undefined' ? window : globalThis);
