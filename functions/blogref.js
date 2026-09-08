// functions/blogref.js — 참고 블로그 글의 '구성'을 읽어온다 (블로그 스튜디오 → 기존 글 형식 템플릿)
// 네이버 블로그는 모바일 주소(m.blog.naver.com/{id}/{logNo})를 모바일 UA 로 요청하면
// 스마트에디터 ONE 마크업(se-component …)이 서버에서 그대로 내려온다. 그걸 문단/이미지/인용/소제목
// 순서로 정리해 돌려주면, 클라이언트가 AI 에게 "이 리듬을 따르라"고 시킬 수 있다.
const { onCall, HttpsError } = require('firebase-functions/v2/https');

const MOBILE_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const DESKTOP_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';

// 글 번호 없는 블로그 홈 주소면 blogId 를 돌려준다 (blog.naver.com/아이디, m.blog.naver.com/아이디, PostList.naver?blogId=…)
function homeBlogId(url) {
  if (/[?&]logNo=\d{6,}/i.test(url)) return '';
  let m = url.match(/^https?:\/\/(?:m\.)?blog\.naver\.com\/([A-Za-z0-9_\-]+)\/?(?:[?#].*)?$/i);
  if (m && !/^(PostView|PostList|PostThumbnailList|MyBlog|GoBlog|BlogHome)/i.test(m[1])) return m[1];
  m = url.match(/blog\.naver\.com\/(?:PostList|PostThumbnailList|MyBlog|GoBlog)[^?]*\?[^#]*blogId=([A-Za-z0-9_\-]+)/i);
  return m ? m[1] : '';
}
function safeDecode(t) { try { return decodeURIComponent(String(t || '').replace(/\+/g, ' ')); } catch (e) { return String(t || ''); } }
// 블로그의 최근 글 목록 — 네이버 글 목록 API 를 먼저, 막히면 RSS 로.
async function listPosts(id) {
  const posts = [];
  try {
    const res = await fetch('https://blog.naver.com/PostTitleListAsync.naver?blogId=' + encodeURIComponent(id) + '&currentPage=1&countPerPage=30',
      { headers: { 'user-agent': DESKTOP_UA, 'referer': 'https://blog.naver.com/' + id }, signal: AbortSignal.timeout(15000) });
    if (res.ok) {
      const txt = await res.text();
      let j = null;
      try { j = JSON.parse(txt); } catch (e) { try { j = JSON.parse(txt.replace(/\\'/g, "'")); } catch (e2) { j = null; } }
      ((j && j.postList) || []).forEach((p) => {
        if (p && p.logNo) posts.push({ url: 'https://blog.naver.com/' + id + '/' + p.logNo, title: safeDecode(p.title), date: String(p.addDate || '') });
      });
    }
  } catch (e) { /* 아래 RSS 로 */ }
  if (!posts.length) {
    try {
      const res = await fetch('https://rss.blog.naver.com/' + encodeURIComponent(id) + '.xml', { headers: { 'user-agent': DESKTOP_UA }, signal: AbortSignal.timeout(15000) });
      if (res.ok) {
        const xml = await res.text();
        const re = /<item>([\s\S]*?)<\/item>/g;
        let m;
        while ((m = re.exec(xml)) && posts.length < 30) {
          const it = m[1];
          const cd = (s) => String(s || '').replace(/<!\[CDATA\[|\]\]>/g, '').trim();
          const title = strip(cd((it.match(/<title>([\s\S]*?)<\/title>/) || [])[1]));
          const link = cd((it.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || (it.match(/<guid[^>]*>([\s\S]*?)<\/guid>/) || [])[1]);
          const date = cd((it.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]);
          if (link) posts.push({ url: link.split('?')[0], title, date });
        }
      }
    } catch (e) { /* 없으면 빈 목록 */ }
  }
  return posts;
}

function strip(h) {
  return String(h || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[​﻿]/g, '')   // SE ONE 은 빈 문단에 zero-width space 를 넣는다
    .replace(/\s+/g, ' ').trim();
}

// 네이버 블로그 주소는 어떤 형태(PC/모바일/PostView)든 모바일 글 주소로 통일한다.
function normalizeUrl(url) {
  const bid = (url.match(/[?&]blogId=([A-Za-z0-9_\-]+)/i) || [])[1];
  const lno = (url.match(/[?&]logNo=(\d{6,})/i) || [])[1];
  if (bid && lno) return 'https://m.blog.naver.com/' + bid + '/' + lno;
  const m = url.match(/blog\.naver\.com\/([A-Za-z0-9_\-]+)\/(\d{6,})/i);
  if (m) return 'https://m.blog.naver.com/' + m[1] + '/' + m[2];
  return url;
}

// HTML → 블록 목록. 스마트에디터 ONE 이면 컴포넌트 단위로, 아니면 h/p/img 를 문서 순서대로.
function parseBlocks(html) {
  const blocks = [];
  let imgCount = 0, charCount = 0;
  const parts = html.split(/(?=<div[^>]+class="se-component )/);
  if (parts.length > 2) {
    for (const part of parts) {
      const cm = part.match(/class="se-component (se-[A-Za-z]+)/);
      if (!cm) continue;
      const kind = cm[1];
      if (kind === 'se-text') {
        const paras = [];
        const re = /<p[^>]*class="se-text-paragraph([^"]*)"[^>]*>([\s\S]*?)<\/p>/g;
        let pm;
        while ((pm = re.exec(part))) {
          const tx = strip(pm[2]);
          if (!tx) continue;
          const align = /align-center/.test(pm[1]) ? 'center' : /align-right/.test(pm[1]) ? 'right' : 'left';
          paras.push({ text: tx.slice(0, 140), len: tx.length, align });
          charCount += tx.length;
        }
        if (paras.length) blocks.push({ t: 'text', paras });
      } else if (kind === 'se-image' || kind === 'se-imageGroup' || kind === 'se-imageStrip') {
        const n = Math.max(1, (part.match(/<img\b/g) || []).length);
        imgCount += n;
        const cap = strip((part.match(/se-caption[^>]*>([\s\S]*?)<\/(?:p|div|span)>/) || [])[1] || '');
        blocks.push({ t: 'image', n, cap: cap.slice(0, 80) });
      } else if (kind === 'se-quotation') {
        blocks.push({ t: 'quote', text: strip(part).slice(0, 160) });
      } else if (kind === 'se-sectionTitle') {
        blocks.push({ t: 'h', text: strip(part).slice(0, 80) });
      } else if (kind === 'se-horizontalLine') {
        blocks.push({ t: 'hr' });
      } else if (/^se-(video|oglink|placesMap|table|sticker|material|code)$/.test(kind)) {
        blocks.push({ t: kind.slice(3) });
      }
    }
  }
  if (!blocks.length) {
    // 구 에디터·일반 사이트: 본문을 문서 순서대로 훑는다
    const body = (html.match(/<body[\s\S]*<\/body>/i) || [html])[0]
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, '');
    const re = /<(h[1-4]|p|img|blockquote|li)\b[^>]*>([\s\S]*?)(?=<\/(?:h[1-4]|p|blockquote|li)>|<(?:h[1-4]|p|img|blockquote|li)\b)/gi;
    let mm, cur = null;
    while ((mm = re.exec(body)) && blocks.length < 400) {
      const tag = mm[1].toLowerCase();
      if (tag === 'img') {
        imgCount++;
        if (cur) { blocks.push(cur); cur = null; }
        blocks.push({ t: 'image', n: 1, cap: '' });
        continue;
      }
      const tx = strip(mm[2]);
      if (!tx || tx.length < 2) continue;
      if (tag[0] === 'h') { if (cur) { blocks.push(cur); cur = null; } blocks.push({ t: 'h', text: tx.slice(0, 80) }); }
      else if (tag === 'blockquote') { if (cur) { blocks.push(cur); cur = null; } blocks.push({ t: 'quote', text: tx.slice(0, 160) }); }
      else { (cur = cur || { t: 'text', paras: [] }).paras.push({ text: tx.slice(0, 140), len: tx.length, align: 'left' }); charCount += tx.length; }
    }
    if (cur) blocks.push(cur);
  }
  return { blocks: blocks.slice(0, 200), imgCount, charCount };
}

exports.parseBlocks = parseBlocks; // 로컬 검증용

exports.fetchBlogRef = onCall({ region: 'asia-northeast3', timeoutSeconds: 60, memory: '512MiB' }, async (request) => {
  if (!request.auth) throw new HttpsError('unauthenticated', '로그인이 필요합니다.');
  let url = ((request.data && request.data.url) || '').trim();
  if (!url) throw new HttpsError('invalid-argument', '주소를 입력하세요.');
  if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
  // SSRF 방지: 사설/로컬 대역 차단
  if (/^https?:\/\/(localhost|127\.|0\.0\.0\.0|10\.|192\.168\.|169\.254\.|\[?::1)/i.test(url)) {
    throw new HttpsError('invalid-argument', '허용되지 않은 주소입니다.');
  }
  // 글 번호 없는 블로그 홈이면 글 목록을 돌려주고, 클라이언트가 참고할 글을 고르게 한다
  const homeId = homeBlogId(url);
  if (homeId) return { mode: 'list', blogId: homeId, posts: await listPosts(homeId) };
  url = normalizeUrl(url);
  const isNaver = /m\.blog\.naver\.com\//i.test(url);

  let html = '';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 20000);
    const res = await fetch(url, {
      headers: { 'user-agent': MOBILE_UA, 'accept-language': 'ko-KR,ko;q=0.9' },
      redirect: 'follow', signal: ctrl.signal
    });
    clearTimeout(t);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    html = (await res.text()).slice(0, 1500000);
  } catch (e) {
    throw new HttpsError('internal', '글을 불러오지 못했습니다: ' + (e.message || e));
  }

  const title = strip(
    (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']{1,200})["']/i) || [])[1]
    || (html.match(/<title[^>]*>([\s\S]{1,200}?)<\/title>/i) || [])[1] || ''
  );
  return Object.assign({ url, isNaver, title }, parseBlocks(html));
});
