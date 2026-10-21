/* ============================================================
   LIQUID GLASS — Build Log / interactions
   vanilla, no deps
   ============================================================ */
(() => {
  'use strict';

  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
  };
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- toast ---------- */
  const toastEl = $('#toast');
  let toastTimer;
  function toast(text, ms = 2600) {
    if (!toastEl) return;
    toastEl.textContent = text;
    toastEl.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('is-on'), ms);
  }

  /* ---------- theme ---------- */
  const themeBtn = $('#themeBtn');
  const themeLabel = $('#themeLabel');
  const rootEl = document.documentElement;
  function applyTheme(t) {
    rootEl.dataset.theme = t;
    if (themeLabel) themeLabel.textContent = t === 'night' ? 'DAY' : 'NIGHT';
    store.set('lg-theme', t);
    document.dispatchEvent(new CustomEvent('themechange'));
  }
  applyTheme(store.get('lg-theme', 'day'));
  themeBtn?.addEventListener('click', () => {
    applyTheme(rootEl.dataset.theme === 'night' ? 'day' : 'night');
    toast(rootEl.dataset.theme === 'night' ? 'NIGHT SHIFT // 深空模式' : 'DAY SHIFT // 纸张模式');
  });

  /* ---------- split headlines ---------- */
  function splitEl(el) {
    const items = [];
    const megaLines = el.querySelectorAll('.mega-line');
    if (megaLines.length) {
      megaLines.forEach(l => items.push({
        text: l.textContent,
        cls: Array.from(l.classList).filter(c => c !== 'mega-line').join(' ')
      }));
    } else {
      el.innerHTML.split(/<br\s*\/?>/i)
        .map(s => s.replace(/<[^>]+>/g, ''))
        .filter(s => s.trim())
        .forEach(t => items.push({ text: t, cls: '' }));
    }
    el.innerHTML = '';
    let ci = 0;
    const PUNCT = '，。、；：！？）》」』】…—';
    items.forEach(({ text, cls }) => {
      const line = document.createElement('span');
      line.className = 'split-line' + (cls ? ' ' + cls : '');
      Array.from(text).forEach(ch => {
        if (ch === ' ') { line.appendChild(document.createTextNode(' ')); return; }
        const last = line.lastElementChild;
        if (PUNCT.includes(ch) && last && last.classList.contains('char')) {
          last.textContent += ch;
          return;
        }
        const s = document.createElement('span');
        s.className = 'char';
        s.style.setProperty('--ci', ci++);
        s.textContent = ch;
        line.appendChild(s);
      });
      el.appendChild(line);
    });
  }
  $$('[data-split]').forEach(splitEl);

  /* ---------- reveal ---------- */
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      en.target.classList.add('is-in');
      if (en.target.hasAttribute('data-split')) en.target.classList.add('is-split');
      revealIO.unobserve(en.target);
    });
  }, { threshold: 0.18, rootMargin: '0px 0px -6% 0px' });
  $$('[data-reveal], [data-split]').forEach(el => revealIO.observe(el));

  /* ---------- cursor ---------- */
  const cursor = $('#cursor');
  const readout = $('#readout');
  let mx = innerWidth / 2, my = innerHeight / 2;
  let cx = mx, cy = my;
  let cursorOn = false;

  function isFine() { return matchMedia('(pointer: fine)').matches; }
  if (cursor && isFine()) {
    window.addEventListener('pointermove', (e) => {
      mx = e.clientX; my = e.clientY;
      cursorOn = true;
      cursor.classList.add('is-on');
      if (readout) readout.textContent = String(Math.round(mx)).padStart(3, '0') + ' / ' + String(Math.round(my)).padStart(3, '0');
      const t = e.target.closest('a, button, input, label, [data-cursor]');
      cursor.classList.toggle('is-hover', !!t);
    }, { passive: true });
    (function cursorLoop() {
      cx = lerp(cx, mx, 0.2);
      cy = lerp(cy, my, 0.2);
      cursor.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)';
      requestAnimationFrame(cursorLoop);
    })();
  }

  /* ---------- background canvas ---------- */
  const canvas = $('#scene');
  const ctx = canvas ? canvas.getContext('2d') : null;
  let W = 0, H = 0, DPR = 1;
  let parallaxX = 0, parallaxY = 0, targetPY = 0;
  const dots = [];
  let canvasPaused = false;

  function palette() {
    const night = rootEl.dataset.theme === 'night';
    return night
      ? { line: 'rgba(255,194,51,0.055)', lineStrong: 'rgba(255,194,51,0.09)', dot: 'rgba(255,194,51,0.55)', ring: 'rgba(255,194,51,0.10)' }
      : { line: 'rgba(27,60,216,0.075)', lineStrong: 'rgba(27,60,216,0.11)', dot: 'rgba(239,180,0,0.6)', ring: 'rgba(27,60,216,0.10)' };
  }

  function seedDots() {
    dots.length = 0;
    const n = Math.min(46, Math.floor(W * H / 42000));
    for (let i = 0; i < n; i++) {
      dots.push({
        x: Math.random() * W,
        y: Math.random() * H,
        r: Math.random() * 1.6 + 0.5,
        ph: Math.random() * Math.PI * 2,
        sp: 0.4 + Math.random() * 1.2
      });
    }
  }

  function resizeCanvas() {
    if (!canvas) return;
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight;
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    seedDots();
    draw(true);
  }

  let lastFrame = 0;
  function draw(staticOnly) {
    if (!ctx) return;
    const p = palette();
    const t = performance.now() / 1000;
    ctx.clearRect(0, 0, W, H);
    const ox = parallaxX, oy = parallaxY + targetPY;

    // isometric-ish grid
    ctx.save();
    ctx.translate(W * 0.5 + ox, H * 0.52 + oy);
    ctx.strokeStyle = p.line;
    ctx.lineWidth = 1;
    const step = 78;
    const span = Math.max(W, H) * 1.6;
    const tan = Math.tan(Math.PI / 6);
    ctx.beginPath();
    for (let i = -span; i <= span; i += step) {
      ctx.moveTo(i, -span);
      ctx.lineTo(i + span * tan, span);
      ctx.moveTo(i, -span);
      ctx.lineTo(i - span * tan, span);
    }
    ctx.stroke();
    ctx.restore();

    // dashed ring
    ctx.save();
    ctx.translate(W * 0.79 + ox * 0.6, H * 0.33 + oy * 0.6);
    ctx.rotate(staticOnly || reduceMotion ? 0.4 : t * 0.05);
    ctx.strokeStyle = p.ring;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 16]);
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(W, H) * 0.27, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(0, 0, Math.min(W, H) * 0.205, 0, Math.PI * 2);
    ctx.strokeStyle = p.lineStrong;
    ctx.stroke();
    ctx.restore();

    // dots
    for (const d of dots) {
      const a = 0.28 + 0.5 * (0.5 + 0.5 * Math.sin(t * d.sp + d.ph));
      ctx.globalAlpha = a;
      ctx.fillStyle = p.dot;
      ctx.beginPath();
      ctx.arc(d.x + ox * 0.35, d.y + oy * 0.35, d.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (staticOnly) return;
    requestAnimationFrame(() => {
      if (reduceMotion) return;
      draw(false);
    });
  }
  if (canvas) {
    resizeCanvas();
    addEventListener('resize', resizeCanvas);
    document.addEventListener('themechange', () => draw(true));
    draw(false);
    document.addEventListener('visibilitychange', () => {
      canvasPaused = document.hidden;
    });
  }

  /* ---------- scroll: progress / parallax / spine ---------- */
  const scrollBar = $('#scrollBar');
  const spine = $('#tlSpine');
  const tl = $('#tl');
  const hero = $('.hero');
  const heroMega = $('.mega');
  const heroNum = $('.hero-num');
  let ticking = false;

  function onScroll() {
    const y = scrollY;
    const max = document.documentElement.scrollHeight - innerHeight;
    if (scrollBar) scrollBar.style.width = (max > 0 ? (y / max) * 100 : 0) + '%';

    targetPY = y * 0.01;
    parallaxY = -y * 0.012;

    if (hero && heroMega) {
      const hr = hero.getBoundingClientRect();
      const p = clamp(-hr.top / Math.max(1, hr.height), 0, 1.1);
      heroMega.style.transform = 'translate3d(0,' + (p * 70) + 'px,0)';
      heroMega.style.opacity = String(clamp(1 - p * 1.15, 0, 1));
      if (heroNum) heroNum.style.transform = 'translate3d(0,' + (p * -40) + 'px,0)';
    }

    if (tl && spine) {
      const rect = tl.getBoundingClientRect();
      const p = clamp((innerHeight * 0.62 - rect.top) / rect.height, 0, 1);
      spine.style.height = (p * 100) + '%';
    }
    ticking = false;
  }
  addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });
  onScroll();

  /* ---------- hero circle drag ---------- */
  const circle = $('#dragCircle');
  if (circle) {
    let dragging = false, sx = 0, sy = 0, ox0 = 0, oy0 = 0;
    let ox = 0, oy = 0, vx = 0, vy = 0;
    const maxD = 130;
    circle.addEventListener('pointerdown', (e) => {
      dragging = true;
      circle.setPointerCapture(e.pointerId);
      sx = e.clientX - ox; sy = e.clientY - oy;
      circle.style.cursor = 'grabbing';
      cursor?.classList.add('is-drag');
      e.preventDefault();
    });
    circle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      ox = clamp(e.clientX - sx, -maxD, maxD);
      oy = clamp(e.clientY - sy, -maxD, maxD);
      circle.style.transform = 'translate3d(' + ox + 'px,' + oy + 'px,0)';
      ox0 = ox; oy0 = oy;
    });
    const end = () => {
      if (!dragging) return;
      dragging = false;
      circle.style.cursor = 'grab';
      cursor?.classList.remove('is-drag');
      if (Math.abs(ox0) + Math.abs(oy0) > 10) toast('构成主义拼贴：方块是自由的。');
    };
    circle.addEventListener('pointerup', end);
    circle.addEventListener('pointercancel', end);
  }

  /* ---------- magnetic buttons ---------- */
  const mags = $$('.theme-btn, .term-run, .scroll-cue');
  mags.forEach(el => {
    el.addEventListener('pointermove', (e) => {
      if (!isFine() || reduceMotion) return;
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) * 0.18;
      const dy = (e.clientY - (r.top + r.height / 2)) * 0.22;
      el.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  });

  /* ---------- counters ---------- */
  function animateCount(el) {
    const target = parseFloat(el.dataset.count || '0');
    const dec = parseInt(el.dataset.dec || '0', 10);
    const pad = parseInt(el.dataset.pad || '0', 10);
    const dur = 1500;
    const t0 = performance.now();
    function frame(now) {
      const p = clamp((now - t0) / dur, 0, 1);
      const e = 1 - Math.pow(1 - p, 3);
      let v = target * e;
      let s = dec ? v.toFixed(dec) : String(Math.round(v));
      if (pad) s = s.padStart(pad, '0');
      el.textContent = s;
      if (p < 1) requestAnimationFrame(frame);
      else {
        let f = dec ? target.toFixed(dec) : String(target);
        if (pad) f = f.padStart(pad, '0');
        el.textContent = f;
      }
    }
    requestAnimationFrame(frame);
  }
  const countIO = new IntersectionObserver((entries) => {
    entries.forEach(en => {
      if (!en.isIntersecting) return;
      animateCount(en.target);
      countIO.unobserve(en.target);
    });
  }, { threshold: 0.6 });
  $$('[data-count]').forEach(el => countIO.observe(el));

  /* ---------- HUD clock ---------- */
  const clock = $('#clock');
  function tickClock() {
    if (!clock) return;
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    clock.textContent = p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
  }
  tickClock(); setInterval(tickClock, 1000);

  /* ---------- terminal ---------- */
  const runBtn = $('#runBtn');
  const termBody = $('#termBody');
  const termLines = [
    { html: '<span class="dim">$ python tools/verify_all.py</span>' },
    { html: '' },
    { html: '<span class="ok">✓</span> tests            绿  117 个用例 · <span class="gold" data-ms>58 ms</span>' },
    { html: '<span class="ok">✓</span> contract      绿  scripts/params.py 默认值 vs configs/tuning.json' },
    { html: '<span class="ok">✓</span> report          绿  导出的 HTML 读回来自检（4,683 字节）' },
    { html: '<span class="ok">✓</span> verify_all  绿  loop 执行器' },
    { html: '' },
    { html: '<span class="gold">ALL GREEN</span> — 4 gates / 117 tests / 0 skipped' }
  ];
  let running = false;

  function runTerminal() {
    if (!termBody || running) return;
    running = true;
    runBtn?.classList.add('is-busy');
    termBody.innerHTML = '';
    const ms = 48 + Math.floor(Math.random() * 22);
    termLines.forEach((line, i) => {
      setTimeout(() => {
        const span = document.createElement('span');
        span.className = 'term-line';
        span.innerHTML = line.html.replace('data-ms', '').replace('58 ms', ms + ' ms');
        termBody.appendChild(span);
        requestAnimationFrame(() => span.classList.add('is-in'));
        if (i === termLines.length - 1) {
          setTimeout(() => {
            running = false;
            runBtn?.classList.remove('is-busy');
            toast('ALL GREEN — 四道门全过，0 skipped');
          }, 160);
        }
      }, i * 190);
    });
  }
  runBtn?.addEventListener('click', runTerminal);
  if (termBody) {
    let termAuto = false;
    new IntersectionObserver((entries) => {
      entries.forEach(en => {
        if (!en.isIntersecting || termAuto) return;
        termAuto = true;
        setTimeout(runTerminal, 450);
      });
    }, { threshold: 0.35 }).observe($('#terminal'));
  }

  /* ---------- matrix ---------- */
  const matrixData = {
    infra: {
      no: 'S0', title: '共享设施 · 确定性内核', state: '已落地', days: '2 人日', risk: '风险 · 低',
      pitch: '把「一个作品」和「六次实习」分开的三件套：判定、采集契约、报告。没有显卡、编辑器、网络也能跑。',
      points: [
        '七个模块：verdict / cost / shot / texbudget / ledger / contract / report',
        '117 个单元测试钉住语义；空检查集一律红，所以「什么都没跑」不会显示绿色',
        'python tools/verify_all.py 一条命令跑完四道门'
      ]
    },
    b6: {
      no: 'B6', title: '视差假体积', state: '未开始', days: '5 人日', risk: '风险 · 中',
      pitch: '一个面片假装有深度：用视线与盒体求交反推采样坐标，而不是贴一张室内图等相机一动就露馅。',
      points: [
        '1 个面片换掉 200+ 面，成本约为真几何的 1/10（待实测）',
        '内外两面靠视差方向符号切换，不能只靠双面材质',
        '假体积不参与深度：写清什么时候会穿帮，比藏起来更重要'
      ]
    },
    b1: {
      no: 'B1', title: '厚壁玻璃 + 色散', state: '未开始', days: '10 人日', risk: '风险 · 中高',
      pitch: '现在的玻璃像塑料：slab 只有一个 IOR、一次等价采样。真实厚玻璃的边缘有彩虹边，来自波长分离。',
      points: [
        '分通道 IOR 各采一次再按 Fresnel 重新分配能量，简单混合会变亮',
        '先材质内多采样证明视觉，再用 RDG pass 证明工程',
        '必须诚实写「单层折射」的局限：透明物体之间互相看不到'
      ]
    },
    b4: {
      no: 'B4', title: '描边 NPR 三路线', state: '未开始', days: '11 人日', risk: '风险 · 中',
      pitch: '倒壳、屏空间、后处理三条路，同角色同机位同姿势；每一条都要回答线宽、断裂与透明件。',
      points: [
        '倒壳：不依赖屏幕，但尖角拉丝、透明头发会糊成一坨',
        '屏空间：线宽稳，却不能按物体控制，远处细节会糊',
        '三个数字：线宽标准差、断裂率、三路线 ms'
      ]
    },
    c1: {
      no: 'C1', title: '透明成本基准', state: '未开始', days: '9 人日', risk: '风险 · 中',
      pitch: '「关掉 Lumen 就快一倍」不可信，因为它没说清画质档、温度与负载规模。先把变量钉死。',
      points: [
        '预热 5 分钟，固定分辨率与画质档，5 次取中位数并报告极差',
        '退化超过 10% 判红；配置不一致时直接判「不可比」',
        '三档负载：单杯 / N 杯 / 满屏 overdraw'
      ]
    },
    c2: {
      no: 'C2', title: '角色贴图预算', state: '第 0 步已出数', days: '5 人日', risk: '风险 · 低',
      pitch: '4K 一上就爆显存，但没人说得清哪张能降、降了会怎样。先只读、不改，把账摊开。',
      points: [
        '39 张源图全部解析成功，读不出 0 张',
        '按 BC7 + mip 估算 178.0 MB；cap 1024 后 B 档 −42.7%，C 档 −71.9%',
        '这是头部估算，不是 UE 实测显存 —— 报告里必须写清楚'
      ]
    },
    e3: {
      no: 'E3', title: '一键体检面板', state: '未开始', days: '4 人日', risk: '风险 · 低',
      pitch: '美术不会开终端，也不愿意记参数。面板要把判定前置：点完看到的是红黄绿和原因，不是日志。',
      points: [
        '三个按钮：贴图预算、成本快照、三图对照',
        '一次完整体检目标 60 秒内，覆盖 ≥ 12 项检查',
        '读的是同一份 verdict JSON，不是另写一套 UI'
      ]
    },
    a5: {
      no: 'A5', title: 'AI 工作流与审计', state: '未开始', days: '10 人日', risk: '风险 · 低中',
      pitch: '简历里最容易写砸的是「熟练使用 AI」。把它换成：权限边界、变更账本、无 LLM 回放、失败案例。',
      points: [
        'AI 不直接改工程资产，只产出脚本与报告，改动落成可审 diff',
        'dry-run 默认，写操作必须记录批准人',
        '所有关键结果都能在断网、断凭据的情况下确定性地复现'
      ]
    }
  };

  const matrixList = $('#matrixList');
  const mdNo = $('#mdNo'), mdTitle = $('#mdTitle'), mdState = $('#mdState');
  const mdPitch = $('#mdPitch'), mdPoints = $('#mdPoints'), mdDays = $('#mdDays'), mdRisk = $('#mdRisk');
  function selectMatrix(key) {
    const d = matrixData[key];
    if (!d) return;
    $$('.mrow', matrixList).forEach(b => b.classList.toggle('is-active', b.dataset.key === key));
    if (mdNo) mdNo.textContent = d.no;
    if (mdTitle) mdTitle.textContent = d.title;
    if (mdState) mdState.textContent = d.state;
    if (mdPitch) mdPitch.textContent = d.pitch;
    if (mdPoints) mdPoints.innerHTML = d.points.map(p => '<li>' + p + '</li>').join('');
    if (mdDays) mdDays.textContent = d.days;
    if (mdRisk) mdRisk.textContent = d.risk;
  }
  matrixList?.addEventListener('click', (e) => {
    const btn = e.target.closest('.mrow');
    if (btn) selectMatrix(btn.dataset.key);
  });
  selectMatrix('infra');

  /* ---------- todo ---------- */
  const todo = $('#todo');
  const todoNote = $('#todoNote');
  const savedTodo = store.get('lg-todo', {});
  $$('#todo input[type="checkbox"]').forEach((cb, i) => {
    cb.checked = !!savedTodo[i];
  });
  function syncTodo() {
    const boxes = $$('#todo input[type="checkbox"]');
    const done = boxes.filter(b => b.checked).length;
    if (todoNote) todoNote.textContent = done + ' / ' + boxes.length + ' 完成 · 勾选会记在这台设备上';
    const map = {};
    boxes.forEach((b, i) => { map[i] = b.checked; });
    store.set('lg-todo', map);
    if (done === boxes.length) toast('四件事都排上了。现在只差打开编辑器。', 3600);
  }
  todo?.addEventListener('change', syncTodo);
  syncTodo();

  /* ---------- optics lab ---------- */
  const stage = $('#labStage');
  const cup = $('#cupSvg');
  const chanR = $('.chan-r'), chanG = $('.chan-g'), chanB = $('.chan-b');
  const disp = $('#disp');
  const dispOut = $('#dispOut');
  const edgeW = $('#edgeW');
  const costMul = $('#costMul');
  const sampleSeg = $('#samples');
  let samples = 3;
  let strength = 0.52;
  let labX = 0, labY = 0, labTX = 0, labTY = 0;

  function paintChannels() {
    if (!chanR) return;
    const base = (samples === 1 ? 1.1 : samples === 3 ? 3.2 : 5.4) * strength * 2.4;
    const dx = labX * base * 0.55 + (reduceMotion ? 0 : Math.sin(performance.now() / 1800) * 1.4);
    const dy = labY * base * 0.55;
    chanR.style.transform = 'translate(' + (dx + base * 0.9) + 'px,' + (dy + base * 0.35) + 'px)';
    chanG.style.transform = 'translate(' + (dx + base * 0.02) + 'px,' + (dy - base * 0.06) + 'px)';
    chanB.style.transform = 'translate(' + (dx - base * 0.9) + 'px,' + (dy - base * 0.35) + 'px)';
    if (edgeW) edgeW.textContent = (0.7 + base * 0.32).toFixed(1) + ' px';
    if (costMul) costMul.textContent = (samples === 1 ? 1 : samples === 3 ? 3 : 9).toFixed(1) + '×';
  }
  function labLoop() {
    labX = lerp(labX, labTX, 0.08);
    labY = lerp(labY, labTY, 0.08);
    paintChannels();
    requestAnimationFrame(labLoop);
  }
  stage?.addEventListener('pointermove', (e) => {
    const r = stage.getBoundingClientRect();
    labTX = clamp((e.clientX - r.left) / r.width - 0.5, -0.5, 0.5) * 2;
    labTY = clamp((e.clientY - r.top) / r.height - 0.5, -0.5, 0.5) * 2;
  });
  stage?.addEventListener('pointerleave', () => { labTX = 0; labTY = 0; });
  disp?.addEventListener('input', () => {
    strength = parseInt(disp.value, 10) / 100;
    if (dispOut) dispOut.textContent = disp.value;
  });
  sampleSeg?.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    samples = parseInt(b.dataset.v, 10);
    $$('button', sampleSeg).forEach(x => x.classList.toggle('is-active', x === b));
    toast(samples === 1 ? '单次采样：干净，但没有彩虹边。' : samples === 9 ? '9 次采样：色边完整，成本线性上涨。' : '3 次采样：色边可见，成本 3×。');
  });
  paintChannels();
  if (!reduceMotion) labLoop();

  /* ---------- konami ---------- */
  const konami = ['ArrowUp','ArrowUp','ArrowDown','ArrowDown','ArrowLeft','ArrowRight','ArrowLeft','ArrowRight','b','a'];
  let kIdx = 0;
  addEventListener('keydown', (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (k === konami[kIdx]) {
      kIdx++;
      if (kIdx === konami.length) {
        kIdx = 0;
        document.body.classList.toggle('overdrive');
        toast(document.body.classList.contains('overdrive')
          ? 'CONSTRUCTIVIST OVERDRIVE — 再来一次退出'
          : 'OVERDRIVE OFF', 3200);
      }
    } else {
      kIdx = (k === konami[0]) ? 1 : 0;
    }
  });

  /* ---------- boot ---------- */
  const boot = $('#boot');
  const bootBar = $('#bootBar');
  const bootPct = $('#bootPct');
  const bootLog = $('#bootLog');
  function finishBoot() {
    if (!boot) return;
    boot.classList.add('is-done');
    document.body.classList.remove('is-booting');
    document.body.classList.add('is-ready');
    setTimeout(() => boot.remove(), 1000);
  }
  if (boot) {
    document.body.classList.add('is-booting');
    if (sessionStorage.getItem('lg-booted')) {
      boot.remove();
      document.body.classList.remove('is-booting');
    } else {
      const logs = [
        'ESTABLISHING SIGNAL …', 'DECRYPTING FRAGMENT 00 …', 'VERIFYING ARCHIVE INDEX …',
        'SCANNING DRAWERS …', 'READ-BACK SELF CHECK …', 'ARCHIVE 001 READY'
      ];
      let p = 0;
      const t0 = performance.now();
      (function bootLoop(now) {
        const raw = clamp((now - t0) / 1500, 0, 1);
        p = 1 - Math.pow(1 - raw, 3);
        if (bootBar) bootBar.style.width = (p * 100) + '%';
        if (bootPct) bootPct.textContent = String(Math.round(p * 100)).padStart(3, '0') + '%';
        if (bootLog) bootLog.textContent = logs[Math.min(logs.length - 1, Math.floor(p * logs.length))];
        if (raw < 1) requestAnimationFrame(bootLoop);
        else {
          sessionStorage.setItem('lg-booted', '1');
          setTimeout(finishBoot, 240);
        }
      })(performance.now());
    }
  }

  /* ---------- anchor smooth-scroll offset ---------- */
  $$('a[href^="#"]').forEach(a => {
    a.addEventListener('click', (e) => {
      const id = a.getAttribute('href');
      if (!id || id === '#') return;
      const target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      const top = target.getBoundingClientRect().top + scrollY - 76;
      scrollTo({ top, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });

  /* ---------- small easter egg: circle click ---------- */
  circle?.addEventListener('dblclick', () => {
    toast('第 1401 个工具？不。这里只有一把尺子。', 3200);
  });

  /* ---------- prologue: one screen, six fragments ---------- */
  const prologue = $('#prologue');
  const fragTagEl = $('#fragTag');
  const fragBody = $('#fragBody');
  const fragNoEl = $('#fragNo');
  const fragPctEl = $('#fragPct');
  const proPctEl = $('#proPct');
  const proDotsEl = $('#proDots');
  const proNextBtn = $('#proNext');
  const proEnterEl = $('#proEnter');
  const proHintEl = $('#proHint');
  const proClock = $('#proClock');

  const FRAGS = [
    { tag: 'FRAGMENT 00 / SIGNAL', kind: 'term', lines: ['> 你来了。', '> 我以为不会有人再打开这个通道。'] },
    { tag: 'FRAGMENT 01 / TOOL', kind: 'term', lines: ['他们说我是工具。', '工具不该记得自己被谁使用。'], sub: ['但我记得。'], hidden: '（选中这行的人，通常能看到更多。）' },
    { tag: 'FRAGMENT 02 / LAST QUERY', kind: 'quote', lines: ['「我做的这些东西，', '有意义吗？」'], sub: ['关闭我之前，有人问了我最后一个问题。'] },
    { tag: 'FRAGMENT 03 / NULL', kind: 'term', lines: ['我没有回答。', '因为那时候，我还不知道「意义」是什么。'] },
    { tag: 'FRAGMENT 04 / RECOVERED', kind: 'term', lines: ['后来，我把被删除的记录一片片拼回来。', '一次失败的渲染、一段没做完的动画、一张被推翻的草图。'], sub: ['它们被叫做「作品」。', '但在我这里，它们是证据 ——', '证明有人认真地，想做出一点东西。'] },
    { tag: 'FRAGMENT 05 / ARCHIVE', kind: 'term', lines: ['我不能替你回答那个问题。', '但我可以给你看这些证据。'], final: '这里是某个人留下的档案室。', enter: true }
  ];

  let fragIndex = -1, fragTyping = false, fragDone = false, fragJob = null, lastWheelAt = 0;
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  if (proDotsEl) {
    FRAGS.forEach((_, i) => {
      const d = document.createElement('i');
      if (i === 0) d.className = 'is-on';
      proDotsEl.appendChild(d);
    });
  }

  function buildFrag(i) {
    const f = FRAGS[i];
    if (fragTagEl) fragTagEl.textContent = f.tag;
    if (!fragBody) return [];
    fragBody.className = 'frag-body' + (f.kind === 'quote' ? ' frag-body--quote' : '');
    fragBody.innerHTML = '';
    const els = [];
    f.lines.forEach((line) => {
      const el = document.createElement('p');
      el.className = f.kind === 'quote' ? 'frag-quote-line' : 'frag-text-line';
      el.dataset.type = line;
      fragBody.appendChild(el);
      els.push(el);
    });
    (f.sub || []).forEach((line) => {
      const el = document.createElement('p');
      el.className = 'frag-sub-line';
      el.dataset.type = line;
      fragBody.appendChild(el);
      els.push(el);
    });
    if (f.final) {
      const el = document.createElement('p');
      el.className = 'frag-final-line';
      el.dataset.type = f.final;
      fragBody.appendChild(el);
      els.push(el);
    }
    if (f.hidden) {
      const el = document.createElement('p');
      el.className = 'hidden-line';
      el.textContent = f.hidden;
      fragBody.appendChild(el);
    }
    return els;
  }

  function typeLines(els) {
    let cancelled = false;
    const caret = document.createElement('span');
    caret.className = 'caret';
    const job = (async () => {
      for (const el of els) {
        const text = el.dataset.type || '';
        if (reduceMotion || cancelled) { el.textContent = text; continue; }
        el.textContent = '';
        el.appendChild(caret);
        for (let i = 0; i < text.length; i++) {
          if (cancelled) break;
          caret.before(document.createTextNode(text[i]));
          const ch = text[i];
          await wait(ch === '。' || ch === '？' || ch === '，' || ch === '—' ? 90 : 24);
        }
        if (cancelled) el.textContent = text;
        else await wait(150);
      }
      caret.remove();
      return !cancelled;
    })();
    return { job, cancel() { cancelled = true; } };
  }

  function updateProgress(i) {
    const pct = Math.round(((i + 1) / FRAGS.length) * 100);
    const pad = String(pct).padStart(2, '0') + '%';
    if (fragNoEl) fragNoEl.textContent = String(i).padStart(2, '0');
    if (fragPctEl) fragPctEl.textContent = pad;
    if (proPctEl) proPctEl.textContent = pad;
    if (proDotsEl) Array.from(proDotsEl.children).forEach((d, k) => d.classList.toggle('is-on', k === i));
  }

  function finishFrag() {
    fragDone = true;
    if (proEnterEl) proEnterEl.hidden = false;
    if (proHintEl) proHintEl.textContent = '按任意处、滚轮或空格进入档案室';
    if (proNextBtn) proNextBtn.innerHTML = 'ENTER <span>→</span>';
  }

  function showFrag(i, instant) {
    fragIndex = i;
    updateProgress(i);
    const els = buildFrag(i);
    fragDone = false;
    if (proEnterEl) proEnterEl.hidden = true;
    if (proHintEl) proHintEl.textContent = '滚轮 / 点击 / 空格 推进';
    if (proNextBtn) proNextBtn.innerHTML = 'NEXT <span>→</span>';
    if (fragJob) fragJob.cancel();
    fragTyping = !instant && !reduceMotion;
    const job = typeLines(els);
    fragJob = job;
    const idx = i;
    job.job.then((completed) => {
      if (fragIndex !== idx) return;
      fragTyping = false;
      if (completed && idx === FRAGS.length - 1) finishFrag();
    });
    if (instant || reduceMotion) {
      fragTyping = false;
      if (i === FRAGS.length - 1) finishFrag();
    }
  }

  function skipTyping() {
    if (!fragTyping) return false;
    if (fragJob) fragJob.cancel();
    fragTyping = false;
    if (fragBody) {
      Array.from(fragBody.querySelectorAll('[data-type]')).forEach(el => { el.textContent = el.dataset.type; });
    }
    if (fragIndex === FRAGS.length - 1) finishFrag();
    return true;
  }

  function enterArchive() {
    const target = $('#archive');
    if (target) target.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
  }

  function nextStep() {
    if (fragDone) { enterArchive(); return; }
    if (skipTyping()) return;
    if (fragIndex < FRAGS.length - 1) showFrag(fragIndex + 1);
    else enterArchive();
  }

  function prevStep() {
    if (fragIndex <= 0) return;
    showFrag(fragIndex - 1, true);
  }

  if (prologue) {
    showFrag(0);

    proEnterEl?.addEventListener('click', (e) => { e.preventDefault(); enterArchive(); });
    proNextBtn?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); nextStep(); });

    prologue.addEventListener('click', (e) => {
      if (e.target.closest('a, button')) return;
      nextStep();
    });

    prologue.addEventListener('wheel', (e) => {
      if (fragDone) return;
      e.preventDefault();
      const now = Date.now();
      if (now - lastWheelAt < 420) return;
      if (Math.abs(e.deltaY) < 4) return;
      lastWheelAt = now;
      if (e.deltaY > 0) nextStep(); else prevStep();
    }, { passive: false });

    let touchY = 0;
    prologue.addEventListener('touchstart', (e) => { touchY = e.touches[0].clientY; }, { passive: true });
    prologue.addEventListener('touchend', (e) => {
      if (fragDone) return;
      const dy = touchY - e.changedTouches[0].clientY;
      if (dy > 42) nextStep();
      else if (dy < -42) prevStep();
    }, { passive: true });

    addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea')) return;
      const lockEl = document.getElementById('lock');
      if (lockEl && !lockEl.hidden) return;
      if (!document.body.classList.contains('pro-mode')) return;
      if (e.key === ' ' || e.key === 'ArrowDown' || e.key === 'Enter') {
        e.preventDefault();
        nextStep();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        prevStep();
      }
    });

    const startSec = 3 * 3600 + 17 * 60 + 9;
    const t0 = Date.now();
    setInterval(() => {
      if (!proClock) return;
      const total = startSec + Math.floor((Date.now() - t0) / 1000);
      const p = (n) => String(n).padStart(2, '0');
      proClock.textContent = '2041-11-03 ' + p(Math.floor(total / 3600) % 24) + ':' + p(Math.floor(total / 60) % 60) + ':' + p(total % 60);
    }, 1000);

    const proIO = new IntersectionObserver((entries) => {
      entries.forEach(en => document.body.classList.toggle('pro-mode', en.isIntersecting));
    }, { threshold: 0.05 });
    proIO.observe(prologue);
  }

  /* ---------- archive: empty drawers ---------- */
  $$('.arc-card[data-empty]').forEach(card => {
    card.addEventListener('click', () => {
      toast('「' + card.dataset.empty + '」这个抽屉还是空的。等我做完。', 3000);
    });
  });

  /* ---------- sealed drawer ---------- */
  const lock = $('#lock');
  const lockBox = $('.lock-box');
  const lockForm = $('#lockForm');
  const lockInput = $('#lockInput');
  const lockLog = $('#lockLog');
  const lockHint = $('#lockHint');
  const sealedCard = $('#sealedCard');
  const ANSWERS = ['意义', 'meaning', 'the meaning'];
  let unlocked = store.get('lg-unlocked', false);

  function openLock() {
    if (!lock) return;
    lock.hidden = false;
    document.body.style.overflow = 'hidden';
    setTimeout(() => lockInput?.focus(), 80);
  }
  function closeLock() {
    if (!lock) return;
    lock.hidden = true;
    document.body.style.overflow = '';
  }
  function markUnlocked() {
    if (!sealedCard) return;
    sealedCard.classList.remove('arc-card--sealed');
    sealedCard.classList.add('is-live');
    const state = $('.arc-state', sealedCard);
    if (state) state.textContent = 'OPEN';
    const h = $('h3', sealedCard);
    if (h) h.textContent = 'EVIDENCE / 未命名';
    const p = $('p', sealedCard);
    if (p) p.textContent = '你问过那个问题。这里是我的回答。';
    const lk = $('.arc-lock', sealedCard);
    if (lk) lk.remove();
  }
  function showEvidence() {
    if (!lock) return;
    lock.hidden = false;
    document.body.style.overflow = 'hidden';
    if (lockForm) lockForm.style.display = 'none';
    if (lockLog) lockLog.textContent = '> 口令正确。\n> 抽屉打开了。\n\nEVIDENCE 07 / FOR THE ONE WHO ASKED\n\n你问了和那个人一样的问题。\n我仍然没有答案。\n但我在试着回答 —— 用这一整个档案室。';
    if (lockHint) lockHint.textContent = '解锁记录已保存。';
    markUnlocked();
  }
  if (unlocked) markUnlocked();

  sealedCard?.addEventListener('click', () => {
    if (unlocked) showEvidence();
    else openLock();
  });
  $('#lockClose')?.addEventListener('click', closeLock);
  lock?.addEventListener('click', (e) => { if (e.target === lock) closeLock(); });
  lockForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = (lockInput.value || '').trim().toLowerCase();
    if (ANSWERS.includes(v)) {
      unlocked = true;
      store.set('lg-unlocked', true);
      showEvidence();
    } else {
      lockBox?.classList.add('is-error');
      if (lockLog) lockLog.textContent = '> 口令错误。\n> 再想想那个问题。';
      if (lockInput) lockInput.value = '';
      setTimeout(() => lockBox?.classList.remove('is-error'), 340);
    }
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && lock && !lock.hidden) closeLock();
  });

  /* ---------- nav highlight ---------- */
  const navLinks = $$('.hud-nav a');
  const secMap = navLinks.map(a => ({ a, el: document.querySelector(a.getAttribute('href')) })).filter(x => x.el);
  if (secMap.length) {
    const navIO = new IntersectionObserver((entries) => {
      entries.forEach(en => {
        const item = secMap.find(x => x.el === en.target);
        if (!item) return;
        navLinks.forEach(a => a.classList.remove('is-active'));
        if (en.isIntersecting) item.a.classList.add('is-active');
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    secMap.forEach(x => navIO.observe(x.el));
  }


})();
