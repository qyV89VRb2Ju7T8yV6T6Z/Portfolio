(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover:hover) and (pointer:fine)').matches;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* ── Hero stage scaling ── */
  const root = document.documentElement;
  const stage = $('#stage');
  function fitStage() {
    const vw = innerWidth;
    const s = clamp((vw - 40) / 1160, 0.3, 1);
    root.style.setProperty('--s', s);
  }
  fitStage();
  addEventListener('resize', fitStage);

  /* ── Hero: mouse parallax + draggable stickers ── */
  const items = $$('.item:not(.static)', stage);
  let mx = 0, my = 0;
  const plant = $('.plant');
  // (mouse parallax removed: objects stay put while the cursor moves)

  // scroll parallax (items drift at different speeds as the hero leaves)
  const hero = $('#hero');
  function heroScroll() {
    if (reduce) return;
    const y = clamp(scrollY, 0, hero.offsetHeight);
    items.forEach(it => {
      const d = parseFloat(it.dataset.depth || 0);
      it.style.setProperty('--sy', (-y * 0.06 * d).toFixed(1) + 'px');   // transform-only, no re-layout
    });
  }

  let z = 10;
  items.forEach(it => {
    let sx, sy, ox = 0, oy = 0, moved = false;
    it.addEventListener('pointerdown', e => {
      it.setPointerCapture(e.pointerId);
      it.classList.add('dragging'); it.classList.remove('settle');
      it.style.zIndex = ++z;
      sx = e.clientX; sy = e.clientY;
      ox = parseFloat(it.dataset.ox || 0); oy = parseFloat(it.dataset.oy || 0);
      moved = false;
    });
    it.addEventListener('pointermove', e => {
      if (!it.classList.contains('dragging')) return;
      const s = parseFloat(getComputedStyle(root).getPropertyValue('--s')) || 1;
      const dx = (e.clientX - sx) / s, dy = (e.clientY - sy) / s;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      it.style.setProperty('--dx', ox + dx + 'px');
      it.style.setProperty('--dy', oy + dy + 'px');
      it.dataset.cx = ox + dx; it.dataset.cy = oy + dy;
    });
    const end = () => {
      if (!it.classList.contains('dragging')) return;
      it.classList.remove('dragging');
      if (moved) { it.dataset.ox = it.dataset.cx; it.dataset.oy = it.dataset.cy; it.classList.add('settle'); }
    };
    it.addEventListener('pointerup', end);
    it.addEventListener('pointercancel', end);
  });
  // double-click resets a sticker
  items.forEach(it => it.addEventListener('dblclick', () => {
    it.classList.add('settle');
    it.dataset.ox = it.dataset.oy = 0;
    it.style.setProperty('--dx', '0px'); it.style.setProperty('--dy', '0px');
  }));

  /* ── Vinyl: hover to show the album art on the record and play a track ──
     Cover art + a 30-second preview are looked up from Apple's public iTunes Search API,
     so no copyrighted files live in this project. Change the two queries to swap the record. */
  const MUSIC = { cover: 'One Direction Midnight Memories', coverName: 'Midnight Memories',
                  song: 'One Direction Night Changes', songName: 'Night Changes', artist: 'One Direction' };
  const vinyl = $('#vinyl');
  const music = { audio: null, loading: null, want: false, fadeT: 0 };

  function loadMusic() {
    if (music.loading) return music.loading;
    const find = (term, entity) => fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(term)}&entity=${entity}&limit=8`).then(r => r.json()).then(j => j.results || []);
    music.loading = Promise.all([find(MUSIC.cover, 'album'), find(MUSIC.song, 'song')]).then(([albums, songs]) => {
      const alb = albums.find(a => a.collectionName === MUSIC.coverName && /one direction/i.test(a.artistName)) || albums.find(a => /one direction/i.test(a.artistName));
      const song = songs.find(s => s.trackName === MUSIC.songName && /one direction/i.test(s.artistName) && s.previewUrl);
      if (alb) {
        const art = alb.artworkUrl100.replace('100x100bb', '600x600bb');
        $('#labelArt').addEventListener('load', () => vinyl.classList.add('has-art'), { once: true });
        $('#labelArt').src = art;
      }
      if (song) {
        music.audio = new Audio(song.previewUrl);
        music.audio.loop = true; music.audio.volume = 0; music.audio.preload = 'auto';
        music.audio.addEventListener('playing', () => vinyl.classList.add('playing'));
        music.audio.addEventListener('pause', () => vinyl.classList.remove('playing'));
      }
    }).catch(() => {});
    return music.loading;
  }
  function fadeTo(v, ms, done) {
    const a = music.audio; if (!a) return;
    cancelAnimationFrame(music.fadeT);
    const from = a.volume, t0 = performance.now();
    const step = t => {
      const k = clamp((t - t0) / ms, 0, 1);
      a.volume = from + (v - from) * k;
      if (k < 1) music.fadeT = requestAnimationFrame(step); else done && done();
    };
    music.fadeT = requestAnimationFrame(step);
  }
  async function playTrack() {
    music.want = true; vinyl.classList.add('on'); vinyl.setAttribute('aria-pressed', 'true'); spin.target = RPM * 6; kick();
    await loadMusic();
    if (!music.want || !music.audio) return;
    try { await music.audio.play(); fadeTo(0.55, 700); }
    catch { $('#npText').textContent = 'Click anywhere to play ♪'; }   // browsers block sound until the page is clicked once
  }
  function stopTrack() {
    music.want = false; vinyl.classList.remove('on'); vinyl.setAttribute('aria-pressed', 'false'); spin.target = 0; kick();
    $('#npText').textContent = MUSIC.songName + ' · ' + MUSIC.artist;
    fadeTo(0, 450, () => { if (!music.want && music.audio) music.audio.pause(); });
  }
  /* turntable physics: the record eases up to 33⅓ rpm, and winds down slowly when stopped */
  const RPM = 33.3, platter = $('.platter', vinyl);
  const spin = { a: 0, v: 0, target: 0, raf: 0, t: 0 };
  function spinTick(t) {
    const dt = Math.min((t - spin.t) / 1000, 0.05); spin.t = t;
    const up = spin.target > spin.v;
    spin.v += (spin.target - spin.v) * (1 - Math.exp(-dt / (up ? 0.45 : 1.3)));   // motor is quick, friction is slow
    if (spin.target === 0 && spin.v < 1) spin.v = 0;
    spin.a = (spin.a + spin.v * dt) % 360;
    platter.style.setProperty('--a', spin.a.toFixed(2) + 'deg');
    spin.raf = spin.v || spin.target ? requestAnimationFrame(spinTick) : 0;
  }
  function kick() { if (!spin.raf && !reduce) { spin.t = performance.now(); spin.raf = requestAnimationFrame(spinTick); } }
  const toggle = () => music.want ? stopTrack() : playTrack();

  // hover plays (spins up + fades the song in), leaving lets it wind down; touch screens tap to toggle
  let down;
  vinyl.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') playTrack(); });
  vinyl.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') stopTrack(); });
  vinyl.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; loadMusic(); });
  vinyl.addEventListener('pointerup', e => {
    if (e.pointerType === 'touch' && down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8) toggle();
    down = null;
  });
  // browsers block sound until the page has been clicked once — retry on the first click while hovering
  addEventListener('pointerdown', () => { if (music.want && music.audio && music.audio.paused) { $('#npText').textContent = MUSIC.songName + ' · ' + MUSIC.artist; playTrack(); } });
  vinyl.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  // put the album art on the label once the page has settled
  addEventListener('load', () => (window.requestIdleCallback || setTimeout)(() => loadMusic(), { timeout: 2500 }));

  /* ── Note corner lift (hover only), modelled on a real sheet whose corner bends up toward you:
     no back of the page shows — the right edge runs straight then curves in, the bottom edge sweeps up,
     they meet at a crisp (barely rounded) tip; a soft crease shade runs across the bend and a shadow
     falls on the mat where the corner used to lie. Flat at rest. ── */
  const noteCard = $('.card.notepad'), npSheet = $('#npSheet'), liftSh = $('#liftShadow');
  if (noteCard && npSheet && liftSh && !reduce && matchMedia('(hover: hover)').matches) {
    const W = 350, H = 293, MAX = 74, f = n => n.toFixed(1);
    const K = { c: 0, g: 0, raf: 0, t: 0 };
    const draw = L => {
      if (L < .5) { npSheet.style.clipPath = ''; liftSh.setAttribute('d', ''); noteCard.style.setProperty('--lk', 0); return; }
      const tip = [W - .26 * L, H - .05 * L];
      const outline =
        `M0 0H${W}V${f(H - L)}` +
        `C${W} ${f(H - .46 * L)} ${f(W - .12 * L)} ${f(H - .14 * L)} ${f(tip[0])} ${f(tip[1])}` +                         // right edge curls in to a sharp tip
        `C${f(W - .36 * L)} ${f(H - .025 * L)} ${f(W - .5 * L)} ${H} ${f(W - .66 * L)} ${H}` +                              // bottom edge sweeps up from it
        `H0Z`;
      npSheet.style.clipPath = `path('${outline}')`;
      // shadow on the mat: under the lifted corner, reaching a little beyond where the corner sat
      liftSh.setAttribute('d', `M${W} ${f(H - .85 * L)}C${f(W + .08 * L)} ${f(H - .3 * L)} ${f(W + .06 * L)} ${f(H + .05 * L)} ${f(W - .1 * L)} ${f(H + .1 * L)}` +
        `C${f(W - .3 * L)} ${f(H + .1 * L)} ${f(W - .5 * L)} ${f(H + .04 * L)} ${f(W - .62 * L)} ${H}L${f(tip[0])} ${f(tip[1])}Z`);
      noteCard.style.setProperty('--L', f(L) + 'px'); noteCard.style.setProperty('--lk', Math.min(1, L / 20).toFixed(2));
    };
    const step = t => {
      const dt = Math.min((t - (K.t || t)) / 1000, .05); K.t = t;
      K.c += (K.g - K.c) * (1 - Math.exp(-dt * 9));
      draw(K.c);
      if (Math.abs(K.g - K.c) > .2) K.raf = requestAnimationFrame(step); else { K.c = K.g; draw(K.c); K.raf = 0; K.t = 0; }
    };
    const aim = g => { K.g = g; if (!K.raf) K.raf = requestAnimationFrame(step); };
    noteCard._curl = aim;   // testing: $('.card.notepad')._curl(74)
    noteCard.addEventListener('pointerenter', () => aim(MAX));
    noteCard.addEventListener('pointerleave', () => aim(0));
  }

  /* ── Mat light: the grid lines near the pointer glow, like the heading — only the lines, never the squares ── */
  const matEl = $('#hero'), glowCv = $('.hero-light');
  if (matEl && glowCv && !reduce && matchMedia('(hover: hover)').matches) {
    const ctx = glowCv.getContext('2d');
    const GAP = 40, OFF = 20, R = 200;                 // grid pitch / first line (matches hero-grid.png) / light radius
    const G = { x: -1e4, y: -1e4, gx: -1e4, gy: -1e4, k: 0, gk: 0, raf: 0, t: 0, w: 0, h: 0, dpr: 1, dirty: null };
    const size = () => {
      G.dpr = Math.min(devicePixelRatio || 1, 2); G.w = matEl.clientWidth; G.h = matEl.offsetHeight;
      glowCv.width = G.w * G.dpr; glowCv.height = G.h * G.dpr;
      glowCv.style.width = G.w + 'px'; glowCv.style.height = G.h + 'px';
      G.dirty = null;
    };
    size(); new ResizeObserver(size).observe(matEl);
    const draw = () => {
      const { dpr } = G;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (G.dirty) ctx.clearRect(G.dirty[0], G.dirty[1], G.dirty[2], G.dirty[3]);
      if (G.k < 0.004) { G.dirty = null; return; }
      const x0 = G.x - R, y0 = G.y - R;
      G.dirty = [x0 - 12, y0 - 12, R * 2 + 24, R * 2 + 24];
      const grad = ctx.createRadialGradient(G.x, G.y, 0, G.x, G.y, R);
      grad.addColorStop(0, `rgba(222,255,230,${0.26 * G.k})`);
      grad.addColorStop(0.35, `rgba(205,248,216,${0.12 * G.k})`);
      grad.addColorStop(0.7, `rgba(190,240,204,${0.035 * G.k})`);
      grad.addColorStop(1, 'rgba(190,240,204,0)');
      ctx.beginPath();
      for (let x = OFF + Math.ceil((x0 - OFF) / GAP) * GAP; x <= G.x + R; x += GAP) { ctx.moveTo(x, y0); ctx.lineTo(x, G.y + R); }
      for (let y = OFF + Math.ceil((y0 - OFF) / GAP) * GAP; y <= G.y + R; y += GAP) { ctx.moveTo(x0, y); ctx.lineTo(G.x + R, y); }
      ctx.strokeStyle = grad;
      ctx.lineCap = 'butt';
      ctx.shadowColor = `rgba(190,255,210,${0.32 * G.k})`; ctx.shadowBlur = 8;   // bloom along the lines
      ctx.lineWidth = 2; ctx.stroke();
      ctx.shadowBlur = 0; ctx.lineWidth = 1.2; ctx.stroke();                     // crisp core
    };
    const loop = t => {
      const dt = Math.min((t - (G.t || t)) / 1000, 0.05); G.t = t;
      const f = 1 - Math.exp(-dt * 9), fk = 1 - Math.exp(-dt * 5);
      G.x += (G.gx - G.x) * f; G.y += (G.gy - G.y) * f; G.k += (G.gk - G.k) * fk;
      draw();
      const busy = Math.abs(G.gx - G.x) + Math.abs(G.gy - G.y) > 0.2 || Math.abs(G.gk - G.k) > 0.003;
      if (busy) G.raf = requestAnimationFrame(loop); else { G.raf = 0; G.t = 0; }
    };
    const kickG = () => { if (!G.raf) G.raf = requestAnimationFrame(loop); };
    const aimG = e => { const r = matEl.getBoundingClientRect(); G.gx = e.clientX - r.left; G.gy = e.clientY - r.top; kickG(); };
    matEl.addEventListener('pointerenter', e => { aimG(e); if (G.k < 0.01) { G.x = G.gx; G.y = G.gy; } G.gk = 1; kickG(); });
    matEl.addEventListener('pointermove', aimG, { passive: true });
    matEl.addEventListener('pointerleave', () => { G.gk = 0; kickG(); });
  }

  /* ── Frosted heading: blur the mat behind the letters only. Each word's glyphs are drawn into a canvas,
     which becomes the mask of a backdrop-blur layer sitting right behind that word. ── */
  function frostHeading() {
    $$('#nameWrap > .name:not(.name-lit) .tx').forEach(tx => {
      let fr = tx.previousElementSibling;
      if (!fr || !fr.classList.contains('frost')) { fr = document.createElement('i'); fr.className = 'frost'; fr.setAttribute('aria-hidden', 'true'); tx.before(fr); }
      const cs = getComputedStyle(tx), w = tx.offsetWidth, h = tx.offsetHeight, dpr = Math.min(devicePixelRatio || 1, 2);
      if (!w || !h) return;
      const cv = document.createElement('canvas'); cv.width = Math.ceil(w * dpr); cv.height = Math.ceil(h * dpr);
      const ctx = cv.getContext('2d'); ctx.scale(dpr, dpr);
      ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = cs.letterSpacing;
      const fs = parseFloat(cs.fontSize), m = ctx.measureText(tx.textContent);
      const asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
      const base = parseFloat(cs.paddingTop) + (fs - (asc + desc)) / 2 + asc;     // line-height is 1em
      ctx.fillText(tx.textContent, parseFloat(cs.paddingLeft), base);
      const url = `url(${cv.toDataURL()})`;
      Object.assign(fr.style, { left: tx.offsetLeft + 'px', top: tx.offsetTop + 'px', width: w + 'px', height: h + 'px',
        webkitMaskImage: url, maskImage: url });
    });
  }
  if (CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)')) {
    (document.fonts ? document.fonts.ready : Promise.resolve()).then(frostHeading);
    let frT; addEventListener('resize', () => { clearTimeout(frT); frT = setTimeout(frostHeading, 150); });
  }

  /* ── Luminous heading: a spotlight that follows the pointer (with a short afterglow); click to switch all lights on ── */
  const nameWrap = $('#nameWrap');
  if (nameWrap && !reduce) {
    const lit = $('.name', nameWrap).cloneNode(true);
    lit.classList.add('name-lit'); lit.setAttribute('aria-hidden', 'true');
    nameWrap.appendChild(lit);
    const L = { x: 0, y: 0, tx: 0, ty: 0, gx: 0, gy: 0, raf: 0, in: false, t: 0 };
    const loop = t => {
      const dt = Math.min((t - (L.t || t)) / 1000, 0.05); L.t = t;
      const f = 1 - Math.exp(-dt * 7), g = 1 - Math.exp(-dt * 2.6);   // frame-rate independent easing: light glides, glow lags
      L.x += (L.gx - L.x) * f;  L.y += (L.gy - L.y) * f;
      L.tx += (L.x - L.tx) * g; L.ty += (L.y - L.ty) * g;
      lit.style.setProperty('--mx', L.x.toFixed(1) + 'px'); lit.style.setProperty('--my', L.y.toFixed(1) + 'px');
      lit.style.setProperty('--tx', L.tx.toFixed(1) + 'px'); lit.style.setProperty('--ty', L.ty.toFixed(1) + 'px');
      const settled = Math.abs(L.gx - L.tx) + Math.abs(L.gy - L.ty) < 0.3;
      if (L.in || !settled) L.raf = requestAnimationFrame(loop); else { L.raf = 0; L.t = 0; }
    };
    // pointer position in the lit layer's own box (it extends 48px past the heading for the glow)
    const at = e => { const r = lit.getBoundingClientRect(); L.gx = e.clientX - r.left; L.gy = e.clientY - r.top; };
    nameWrap.addEventListener('pointerenter', e => {
      at(e); if (!L.raf) { L.x = L.tx = L.gx; L.y = L.ty = L.gy; }
      L.in = true; lit.style.setProperty('--on', 1); if (!L.raf) L.raf = requestAnimationFrame(loop);
    });
    nameWrap.addEventListener('pointermove', at);
    nameWrap.addEventListener('pointerleave', () => { L.in = false; lit.style.setProperty('--on', 0); });
    nameWrap.addEventListener('click', () => nameWrap.classList.toggle('lights'));
  }

  /* ── Pinned pieces: pendulum physics around the pin ── */
  // Each card hangs from its pin. A damped spring pulls it back to its resting tilt,
  // pointer movement and page scrolling nudge it, and dragging swings it around the pin.
  const pinned = $$('.pinned').map(el => {
    const pin = el.getBoundingClientRect();
    return { el, card: $('.card', el), a: 0, w: 0, held: false, lastA: 0, k: 22, c: 5.6, max: 34 };
  });
  const pinCenter = p => { const r = p.el.getBoundingClientRect(); return { x: r.left, y: r.top }; };
  const ang = (p, x, y) => { const c = pinCenter(p); return Math.atan2(y - c.y, x - c.x) * 180 / Math.PI; };

  pinned.forEach((p, i) => {
    if (!reduce) { p.a = i ? -4 : 4; }                       // settle in when the page loads
    p.card.addEventListener('pointerdown', e => {
      p.card.setPointerCapture(e.pointerId);
      p.held = true; p.el.classList.add('held');
      p.startPtr = ang(p, e.clientX, e.clientY); p.startA = p.a; p.w = 0; p.lastT = performance.now(); p.lastA = p.a;
      e.stopPropagation();
    });
    p.card.addEventListener('pointermove', e => {
      if (p.held) {
        let d = ang(p, e.clientX, e.clientY) - p.startPtr;
        d = ((d + 540) % 360) - 180;                           // shortest way round
        const target = clamp(p.startA + d, -p.max, p.max);
        const now = performance.now(), dt = Math.max(1, now - p.lastT) / 1000;
        p.w = (target - p.a) / dt * 0.35 + p.w * 0.65;          // remember the swing speed for release
        p.a = target; p.lastT = now;
      }
    });
    const release = () => { p.held = false; p.w = clamp(p.w, -42, 42); p.el.classList.remove('held'); };
    p.card.addEventListener('pointerup', release);
    p.card.addEventListener('pointercancel', release);
  });

  let lastSY = scrollY;
  addEventListener('scroll', () => {
    const dy = scrollY - lastSY; lastSY = scrollY;
    if (reduce) return;
    pinned.forEach((p, i) => { if (!p.held) p.w = clamp(p.w + clamp(dy, -60, 60) * (i ? -0.05 : 0.05), -34, 34); });
  }, { passive: true });

  let lastT = performance.now();
  function physics(t) {
    const dt = Math.min(0.033, (t - lastT) / 1000); lastT = t;
    pinned.forEach(p => {
      if (!p.held && !reduce) {
        const acc = -p.k * p.a - p.c * p.w;                     // spring (gravity) + damping
        p.w += acc * dt; p.a += p.w * dt;
        if (Math.abs(p.a) > p.max) { p.a = Math.sign(p.a) * p.max; p.w *= -0.3; }
        if (Math.abs(p.a) < 0.01 && Math.abs(p.w) < 0.01) { p.a = 0; p.w = 0; }
      }
      if (reduce) p.a = 0;
      p.el.style.setProperty('--a', p.a.toFixed(3) + 'deg');
    });
    requestAnimationFrame(physics);
  }
  requestAnimationFrame(physics);

  /* ── Confetti ── */
  const colors = ['#0bcb92', '#ad4ff7', '#f87777', '#f0bd0a', '#0057ff', '#ffabe7'];
  function confetti(x, y, n = 36) {
    if (reduce) return;
    for (let i = 0; i < n; i++) {
      const b = document.createElement('i');
      b.className = 'bit';
      b.style.background = colors[i % colors.length];
      b.style.left = x + 'px'; b.style.top = y + 'px';
      document.body.appendChild(b);
      const a = Math.random() * Math.PI * 2, v = 120 + Math.random() * 220;
      const dx = Math.cos(a) * v, dy = Math.sin(a) * v - 120;
      b.animate([
        { transform: 'translate(0,0) rotate(0)', opacity: 1 },
        { transform: `translate(${dx}px,${dy + 260}px) rotate(${Math.random() * 720}deg)`, opacity: 0 }
      ], { duration: 900 + Math.random() * 500, easing: 'cubic-bezier(.2,.7,.4,1)' }).onfinish = () => b.remove();
    }
  }
  const smiley = $('#smiley');
  const boom = () => {                                   // a little pop, no confetti
    smiley.classList.remove('pop'); void smiley.offsetWidth; smiley.classList.add('pop');
  };
  smiley.addEventListener('click', boom);
  smiley.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') boom(); });
  $$('.soc').forEach(a => a.addEventListener('click', e => confetti(e.clientX, e.clientY, 22)));

  /* ── Tool stack: hover to fan Figma, Claude, Notion and Procreate out in a semicircle ── */
  const stack = $('#stack');
  let stDown = null;
  stack.addEventListener('pointerdown', e => { stDown = { x: e.clientX, y: e.clientY }; });
  const toggleStack = open => {
    const on = open === undefined ? !stack.classList.contains('open') : open;
    stack.classList.toggle('open', on); stack.setAttribute('aria-expanded', on);
  };
  // mouse: hovering fans the cards out; touch: a tap toggles them.
  // A small state machine keeps it either fully open or fully closed: opening waits a beat for intent,
  // closing waits a beat in case the pointer is just crossing a gap, and after it closes it ignores
  // re-entry until the cards are home (otherwise the returning pile would re-trigger hover → flicker).
  const ST = { inside: false, openT: 0, closeT: 0, lockUntil: 0 };
  const settle = () => {
    clearTimeout(ST.openT);
    const wait = Math.max(0, ST.lockUntil - performance.now());
    ST.openT = setTimeout(() => { if (ST.inside && !stack.classList.contains('open')) toggleStack(true); }, Math.max(70, wait));
  };
  stack.addEventListener('pointerenter', e => {
    if (e.pointerType === 'touch') return;
    ST.inside = true; clearTimeout(ST.closeT);
    if (!stack.classList.contains('open')) settle();
  });
  stack.addEventListener('pointerleave', e => {
    if (e.pointerType === 'touch') return;
    ST.inside = false; clearTimeout(ST.openT); clearTimeout(ST.closeT);
    ST.closeT = setTimeout(() => {
      if (ST.inside || !stack.classList.contains('open')) return;
      toggleStack(false); ST.lockUntil = performance.now() + 380;   // let the cards land before hover can reopen
    }, 180);
  });
  stack.addEventListener('pointerup', e => {
    if (e.pointerType === 'touch' && stDown && Math.hypot(e.clientX - stDown.x, e.clientY - stDown.y) < 6) toggleStack();
  });
  stack.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleStack(); } });
  addEventListener('pointerdown', e => { if (!stack.contains(e.target)) toggleStack(false); });

  /* ── iPad: other books load lazily; touch screens tap to flip to the library ── */
  const ipad = $('#ipad');
  $$('.cv img[data-src]', ipad).forEach(img => {
    img.addEventListener('error', () => img.remove());
    const go = () => { img.src = img.dataset.src; };
    ('requestIdleCallback' in window) ? requestIdleCallback(go, { timeout: 2500 }) : setTimeout(go, 1200);
  });
  let ipDown = null;
  ipad.addEventListener('pointerdown', e => { ipDown = { x: e.clientX, y: e.clientY }; });
  ipad.addEventListener('pointerup', e => {
    if (e.pointerType === 'touch' && ipDown && Math.hypot(e.clientX - ipDown.x, e.clientY - ipDown.y) < 8) ipad.classList.toggle('lib');
  });

  /* ── Folder tab width drives the leather mask ── */
  function sizeTabs() {
    $$('.proj').forEach(p => p.style.setProperty('--lw', Math.ceil($('.tab-text', p).offsetWidth) + 'px'));
  }
  sizeTabs();
  document.fonts && document.fonts.ready.then(sizeTabs);

  /* ── Toast ── */
  const toast = $('#toast');
  function say(t) { toast.textContent = t; toast.classList.add('on'); clearTimeout(say.t); say.t = setTimeout(() => toast.classList.remove('on'), 2200); }
  $('.soc-mail').addEventListener('click', () => say('Opening your mail app ✉️'));

  /* ── Reveal on scroll ── */
  const io = new IntersectionObserver(es => es.forEach(e => {
    if (!e.isIntersecting) return;
    const el = e.target;
    const idx = $$('.proj').indexOf(el);
    setTimeout(() => {
      el.classList.add('in');
      if (el.classList.contains('proj')) setTimeout(() => el.classList.add('live'), 900);
    }, idx >= 0 ? (idx % 2) * 140 + Math.floor(idx / 2) * 80 : 0);
    io.unobserve(el);
  }), { threshold: 0.18 });
  $$('.reveal').forEach(el => io.observe(el));
  if (reduce) $$('.reveal').forEach(el => el.classList.add('in', 'live'));

  /* ── Project card 3D tilt ── */
  if (fine && !reduce) {
    $$('.proj').forEach(card => {
      card.addEventListener('pointermove', e => {
        const r = card.getBoundingClientRect();
        const px = (e.clientX - r.left) / r.width - 0.5;
        const py = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty('--tx', px.toFixed(2)); card.style.setProperty('--ty', py.toFixed(2));
        card.style.setProperty('--ry', (px * 9).toFixed(2) + 'deg');
        card.style.setProperty('--rx', (-py * 9).toFixed(2) + 'deg');
      });
      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); card.style.setProperty('--tx', 0); card.style.setProperty('--ty', 0);
      });
    });
  }

  /* ── Nav: scrollspy + sliding pill ── */
  const tabs = $$('.tab[data-spy]');
  const pill = $('.nav-pill');
  const navTabs = $('.nav-tabs');
  function movePill(tab) {
    pill.style.width = tab.offsetWidth + 'px';
    pill.style.transform = `translateX(${tab.offsetLeft}px)`;
    pill.style.height = tab.offsetHeight + 'px';
  }
  function setActive(id) {
    tabs.forEach(t => t.classList.toggle('is-active', t.dataset.spy === id));
    const t = tabs.find(t => t.dataset.spy === id) || tabs[0];
    movePill(t);
  }
  const secs = ['work', 'playground', 'about'].map(id => document.getElementById(id));
  function spy() {
    const mid = scrollY + innerHeight * 0.4;
    let cur = 'work';
    secs.forEach(s => { if (mid >= s.offsetTop) cur = s.id; });
    // near the very bottom → about
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 40) cur = 'about';
    if (spy.cur !== cur) { spy.cur = cur; setActive(cur); }
  }
  addEventListener('resize', () => setActive(spy.cur || 'work'));
  document.fonts && document.fonts.ready.then(() => setActive(spy.cur || 'work'));
  setActive('work');

  /* ── Playground: scroll-linked + draggable rail ── */
  const section = $('#playground');
  const rail = $('#rail');
  const track = $('#track');
  let drag = 0, target = 0, cur = 0, dragging = false;

  // measurements are cached (refreshed by observers/scroll) so the per-frame loop never forces a layout
  let maxS = 0, prog = 0;
  const measureRail = () => { maxS = Math.max(0, track.scrollWidth - rail.clientWidth); };
  const measureProg = () => { const r = section.getBoundingClientRect(); prog = clamp((innerHeight - r.top) / (innerHeight + r.height), 0, 1); };
  new ResizeObserver(measureRail).observe(track); new ResizeObserver(measureRail).observe(rail);
  addEventListener('scroll', measureProg, { passive: true }); addEventListener('resize', measureProg);
  measureRail(); measureProg();
  const maxShift = () => maxS;
  const progress = () => prog;
  function computeTarget() {
    const base = -progress() * maxShift() * 0.9;
    target = clamp(base + drag, -maxShift(), 60);
  }
  function loop() {
    computeTarget();
    cur += (target - cur) * (dragging ? 0.4 : 0.09);
    if (Math.abs(target - cur) < 0.05) cur = target;
    track.style.transform = `translate3d(${cur.toFixed(2)}px,0,0)`;
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  let sx = 0, sd = 0, moved = 0;
  rail.addEventListener('pointerdown', e => {
    dragging = true; sx = e.clientX; sd = drag; moved = 0;
    rail.classList.add('drag');
  });
  addEventListener('pointermove', e => {
    if (!dragging) return;
    moved = Math.abs(e.clientX - sx);
    drag = sd + (e.clientX - sx);
  });
  addEventListener('pointerup', () => { dragging = false; rail.classList.remove('drag'); });
  // horizontal wheel / trackpad swipe moves the rail too
  rail.addEventListener('wheel', e => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) { drag -= e.deltaX; e.preventDefault(); }
  }, { passive: false });

  // ticker arrows: step the rail one card at a time (for anyone who can't or won't drag)
  const prevBtn = $('.tick.prev'), nextBtn = $('.tick.next');
  const stepSize = () => { const c = $('.pg:not(.hide)', track); return c ? c.offsetWidth + parseFloat(getComputedStyle(track).columnGap || 80) : 400; };
  const nudgeRail = dir => {
    const base = -progress() * maxShift() * 0.9;
    drag = clamp(drag - dir * stepSize(), -maxShift() - base, 60 - base);
  };
  prevBtn.addEventListener('click', () => nudgeRail(-1));
  nextBtn.addEventListener('click', () => nudgeRail(1));
  setInterval(() => {   // grey out an arrow at either end
    prevBtn.setAttribute('aria-disabled', target >= 59); nextBtn.setAttribute('aria-disabled', target <= -maxShift() + 1);
  }, 250);

  // filters (section tabs): a sliding pill marks the selected tab; arrow keys move between tabs
  const chipBar = $('.chips'), chipPill = $('.chip-pill'), chips = $$('.chip');
  const placePill = () => {
    const on = $('.chip.is-on'); if (!on || !chipPill) return;
    chipPill.style.width = on.offsetWidth + 'px';
    chipPill.style.transform = `translateX(${on.offsetLeft}px)`;
  };
  placePill(); (document.fonts ? document.fonts.ready : Promise.resolve()).then(placePill); addEventListener('resize', placePill);
  chipBar.addEventListener('keydown', e => {
    const i = chips.indexOf(document.activeElement); if (i < 0) return;
    let j = null;
    if (e.key === 'ArrowRight') j = (i + 1) % chips.length;
    else if (e.key === 'ArrowLeft') j = (i - 1 + chips.length) % chips.length;
    else if (e.key === 'Home') j = 0; else if (e.key === 'End') j = chips.length - 1;
    if (j === null) return;
    e.preventDefault(); chips[j].focus(); chips[j].click();
  });
  chips.forEach(chip => chip.addEventListener('click', () => {
    chips.forEach(c => { const on = c === chip; c.classList.toggle('is-on', on); c.setAttribute('aria-selected', on); c.tabIndex = on ? 0 : -1; });
    placePill();
    // only scroll the tab bar if the chosen tab is clipped (narrow screens)
    if (chip.offsetLeft < chipBar.scrollLeft || chip.offsetLeft + chip.offsetWidth > chipBar.scrollLeft + chipBar.clientWidth)
      chipBar.scrollTo({ left: chip.offsetLeft - 12, behavior: 'smooth' });
    const f = chip.dataset.filter;
    $$('.pg', track).forEach(p => {
      const show = f === 'all' || p.dataset.cat === f;
      p.classList.toggle('hide', !show);
    });
    drag = 0;
  }));

  // handling marks: hover/focus show the label (CSS); on touch a tap toggles it
  const marks = $$('.mark');
  marks.forEach(m => m.addEventListener('pointerup', e => {
    if (e.pointerType !== 'touch') return;
    const open = !m.classList.contains('open');
    marks.forEach(x => x.classList.remove('open')); m.classList.toggle('open', open);
  }));
  addEventListener('pointerdown', e => { if (!e.target.closest('.mark')) marks.forEach(x => x.classList.remove('open')); });

  // lightbox
  const lb = $('#lightbox'), lbImg = $('img', lb);
  $$('.pg-frame').forEach(fr => fr.addEventListener('click', () => {
    if (moved > 6) return;
    lbImg.src = $('img', fr).src; lb.hidden = false;
  }));
  lb.addEventListener('click', () => lb.hidden = true);
  addEventListener('keydown', e => { if (e.key === 'Escape') lb.hidden = true; });

  /* ── Footer wordmark rises in ── */
  const foot = $('.footer-name');
  function footScroll() {
    const r = foot.getBoundingClientRect();
    const p = clamp(1 - (r.top - innerHeight * 0.55) / (innerHeight * 0.45), 0, 1);
    $('#footName').style.setProperty('--fy', ((1 - p) * 70).toFixed(1) + 'px');
  }

  /* ── Scroll handler ── */
  let tick = false;
  function onScroll() {
    if (tick) return; tick = true;
    requestAnimationFrame(() => { heroScroll(); spy(); footScroll(); tick = false; });
  }
  addEventListener('scroll', onScroll, { passive: true });
  onScroll();
})();
