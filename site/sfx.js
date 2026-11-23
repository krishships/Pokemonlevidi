/* =====================================================================
   sfx.js - procedural Web Audio sound module for a Hollow Knight-style
   action game.  No audio files, no <audio> elements, no libraries:
   every sound is synthesised at runtime from oscillators and generated
   noise buffers.

   API
     SFX.init()            create/resume the AudioContext (call on the
                           first user gesture)
     SFX.play(name, opts)  fire one of the 15 named sounds
     SFX.setVolume(v)      0..1 master volume
     SFX.mute(bool)        hard mute, independent of volume

   Sounds: slash hit hurt dash jump land telegraph swing phase stagger
           heal capture death victory defeat

   Safe to call play() before init() - it is a silent no-op.
   ===================================================================== */
(function (root) {
  'use strict';

  var AC = root.AudioContext || root.webkitAudioContext;

  var ctx = null;        // AudioContext
  var master = null;     // master gain
  var noiseBuf = null;   // shared 2s white-noise buffer
  var volume = 0.8;
  var muted = false;

  /* ------------------------------------------------------------------
     Node bookkeeping
     Every sound builds one Voice.  A Voice owns every node it created
     and tears the whole graph down once its sources have ended, so
     repeated calls cannot leak nodes (a classic Web Audio bug).
     ------------------------------------------------------------------ */
  function V() {
    this.nodes = [];
    this.sources = [];
  }

  V.prototype.node = function (n) {
    this.nodes.push(n);
    return n;
  };

  V.prototype.source = function (n) {
    this.nodes.push(n);
    this.sources.push(n);
    return n;
  };

  /* Stop every source at endTime, then disconnect everything.
     Both onended and a timer are used: onended alone is not reliable
     (background tabs, sources already past their stop time). */
  V.prototype.release = function (endTime) {
    var self = this;
    var done = false;

    function finish() {
      if (done) return;
      done = true;
      for (var i = 0; i < self.nodes.length; i++) {
        var n = self.nodes[i];
        if (n.onended) n.onended = null;
        try { n.disconnect(); } catch (e) { /* already gone */ }
      }
      self.nodes.length = 0;
      self.sources.length = 0;
    }

    if (!this.sources.length) { finish(); return; }

    var left = this.sources.length;
    var hook = function (src) {
      src.onended = function () {
        src.onended = null;
        if (--left <= 0) finish();
      };
      try {
        src.stop(endTime);
      } catch (e) {
        try { src.stop(); } catch (e2) { /* ignore */ }
      }
    };
    for (var i = 0; i < this.sources.length; i++) hook(this.sources[i]);

    var ms = Math.max(0, (endTime - ctx.currentTime) * 1000) + 250;
    setTimeout(finish, ms);
  };

  /* ------------------------------------------------------------------
     Context / master
     ------------------------------------------------------------------ */
  function makeNoise(seconds) {
    var len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    var buf = ctx.createBuffer(1, len, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  function applyGain() {
    if (!master) return;
    var target = muted ? 0 : volume;
    var t = ctx.currentTime;
    try {
      master.gain.cancelScheduledValues(t);
      master.gain.setTargetAtTime(target, t, 0.012);
    } catch (e) {
      master.gain.value = target;
    }
  }

  function resume() {
    if (ctx && ctx.state === 'suspended' && typeof ctx.resume === 'function') {
      var p = ctx.resume();
      if (p && typeof p.catch === 'function') p.catch(function () {});
    }
  }

  function init() {
    if (!AC) return null;                 // browser without Web Audio
    if (!ctx) {
      try {
        ctx = new AC();
      } catch (e) {
        ctx = null;
        return null;
      }
      master = ctx.createGain();
      master.gain.value = muted ? 0 : volume;
      // gentle limiter so stacked voices never clip
      var comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -12;
      comp.knee.value = 24;
      comp.ratio.value = 8;
      comp.attack.value = 0.003;
      comp.release.value = 0.18;
      master.connect(comp);
      comp.connect(ctx.destination);
      noiseBuf = makeNoise(2);
    }
    resume();
    return ctx;
  }

  /* ------------------------------------------------------------------
     Building blocks
     ------------------------------------------------------------------ */

  // Per-voice output bus -> master.
  function bus(v) {
    var g = v.node(ctx.createGain());
    g.gain.value = 1;
    g.connect(master);
    return g;
  }

  function noiseSrc(v) {
    var s = v.source(ctx.createBufferSource());
    s.buffer = noiseBuf;
    s.loop = true;
    return s;
  }

  function filter(v, type, freq, q) {
    var f = v.node(ctx.createBiquadFilter());
    f.type = type;
    f.frequency.value = freq;
    if (q != null) f.Q.value = q;
    return f;
  }

  // Steady or gliding oscillator note with a percussive envelope.
  function tone(v, dest, t, f0, dur, type, peak, attack, f1) {
    var o = v.source(ctx.createOscillator());
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);

    var g = v.node(ctx.createGain());
    var a = attack == null ? Math.min(0.012, dur * 0.3) : attack;
    var p = Math.max(0.0002, peak);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(p, t + Math.max(0.002, a));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    o.connect(g);
    g.connect(dest);
    o.start(t);
    return g;
  }

  // Filtered noise burst; the filter sweeps from f0 to f1.
  function noiseBurst(v, dest, t, dur, type, f0, f1, q, peak) {
    var s = noiseSrc(v);
    var f = filter(v, type, f0, q);
    if (f1 && f1 !== f0) {
      f.frequency.setValueAtTime(f0, t);
      f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    }
    var g = v.node(ctx.createGain());
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + Math.min(0.02, dur * 0.35));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f);
    f.connect(g);
    g.connect(dest);
    s.start(t, Math.random() * 1.5);
    return g;
  }

  /* ------------------------------------------------------------------
     The 15 sounds.  Each gets a start time t and ends well under 400ms.
     ------------------------------------------------------------------ */
  var sounds = {

    /* nail swing: bright filtered-noise sweep with a metallic edge */
    slash: function (t) {
      var v = new V(), o = bus(v);
      noiseBurst(v, o, t, 0.16, 'bandpass', 900, 7500, 1.3, 0.55);
      noiseBurst(v, o, t + 0.01, 0.09, 'highpass', 4000, 6500, 0.8, 0.18);
      tone(v, o, t, 1500, 0.09, 'triangle', 0.07, 0.004, 2600);
      v.release(t + 0.22);
    },

    /* impact on enemy: low thud + short noise burst */
    hit: function (t) {
      var v = new V(), o = bus(v);
      tone(v, o, t, 150, 0.19, 'sine', 0.85, 0.003, 48);
      tone(v, o, t, 300, 0.09, 'triangle', 0.22, 0.002, 110);
      noiseBurst(v, o, t, 0.07, 'lowpass', 2600, 320, 0.9, 0.5);
      v.release(t + 0.23);
    },

    /* player takes damage: dissonant, slightly harsh low tone */
    hurt: function (t) {
      var v = new V(), o = bus(v);
      var lp = filter(v, 'lowpass', 1500, 0.9);
      lp.connect(o);
      tone(v, lp, t, 147, 0.32, 'square', 0.24, 0.006, 98);
      tone(v, lp, t + 0.005, 156, 0.30, 'sawtooth', 0.20, 0.006, 104);
      noiseBurst(v, o, t, 0.16, 'lowpass', 900, 400, 0.8, 0.20);
      v.release(t + 0.36);
    },

    /* whoosh: noise through a bandpass sweeping down */
    dash: function (t) {
      var v = new V(), o = bus(v);
      noiseBurst(v, o, t, 0.26, 'bandpass', 3600, 340, 2.4, 0.45);
      tone(v, o, t, 210, 0.22, 'sine', 0.10, 0.02, 78);
      v.release(t + 0.30);
    },

    /* soft airy blip */
    jump: function (t) {
      var v = new V(), o = bus(v);
      tone(v, o, t, 380, 0.12, 'triangle', 0.16, 0.012, 640);
      noiseBurst(v, o, t, 0.08, 'highpass', 1800, 3200, 0.7, 0.07);
      v.release(t + 0.16);
    },

    /* short soft thud */
    land: function (t) {
      var v = new V(), o = bus(v);
      tone(v, o, t, 96, 0.14, 'sine', 0.5, 0.003, 48);
      noiseBurst(v, o, t, 0.06, 'lowpass', 1100, 400, 0.8, 0.20);
      v.release(t + 0.18);
    },

    /* rising warning tone, pitched by opts.pitch (0..1) - audible, not shrill */
    telegraph: function (t, opts) {
      var p = (opts && typeof opts.pitch === 'number') ? opts.pitch : 0.5;
      p = p < 0 ? 0 : (p > 1 ? 1 : p);
      var f = 300 + p * 520;             // 300 Hz .. 820 Hz
      var v = new V(), o = bus(v);
      tone(v, o, t, f, 0.30, 'sine', 0.20, 0.06, f * 1.9);
      tone(v, o, t, f * 1.5, 0.30, 'triangle', 0.06, 0.07, f * 2.85);
      noiseBurst(v, o, t, 0.30, 'bandpass', f * 2, f * 4, 3, 0.05);
      v.release(t + 0.34);
    },

    /* boss weapon sweep: heavier and lower than 'slash' */
    swing: function (t) {
      var v = new V(), o = bus(v);
      noiseBurst(v, o, t, 0.30, 'lowpass', 1400, 220, 0.9, 0.5);
      noiseBurst(v, o, t, 0.28, 'bandpass', 520, 150, 1.6, 0.3);
      tone(v, o, t, 110, 0.26, 'sine', 0.35, 0.01, 45);
      v.release(t + 0.34);
    },

    /* phase change roar: detuned low sweep plus noise */
    phase: function (t) {
      var v = new V(), o = bus(v);
      var lp = filter(v, 'lowpass', 900, 1.2);
      lp.connect(o);
      tone(v, lp, t, 58, 0.32, 'sawtooth', 0.22, 0.02, 140);
      tone(v, lp, t, 61.5, 0.32, 'sawtooth', 0.22, 0.02, 148);
      tone(v, lp, t, 66, 0.32, 'sawtooth', 0.20, 0.02, 158);
      tone(v, o, t, 41, 0.32, 'sine', 0.30, 0.02, 72);
      noiseBurst(v, o, t, 0.30, 'bandpass', 350, 950, 1.1, 0.28);
      v.release(t + 0.36);
    },

    /* metallic clang with fast decay (inharmonic partials) */
    stagger: function (t) {
      var v = new V(), o = bus(v);
      noiseBurst(v, o, t, 0.045, 'highpass', 2800, 4200, 0.8, 0.32);
      tone(v, o, t, 1180, 0.16, 'sine', 0.14, 0.001);
      tone(v, o, t, 1760, 0.12, 'sine', 0.12, 0.001);
      tone(v, o, t, 2540, 0.09, 'sine', 0.09, 0.001);
      tone(v, o, t, 3310, 0.06, 'triangle', 0.06, 0.001);
      v.release(t + 0.20);
    },

    /* warm rising shimmer */
    heal: function (t) {
      var v = new V(), o = bus(v);
      var notes = [523.25, 659.25, 783.99];
      for (var i = 0; i < notes.length; i++) {
        var n = notes[i], at = t + i * 0.08;
        tone(v, o, at, n, 0.20, 'sine', 0.13, 0.05);
        tone(v, o, at, n * 1.004, 0.20, 'triangle', 0.05, 0.05);
        tone(v, o, at, n * 2, 0.14, 'sine', 0.035, 0.04);
      }
      noiseBurst(v, o, t, 0.32, 'bandpass', 2400, 5200, 2, 0.035);
      v.release(t + 0.36);
    },

    /* 3-note ascending chime */
    capture: function (t) {
      var v = new V(), o = bus(v);
      var notes = [523.25, 659.25, 783.99];
      for (var i = 0; i < notes.length; i++) {
        var n = notes[i], at = t + i * 0.10;
        tone(v, o, at, n, 0.18, 'sine', 0.22, 0.004);
        tone(v, o, at, n * 2, 0.12, 'sine', 0.06, 0.004);
      }
      v.release(t + 0.38);
    },

    /* descending minor figure (D minor) */
    death: function (t) {
      var v = new V(), o = bus(v);
      var lp = filter(v, 'lowpass', 2200, 0.8);
      lp.connect(o);
      var notes = [440.00, 349.23, 293.66];
      for (var i = 0; i < notes.length; i++) {
        var at = t + i * 0.11;
        var dur = i === notes.length - 1 ? 0.15 : 0.14;
        tone(v, lp, at, notes[i], dur, 'triangle', 0.20, 0.008);
        tone(v, o, at, notes[i] * 0.5, dur, 'sine', 0.10, 0.008);
      }
      v.release(t + 0.38);
    },

    /* short 4-note fanfare */
    victory: function (t) {
      var v = new V(), o = bus(v);
      var notes = [523.25, 659.25, 783.99, 1046.50];
      for (var i = 0; i < notes.length; i++) {
        var at = t + i * 0.08;
        var dur = i === notes.length - 1 ? 0.14 : 0.11;
        tone(v, o, at, notes[i], dur, 'triangle', 0.18, 0.005);
        tone(v, o, at, notes[i] * 2, dur * 0.8, 'sine', 0.06, 0.005);
      }
      v.release(t + 0.38);
    },

    /* low descending drone */
    defeat: function (t) {
      var v = new V(), o = bus(v);
      var lp = filter(v, 'lowpass', 520, 1.1);
      lp.frequency.setValueAtTime(520, t);
      lp.frequency.exponentialRampToValueAtTime(180, t + 0.36);
      lp.connect(o);
      tone(v, lp, t, 110, 0.36, 'sawtooth', 0.28, 0.03, 55);
      tone(v, lp, t, 111.5, 0.36, 'sawtooth', 0.18, 0.03, 55.5);
      tone(v, o, t, 55, 0.34, 'sine', 0.26, 0.03, 27.5);
      v.release(t + 0.37);
    }
  };

  /* ------------------------------------------------------------------
     Public API
     ------------------------------------------------------------------ */
  function play(name, opts) {
    if (!ctx || muted) return;             // silent no-op before init()
    var fn = sounds[name];
    if (typeof fn !== 'function') return;
    resume();                              // mobile autoplay guard
    try {
      fn(ctx.currentTime + 0.002, opts || {});
    } catch (e) {
      /* never let a missing sound break the game loop */
    }
  }

  function setVolume(v) {
    volume = typeof v === 'number' && isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.8;
    applyGain();
  }

  function mute(on) {
    muted = !!on;
    applyGain();
  }

  root.SFX = {
    init: init,
    play: play,
    setVolume: setVolume,
    mute: mute
  };
})(typeof window !== 'undefined' ? window : globalThis);
