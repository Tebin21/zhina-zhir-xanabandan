'use strict';

/* ==========================================================================
   Luxury Kurdish Engagement Invitation — ژیر ❤ ژینه
   Sequencing: ReducedMotionGuard -> AssetGate -> VideoGateController ->
   RevealAndPetalBurst -> (ScrollRevealEngine + CountdownEngine +
   CalendarGenerator start together). CustomCursor and MusicPlayer init
   immediately/independently.
   ========================================================================== */

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* --- Reduced motion: read once, react to live OS-setting changes --- */
const ReducedMotionGuard = {
  init() {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const apply = (matches) => {
      document.documentElement.dataset.motion = matches ? 'reduced' : 'full';
    };
    apply(mq.matches);
    mq.addEventListener('change', (e) => apply(e.matches));
  }
};

/* --- Asset gate: resolves once font, hero image and video are truly ready --- */
const AssetGate = {
  async whenReady() {
    const ready = Promise.all([
      this._fontReady(),
      this._imageReady(),
      this._videoReady(),
      delay(1200) // minimum splash time so the loader never flashes on repeat visits
    ]);
    // 8s failsafe: never permanently strand a visitor on the loader over one broken asset.
    await Promise.race([
      ready,
      delay(8000).then(() => console.warn('AssetGate: 8s failsafe reached, revealing anyway'))
    ]);
  },

  async _fontReady() {
    try {
      await document.fonts.load('300 16px "XoshnusKurdish"');
      await document.fonts.ready;
    } catch (e) {
      /* Font Loading API unsupported/failed — proceed, @font-face swap still applies. */
    }
  },

  async _imageReady() {
    const img = document.getElementById('invitation-image');
    if (!img) return;
    try {
      if (img.decode) {
        await img.decode();
      } else if (!img.complete) {
        await new Promise((resolve) => {
          img.addEventListener('load', resolve, { once: true });
          img.addEventListener('error', resolve, { once: true });
        });
      }
    } catch (e) {
      /* decode() can reject in rare cases — non-fatal, image still renders. */
    }
  },

  async _videoReady() {
    const video = document.getElementById('intro-video');
    if (!video) return;
    try {
      // Primary path: byte-complete fetch guarantees the clip is *fully* loaded,
      // not just "probably playable" (canplaythrough is a heuristic and inconsistent
      // cross-browser).
      const response = await fetch('assets/videos/vivi.mp4');
      if (!response.ok) throw new Error('video fetch failed: ' + response.status);
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      video.dataset.blobUrl = url;
      video.src = url;
      await new Promise((resolve, reject) => {
        video.addEventListener('loadedmetadata', resolve, { once: true });
        video.addEventListener('error', reject, { once: true });
      });
    } catch (e) {
      // Fallback for the file:// double-click case (fetch can throw there) or a network hiccup.
      video.preload = 'auto';
      video.src = 'assets/videos/vivi.mp4';
      await new Promise((resolve) => {
        video.addEventListener('loadeddata', resolve, { once: true });
        video.addEventListener('error', resolve, { once: true });
      });
    }
  }
};

/* --- Video gate: single tap starts the clip; no skip, no controls --- */
const VideoGateController = {
  init(onEnded) {
    this.gate = document.getElementById('video-gate');
    this.video = document.getElementById('intro-video');
    this.playBtn = document.getElementById('video-gate__play');
    if (!this.gate || !this.video || !this.playBtn) return;

    // Video carries no audio of its own — the music track is the only sound.
    this.video.muted = true;
    this.video.defaultMuted = true;

    const start = () => {
      // Same tap starts both — music must begin the instant the video does.
      MusicPlayer.startMusic();
      this.video.play()
        .then(() => this.gate.classList.add('is-playing'))
        .catch(() => {
          /* Rejected (e.g. no real gesture yet) — button stays visible/clickable to retry. */
        });
    };
    this.playBtn.addEventListener('click', start);

    this.video.addEventListener('ended', () => {
      this.gate.classList.add('is-hidden');
      if (this.video.dataset.blobUrl) {
        URL.revokeObjectURL(this.video.dataset.blobUrl);
      }
      onEnded();
    }, { once: true });
  }
};

