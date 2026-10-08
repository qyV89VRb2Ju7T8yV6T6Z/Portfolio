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
    const s = clamp((vw - 40) / 1220, 0.42, 1);
    root.style.setProperty('--s', s);
  }
  fitStage();
  addEventListener('resize', fitStage);

  /* ── Hero: mouse parallax + draggable stickers ── */
  const items = $$('.item:not(.static)', stage);
  let mx = 0, my = 0;
  const plant = $('.plant');
  if (fine && !reduce) {
    $('#hero').addEventListener('pointermove', e => {
      const r = $('#hero').getBoundingClientRect();
      mx = (e.clientX - r.left) / r.width - 0.5;
      my = (e.clientY - r.top) / r.height - 0.5;
      plant.style.setProperty('--tx', mx.toFixed(3));
      plant.style.setProperty('--ty', my.toFixed(3));
      items.forEach(it => {
        if (it.classList.contains('dragging')) return;
        const d = parseFloat(it.dataset.depth || 0) * 22;
        it.style.setProperty('--px', (-mx * d).toFixed(1) + 'px');
        it.style.setProperty('--py', (-my * d).toFixed(1) + 'px');
      });
    });
    $('#hero').addEventListener('pointerleave', () => {
      items.forEach(it => { it.style.setProperty('--px', '0px'); it.style.setProperty('--py', '0px'); });
      plant.style.setProperty('--tx', 0); plant.style.setProperty('--ty', 0);
    });
  }

  // scroll parallax (items drift at different speeds as the hero leaves)
  const hero = $('#hero');
  function heroScroll() {
    if (reduce) return;
    const y = clamp(scrollY, 0, hero.offsetHeight);
    items.forEach(it => {
      const d = parseFloat(it.dataset.depth || 0);
      it.style.marginTop = (-y * 0.06 * d).toFixed(1) + 'px';
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
    music.want = true; vinyl.classList.add('on');
    await loadMusic();
    if (!music.want || !music.audio) return;
    try { await music.audio.play(); fadeTo(0.55, 700); }
    catch { $('#npText').textContent = 'Click anywhere to play ♪'; }   // browsers block sound until the page is clicked once
  }
  function stopTrack() {
    music.want = false; vinyl.classList.remove('on');
    $('#npText').textContent = MUSIC.songName + ' · ' + MUSIC.artist;
    fadeTo(0, 450, () => { if (!music.want && music.audio) music.audio.pause(); });
  }
  if (!reduce) {
    let down;
    vinyl.addEventListener('pointerenter', e => { if (e.pointerType !== 'touch') { loadMusic(); playTrack(); } });
    vinyl.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') stopTrack(); });
    vinyl.addEventListener('pointerdown', e => { down = { x: e.clientX, y: e.clientY }; loadMusic(); });
    vinyl.addEventListener('pointerup', e => {
      // touch screens have no hover: a tap toggles the record
      if (e.pointerType === 'touch' && down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8) music.want ? stopTrack() : playTrack();
    });
    addEventListener('pointerdown', () => { if (music.want && music.audio && music.audio.paused) { $('#npText').textContent = MUSIC.songName + ' · ' + MUSIC.artist; playTrack(); } });
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
      } else if (fine && !reduce) {
        // brushing past the lower part of the card gives it a push
        const c = pinCenter(p), s = parseFloat(getComputedStyle(root).getPropertyValue('--s')) || 1;
        const lever = clamp((e.clientY - c.y) / (180 * s), 0, 1.4);
        p.w = clamp(p.w - clamp(e.movementX, -30, 30) * lever * 0.11, -34, 34);
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

  /* ── Tool stickers: click Figma to fan out Claude + Notion ── */
  const stack = $('#stack');
  let stDown = null;
  stack.addEventListener('pointerdown', e => { stDown = { x: e.clientX, y: e.clientY }; });
  const toggleStack = open => {
    const on = open === undefined ? !stack.classList.contains('open') : open;
    stack.classList.toggle('open', on); stack.setAttribute('aria-expanded', on);
  };
  stack.addEventListener('pointerup', e => {
    if (stDown && Math.hypot(e.clientX - stDown.x, e.clientY - stDown.y) < 6) toggleStack();
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

  const maxShift = () => Math.max(0, track.scrollWidth - rail.clientWidth);
  const progress = () => {
    const r = section.getBoundingClientRect();
    return clamp((innerHeight - r.top) / (innerHeight + r.height), 0, 1);
  };
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

  // filters
  $$('.chip').forEach(chip => chip.addEventListener('click', () => {
    $$('.chip').forEach(c => { c.classList.toggle('is-on', c === chip); c.setAttribute('aria-selected', c === chip); });
    const f = chip.dataset.filter;
    $$('.pg', track).forEach(p => {
      const show = f === 'all' || p.dataset.cat === f;
      p.classList.toggle('hide', !show);
    });
    drag = 0;
  }));

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
