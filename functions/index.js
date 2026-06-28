const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp();

exports.aiProxy = onCall({ region: 'asia-northeast3', timeoutSeconds: 300, memory: '512MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  }

  const db = getFirestore();
  const configSnap = await db.doc('config/ai').get();
  const apiKey = configSnap.data()?.key;

  if (!apiKey) {
    throw new HttpsError('not-found', 'API Key가 설정되지 않았습니다.');
  }

  const body = request.data?.body;
  if (!body) {
    throw new HttpsError('invalid-argument', '요청 본문이 없습니다.');
  }

  let res, data;
  try {
    res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify(body)
    });
  } catch (e) {
    // 네트워크/타임아웃 등 — 읽을 수 있는 메시지로 변환
    throw new HttpsError('internal', 'Anthropic 연결 실패: ' + (e && e.message ? e.message : String(e)));
  }

  const raw = await res.text();
  try { data = JSON.parse(raw); } catch (e) { data = null; }

  if (!res.ok) {
    const msg = (data && data.error && data.error.message) || raw.slice(0, 300) || ('HTTP ' + res.status);
    if (res.status === 402 || /credit|balance/i.test(msg)) {
      throw new HttpsError('resource-exhausted', '크레딧이 소진되었습니다. console.anthropic.com에서 충전해주세요.');
    }
    if (res.status === 429) {
      throw new HttpsError('resource-exhausted', '요청이 너무 많습니다. 잠시 후 다시 시도하세요. (' + msg + ')');
    }
    if (res.status === 529 || res.status >= 500) {
      throw new HttpsError('unavailable', 'AI 서버가 일시적으로 혼잡합니다. 잠시 후 다시 시도하세요. (' + msg + ')');
    }
    throw new HttpsError('internal', 'AI 오류(' + res.status + '): ' + msg);
  }
  if (!data) {
    throw new HttpsError('internal', 'AI 응답을 해석하지 못했습니다.');
  }
  return data;
});