/* --- Reveal main content, focus it, fire the one-time petal burst --- */
const RevealAndPetalBurst = {
  hasFired: false,

  run() {
    const main = document.getElementById('main');
    if (!main) return;
    main.hidden = false;
    requestAnimationFrame(() => main.classList.add('is-revealed'));
    main.focus({ preventScroll: true });

    ScrollRevealEngine.init();
    CountdownEngine.init();
    CalendarGenerator.init();

    if (!this.hasFired) {
      this.hasFired = true;
      if (document.documentElement.dataset.motion !== 'reduced') {
        this.spawnPetals();
      }
    }
  },

  spawnPetals() {
    const layer = document.getElementById('petal-burst-layer');
    if (!layer) return;
    const count = 28;
    for (let i = 0; i < count; i++) {
      const petal = document.createElement('span');
      petal.className = 'petal';
      petal.style.setProperty('--x', (Math.random() * 100) + '%');
      petal.style.setProperty('--rot', (Math.random() * 360) + 'deg');
      petal.style.setProperty('--dur', (4 + Math.random() * 1) + 's');
      petal.style.setProperty('--delay', (Math.random() * 0.6) + 's');
      petal.style.setProperty('--scale', (0.6 + Math.random() * 0.7).toFixed(2));
      petal.addEventListener('animationend', () => petal.remove(), { once: true });
      layer.appendChild(petal);
    }
  }
};

/* --- Shared scroll-reveal engine over every [data-reveal] node --- */
const ScrollRevealEngine = {
  init() {
    const nodes = document.querySelectorAll('[data-reveal]');
    if (document.documentElement.dataset.motion === 'reduced') {
      nodes.forEach((n) => n.classList.add('is-revealed'));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2, rootMargin: '0px 0px -10% 0px' });
    nodes.forEach((n) => observer.observe(n));
  }
};

/* --- Countdown to 2026-11-11 00:00 Asia/Baghdad (fixed UTC+3, no DST) --- */
const CountdownEngine = {
  EVENT_DATE: new Date('2026-11-11T00:00:00+03:00'),
  intervalId: null,

  init() {
    const tiles = {
      d: document.querySelector('[data-cd="d"]'),
      h: document.querySelector('[data-cd="h"]'),
      m: document.querySelector('[data-cd="m"]'),
      s: document.querySelector('[data-cd="s"]')
    };
    if (!tiles.d || this.intervalId) return;
    Object.values(tiles).forEach((tile) => { tile.textContent = ''; });

    // Renders a value into per-digit <span>s, animating only the digits that actually
    // changed (never an instant swap). Digit-slot count self-adjusts for the rare
    // boundary crossing (e.g. days 9 -> 10, 99 -> 100), so a 3-digit day count is safe.
    const setTile = (tile, rawValue) => {
      const chars = String(rawValue).split('');
      const digits = Array.from(tile.children);
      while (digits.length < chars.length) {
        const digit = document.createElement('span');
        digit.className = 'countdown__digit';
        tile.insertBefore(digit, tile.firstChild);
        digits.unshift(digit);
      }
      while (digits.length > chars.length) {
        tile.removeChild(digits.shift());
      }
      chars.forEach((ch, i) => {
        if (digits[i].textContent === ch) return;
        digits[i].textContent = ch;
        digits[i].classList.remove('is-flipping');
        void digits[i].offsetWidth; // reflow, so re-adding the class restarts the animation
        digits[i].classList.add('is-flipping');
      });
    };

    // Fires the shared golden pulse (quote card glow + border shimmer + tile
    // illumination) once per tick, in lockstep with the seconds changing —
    // same remove/reflow/re-add trick as the digit flip, so the CSS keyframes
    // restart cleanly on every call instead of only running once.
    const unit = document.querySelector('.countdown-unit');
    const pulseUnit = () => {
      if (!unit) return;
      unit.classList.remove('is-pulsing');
      void unit.offsetWidth;
      unit.classList.add('is-pulsing');
    };

    const tick = () => {
      const diff = this.EVENT_DATE.getTime() - Date.now();
      pulseUnit();
      if (diff <= 0) {
        setTile(tiles.d, '0');
        setTile(tiles.h, '00');
        setTile(tiles.m, '00');
        setTile(tiles.s, '00');
        clearInterval(this.intervalId);
        return;
      }
      const totalSeconds = Math.floor(diff / 1000);
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;
      // padStart on plain Latin digits, deterministic — never toLocaleString()/Intl,
      // which can silently regionalize in unpredictable ways.
      setTile(tiles.d, String(days));
      setTile(tiles.h, String(hours).padStart(2, '0'));
      setTile(tiles.m, String(minutes).padStart(2, '0'));
      setTile(tiles.s, String(seconds).padStart(2, '0'));
    };
    tick();
    this.intervalId = setInterval(tick, 1000);
  }
};

