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
exports.fetchSite = onCall({ region: 'asia-northeast3', timeoutSeconds: 30, memory: '256MiB' }, async (request) => {
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
  const colorCount = {};
  { const re = /#[0-9a-fA-F]{6}\b/g; let m; while ((m = re.exec(html))) { const c = m[0].toLowerCase(); colorCount[c] = (colorCount[c] || 0) + 1; } }
  const colors = Object.entries(colorCount).sort((a, b) => b[1] - a[1]).slice(0, 8).map((c) => c[0]);
  return { url, title, description, themeColor, ogImage, h1, h2, h3, buttons, colors };
});