// 외부 홈페이지를 서버에서 가져와 구조/문구/색상을 추출 (브라우저 CORS 우회)
exports.fetchSite = onCall({ region: 'asia-northeast3', timeoutSeconds: 60, memory: '512MiB' }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  }
  let url = (request.data?.url || '').trim();
  if (!url) throw new HttpsError('invalid-argument', '주소를 입력하세요.');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  // SSRF 방지: 사설/로컬 대역 차단
  if (/^https?:\/\/(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|\[?::1)/i.test(url)) {
    throw new HttpsError('invalid-argument', '허용되지 않은 주소입니다.');
  }
  let html = '';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; SiteImport/1.0; +https://newworld-1a1d5.web.app)' },
      redirect: 'follow', signal: ctrl.signal
    });
    clearTimeout(t);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    html = await res.text();
  } catch (e) {
    throw new HttpsError('internal', '페이지를 불러오지 못했습니다: ' + (e.message || e));
  }
  html = html.slice(0, 800000);

  // ── Browserless로 실제 렌더 (스크린샷 + 렌더된 HTML) — config/screenshot 에 키가 있을 때만 ──
  let screenshot = '';
  try {
    const db = getFirestore();
    const shotCfg = (await db.doc('config/screenshot').get()).data() || {};
    const bkey = shotCfg.key;
    const region = shotCfg.region || 'production-sfo';
    if (bkey) {
      const base = `https://${region}.browserless.io`;
      // 렌더된 HTML — JS까지 실행된 DOM이라 추출(색·효과·문구) 정확도↑ (best-effort)
      try {
        const cr = await fetch(`${base}/content?token=${encodeURIComponent(bkey)}`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url, gotoOptions: { waitUntil: 'networkidle2', timeout: 20000 } }),
          signal: AbortSignal.timeout(25000),
        });
        if (cr.ok) { const rhtml = await cr.text(); if (rhtml && rhtml.length > 300) html = rhtml.slice(0, 800000); }
        else { console.warn('[shot] content fail', (await cr.text()).slice(0, 300)); }
      } catch (e) { console.warn('[shot] content err', e.message || String(e)); }
      // 스크린샷 (비전용) — 안전 치수로 상단 영역 캡처
      try {
        const sr = await fetch(`${base}/screenshot?token=${encodeURIComponent(bkey)}`, {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ url, options: { type: 'jpeg', quality: 72, fullPage: false }, viewport: { width: 1366, height: 2200 }, gotoOptions: { waitUntil: 'networkidle2', timeout: 20000 } }),
          signal: AbortSignal.timeout(30000),
        });
        if (sr.ok) {
          const buf = Buffer.from(await sr.arrayBuffer());
          if (buf.length > 1000 && buf.length < 4500000) screenshot = 'data:image/jpeg;base64,' + buf.toString('base64');
        } else { console.warn('[shot] screenshot fail', (await sr.text()).slice(0, 300)); }
      } catch (e) { console.warn('[shot] screenshot err', e.message || String(e)); }
    }
  } catch (e) { console.warn('[shot] outer err', e.message || String(e)); }

  const pick = (re) => { const m = html.match(re); return m ? m[1].replace(/\s+/g, ' ').trim() : ''; };
  const title = pick(/<title[^>]*>([\s\S]{1,200}?)<\/title>/i);
  const description = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{1,300})["']/i);
  const themeColor = pick(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)["']/i);
  const ogImage = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i);
  const grab = (tag, max) => {
    const out = []; const re = new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)<\\/' + tag + '>', 'gi'); let m;
    while ((m = re.exec(html)) && out.length < max) {
      const t = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (t && t.length <= 160 && !out.includes(t)) out.push(t);
    }
    return out;
  };
  const h1 = grab('h1', 6), h2 = grab('h2', 12), h3 = grab('h3', 16);
  const buttons = [];
  { const re = /<(?:button|a)[^>]*class=["'][^"']*(?:btn|button|cta)[^"']*["'][^>]*>([\s\S]*?)<\/(?:button|a)>/gi; let m;
    while ((m = re.exec(html)) && buttons.length < 12) {
      const t = m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      if (t && t.length <= 40 && !buttons.includes(t)) buttons.push(t);
    } }
  // ── ① 효과(이펙트) 라이브러리 탐지 — 마크업/스크립트 신호로 추정 ──
  const effSigs = [
    { key: '슬라이더', re: /swiper|slick-slider|slick-track|glide__|splide|owl-carousel|flickity/i },
    { key: '스크롤 등장 애니메이션', re: /data-aos|aos\.(js|init|min)|\bwow(\.js|\.min)?\b|animate__animated|scrollreveal|data-sr=/i },
    { key: '패럴럭스', re: /parallax|gsap|scrolltrigger|rellax/i },
    { key: '숫자 카운터', re: /odometer|countup|counter-?up|data-counter|data-count=/i },
    { key: '배경 영상', re: /<video[^>]+autoplay|video-background|bg-video/i },
    { key: '탭 전환', re: /role=["']tab(list)?["']|nav-tabs|tab-pane|data-toggle=["']tab|data-tab=/i },
    { key: '상단 고정(스티키)', re: /position\s*:\s*sticky|sticky-top|is-sticky|navbar-fixed/i },
    { key: '호버 확대/줌', re: /hover-zoom|zoom-on-hover|hover-scale/i },
  ];
  const effects = effSigs.filter((s) => s.re.test(html)).map((s) => s.key);

  // 색 추출 헬퍼 — #hex 와 rgb()/rgba() 둘 다
  const pickColors = (txt, counter) => {
    let m;
    const hexRe = /#[0-9a-fA-F]{6}\b/g;
    while ((m = hexRe.exec(txt))) { const c = m[0].toLowerCase(); counter[c] = (counter[c] || 0) + 1; }
    const rgbRe = /rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})/g;
    while ((m = rgbRe.exec(txt))) {
      const c = '#' + [m[1], m[2], m[3]].map((n) => (+n).toString(16).padStart(2, '0')).join('');
      counter[c] = (counter[c] || 0) + 1;
    }
  };

  // ── ② 외부 CSS 색 추출 — <link rel=stylesheet> 파일들을 받아와 색·CSS변수 추출 ──
  const cssUrls = [];
  { const re = /<link[^>]+rel=["']stylesheet["'][^>]*>/gi; let m;
    while ((m = re.exec(html)) && cssUrls.length < 6) {
      const h = m[0].match(/href=["']([^"']+)["']/i);
      if (h) { try { const abs = new URL(h[1], url).href;
        if (/^https?:\/\//i.test(abs) && !/localhost|127\.|10\.|192\.168\.|169\.254\./i.test(abs)) cssUrls.push(abs);
      } catch (_) {} }
    } }
  const cssColorCount = {};
  const brandColors = [];
  await Promise.all(cssUrls.slice(0, 5).map(async (cu) => {
    try {
      const ctrl = new AbortController(); const tt = setTimeout(() => ctrl.abort(), 5000);
      const r = await fetch(cu, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; SiteImport/1.0)' }, signal: ctrl.signal });
      clearTimeout(tt);
      if (!r.ok) return;
      let css = await r.text(); css = css.slice(0, 500000);
      pickColors(css, cssColorCount);
      // CSS 변수 중 색(보통 진짜 브랜드 색)
      let vm; const vre = /--[\w-]*(?:color|primary|secondary|accent|brand|main|point|theme)[\w-]*\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/gi;
      while ((vm = vre.exec(css)) && brandColors.length < 8) { const v = vm[1].toLowerCase(); if (!brandColors.includes(v)) brandColors.push(v); }
    } catch (_) {}
  }));

  // HTML 인라인 색 + CSS 색 합산 → 많이 쓴 순
  const colorCount = {};
  pickColors(html, colorCount);
  for (const [c, n] of Object.entries(cssColorCount)) colorCount[c] = (colorCount[c] || 0) + n;
  const colors = Object.entries(colorCount).sort((a, b) => b[1] - a[1]).slice(0, 10).map((c) => c[0]);

  return { url, title, description, themeColor, ogImage, h1, h2, h3, buttons, colors, brandColors, effects, screenshot };
});