/* --- November 2026 calendar grid, computed (never hand-hardcoded) --- */
const CalendarGenerator = {
  WEEKDAYS: ['یەکشەممە', 'دووشەممە', 'سێشەممە', 'چوارشەممە', 'پێنجشەممە', 'هەینی', 'شەممە'],
  TARGET_DAY: 11,

  init() {
    const weekdaysEl = document.getElementById('calendar-weekdays');
    const gridEl = document.getElementById('calendar-grid');
    if (!weekdaysEl || !gridEl || gridEl.childElementCount) return;

    this.WEEKDAYS.forEach((label) => {
      const span = document.createElement('span');
      span.textContent = label;
      weekdaysEl.appendChild(span);
    });

    const firstDayOfWeek = new Date(2026, 10, 1).getDay(); // 0 = Sunday
    const daysInMonth = new Date(2026, 11, 0).getDate();

    for (let i = 0; i < firstDayOfWeek; i++) {
      gridEl.appendChild(document.createElement('span'));
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const span = document.createElement('span');
      span.textContent = String(day);
      if (day === this.TARGET_DAY) {
        span.classList.add('is-target');
        span.setAttribute('aria-current', 'date');
      }
      gridEl.appendChild(span);
    }
  }
};

/* --- Desktop-only custom cursor (fine pointer), reacts to hybrid devices --- */
const CustomCursor = {
  bound: false,
  target: { x: 0, y: 0 },
  ringPos: { x: 0, y: 0 },
  raf: null,
  onMove: null,

  init() {
    const mq = window.matchMedia('(pointer: fine)');
    const apply = (matches) => {
      document.body.classList.toggle('custom-cursor-active', matches);
      if (matches) this._bind(); else this._unbind();
    };
    apply(mq.matches);
    mq.addEventListener('change', (e) => apply(e.matches));
  },

  _bind() {
    if (this.bound) return;
    this.bound = true;
    this.dot = document.getElementById('cursor-dot');
    this.ring = document.getElementById('cursor-ring');
    this.onMove = (e) => { this.target.x = e.clientX; this.target.y = e.clientY; };
    window.addEventListener('pointermove', this.onMove);

    const loop = () => {
      if (this.dot) {
        this.dot.style.transform = `translate3d(${this.target.x}px, ${this.target.y}px, 0) translate(-50%,-50%)`;
      }
      this.ringPos.x += (this.target.x - this.ringPos.x) * 0.18;
      this.ringPos.y += (this.target.y - this.ringPos.y) * 0.18;
      if (this.ring) {
        this.ring.style.transform = `translate3d(${this.ringPos.x}px, ${this.ringPos.y}px, 0) translate(-50%,-50%)`;
      }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  },

  _unbind() {
    if (!this.bound) return;
    this.bound = false;
    window.removeEventListener('pointermove', this.onMove);
    if (this.raf) cancelAnimationFrame(this.raf);
  }
};

/* --- Single shared <audio> instance: gesture-started with the intro video,
   fades in once, survives the video->main transition untouched, and is
   otherwise fully owned by the floating toggle button. --- */
const MusicPlayer = {
  FADE_MS: 1000,

  started: false,   // play() has been issued at least once (gesture spent)
  fadeRaf: null,

  init() {
    this.btn = document.getElementById('music-toggle');
    this.audio = document.getElementById('bg-music');
    if (!this.btn || !this.audio) return;
    this.icon = this.btn.querySelector('use');

    this.audio.addEventListener('error', () => {
      this.started = false;
      this._setState(false);
    });

    this.btn.addEventListener('click', () => {
      if (this.audio.paused) {
        // Not started yet (e.g. the video-gate gesture's play() was blocked) —
        // this click is a fresh user gesture, so start it properly with fade-in.
        this.started ? this._resume() : this.startMusic();
      } else {
        this._cancelFade();
        this.audio.pause();
        this._setState(false);
      }
    });
  },

  // Called once, from the same tap/click that starts the intro video.
  startMusic() {
    if (this.started || !this.audio) return;
    this.started = true;
    this.audio.volume = 0;
    this.audio.play()
      .then(() => {
        this._setState(true);
        this._fadeIn();
      })
      .catch(() => {
        // Autoplay blocked — allow the floating button's own click (a real
        // gesture) to retry via startMusic() instead of getting stuck.
        this.started = false;
        this._setState(false);
      });
  },

  _resume() {
    this.audio.volume = 1;
    this.audio.play()
      .then(() => this._setState(true))
      .catch(() => this._setState(false));
  },

  _fadeIn() {
    this._cancelFade();
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / this.FADE_MS);
      this.audio.volume = t;
      if (t < 1) {
        this.fadeRaf = requestAnimationFrame(step);
      } else {
        this.fadeRaf = null;
      }
    };
    this.fadeRaf = requestAnimationFrame(step);
  },

  _cancelFade() {
    if (this.fadeRaf) {
      cancelAnimationFrame(this.fadeRaf);
      this.fadeRaf = null;
    }
  },

  _setState(playing) {
    this.btn.classList.toggle('is-playing', playing);
    this.btn.setAttribute('aria-pressed', String(playing));
    this.btn.setAttribute('aria-label', playing ? 'وەستاندنی مۆسیقا' : 'لێدانی مۆسیقا');
    if (this.icon) this.icon.setAttribute('href', playing ? '#icon-pause' : '#icon-play');
  }
};

/* --- Final "I'll be there" CTA: fades the button, then runs a 5s
   celebration (flowers + petals falling again into the existing
   petal-burst layer) alongside a centered frosted-glass thank-you panel.
   Mirrors RevealAndPetalBurst's reduced-motion handling. --- */
const EndingCelebration = {
  DURATION_MS: 5000,
  FLOWER_INTERVAL_MS: 850,
  PETAL_INTERVAL_MS: 250,

  init() {
    this.btn = document.getElementById('ending-cta-btn');
    this.layer = document.getElementById('petal-burst-layer');
    this.message = document.getElementById('ending-message');
    if (!this.btn || !this.layer || !this.message) return;
    this.btn.addEventListener('click', () => this.trigger(), { once: true });
  },

  trigger() {
    this.btn.classList.add('is-fading');
    setTimeout(() => { this.btn.hidden = true; }, 600);

    this.showMessage();
    this.runFall();
  },

  showMessage() {
    this.message.classList.add('is-visible');
    setTimeout(() => this.message.classList.remove('is-visible'), this.DURATION_MS);
  },

  runFall() {
    const reduced = document.documentElement.dataset.motion === 'reduced';

    if (reduced) {
      // No continuous spawn loop under reduced motion — a small static-ish
      // batch instead, same as RevealAndPetalBurst's one-time burst.
      for (let i = 0; i < 4; i++) this.spawnFlower();
      for (let i = 0; i < 6; i++) this.spawnPetal();
      return;
    }

    // Seed immediately so the burst is never empty-looking at t=0.
    for (let i = 0; i < 4; i++) this.spawnFlower();
    for (let i = 0; i < 5; i++) this.spawnPetal();

    const flowerTimer = setInterval(() => this.spawnFlower(), this.FLOWER_INTERVAL_MS);
    const petalTimer = setInterval(() => this.spawnPetal(), this.PETAL_INTERVAL_MS);

    // Stop spawning at the 5s mark; elements already falling finish their
    // own animation and self-remove via animationend, so nothing is cut
    // off mid-fall.
    setTimeout(() => {
      clearInterval(flowerTimer);
      clearInterval(petalTimer);
    }, this.DURATION_MS);
  },

  spawnFlower() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('ending-flower');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('aria-hidden', 'true');

    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', '#icon-rose');
    svg.appendChild(use);

    svg.style.setProperty('--x', (6 + Math.random() * 84) + '%');
    svg.style.setProperty('--ef-size', (34 + Math.random() * 24) + 'px');
    svg.style.setProperty('--ef-dur', (3.6 + Math.random() * 1.6) + 's');
    svg.style.setProperty('--ef-op', (0.75 + Math.random() * 0.22).toFixed(2));
    svg.style.setProperty('--ef-x1', (Math.random() * 44 - 22) + 'px');
    svg.style.setProperty('--ef-x2', (Math.random() * 56 - 28) + 'px');
    svg.style.setProperty('--ef-r', (Math.random() * 300 - 150) + 'deg');

    svg.addEventListener('animationend', () => svg.remove(), { once: true });
    this.layer.appendChild(svg);
  },

  spawnPetal() {
    const petal = document.createElement('span');
    petal.className = 'petal';
    petal.style.setProperty('--x', (Math.random() * 100) + '%');
    petal.style.setProperty('--rot', (Math.random() * 360) + 'deg');
    petal.style.setProperty('--dur', (2.8 + Math.random() * 1.6) + 's');
    petal.style.setProperty('--delay', (Math.random() * 0.3) + 's');
    petal.style.setProperty('--scale', (0.6 + Math.random() * 0.7).toFixed(2));
    petal.addEventListener('animationend', () => petal.remove(), { once: true });
    this.layer.appendChild(petal);
  }
};

/* --- Bootstrap --- */
document.addEventListener('DOMContentLoaded', () => {
  ReducedMotionGuard.init();
  CustomCursor.init();
  MusicPlayer.init();
  EndingCelebration.init();

  VideoGateController.init(() => RevealAndPetalBurst.run());

  AssetGate.whenReady().then(() => {
    const loader = document.getElementById('loader');
    const videoGate = document.getElementById('video-gate');
    if (loader) loader.classList.add('is-hidden');
    if (videoGate) videoGate.removeAttribute('inert');
  });
});
