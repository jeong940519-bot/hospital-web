// ───────────────────────── Firebase (기존 프로젝트 재사용) ─────────────────────────
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, collection, getDocs, addDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
import { getStorage, ref as sRef, uploadBytes, getDownloadURL, listAll, deleteObject, getMetadata } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js';
// 도형 기하 데이터(순수, editor 상태 비의존) — public/editor-shapes.js
import { SHAPE_CLIP, _clamp, _starPoly, SHAPE_ADJ, adjOf, shapeClipOf, SHAPE_LABELS, SHAPE_CATS } from './editor-shapes.js';
// 색상 데이터/수학(순수) — public/editor-colors.js
import { CP_THEME, CP_TEX, _hex2rgb, _rgb2hex, _lighten, _darken, _shades } from './editor-colors.js';
// AI 응답 JSON 견고 파서(순수, editor 상태 비의존) — public/editor-ai-parse.js
import { parseAiJson } from './editor-ai-parse.js';
// 내장 템플릿 데이터 + 순수 엘리먼트 빌더 — public/editor-templates.js
import { PHOTO, tEl, tText, tImg, tShape, tCard, TEMPLATES } from './editor-templates.js';
// 고정탭 기능(상호 import) — public/editor-fixtab.js
import { renderFixTabsOnCanvas, addFixedTab, _fixTab, fixTabItemsOf, _fixSave, _fixRefreshPopup, _fixItemIdx, clearFixTabSel } from './editor-fixtab.js';
const fbApp = initializeApp({
  apiKey:"AIzaSyDq3LRPvBDn1ZH6UDMPGDH_-LC7JnsEhLg",
  authDomain:"newworld-1a1d5.firebaseapp.com",
  projectId:"newworld-1a1d5",
  storageBucket:"newworld-1a1d5.firebasestorage.app",
  messagingSenderId:"948363397391",
  appId:"1:948363397391:web:5d7dee7a383f3bdec0167a"
});
const db = getFirestore(fbApp);
const storage = getStorage(fbApp);
const auth = getAuth(fbApp);
const functions = getFunctions(fbApp, 'asia-northeast3');
const aiProxy = httpsCallable(functions, 'aiProxy');
const fetchSite = httpsCallable(functions, 'fetchSite');
const DOC_PATH = ['site','editorProject']; // 공개 홈(도메인 루트)이 읽는 발행본 문서 (🚀 발행이 여기에 씀 / 구 저장 마이그레이션도 겸함)
let isAdmin = false, DEFAULT_AI_KEY = '';
let _prjId = localStorage.getItem('hw_prj_id') || null; // 현재 활성 프로젝트 ID

onAuthStateChanged(auth, async (user)=>{
  isAdmin = !!user;
  updateAuthUI();
  if(user){ await loadAiKey(); await loadCloud(); }
});
async function loadAiKey(){
  try{ const snap=await getDoc(doc(db,'config','ai')); if(snap.exists()&&snap.data().key) DEFAULT_AI_KEY=snap.data().key; }catch(e){ console.log('AI키 로드 실패',e); }
}
function updateAuthUI(){
  const b=document.getElementById('btn-login'); if(!b) return;
  b.textContent = isAdmin? '로그아웃' : '로그인';
  document.getElementById('btn-cloud').style.opacity = isAdmin? '1':'0.5';
}

// ───────────────────────── 상태 ─────────────────────────
const FONTS = [
  ['Noto Sans KR','본고딕 (기본)','한글'],['Noto Serif KR','본명조','한글'],
  ['Nanum Gothic','나눔고딕','한글'],['Nanum Myeongjo','나눔명조','한글'],
  ['Nanum Pen Script','나눔손글씨','한글'],['Black Han Sans','검은고딕','한글'],
  ['Do Hyeon','도현','한글'],['Jua','주아 (둥근)','한글'],['Gowun Dodum','고운돋움','한글'],
  ['Gaegu','개구 (손글씨)','한글'],['Song Myung','송명','한글'],
  ['Cute Font','귀여운글씨','한글'],['Sunflower','해바라기','한글'],['East Sea Dokdo','동해독도','한글'],
  ['Inter','Inter','영문'],['Roboto','Roboto','영문'],['Open Sans','Open Sans','영문'],
  ['Lato','Lato','영문'],['Montserrat','Montserrat','영문'],['Poppins','Poppins','영문'],
  ['Oswald','Oswald','영문'],['Raleway','Raleway','영문'],['Nunito','Nunito','영문'],['Quicksand','Quicksand','영문'],
  ['Playfair Display','Playfair Display','영문 세리프'],['Merriweather','Merriweather','영문 세리프'],
  ['Dancing Script','Dancing Script','영문 손글씨'],['Pacifico','Pacifico','영문 손글씨'],
  ['Bebas Neue','Bebas Neue','영문 굵은'],
];
const _loadedFonts=new Set(['Noto Sans KR','Noto Serif KR','Nanum Gothic','Nanum Myeongjo','Nanum Pen Script','Black Han Sans','Do Hyeon','Jua','Gowun Dodum','Gaegu','Song Myung','Cute Font','Sunflower','East Sea Dokdo','Inter','Roboto','Open Sans','Montserrat','Poppins']);
function loadFont(family){
  if(_loadedFonts.has(family)) return;
  _loadedFonts.add(family);
  const lk=document.createElement('link');
  lk.rel='stylesheet';
  lk.href=`https://fonts.googleapis.com/css2?family=${family.replace(/ /g,'+')}:wght@300;400;500;700;900&display=swap`;
  document.head.appendChild(lk);
}
// 이전에 저장한 커스텀 폰트 자동 로드
try{JSON.parse(localStorage.getItem('hw_custom_fonts')||'[]').forEach(f=>{ if(f[2]!=='내 폰트') loadFont(f[0]); });}catch(e){}

// ── 폰트 파일 가져오기 (.ttf/.otf/.woff) ──
function getFontFiles(){ try{ return JSON.parse(localStorage.getItem('hw_font_files')||'{}'); }catch{ return {}; } }
function fontFormatOf(name){ name=name.toLowerCase(); if(name.endsWith('.woff2'))return['woff2','font/woff2']; if(name.endsWith('.woff'))return['woff','font/woff']; if(name.endsWith('.otf'))return['opentype','font/otf']; return['truetype','font/ttf']; }
function registerFontFile(family, b64, fmt, mime){
  if(_loadedFonts.has(family)) return;
  _loadedFonts.add(family);
  const st=document.createElement('style');
  st.textContent=`@font-face{font-family:'${family}';src:url(data:${mime||'font/ttf'};base64,${b64}) format('${fmt}');font-display:swap;}`;
  document.head.appendChild(st);
}
// 시작 시 저장된 파일 폰트 등록
try{ const ff=getFontFiles(); Object.keys(ff).forEach(fam=>registerFontFile(fam, ff[fam].b64, ff[fam].fmt, ff[fam].mime)); }catch(e){}
function importFontFile(file, onDone){
  if(!file) return;
  const [fmt,mime]=fontFormatOf(file.name);
  const family=file.name.replace(/\.(ttf|otf|woff2?|TTF|OTF|WOFF2?)$/,'').replace(/[_-]+/g,' ').trim()||'내 폰트';
  const r=new FileReader();
  r.onload=()=>{
    const b64=String(r.result).split(',')[1];
    if(!b64){ toast('폰트 파일을 읽지 못했습니다'); return; }
    // 저장
    const ff=getFontFiles(); ff[family]={b64,fmt,mime}; try{ localStorage.setItem('hw_font_files',JSON.stringify(ff)); }catch(_){ toast('폰트가 너무 큽니다(저장 용량 초과)'); }
    registerFontFile(family,b64,fmt,mime);
    // 목록(hw_custom_fonts)에 추가
    try{ let arr=JSON.parse(localStorage.getItem('hw_custom_fonts')||'[]'); if(!arr.find(f=>f[0]===family)){ arr.push([family,family,'내 폰트']); localStorage.setItem('hw_custom_fonts',JSON.stringify(arr)); } }catch(_){}
    // 선택된 텍스트에 즉시 적용
    const sel=selId?el(selId):null;
    if(sel&&sel.type==='text'){ sel.fontFamily=family; afterMutate(); renderProps(); }
    toast(`"${family}" 폰트 추가됨`);
    if(onDone) onDone(family);
  };
  r.readAsDataURL(file);
}
const PAGE_W = 1980, PAGE_H = 1400;
const MOBILE_W = 430, MOBILE_H = 900;   // 모바일 전용 페이지 기본 크기
let editorDevice = 'pc';                  // 편집 중인 디바이스: 'pc' | 'mobile'
function pageDevice(p){ return p.device || 'both'; }
function inDevice(p, dev){ const d=pageDevice(p); return d==='both' || d===dev; }
// 모바일 햄버거 메뉴 설정 (프로젝트 단위)
function hamburgerCfg(){ if(!project.hamburger) project.hamburger={}; return project.hamburger; }
function hamburgerRootPages(){ return project.pages.filter(p=>!p.parentId && !p.isHeader && !p.isFooter); }
function hamburgerItems(){ const c=hamburgerCfg(); if(c.items&&c.items.length) return c.items; return hamburgerRootPages().map(p=>({name:p.name||'페이지', link:p.id})); }
function hamburgerMaterialize(){ const c=hamburgerCfg(); if(!c.items||!c.items.length) c.items=hamburgerItems().map(it=>({name:it.name,link:it.link})); return c.items; }
// 템플릿은 1200 기준 좌표 → 현재 PAGE_W로 스케일
function scaleEls(els, s){
  els.forEach(e=>{
    e.x=Math.round(e.x*s); e.y=Math.round(e.y*s); e.w=Math.round(e.w*s); e.h=Math.round(e.h*s);
    if(e.type==='text'){ e.fontSize=Math.round(e.fontSize*s); if(e.letterSpacing) e.letterSpacing=Math.round(e.letterSpacing*s*10)/10; }
    if(e.radius) e.radius=Math.round(e.radius*s);
    if(e.borderW) e.borderW=Math.max(1,Math.round(e.borderW*s));
  });
}
function scaleTpl(p){
  const s=PAGE_W/1200; if(s!==1) scaleEls(p.elements, s);
  let maxB=0; p.elements.forEach(e=>{ maxB=Math.max(maxB, e.y+e.h); });
  p.h=Math.round(maxB + 60*s);
  return p;
}
let project = null; // 실제 초기화는 아래에서 (PHOTO/TEMPLATES는 editor-templates.js import)
let curPage = 0;
let selId = null;       // 주 선택 (핸들/속성패널 기준)
let selIds = new Set(); // 다중 선택 전체 집합
let _tblSel = null;     // 표 셀 범위 선택 {id, r0,c0,r1,c1} (저장 안 함, 일시적)
let zoom = 1;
// ── editor-fixtab.js(분리 모듈)가 import로 읽는 바인딩/세터 + 재할당 션트 ──
function _clearSel(){ selId=null; selIds=new Set(); }   // 모듈에서 코어 선택 let을 직접 못 바꾸므로 세터 경유
function _resetCpTarget(){ _cpTarget=null; }            // 색상 팝업 토글 리셋(_cpTarget은 아래에서 선언)
export { project, selId, selIds, zoom, page, canvas, save, snapshot, renderCanvas, renderProps, toast, hamburgerRootPages, uid, FONTS, _clearSel, _resetCpTarget };
let _thumbW = 184; // 페이지 썸네일 너비(스크롤로 조절)
function pagesWidthPx(){ return (_thumbW+22)+'px'; }
let _clipboard = null; // 복수 요소(배열) 저장 — MS식 멀티 복사/붙여넣기
function copySel(){ const a=selAll(); if(!a.length) return; _clipboard=a.map(e=>JSON.parse(JSON.stringify(e))); toast(`${a.length}개 복사됨`); updateRibbonState(); }
function cutSel(){ const a=selAll(); if(!a.length) return; _clipboard=a.map(e=>JSON.parse(JSON.stringify(e))); const ids=new Set(a.map(e=>e.id)); page().elements=page().elements.filter(x=>!ids.has(x.id)); selId=null; selIds=new Set(); afterMutate(); toast('잘라내기 됨'); updateRibbonState(); }
function pasteClones(list, off){ if(!list||!list.length) return; const gmap={}; const ns=new Set(); list.forEach(src=>{ const c=JSON.parse(JSON.stringify(src)); c.id=uid(); c.x=(c.x||0)+off; c.y=(c.y||0)+off; if(c.groupId){ gmap[c.groupId]=gmap[c.groupId]||('grp_'+uid()); c.groupId=gmap[c.groupId]; } page().elements.push(c); ns.add(c.id); }); selIds=ns; selId=[...ns].at(-1); afterMutate(); toast(`${ns.size}개 붙여넣기 됨`); }
function pasteClipboard(){ pasteClones(_clipboard,24); }
function dupSel(){ pasteClones(selAll(),20); }
let history = [], hist_i = -1;

function newProject(){
  // 기본으로 '홈' 템플릿이 들어간 채로 시작
  return { pages:[ buildTemplate('home') ] };
}
function newPage(name, parentId){
  return { id:uid(), name: name||'새 페이지', parentId: parentId||null, w:PAGE_W, h:PAGE_H, bg:'#ffffff', elements:[] };
}
function pageById(id){ return project.pages.find(p=>p.id===id); }
function pageIndex(id){ return project.pages.findIndex(p=>p.id===id); }
// 상단 고정 바(직접 디자인하는 헤더) — 발행 시 모든 페이지 상단에 고정
function addHeaderBar(){
  const wantMobile = editorDevice==='mobile';
  let hp = wantMobile ? project.pages.find(p=>p.isHeader&&p.device==='mobile')
                      : project.pages.find(p=>p.isHeader&&p.device!=='mobile');
  if(hp){ curPage=pageIndex(hp.id); selId=null; selIds=new Set(); renderCanvas(); renderPages(); renderProps(); updateRibbonState(); toast((wantMobile?'모바일 ':'')+'상단 바 편집 중'); return; }
  if(wantMobile){
    hp={ id:uid(), name:'상단 바(모바일)', isHeader:true, device:'mobile', parentId:null, w:MOBILE_W, h:64, bg:'#ffffff', elements:[
      tText(74,14,260,36,'병원 로고',{fontSize:24,fontWeight:900,color:'#1a2b5c',align:'left'}),
    ]};
    project.pages.unshift(hp); curPage=0; selId=null; selIds=new Set(); afterMutate();
    toast('모바일 상단 바 생성됨 — 로고만 두세요. 발행 시 좌측상단 햄버거 메뉴가 자동으로 붙습니다');
  }else{
    hp={ id:uid(), name:'상단 바', isHeader:true, device:'both', parentId:null, w:PAGE_W, h:96, bg:'#ffffff', elements:[
      tText(48,28,360,44,'병원 로고',{fontSize:32,fontWeight:900,color:'#1a2b5c',align:'left'}),
      tText(PAGE_W-540,34,150,30,'병원 소개',{fontSize:19,fontWeight:700,color:'#1a2b5c',align:'center'}),
      tText(PAGE_W-380,34,150,30,'진료 안내',{fontSize:19,fontWeight:700,color:'#1a2b5c',align:'center'}),
      tText(PAGE_W-220,34,150,30,'오시는 길',{fontSize:19,fontWeight:700,color:'#1a2b5c',align:'center'}),
    ]};
    project.pages.unshift(hp); curPage=0; selId=null; selIds=new Set(); afterMutate();
    toast('상단 바 생성됨 — 메뉴 글자를 선택하고 속성의 🔗에서 페이지를 연결하세요');
  }
}
// 하단 바(직접 디자인하는 푸터) — 발행 시 모든 페이지 하단에 붙음(고정X), 배경색은 화면 끝까지 이어짐
// AI 모바일 변환 시 상단/하단 바도 모바일 전용으로 자동 생성 (로고만 크게, 탭은 햄버거로)
function ensureMobileBars(){
  // 상단 바
  const pcH = project.pages.find(p=>p.isHeader && p.device!=='mobile');
  const mH = project.pages.find(p=>p.isHeader && p.device==='mobile');
  if(pcH && !mH){
    const texts=pcH.elements.filter(e=>e.type==='text');
    const logo=texts.slice().sort((a,b)=>(b.fontSize||0)-(a.fontSize||0))[0];
    const hp={ id:uid(), name:'상단 바(모바일)', isHeader:true, device:'mobile', parentId:null, w:MOBILE_W, h:64, bg:pcH.bg||'#ffffff', elements:[
      tText(76,14,300,36, logo?logo.text:'병원 로고', {fontSize:26,fontWeight:900,color:(logo&&logo.color)||'#1a2b5c',align:'left'})
    ]};
    project.pages.unshift(hp);
  }
  // 하단 바
  const pcF = project.pages.find(p=>p.isFooter && p.device!=='mobile');
  const mF = project.pages.find(p=>p.isFooter && p.device==='mobile');
  if(pcF && !mF){
    let y=28; const els=[]; const ftxt=pcF.elements.filter(e=>e.type==='text');
    ftxt.forEach((t,idx)=>{
      const isCopy=/©|copyright|rights/i.test(t.text||'');
      const fs= idx===0?22:(isCopy?13:16);
      const h= Math.max(28, t.text.split('\n').length*Math.round(fs*1.8));
      els.push(tText(24,y,382,h, t.text, {fontSize:fs,fontWeight:idx===0?900:400,color:t.color||'#cdd6ee',align:'center',lineHeight:1.8}));
      y+=h+14;
    });
    if(els.length){ const fp={ id:uid(), name:'하단 바(모바일)', isFooter:true, device:'mobile', parentId:null, w:MOBILE_W, h:y+12, bg:pcF.bg||'#1a2b5c', elements:els }; project.pages.push(fp); }
  }
}
function addFooterBar(){
  const wantMobile = editorDevice==='mobile';
  let fp = wantMobile ? project.pages.find(p=>p.isFooter&&p.device==='mobile')
                      : project.pages.find(p=>p.isFooter&&p.device!=='mobile');
  if(fp){ curPage=pageIndex(fp.id); selId=null; selIds=new Set(); renderCanvas(); renderPages(); renderProps(); updateRibbonState(); toast((wantMobile?'모바일 ':'')+'하단 바 편집 중 — 배경색은 화면 끝까지 이어집니다'); return; }
  if(wantMobile){
    fp={ id:uid(), name:'하단 바(모바일)', isFooter:true, device:'mobile', parentId:null, w:MOBILE_W, h:300, bg:'#1a2b5c', elements:[
      tText(24,32,382,34,'새이름 병원',{fontSize:22,fontWeight:900,color:'#ffffff',align:'center'}),
      tText(24,82,382,150,'부산광역시 ○○구 ○○로 123\n대표전화 051-000-0000\n평일 09:00–18:00\n토 09:00–13:00 · 일·공휴일 휴진',{fontSize:16,color:'#cdd6ee',align:'center',lineHeight:1.8}),
      tText(24,246,382,26,'© 2026 새이름 병원',{fontSize:13,color:'#9aa8cf',align:'center'}),
    ]};
    project.pages.push(fp); curPage=project.pages.length-1; selId=null; selIds=new Set(); afterMutate();
    toast('모바일 하단 바 생성됨 — 글자를 가운데·크게 배치했습니다');
  }else{
    fp={ id:uid(), name:'하단 바', isFooter:true, device:'both', parentId:null, w:PAGE_W, h:280, bg:'#1a2b5c', elements:[
      tText(48,54,520,40,'새이름 병원',{fontSize:26,fontWeight:900,color:'#ffffff',align:'left'}),
      tText(48,108,640,120,'부산광역시 ○○구 ○○로 123\n대표전화 051-000-0000\n평일 09:00–18:00 · 토 09:00–13:00 · 일·공휴일 휴진',{fontSize:16,color:'#cdd6ee',align:'left',lineHeight:1.7}),
      tText(PAGE_W-360,200,320,28,'© 2026 새이름 병원',{fontSize:13,color:'#9aa8cf',align:'right'}),
    ]};
    project.pages.push(fp); curPage=project.pages.length-1; selId=null; selIds=new Set(); afterMutate();
    toast('하단 바 생성됨 — 배경색을 바꾸면 발행 시 화면 양끝까지 그 색이 이어집니다');
  }
}

// ───────────────────────── 내장 템플릿 ─────────────────────────
// PHOTO/tEl/tText/tImg/tShape/tCard/TEMPLATES → public/editor-templates.js 로 분리 (상단 import)
function buildTemplate(key){
  const p = newPage();
  if(key==='blank'){ p.name='새 페이지'; return p; }
  if(key==='home'){
    p.name='홈';
    p.elements = [
      tShape(0,0,1200,600,{fill:'#eaf1ff'}),
      tText(90,150,650,120,'건강한 내일을 함께\n새이름 병원',{fontSize:54,fontWeight:900,color:'#1a2b5c',lineHeight:1.2}),
      tText(92,310,560,120,'환자 중심의 따뜻한 진료, 정확한 진단으로\n믿을 수 있는 의료 서비스를 제공합니다.',{fontSize:22,color:'#445577',lineHeight:1.5}),
      tShape(92,460,200,64,{fill:'#2b6cff',radius:32}),
      tText(92,460,200,64,'진료 예약하기',{fontSize:20,fontWeight:700,color:'#ffffff',align:'center'}),
      tImg(760,150,360,360,{radius:24}),
      tText(0,690,1200,50,'진료 과목',{fontSize:36,fontWeight:800,align:'center',color:'#1a2b5c'}),
      ...tCard(110,'내과','소화기·호흡기·순환기'),
      ...tCard(450,'정형외과','관절·척추·스포츠손상'),
      ...tCard(790,'신경과','두통·어지럼·신경계'),
      tText(0,1130,1200,40,'진료시간  평일 09:00–18:00 · 토 09:00–13:00',{fontSize:20,align:'center',color:'#667089'}),
    ];
    return scaleTpl(p);
  }
  if(key==='about'){
    p.name='병원소개';
    p.elements = [
      tText(0,90,1200,60,'병원 소개',{fontSize:42,fontWeight:900,align:'center',color:'#1a2b5c'}),
      tShape(560,168,80,4,{fill:'#2b6cff'}),
      tImg(90,250,480,420,{radius:20}),
      tText(620,260,490,50,'환자를 먼저 생각합니다',{fontSize:28,fontWeight:800,color:'#1a2b5c'}),
      tText(620,330,490,300,'새이름 병원은 30년간 지역 주민의 건강을 지켜왔습니다.\n\n최신 의료장비와 풍부한 임상경험을 갖춘 의료진이\n정확한 진단과 친절한 진료로 함께합니다.\n\n작은 증상도 놓치지 않는 세심함으로\n환자 한 분 한 분을 정성껏 모시겠습니다.',{fontSize:19,color:'#445577',lineHeight:1.7}),
    ];
    return scaleTpl(p);
  }
  if(key==='service'){
    p.name='진료안내';
    p.elements = [
      tText(0,90,1200,60,'진료 안내',{fontSize:42,fontWeight:900,align:'center',color:'#1a2b5c'}),
      ...['건강검진','예방접종','만성질환관리','물리치료','영양상담','금연클리닉'].flatMap((t,i)=>{
        const x = 110 + (i%3)*340, y = 240 + Math.floor(i/3)*300;
        return [ tShape(x,y,300,250,{fill:'#f5f7fc',radius:16}),
          tImg(x+110,y+40,80,80,{radius:40}),
          tText(x,y+140,300,40,t,{fontSize:22,fontWeight:700,align:'center',color:'#1a2b5c'}),
          tText(x,y+185,300,50,'자세한 설명을 입력하세요',{fontSize:15,align:'center',color:'#889'}) ];
      }),
    ];
    return scaleTpl(p);
  }
  if(key==='contact'){
    p.name='오시는길';
    p.elements = [
      tText(0,90,1200,60,'오시는 길',{fontSize:42,fontWeight:900,align:'center',color:'#1a2b5c'}),
      tImg(90,220,700,460,{radius:16}),
      tText(840,240,280,40,'연락처',{fontSize:26,fontWeight:800,color:'#1a2b5c'}),
      tText(840,310,300,260,'📍 주소\n부산광역시 ○○구 ○○로 123\n\n📞 전화\n051-000-0000\n\n🕐 진료시간\n평일 09:00–18:00\n토요일 09:00–13:00\n일·공휴일 휴진',{fontSize:18,color:'#445577',lineHeight:1.8}),
    ];
    return scaleTpl(p);
  }
  return p;
}
function uid(){ return Math.random().toString(36).slice(2,9); }
function page(){ return project.pages[curPage]; }
function el(id){ return page().elements.find(e=>e.id===id); }

// ───────────────────────── 저장/불러오기 ─────────────────────────
const LS_KEY = 'canvas-editor-project';
function save(silent){
  try{
    localStorage.setItem(LS_KEY, JSON.stringify(project));
    if(!silent) toast('저장됨 (이 브라우저)');
  }catch(e){
    // QuotaExceededError 등 — 저장 실패가 편집 흐름을 중단시키지 않게 흡수하고 안내
    console.error('save 실패', e);
    const quota = (e && (e.name==='QuotaExceededError' || /quota|exceeded/i.test(e.message||'')));
    toast(quota ? '⚠ 저장 용량 초과 — 큰 이미지/폰트를 줄이거나 클라우드 저장을 이용하세요'
                : '⚠ 저장에 실패했습니다');
  }
}
function load(){
  try{ const s = localStorage.getItem(LS_KEY); return s? JSON.parse(s):null; }catch(e){ return null; }
}

// ───────────────────────── 히스토리 ─────────────────────────
function snapshot(){
  history = history.slice(0, hist_i+1);
  history.push(JSON.stringify(project));
  if(history.length>60) history.shift();
  hist_i = history.length-1;
}
function undo(){ if(hist_i>0){ hist_i--; project = JSON.parse(history[hist_i]); afterMutate(true); } }
function redo(){ if(hist_i<history.length-1){ hist_i++; project = JSON.parse(history[hist_i]); afterMutate(true); } }
function afterMutate(skipSnap){
  if(curPage >= project.pages.length) curPage = project.pages.length-1;
  if(!skipSnap) snapshot();
  renderCanvas(); renderPages(); renderProps();
  if(typeof _activePropTab!=='undefined'&&_activePropTab==='fx') renderFxPanel();
  save(true);
  updateRibbonState();
}

// 도형 기하 데이터(SHAPE_CLIP/SHAPE_ADJ/SHAPE_LABELS/SHAPE_CATS/adjOf/shapeClipOf/_clamp/_starPoly)는
// public/editor-shapes.js로 분리됨 — 상단에서 import.

// ───────────────────────── 뷰포트 중앙 좌표 ─────────────────────────
function getViewCenter(w=200,h=200){
  const stage=document.getElementById('stage');
  const wrap=document.getElementById('canvas-wrap');
  const sx=stage.scrollLeft, sy=stage.scrollTop;
  const wl=wrap.offsetLeft, wt=wrap.offsetTop;
  const cx=(sx+stage.clientWidth/2-wl)/zoom;
  const cy=(sy+stage.clientHeight/2-wt)/zoom;
  const p=page();
  return { x:Math.max(0,Math.min(p.w-w, cx-w/2)), y:Math.max(0,Math.min(p.h-h, cy-h/2)) };
}

// ───────────────────────── 요소 생성 ─────────────────────────
function addText(){
  const {x,y}=getViewCenter(400,80);
  const e = { id:uid(), type:'text', x, y, w:400, h:80, rot:0,
    text:'텍스트를 입력하세요', fontFamily:'Noto Sans KR', fontWeight:700, fontSize:40,
    color:'#222222', align:'center', lineHeight:1.3, letterSpacing:0, italic:false, underline:false };
  page().elements.push(e); selId=e.id; afterMutate();
}
function addImage(){
  document.getElementById('img-target').value = '';
  document.getElementById('img-file').click();
}
function addShape(kind){
  const isLine = (kind==='line'||kind==='line-arrow');
  const w=isLine?280:200, h=isLine?24:200;
  const {x,y}=getViewCenter(w,h);
  const e = isLine
    ? { id:uid(), type:'shape', x, y, w, h, rot:0, shape:kind, fill:'#333333', radius:0, borderW:4, borderColor:'#333333' }
    : { id:uid(), type:'shape', x, y, w, h, rot:0, shape:kind, fill:'#6c7bff', radius:(kind==='circle'?9999:kind==='rrect'?28:0), borderW:0, borderColor:'#333333' };
  page().elements.push(e); selId=e.id; selIds=new Set([e.id]); afterMutate();
  // 최근 사용한 도형 기록
  try{ let r=JSON.parse(localStorage.getItem('hw_recent_shapes')||'[]'); r=[kind,...r.filter(k=>k!==kind)].slice(0,12); localStorage.setItem('hw_recent_shapes',JSON.stringify(r)); }catch(_){}
}
function addTable(cols,rows){
  cols=cols||3; rows=rows||3;
  const cellW=120, cellH=40;
  const w=cols*cellW, h=rows*cellH;
  const {x,y}=getViewCenter(w,h);
  const cells=[];
  for(let r=0;r<rows;r++) for(let c=0;c<cols;c++) cells.push({r,c,text:''});
  const e={id:uid(),type:'table',x,y,w,h,rot:0,
    cols,rows,cells,
    borderW:1,borderColor:'#333333',
    headerBg:'#4a5568',headerColor:'#ffffff',
    cellBg:'#ffffff',cellColor:'#333333',
    fontSize:14,fontFamily:'Noto Sans KR',fontWeight:400,
    headerWeight:700,radius:0};
  page().elements.push(e); selId=e.id; selIds=new Set([e.id]); afterMutate();
}

// 이미지 dataURL을 캔버스에 배치 (cx,cy 주면 그 지점 중심, 없으면 화면 중앙)
function placeImage(dataURL, cx, cy){
  const img = new Image();
  img.onload=()=>{
    const ratio = img.height/img.width;
    const w = Math.min(500, img.width);
    const h = w*ratio;
    let x,y;
    if(cx!=null){ x=cx-w/2; y=cy-h/2; }
    else { const c=getViewCenter(w,h); x=c.x; y=c.y; }
    const p=page();
    x=Math.max(0,Math.min(p.w-w, Math.round(x))); y=Math.max(0,Math.min(p.h-h, Math.round(y)));
    const ne = { id:uid(), type:'image', x, y, w, h, rot:0,
      src:dataURL, fit:'cover', radius:0, clip:'none', borderW:0, borderColor:'#333333' };
    page().elements.push(ne); selId=ne.id; selIds=new Set([ne.id]); afterMutate();
  };
  img.src = dataURL;
}
function addImageFromFile(file, cx, cy){ if(!file||!/^image\//.test(file.type)) return; const r=new FileReader(); r.onload=()=>placeImage(r.result,cx,cy); r.readAsDataURL(file); }
document.getElementById('img-file').addEventListener('change', e=>{
  const f = e.target.files[0]; e.target.value='';
  if(!f) return;
  const target = document.getElementById('img-target').value;
  if(target){ // 기존 이미지 교체
    const r=new FileReader(); r.onload=()=>{ const obj=el(target); if(obj){ obj.src=r.result; afterMutate(); } }; r.readAsDataURL(f);
  } else {
    addImageFromFile(f);
  }
});
// 캔버스에 이미지 파일 드래그&드롭
['stage','canvas'].forEach(id=>{
  const t=document.getElementById(id);
  if(!t) return;
  t.addEventListener('dragover', ev=>{ if(ev.dataTransfer&&[...ev.dataTransfer.types].includes('Files')){ ev.preventDefault(); ev.dataTransfer.dropEffect='copy'; document.getElementById('stage').classList.add('drag-over'); } });
  t.addEventListener('dragleave', ev=>{ if(ev.target.id==='stage') document.getElementById('stage').classList.remove('drag-over'); });
  t.addEventListener('drop', ev=>{
    const files=ev.dataTransfer&&ev.dataTransfer.files; if(!files||!files.length) return;
    ev.preventDefault(); document.getElementById('stage').classList.remove('drag-over');
    const cRect=canvas.getBoundingClientRect();
    const cx=(ev.clientX-cRect.left)/zoom, cy=(ev.clientY-cRect.top)/zoom;
    [...files].forEach((f,i)=>{ if(/^image\//.test(f.type)) addImageFromFile(f, cx+i*20, cy+i*20); else if(/font|\.(ttf|otf|woff2?)$/i.test(f.type+f.name)) importFontFile(f); });
  });
});

// ───────────────────────── 텍스트/그림자 공통 ─────────────────────────
const SHADOW_CSS='4px 5px 14px rgba(0,0,0,.28)';
// 채움색 + 투명도(opacity 0~100) → {bg, layerOp}. 단색(hex)은 rgba로 변환해 테두리는 또렷하게 유지
function fillCss(fill, op){
  if(op==null||op>=100) return {bg:fill, layerOp:null};
  const a=Math.max(0,Math.min(100,op))/100;
  const m=/^#([0-9a-fA-F]{6})$/.exec(fill||'');
  if(m){ const n=parseInt(m[1],16); return {bg:`rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`, layerOp:null}; }
  return {bg:fill, layerOp:a}; // 그라데이션/그림/투명 → 레이어 opacity
}
function applyTextStyle(inner, e){
  inner.style.fontFamily = `'${e.fontFamily}',sans-serif`;
  inner.style.fontWeight = e.fontWeight;
  inner.style.fontSize = e.fontSize+'px';
  inner.style.color = e.color;
  inner.style.textAlign = e.align==='justify'?'justify':e.align;
  inner.style.lineHeight = e.lineHeight;
  inner.style.letterSpacing = e.letterSpacing+'px';
  inner.style.fontStyle = e.italic?'italic':'normal';
  const deco=[]; if(e.underline) deco.push('underline'); if(e.strike) deco.push('line-through');
  inner.style.textDecoration = deco.length?deco.join(' '):'none';
  inner.style.textShadow = e.shadow?'2px 2px 4px rgba(0,0,0,.4)':'none';
  inner.style.paddingLeft = e.indent?(e.indent*28)+'px':'';
  inner.style.writingMode = e.vertical?'vertical-rl':'';
}
// 글머리/번호/강조색 포함 표시용 HTML 생성 (편집 중이 아닐 때)
function setTextInner(inner, e, editing){
  if(editing){ inner.textContent = e.text; return; }
  const hl = e.highlight;
  const wrap = s => hl ? `<span style="background:${hl};box-decoration-break:clone;-webkit-box-decoration-break:clone;padding:0 .12em">${s}</span>` : s;
  if(e.bullet && e.bullet!=='none'){
    const lines=e.text.split('\n');
    inner.style.whiteSpace='normal';
    inner.innerHTML = lines.map((ln,i)=>{
      const mk = e.bullet==='number'? `${i+1}. ` : '• ';
      return `<div style="display:flex;gap:.3em"><span style="flex-shrink:0">${escapeHtml(mk)}</span><span style="flex:1">${wrap(escapeHtml(ln)||'&nbsp;')}</span></div>`;
    }).join('');
  } else {
    inner.style.whiteSpace='pre-wrap';
    if(hl) inner.innerHTML = wrap(escapeHtml(e.text));
    else inner.textContent = e.text;
  }
}

// ───────────────────────── 전역 liveStyleEl ─────────────────────────
function liveStyleEl(e){
  const node = canvas.querySelector(`[data-id="${e.id}"]`);
  if(node){ const fresh=renderEl(e); node.replaceWith(fresh); if(selId===e.id) addHandles(canvas.querySelector(`[data-id="${e.id}"]`),e); }
  renderPages(); save(true);
}

// ───────────────────────── 렌더: 캔버스 ─────────────────────────
const canvas = document.getElementById('canvas');
const canvasWrap = document.getElementById('canvas-wrap');
// ───────────────────────── 섹션 (핀 고정/스크럽용) ─────────────────────────
function sortedSections(p){ if(!p.sections||p.sections.length<2) return []; p.sections.sort((a,b)=>a.y-b.y); p.sections[0].y=0; return p.sections; }
function addSection(){
  const p=page();
  if(!p.sections||!p.sections.length) p.sections=[{id:uid(),name:'섹션 1',y:0,pin:false,pinLen:600}];
  const s=p.sections.slice().sort((a,b)=>a.y-b.y);
  let bi=0,bh=-1; for(let i=0;i<s.length;i++){ const top=s[i].y, bot=(s[i+1]?s[i+1].y:p.h); if(bot-top>bh){bh=bot-top;bi=i;} }
  const top=s[bi].y, bot=(s[bi+1]?s[bi+1].y:p.h);
  p.sections.push({id:uid(),name:'섹션 '+(p.sections.length+1),y:Math.round((top+bot)/2),pin:false,pinLen:600});
  sortedSections(p); afterMutate();
}
function delSection(id){
  const p=page(); p.sections=(p.sections||[]).filter(s=>s.id!==id);
  if(p.sections.length){ sortedSections(p); } if(p.sections.length<2) delete p.sections;
  afterMutate();
}
function drawSections(){
  const p=page(); const secs=sortedSections(p); if(!secs.length) return;
  secs.forEach((sec,i)=>{
    const top=sec.y, bot=(secs[i+1]?secs[i+1].y:p.h);
    const lab=document.createElement('div'); lab.className='sec-label';
    lab.style.cssText=`position:absolute;left:6px;top:${top+6}px;z-index:62;background:rgba(108,123,255,.85);color:#fff;font-size:11px;padding:2px 8px;border-radius:6px;pointer-events:none;white-space:nowrap`;
    lab.innerHTML=`${sec.pin?'📌 ':''}${escapeHtml(sec.name||('섹션 '+(i+1)))} <span style="opacity:.8">${Math.round(bot-top)}px</span>`;
    canvas.appendChild(lab);
    if(i>0){
      const ln=document.createElement('div'); ln.className='sec-line';
      ln.style.cssText=`position:absolute;left:0;top:${top}px;width:100%;height:0;border-top:2px dashed #6c7bff;z-index:61;cursor:ns-resize`;
      ln.addEventListener('mousedown',ev=>{ ev.stopPropagation(); startSectionDrag(ev,sec); });
      canvas.appendChild(ln);
    }
  });
}
function startSectionDrag(ev,sec){
  ev.preventDefault(); const rect=canvas.getBoundingClientRect();
  function mv(e2){ const p=page(); const s=p.sections.slice().sort((a,b)=>a.y-b.y); const i=s.indexOf(sec);
    const prev=s[i-1]?s[i-1].y:0, next=s[i+1]?s[i+1].y:p.h;
    let y=(e2.clientY-rect.top)/zoom; sec.y=Math.round(Math.max(prev+30,Math.min(next-30,y))); renderCanvas(); }
  function up(){ window.removeEventListener('mousemove',mv); window.removeEventListener('mouseup',up); save(true); snapshot(); }
  window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up);
}

function renderCanvas(){
  if(_tblSel && selId!==_tblSel.id) _tblSel=null;   // 표 선택 해제 시 셀 범위선택도 해제
  const p = page();
  canvas.style.width = p.w+'px';
  canvas.style.height = p.h+'px';
  canvas.style.background = p.bg;
  document.getElementById('pmeta').textContent = `${p.w} × ${p.h}`;
  const marqueeEl = document.getElementById('marquee');
  canvas.innerHTML = '';
  if(marqueeEl) canvas.appendChild(marqueeEl);
  p.elements.forEach(e=> canvas.appendChild(renderEl(e)));
  drawSections();
  if(selIds.size>=2) addGroupFrame();
  else if(selId && el(selId)){
    const se=el(selId);
    // 그룹 안 개체 단독선택 시 → 그룹 영역을 흐린 점선으로 표시
    if(se.groupId){
      const gm=page().elements.filter(x=>x.groupId===se.groupId);
      if(gm.length>1){
        const x0=Math.min(...gm.map(e=>e.x)),y0=Math.min(...gm.map(e=>e.y)),x1=Math.max(...gm.map(e=>e.x+e.w)),y1=Math.max(...gm.map(e=>e.y+e.h));
        const go=document.createElement('div'); go.id='group-outline';
        go.style.cssText=`position:absolute;left:${x0}px;top:${y0}px;width:${x1-x0}px;height:${y1-y0}px;border:1px dashed #9aa3c0;opacity:.6;pointer-events:none;z-index:55;box-sizing:border-box`;
        canvas.appendChild(go);
      }
    }
    addHandles(canvas.querySelector(`[data-id="${selId}"]`), se);
  }
  applyAutofits();
  renderHambOnCanvas();
  renderFixTabsOnCanvas();
}
// ── 햄버거 메뉴: 캔버스에서 보면서 편집 (상단 바 페이지에서) ──
let _hambOpen=false;
function buildHambBtn(){
  const p=page(), cfg=hamburgerCfg();
  const btn=document.createElement('div'); btn.id='hamb-btn';
  const sz=Math.min(cfg.size||40, p.h-8);
  const posLeft=(cfg.pos||'left')==='left';
  const gap=Math.max(3,Math.round(sz*0.13));
  btn.style.cssText=`position:absolute;top:${Math.round((p.h-sz)/2)}px;${posLeft?'left':'right'}:16px;width:${sz+10}px;height:${sz}px;display:flex;flex-direction:column;justify-content:center;gap:${gap}px;padding:0 9px;cursor:pointer;z-index:80;border-radius:8px;box-sizing:border-box${_hambOpen?';outline:2px solid var(--accent)':''}`;
  const bc=cfg.btnColor||'#1a2b5c';
  btn.innerHTML=`<span style="height:3px;background:${bc};border-radius:2px"></span><span style="height:3px;background:${bc};border-radius:2px"></span><span style="height:3px;background:${bc};border-radius:2px"></span>`;
  btn.title='클릭: 햄버거 메뉴 편집';
  btn.addEventListener('mousedown',ev=>ev.stopPropagation());
  btn.addEventListener('click',ev=>{ ev.stopPropagation(); _hambOpen=!_hambOpen; renderCanvas(); });
  return btn;
}
function renderHambOnCanvas(){
  document.getElementById('hamb-menu')?.remove();
  document.getElementById('hamb-btn')?.remove();
  // 햄버거는 모바일 전용 — 모바일 편집 모드의 헤더에서만 캔버스에 표시
  const p=page(); if(!p.isHeader || editorDevice!=='mobile'){ _hambOpen=false; return; }
  canvas.appendChild(buildHambBtn());
  if(_hambOpen) canvasWrap.appendChild(buildHambMenu());
}
function updateHambBtn(){ const ob=document.getElementById('hamb-btn'); if(ob) ob.replaceWith(buildHambBtn()); }
// 패널을 스크롤 위치 보존하며 부분 갱신 (전체 renderCanvas 금지 → 스크롤 점프 방지)
function refreshHambMenu(){ const old=document.getElementById('hamb-menu'); if(old&&_hambOpen){ const st=old.scrollTop; const fresh=buildHambMenu(); old.replaceWith(fresh); fresh.scrollTop=st; } updateHambBtn(); }
function buildHambMenu(){
  const p=page(), cfg=hamburgerCfg(), items=hamburgerMaterialize(), roots=hamburgerRootPages();
  const pw=Math.min(360,p.w-16);
  const panel=document.createElement('div'); panel.id='hamb-menu';
  panel.style.cssText=`position:absolute;top:${p.h+6}px;left:${Math.max(0,p.w-pw-8)}px;width:${pw}px;max-height:520px;overflow:auto;background:${cfg.bg||'#ffffff'};box-shadow:0 16px 40px rgba(0,0,0,.3);border-radius:12px;z-index:81;padding:12px;box-sizing:border-box`;
  panel.addEventListener('mousedown',ev=>ev.stopPropagation());
  panel.addEventListener('click',ev=>ev.stopPropagation());
  let html=`<div style="display:flex;align-items:center;margin-bottom:10px"><b style="flex:1;color:${cfg.color||'#1a2b5c'};font-size:14px">☰ 메뉴 항목</b><button id="hmx-close" style="border:none;background:none;font-size:18px;cursor:pointer;color:#888;line-height:1">✕</button></div>`;
  items.forEach((it,idx)=>{
    html+=`<div class="hmx-item" data-idx="${idx}" style="border:1px solid #e6e6ee;border-radius:9px;padding:8px;margin-bottom:7px;background:#fff">
      <div style="display:flex;gap:5px;align-items:center;margin-bottom:5px">
        <span style="cursor:default;color:#bbb;font-size:13px">≡</span>
        <input class="hmx-name" value="${escapeHtml(it.name||'')}" placeholder="메뉴 이름" style="flex:1;padding:6px 9px;border:1px solid #ddd;border-radius:6px;font-size:13px;color:#222">
        <button class="hmx-up" title="위로" style="border:1px solid #ddd;background:#fff;border-radius:5px;cursor:pointer;font-size:11px;padding:3px 6px">▲</button>
        <button class="hmx-down" title="아래로" style="border:1px solid #ddd;background:#fff;border-radius:5px;cursor:pointer;font-size:11px;padding:3px 6px">▼</button>
        <button class="hmx-del" title="삭제" style="border:none;background:none;color:#e05a7a;cursor:pointer;font-size:14px">✕</button>
      </div>
      <select class="hmx-link" style="width:100%;padding:6px 9px;border:1px solid #ddd;border-radius:6px;font-size:12px;color:#444">
        ${roots.map(r=>`<option value="${r.id}" ${it.link===r.id?'selected':''}>→ ${escapeHtml(r.name||'페이지')}</option>`).join('')}
      </select>
    </div>`;
  });
  html+=`<button id="hmx-add" style="width:100%;padding:9px;border:1px dashed #c9c9d6;background:#fafaff;border-radius:8px;cursor:pointer;color:#556;font-size:13px;margin-bottom:8px">＋ 메뉴 항목 추가</button>`;
  html+=`<div style="display:flex;gap:8px;align-items:center;font-size:11px;color:#888;margin-bottom:8px"><span>색상</span>
    <button type="button" class="panel-cbtn" data-cpkey="hmBtn" title="☰ 버튼 색"><span style="background:${cfg.btnColor||'#1a2b5c'}"></span></button>
    <button type="button" class="panel-cbtn" data-cpkey="hmBg" title="메뉴 배경"><span style="background:${cfg.bg||'#ffffff'}"></span></button>
    <button type="button" class="panel-cbtn" data-cpkey="hmColor" title="메뉴 글자색"><span style="background:${cfg.color||'#1a2b5c'}"></span></button>
  </div>`;
  const hpos=cfg.pos||'left', hsz=cfg.size||40;
  html+=`<div style="display:flex;gap:8px;align-items:center;font-size:11px;color:#888;margin-bottom:6px">
    <span>☰ 위치</span>
    <button class="hmx-pos" data-pos="left" style="border:1px solid #ddd;background:${hpos==='left'?'#6c7bff':'#fff'};color:${hpos==='left'?'#fff':'#444'};border-radius:5px;cursor:pointer;font-size:11px;padding:4px 9px">왼쪽</button>
    <button class="hmx-pos" data-pos="right" style="border:1px solid #ddd;background:${hpos==='right'?'#6c7bff':'#fff'};color:${hpos==='right'?'#fff':'#444'};border-radius:5px;cursor:pointer;font-size:11px;padding:4px 9px">오른쪽</button>
  </div>
  <div style="display:flex;gap:8px;align-items:center;font-size:11px;color:#888;margin-bottom:6px">
    <span>☰ 크기 <b id="hmx-size-val" style="color:#555">${hsz}</b></span>
    <input id="hmx-size" type="range" min="28" max="64" value="${hsz}" style="flex:1">
  </div>
  <div style="display:flex;gap:8px;align-items:center;font-size:11px;color:#888">
    <span>메뉴 글자 <b id="hmx-isize-val" style="color:#555">${cfg.itemSize||17}</b></span>
    <input id="hmx-isize" type="range" min="13" max="28" value="${cfg.itemSize||17}" style="flex:1">
  </div>`;
  panel.innerHTML=html;
  panel.querySelectorAll('.panel-cbtn').forEach(b=>b.addEventListener('click',ev=>{ ev.stopPropagation(); toggleColorPopup(b.dataset.cpkey, b); }));
  panel.querySelectorAll('.hmx-pos').forEach(b=>b.addEventListener('click',()=>{ hamburgerCfg().pos=b.dataset.pos; save(true); snapshot(); refreshHambMenu(); }));
  const szI=panel.querySelector('#hmx-size'); if(szI){ szI.addEventListener('input',()=>{ const v=parseInt(szI.value)||40; hamburgerCfg().size=v; save(true); const sv=panel.querySelector('#hmx-size-val'); if(sv)sv.textContent=v; const hb=document.getElementById('hamb-btn'); if(hb){ const pp=page(); const g=Math.max(3,Math.round(v*0.13)); hb.style.width=(v+10)+'px'; hb.style.height=v+'px'; hb.style.top=Math.round((pp.h-v)/2)+'px'; hb.style.gap=g+'px'; } }); szI.addEventListener('change',()=>snapshot()); }
  const isI=panel.querySelector('#hmx-isize'); if(isI){ isI.addEventListener('input',()=>{ hamburgerCfg().itemSize=parseInt(isI.value)||16; save(true); const iv=panel.querySelector('#hmx-isize-val'); if(iv)iv.textContent=hamburgerCfg().itemSize; }); isI.addEventListener('change',()=>snapshot()); }
  panel.querySelector('#hmx-close').addEventListener('click',()=>{ _hambOpen=false; renderCanvas(); });
  panel.querySelectorAll('.hmx-item').forEach(row=>{
    const idx=+row.dataset.idx;
    row.querySelector('.hmx-name').addEventListener('input',e2=>{ hamburgerMaterialize()[idx].name=e2.target.value; save(true); });
    row.querySelector('.hmx-name').addEventListener('change',snapshot);
    row.querySelector('.hmx-link').addEventListener('change',e2=>{ hamburgerMaterialize()[idx].link=e2.target.value; save(true); snapshot(); });
    row.querySelector('.hmx-up').addEventListener('click',()=>{ const a=hamburgerMaterialize(); if(idx>0){ [a[idx-1],a[idx]]=[a[idx],a[idx-1]]; save(true); snapshot(); refreshHambMenu(); } });
    row.querySelector('.hmx-down').addEventListener('click',()=>{ const a=hamburgerMaterialize(); if(idx<a.length-1){ [a[idx+1],a[idx]]=[a[idx],a[idx+1]]; save(true); snapshot(); refreshHambMenu(); } });
    row.querySelector('.hmx-del').addEventListener('click',()=>{ const a=hamburgerMaterialize(); a.splice(idx,1); save(true); snapshot(); refreshHambMenu(); });
  });
  panel.querySelector('#hmx-add').addEventListener('click',()=>{ const a=hamburgerMaterialize(); const r=roots[0]; a.push({name:r?r.name:'새 메뉴', link:r?r.id:''}); save(true); snapshot(); refreshHambMenu(); });
  return panel;
}
// 텍스트 autofit — 상자에 넘치면 글자 크기를 줄여 맞춤(저장값은 최대치 유지)
function fitTextNode(node,e){
  if(!node||e.type!=='text'||!e.autofit) return;
  const inner=node.querySelector('.inner'); if(!inner) return;
  const boxH=e.h-8;
  let size=e.fontSize; inner.style.fontSize=size+'px';
  let g=0; while(inner.scrollHeight>boxH+1 && size>6 && g<240){ size-=1; inner.style.fontSize=size+'px'; g++; }
}
function applyAutofits(){
  page().elements.forEach(e=>{ if(e.type==='text'&&e.autofit){ const n=canvas.querySelector(`[data-id="${e.id}"]`); if(n) fitTextNode(n,e); } });
}
function elTransform(e){
  let t='';
  if(e.rot) t+=`rotate(${e.rot}deg)`;
  if(e.flipH) t+=' scaleX(-1)';
  if(e.flipV) t+=' scaleY(-1)';
  return t.trim();
}
function elStyleCommon(node,e){
  node.style.left=e.x+'px'; node.style.top=e.y+'px';
  node.style.width=e.w+'px'; node.style.height=e.h+'px';
  node.style.transform = elTransform(e);
}
function renderEl(e){
  const node = document.createElement('div');
  node.className = 'el '+e.type + (e.id===selId?' selected':(selIds.has(e.id)?' multi-sel':''));
  node.dataset.id = e.id;
  elStyleCommon(node,e);
  if(e.type==='text'){
    const va=e.valign||'middle';
    node.style.alignItems = va==='top'?'flex-start':va==='bottom'?'flex-end':'center';
    node.style.justifyContent = e.align==='left'?'flex-start':e.align==='right'?'flex-end':e.align==='justify'?'stretch':'center';
    const inner = document.createElement('div');
    inner.className='inner';
    applyTextStyle(inner, e);
    setTextInner(inner, e, false);
    node.appendChild(inner);
  }else if(e.type==='image'){
    const img = document.createElement('img');
    img.src = e.src;
    img.style.objectFit = e.fit;
    node.style.overflow='hidden';
    node.style.borderRadius = e.clip==='circle'? '50%' : (e.radius+'px');
    if(e.borderW>0){ node.style.border = `${e.borderW}px solid ${e.borderColor}`; }
    if(e.shadow) node.style.boxShadow = SHADOW_CSS;
    node.appendChild(img);
    if(e.fx && e.fx.type==='slider') buildSliderOverlay(node,e);
  }else if(e.type==='shape'){
   if(e.shape==='line'||e.shape==='line-arrow'){
    const col=e.fill||'#333333', lw=Math.max(1,e.borderW||4);
    const bar=document.createElement('div');
    bar.style.cssText=`position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);height:${lw}px;background:${col}`;
    node.appendChild(bar);
    if(e.shape==='line-arrow'){ const s=Math.max(7,lw*2.4); const ah=document.createElement('div'); ah.style.cssText=`position:absolute;right:0;top:50%;transform:translateY(-50%);width:0;height:0;border-top:${s}px solid transparent;border-bottom:${s}px solid transparent;border-left:${s*1.5}px solid ${col}`; node.appendChild(ah); }
   } else {
    // 도형 채움/윤곽 (클립 적용) — 텍스트와 분리
    const bg=document.createElement('div');
    bg.style.position='absolute'; bg.style.inset='0';
    const _fc=fillCss(e.fill, e.fillOpacity);
    bg.style.background=_fc.bg; if(_fc.layerOp!=null) bg.style.opacity=_fc.layerOp;
    const clip=shapeClipOf(e);
    if(clip){ bg.style.clipPath=clip; if(e.shadow) bg.style.filter='drop-shadow(3px 4px 6px rgba(0,0,0,.3))'; }
    else { bg.style.borderRadius=(e.shape==='circle'?'50%':(e.radius+'px')); if(e.borderW>0) bg.style.border=`${e.borderW}px solid ${e.borderColor}`; if(e.shadow) bg.style.boxShadow=SHADOW_CSS; }
    node.appendChild(bg);
    // 도형 안 텍스트 (클립 영향 안 받는 별도 레이어)
    const sva=e.stValign||'middle', sal=e.stAlign||'center';
    const tl=document.createElement('div');
    tl.className='shape-textlayer';
    tl.style.cssText='position:absolute;inset:0;display:flex;overflow:hidden;padding:8px;box-sizing:border-box;pointer-events:none';
    tl.style.alignItems = sva==='top'?'flex-start':sva==='bottom'?'flex-end':'center';
    tl.style.justifyContent = sal==='left'?'flex-start':sal==='right'?'flex-end':'center';
    const inner=document.createElement('div');
    inner.className='inner';
    inner.style.fontFamily=`'${e.stFont||'Noto Sans KR'}',sans-serif`;
    inner.style.fontWeight=e.stWeight||700;
    inner.style.fontSize=(e.stSize||28)+'px';
    inner.style.color=e.stColor||'#ffffff';
    inner.style.textAlign=sal; inner.style.width='100%'; inner.style.lineHeight='1.25'; inner.style.whiteSpace='pre-wrap';
    inner.textContent=e.stext||'';
    tl.appendChild(inner); node.appendChild(tl);
   }
  }
  if(e.type==='table'){
    node.style.overflow='visible'; node.style.position='absolute';
    if(!e.colWidths||e.colWidths.length!==e.cols){ e.colWidths=Array(e.cols).fill(Math.round(e.w/e.cols)); }
    if(!e.rowHeights||e.rowHeights.length!==e.rows){ e.rowHeights=Array(e.rows).fill(Math.round(e.h/e.rows)); }
    // colWidths/rowHeights 합을 e.w/e.h에 정규화
    const cwSum=e.colWidths.reduce((a,b)=>a+b,0);
    if(cwSum>0&&cwSum!==e.w){ const s=e.w/cwSum; e.colWidths=e.colWidths.map((v,i,a)=>i<a.length-1?Math.round(v*s):0); e.colWidths[e.colWidths.length-1]=e.w-e.colWidths.slice(0,-1).reduce((a,b)=>a+b,0); }
    const rhSum=e.rowHeights.reduce((a,b)=>a+b,0);
    if(rhSum>0&&rhSum!==e.h){ const s=e.h/rhSum; e.rowHeights=e.rowHeights.map((v,i,a)=>i<a.length-1?Math.round(v*s):0); e.rowHeights[e.rowHeights.length-1]=e.h-e.rowHeights.slice(0,-1).reduce((a,b)=>a+b,0); }
    // 둥근 모서리: 래퍼가 표를 클리핑(node는 핸들 때문에 overflow:visible 유지)
    const wrap=document.createElement('div');
    wrap.style.cssText=`position:absolute;inset:0;overflow:hidden${e.radius?`;border-radius:${e.radius}px`:''}`;
    const tbl=document.createElement('table');
    tbl.style.cssText=`width:100%;height:100%;border-collapse:collapse;table-layout:fixed;cursor:default;font-family:'${e.fontFamily||'Noto Sans KR'}',sans-serif;font-size:${e.fontSize||14}px`;
    const cg=document.createElement('colgroup');
    e.colWidths.forEach(w=>{ const col=document.createElement('col'); col.style.width=(w/e.w*100)+'%'; cg.appendChild(col); });
    tbl.appendChild(cg);
    const cellMap={};
    (e.cells||[]).forEach(c=>{ cellMap[c.r+'_'+c.c]=c; });
    for(let r=0;r<e.rows;r++){
      const tr=document.createElement('tr');
      tr.style.height=(e.rowHeights[r]/e.h*100)+'%';
      for(let c=0;c<e.cols;c++){
        const cell=cellMap[r+'_'+c]||{};
        if(cell.merged) continue;
        const td=document.createElement('td');
        const isHead=r===0;
        if(cell.span){ td.rowSpan=cell.span.rs; td.colSpan=cell.span.cs; }
        td.style.cssText=`cursor:default;${_tblBorderCss(e,cell)};padding:4px 8px;background:${cell.bg||(isHead?(e.headerBg||'#4a5568'):(e.cellBg||'#fff'))};color:${cell.color||(isHead?(e.headerColor||'#fff'):(e.cellColor||'#333'))};font-weight:${isHead?(e.headerWeight||700):(e.fontWeight||400)};text-align:${cell.align||'center'};vertical-align:middle;overflow:hidden;text-overflow:ellipsis`;
        td.textContent=cell.text||'';
        td.dataset.row=r; td.dataset.col=c;
        if(_tblInSel(e.id,r,c)) td.style.boxShadow=_TBL_HL;
        tr.appendChild(td);
      }
      tbl.appendChild(tr);
    }
    wrap.appendChild(tbl); node.appendChild(wrap);
    // column resize handles — px 기준으로 정확히 배치
    let cx=0;
    for(let c=0;c<e.cols-1;c++){
      cx+=e.colWidths[c];
      const h=document.createElement('div');
      h.dataset.tblColResize=c;
      h.style.cssText=`position:absolute;top:0;height:100%;width:10px;left:${cx}px;transform:translateX(-5px);cursor:col-resize;z-index:20;pointer-events:auto`;
      node.appendChild(h);
    }
    // row resize handles — px 기준으로 정확히 배치
    let ry=0;
    for(let r=0;r<e.rows-1;r++){
      ry+=e.rowHeights[r];
      const h=document.createElement('div');
      h.dataset.tblRowResize=r;
      h.style.cssText=`position:absolute;left:0;width:100%;height:10px;top:${ry}px;transform:translateY(-5px);cursor:row-resize;z-index:20;pointer-events:auto`;
      node.appendChild(h);
    }
  }
  if(e.link){ const b=document.createElement('div'); b.className='link-badge'; b.textContent='🔗'; b.title='링크: '+((pageById(e.link)||{}).name||''); node.appendChild(b); }
  if(e.fx && e.fx.type){ const b=document.createElement('div'); b.className='fx-badge'; b.textContent=(FX_ICONS[e.fx.type]||'✨'); b.title='이펙트: '+(FX_NAMES[e.fx.type]||e.fx.type); node.appendChild(b); }
  node.addEventListener('mousedown', ev=>{
    if(e.type==='table'){
      const colH=ev.target.dataset.tblColResize, rowH=ev.target.dataset.tblRowResize;
      if(colH!=null){ ev.stopPropagation(); ev.preventDefault(); startTblColResize(ev,e,+colH); return; }
      if(rowH!=null){ ev.stopPropagation(); ev.preventDefault(); startTblRowResize(ev,e,+rowH); return; }
      // 표가 이미 선택된 상태에서 셀을 누르면 → 셀 범위선택(드래그). 표 이동은 빈 곳 클릭 후 다시 드래그.
      if(selId===e.id && ev.button===0 && ev.target.closest('td')){ startTblCellSelect(ev,e); return; }
    }
    startDrag(ev,e);
  });
  node.addEventListener('dblclick', ev=>{ if(e.type==='text'||e.type==='shape') startEdit(node,e); else if(e.type==='table') startTableEdit(node,e,ev); });
  node.addEventListener('contextmenu', ev=>{ ev.preventDefault(); selId=e.id; renderCanvas(); renderProps(); if(e.type==='table') showTableCtx(ev.clientX, ev.clientY, e, ev); else showLinkMenu(ev.clientX, ev.clientY, e); });
  return node;
}

// ───────────────────────── 선택 핸들 ─────────────────────────
function addHandles(node,e){
  if(!node) return;
  ['nw','ne','sw','se','n','s','w','e','rot'].forEach(pos=>{
    const h=document.createElement('div'); h.className='handle '+pos;
    h.addEventListener('mousedown', ev=>{ ev.stopPropagation(); if(pos==='rot') startRotate(ev,e); else startResize(ev,e,pos); });
    node.appendChild(h);
  });
  addAdjustHandles(node,e);
}
function _mkYellow(){ const h=document.createElement('div'); h.className='handle adj'; return h; }
function addAdjustHandles(node,e){
  if(e.type!=='shape') return;
  // 둥근 직사각형 모서리 반경
  if(e.shape==='rrect'||e.shape==='rect'){
    const maxR=Math.floor(Math.min(e.w,e.h)/2);
    const r=Math.max(0,Math.min(e.radius||0,maxR));
    const h=_mkYellow(); h.style.left=(_clamp(r,8,e.w-8)-6)+'px'; h.style.top='-6px'; h.title='모서리 둥글기';
    h.addEventListener('mousedown',ev=>{ ev.stopPropagation(); startAdjust(ev,e,(lx)=>{ e.radius=Math.round(_clamp(lx,0,maxR)); }); });
    node.appendChild(h);
  }
  const c=SHAPE_ADJ[e.shape]; if(!c) return;
  const a=adjOf(e);
  c.handles.forEach(hd=>{
    const hx=hd.hx(a)*e.w, hy=hd.hy(a)*e.h;
    const h=_mkYellow(); h.style.left=(hx-6)+'px'; h.style.top=(hy-6)+'px'; h.title='모양 조절';
    h.addEventListener('mousedown',ev=>{ ev.stopPropagation();
      startAdjust(ev,e,(lx,ly)=>{ e.adj=Object.assign({},adjOf(e)); hd.set(e.adj, lx/e.w, ly/e.h); });
    });
    node.appendChild(h);
  });
}
let adjDrag=null;
function startAdjust(ev,e,apply){
  ev.preventDefault();
  const rect=canvas.getBoundingClientRect();
  adjDrag=true;
  function mv(ev2){
    const lx=(ev2.clientX-rect.left)/zoom - e.x, ly=(ev2.clientY-rect.top)/zoom - e.y;
    apply(lx,ly);
    const node=canvas.querySelector(`[data-id="${e.id}"]`);
    if(node){ const fresh=renderEl(e); node.replaceWith(fresh); addHandles(canvas.querySelector(`[data-id="${e.id}"]`),e); }
    renderPages(); save(true);
  }
  function up(){ window.removeEventListener('mousemove',mv); window.removeEventListener('mouseup',up); adjDrag=null; snapshot(); }
  window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up);
}

// ───────── 슬라이더 화살표/점 — 캔버스 직접편집(드래그=위치, 핸들=크기, 우클릭=색·모양) ─────────
function _slFx(e){ if(!e.fx) e.fx={}; return e.fx; }
function _slLocal(ev,e){ const r=canvas.getBoundingClientRect(); return { x:(ev.clientX-r.left)/zoom - e.x, y:(ev.clientY-r.top)/zoom - e.y }; }
function _slRerender(e){ const old=canvas.querySelector(`[data-id="${e.id}"]`); if(old){ const fresh=renderEl(e); old.replaceWith(fresh); if(e.id===selId) addHandles(canvas.querySelector(`[data-id="${e.id}"]`),e); } }
function _slDragLoop(mv){ function up(){ window.removeEventListener('mousemove',mv); window.removeEventListener('mouseup',up); snapshot(); } window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up); }
function buildSliderOverlay(node,e){
  const SV=(window.SiteRender&&SiteRender.slStyleVars)?SiteRender.slStyleVars(e.fx||{}):null; if(!SV||!SV.raw) return;
  const r=SV.raw, sel=(e.id===selId);
  const slides=[e.src].concat((e.fx&&e.fx.slides)||[]);
  node.style.overflow='hidden';
  if(SV.arrows){
    [[true,r.prev],[false,r.next]].forEach(([isLeft,glyph])=>{
      const b=document.createElement('div');
      b.style.cssText=`position:absolute;top:${r.arrY}%;${isLeft?'left':'right'}:${r.arrGap}px;transform:translateY(-50%);width:${r.arrSize}px;height:${r.arrSize}px;background:${r.arrBg};color:${r.arrColor};border-radius:${r.arrRadius};display:flex;align-items:center;justify-content:center;font-size:${Math.round(r.arrSize*0.58)}px;line-height:1;z-index:12;box-sizing:border-box;${sel?'cursor:move;outline:1.5px solid var(--accent)':'pointer-events:none'}`;
      b.textContent=glyph;
      if(sel){
        b.addEventListener('mousedown',ev=>{ ev.stopPropagation(); startArrowDrag(ev,e,isLeft); });
        b.addEventListener('contextmenu',ev=>{ ev.preventDefault(); ev.stopPropagation(); openSliderPartPopup('arrow',e,ev.clientX,ev.clientY); });
        const h=document.createElement('div'); h.style.cssText='position:absolute;right:1px;bottom:1px;width:11px;height:11px;background:var(--accent);border:1.5px solid #fff;border-radius:50%;cursor:nwse-resize;z-index:13';
        h.addEventListener('mousedown',ev=>{ ev.stopPropagation(); startArrowResize(ev,e); });
        b.appendChild(h);
      }
      node.appendChild(b);
    });
  }
  if(SV.dots && slides.length>1){
    const wrap=document.createElement('div');
    wrap.style.cssText=`position:absolute;bottom:${r.dotBottom}px;left:${r.dotX}%;transform:translateX(-50%);display:flex;gap:${r.dotGap}px;z-index:12;padding:3px;${sel?'cursor:move;outline:1.5px solid var(--accent)':'pointer-events:none'}`;
    slides.forEach((_,i)=>{ const d=document.createElement('div'); d.style.cssText=`width:${r.dotW}px;height:${r.dotH}px;border-radius:${r.dotRadius};background:${i===0?r.dotOn:r.dotColor}`; wrap.appendChild(d); });
    if(sel){
      wrap.addEventListener('mousedown',ev=>{ ev.stopPropagation(); startDotsDrag(ev,e); });
      wrap.addEventListener('contextmenu',ev=>{ ev.preventDefault(); ev.stopPropagation(); openSliderPartPopup('dot',e,ev.clientX,ev.clientY); });
      const h=document.createElement('div'); h.style.cssText='position:absolute;right:-1px;bottom:-1px;width:11px;height:11px;background:var(--accent);border:1.5px solid #fff;border-radius:50%;cursor:nwse-resize;z-index:13';
      h.addEventListener('mousedown',ev=>{ ev.stopPropagation(); startDotsResize(ev,e); });
      wrap.appendChild(h);
    }
    node.appendChild(wrap);
  }
}
function startArrowDrag(ev,e,isLeft){ ev.preventDefault(); const fx=_slFx(e), sz=+(fx.arrowSize||38);
  _slDragLoop(ev2=>{ const p=_slLocal(ev2,e);
    fx.arrowGap=Math.round(_clamp((isLeft?p.x:(e.w-p.x))-sz/2, 0, e.w/2-10));
    fx.arrowY=Math.round(_clamp(p.y/e.h*100, 4, 96));
    _slRerender(e); save(true); }); }
function startArrowResize(ev,e){ ev.preventDefault(); const fx=_slFx(e), s0=+(fx.arrowSize||38), st=_slLocal(ev,e);
  _slDragLoop(ev2=>{ const p=_slLocal(ev2,e); const d=((p.x-st.x)+(p.y-st.y))/2; fx.arrowSize=Math.round(_clamp(s0+d,16,140)); _slRerender(e); save(true); }); }
function startDotsDrag(ev,e){ ev.preventDefault(); const fx=_slFx(e);
  _slDragLoop(ev2=>{ const p=_slLocal(ev2,e);
    fx.dotX=Math.round(_clamp(p.x/e.w*100, 4, 96));
    fx.dotBottom=Math.round(_clamp(e.h-p.y, 2, e.h-10));
    _slRerender(e); save(true); }); }
function startDotsResize(ev,e){ ev.preventDefault(); const fx=_slFx(e), s0=+(fx.dotSize||9), st=_slLocal(ev,e);
  _slDragLoop(ev2=>{ const p=_slLocal(ev2,e); const d=((p.x-st.x)+(p.y-st.y))/2; fx.dotSize=Math.round(_clamp(s0+d,4,44)); _slRerender(e); save(true); }); }
function openSliderPartPopup(part,e,x,y){
  document.getElementById('sl-popup')?.remove();
  const fx=_slFx(e);
  const pop=document.createElement('div'); pop.id='sl-popup';
  pop.style.cssText=`position:fixed;left:${Math.min(x,innerWidth-220)}px;top:${Math.min(y,innerHeight-260)}px;z-index:99999;background:var(--panel,#fff);color:var(--text,#222);border:1px solid var(--border,#ccc);border-radius:10px;box-shadow:0 10px 34px rgba(0,0,0,.28);padding:10px 12px;min-width:200px;font-size:12px`;
  pop.addEventListener('mousedown',ev=>ev.stopPropagation());
  pop.addEventListener('contextmenu',ev=>ev.preventDefault());
  const row=(lbl,inner)=>`<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin:6px 0"><span style="color:var(--sub,#777)">${lbl}</span>${inner}</div>`;
  const shapeBtns=(id,opts,cur)=>`<span id="${id}" style="display:flex;gap:3px;flex-wrap:wrap;justify-content:flex-end">`+opts.map(o=>`<button data-v="${o[0]}" style="min-width:26px;padding:2px 7px;border-radius:6px;border:1px solid var(--border,#ccc);background:${cur===o[0]?'var(--accent)':'transparent'};color:${cur===o[0]?'#fff':'inherit'};cursor:pointer">${o[1]}</button>`).join('')+`</span>`;
  // PPT 색상 팝업과 동일한 스와치 버튼(.panel-cbtn) — 전역 핸들러가 toggleColorPopup 처리
  const swatch=(key,col)=>`<button type="button" class="panel-cbtn" data-cpkey="${key}" title="색 선택"><span style="background:${col||'#ffffff'}"></span></button>`;
  if(part==='arrow'){
    pop.innerHTML=`<div style="font-weight:700;margin-bottom:6px">◀▶ 화살표</div>`
      +row('배경색',swatch('slArrowBg',fx.arrowBg||'#000000'))
      +row('아이콘색',swatch('slArrowColor',fx.arrowColor||'#ffffff'))
      +row('크기',`<input type="number" id="slp-asize" value="${fx.arrowSize||38}" min="16" max="140" style="width:62px">`)
      +row('배경모양',shapeBtns('slp-ashape',[['circle','●'],['square','■'],['none','없음']],fx.arrowShape||'circle'))
      +row('화살표',shapeBtns('slp-aglyph',[['chevron','‹ ›'],['triangle','◀ ▶'],['arrow','← →'],['double','« »'],['angle','〈 〉']],fx.arrowGlyph||'chevron'))
      +row('표시',`<button id="slp-ashow" style="padding:2px 9px;border-radius:6px;border:1px solid var(--border,#ccc);cursor:pointer">${fx.arrows!==false?'켜짐':'꺼짐'}</button>`);
  } else {
    pop.innerHTML=`<div style="font-weight:700;margin-bottom:6px">● 점</div>`
      +row('기본색',swatch('slDotColor',fx.dotColor||'#ffffff'))
      +row('활성색',swatch('slDotOn',fx.dotActiveColor||'#ffffff'))
      +row('크기',`<input type="number" id="slp-dsize" value="${fx.dotSize||9}" min="4" max="44" style="width:62px">`)
      +row('모양',shapeBtns('slp-dshape',[['circle','●'],['square','■'],['bar','▬']],fx.dotShape||'circle'))
      +row('표시',`<button id="slp-dshow" style="padding:2px 9px;border-radius:6px;border:1px solid var(--border,#ccc);cursor:pointer">${fx.dots!==false?'켜짐':'꺼짐'}</button>`);
  }
  document.body.appendChild(pop);
  const apply=()=>{ _slRerender(e); save(true); };
  const wireNum=(id,key)=>{ const el=pop.querySelector('#'+id); if(el) el.addEventListener('input',()=>{ fx[key]=parseInt(el.value)||0; apply(); }); el&&el.addEventListener('change',()=>snapshot()); };
  const wireShape=(id,key)=>{ const sp=pop.querySelector('#'+id); if(sp) sp.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{ fx[key]=b.dataset.v; sp.querySelectorAll('button').forEach(o=>{o.style.background='transparent';o.style.color='inherit';}); b.style.background='var(--accent)'; b.style.color='#fff'; apply(); snapshot(); })); };
  const wireShow=(id,key)=>{ const b=pop.querySelector('#'+id); if(b) b.addEventListener('click',()=>{ fx[key]=(fx[key]===false); b.textContent=fx[key]!==false?'켜짐':'꺼짐'; apply(); snapshot(); }); };
  if(part==='arrow'){ wireNum('slp-asize','arrowSize'); wireShape('slp-ashape','arrowShape'); wireShape('slp-aglyph','arrowGlyph'); wireShow('slp-ashow','arrows'); }
  else { wireNum('slp-dsize','dotSize'); wireShape('slp-dshape','dotShape'); wireShow('slp-dshow','dots'); }
  // 바깥 클릭 시 닫되, PPT 색상 팝업(#fill-dd) 사용 중엔 유지
  const closer=ev=>{ if(!ev.target.closest('#sl-popup') && !ev.target.closest('#fill-dd')){ pop.remove(); document.removeEventListener('mousedown',closer); } };
  setTimeout(()=>document.addEventListener('mousedown',closer),0);
}

// ───────── 고정탭(플로팅 탭) ─────────
// 기능 전체가 public/editor-fixtab.js로 분리됨(상호 import). 상단 import 참조.

// 그룹/다중선택 전체를 감싸는 프레임 + 통째 크기조절 핸들
function addGroupFrame(){
  const arr=selAll(); if(arr.length<2) return;
  const x0=Math.min(...arr.map(e=>e.x)),y0=Math.min(...arr.map(e=>e.y)),x1=Math.max(...arr.map(e=>e.x+e.w)),y1=Math.max(...arr.map(e=>e.y+e.h));
  const f=document.createElement('div'); f.id='sel-frame';
  f.dataset.fx=x0; f.dataset.fy=y0;
  f.style.cssText=`position:absolute;left:${x0}px;top:${y0}px;width:${x1-x0}px;height:${y1-y0}px;border:1.5px dashed var(--accent);pointer-events:none;z-index:60;box-sizing:border-box`;
  ['nw','ne','sw','se','n','s','w','e'].forEach(pos=>{
    const h=document.createElement('div'); h.className='handle '+pos; h.style.pointerEvents='auto';
    h.addEventListener('mousedown',ev=>{ ev.stopPropagation(); startGroupResize(ev,pos,{x:x0,y:y0,w:x1-x0,h:y1-y0}); });
    f.appendChild(h);
  });
  canvas.appendChild(f);
}
let grez=null;
function startGroupResize(ev,pos,bb){
  ev.preventDefault();
  const arr=selAll(); const t=_snapTargets();
  grez={ pos, sx:ev.clientX, sy:ev.clientY, bb, snapX:t.sxT, snapY:t.syT,
    items: arr.map(e=>({e, ox:e.x, oy:e.y, ow:e.w, oh:e.h, of:e.fontSize, os:e.stSize})) };
  window.addEventListener('mousemove',onGroupResize);
  window.addEventListener('mouseup',endGroupResize);
}
function onGroupResize(ev){
  if(!grez) return;
  const dx=(ev.clientX-grez.sx)/zoom, dy=(ev.clientY-grez.sy)/zoom;
  const {pos,bb}=grez;
  let nw=bb.w, nh=bb.h;
  if(pos.includes('e')) nw=Math.max(20,bb.w+dx);
  if(pos.includes('w')) nw=Math.max(20,bb.w-dx);
  if(pos.includes('s')) nh=Math.max(20,bb.h+dy);
  if(pos.includes('n')) nh=Math.max(20,bb.h-dy);
  if(ev.shiftKey && pos.length===2){ const s=Math.max(nw/bb.w,nh/bb.h); nw=bb.w*s; nh=bb.h*s; }
  let nx=bb.x, ny=bb.y;
  if(pos.includes('w')) nx=bb.x+bb.w-nw;
  if(pos.includes('n')) ny=bb.y+bb.h-nh;
  // 가장자리 스냅 (Alt/Shift 아닐 때)
  let gx=null, gy=null;
  if(!ev.altKey && !ev.shiftKey){
    const SNAP=6;
    if(pos.includes('e')){ const t=_nearest(nx+nw,grez.snapX,SNAP); if(t!=null){ nw=Math.max(20,t-nx); gx=t; } }
    if(pos.includes('w')){ const t=_nearest(nx,grez.snapX,SNAP); if(t!=null){ nw=Math.max(20,nw+(nx-t)); nx=t; gx=t; } }
    if(pos.includes('s')){ const t=_nearest(ny+nh,grez.snapY,SNAP); if(t!=null){ nh=Math.max(20,t-ny); gy=t; } }
    if(pos.includes('n')){ const t=_nearest(ny,grez.snapY,SNAP); if(t!=null){ nh=Math.max(20,nh+(ny-t)); ny=t; gy=t; } }
  }
  const sx2=nw/bb.w, sy2=nh/bb.h, fScale=(sx2+sy2)/2;
  grez.items.forEach(it=>{
    it.e.x=Math.round(nx+(it.ox-bb.x)*sx2);
    it.e.y=Math.round(ny+(it.oy-bb.y)*sy2);
    it.e.w=Math.max(8,Math.round(it.ow*sx2));
    it.e.h=Math.max(8,Math.round(it.oh*sy2));
    if(it.e.type==='text'&&it.of) it.e.fontSize=Math.max(6,Math.round(it.of*fScale));
    if(it.e.type==='shape'&&it.os) it.e.stSize=Math.max(6,Math.round(it.os*fScale));
    const node=canvas.querySelector(`[data-id="${it.e.id}"]`); if(node) elStyleCommon(node,it.e);
  });
  const f=document.getElementById('sel-frame'); if(f){ f.style.left=nx+'px'; f.style.top=ny+'px'; f.style.width=nw+'px'; f.style.height=nh+'px'; f.dataset.fx=nx; f.dataset.fy=ny; }
  showGuides(gx,gy);
  const pr=el(selId); if(pr) syncPosInputs(pr);
}
function endGroupResize(){ window.removeEventListener('mousemove',onGroupResize); window.removeEventListener('mouseup',endGroupResize); hideGuides(); if(grez){ grez=null; afterMutate(); } }

// ───────────────────────── 드래그/리사이즈/회전 ─────────────────────────
let drag=null;
let _lastClickId=null, _lastClickT=0; // 수동 더블클릭(편집) 감지용
function startDrag(ev,e){
  if(ev.button!==0) return;
  if(ev.target.classList.contains('handle')) return;
  if(document.querySelector('.el.editing')) return;
  ev.preventDefault();

  // 수동 더블클릭 감지 (renderCanvas 노드 재생성과 무관)
  const _now=Date.now();
  if(_lastClickId===e.id && (_now-_lastClickT)<400){
    _lastClickId=null;
    // ① 그룹 멤버인데 아직 멤버 단독선택이 아니면 → 그룹 안으로 진입(그 멤버만 선택)
    if(e.groupId && !(selIds.size===1 && selId===e.id)){
      selIds=new Set([e.id]); selId=e.id;
      renderCanvas(); renderProps(); updateRibbonState();
      toast('그룹 안 개체 선택 — 빈 곳 클릭하면 빠져나갑니다');
      return;
    }
    // ② 텍스트/도형 → 글자 편집
    if(e.type==='text'||e.type==='shape'){
      const node=canvas.querySelector(`[data-id="${e.id}"]`);
      if(node){ startEdit(node,e); return; }
    }
    return;
  }
  _lastClickId=e.id; _lastClickT=_now;

  // Ctrl/Meta 클릭 → 토글 선택
  if(ev.ctrlKey||ev.metaKey){
    if(selIds.has(e.id)){ selIds.delete(e.id); if(selId===e.id) selId=selIds.size>0?[...selIds].at(-1):null; }
    else { selIds.add(e.id); selId=e.id; }
    renderCanvas(); renderProps(); updateRibbonState(); return;
  }
  // Shift 클릭 → 추가 선택
  if(ev.shiftKey){
    selIds.add(e.id); selId=e.id;
    renderCanvas(); renderProps(); updateRibbonState(); return;
  }
  // 일반 클릭: 선택 안 된 요소면 단독 선택 (그룹이면 그룹 전체)
  if(!selIds.has(e.id)){
    if(e.groupId) selIds=new Set(page().elements.filter(x=>x.groupId===e.groupId).map(x=>x.id));
    else selIds=new Set([e.id]);
    selId=e.id;
    renderCanvas(); renderProps(); updateRibbonState();
  } else {
    selId=e.id; // 이미 선택된 것 중 primary 변경
  }

  // 드래그 시작 — 선택된 모든 요소의 초기 위치 저장
  const init={};
  for(const id of selIds){ const e2=el(id); if(e2) init[id]={ox:e2.x,oy:e2.y}; }
  // 스마트 가이드용: 이동 선택의 bbox + 다른 개체/페이지의 스냅선
  const selEls=selAll();
  const bx0=Math.min(...selEls.map(e=>e.x)),by0=Math.min(...selEls.map(e=>e.y)),bx1=Math.max(...selEls.map(e=>e.x+e.w)),by1=Math.max(...selEls.map(e=>e.y+e.h));
  const sxT=[], syT=[]; const pg=page();
  page().elements.forEach(o=>{ if(selIds.has(o.id))return; sxT.push(o.x,o.x+o.w/2,o.x+o.w); syT.push(o.y,o.y+o.h/2,o.y+o.h); });
  sxT.push(0,pg.w/2,pg.w); syT.push(0,pg.h/2,pg.h);
  drag={ sx:ev.clientX, sy:ev.clientY, els:init, bboxOrig:{x:bx0,y:by0,w:bx1-bx0,h:by1-by0}, snapX:sxT, snapY:syT };
  window.addEventListener('mousemove', onDrag);
  window.addEventListener('mouseup', endDrag);
}
function onDrag(ev){
  if(!drag) return;
  let dx=(ev.clientX-drag.sx)/zoom, dy=(ev.clientY-drag.sy)/zoom;
  // 스마트 가이드 스냅 (Alt 누르면 잠시 끔)
  let gx=null, gy=null, spacingMarks=[];
  if(!ev.altKey && drag.bboxOrig){
    const SNAP=6, bo=drag.bboxOrig;
    let bx=bo.x+dx, by=bo.y+dy;
    const candX=[bx, bx+bo.w/2, bx+bo.w]; let bd=SNAP+.01, off=0;
    drag.snapX.forEach(t=>candX.forEach(c=>{ const d=Math.abs(c-t); if(d<bd){ bd=d; off=t-c; gx=t; } }));
    if(bd<=SNAP) dx+=off; else gx=null;
    const candY=[by, by+bo.h/2, by+bo.h]; let bdy=SNAP+.01, offy=0;
    drag.snapY.forEach(t=>candY.forEach(c=>{ const d=Math.abs(c-t); if(d<bdy){ bdy=d; offy=t-c; gy=t; } }));
    if(bdy<=SNAP) dy+=offy; else gy=null;
    // 균등 간격 가이드 (정렬 스냅이 없는 축에서만)
    bx=bo.x+dx; by=bo.y+dy;
    if(gx==null){ const r=_equalSpaceX(bx,by,bo.w,bo.h); if(r){ dx+=r.off; spacingMarks.push(...r.marks); } }
    bx=bo.x+dx; by=bo.y+dy;
    if(gy==null){ const r=_equalSpaceY(bx,by,bo.w,bo.h); if(r){ dy+=r.off; spacingMarks.push(...r.marks); } }
  }
  for(const [id,{ox,oy}] of Object.entries(drag.els)){
    const e2=el(id); if(!e2) continue;
    e2.x=Math.round(ox+dx); e2.y=Math.round(oy+dy);
    const node=canvas.querySelector(`[data-id="${id}"]`);
    if(node){ node.style.left=e2.x+'px'; node.style.top=e2.y+'px'; }
  }
  const f=document.getElementById('sel-frame'); if(f){ f.style.left=(parseFloat(f.dataset.fx)+dx)+'px'; f.style.top=(parseFloat(f.dataset.fy)+dy)+'px'; }
  showGuides(gx,gy); showSpacing(spacingMarks);
  const primary=el(selId); if(primary) syncPosInputs(primary);
}
// 균등 간격 감지 — 양옆/위아래 이웃 사이에 끼어 간격이 같아질 때
function _equalSpaceX(bx,by,bw,bh){
  const ov=page().elements.filter(o=>!selIds.has(o.id) && Math.min(by+bh,o.y+o.h)-Math.max(by,o.y)>4);
  let L=null,R=null;
  ov.forEach(o=>{ if(o.x+o.w<=bx+6){ if(!L||o.x+o.w>L.x+L.w) L=o; } });
  ov.forEach(o=>{ if(o.x>=bx+bw-6){ if(!R||o.x<R.x) R=o; } });
  if(!L||!R) return null;
  const lr=L.x+L.w, rl=R.x, space=rl-lr-bw; if(space<0) return null;
  const targetLeft=lr+space/2, off=targetLeft-bx; if(Math.abs(off)>8) return null;
  const gap=Math.round(space/2), cy=Math.round(by+bh/2);
  return {off, marks:[{x1:lr,x2:targetLeft,y:cy,gap},{x1:targetLeft+bw,x2:rl,y:cy,gap}]};
}
function _equalSpaceY(bx,by,bw,bh){
  const ov=page().elements.filter(o=>!selIds.has(o.id) && Math.min(bx+bw,o.x+o.w)-Math.max(bx,o.x)>4);
  let T=null,B=null;
  ov.forEach(o=>{ if(o.y+o.h<=by+6){ if(!T||o.y+o.h>T.y+T.h) T=o; } });
  ov.forEach(o=>{ if(o.y>=by+bh-6){ if(!B||o.y<B.y) B=o; } });
  if(!T||!B) return null;
  const tb=T.y+T.h, bt=B.y, space=bt-tb-bh; if(space<0) return null;
  const targetTop=tb+space/2, off=targetTop-by; if(Math.abs(off)>8) return null;
  const gap=Math.round(space/2), cx=Math.round(bx+bw/2);
  return {off, marks:[{y1:tb,y2:targetTop,x:cx,gap},{y1:targetTop+bh,y2:bt,x:cx,gap}]};
}
function showSpacing(marks){
  let layer=document.getElementById('spacing-layer');
  if(!marks||!marks.length){ if(layer) layer.style.display='none'; return; }
  if(!layer){ layer=document.createElement('div'); layer.id='spacing-layer'; layer.style.cssText='position:absolute;inset:0;pointer-events:none;z-index:71'; canvas.appendChild(layer); }
  layer.style.display='block';
  const C='#ff3b6b';
  layer.innerHTML=marks.map(m=>{
    if(m.x1!=null){
      const x=Math.min(m.x1,m.x2), w=Math.abs(m.x2-m.x1);
      return `<div style="position:absolute;left:${x}px;top:${m.y}px;width:${w}px;height:0;border-top:1.5px solid ${C}"></div>`
        +`<div style="position:absolute;left:${m.x1}px;top:${m.y-5}px;width:0;height:10px;border-left:1.5px solid ${C}"></div>`
        +`<div style="position:absolute;left:${m.x2}px;top:${m.y-5}px;width:0;height:10px;border-left:1.5px solid ${C}"></div>`
        +`<div style="position:absolute;left:${x+w/2-13}px;top:${m.y-19}px;min-width:18px;text-align:center;font-size:11px;color:#fff;background:${C};border-radius:3px;padding:0 4px">${m.gap}</div>`;
    } else {
      const y=Math.min(m.y1,m.y2), hh=Math.abs(m.y2-m.y1);
      return `<div style="position:absolute;top:${y}px;left:${m.x}px;height:${hh}px;width:0;border-left:1.5px solid ${C}"></div>`
        +`<div style="position:absolute;top:${m.y1}px;left:${m.x-5}px;height:0;width:10px;border-top:1.5px solid ${C}"></div>`
        +`<div style="position:absolute;top:${m.y2}px;left:${m.x-5}px;height:0;width:10px;border-top:1.5px solid ${C}"></div>`
        +`<div style="position:absolute;top:${y+hh/2-9}px;left:${m.x+6}px;font-size:11px;color:#fff;background:${C};border-radius:3px;padding:0 4px">${m.gap}</div>`;
    }
  }).join('');
}
function showGuides(gx,gy){
  const pg=page();
  let gv=document.getElementById('guide-v'), gh=document.getElementById('guide-h');
  if(gx!=null){ if(!gv){ gv=document.createElement('div'); gv.id='guide-v'; gv.style.cssText='position:absolute;top:0;width:1px;background:#ff3b6b;pointer-events:none;z-index:70'; canvas.appendChild(gv); } gv.style.left=gx+'px'; gv.style.height=pg.h+'px'; gv.style.display='block'; }
  else if(gv) gv.style.display='none';
  if(gy!=null){ if(!gh){ gh=document.createElement('div'); gh.id='guide-h'; gh.style.cssText='position:absolute;left:0;height:1px;background:#ff3b6b;pointer-events:none;z-index:70'; canvas.appendChild(gh); } gh.style.top=gy+'px'; gh.style.width=pg.w+'px'; gh.style.display='block'; }
  else if(gh) gh.style.display='none';
}
function hideGuides(){ ['guide-v','guide-h','spacing-layer'].forEach(id=>{ const g=document.getElementById(id); if(g) g.style.display='none'; }); }
function endDrag(){ window.removeEventListener('mousemove',onDrag); window.removeEventListener('mouseup',endDrag); hideGuides(); if(drag){drag=null; afterMutate();} }

let rez=null;
function _nearest(v, arr, snap){ let best=null, bd=snap+.01; arr.forEach(t=>{ const d=Math.abs(v-t); if(d<bd){ bd=d; best=t; } }); return best; }
function _snapTargets(){ const sxT=[], syT=[], pg=page(); page().elements.forEach(o=>{ if(selIds.has(o.id))return; sxT.push(o.x,o.x+o.w/2,o.x+o.w); syT.push(o.y,o.y+o.h/2,o.y+o.h); }); sxT.push(0,pg.w/2,pg.w); syT.push(0,pg.h/2,pg.h); return {sxT,syT}; }
function startResize(ev,e,pos){
  ev.preventDefault();
  const t=_snapTargets();
  rez={ id:e.id, pos, sx:ev.clientX, sy:ev.clientY, ox:e.x, oy:e.y, ow:e.w, oh:e.h, snapX:t.sxT, snapY:t.syT };
  window.addEventListener('mousemove', onResize);
  window.addEventListener('mouseup', endResize);
}
function onResize(ev){
  const e=el(rez.id); if(!e) return;
  const dx=(ev.clientX-rez.sx)/zoom, dy=(ev.clientY-rez.sy)/zoom;
  let {ox,oy,ow,oh,pos}=rez;
  let x=ox,y=oy,w=ow,h=oh;
  if(pos.includes('e')) w=Math.max(20,ow+dx);
  if(pos.includes('s')) h=Math.max(20,oh+dy);
  if(pos.includes('w')){ w=Math.max(20,ow-dx); x=ox+(ow-w); }
  if(pos.includes('n')){ h=Math.max(20,oh-dy); y=oy+(oh-h); }
  // 가장자리 스냅 (Alt로 끔)
  let gx=null, gy=null;
  if(!ev.altKey){
    const SNAP=6;
    if(pos.includes('e')){ const t=_nearest(x+w,rez.snapX,SNAP); if(t!=null){ w=Math.max(20,t-x); gx=t; } }
    if(pos.includes('w')){ const t=_nearest(x,rez.snapX,SNAP); if(t!=null){ w=Math.max(20,w+(x-t)); x=t; gx=t; } }
    if(pos.includes('s')){ const t=_nearest(y+h,rez.snapY,SNAP); if(t!=null){ h=Math.max(20,t-y); gy=t; } }
    if(pos.includes('n')){ const t=_nearest(y,rez.snapY,SNAP); if(t!=null){ h=Math.max(20,h+(y-t)); y=t; gy=t; } }
  }
  e.x=Math.round(x); e.y=Math.round(y); e.w=Math.round(w); e.h=Math.round(h);
  const node=canvas.querySelector(`[data-id="${e.id}"]`); elStyleCommon(node,e);
  showGuides(gx,gy);
  syncPosInputs(e);
}
function endResize(){ window.removeEventListener('mousemove',onResize); window.removeEventListener('mouseup',endResize); hideGuides(); if(rez){rez=null; afterMutate();} }

let rot=null;
function startRotate(ev,e){
  ev.preventDefault();
  const node=canvas.querySelector(`[data-id="${e.id}"]`);
  const r=node.getBoundingClientRect();
  rot={ id:e.id, cx:r.left+r.width/2, cy:r.top+r.height/2 };
  window.addEventListener('mousemove', onRotate);
  window.addEventListener('mouseup', endRotate);
}
function onRotate(ev){
  const e=el(rot.id); if(!e) return;
  let a = Math.atan2(ev.clientY-rot.cy, ev.clientX-rot.cx)*180/Math.PI + 90;
  if(ev.shiftKey) a = Math.round(a/15)*15;
  e.rot = Math.round(a);
  const node=canvas.querySelector(`[data-id="${e.id}"]`);
  node.style.transform=elTransform(e);
}
function endRotate(){ window.removeEventListener('mousemove',onRotate); window.removeEventListener('mouseup',endRotate); if(rot){rot=null; afterMutate();} }

// ───────────────────────── 텍스트 인라인 편집 ─────────────────────────
function startEdit(node,e){
  node.classList.add('editing');
  const inner=node.querySelector('.inner');
  const field = e.type==='shape' ? 'stext' : 'text';
  if(e.type==='shape'){ if(inner.parentElement) inner.parentElement.style.pointerEvents='auto'; inner.textContent=e.stext||''; }
  else setTextInner(inner, e, true); // 편집 중엔 원문(글머리/강조 제거)
  inner.style.whiteSpace='pre-wrap';
  inner.contentEditable=true; inner.focus();
  const range=document.createRange(); range.selectNodeContents(inner);
  const sel=window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
  const finish=()=>{
    inner.contentEditable=false; node.classList.remove('editing');
    e[field] = inner.textContent;
    inner.removeEventListener('blur',finish);
    afterMutate();
  };
  inner.addEventListener('blur',finish);
}

// 캔버스 빈 곳 클릭/드래그 → 마퀴 선택
canvas.addEventListener('mousedown', ev=>{
  if(ev.button!==0) return;
  if(_hambOpen){ _hambOpen=false; renderCanvas(); }
  if(ev.target !== canvas && ev.target.id !== 'marquee') return; // 요소 위면 무시
  ev.preventDefault();
  if(!ev.ctrlKey&&!ev.metaKey&&!ev.shiftKey){
    selId=null; selIds=new Set(); clearFixTabSel();
    renderCanvas(); renderProps(); updateRibbonState();
  }
  const marqueeEl=document.getElementById('marquee');
  const cRect=canvas.getBoundingClientRect();
  const sx=(ev.clientX-cRect.left)/zoom, sy=(ev.clientY-cRect.top)/zoom;
  marqueeEl.style.cssText=`position:absolute;border:1.5px dashed var(--accent);background:rgba(108,123,255,.07);pointer-events:none;z-index:200;left:${sx}px;top:${sy}px;width:0;height:0;display:block`;
  function onMM(e){
    const cx=(e.clientX-cRect.left)/zoom, cy=(e.clientY-cRect.top)/zoom;
    const x=Math.min(sx,cx),y=Math.min(sy,cy),w=Math.abs(cx-sx),h=Math.abs(cy-sy);
    marqueeEl.style.left=x+'px'; marqueeEl.style.top=y+'px';
    marqueeEl.style.width=w+'px'; marqueeEl.style.height=h+'px';
  }
  function onMU(e){
    window.removeEventListener('mousemove',onMM); window.removeEventListener('mouseup',onMU);
    marqueeEl.style.display='none';
    const cx=(e.clientX-cRect.left)/zoom, cy=(e.clientY-cRect.top)/zoom;
    const rx=Math.min(sx,cx),ry=Math.min(sy,cy),rw=Math.abs(cx-sx),rh=Math.abs(cy-sy);
    if(rw<4&&rh<4) return; // 너무 작으면 단순 클릭으로 간주 (이미 위에서 해제)
    const hit=new Set();
    for(const e2 of page().elements){
      if(e2.x<rx+rw&&e2.x+e2.w>rx&&e2.y<ry+rh&&e2.y+e2.h>ry) hit.add(e2.id);
    }
    if(ev.ctrlKey||ev.metaKey||ev.shiftKey){ hit.forEach(id=>selIds.add(id)); }
    else { selIds=hit; }
    selIds=withGroups(selIds);
    selId=selIds.size>0?[...selIds].at(-1):null;
    renderCanvas(); renderProps(); updateRibbonState();
  }
  window.addEventListener('mousemove',onMM); window.addEventListener('mouseup',onMU);
});
// stage 여백(스크롤 영역) 클릭 → 선택 해제
document.getElementById('stage').addEventListener('mousedown', ev=>{
  if(ev.target.id==='stage'||ev.target.id==='canvas-wrap'){
    selId=null; selIds=new Set(); renderCanvas(); renderProps(); updateRibbonState();
  }
});

// ───────────────────────── 렌더: 페이지 사이드바 ─────────────────────────
let _dragPage=null;
// 콘텐츠 페이지를 '하단 바(isFooter)' 위에 삽입 (없으면 끝). curPage도 그 페이지로.
function addContentPage(pg){
  let fi=project.pages.findIndex(p=>p.isFooter);
  if(fi<0) fi=project.pages.length;
  project.pages.splice(fi,0,pg);
  curPage=project.pages.indexOf(pg); selId=null; selIds=new Set();
  return pg;
}
function reorderPage(fromId, toId){
  if(!fromId || fromId===toId) return;
  const fi=project.pages.findIndex(p=>p.id===fromId); if(fi<0) return;
  const curId=project.pages[curPage] && project.pages[curPage].id;
  const [moved]=project.pages.splice(fi,1);
  let ti=project.pages.findIndex(p=>p.id===toId); if(ti<0) ti=project.pages.length;
  project.pages.splice(ti,0,moved);  // 대상 앞에 삽입
  if(curId) curPage=project.pages.findIndex(p=>p.id===curId);
  afterMutate();
}
// 현재 디바이스에 표시할 바(상단/하단) 1개 선택 — 발행 pickBar와 동일 우선순위(기기전용 > 공통 > 아무거나)
function barForDevice(isFooterFlag, dev){
  const bars=project.pages.filter(p=> isFooterFlag?p.isFooter:p.isHeader);
  return bars.find(p=>p.device===dev) || bars.find(p=>(p.device||'both')==='both') || bars[0] || null;
}
function renderPages(){
  const list=document.getElementById('page-list'); list.innerHTML='';
  const dt=document.getElementById('dev-toggle'); if(dt) dt.textContent=editorDevice==='mobile'?'📱 모바일':'💻 PC';
  const hdrShown=barForDevice(false, editorDevice), ftrShown=barForDevice(true, editorDevice);
  project.pages.forEach((p,i)=>{
    // 바는 현재 디바이스에 맞는 1개만, 일반 페이지는 device로 거름
    if(p.isHeader){ if(p!==hdrShown) return; }
    else if(p.isFooter){ if(p!==ftrShown) return; }
    else if(!inDevice(p, editorDevice)) return;
    const t=document.createElement('div');
    t.className='page-thumb'+(i===curPage?' active':'')+(p.isHeader||p.isFooter?' is-header':'');
    const dep=pageDepth(p); if(dep>0) t.style.marginLeft=(dep*12)+'px';
    const _pn = p.isHeader ? ('📌 '+escapeHtml(p.name||'상단 바')) : p.isFooter ? ('📎 '+escapeHtml(p.name||'하단 바')) : ((dep>0?'↳ ':'')+escapeHtml(p.name||'페이지'));
    t.innerHTML=`<span class="num">${p.isHeader||p.isFooter?'바':i+1}</span><div class="mini"></div><div class="pname">${_pn}</div>`;
    if(project.pages.length>1){
      const del=document.createElement('button'); del.className='del'; del.textContent='×';
      del.addEventListener('click',ev=>{ ev.stopPropagation(); project.pages.splice(i,1); if(curPage>=project.pages.length)curPage=project.pages.length-1; afterMutate(); });
      t.appendChild(del);
    }
    t.style.width=_thumbW+'px';
    // mini preview
    const mini=t.querySelector('.mini');
    mini.style.width=p.w+'px'; mini.style.height=p.h+'px'; mini.style.background=p.bg;
    const scale = _thumbW/p.w; mini.style.transform=`scale(${scale})`;
    p.elements.forEach(e=>{ const n=renderEl({...e,id:'_'+e.id}); n.style.pointerEvents='none'; n.classList.remove('selected'); mini.appendChild(n); });
    t.addEventListener('click',()=>{ curPage=i; selId=null; selIds=new Set(); renderCanvas(); renderPages(); renderProps(); updateRibbonState(); });
    // 더블클릭 → 이름 인라인 편집
    const pnameEl=t.querySelector('.pname'); pnameEl.title='더블클릭하면 이름 변경';
    pnameEl.addEventListener('dblclick',ev=>{
      ev.stopPropagation();
      t.draggable=false;
      pnameEl.textContent=p.name||'페이지'; pnameEl.contentEditable=true; pnameEl.style.cursor='text'; pnameEl.style.background='var(--panel)'; pnameEl.style.outline='1px solid var(--accent)';
      const r=document.createRange(); r.selectNodeContents(pnameEl); const s=window.getSelection(); s.removeAllRanges(); s.addRange(r); pnameEl.focus();
      const finish=()=>{ pnameEl.contentEditable=false; t.draggable=true; const nm=pnameEl.textContent.trim()||'페이지'; pnameEl.removeEventListener('blur',finish); pnameEl.removeEventListener('keydown',onKey); p.name=nm; save(true); renderPages(); renderProps(); };
      const onKey=e2=>{ if(e2.key==='Enter'){ e2.preventDefault(); pnameEl.blur(); } else if(e2.key==='Escape'){ pnameEl.removeEventListener('blur',finish); pnameEl.removeEventListener('keydown',onKey); pnameEl.contentEditable=false; t.draggable=true; renderPages(); } };
      pnameEl.addEventListener('blur',finish); pnameEl.addEventListener('keydown',onKey);
    });
    // 드래그앤드롭 순서 변경
    t.draggable=true;
    t.addEventListener('dragstart',ev=>{ _dragPage=p.id; ev.dataTransfer.effectAllowed='move'; setTimeout(()=>t.style.opacity='.35',0); });
    t.addEventListener('dragend',()=>{ t.style.opacity=''; document.querySelectorAll('.page-thumb').forEach(x=>x.style.boxShadow=''); });
    t.addEventListener('dragover',ev=>{ ev.preventDefault(); ev.dataTransfer.dropEffect='move'; if(_dragPage&&_dragPage!==p.id) t.style.boxShadow='0 -3px 0 var(--accent) inset'; });
    t.addEventListener('dragleave',()=>{ t.style.boxShadow=''; });
    t.addEventListener('drop',ev=>{ ev.preventDefault(); t.style.boxShadow=''; reorderPage(_dragPage, p.id); _dragPage=null; });
    list.appendChild(t);
  });
}

// ───────────────────────── 렌더: 속성 패널 ─────────────────────────
function renderProps(){
  const box=document.getElementById('props-body');
  const e = selId? el(selId):null;
  if(!e){ box.innerHTML='<div class="empty">요소를 선택하면<br>여기서 편집할 수 있어요.</div>'; renderPageProps(box); return; }
  let html = '';
  // 다중 선택 배너
  if(selIds.size>1){
    html += `<div class="multisel-banner">
      <div class="msb-head"><b>${selIds.size}개</b> 개체 선택됨</div>
      <div class="msb-row">
        <button data-ms="al-l" title="왼쪽 맞춤">◁</button>
        <button data-ms="al-cx" title="가로 가운데">↔</button>
        <button data-ms="al-r" title="오른쪽 맞춤">▷</button>
        <button data-ms="al-t" title="위 맞춤">△</button>
        <button data-ms="al-cy" title="세로 중간">↕</button>
        <button data-ms="al-b" title="아래 맞춤">▽</button>
      </div>
      <div class="msb-row">
        <button data-ms="dist-h" title="가로 간격 균등">↔ 가로분배</button>
        <button data-ms="dist-v" title="세로 간격 균등">↕ 세로분배</button>
      </div>
      <div class="msb-row">
        <button data-ms="group">🔗 그룹</button>
        <button data-ms="ungroup">⧈ 해제</button>
        <button data-ms="dup">⧉ 복제</button>
        <button data-ms="del" style="color:#ff8da3">🗑 삭제</button>
      </div>
      <div class="msb-tip">Ctrl/Shift+클릭으로 추가·제외 · 빈 곳 드래그로 영역선택</div>
    </div>`;
    box.innerHTML=html;
    box.querySelectorAll('.multisel-banner [data-ms]').forEach(b=>{
      b.addEventListener('click',()=>{
        const k=b.dataset.ms;
        if(k.startsWith('al-')) arrAlign(k.slice(3));
        else if(k==='dist-h') arrDistribute('h');
        else if(k==='dist-v') arrDistribute('v');
        else if(k==='group') arrGroup();
        else if(k==='ungroup') arrUngroup();
        else if(k==='dup') arrDup();
        else if(k==='del') arrDel();
      });
    });
    return;
  }
  html += `<h4>${e.type==='text'?'텍스트':e.type==='image'?'이미지':e.type==='table'?'표':'도형'} 속성</h4>`;
  // 공통 위치/크기
  html += `<div class="grp"><label>위치 / 크기</label><div class="row">
    <div class="num-unit"><span>X</span><input type="number" id="p-x" value="${e.x}"></div>
    <div class="num-unit"><span>Y</span><input type="number" id="p-y" value="${e.y}"></div></div>
    <div class="row" style="margin-top:6px">
    <div class="num-unit"><span>W</span><input type="number" id="p-w" value="${e.w}"></div>
    <div class="num-unit"><span>H</span><input type="number" id="p-h" value="${e.h}"></div></div>
    <div class="row" style="margin-top:6px"><div class="num-unit"><span>회전</span><input type="number" id="p-rot" value="${e.rot}"></div></div></div>`;

  // 페이지 가운데 정렬 (단일 개체 — 자주 쓰는 것만)
  html += `<div class="grp"><label>페이지 가운데 정렬</label>
    <div class="btn-grp">
      <button data-pa="cx" title="가로 가운데로">↔ 가로</button>
      <button data-pa="cy" title="세로 가운데로">↕ 세로</button>
      <button data-pa="cc" title="정중앙으로">⌖ 정중앙</button>
    </div></div>`;

  if(e.type==='text'){
    html += `<div class="grp"><label>내용</label><textarea id="t-text" rows="2">${escapeHtml(e.text)}</textarea></div>`;
    const _fl=FONTS.find(f=>f[0]===e.fontFamily);
    html += `<div class="grp"><label>폰트</label><div class="font-picker" id="font-picker"><button type="button" class="font-picker-btn" id="font-picker-btn"><span id="fp-label" style="font-family:'${e.fontFamily}',sans-serif">${_fl?_fl[1]:e.fontFamily}</span><span style="color:var(--sub);font-size:10px">▾</span></button><div class="font-picker-dd" id="font-picker-dd" style="display:none"><div class="font-search-wrap"><input type="text" id="font-search" placeholder="폰트 검색…" autocomplete="off"></div><div class="font-list-scroll" id="font-list-scroll"></div><div class="font-add-wrap"><input type="text" id="font-add-input" placeholder="Google 폰트 이름 직접 입력 (예: Lora)"><button type="button" id="font-add-btn">+ 추가</button></div><div class="font-add-wrap" style="border-top:none;padding-top:0"><button type="button" id="font-file-btn" style="flex:1;background:var(--panel2);border:1px solid var(--border);color:var(--text)">📁 폰트 파일 가져오기 (.ttf/.otf)</button></div></div></div></div>`;
    html += `<div class="grp"><label>굵기</label><select id="t-weight">
      ${[['300','얇게'],['400','보통'],['500','중간'],['700','굵게'],['800','더굵게'],['900','매우굵게']].map(w=>`<option value="${w[0]}" ${String(e.fontWeight)===w[0]?'selected':''}>${w[1]} (${w[0]})</option>`).join('')}
    </select></div>`;
    html += `<div class="grp"><label>크기 / 색상</label><div class="row">
      <div class="num-unit" style="flex:1"><input type="number" id="t-size" value="${e.fontSize}"></div>
      <button type="button" class="panel-cbtn" id="t-color" data-cpkey="textColor" title="글자 색"><span style="background:${e.color}"></span></button></div></div>`;
    html += `<div class="grp"><label>가로 정렬</label><div class="btn-grp">
      <button data-align="left" class="${e.align==='left'?'on':''}">⬅ 왼쪽</button>
      <button data-align="center" class="${e.align==='center'?'on':''}">⬌ 가운데</button>
      <button data-align="right" class="${e.align==='right'?'on':''}">오른쪽 ➡</button></div></div>`;
    const _va=e.valign||'middle';
    html += `<div class="grp"><label>세로 정렬 (상자 안 위치)</label><div class="btn-grp">
      <button data-valign="top" class="${_va==='top'?'on':''}">⤒ 위</button>
      <button data-valign="middle" class="${_va==='middle'?'on':''}">중간</button>
      <button data-valign="bottom" class="${_va==='bottom'?'on':''}">아래 ⤓</button></div></div>`;
    html += `<div class="grp"><label>스타일</label><div class="btn-grp">
      <button id="t-italic" class="${e.italic?'on':''}" style="font-style:italic">I</button>
      <button id="t-underline" class="${e.underline?'on':''}" style="text-decoration:underline">U</button></div></div>`;
    html += `<div class="grp"><label>행간 ${e.lineHeight}</label><input type="range" id="t-lh" min="0.8" max="2.5" step="0.1" value="${e.lineHeight}"></div>`;
    html += `<div class="grp"><label>자간 ${e.letterSpacing}px</label><input type="range" id="t-ls" min="-3" max="15" step="0.5" value="${e.letterSpacing}"></div>`;
    html += `<div class="grp"><label style="display:flex;align-items:center;gap:7px;cursor:pointer;text-transform:none"><input type="checkbox" id="t-autofit" ${e.autofit?'checked':''}> 상자에 맞춰 자동 축소 (autofit)</label></div>`;
    html += `<div class="grp" style="border-top:1px solid var(--border);padding-top:12px"><label>✨ AI 문구</label>
      <div class="btn-grp" style="flex-wrap:wrap;gap:4px">
        <button class="aicopy" data-aic="더 전문적이고 신뢰감 있게">전문적</button>
        <button class="aicopy" data-aic="더 친근하고 따뜻하게">친근하게</button>
        <button class="aicopy" data-aic="핵심만 더 짧고 임팩트 있게">짧게</button>
        <button class="aicopy" data-aic="조금 더 자세히 풀어서">자세히</button>
      </div>
      <div class="row" style="margin-top:6px"><input type="text" id="aicopy-inp" placeholder="직접 지시 (예: 정형외과 30년 강조)" style="flex:1"><button class="tb-btn" id="aicopy-go">생성</button></div></div>`;
  }else if(e.type==='image'){
    html += `<div class="grp"><label>이미지</label><button class="tb-btn" id="i-replace" style="width:100%">🔄 사진 교체</button></div>`;
    html += `<div class="grp"><label>채움 방식</label><select id="i-fit"><option value="cover" ${e.fit==='cover'?'selected':''}>꽉 채우기</option><option value="contain" ${e.fit==='contain'?'selected':''}>전체 보이기</option></select></div>`;
    html += `<div class="grp"><label>액자 모양</label><select id="i-clip"><option value="none" ${e.clip==='none'?'selected':''}>사각형</option><option value="circle" ${e.clip==='circle'?'selected':''}>원형</option></select></div>`;
    html += `<div class="grp"><label>모서리 둥글기 ${e.radius}px</label><input type="range" id="i-radius" min="0" max="200" value="${e.radius}" ${e.clip==='circle'?'disabled':''}></div>`;
    html += `<div class="grp"><label>테두리</label><div class="row"><div class="num-unit" style="flex:1"><span>굵기</span><input type="number" id="i-bw" value="${e.borderW}"></div><button type="button" class="panel-cbtn" id="i-bc" data-cpkey="imgBorder" title="테두리 색"><span style="background:${e.borderColor}"></span></button></div></div>`;
  }else if(e.type==='shape'){
    // ── 채우기 (PPT 도형 서식) ──
    html += `<div class="sec-hd">▾ 채우기</div>`;
    html += `<div class="grp"><label>색 / 종류</label><button type="button" class="panel-cbtn" id="s-fill" data-cpkey="fill" title="채움색" style="width:100%;justify-content:flex-start"><span style="background:${e.fill}"></span><span style="font-size:12px;color:var(--sub)">단색 · 그라데이션 · 그림/질감 · 없음</span></button></div>`;
    const _ftr=100-(e.fillOpacity==null?100:e.fillOpacity);
    html += `<div class="grp"><label>투명도 <span id="s-ftr-val" style="float:right;color:var(--accent)">${_ftr}%</span></label><input type="range" id="s-ftr" min="0" max="100" value="${_ftr}"></div>`;
    // ── 선 ──
    html += `<div class="sec-hd">▾ 선</div>`;
    html += `<div class="grp"><label>윤곽선 색 / 두께</label><div class="row"><button type="button" class="panel-cbtn" id="s-bc" data-cpkey="outline" title="윤곽선 색"><span style="background:${e.borderColor}"></span></button><div class="num-unit" style="flex:1"><span>두께</span><input type="number" id="s-bw" value="${e.borderW}"></div></div></div>`;
    if(e.shape!=='circle') html += `<div class="grp"><label>모서리 둥글기 ${e.radius}px</label><input type="range" id="s-radius" min="0" max="300" value="${e.radius}"></div>`;
    // 도형 안 텍스트
    const _sal=e.stAlign||'center', _sva=e.stValign||'middle';
    html += `<div class="grp" style="border-top:1px solid var(--border);padding-top:12px"><label>도형 안 텍스트 <span style="color:var(--sub);font-weight:400">(더블클릭으로도 입력)</span></label><textarea id="s-text" rows="2" placeholder="도형 안에 표시할 글자">${escapeHtml(e.stext||'')}</textarea></div>`;
    html += `<div class="grp"><label>글자 크기 / 색상</label><div class="row"><div class="num-unit" style="flex:1"><input type="number" id="s-tsize" value="${e.stSize||28}"></div><button type="button" class="panel-cbtn" id="s-tcolor" data-cpkey="shapeText" title="글자 색"><span style="background:${e.stColor||'#ffffff'}"></span></button></div></div>`;
    html += `<div class="grp"><label>글자 굵기</label><div class="btn-grp">
      <button data-stw="400" class="${(e.stWeight||700)<700?'on':''}">보통</button>
      <button data-stw="700" class="${(e.stWeight||700)>=700?'on':''}" style="font-weight:800">굵게</button></div></div>`;
    html += `<div class="grp"><label>가로 정렬</label><div class="btn-grp">
      <button data-stal="left" class="${_sal==='left'?'on':''}">⬅</button>
      <button data-stal="center" class="${_sal==='center'?'on':''}">⬌</button>
      <button data-stal="right" class="${_sal==='right'?'on':''}">➡</button></div></div>`;
    html += `<div class="grp"><label>세로 정렬</label><div class="btn-grp">
      <button data-stva="top" class="${_sva==='top'?'on':''}">⤒ 위</button>
      <button data-stva="middle" class="${_sva==='middle'?'on':''}">중간</button>
      <button data-stva="bottom" class="${_sva==='bottom'?'on':''}">아래 ⤓</button></div></div>`;
  }else if(e.type==='table'){
    html += `<div class="sec-hd">▾ 표 구조</div>`;
    html += `<div class="grp"><label>열 × 행</label><div class="row">
      <div class="num-unit" style="flex:1"><span>열</span><input type="number" id="tb-cols" value="${e.cols}" min="1" max="20"></div>
      <div class="num-unit" style="flex:1"><span>행</span><input type="number" id="tb-rows" value="${e.rows}" min="1" max="50"></div></div></div>`;
    html += `<div class="grp"><label>폰트</label><select id="tb-font">${FONTS.map(f=>`<option value="${f[0]}" ${e.fontFamily===f[0]?'selected':''}>${f[1]}</option>`).join('')}</select></div>`;
    html += `<div class="grp"><label>글자 크기 / 굵기</label><div class="row">
      <div class="num-unit" style="flex:1"><input type="number" id="tb-fsize" value="${e.fontSize||14}"></div>
      <select id="tb-fw" style="flex:1">${[['300','얇게'],['400','보통'],['500','중간'],['700','굵게']].map(w=>`<option value="${w[0]}" ${String(e.fontWeight||400)===w[0]?'selected':''}>${w[1]}</option>`).join('')}</select></div></div>`;
    html += `<div class="sec-hd">▾ 머리행</div>`;
    html += `<div class="grp"><label>배경 / 글자 / 굵기</label><div class="row">
      <button type="button" class="panel-cbtn" data-cpkey="tblHeaderBg" title="머리행 배경"><span style="background:${e.headerBg||'#4a5568'}"></span></button>
      <button type="button" class="panel-cbtn" data-cpkey="tblHeaderColor" title="머리행 글자"><span style="background:${e.headerColor||'#ffffff'}"></span></button>
      <select id="tb-hw" style="flex:1"><option value="400" ${(e.headerWeight||700)<700?'selected':''}>보통</option><option value="700" ${(e.headerWeight||700)>=700?'selected':''}>굵게</option></select></div></div>`;
    html += `<div class="sec-hd">▾ 본문</div>`;
    html += `<div class="grp"><label>배경 / 글자</label><div class="row">
      <button type="button" class="panel-cbtn" data-cpkey="tblCellBg" title="본문 배경"><span style="background:${e.cellBg||'#ffffff'}"></span></button>
      <button type="button" class="panel-cbtn" data-cpkey="tblCellColor" title="본문 글자"><span style="background:${e.cellColor||'#333333'}"></span></button></div></div>`;
    html += `<div class="sec-hd">▾ 테두리</div>`;
    html += `<div class="grp"><div class="row">
      <div class="num-unit" style="flex:1"><span>굵기</span><input type="number" id="tb-bw" value="${e.borderW||1}"></div>
      <button type="button" class="panel-cbtn" data-cpkey="tblBorder" title="테두리 색"><span style="background:${e.borderColor||'#333333'}"></span></button></div></div>`;
    html += `<div class="grp"><label>모서리 둥글기</label><input type="range" id="tb-radius" min="0" max="30" value="${e.radius||0}"></div>`;
    html += `<div class="grp"><label>셀 내용 편집</label><div style="font-size:11px;color:var(--sub)">더블클릭으로 셀 편집 · Tab 이동 · 테두리 드래그로 행/열 크기 조절</div></div>`;
    html += `<div class="grp"><div class="btn-grp">
      <button id="tb-add-row">+ 행 추가</button>
      <button id="tb-add-col">+ 열 추가</button></div></div>`;
    html += `<div class="grp"><div class="btn-grp">
      <button id="tb-del-row" class="danger" style="flex:1">행 삭제</button>
      <button id="tb-del-col" class="danger" style="flex:1">열 삭제</button></div></div>`;
  }
  // 링크 (클릭 시 이동) — 모든 요소 공통
  const others = project.pages.filter(p=>p.id!==page().id && !p.isHeader && !p.isFooter);
  html += `<div class="grp"><label>🔗 클릭 시 이동 (링크)</label>
    <select id="el-link">
      <option value="">없음</option>
      ${others.map(p=>`<option value="${p.id}" ${e.link===p.id?'selected':''}>${escapeHtml(p.name||'페이지')}</option>`).join('')}
      <option value="__new__">＋ 새 페이지 만들어 연결</option>
    </select>
    ${e.link?`<button class="tb-btn" id="el-link-go" style="width:100%;margin-top:6px">✎ 연결된 페이지 편집하러 가기</button>`:''}
  </div>`;
  html += `<div class="grp"><div class="btn-grp"><button id="el-front">맨앞</button><button id="el-back">맨뒤</button><button id="el-dup">복제</button></div></div>`;
  if(e.fx&&e.fx.type){ const FX_NAMES={'scroll-reveal':'📜 스크롤 등장','hover-show':'👁 호버 트리거','hover-hide':'👁 호버 대상','tab-trigger':'🏷 탭 버튼','tab-content':'🏷 탭 내용','hover-zoom':'🔍 호버 줌','hover-expand':'📂 호버 펼침','counter':'🔢 카운터','slider':'🎠 슬라이더'}; html+=`<div style="margin-bottom:8px;padding:7px 10px;background:rgba(230,126,34,.15);border:1px solid rgba(230,126,34,.4);border-radius:7px;font-size:12px;color:#e67e22;cursor:pointer" id="fx-hint">✨ ${FX_NAMES[e.fx.type]||e.fx.type} 적용됨 → 이펙트 탭에서 편집</div>`; }
  html += `<button class="danger" id="el-del">🗑 삭제</button>`;
  box.innerHTML = html;
  bindProps(e);
}
function renderPageProps(box){
  const p=page();
  box.innerHTML += `<h4 style="margin-top:24px">페이지 (메뉴 이름)</h4><div class="grp"><input type="text" id="pg-name" value="${escapeHtml(p.name||'')}" placeholder="예: 홈, 병원소개, 오시는길"></div>`;
  box.innerHTML += `<h4>페이지 배경</h4><div class="grp"><div class="row"><button type="button" class="panel-cbtn" id="pg-bg" data-cpkey="pageBg" title="배경색"><span style="background:${p.bg}"></span></button><input type="text" id="pg-bg-t" value="${p.bg}" style="flex:1"></div></div>`;
  box.innerHTML += `<h4>페이지 높이</h4><div class="grp"><div class="num-unit"><input type="number" id="pg-h" value="${p.h}"><span>px</span></div></div>`;
  box.innerHTML += `<h4>발행 옵션 (사이트 전체)</h4><div class="grp"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;text-transform:none"><input type="checkbox" id="pg-smooth" ${project.smoothScroll?'checked':''}> 관성 부드러운 스크롤</label><div style="font-size:11px;color:var(--sub);margin-top:5px">발행 페이지에서 스크롤이 미끄러지듯 따라옵니다. 모바일·접근성(動 줄이기) 사용자는 자동으로 일반 스크롤.</div></div>`;
  const smI=box.querySelector('#pg-smooth');
  if(smI) smI.addEventListener('change',()=>{ project.smoothScroll=smI.checked; save(true); snapshot(); toast(smI.checked?'부드러운 스크롤 켜짐 (발행 시 적용)':'부드러운 스크롤 꺼짐'); });
  {
    const dev=pageDevice(p);
    box.innerHTML += `<h4>표시 기기</h4><div class="grp"><select id="pg-device">
      <option value="both" ${dev==='both'?'selected':''}>PC·모바일 공통</option>
      <option value="pc" ${dev==='pc'?'selected':''}>PC 전용 (넓은 화면)</option>
      <option value="mobile" ${dev==='mobile'?'selected':''}>모바일 전용 (좁은 화면)</option>
    </select><div style="font-size:11px;color:var(--sub);margin-top:5px">발행 시 화면 폭으로 자동 전환(≤768px=모바일).${p.isHeader||p.isFooter?' 모바일 전용 바는 폭 430·큰 글자 권장. 모바일에선 좌측상단 햄버거 메뉴가 자동 추가됩니다.':' 모바일 전용은 폭을 430 등 좁게 권장.'}</div></div>`;
    const devSel=box.querySelector('#pg-device');
    if(devSel) devSel.addEventListener('change',()=>{ p.device=devSel.value; renderPages(); save(true); snapshot(); });
  }
  if(p.isHeader){
    box.innerHTML += `<div style="font-size:12px;color:var(--sub);margin:4px 0 8px;line-height:1.6">☰ 햄버거 메뉴는 캔버스 상단 바의 <b style="color:var(--accent2)">☰ 버튼</b>을 클릭해 편집하세요 (드래그로 위치 이동 가능).</div>`;
  }
  // ── 섹션 관리 ──
  const secs=sortedSections(p);
  let secHtml=`<h4>섹션 <span style="color:var(--sub);font-weight:400;text-transform:none">(핀 고정·스크럽 구간)</span></h4>`;
  if(!secs.length){ secHtml+=`<div style="font-size:12px;color:var(--sub);margin-bottom:8px;line-height:1.6">페이지를 세로로 나눠 "핀 고정" 구간을 만들 수 있어요. 핀 섹션은 발행 시 화면에 잠시 고정됩니다. <b>(레이아웃 적용은 다음 단계)</b></div>`; }
  else { secs.forEach((s,i)=>{ const bot=(secs[i+1]?secs[i+1].y:p.h);
    secHtml+=`<div class="sec-row" data-sid="${s.id}" style="background:var(--panel2);border:1px solid var(--border);border-radius:8px;padding:9px;margin-bottom:7px">
      <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
        <input class="sec-name" value="${escapeHtml(s.name||'')}" style="flex:1;padding:5px 8px;background:var(--panel);border:1px solid var(--border);border-radius:6px;color:var(--text);font-size:12px" placeholder="섹션 이름">
        <span style="font-size:11px;color:var(--sub);white-space:nowrap">${Math.round(bot-s.y)}px</span>
        ${i>0?`<button class="sec-del" title="이 경계 제거" style="border:none;background:none;color:#ff8da3;cursor:pointer;font-size:14px">✕</button>`:'<span style="width:14px"></span>'}
      </div>
      <label style="display:flex;align-items:center;gap:7px;font-size:12px;color:var(--sub);cursor:pointer;text-transform:none"><input type="checkbox" class="sec-pin" ${s.pin?'checked':''}> 📌 핀 고정${s.pin?` · <input type="number" class="sec-pinlen" value="${s.pinLen||600}" style="width:64px;padding:3px 6px;background:var(--panel);border:1px solid var(--border);border-radius:5px;color:var(--text);font-size:12px"> px 동안`:''}</label>
    </div>`;
  }); }
  secHtml+=`<button id="sec-add" class="tb-btn" style="width:100%;margin-top:2px">＋ 섹션 나누기</button>`;
  box.innerHTML+=secHtml;
  const secAdd=box.querySelector('#sec-add'); if(secAdd) secAdd.addEventListener('click',addSection);
  box.querySelectorAll('.sec-row').forEach(row=>{
    const sid=row.dataset.sid, sec=(p.sections||[]).find(x=>x.id===sid); if(!sec) return;
    const nm=row.querySelector('.sec-name'); if(nm){ nm.addEventListener('input',()=>{ sec.name=nm.value; renderCanvas(); save(true); }); nm.addEventListener('change',snapshot); }
    const pin=row.querySelector('.sec-pin'); if(pin) pin.addEventListener('change',()=>{ sec.pin=pin.checked; renderProps(); renderCanvas(); save(true); snapshot(); });
    const pl=row.querySelector('.sec-pinlen'); if(pl){ pl.addEventListener('input',()=>{ sec.pinLen=parseInt(pl.value)||600; save(true); }); pl.addEventListener('change',snapshot); }
    const del=row.querySelector('.sec-del'); if(del) del.addEventListener('click',()=>delSection(sid));
  });
  const nameI=box.querySelector('#pg-name');
  nameI.addEventListener('input',()=>{ p.name=nameI.value; renderPages(); save(true); });
  nameI.addEventListener('change',snapshot);
  const hI=box.querySelector('#pg-h');
  hI.addEventListener('input',()=>{ p.h=parseInt(hI.value)||PAGE_H; canvas.style.height=p.h+'px'; document.getElementById('pmeta').textContent=`${p.w} × ${p.h}`; renderPages(); save(true); });
  hI.addEventListener('change',snapshot);
  const sync=v=>{ p.bg=v; canvas.style.background=v; const sw=box.querySelector('#pg-bg span'); if(sw)sw.style.background=v; renderPages(); save(true); };
  const pgT=box.querySelector('#pg-bg-t');
  if(pgT){ pgT.addEventListener('input',()=>sync(pgT.value)); pgT.addEventListener('change',()=>snapshot()); }
}

// ───────────────────────── 속성 바인딩 ─────────────────────────
function bindProps(e){
  const $=id=>document.getElementById(id);
  const liveStyle=()=>{ const node=canvas.querySelector(`[data-id="${e.id}"]`); if(node){ const fresh=renderEl(e); node.replaceWith(fresh); addHandles(canvas.querySelector(`[data-id="${e.id}"]`),e);} renderPages(); save(true); };
  const num=(id,key,after)=>{ const i=$(id); if(!i)return; i.addEventListener('input',()=>{ e[key]=parseFloat(i.value)||0; (after||liveStyle)(); }); i.addEventListener('change',snapshot); };
  num('p-x','x'); num('p-y','y'); num('p-w','w'); num('p-h','h'); num('p-rot','rot');

  // 페이지 기준 정렬은 전역 위임(아래)에서 처리

  if(e.type==='text'){
    $('t-text').addEventListener('input',()=>{ e.text=$('t-text').value; liveStyle(); });
    $('t-text').addEventListener('change',snapshot);
    // font picker
    const fpBtn=$('font-picker-btn'),fpDd=$('font-picker-dd'),fpList=$('font-list-scroll');
    const norm=s=>s.toLowerCase().replace(/\s/g,'');
    function getCustomFonts(){try{return JSON.parse(localStorage.getItem('hw_custom_fonts')||'[]');}catch{return[];}}
    function renderFontList(q=''){
      const lc=norm(q);
      const custom=getCustomFonts();
      const all=[...FONTS,...custom.filter(cf=>!FONTS.find(f=>f[0]===cf[0]))];
      const vis=all.filter(f=>!lc||norm(f[0]).includes(lc)||norm(f[1]).includes(lc)||norm(f[2]).includes(lc));
      const grps={};
      vis.forEach(f=>{(grps[f[2]]||(grps[f[2]]=[])).push(f);});
      let h='';
      Object.entries(grps).forEach(([cat,items])=>{
        h+=`<div class="fcat">${cat}</div>`;
        items.forEach(f=>{
          const isDel=cat==='직접 추가';
          h+=`<div class="fitem${e.fontFamily===f[0]?' sel':''}"data-fam="${f[0]}"><span class="fp"style="font-family:'${f[0]}',sans-serif">가나다 Aa</span><span class="fn">${f[1]}${isDel?` <span data-delfont="${f[0]}" style="cursor:pointer;color:#ff8da3;margin-left:4px" title="삭제">✕</span>`:''}</span></div>`;
        });
      });
      fpList.innerHTML=h||'<div style="padding:16px;text-align:center;color:var(--sub);font-size:12px">검색 결과 없음</div>';
      fpList.querySelectorAll('.fitem').forEach(item=>{
        item.addEventListener('click',(ev)=>{
          if(ev.target.dataset.delfont) return;
          const fam=item.dataset.fam;
          e.fontFamily=fam; loadFont(fam);
          fpDd.style.display='none'; fpBtn.classList.remove('open');
          const lbl=[...FONTS,...getCustomFonts()].find(f=>f[0]===fam);
          $('fp-label').textContent=lbl?lbl[1]:fam; $('fp-label').style.fontFamily=`'${fam}',sans-serif`;
          liveStyle(); snapshot();
        });
      });
      fpList.querySelectorAll('[data-delfont]').forEach(x=>{
        x.addEventListener('click',(ev)=>{
          ev.stopPropagation();
          const fam=x.dataset.delfont;
          const arr=getCustomFonts().filter(f=>f[0]!==fam);
          localStorage.setItem('hw_custom_fonts',JSON.stringify(arr));
          renderFontList($('font-search').value);
        });
      });
    }
    fpBtn.addEventListener('click',(ev)=>{
      ev.stopPropagation();
      if(fpDd.style.display!=='none'){fpDd.style.display='none';fpBtn.classList.remove('open');return;}
      fpDd.style.display='flex'; fpDd.style.flexDirection='column'; fpBtn.classList.add('open');
      renderFontList(); setTimeout(()=>$('font-search').focus(),0);
    });
    $('font-search').addEventListener('input',()=>renderFontList($('font-search').value));
    async function doAddFont(){
      const inp=$('font-add-input'); const name=inp.value.trim(); if(!name) return;
      const btn=$('font-add-btn'); btn.textContent='로딩…'; btn.disabled=true;
      loadFont(name);
      await new Promise(r=>setTimeout(r,900));
      const arr=getCustomFonts();
      if(!arr.find(f=>f[0]===name)){arr.push([name,name,'직접 추가']);localStorage.setItem('hw_custom_fonts',JSON.stringify(arr));}
      e.fontFamily=name; inp.value='';
      fpDd.style.display='none'; fpBtn.classList.remove('open');
      $('fp-label').textContent=name; $('fp-label').style.fontFamily=`'${name}',sans-serif`;
      btn.textContent='+ 추가'; btn.disabled=false;
      liveStyle(); snapshot(); toast(`"${name}" 폰트 추가됨`);
    }
    $('font-add-btn').addEventListener('click',doAddFont);
    $('font-add-input').addEventListener('keydown',ev=>{if(ev.key==='Enter')doAddFont();});
    $('font-add-input').addEventListener('click',ev=>ev.stopPropagation());
    // 폰트 파일 가져오기
    const fontFileInput=document.getElementById('font-file');
    $('font-file-btn').addEventListener('click',ev=>{ ev.stopPropagation(); fontFileInput.onchange=()=>{ const f=fontFileInput.files[0]; fontFileInput.value=''; if(f) importFontFile(f,()=>{ fpDd.style.display='none'; fpBtn.classList.remove('open'); }); }; fontFileInput.click(); });
    function _closeFP(ev){if(!document.getElementById('font-picker')?.contains(ev.target)){fpDd.style.display='none';fpBtn.classList.remove('open');document.removeEventListener('click',_closeFP);}}
    setTimeout(()=>document.addEventListener('click',_closeFP),0);
    $('t-weight').addEventListener('change',()=>{ e.fontWeight=parseInt($('t-weight').value); liveStyle(); snapshot(); });
    num('t-size','fontSize');
    $('t-color').addEventListener('input',()=>{ e.color=$('t-color').value; liveStyle(); });
    $('t-color').addEventListener('change',snapshot);
    // data-align은 전역 위임(아래)에서 처리
    if($('t-autofit')) $('t-autofit').addEventListener('change',()=>{ e.autofit=$('t-autofit').checked; liveStyle(); applyAutofits(); snapshot(); });
    document.querySelectorAll('.aicopy').forEach(b=>b.addEventListener('click',()=>runAiCopy(e,b.dataset.aic)));
    if($('aicopy-go')) $('aicopy-go').addEventListener('click',()=>{ const v=$('aicopy-inp').value.trim(); runAiCopy(e, v||'자연스럽게 다듬어'); });
    $('t-italic').addEventListener('click',()=>{ e.italic=!e.italic; renderProps(); liveStyle(); snapshot(); });
    $('t-underline').addEventListener('click',()=>{ e.underline=!e.underline; renderProps(); liveStyle(); snapshot(); });
    $('t-lh').addEventListener('input',()=>{ e.lineHeight=parseFloat($('t-lh').value); liveStyle(); });
    $('t-lh').addEventListener('change',snapshot);
    $('t-ls').addEventListener('input',()=>{ e.letterSpacing=parseFloat($('t-ls').value); liveStyle(); });
    $('t-ls').addEventListener('change',snapshot);
  }else if(e.type==='image'){
    $('i-replace').addEventListener('click',()=>{ document.getElementById('img-target').value=e.id; document.getElementById('img-file').click(); });
    $('i-fit').addEventListener('change',()=>{ e.fit=$('i-fit').value; liveStyle(); snapshot(); });
    $('i-clip').addEventListener('change',()=>{ e.clip=$('i-clip').value; renderProps(); liveStyle(); snapshot(); });
    if($('i-radius')) $('i-radius').addEventListener('input',()=>{ e.radius=parseInt($('i-radius').value); renderProps(); liveStyle(); });
    num('i-bw','borderW');
    $('i-bc').addEventListener('input',()=>{ e.borderColor=$('i-bc').value; liveStyle(); });
  }else if(e.type==='shape'){
    $('s-fill').addEventListener('input',()=>{ e.fill=$('s-fill').value; liveStyle(); });
    $('s-fill').addEventListener('change',snapshot);
    if($('s-radius')) $('s-radius').addEventListener('input',()=>{ e.radius=parseInt($('s-radius').value); renderProps(); liveStyle(); });
    if($('s-ftr')){ $('s-ftr').addEventListener('input',()=>{ const tr=parseInt($('s-ftr').value)||0; e.fillOpacity=100-tr; const v=document.getElementById('s-ftr-val'); if(v)v.textContent=tr+'%'; liveStyle(); }); $('s-ftr').addEventListener('change',snapshot); }
    num('s-bw','borderW');
    $('s-bc').addEventListener('input',()=>{ e.borderColor=$('s-bc').value; liveStyle(); });
    $('s-bc').addEventListener('change',snapshot);
    // 도형 안 텍스트
    if($('s-text')){ $('s-text').addEventListener('input',()=>{ e.stext=$('s-text').value; liveStyle(); }); $('s-text').addEventListener('change',snapshot); }
    if($('s-tsize')){ $('s-tsize').addEventListener('input',()=>{ e.stSize=parseInt($('s-tsize').value)||28; liveStyle(); }); $('s-tsize').addEventListener('change',snapshot); }
    if($('s-tcolor')){ $('s-tcolor').addEventListener('input',()=>{ e.stColor=$('s-tcolor').value; liveStyle(); }); $('s-tcolor').addEventListener('change',snapshot); }
    document.querySelectorAll('[data-stw]').forEach(b=>b.addEventListener('click',()=>{ e.stWeight=parseInt(b.dataset.stw); renderProps(); liveStyle(); snapshot(); }));
    document.querySelectorAll('[data-stal]').forEach(b=>b.addEventListener('click',()=>{ e.stAlign=b.dataset.stal; renderProps(); liveStyle(); snapshot(); }));
    document.querySelectorAll('[data-stva]').forEach(b=>b.addEventListener('click',()=>{ e.stValign=b.dataset.stva; renderProps(); liveStyle(); snapshot(); }));
  }else if(e.type==='table'){
    const tblSync=()=>{ liveStyle(); renderProps(); };
    const tblNum=(id,key)=>{ const i=$(id); if(!i)return; i.addEventListener('change',()=>{ e[key]=parseFloat(i.value)||0; tblSync(); snapshot(); }); };
    tblNum('tb-fsize','fontSize');
    tblNum('tb-bw','borderW');
    if($('tb-font')) $('tb-font').addEventListener('change',()=>{ e.fontFamily=$('tb-font').value; loadFont(e.fontFamily); liveStyle(); snapshot(); });
    if($('tb-fw')) $('tb-fw').addEventListener('change',()=>{ e.fontWeight=parseInt($('tb-fw').value); liveStyle(); snapshot(); });
    if($('tb-radius')) $('tb-radius').addEventListener('input',()=>{ e.radius=parseInt($('tb-radius').value)||0; liveStyle(); });
    if($('tb-radius')) $('tb-radius').addEventListener('change',snapshot);
    if($('tb-hw')) $('tb-hw').addEventListener('change',()=>{ e.headerWeight=parseInt($('tb-hw').value); liveStyle(); snapshot(); });
    if($('tb-cols')) $('tb-cols').addEventListener('change',()=>{
      const nc=Math.max(1,Math.min(20,parseInt($('tb-cols').value)||3));
      if(nc>e.cols){ for(let r=0;r<e.rows;r++) e.cells.push({r,c:nc-1,text:r===0?`항목${nc}`:''}); e.colWidths=e.colWidths||[]; while(e.colWidths.length<nc) e.colWidths.push(120); }
      else if(nc<e.cols){ e.cells=e.cells.filter(c=>c.c<nc); if(e.colWidths) e.colWidths=e.colWidths.slice(0,nc); }
      e.cols=nc; e.w=e.colWidths?e.colWidths.reduce((a,b)=>a+b,0):nc*120; tblSync(); snapshot();
    });
    if($('tb-rows')) $('tb-rows').addEventListener('change',()=>{
      const nr=Math.max(1,Math.min(50,parseInt($('tb-rows').value)||3));
      if(nr>e.rows){ for(let c=0;c<e.cols;c++) e.cells.push({r:nr-1,c,text:''}); e.rowHeights=e.rowHeights||[]; while(e.rowHeights.length<nr) e.rowHeights.push(40); }
      else if(nr<e.rows){ e.cells=e.cells.filter(c=>c.r<nr); if(e.rowHeights) e.rowHeights=e.rowHeights.slice(0,nr); }
      e.rows=nr; e.h=e.rowHeights?e.rowHeights.reduce((a,b)=>a+b,0):nr*40; tblSync(); snapshot();
    });
    if($('tb-add-row')) $('tb-add-row').addEventListener('click',()=>{
      for(let c=0;c<e.cols;c++) e.cells.push({r:e.rows,c,text:''});
      e.rows++; if(!e.rowHeights) e.rowHeights=[]; e.rowHeights.push(40); e.h+=40; tblSync(); snapshot();
    });
    if($('tb-add-col')) $('tb-add-col').addEventListener('click',()=>{
      for(let r=0;r<e.rows;r++) e.cells.push({r,c:e.cols,text:r===0?`항목${e.cols+1}`:''});
      e.cols++; if(!e.colWidths) e.colWidths=[]; e.colWidths.push(120); e.w+=120; tblSync(); snapshot();
    });
    if($('tb-del-row')) $('tb-del-row').addEventListener('click',()=>{
      if(e.rows<=1) return;
      const removed=e.rowHeights?e.rowHeights.pop():40;
      e.rows--; e.cells=e.cells.filter(c=>c.r<e.rows); e.h=Math.max(40,e.h-removed); tblSync(); snapshot();
    });
    if($('tb-del-col')) $('tb-del-col').addEventListener('click',()=>{
      if(e.cols<=1) return;
      const removed=e.colWidths?e.colWidths.pop():120;
      e.cols--; e.cells=e.cells.filter(c=>c.c<e.cols); e.w=Math.max(120,e.w-removed); tblSync(); snapshot();
    });
  }
  // 링크 설정
  const linkSel=$('el-link');
  if(linkSel) linkSel.addEventListener('change',()=>{
    const v=linkSel.value;
    const _ts=selAll(); const _t=_ts.length?_ts:[e];   // 그룹/다중선택이면 전체 링크
    if(v==='__new__'){
      const child=newPage(prompt('새로 만들 페이지 이름','새 페이지')||'새 페이지', page().id);
      project.pages.push(child); _t.forEach(x=>x.link=child.id);
      renderProps(); afterMutate(); toast('새 페이지를 만들어 연결했습니다'+(_t.length>1?` (${_t.length}개)`:''));
    }else{ _t.forEach(x=>x.link=v||null); liveStyle(); snapshot(); renderProps(); if(_t.length>1&&v) toast(`${_t.length}개에 링크 연결됨`); }
  });
  const linkGo=$('el-link-go');
  if(linkGo) linkGo.addEventListener('click',()=>{ const i=pageIndex(e.link); if(i>=0){ curPage=i; selId=null; renderCanvas(); renderPages(); renderProps(); toast('연결된 페이지로 이동'); } });
  $('el-del').addEventListener('click',()=>{ page().elements=page().elements.filter(x=>x.id!==e.id); selId=null; afterMutate(); });
  $('el-dup').addEventListener('click',()=>{ const c={...JSON.parse(JSON.stringify(e)),id:uid(),x:e.x+20,y:e.y+20}; page().elements.push(c); selId=c.id; afterMutate(); });
  $('el-front').addEventListener('click',()=>{ const arr=page().elements; const i=arr.findIndex(x=>x.id===e.id); arr.push(arr.splice(i,1)[0]); afterMutate(); });
  $('el-back').addEventListener('click',()=>{ const arr=page().elements; const i=arr.findIndex(x=>x.id===e.id); arr.unshift(arr.splice(i,1)[0]); afterMutate(); });
  const fxHint=document.getElementById('fx-hint');
  if(fxHint) fxHint.addEventListener('click',()=>switchPropTab('fx'));
}
// ───────────────────────── 이펙트 패널 ─────────────────────────
const FX_NAMES={'sticky':'상단 고정','char-reveal':'글자 등장','parallax':'패럴랙스','scroll-scrub':'스크롤 스크럽','bg-video':'배경 영상','scroll-reveal':'스크롤 등장',
  'mask-wipe':'마스크 등장','mask-wipe-l':'마스크 등장(좌)','rotate-in':'회전 등장','blur-in':'블러 풀림','skew-in':'기울임 등장','flip-in':'플립 등장','zoom-in':'줌인 등장','zoom-out':'줌아웃 등장','bounce-in':'바운스 등장',
  'fade-in':'페이드 등장','slide-down':'위에서 내려옴','slide-right':'왼쪽에서','slide-left':'오른쪽에서','flip-y':'세로 플립','pop-in':'팝(통통) 등장',
  'float':'둥실(상하)','pulse':'맥박','spin':'회전(상시)','wobble':'살랑','gradient-flow':'그라데이션 흐름','marquee':'흐르는 텍스트',
  'shake':'흔들림','heartbeat':'하트비트','tada':'짠(타다)','swing':'그네','glow-loop':'발광 반복','blink':'깜빡임',
  'hover-lift':'호버 떠오름','hover-glow':'호버 발광','hover-tilt':'호버 3D틸트','hover-grow':'호버 확대','hover-sink':'호버 눌림',
  'hover-rotate':'호버 회전','hover-bright':'호버 밝게','hover-border':'호버 테두리','hover-dim':'호버 어둡게','hover-float':'호버 떠올라 확대',
  'hover-show':'호버 트리거','hover-hide':'호버 대상','tab-trigger':'탭 버튼','tab-content':'탭 내용','hover-zoom':'호버 줌','hover-expand':'아코디언','counter':'카운터','slider':'슬라이더'};
const FX_ICONS={'sticky':'📌','char-reveal':'🔠','parallax':'🌊','scroll-scrub':'📈','bg-video':'🎬','scroll-reveal':'📜',
  'mask-wipe':'🎬','mask-wipe-l':'🎬','rotate-in':'🔄','blur-in':'🌫','skew-in':'📐','flip-in':'🔃','zoom-in':'🔎','zoom-out':'🔭','bounce-in':'🏀',
  'fade-in':'🌅','slide-down':'⬇','slide-right':'➡','slide-left':'⬅','flip-y':'🔃','pop-in':'🎉',
  'float':'🎈','pulse':'💓','spin':'🌀','wobble':'🍃','gradient-flow':'🌈','marquee':'📰',
  'shake':'📳','heartbeat':'❤️','tada':'🎊','swing':'🪀','glow-loop':'💡','blink':'✴️',
  'hover-lift':'🖐','hover-glow':'✨','hover-tilt':'🃏','hover-grow':'➕','hover-sink':'⬇',
  'hover-rotate':'🔄','hover-bright':'🔆','hover-border':'⬜','hover-dim':'🌑','hover-float':'🎈',
  'hover-show':'👁','hover-hide':'🙈','tab-trigger':'🏷','tab-content':'📄','hover-zoom':'🔍','hover-expand':'📂','counter':'🔢','slider':'🎠'};
const FX_CATS=[
  {name:'진입 (스크롤 등장)', icon:'📥', keys:['scroll-reveal','char-reveal','fade-in','slide-down','slide-left','slide-right','pop-in','mask-wipe','mask-wipe-l','blur-in','skew-in','flip-in','flip-y','zoom-in','zoom-out','bounce-in']},
  {name:'스크롤 연동', icon:'📈', keys:['parallax','scroll-scrub','sticky']},
  {name:'상시 움직임 (루프)', icon:'🔁', keys:['float','pulse','spin','wobble','gradient-flow','marquee','shake','heartbeat','tada','swing','glow-loop','blink']},
  {name:'호버 (마우스)', icon:'🖱', keys:['hover-lift','hover-glow','hover-tilt','hover-grow','hover-sink','hover-rotate','hover-bright','hover-border','hover-dim','hover-float','hover-zoom']},
  {name:'인터랙션', icon:'🧩', keys:['hover-show','hover-hide','tab-trigger','tab-content','hover-expand']},
  {name:'콘텐츠', icon:'🎞', keys:['counter','slider','bg-video']},
];
let _fxCat=null;
const _mkDesc=(result,tip,steps)=>({result,tip,steps:steps||['요소를 선택','이 효과를 적용 (설정값 없이 바로 적용)','화면에 들어오면 재생됩니다']});
const FX_DESC={
  'mask-wipe':_mkDesc('이미지/요소가 아래에서 위로 커튼 걷히듯 드러납니다.','💡 큰 사진·배너에 쓰면 고급스럽게 등장'),
  'mask-wipe-l':_mkDesc('왼쪽에서 오른쪽으로 닦이듯 드러납니다.','💡 가로로 긴 띠·배너에 잘 어울려요'),
  'rotate-in':_mkDesc('살짝 회전하며 또렷해집니다.','💡 카드·아이콘에 생동감'),
  'blur-in':_mkDesc('흐릿하게 시작해 점점 선명해집니다.','💡 사진·제목에 부드러운 등장'),
  'skew-in':_mkDesc('기울어진 채 올라오며 반듯해집니다.','💡 역동적인 섹션 도입부'),
  'flip-in':_mkDesc('위로 젖혀졌다가 펼쳐지며 나타납니다.','💡 카드 뒤집히듯 등장'),
  'zoom-in':_mkDesc('작게 시작해 제 크기로 커집니다.','💡 강조 요소에'),
  'zoom-out':_mkDesc('크게 시작해 제 크기로 줄어듭니다.','💡 임팩트 있는 진입'),
  'bounce-in':_mkDesc('통통 튀듯 탄력 있게 올라옵니다.','💡 버튼·아이콘에 경쾌함'),
  'float':_mkDesc('항상 위아래로 둥실둥실 떠다닙니다.','💡 장식 아이콘·뱃지에',['요소를 선택','둥실 적용 — 상시 반복됩니다']),
  'pulse':_mkDesc('심장 박동처럼 살짝 커졌다 작아지길 반복.','💡 "예약하기" 같은 주목 버튼에',['요소를 선택','맥박 적용 — 상시 반복됩니다']),
  'spin':_mkDesc('천천히 계속 회전합니다.','💡 원형 배지·로딩 장식에',['요소를 선택','회전 적용 — 상시 반복됩니다']),
  'wobble':_mkDesc('나뭇잎처럼 좌우로 살랑입니다.','💡 가벼운 장식 요소에',['요소를 선택','살랑 적용 — 상시 반복됩니다']),
  'gradient-flow':_mkDesc('도형 배경의 그라데이션이 흐르듯 움직입니다.','💡 채우기를 그라데이션으로 설정한 도형에',['그라데이션으로 채운 도형을 선택','그라데이션 흐름 적용']),
  'marquee':_mkDesc('텍스트가 띠처럼 끊임없이 옆으로 흐릅니다.','💡 공지·이벤트 문구 띠에',['텍스트 요소를 선택','흐르는 텍스트 적용']),
  'hover-lift':_mkDesc('마우스를 올리면 떠오르며 그림자가 생깁니다.','💡 카드·버튼에 클릭 유도',['요소를 선택','호버 떠오름 적용']),
  'hover-glow':_mkDesc('마우스를 올리면 은은하게 빛납니다.','💡 강조 버튼·이미지에',['요소를 선택','호버 발광 적용']),
  'hover-tilt':_mkDesc('마우스를 올리면 3D로 살짝 기웁니다.','💡 의료진 사진·카드에',['요소를 선택','호버 3D틸트 적용']),
  'hover-grow':_mkDesc('마우스를 올리면 살짝 커집니다.','💡 썸네일·아이콘에',['요소를 선택','호버 확대 적용']),
  'hover-sink':_mkDesc('마우스를 올리면 살짝 눌립니다(버튼 느낌).','💡 버튼에 누르는 듯한 피드백',['요소를 선택','호버 눌림 적용']),
  'char-reveal':{
    result:'발행 후 이 글자가 한 글자(또는 한 단어)씩 아래에서 떠오르며 순서대로 나타납니다.',
    steps:['큰 제목·슬로건 텍스트를 선택','글자 등장 적용 → 단위(글자/단어)와 속도를 설정','화면에 스크롤로 들어오는 순간 재생됩니다'],
    tip:'💡 메인 히어로 제목에 쓰면 고급 사이트 느낌이 확 살아납니다'
  },
  'parallax':{
    result:'스크롤할 때 이 요소가 본문과 다른 속도로 천천히 떠다녀 깊이감(입체감)이 생깁니다.',
    steps:['배경 이미지·장식 요소를 선택','패럴랙스 적용 → 속도를 설정(양수=느리게 따라옴)','발행 페이지에서 스크롤하면 떠다닙니다'],
    tip:'💡 큰 배경 사진이나 섹션 장식에 살짝(0.1~0.2) 주면 자연스러워요'
  },
  'scroll-scrub':{
    result:'화면에 들어올수록 이 요소가 점점 커지고/선명해집니다. 스크롤 양에 비례해 변합니다.',
    steps:['강조할 이미지·카드·문구를 선택','스크롤 스크럽 적용 → 모드(확대/페이드/둘다) 선택','스크롤로 올라오는 동안 점점 또렷해집니다'],
    tip:'💡 진료과 카드·실적 이미지에 주면 시선을 끕니다'
  },
  'bg-video':{
    result:'이 도형/이미지 박스의 배경에 영상이 자동 재생(무음·반복)됩니다.',
    steps:['배경으로 쓸 도형(사각형)이나 이미지를 선택','배경 영상 적용 → mp4 주소 또는 유튜브/Vimeo 링크 입력','발행 시 영상이 박스를 꽉 채워 재생됩니다(글자 요소는 위에 따로 배치)'],
    tip:'💡 상단 히어로 섹션 배경에 쓰면 임팩트 최고. 위에 텍스트를 따로 올리세요'
  },
  'sticky':{
    result:'스크롤을 내려도 이 요소가 화면 같은 위치(상단)에 계속 붙어 따라옵니다.',
    steps:['로고·상단 메뉴바·예약 버튼 등 고정할 요소를 선택','상단 고정 적용 — 설정값 없이 바로 적용됩니다','여러 요소(로고+메뉴)를 각각 고정하면 함께 따라옵니다'],
    tip:'💡 상단 헤더(로고+메뉴)를 페이지 맨 위에 배치하고 모두 고정하면 항상 보이는 내비게이션이 됩니다'
  },
  'scroll-reveal':{
    result:'방문자가 스크롤을 내리면 이 요소가 아래→위로 떠오르듯 자연스럽게 나타납니다.',
    steps:['이 요소에 스크롤 등장 적용','방향을 고릅니다 (위·왼·오·페이드)','여러 요소를 순서대로 등장시키려면 지연시간을 100ms씩 늘려 주세요'],
    tip:'💡 병원 소개·진료과 카드·사진 등 모든 콘텐츠에 기본으로 쓰면 세련돼 보여요'
  },
  'hover-show':{
    result:'이 요소에 마우스를 올리면 같은 그룹으로 연결된 다른 요소가 나타납니다.',
    steps:['이 요소(버튼·메뉴 등)에 호버 트리거 적용, 그룹 이름 입력 (예: menu1)','나타나게 할 요소를 선택 → 호버 대상 적용 → 같은 그룹 이름 입력','발행 후 트리거에 마우스를 올리면 대상이 보입니다'],
    tip:'💡 내과·외과·피부과 탭 메뉴 만들 때 탭 버튼마다 각 내용 카드를 연결'
  },
  'hover-hide':{
    result:'기본은 숨겨진 상태. 같은 그룹의 트리거에 마우스를 올리면 이 요소가 나타납니다.',
    steps:['호버 트리거 요소를 먼저 만들고 그룹 이름을 정합니다 (예: menu1)','이 요소(나타날 내용)에 호버 대상 적용 → 같은 그룹 이름 입력','발행 시 이 요소는 보이지 않다가 트리거 위에 마우스가 오면 나타납니다'],
    tip:'💡 트리거와 대상의 그룹 이름이 정확히 같아야 연결됩니다'
  },
  'tab-trigger':{
    result:'이 요소를 클릭하면 같은 그룹의 특정 탭 내용이 나타납니다. (탭 버튼 역할)',
    steps:['탭 버튼(텍스트·도형)에 탭 버튼 적용, 그룹 이름(예: dept) + 탭 번호 0 입력','두 번째 버튼에도 같은 그룹(dept) + 탭 번호 1 입력, 반복','각 내용 요소에는 탭 내용 적용 → 같은 그룹 + 대응하는 번호 입력'],
    tip:'💡 진료과 소개 탭: [내과=0][외과=1][피부과=2] 버튼 → 각 소개 카드 연결'
  },
  'tab-content':{
    result:'탭 버튼을 클릭하면 같은 번호의 이 요소가 나타납니다. (탭 내용 영역 역할)',
    steps:['탭 버튼 요소를 먼저 만들고 그룹 이름과 번호를 정합니다','이 요소(내용 카드)에 탭 내용 적용 → 같은 그룹 이름 + 같은 번호 입력','탭 0번 버튼 클릭 → 탭 0번 내용 표시, 1번 버튼 → 1번 내용 표시됩니다'],
    tip:'💡 같은 그룹 이름 + 번호가 일치해야 연결됩니다'
  },
  'hover-zoom':{
    result:'마우스를 올리면 이 요소가 살짝 커졌다가, 벗어나면 원래 크기로 돌아옵니다.',
    steps:['이미지나 카드 도형을 선택','호버 줌 적용 — 설정값 없음, 바로 적용됩니다'],
    tip:'💡 의료진 사진·진료과 카드·이벤트 배너에 추가하면 클릭 유도 효과 UP'
  },
  'hover-expand':{
    result:'평소엔 제목만 보이는 접힌 상태. 마우스를 올리면 아래로 펼쳐져 내용이 보입니다.',
    steps:['카드 도형을 충분한 높이(예: 200px)로 만들고 내용을 입력','아코디언 적용 → 접혔을 때 높이를 설정(예: 60px = 제목만 보이는 높이)','발행 후 마우스를 올리면 60px → 200px로 펼쳐집니다'],
    tip:'💡 FAQ, 진료 안내, 의료진 소개 카드에 딱 맞아요'
  },
  'counter':{
    result:'이 요소가 화면에 보이는 순간, 숫자가 0에서 목표값까지 빠르게 올라갑니다.',
    steps:['텍스트 요소를 선택 (내용은 자동으로 바뀌므로 비워도 됩니다)','카운터 적용 → 시작값·끝값·단위·속도 입력','예) 시작 0 → 끝 2500 → 단위 명 → "환자 수 2500명" 효과'],
    tip:'💡 누적 환자 수, 의료진 수, 수술 건수 같은 병원 실적 수치에 사용하면 신뢰감 UP'
  },
  'slider':{
    result:'이미지 한 장이 여러 장으로 자동으로 넘어가는 슬라이드쇼가 됩니다.',
    steps:['이미지 요소를 선택 (첫 번째 슬라이드가 됩니다)','슬라이더 적용 → 슬라이드 추가 버튼으로 나머지 이미지 업로드','자동재생 간격, 화살표·점 표시 여부를 설정합니다'],
    tip:'💡 병원 외관·내부·장비 사진을 한 곳에 모아 보여줄 때 효과적'
  },
};
let _fxInfoOpen=null;
let _fxPending=null; // null=대기없음, ''=없음 선택, 'scroll-reveal' 등=대기중
let _fxLastElId=null; // 요소 바뀌면 pending 초기화용
function renderFxPanel(){
  const box=document.getElementById('props-fx');
  const e=selId?el(selId):null;
  if(!e){ _fxPending=null; _fxLastElId=null; box.innerHTML='<div class="empty">요소를 선택하면<br>이펙트를 설정할 수 있어요.</div>'; return; }
  // 요소가 바뀌면 pending 초기화
  if(e.id!==_fxLastElId){ _fxPending=null; _fxInfoOpen=null; _fxLastElId=e.id; }
  const fx=e.fx||{}, ft=fx.type||'';

  // pending이 있으면 그걸 하이라이트, 없으면 현재 적용된 것
  const selType = _fxPending!==null ? _fxPending : ft;
  const isPending = _fxPending!==null && _fxPending!==ft;

  // 효과 카드 — 카테고리 폴더(아코디언)
  let cards=`<p class="fx-section-title">효과 선택</p>`;
  cards+=`<button class="fx-none${selType===''?' on':''}" id="fx-none">없음 (효과 제거)</button>`;
  let openCat=_fxCat;
  if(_fxCat==null && selType){ const c=FX_CATS.find(c=>c.keys.includes(selType)); if(c) openCat=c.name; }
  if(openCat==null) openCat=FX_CATS[0].name;
  cards+=`<div class="fx-cats">`;
  FX_CATS.forEach(cat=>{
    const isOpen=cat.name===openCat, has=cat.keys.includes(selType);
    cards+=`<div class="fx-cat-hd${isOpen?' open':''}${has?' has':''}" data-fxcat="${cat.name}"><span class="fc-ic">${cat.icon}</span><span class="fc-nm">${cat.name}</span><span class="fc-cnt">${cat.keys.length}</span><span class="fc-arr">${isOpen?'▾':'▸'}</span></div>`;
    if(isOpen){
      cards+=`<div class="fx-grid">`;
      cat.keys.forEach(k=>{ if(!FX_NAMES[k]) return;
        cards+=`<div class="fx-card${selType===k?' on':''}" data-fx="${k}">
          <button class="fc-info" data-fxi="${k}" title="설명 보기">ⓘ</button>
          <span class="fc-icon">${FX_ICONS[k]}</span>
          <span class="fc-name">${FX_NAMES[k]}</span>
        </div>`;
      });
      cards+=`</div>`;
    }
  });
  cards+=`</div>`;
  // 적용 버튼 바 (선택이 변경됐을 때만 표시)
  if(isPending || (_fxPending===''&&ft)){
    const pendingLabel = _fxPending===''?'없음':FX_NAMES[_fxPending]||_fxPending;
    cards+=`<div id="fx-apply-bar" style="display:flex;gap:6px;margin-bottom:12px;padding:10px;background:rgba(108,123,255,.12);border:1px solid rgba(108,123,255,.3);border-radius:9px;align-items:center">
      <span style="font-size:12px;color:var(--accent2);flex:1">→ <b>${pendingLabel}</b> 으로 변경</span>
      <button id="fx-cancel-btn" class="tb-btn" style="padding:6px 12px;font-size:12px">취소</button>
      <button id="fx-apply-btn" class="tb-btn primary" style="padding:6px 14px;font-size:12px;font-weight:700">✓ 적용</button>
    </div>`;
  }

  // 설명 박스 — 카드 선택(pending)만 해도 자동 표시, ⓘ는 덮어씌움
  const descTarget=_fxInfoOpen||(selType!==''?selType:null)||ft;
  let descHtml='';
  if(descTarget&&(FX_DESC[descTarget]||FX_NAMES[descTarget])){
    const d=FX_DESC[descTarget]||{result:'요소를 선택하고 적용하면 발행/미리보기에서 재생됩니다.',tip:'💡 한 요소에 효과는 1개만',steps:['요소를 선택','이 효과를 적용 (설정값 없이 바로)','▶ 미리보기에서 확인']};
    const stepsHtml=d.steps.map((s,i)=>`<div class="fd-step"><span class="fd-step-num">${i+1}</span><span>${s}</span></div>`).join('');
    descHtml=`<div class="fx-desc-box">
      <div class="fd-title">${FX_ICONS[descTarget]||'✨'} ${FX_NAMES[descTarget]}</div>
      <div class="fd-result">${d.result}</div>
      <div class="fd-steps-title">적용 방법</div>
      ${stepsHtml}
      <div class="fd-tip">${d.tip}</div>
    </div>`;
  }

  // 옵션 영역 — 현재 적용된 효과(ft) 기준으로만 옵션 표시 (pending 중엔 숨김)
  let opts='';
  if(ft && _fxPending===null){
    opts+=`<div class="fx-opts">`;
    if(ft==='scroll-reveal'){
      opts+=`<div class="grp"><label class="lbl">등장 방향</label>
        <div class="btn-grp">
          ${['up','left','right','fade'].map(d=>`<button class="dir-btn${(fx.dir||'up')===d?' on':''}" data-dir="${d}">${d==='up'?'⬆위':d==='left'?'⬅왼':d==='right'?'➡오':' 페이드'}</button>`).join('')}
        </div></div>
        <div class="grp"><label class="lbl">지연 시간 <span style="float:right;color:var(--accent)">${fx.delay||0}ms</span></label>
          <input type="range" id="eff-delay" min="0" max="1500" step="100" value="${fx.delay||0}">
        </div>`;
    }
    if(ft==='hover-show'||ft==='hover-hide'){
      if(!fx.group){if(!e.fx)e.fx={};e.fx.type=ft;e.fx.group='hv_'+e.id.slice(0,6);}
      const myGroup=e.fx.group;
      const partnerType=ft==='hover-show'?'hover-hide':'hover-show';
      const partnerLabel=ft==='hover-show'?'마우스 올리면 나타날 요소':'이 요소를 보여줄 트리거 요소';
      const pageEls=page().elements.filter(x=>x.id!==e.id);
      opts+=`<div class="grp"><label class="lbl">${partnerLabel}</label>
        <div style="display:flex;flex-direction:column;gap:5px;max-height:160px;overflow-y:auto" id="el-linker">
        ${pageEls.length===0?`<div style="font-size:12px;color:var(--sub);text-align:center;padding:10px">페이지에 다른 요소가 없습니다</div>`
        :pageEls.map(x=>{
          const xfx=x.fx||{};
          const linked=xfx.type===partnerType&&xfx.group===myGroup;
          const icon=x.type==='text'?'📝':x.type==='image'?'🖼':'⬛';
          const preview=x.type==='text'?(x.text||'텍스트').slice(0,18):x.type==='image'?'이미지':x.type==='table'?`표${x.cols}×${x.rows}`:(SHAPE_LABELS[x.shape]||'도형');
          const hasOtherFx=xfx.type&&xfx.type!==partnerType;
          return `<div class="el-link-row" data-lid="${x.id}" data-linked="${linked}" data-partner="${partnerType}" data-group="${myGroup}" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:${linked?'rgba(108,123,255,.15)':'var(--panel2)'};border:1.5px solid ${linked?'var(--accent)':'var(--border)'};border-radius:8px;cursor:pointer;transition:.15s">
            <span style="font-size:14px">${icon}</span>
            <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${hasOtherFx?'var(--sub)':'var(--text)'}">${preview}${hasOtherFx?` (${FX_NAMES[xfx.type]||xfx.type})`:''}</span>
            <span style="font-size:11px;font-weight:700;color:${linked?'var(--accent2)':'var(--sub)'};">${linked?'✓ 연결됨':'+ 연결'}</span>
          </div>`;
        }).join('')}
        </div>
        <div style="font-size:11px;color:var(--sub);margin-top:6px">클릭해서 연결 / 다시 클릭하면 해제</div>
      </div>`;
    }
    if(ft==='tab-trigger'||ft==='tab-content'){
      if(!fx.group){if(!e.fx)e.fx={};e.fx.type=ft;e.fx.group='tab_'+e.id.slice(0,6);}
      const myGroup=e.fx.group;
      const myIdx=fx.idx||0;
      const partnerType=ft==='tab-trigger'?'tab-content':'tab-trigger';
      const partnerLabel=ft==='tab-trigger'?'이 버튼이 보여줄 내용 요소':'이 내용을 활성화하는 탭 버튼';
      const pageEls=page().elements.filter(x=>x.id!==e.id);
      opts+=`<div class="grp"><label class="lbl">탭 번호 <span style="color:var(--sub);font-weight:400">(0부터 시작)</span></label><input type="number" id="eff-idx" value="${myIdx}" min="0" max="20"></div>
      <div class="grp"><label class="lbl">${partnerLabel}</label>
        <div style="display:flex;flex-direction:column;gap:5px;max-height:160px;overflow-y:auto" id="el-linker">
        ${pageEls.length===0?`<div style="font-size:12px;color:var(--sub);text-align:center;padding:10px">페이지에 다른 요소가 없습니다</div>`
        :pageEls.map(x=>{
          const xfx=x.fx||{};
          const linked=xfx.type===partnerType&&xfx.group===myGroup&&(xfx.idx||0)===myIdx;
          const icon=x.type==='text'?'📝':x.type==='image'?'🖼':'⬛';
          const preview=x.type==='text'?(x.text||'텍스트').slice(0,18):x.type==='image'?'이미지':x.type==='table'?`표${x.cols}×${x.rows}`:(SHAPE_LABELS[x.shape]||'도형');
          const hasOtherFx=xfx.type&&xfx.type!==partnerType;
          return `<div class="el-link-row" data-lid="${x.id}" data-linked="${linked}" data-partner="${partnerType}" data-group="${myGroup}" data-idx="${myIdx}" style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:${linked?'rgba(108,123,255,.15)':'var(--panel2)'};border:1.5px solid ${linked?'var(--accent)':'var(--border)'};border-radius:8px;cursor:pointer;transition:.15s">
            <span style="font-size:14px">${icon}</span>
            <span style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${preview}${hasOtherFx?` <span style="font-size:10px;color:var(--sub)">(${FX_NAMES[xfx.type]||xfx.type})</span>`:''}</span>
            <span style="font-size:11px;font-weight:700;color:${linked?'var(--accent2)':'var(--sub)'};">${linked?'✓ 연결됨':'+ 연결'}</span>
          </div>`;
        }).join('')}
        </div>
        <div style="font-size:11px;color:var(--sub);margin-top:6px">클릭해서 연결 / 다시 클릭하면 해제</div>
      </div>`;
    }
    if(ft==='counter'){
      opts+=`<div class="grp"><div class="row"><div style="flex:1"><label class="lbl">시작</label><input type="number" id="eff-from" value="${fx.from||0}"></div>
        <div style="flex:1"><label class="lbl">끝</label><input type="number" id="eff-to" value="${fx.to||100}"></div>
        <div style="flex:1"><label class="lbl">단위</label><input type="text" id="eff-suf" value="${fx.suffix||''}" placeholder="%"></div></div></div>
      <div class="grp"><label class="lbl">지속 시간 <span style="float:right;color:var(--accent)">${(fx.dur||2000)/1000}초</span></label>
        <input type="range" id="eff-dur" min="500" max="8000" step="500" value="${fx.dur||2000}">
      </div>`;
    }
    if(ft==='slider'){
      const slides=fx.slides||[];
      opts+=`<div class="grp"><label class="lbl">슬라이드 이미지</label>
        <div style="font-size:11px;color:var(--sub);margin-bottom:8px">첫 번째는 요소 이미지가 자동 사용됩니다</div>
        ${slides.map((s,i)=>`<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px;padding:5px;background:var(--panel2);border-radius:7px;border:1px solid var(--border)">
          <img src="${s}" style="width:48px;height:34px;object-fit:cover;border-radius:5px;flex-shrink:0">
          <span style="font-size:11px;color:var(--sub);flex:1">${i+2}번째 슬라이드</span>
          <button id="sl-del-${i}" style="font-size:11px;padding:3px 8px;border-radius:5px;border:1px solid var(--border);background:none;color:var(--sub);cursor:pointer">✕</button>
        </div>`).join('')}
        <button id="eff-sl-add" class="tb-btn" style="width:100%;margin-top:2px">＋ 슬라이드 추가</button>
      </div>
      <div class="grp"><label class="lbl">자동재생 간격 <span style="float:right;color:var(--accent)">${(fx.interval||3000)/1000}초</span></label>
        <input type="range" id="eff-interval" min="1000" max="8000" step="500" value="${fx.interval||3000}">
      </div>
      <div class="btn-grp grp">
        <button id="eff-auto" class="${fx.auto!==false?'on':''}">⏯ 자동재생</button>
        <button id="eff-arrows" class="${fx.arrows!==false?'on':''}">◀▶ 화살표</button>
        <button id="eff-dots" class="${fx.dots!==false?'on':''}">● 점</button>
      </div>`;
    }
    if(ft==='hover-expand'){
      opts+=`<div class="grp"><label class="lbl">접혔을 때 높이 <span style="float:right;color:var(--accent)">${fx.collapsedH||60}px</span></label>
        <input type="range" id="eff-colh" min="20" max="${Math.max(e.h-10,30)}" step="5" value="${fx.collapsedH||60}">
        <div style="font-size:11px;color:var(--sub);margin-top:5px">펼쳤을 때는 요소 높이(${e.h}px) 그대로 사용됩니다</div>
      </div>`;
    }
    if(ft==='char-reveal'){
      opts+=`<div class="grp"><label class="lbl">분해 단위</label><div class="btn-grp">
        <button class="cr-mode${(fx.mode||'char')==='char'?' on':''}" data-crm="char">글자</button>
        <button class="cr-mode${fx.mode==='word'?' on':''}" data-crm="word">단어</button></div></div>
      <div class="grp"><label class="lbl">간격(속도) <span style="float:right;color:var(--accent)">${fx.stagger!=null?fx.stagger:40}ms</span></label>
        <input type="range" id="eff-stagger" min="10" max="160" step="10" value="${fx.stagger!=null?fx.stagger:40}"></div>`;
    }
    if(ft==='parallax'){
      opts+=`<div class="grp"><label class="lbl">속도 <span style="float:right;color:var(--accent)">${fx.speed!=null?fx.speed:0.15}</span></label>
        <input type="range" id="eff-speed" min="-0.4" max="0.4" step="0.05" value="${fx.speed!=null?fx.speed:0.15}">
        <div style="font-size:11px;color:var(--sub);margin-top:5px">양수=느리게 따라옴, 음수=먼저 올라감. 0.1~0.2 권장</div></div>`;
    }
    if(ft==='scroll-scrub'){
      opts+=`<div class="grp"><label class="lbl">변하는 항목</label><div class="btn-grp">
        <button class="ss-mode${(fx.mode||'both')==='both'?' on':''}" data-ssm="both">확대+페이드</button>
        <button class="ss-mode${fx.mode==='scale'?' on':''}" data-ssm="scale">확대만</button>
        <button class="ss-mode${fx.mode==='fade'?' on':''}" data-ssm="fade">페이드만</button></div></div>`;
    }
    if(ft==='bg-video'){
      opts+=`<div class="grp"><label class="lbl">영상 주소 (mp4 / 유튜브 / Vimeo)</label>
        <input type="text" id="eff-bgsrc" value="${(fx.src||'').replace(/"/g,'&quot;')}" placeholder="https://...mp4 또는 유튜브 링크">
        <div style="font-size:11px;color:var(--sub);margin-top:5px">무음·자동반복 재생됩니다. 글자는 위에 별도 요소로 올리세요.</div></div>`;
    }
    opts+=`</div>`;
  }

  box.innerHTML=cards+descHtml+opts;

  // 카드 클릭 → pending 상태로만 (즉시 적용 안 함)
  box.querySelectorAll('.fx-cat-hd').forEach(h=>{
    h.addEventListener('click',()=>{ _fxCat = (h.dataset.fxcat===openCat) ? '__none__' : h.dataset.fxcat; renderFxPanel(); });
  });
  box.querySelectorAll('.fx-card').forEach(c=>{
    c.addEventListener('click',ev=>{
      if(ev.target.closest('.fc-info')) return;
      const t=c.dataset.fx;
      _fxPending = (t===ft) ? null : t; // 현재랑 같으면 pending 해제
      renderFxPanel();
    });
  });
  // 없음 버튼
  const noneBtn=document.getElementById('fx-none');
  if(noneBtn) noneBtn.addEventListener('click',()=>{
    _fxPending = ft ? '' : null; // 현재 효과 있을 때만 pending
    renderFxPanel();
  });
  // 적용 버튼
  const applyBtn=document.getElementById('fx-apply-btn');
  if(applyBtn) applyBtn.addEventListener('click',()=>{
    const _ts=selAll(); const _t=_ts.length?_ts:[e];   // 그룹/다중선택이면 전체 적용
    if(_fxPending===''){ _t.forEach(x=>delete x.fx); }
    else if(_fxPending){ _t.forEach(x=>{ if(!x.fx)x.fx={}; x.fx.type=_fxPending; }); }
    _fxPending=null; _fxInfoOpen=null;
    renderFxPanel();renderProps();renderCanvas();save(true);snapshot();   // liveStyle()(renderProps 지역함수)는 스코프 밖→에러였음. 전체 갱신으로 교체
    if(_t.length>1) toast(`${_t.length}개에 적용됨`);
  });
  // 취소 버튼
  const cancelBtn=document.getElementById('fx-cancel-btn');
  if(cancelBtn) cancelBtn.addEventListener('click',()=>{ _fxPending=null; renderFxPanel(); });
  // 요소 연결/해제 클릭
  box.querySelectorAll('.el-link-row').forEach(row=>{
    row.addEventListener('click',()=>{
      const targetEl=page().elements.find(x=>x.id===row.dataset.lid);
      if(!targetEl) return;
      const linked=row.dataset.linked==='true';
      const partnerType=row.dataset.partner;
      const myGroup=row.dataset.group;
      const myIdx=row.dataset.idx!==undefined?+row.dataset.idx:undefined;
      if(linked){
        // 해제
        delete targetEl.fx;
      } else {
        // 연결
        if(!targetEl.fx) targetEl.fx={};
        targetEl.fx.type=partnerType;
        targetEl.fx.group=myGroup;
        if(myIdx!==undefined) targetEl.fx.idx=myIdx;
      }
      renderFxPanel(); renderCanvas(); save(true); snapshot();
    });
  });
  // ⓘ 설명 버튼
  box.querySelectorAll('.fc-info').forEach(b=>{
    b.addEventListener('click',ev=>{
      ev.stopPropagation();
      const k=b.dataset.fxi;
      _fxInfoOpen=_fxInfoOpen===k?null:k;
      renderFxPanel();
    });
  });
  // 방향 버튼
  box.querySelectorAll('.dir-btn').forEach(b=>{
    b.addEventListener('click',()=>{ if(!e.fx)e.fx={}; e.fx.dir=b.dataset.dir; renderFxPanel();snapshot(); });
  });
  // range/text 바인딩
  function rangeSync(id,cb){
    const el2=document.getElementById(id); if(!el2)return;
    el2.addEventListener('input',()=>{ cb(el2.value); renderFxPanel(); save(true); });
    el2.addEventListener('change',snapshot);
  }
  rangeSync('eff-delay',v=>{if(!e.fx)e.fx={};e.fx.delay=+v;});
  rangeSync('eff-dur',v=>{if(!e.fx)e.fx={};e.fx.dur=+v;});
  rangeSync('eff-interval',v=>{if(!e.fx)e.fx={};e.fx.interval=+v;});
  rangeSync('eff-colh',v=>{if(!e.fx)e.fx={};e.fx.collapsedH=+v;});
  rangeSync('eff-stagger',v=>{if(!e.fx)e.fx={};e.fx.stagger=+v;});
  rangeSync('eff-speed',v=>{if(!e.fx)e.fx={};e.fx.speed=parseFloat(v);});
  document.querySelectorAll('.cr-mode').forEach(b=>b.addEventListener('click',()=>{if(!e.fx)e.fx={};e.fx.mode=b.dataset.crm;renderFxPanel();save(true);snapshot();}));
  document.querySelectorAll('.ss-mode').forEach(b=>b.addEventListener('click',()=>{if(!e.fx)e.fx={};e.fx.mode=b.dataset.ssm;renderFxPanel();save(true);snapshot();}));
  function textSync(id,cb){
    const el2=document.getElementById(id); if(!el2)return;
    el2.addEventListener('input',()=>{cb(el2.value);save(true);});
    el2.addEventListener('change',snapshot);
  }
  textSync('eff-group',v=>{if(!e.fx)e.fx={};e.fx.group=v;});
  textSync('eff-idx',v=>{if(!e.fx)e.fx={};e.fx.idx=+v||0;});
  textSync('eff-from',v=>{if(!e.fx)e.fx={};e.fx.from=+v||0;});
  textSync('eff-to',v=>{if(!e.fx)e.fx={};e.fx.to=+v||0;});
  textSync('eff-suf',v=>{if(!e.fx)e.fx={};e.fx.suffix=v;});
  textSync('eff-bgsrc',v=>{if(!e.fx)e.fx={};e.fx.src=v.trim();e.fx.kind=/youtu/.test(v)?'youtube':/vimeo/.test(v)?'vimeo':'mp4';});
  // 슬라이더 버튼
  const effSlAdd=document.getElementById('eff-sl-add');
  if(effSlAdd) effSlAdd.addEventListener('click',()=>{
    const fi=document.createElement('input');fi.type='file';fi.accept='image/*';
    fi.onchange=()=>{const f=fi.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{if(!e.fx)e.fx={};if(!e.fx.slides)e.fx.slides=[];e.fx.slides.push(r.result);renderFxPanel();save(true);snapshot();};r.readAsDataURL(f);};fi.click();
  });
  (fx.slides||[]).forEach((_,i)=>{const d=document.getElementById(`sl-del-${i}`);if(d)d.addEventListener('click',()=>{e.fx.slides.splice(i,1);renderFxPanel();save(true);snapshot();});});
  ['eff-auto','eff-arrows','eff-dots'].forEach(bid=>{const b=document.getElementById(bid);if(b)b.addEventListener('click',()=>{if(!e.fx)e.fx={};const k=bid==='eff-auto'?'auto':bid==='eff-arrows'?'arrows':'dots';e.fx[k]=e.fx[k]===false;renderFxPanel();save(true);snapshot();});});
}

// ───────────────────────── 탭 전환 ─────────────────────────
let _activePropTab='attrs';
function switchPropTab(tab){
  _activePropTab=tab;
  document.getElementById('ptab-attrs').classList.toggle('on',tab==='attrs');
  document.getElementById('ptab-fx').classList.toggle('on',tab==='fx');
  document.getElementById('props-body').style.display=tab==='attrs'?'':'none';
  document.getElementById('props-fx').style.display=tab==='fx'?'':'none';
  if(tab==='fx') renderFxPanel();
}
document.getElementById('ptab-attrs').addEventListener('click',()=>switchPropTab('attrs'));
document.getElementById('ptab-fx').addEventListener('click',()=>switchPropTab('fx'));

// ───────────────────────── 패널 접기/펼치기 (전역) ─────────────────────────
let _pagesCol=false, _propsCol=false;
function togglePagesPanel(){ _pagesCol=!_pagesCol; document.documentElement.style.setProperty('--pages-w', _pagesCol?'26px':pagesWidthPx()); document.getElementById('pages-panel').classList.toggle('col',_pagesCol); }
// 페이지 패널에서 Shift/Ctrl + 휠 = 썸네일 크기 조절
(function(){
  const pp=document.getElementById('pages-panel');
  pp.addEventListener('wheel', ev=>{
    if(!ev.shiftKey && !ev.ctrlKey && !ev.metaKey) return; // 일반 스크롤은 목록 스크롤
    if(_pagesCol) return;
    ev.preventDefault();
    _thumbW = Math.max(96, Math.min(320, _thumbW + (ev.deltaY<0?14:-14)));
    document.documentElement.style.setProperty('--pages-w', pagesWidthPx());
    renderPages();
  }, {passive:false});
})();
function togglePropsPanel(){ _propsCol=!_propsCol; document.documentElement.style.setProperty('--props-w', _propsCol?'26px':'300px'); document.getElementById('props').classList.toggle('col',_propsCol); }

function syncPosInputs(e){
  const map={'p-x':e.x,'p-y':e.y,'p-w':e.w,'p-h':e.h,'p-rot':e.rot};
  for(const id in map){ const i=document.getElementById(id); if(i && document.activeElement!==i) i.value=Math.round(map[id]); }
}

// ───────────────────────── 줌 ─────────────────────────
function applyZoom(){
  canvasWrap.style.transform=`scale(${zoom})`;
  document.getElementById('zoom-val').textContent=Math.round(zoom*100)+'%';
}
function fitZoom(){
  const stage=document.getElementById('stage');
  const avail=stage.clientHeight-80;
  zoom=Math.max(0.1, Math.min(1, avail/page().h, (stage.clientWidth-80)/page().w));
  applyZoom();
}
document.getElementById('zoom-in').onclick=()=>{ zoom=Math.min(3,zoom+0.1); applyZoom(); updateRibbonState(); };
document.getElementById('zoom-out').onclick=()=>{ zoom=Math.max(0.1,zoom-0.1); applyZoom(); updateRibbonState(); };
document.getElementById('zoom-fit').onclick=()=>{ fitZoom(); updateRibbonState(); };

// ── Shift/Ctrl + 휠 = 커서 기준 줌 (커서가 있는 지점을 고정하고 확대/축소) ──
(function(){
  const stage=document.getElementById('stage');
  stage.addEventListener('wheel', ev=>{
    if(!ev.shiftKey && !ev.ctrlKey && !ev.metaKey) return; // 일반 스크롤은 그대로
    ev.preventDefault();
    const wr=canvasWrap.getBoundingClientRect();
    const cx=(ev.clientX-wr.left)/zoom, cy=(ev.clientY-wr.top)/zoom; // 커서 아래 콘텐츠 좌표
    const factor=ev.deltaY<0?1.1:1/1.1;
    const nz=Math.max(0.1, Math.min(3, zoom*factor));
    if(nz===zoom) return;
    zoom=nz; applyZoom(); updateRibbonState();
    const wr2=canvasWrap.getBoundingClientRect(); // 줌 후 위치
    stage.scrollLeft += (wr2.left + cx*zoom) - ev.clientX; // 커서 아래 지점을 그대로 유지
    stage.scrollTop  += (wr2.top  + cy*zoom) - ev.clientY;
  }, {passive:false});
})();

// ── 페이지 길이(높이) 드래그 조절 ──
(function(){
  const h=document.getElementById('page-resize'); let st=null;
  h.addEventListener('mousedown',ev=>{ ev.preventDefault(); st={sy:ev.clientY, oh:page().h}; window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up); });
  function mv(ev){ const nh=Math.max(400, Math.round(st.oh+(ev.clientY-st.sy)/zoom)); page().h=nh; canvas.style.height=nh+'px'; document.getElementById('pmeta').textContent=`${page().w} × ${nh}`; }
  function up(){ window.removeEventListener('mousemove',mv); window.removeEventListener('mouseup',up); if(st){ st=null; snapshot(); renderPages(); renderProps(); save(true); } }
})();

// ───────────────────────── 버튼/단축키 ─────────────────────────
document.getElementById('add-text').onclick=addText;
document.getElementById('add-image').onclick=addImage;
document.getElementById('add-table').onclick=()=>document.getElementById('table-modal').style.display='flex';
document.getElementById('add-page').onclick=()=>{
  if(editorDevice==='mobile'){
    const np={ id:uid(), name:'모바일 페이지', device:'mobile', parentId:null, w:MOBILE_W, h:MOBILE_H, bg:'#ffffff', elements:[] };
    addContentPage(np); afterMutate();
    toast('모바일 페이지 추가됨 (430px 폭)');
  } else openTplModal();
};
document.getElementById('dev-toggle').onclick=()=>{
  editorDevice = editorDevice==='pc' ? 'mobile' : 'pc';
  // 현재 페이지가 이 디바이스에 안 보이면, 보이는 첫 페이지로 이동
  const cur=project.pages[curPage];
  if(!cur || (!cur.isHeader && !cur.isFooter && !inDevice(cur, editorDevice))){
    const idx=project.pages.findIndex(p=>!p.isHeader&&!p.isFooter&&inDevice(p,editorDevice));
    if(idx>=0) curPage=idx;
  }
  selId=null; selIds=new Set();
  renderCanvas(); renderPages(); renderProps(); updateRibbonState();
  toast(editorDevice==='mobile'?'📱 모바일 편집 모드 — ＋페이지 추가 시 430px 모바일 페이지 생성':'💻 PC 편집 모드');
};
document.getElementById('add-header').onclick=addHeaderBar;
document.getElementById('add-footer').onclick=addFooterBar;
function aimobStatus(s){ const el2=document.getElementById('aimob-status'); if(el2) el2.textContent=s; }
document.getElementById('ai-mobile-convert').onclick=()=>{
  if(!isAdmin){ toast('로그인이 필요합니다'); openLogin(); return; }
  const src=page();
  if(!src.elements.length){ toast('변환할 요소가 없습니다'); return; }
  const isAdjust = pageDevice(src)==='mobile';
  const barLabel = src.isHeader?'상단 바':src.isFooter?'하단 바':'';
  document.getElementById('aimob-title').textContent = isAdjust ? `🤖 AI 모바일 ${barLabel||'레이아웃'} 수정` : `🤖 AI 모바일 ${barLabel?barLabel+' ':''}변환`;
  document.getElementById('aimob-label').textContent = isAdjust ? '수정 요청' : '모바일 배치 요청 (선택)';
  document.getElementById('aimob-go').textContent = isAdjust ? '수정 실행' : '변환 실행';
  document.getElementById('aimob-hint').textContent = isAdjust
    ? '현재 모바일을 요청대로 다시 배치합니다(내용은 유지).'
    : src.isHeader ? '상단 바를 모바일 형식으로 — 로고만 크게 남기고 메뉴 탭은 햄버거(☰)로 이동합니다.'
    : src.isFooter ? '하단 바를 모바일 형식으로 — 글자를 가운데·크게 세로로 배치합니다.'
    : 'PC 페이지를 모바일(430px)로 변환해 새 모바일 페이지를 만듭니다. 원본은 PC 전용이 됩니다.';
  aimobStatus(''); document.getElementById('aimob-modal').style.display='flex';
  setTimeout(()=>document.getElementById('aimob-desc').focus(),0);
};
document.getElementById('aimob-close').onclick=()=>document.getElementById('aimob-modal').style.display='none';
document.getElementById('aimob-modal').addEventListener('mousedown',e=>{ if(e.target.id==='aimob-modal') e.currentTarget.style.display='none'; });
document.querySelectorAll('#aimob-modal [data-aimob-preset]').forEach(b=>b.addEventListener('click',()=>{ document.getElementById('aimob-desc').value=b.dataset.aimobPreset; }));
document.getElementById('aimob-go').onclick=()=>runMobileConvert(document.getElementById('aimob-desc').value.trim());

async function runMobileConvert(desc){
  if(!isAdmin){ toast('로그인이 필요합니다'); openLogin(); return; }
  const src=page();
  if(!src.elements.length) return;
  const isAdjust = pageDevice(src)==='mobile';
  const isHeader=!!src.isHeader, isFooter=!!src.isFooter, isBar=isHeader||isFooter;
  const targetW = isAdjust ? src.w : MOBILE_W, cw = targetW-48;
  const payload=src.elements.map((e,i)=>{
    const o={i,type:e.type,x:Math.round(e.x),y:Math.round(e.y),w:Math.round(e.w),h:Math.round(e.h)};
    if(e.type==='text'){ o.text=(e.text||'').replace(/\n/g,' ').slice(0,80); o.fontSize=e.fontSize; o.weight=e.fontWeight; o.align=e.align; }
    if(e.type==='shape'){ o.shape=e.shape; }
    return o;
  });
  const sys=`너는 반응형 웹 디자이너다. 아래는 ${isAdjust?`모바일(폭 ${targetW}px) 페이지`:`PC(폭 ${src.w}px) 페이지`} 요소 목록(JSON)이다. 이를 모바일(폭 ${targetW}px) 세로 레이아웃으로 ${isAdjust?'다시 배치':'재배치'}하라.
규칙:
- 좌우 여백 24px → 콘텐츠 폭 ${cw}px 기준. 대부분 요소는 x=24, w=${cw}(풀폭). 작은 버튼/아이콘은 가운데 정렬 가능.
- 원래 순서(위→아래)대로 세로 1열로 쌓는다. 나란히 있던 카드/이미지도 세로로 쌓아라.
- 텍스트 글자 크기: 큰 제목 30~40, 소제목 22~26, 본문 16~18 (fontSize로 지정).
- 요소 사이 간격 16~40px, 섹션 사이는 더 넉넉히. 맨 위는 y≥24.
- 위치·크기·(텍스트)글자크기만 정하라. 색·폰트·문구·이미지·링크·효과는 유지된다.
${isHeader?`\n★이것은 상단 바(헤더)다: 로고로 보이는 "가장 큰 글자" 1개만 남기고 x=76(좌측 햄버거 메뉴 자리)·세로 가운데에 두고 fontSize 24~28. 네비게이션 탭(병원소개/진료안내/오시는길 등 작은 글자)은 els에서 모두 빼라(햄버거로 대체됨). 전체 높이 h는 56~72.`:''}${isFooter?`\n★이것은 하단 바(푸터)다: 모든 글자를 가운데 정렬(x=24,w=${cw})로 세로로 쌓아라. 큰글자/회사명 22, 본문 16, 저작권 13. 충분한 높이.`:''}
${desc?`★ 사용자 요청을 최우선 반영: "${desc}"`:''}
출력 JSON 하나만: {"h":전체페이지높이, "els":[{"i":원본인덱스,"x":,"y":,"w":,"h":,"fontSize":(텍스트만)} ...]}`;
  const go=document.getElementById('aimob-go'); go.disabled=true; const ot=go.textContent; go.textContent='🤖 처리 중…';
  aimobStatus('AI가 모바일 레이아웃을 구성 중…');
  try{
    const parsed=await aiCall(sys, JSON.stringify(payload), 6000);
    const els=Array.isArray(parsed.els)?parsed.els:[];
    if(!els.length) throw new Error('결과가 비었습니다 (다시 시도)');
    if(isAdjust){
      // 현재 모바일 페이지를 제자리 재배치 (요소 유지, 위치/크기만 갱신)
      const byI={}; els.forEach(o=>{ if(o&&o.i!=null) byI[o.i]=o; });
      src.elements.forEach((e,i)=>{ const o=byI[i]; if(!o)return;
        if(o.x!=null)e.x=Math.round(o.x); if(o.y!=null)e.y=Math.round(o.y);
        if(o.w!=null)e.w=Math.max(8,Math.round(o.w)); if(o.h!=null)e.h=Math.max(8,Math.round(o.h));
        if(o.fontSize&&e.type==='text')e.fontSize=Math.round(o.fontSize); });
      if(parsed.h) src.h=Math.max(MOBILE_H,Math.round(parsed.h));
      selId=null; selIds=new Set(); afterMutate(); document.getElementById('aimob-modal').style.display='none';
      toast('📱 모바일 레이아웃 수정됨');
    } else {
      const srcEls=src.elements;
      const newEls=els.filter(o=>o&&srcEls[o.i]).map(o=>{ const s=JSON.parse(JSON.stringify(srcEls[o.i])); s.id=uid();
        s.x=Math.round(o.x)||0; s.y=Math.round(o.y)||0; s.w=Math.max(8,Math.round(o.w)||cw); s.h=Math.max(8,Math.round(o.h)||40);
        if(o.fontSize&&s.type==='text') s.fontSize=Math.round(o.fontSize); return s; });
      if(!newEls.length) throw new Error('결과가 비었습니다');
      const rawH=Math.round(parsed.h)|| (Math.max(...newEls.map(e=>e.y+e.h))+(isHeader?12:40));
      const ph = isHeader ? Math.min(120,Math.max(48,rawH)) : isFooter ? Math.max(120,rawH) : Math.max(MOBILE_H,rawH);
      const mp={ id:uid(), name:(src.name||'페이지').replace(/\s*\(모바일\)$/,'')+(isBar?'(모바일)':' (모바일)'), device:'mobile', parentId:null, w:MOBILE_W, h:ph, bg:src.bg, elements:newEls };
      if(isHeader) mp.isHeader=true; if(isFooter) mp.isFooter=true;
      src.device='pc';
      project.pages.push(mp); if(!isBar) ensureMobileBars(); curPage=pageIndex(mp.id); editorDevice='mobile'; selId=null; selIds=new Set();
      afterMutate(); document.getElementById('aimob-modal').style.display='none';
      toast(isBar?`📱 모바일 ${isHeader?'상단':'하단'} 바 생성됨 — 원본은 PC 전용`:'📱 모바일 페이지 + 모바일 상단/하단 바 생성됨 — 원본은 PC 전용');
    }
  }catch(e){ aimobStatus('실패: '+_aiErr(e)); }
  finally{ go.disabled=false; go.textContent=ot; }
}

// ── 도형 피커 (PPT식 카테고리 갤러리) ──
function shapeIconStyle(k){
  if(k==='line') return 'height:3px;align-self:center'; // 가로 막대 미리보기
  if(k==='line-arrow') return 'clip-path:polygon(0 42%,75% 42%,75% 20%,100% 50%,75% 80%,75% 58%,0 58%)'; // 가로 화살표
  const clip=SHAPE_CLIP[k];
  if(clip) return `clip-path:${clip}`;
  if(k==='circle') return 'border-radius:50%';
  if(k==='rrect') return 'border-radius:6px';
  return 'border-radius:1px'; // rect
}
(function(){
  const grid=document.getElementById('shape-grid');
  function pickShape(k){ addShape(k); document.getElementById('shape-modal').style.display='none'; }
  function cellHtml(k){
    return `<div class="sp-cell" data-shape="${k}" title="${SHAPE_LABELS[k]||k}"><div class="sp-ic" style="${shapeIconStyle(k)}"></div></div>`;
  }
  function renderGallery(){
    let recent=[]; try{ recent=JSON.parse(localStorage.getItem('hw_recent_shapes')||'[]'); }catch(_){}
    let html='';
    if(recent.length){
      html+=`<div class="sp-cat">최근 사용한 도형</div><div class="sp-grid">${recent.map(cellHtml).join('')}</div><div class="sp-sep"></div>`;
    }
    SHAPE_CATS.forEach(cat=>{
      html+=`<div class="sp-cat">${cat.name}</div><div class="sp-grid">${cat.keys.map(cellHtml).join('')}</div>`;
    });
    grid.innerHTML=html;
    grid.querySelectorAll('.sp-cell').forEach(c=>c.addEventListener('click',()=>pickShape(c.dataset.shape)));
  }
  document.getElementById('open-shape').onclick=()=>{ renderGallery(); document.getElementById('shape-modal').style.display='flex'; };
  document.getElementById('shape-modal-close').onclick=()=>document.getElementById('shape-modal').style.display='none';
  document.getElementById('shape-modal').addEventListener('mousedown',e=>{ if(e.target.id==='shape-modal') e.currentTarget.style.display='none'; });
})();

// ── 표 삽입 피커 ──
(function(){
  const grid=document.getElementById('table-grid');
  const label=document.getElementById('table-grid-label');
  let hCols=3,hRows=3;
  function updateHighlight(){
    grid.querySelectorAll('[data-gr]').forEach(cell=>{
      const r=+cell.dataset.gr, c=+cell.dataset.gc;
      const on=r<hRows&&c<hCols;
      cell.style.background=on?'var(--accent)':'';
      cell.style.borderColor=on?'var(--accent)':'var(--border)';
    });
    label.textContent=`${hCols} × ${hRows}`;
  }
  function buildGrid(){
    let html='';
    for(let r=0;r<6;r++) for(let c=0;c<8;c++){
      html+=`<div data-gr="${r}" data-gc="${c}" style="width:28px;height:20px;border:1px solid var(--border);border-radius:3px;cursor:pointer"></div>`;
    }
    grid.innerHTML=html;
    updateHighlight();
  }
  buildGrid();
  grid.addEventListener('mouseover',ev=>{
    const t=ev.target; if(t.dataset.gr==null) return;
    hRows=+t.dataset.gr+1; hCols=+t.dataset.gc+1;
    document.getElementById('tbl-cols').value=hCols;
    document.getElementById('tbl-rows').value=hRows;
    updateHighlight();
  });
  grid.addEventListener('click',ev=>{
    if(ev.target.dataset.gr==null) return;
    addTable(hCols,hRows); document.getElementById('table-modal').style.display='none';
  });
  document.getElementById('tbl-insert').onclick=()=>{
    const c=+document.getElementById('tbl-cols').value||3;
    const r=+document.getElementById('tbl-rows').value||3;
    addTable(c,r); document.getElementById('table-modal').style.display='none';
  };
  document.getElementById('table-modal-close').onclick=()=>document.getElementById('table-modal').style.display='none';
  document.getElementById('table-modal').addEventListener('mousedown',e=>{ if(e.target.id==='table-modal') e.currentTarget.style.display='none'; });
  document.getElementById('rb2-addtable').onclick=()=>document.getElementById('table-modal').style.display='flex';
})();

// ── 표 열/행 드래그 리사이즈 ──
function startTblColResize(ev,e,colIdx){
  const startX=ev.clientX, z=zoom;
  const origW=[...e.colWidths];
  const onMove=mv=>{
    const dx=(mv.clientX-startX)/z;
    const nw1=Math.max(30, origW[colIdx]+dx);
    const nw2=Math.max(30, origW[colIdx+1]-dx);
    if(nw1<30||nw2<30) return;
    e.colWidths[colIdx]=Math.round(nw1);
    e.colWidths[colIdx+1]=Math.round(nw2);
    liveStyleEl(e);
  };
  const onUp=()=>{ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); snapshot(); };
  document.addEventListener('mousemove',onMove);
  document.addEventListener('mouseup',onUp);
}
function startTblRowResize(ev,e,rowIdx){
  const startY=ev.clientY, z=zoom;
  const origH=[...e.rowHeights];
  const onMove=mv=>{
    const dy=(mv.clientY-startY)/z;
    const nh1=Math.max(20, origH[rowIdx]+dy);
    const nh2=Math.max(20, origH[rowIdx+1]-dy);
    if(nh1<20||nh2<20) return;
    e.rowHeights[rowIdx]=Math.round(nh1);
    e.rowHeights[rowIdx+1]=Math.round(nh2);
    liveStyleEl(e);
  };
  const onUp=()=>{ document.removeEventListener('mousemove',onMove); document.removeEventListener('mouseup',onUp); snapshot(); };
  document.addEventListener('mousemove',onMove);
  document.addEventListener('mouseup',onUp);
}

// ── 표 셀 인라인 편집 ──
// ── 표 셀 범위 선택 (PPT식 클릭-드래그) ──
function _tblNorm(s){ return { r0:Math.min(s.r0,s.r1), r1:Math.max(s.r0,s.r1), c0:Math.min(s.c0,s.c1), c1:Math.max(s.c0,s.c1) }; }
function _tblInSel(id,r,c){ if(!_tblSel||_tblSel.id!==id) return false; const n=_tblNorm(_tblSel); return r>=n.r0&&r<=n.r1&&c>=n.c0&&c<=n.c1; }
const _TBL_HL='inset 0 0 0 2px var(--accent), inset 0 0 0 200px rgba(43,108,255,.16)';
function _tblHighlight(e){
  const node=canvas.querySelector(`[data-id="${e.id}"]`); if(!node) return;
  node.querySelectorAll('td').forEach(td=>{ td.style.boxShadow = _tblInSel(e.id,+td.dataset.row,+td.dataset.col) ? _TBL_HL : ''; });
}
function _tblCellAt(clientX,clientY,e){
  const el2=document.elementFromPoint(clientX,clientY); if(!el2) return null;
  const td=el2.closest && el2.closest('td'); if(!td) return null;
  const host=td.closest('[data-id]'); if(!host||host.dataset.id!==e.id) return null;
  return { r:+td.dataset.row, c:+td.dataset.col };
}
function startTblCellSelect(ev,e){
  ev.preventDefault(); ev.stopPropagation();
  const start=_tblCellAt(ev.clientX,ev.clientY,e); if(!start){ startDrag(ev,e); return; }
  _tblSel={ id:e.id, r0:start.r, c0:start.c, r1:start.r, c1:start.c };
  _tblHighlight(e);
  function mv(ev2){ const cur=_tblCellAt(ev2.clientX,ev2.clientY,e); if(cur){ _tblSel.r1=cur.r; _tblSel.c1=cur.c; _tblHighlight(e); } }
  function up(){ window.removeEventListener('mousemove',mv); window.removeEventListener('mouseup',up); }
  window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up);
}
// 우클릭/툴바 작업 대상 = 선택 범위(클릭칸이 그 안일 때) 아니면 클릭칸 1개
function _tblTargets(e,r,c){
  if(_tblSel && _tblSel.id===e.id){ const n=_tblNorm(_tblSel); if(r>=n.r0&&r<=n.r1&&c>=n.c0&&c<=n.c1){ const out=[]; for(let rr=n.r0;rr<=n.r1;rr++) for(let cc=n.c0;cc<=n.c1;cc++) out.push({r:rr,c:cc}); return out; } }
  return [{r,c}];
}
function _tdSelectAll(td){ try{ const rg=document.createRange(); rg.selectNodeContents(td); const s=window.getSelection(); s.removeAllRanges(); s.addRange(rg); }catch(_){} }
function _editTd(e,td){
  if(!td) return;
  const r=+td.dataset.row, c=+td.dataset.col;
  const tdBg=getComputedStyle(td).backgroundColor;
  const dark=/rgba?\((\d+),\s*(\d+),\s*(\d+)/.test(tdBg)&&(+RegExp.$1*299+ +RegExp.$2*587+ +RegExp.$3*114)/1000<140;
  td.contentEditable=true; td.style.boxShadow=''; td.style.outline='2px solid var(--accent)'; td.style.caretColor=dark?'#ffcc00':'#1a1a1a'; td.focus(); _tdSelectAll(td);
  const commit=()=>{
    td.contentEditable=false; td.style.outline='';
    const txt=td.textContent.trim();
    let cell=(e.cells||[]).find(x=>x.r===r&&x.c===c);
    if(!cell){ cell={r,c,text:''}; e.cells.push(cell); }
    cell.text=txt; save(true); renderCanvas(); renderProps();
  };
  td.addEventListener('blur',commit,{once:true});
  td.addEventListener('keydown',ev2=>{
    if(ev2.key==='Enter'&&!ev2.shiftKey){ ev2.preventDefault(); td.blur(); }
    else if(ev2.key==='Escape'){ td.textContent=(e.cells||[]).find(x=>x.r===r&&x.c===c)?.text||''; td.blur(); }
    else if(ev2.key==='Tab'){ ev2.preventDefault(); const nc=ev2.shiftKey? c-1 : c+1; td.blur(); if(nc>=0&&nc<e.cols) editTableCell(e,r,nc); }
  });
}
function startTableEdit(node,e,ev){ const td=ev.target.closest('td'); if(td) _editTd(e,td); }
// 임의 셀 편집 (F2/Enter·Tab 이동에서 호출) — 최신 노드를 다시 조회
function editTableCell(e,r,c){ const node=canvas.querySelector(`[data-id="${e.id}"]`); if(!node) return; const td=node.querySelector(`td[data-row="${r}"][data-col="${c}"]`); if(td) _editTd(e,td); }

// ── 템플릿 모달 ──
function openTplModal(){
  const grid=document.getElementById('tpl-grid'); grid.innerHTML='';
  TEMPLATES.forEach(t=>{
    const card=document.createElement('div'); card.className='tpl-card';
    card.innerHTML=`<div class="tpl-prev"><div class="mini"></div></div><div class="tpl-info"><div class="t">${t.name}</div><div class="d">${t.desc}</div></div>`;
    const mini=card.querySelector('.mini');
    const tp = buildTemplate(t.key);
    mini.style.width=tp.w+'px'; mini.style.height=tp.h+'px'; mini.style.background=tp.bg;
    const sc=326/tp.w; mini.style.transform=`scale(${sc})`;
    tp.elements.forEach(e=>{ const n=renderEl({...e,id:'_p'+e.id}); n.style.pointerEvents='none'; mini.appendChild(n); });
    card.addEventListener('click',()=>{ addContentPage(buildTemplate(t.key)); closeTplModal(); afterMutate(); toast(`'${t.name}' 페이지 추가됨`); });
    grid.appendChild(card);
  });
  document.getElementById('tpl-modal').style.display='flex';
}
function closeTplModal(){ document.getElementById('tpl-modal').style.display='none'; }
document.getElementById('tpl-close').onclick=closeTplModal;
document.getElementById('tpl-modal').addEventListener('mousedown',e=>{ if(e.target.id==='tpl-modal') closeTplModal(); });

// ── 우클릭 링크 메뉴 ──
function showLinkMenu(x,y,e){
  const m=document.getElementById('ctx-menu');
  const others=project.pages.filter(p=>p.id!==page().id);
  let h='<div class="head">🔗 클릭 시 이동할 페이지 선택</div>';
  if(others.length){
    others.forEach(p=>{ h+=`<div class="ci ${e.link===p.id?'cur':''}" data-link="${p.id}">${e.link===p.id?'✓ ':''}${escapeHtml(p.name||'페이지')}</div>`; });
  }else{
    h+='<div class="head" style="color:var(--sub)">아직 다른 페이지가 없어요</div>';
  }
  h+='<div class="sep"></div>';
  h+='<div class="ci" data-act="new">＋ 새 페이지 만들어 연결</div>';
  if(e.link){ h+='<div class="ci" data-act="go">✎ 연결된 페이지로 이동</div>'; h+='<div class="ci" data-act="clear">✖ 링크 해제</div>'; }
  m.innerHTML=h; m.style.display='block';
  m.style.left=Math.min(x, window.innerWidth - m.offsetWidth - 8)+'px';
  m.style.top=Math.min(y, window.innerHeight - m.offsetHeight - 8)+'px';
  m.querySelectorAll('.ci').forEach(it=>it.addEventListener('click',()=>{
    const lid=it.dataset.link, act=it.dataset.act;
    const _ts=selAll(); const _t=_ts.length?_ts:[e];   // 그룹/다중선택이면 전체 링크
    if(lid){ _t.forEach(x=>x.link=lid); afterMutate(); toast('링크 연결됨 🔗'+(_t.length>1?` (${_t.length}개)`:'')); }
    else if(act==='new'){ const child=newPage(prompt('새 페이지 이름','새 페이지')||'새 페이지', page().id); project.pages.push(child); _t.forEach(x=>x.link=child.id); afterMutate(); toast('새 페이지를 만들어 연결했습니다'); }
    else if(act==='go'){ const i=pageIndex(e.link); if(i>=0){ curPage=i; selId=null; renderCanvas(); renderPages(); renderProps(); toast('연결된 페이지로 이동'); } }
    else if(act==='clear'){ _t.forEach(x=>x.link=null); afterMutate(); toast('링크 해제됨'); }
    hideCtx();
  }));
}
// ── 표 전용 우클릭 메뉴 (PPT 미니 툴바 + 테이블 메뉴) ──
function _tblEnsureWH(e){
  if(!e.colWidths||e.colWidths.length!==e.cols) e.colWidths=Array(e.cols).fill(Math.round(e.w/e.cols));
  if(!e.rowHeights||e.rowHeights.length!==e.rows) e.rowHeights=Array(e.rows).fill(Math.round(e.h/e.rows));
}
function showTableCtx(x,y,e,ev,rc){
  const m=document.getElementById('ctx-menu');
  const td=ev?ev.target.closest('td'):null;
  let clickR = rc? rc.r : (td?+td.dataset.row:0);
  let clickC = rc? rc.c : (td?+td.dataset.col:0);
  clickR=Math.max(0,Math.min(clickR,e.rows-1)); clickC=Math.max(0,Math.min(clickC,e.cols-1));
  const cell=(e.cells||[]).find(c=>c.r===clickR&&c.c===clickC)||{};
  const isHead=clickR===0;
  const targets=_tblTargets(e,clickR,clickC);   // 선택 범위 전체(또는 클릭칸 1개) — 색/배경/정렬 일괄 적용
  const _applyCells=(key,val)=>targets.forEach(t=>_tblCellProp(e,t.r,t.c,key,val));

  // ─ 미니 툴바 (PPT 스타일) ─
  let h='<div class="ctx-tbar">';
  if(targets.length>1) h+=`<span style="font-size:11px;color:var(--accent);font-weight:700;padding:0 4px">${targets.length}칸 선택</span>`;
  h+=`<select id="ct-font" style="max-width:110px">${FONTS.map(f=>`<option value="${f[0]}" ${e.fontFamily===f[0]?'selected':''}>${f[1]}</option>`).join('')}</select>`;
  h+=`<input type="number" id="ct-fsize" value="${e.fontSize||14}" min="8" max="72">`;
  h+=`<button class="ct-btn${(isHead?(e.headerWeight||700):(e.fontWeight||400))>=700?' on':''}" id="ct-bold" title="굵게" style="font-weight:900">가</button>`;
  h+=`<div class="ct-vsep"></div>`;
  const _alSvg=d=>`<svg width="15" height="11" viewBox="0 0 16 12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="${d}"/></svg>`;
  h+=`<button class="ct-btn" id="ct-align-l" title="왼쪽 정렬">${_alSvg('M1 2h14M1 6h9M1 10h12')}</button>`;
  h+=`<button class="ct-btn" id="ct-align-c" title="가운데 정렬">${_alSvg('M1 2h14M4 6h8M3 10h10')}</button>`;
  h+=`<button class="ct-btn" id="ct-align-r" title="오른쪽 정렬">${_alSvg('M1 2h14M6 6h9M3 10h12')}</button>`;
  h+=`<div class="ct-vsep"></div>`;
  h+=`<button class="ct-color" id="ct-fc" title="글자 색"><span style="font-size:12px">가</span><span class="ct-bar" style="background:${cell.color||(isHead?(e.headerColor||'#fff'):(e.cellColor||'#333'))}"></span></button>`;
  h+=`<button class="ct-color" id="ct-bg" title="셀 배경색"><span style="font-size:10px">🪣</span><span class="ct-bar" style="background:${cell.bg||(isHead?(e.headerBg||'#4a5568'):(e.cellBg||'#fff'))}"></span></button>`;
  h+=`<div class="ct-vsep"></div>`;
  h+=`<button class="ct-btn" id="ct-bw-up" title="테두리 굵기 +">▬</button>`;
  h+=`<button class="ct-btn" id="ct-bw-dn" title="테두리 굵기 −" style="font-size:9px">▬</button>`;
  h+=`<button class="ct-btn" id="ct-border" title="테두리 적용(엑셀식)" style="width:auto;padding:0 4px;gap:1px">${_bdIcon('outer')}<span style="font-size:8px">▾</span></button>`;
  h+='</div>';

  // ─ 표 구조 (2번째 줄, PPT식 아이콘 툴바) ─
  h+='<div class="ctx-tbar row2">';
  h+='<button class="ct-tbtn" data-ta="ins-row-above" title="위에 행 삽입">＋행<span style="font-size:9px">▲</span></button>';
  h+='<button class="ct-tbtn" data-ta="ins-row-below" title="아래에 행 삽입">＋행<span style="font-size:9px">▼</span></button>';
  h+='<button class="ct-tbtn" data-ta="ins-col-left" title="왼쪽에 열 삽입">＋열<span style="font-size:9px">◀</span></button>';
  h+='<button class="ct-tbtn" data-ta="ins-col-right" title="오른쪽에 열 삽입">＋열<span style="font-size:9px">▶</span></button>';
  h+='<div class="ct-vsep"></div>';
  if(e.rows>1) h+='<button class="ct-tbtn danger" data-ta="del-row" title="이 행 삭제">－행</button>';
  if(e.cols>1) h+='<button class="ct-tbtn danger" data-ta="del-col" title="이 열 삭제">－열</button>';
  h+='<div class="ct-vsep"></div>';
  h+='<button class="ct-tbtn" data-ta="rows-even" title="선택 행 높이 같게(선택 없으면 전체)">행⇕같게</button>';
  h+='<button class="ct-tbtn" data-ta="cols-even" title="선택 열 너비 같게(선택 없으면 전체)">열⇔같게</button>';
  h+='<div class="ct-vsep"></div>';
  h+='<button class="ct-tbtn" data-ta="merge" title="선택한 칸 병합">⊞ 병합</button>';
  if(cell.span) h+='<button class="ct-tbtn" data-ta="unmerge" title="병합 해제">⊟ 해제</button>';
  h+='<div class="ct-vsep"></div>';
  h+=`<button class="ct-tbtn" data-ta="clear-sel" title="${targets.length>1?'선택한 칸':'이 칸'} 내용 지우기">⌫ 지우기</button>`;
  h+='<div class="ct-vsep"></div>';
  h+=`<button class="ct-tbtn link" data-tl="link" title="${e.link?'링크 변경/해제':'클릭 시 페이지로 이동 링크'}">🔗 ${e.link?'링크됨':'링크'}</button>`;
  h+='</div>';

  m.innerHTML=h; m.style.display='block';
  m.style.left=Math.min(x, window.innerWidth - m.offsetWidth - 8)+'px';
  m.style.top=Math.min(y, window.innerHeight - m.offsetHeight - 8)+'px';

  // ─ 미니 툴바 바인딩 ─
  const _live=()=>{ liveStyleEl(e); snapshot(); };
  const $c=id=>m.querySelector('#'+id);

  $c('ct-font').onchange=()=>{ e.fontFamily=$c('ct-font').value; loadFont(e.fontFamily); _live(); };
  $c('ct-fsize').onchange=()=>{ e.fontSize=parseInt($c('ct-fsize').value)||14; _live(); };
  $c('ct-bold').onclick=()=>{
    if(isHead){ e.headerWeight=(e.headerWeight||700)>=700?400:700; }
    else{ e.fontWeight=(e.fontWeight||400)>=700?400:700; }
    _live();
  };
  $c('ct-align-l').onclick=()=>{ _applyCells('align','left'); _live(); };
  $c('ct-align-c').onclick=()=>{ _applyCells('align','center'); _live(); };
  $c('ct-align-r').onclick=()=>{ _applyCells('align','right'); _live(); };

  $c('ct-fc').onclick=(ev2)=>{ ev2.stopPropagation(); toggleColorPopup('tblCtxColor', $c('ct-fc')); };
  $c('ct-bg').onclick=(ev2)=>{ ev2.stopPropagation(); toggleColorPopup('tblCtxBg', $c('ct-bg')); };

  // 임시 CP_TARGETS — 선택 범위 전체에 적용(개별로 바꾼 칸도 덮어씀)
  CP_TARGETS.tblCtxColor={ label:targets.length>1?`${targets.length}칸 글자색`:'셀 글자색', rich:false,
    current:()=>cell.color||(isHead?(e.headerColor||'#fff'):(e.cellColor||'#333')),
    set:v=>{ _applyCells('color',v); liveStyleEl(e); }};
  CP_TARGETS.tblCtxBg={ label:targets.length>1?`${targets.length}칸 배경색`:'셀 배경색', rich:false,
    current:()=>cell.bg||(isHead?(e.headerBg||'#4a5568'):(e.cellBg||'#fff')),
    set:v=>{ _applyCells('bg',v); liveStyleEl(e); }};

  $c('ct-bw-up').onclick=()=>{ e.borderW=(e.borderW||1)+1; _live(); };
  $c('ct-bw-dn').onclick=()=>{ e.borderW=Math.max(0,(e.borderW||1)-1); _live(); };
  $c('ct-border').onclick=(ev2)=>{ ev2.stopPropagation(); showBorderMenu($c('ct-border'),e,clickR,clickC); };

  // ─ 테이블 액션 바인딩 ─
  m.querySelectorAll('[data-ta],[data-tl]').forEach(it=>it.addEventListener('click',()=>{
    if(it.dataset.tl==='link'){ showLinkMenu(x,y,e); return; }   // 기존 링크 메뉴(연결/변경/이동/해제)를 그대로 띄움
    const a=it.dataset.ta; if(!a) return;
    _tblEnsureWH(e);
    if(a==='ins-row-above'){
      e.cells.forEach(c=>{ if(c.r>=clickR) c.r++; });
      for(let c=0;c<e.cols;c++) e.cells.push({r:clickR,c,text:''});
      e.rowHeights.splice(clickR,0,40); e.rows++; e.h+=40;
    }else if(a==='ins-row-below'){
      const nr=clickR+1;
      e.cells.forEach(c=>{ if(c.r>=nr) c.r++; });
      for(let c=0;c<e.cols;c++) e.cells.push({r:nr,c,text:''});
      e.rowHeights.splice(nr,0,40); e.rows++; e.h+=40;
    }else if(a==='ins-col-left'){
      e.cells.forEach(c=>{ if(c.c>=clickC) c.c++; });
      for(let r=0;r<e.rows;r++) e.cells.push({r,c:clickC,text:''});
      e.colWidths.splice(clickC,0,120); e.cols++; e.w+=120;
    }else if(a==='ins-col-right'){
      const nc=clickC+1;
      e.cells.forEach(c=>{ if(c.c>=nc) c.c++; });
      for(let r=0;r<e.rows;r++) e.cells.push({r,c:nc,text:''});
      e.colWidths.splice(nc,0,120); e.cols++; e.w+=120;
    }else if(a==='del-row'&&e.rows>1){
      const rh=e.rowHeights[clickR]||40;
      e.cells=e.cells.filter(c=>c.r!==clickR);
      e.cells.forEach(c=>{ if(c.r>clickR) c.r--; });
      e.rowHeights.splice(clickR,1); e.rows--; e.h=Math.max(40,e.h-rh);
    }else if(a==='del-col'&&e.cols>1){
      const cw=e.colWidths[clickC]||120;
      e.cells=e.cells.filter(c=>c.c!==clickC);
      e.cells.forEach(c=>{ if(c.c>clickC) c.c--; });
      e.colWidths.splice(clickC,1); e.cols--; e.w=Math.max(120,e.w-cw);
    }else if(a==='clear-sel'){
      const tg=_tblTargets(e,clickR,clickC); const set=new Set(tg.map(t=>t.r+'_'+t.c));
      e.cells.forEach(c=>{ if(set.has(c.r+'_'+c.c)) c.text=''; });
    }else if(a==='rows-even'){
      const n=(_tblSel&&_tblSel.id===e.id)?_tblNorm(_tblSel):{r0:0,r1:e.rows-1,c0:0,c1:e.cols-1};
      const rs=[]; for(let r=n.r0;r<=n.r1;r++) rs.push(r);
      const tot=rs.reduce((s,r)=>s+(e.rowHeights[r]||40),0), each=Math.max(20,Math.round(tot/rs.length));
      rs.forEach(r=>e.rowHeights[r]=each); e.h=e.rowHeights.reduce((s,v)=>s+v,0);
    }else if(a==='cols-even'){
      const n=(_tblSel&&_tblSel.id===e.id)?_tblNorm(_tblSel):{r0:0,r1:e.rows-1,c0:0,c1:e.cols-1};
      const cs=[]; for(let c=n.c0;c<=n.c1;c++) cs.push(c);
      const tot=cs.reduce((s,c)=>s+(e.colWidths[c]||120),0), each=Math.max(40,Math.round(tot/cs.length));
      cs.forEach(c=>e.colWidths[c]=each); e.w=e.colWidths.reduce((s,v)=>s+v,0);
    }else if(a==='merge'){
      if(!_tblSel||_tblSel.id!==e.id){ toast('두 칸 이상 선택하세요'); return; }
      const n=_tblNorm(_tblSel);
      if(n.r0===n.r1&&n.c0===n.c1){ toast('두 칸 이상 선택하세요'); return; }
      let tl=(e.cells||[]).find(x=>x.r===n.r0&&x.c===n.c0); if(!tl){ tl={r:n.r0,c:n.c0,text:''}; e.cells.push(tl); }
      const txts=[];
      for(let r=n.r0;r<=n.r1;r++) for(let c=n.c0;c<=n.c1;c++){
        let cc=(e.cells||[]).find(x=>x.r===r&&x.c===c);
        if(cc&&cc.text&&!(r===n.r0&&c===n.c0)) txts.push(cc.text);
        if(r===n.r0&&c===n.c0) continue;
        if(!cc){ cc={r,c,text:''}; e.cells.push(cc); }
        cc.merged=true; delete cc.span; cc.text='';
      }
      tl.span={rs:n.r1-n.r0+1, cs:n.c1-n.c0+1};
      if(!tl.text && txts.length) tl.text=txts.join(' ');   // 비어있으면 합쳐진 칸 내용 모음
      _tblSel={ id:e.id, r0:n.r0, c0:n.c0, r1:n.r0, c1:n.c0 };
    }else if(a==='unmerge'){
      const tl=(e.cells||[]).find(x=>x.r===clickR&&x.c===clickC);
      if(tl&&tl.span){ const rs=tl.span.rs, cs=tl.span.cs;
        for(let r=clickR;r<clickR+rs;r++) for(let c=clickC;c<clickC+cs;c++){ const cc=(e.cells||[]).find(x=>x.r===r&&x.c===c); if(cc) delete cc.merged; }
        delete tl.span;
      }
    }
    const structural = a.indexOf('ins-')===0 || a.indexOf('del-')===0 || a==='merge' || a==='unmerge';
    afterMutate();   // 메뉴 유지(작업해도 안 닫힘) — 바깥 클릭으로만 닫힘
    if(structural) showTableCtx(x,y,e,null,{r:clickR,c:clickC});   // 행/열 수 바뀜 → 같은 자리에서 메뉴 갱신
  }));
}
function _tblCellProp(e,r,c,key,val){
  let cell=(e.cells||[]).find(x=>x.r===r&&x.c===c);
  if(!cell){ cell={r,c,text:''}; e.cells.push(cell); }
  cell[key]=val;
}
// 셀 4방향 테두리 CSS (cell.bd={t,r,b,l} 폭 오버라이드; 미지정=기본 e.borderW, 0=없음)
function _tblBorderCss(e,cell){
  const col=e.borderColor||'#333', def=(e.borderW!=null?e.borderW:1);
  const sd=(s,css)=>{ const bd=cell&&cell.bd; const w=(bd&&bd[s]!=null)?bd[s]:def; return `border-${css}:${w>0?w+'px solid '+col:'0'}`; };
  return [sd('t','top'),sd('r','right'),sd('b','bottom'),sd('l','left')].join(';');
}
// 엑셀/PPT식 테두리 프리셋을 선택 범위에 적용
function _tblBorderPreset(e,targets,preset){
  if(!targets||!targets.length) return;
  const rs=targets.map(t=>t.r), cs=targets.map(t=>t.c);
  const r0=Math.min(...rs),r1=Math.max(...rs),c0=Math.min(...cs),c1=Math.max(...cs);
  const W=Math.max(1,e.borderW||1);
  const setS=(r,c,s,v)=>{ let cell=(e.cells||[]).find(x=>x.r===r&&x.c===c); if(!cell){cell={r,c,text:''};e.cells.push(cell);} if(!cell.bd)cell.bd={}; if(v===undefined) delete cell.bd[s]; else cell.bd[s]=v; };
  targets.forEach(({r,c})=>{
    const top=r===r0,bot=r===r1,lft=c===c0,rgt=c===c1;
    switch(preset){
      case 'none': setS(r,c,'t',0);setS(r,c,'b',0);setS(r,c,'l',0);setS(r,c,'r',0); break;
      case 'all': setS(r,c,'t',W);setS(r,c,'b',W);setS(r,c,'l',W);setS(r,c,'r',W); break;
      case 'outer': setS(r,c,'t',top?W:0);setS(r,c,'b',bot?W:0);setS(r,c,'l',lft?W:0);setS(r,c,'r',rgt?W:0); break;
      case 'inner': setS(r,c,'t',top?undefined:W);setS(r,c,'b',bot?undefined:W);setS(r,c,'l',lft?undefined:W);setS(r,c,'r',rgt?undefined:W); break;
      case 'inner-h': setS(r,c,'t',top?undefined:W);setS(r,c,'b',bot?undefined:W); break;
      case 'inner-v': setS(r,c,'l',lft?undefined:W);setS(r,c,'r',rgt?undefined:W); break;
      case 'top': if(top) setS(r,c,'t',W); break;
      case 'bottom': if(bot) setS(r,c,'b',W); break;
      case 'left': if(lft) setS(r,c,'l',W); break;
      case 'right': if(rgt) setS(r,c,'r',W); break;
    }
  });
}
function _bdIcon(t){
  const F='#5b6b88', A='#3b82f6', L=2,T=2,R=14,B=14,M=8;
  const ln=(x1,y1,x2,y2,col)=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${col}" stroke-width="1.4" stroke-linecap="round"/>`;
  const base=ln(L,T,R,T,F)+ln(L,B,R,B,F)+ln(L,T,L,B,F)+ln(R,T,R,B,F)+ln(L,M,R,M,F)+ln(M,T,M,B,F);
  let a=[];
  if(t==='all')a=[[L,T,R,T],[L,B,R,B],[L,T,L,B],[R,T,R,B],[L,M,R,M],[M,T,M,B]];
  else if(t==='outer')a=[[L,T,R,T],[L,B,R,B],[L,T,L,B],[R,T,R,B]];
  else if(t==='inner')a=[[L,M,R,M],[M,T,M,B]];
  else if(t==='inner-h')a=[[L,M,R,M]];
  else if(t==='inner-v')a=[[M,T,M,B]];
  else if(t==='top')a=[[L,T,R,T]];
  else if(t==='bottom')a=[[L,B,R,B]];
  else if(t==='left')a=[[L,T,L,B]];
  else if(t==='right')a=[[R,T,R,B]];
  return `<svg width="16" height="16" viewBox="0 0 16 16" style="vertical-align:middle;flex-shrink:0">${base}${a.map(x=>ln(x[0],x[1],x[2],x[3],A)).join('')}</svg>`;
}
function showBorderMenu(btn,e,clickR,clickC){
  document.getElementById('tbl-bd-pop')?.remove();
  const targets=_tblTargets(e,clickR,clickC);
  const pop=document.createElement('div'); pop.id='tbl-bd-pop'; pop.className='ctx';
  pop.style.cssText+=';min-width:158px;width:max-content';
  const items=[['all','모든 테두리'],['outer','바깥쪽 테두리'],['inner','안쪽 테두리'],['_sep'],
    ['top','위쪽 테두리'],['bottom','아래쪽 테두리'],['left','왼쪽 테두리'],['right','오른쪽 테두리'],['_sep'],
    ['inner-h','안쪽 가로 테두리'],['inner-v','안쪽 세로 테두리'],['_sep'],['none','테두리 없음']];
  pop.innerHTML=items.map(it=> it[0]==='_sep'?'<div class="sep"></div>'
    :`<div class="ci" data-bd="${it[0]}" style="display:flex;align-items:center;gap:8px">${_bdIcon(it[0])}<span>${it[1]}</span></div>`).join('');
  document.body.appendChild(pop);
  const r=btn.getBoundingClientRect();
  pop.style.left=Math.min(r.left, innerWidth-pop.offsetWidth-8)+'px';
  pop.style.top=Math.min(r.bottom+4, innerHeight-pop.offsetHeight-8)+'px';
  pop.querySelectorAll('.ci').forEach(it=>it.addEventListener('click',()=>{ _tblBorderPreset(e,targets,it.dataset.bd); liveStyleEl(e); snapshot(); pop.remove(); }));
  const closer=ev=>{ if(!ev.target.closest('#tbl-bd-pop')&&ev.target!==btn){ pop.remove(); document.removeEventListener('mousedown',closer); } };
  setTimeout(()=>document.addEventListener('mousedown',closer),0);
}
function _tblCellAlign(e,r,c,align){
  _tblCellProp(e,r,c,'align',align);
}

function hideCtx(){ document.getElementById('ctx-menu').style.display='none'; }
window.addEventListener('mousedown',e=>{ if(!e.target.closest('#ctx-menu') && !e.target.closest('#fill-dd') && !e.target.closest('#tbl-bd-pop')) hideCtx(); });
window.addEventListener('blur',hideCtx);

// ── 페이지 맵 (노드 + 연결선) ──
let mapSel=null, mapLines=true;
const MAP_NW=170, MAP_NH=152, MAP_GX=70, MAP_GY=64, MAP_COLS=4;
function openMap(){ mapSel=null; mapLines=true; document.getElementById('map-lines').checked=true; document.getElementById('map-modal').style.display='flex'; renderMap(); }
function pageLinkTargets(p){ return [...new Set(p.elements.filter(e=>e.link).map(e=>e.link))].filter(t=>pageById(t)); }
function pageLinksBetween(a,b){ const pa=pageById(a),pb=pageById(b); if(!pa||!pb)return false; return pageLinkTargets(pa).includes(b)||pageLinkTargets(pb).includes(a); }
function renderMap(){
  const host=document.getElementById('map-canvas'); host.innerHTML='';
  const pages=project.pages;
  const cols=Math.min(MAP_COLS, Math.max(1,pages.length));
  const rows=Math.ceil(pages.length/cols);
  const pos={};
  pages.forEach((p,i)=>{ pos[p.id]={x:14+(i%cols)*(MAP_NW+MAP_GX), y:14+Math.floor(i/cols)*(MAP_NH+MAP_GY)}; });
  const W=14+cols*(MAP_NW+MAP_GX), H=14+rows*(MAP_NH+MAP_GY);
  host.style.width=W+'px'; host.style.height=H+'px';
  // SVG 연결선
  const NS='http://www.w3.org/2000/svg';
  const svg=document.createElementNS(NS,'svg');
  svg.setAttribute('width',W); svg.setAttribute('height',H);
  svg.style.cssText='position:absolute;top:0;left:0;pointer-events:none';
  svg.innerHTML='<defs><marker id="mk-arr" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#6c7bff"/></marker><marker id="mk-arr-d" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><path d="M0,0 L8,3 L0,6 Z" fill="#46506e"/></marker></defs>';
  if(mapLines){
    pages.forEach(p=>{
      pageLinkTargets(p).forEach(t=>{
        const a=pos[p.id], b=pos[t]; if(!a||!b) return;
        const active = !mapSel || mapSel===p.id || mapSel===t;
        const x1=a.x+MAP_NW/2, y1=a.y+MAP_NH/2, x2=b.x+MAP_NW/2, y2=b.y+MAP_NH/2;
        const ln=document.createElementNS(NS,'line');
        ln.setAttribute('x1',x1); ln.setAttribute('y1',y1); ln.setAttribute('x2',x2); ln.setAttribute('y2',y2);
        ln.setAttribute('stroke', active?'#6c7bff':'#46506e');
        ln.setAttribute('stroke-width', active?2.5:1.2);
        ln.setAttribute('marker-end', active?'url(#mk-arr)':'url(#mk-arr-d)');
        if(!active) ln.setAttribute('opacity','0.4');
        svg.appendChild(ln);
      });
    });
  }
  host.appendChild(svg);
  // 노드
  pages.forEach((p,i)=>{
    const dim = mapSel && mapSel!==p.id && !pageLinksBetween(mapSel,p.id);
    const node=document.createElement('div');
    node.style.cssText=`position:absolute;left:${pos[p.id].x}px;top:${pos[p.id].y}px;width:${MAP_NW}px;border:2px solid ${i===curPage?'var(--accent)':(mapSel===p.id?'var(--accent2)':'var(--border)')};border-radius:10px;overflow:hidden;background:var(--panel2);cursor:pointer;${dim?'opacity:.35':''}`;
    node.innerHTML=`<div style="height:108px;background:#fff;position:relative;overflow:hidden"><div class="mini"></div></div>
      <div style="padding:7px 9px;display:flex;align-items:center;gap:6px">
        <div style="flex:1;font-size:12px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(p.name||'페이지')}${p.parentId?' <span style=\"color:var(--sub);font-weight:400;font-size:10px\">하위</span>':''}</div>
        <button class="map-edit" style="border:none;background:var(--accent);color:#fff;border-radius:5px;font-size:11px;padding:3px 8px;cursor:pointer;font-family:inherit">✎</button>
      </div>`;
    const mini=node.querySelector('.mini');
    mini.style.cssText=`position:absolute;top:0;left:0;transform-origin:top left;width:${p.w}px;height:${p.h}px;background:${p.bg}`;
    mini.style.transform=`scale(${MAP_NW/p.w})`;
    p.elements.forEach(e=>{ const n=renderEl({...e,id:'_m'+e.id}); n.style.pointerEvents='none'; n.classList.remove('selected'); mini.appendChild(n); });
    node.addEventListener('click',ev=>{ if(ev.target.closest('.map-edit')) return; mapSel = (mapSel===p.id? null : p.id); renderMap(); });
    node.querySelector('.map-edit').addEventListener('click',()=>{ curPage=i; selId=null; closeMap(); renderCanvas(); renderPages(); renderProps(); toast(`'${p.name}' 편집`); });
    host.appendChild(node);
  });
}
function pageDepth(p){ let d=0,cur=p,guard=0; while(cur && cur.parentId && guard++<20){ cur=pageById(cur.parentId); d++; } return d; }
function closeMap(){ document.getElementById('map-modal').style.display='none'; }
const _openMapBtn=document.getElementById('open-map'); if(_openMapBtn) _openMapBtn.onclick=openMap;
document.getElementById('map-close').onclick=closeMap;
document.getElementById('map-lines').addEventListener('change',e=>{ mapLines=e.target.checked; renderMap(); });
document.getElementById('map-all').addEventListener('click',()=>{ mapSel=null; renderMap(); });
document.getElementById('map-modal').addEventListener('mousedown',e=>{ if(e.target.id==='map-modal') closeMap(); });

// ───────────────────────── 로그인 ─────────────────────────
function openLogin(){ document.getElementById('login-modal').style.display='flex'; }
function closeLogin(){ document.getElementById('login-modal').style.display='none'; }
document.getElementById('btn-login').onclick=()=>{ if(isAdmin){ signOut(auth); toast('로그아웃되었습니다'); } else openLogin(); };
document.getElementById('login-close').onclick=closeLogin;
document.getElementById('login-modal').addEventListener('mousedown',e=>{ if(e.target.id==='login-modal') closeLogin(); });
document.getElementById('login-submit').onclick=async()=>{
  const email=document.getElementById('login-email').value.trim();
  const pw=document.getElementById('login-pw').value;
  try{ await signInWithEmailAndPassword(auth,email,pw); closeLogin(); toast('로그인되었습니다'); }
  catch(e){ toast('로그인 실패: '+(e.code||e.message||e)); }
};

// ───────────────────────── 클라우드 저장/불러오기 ─────────────────────────
async function uploadEmbeddedImages(){
  for(const p of project.pages){
    for(const e of p.elements){
      if(e.type==='image' && typeof e.src==='string' && e.src.startsWith('data:image/') && !e.src.startsWith('data:image/svg')){
        const blob = await (await fetch(e.src)).blob();
        const ext = (blob.type.split('/')[1]||'png').replace('+xml','');
        const r = sRef(storage, `editor/${uid()}.${ext}`);
        await uploadBytes(r, blob);
        e.src = await getDownloadURL(r);
      }
    }
  }
}
async function cloudSave(name, targetId){
  if(!isAdmin){ toast('로그인이 필요합니다'); openLogin(); return; }
  const btn=document.getElementById('btn-cloud'); const prev=btn.textContent;
  btn.textContent='저장중…';
  try{
    await uploadEmbeddedImages();
    const id = targetId ?? _prjId;
    const payload = { name: name||'새 프로젝트', data: JSON.stringify(project), updatedAt: new Date().toISOString() };
    if(id){
      await setDoc(doc(db,'editorProjects',id), payload, {merge:true});
    } else {
      const ref = await addDoc(collection(db,'editorProjects'), payload);
      _prjId = ref.id; localStorage.setItem('hw_prj_id', _prjId);
    }
    save(true); renderCanvas();
    toast('클라우드에 저장됨 ☁');
  }catch(e){ toast('클라우드 저장 실패: '+(e.message||e)); }
  finally{ btn.textContent=prev; }
}
// 발행 — 현재 프로젝트를 공개 홈(site/editorProject)에 덮어씀. 도메인 루트(/)가 이걸 읽는다.
async function publishSite(){
  if(!isAdmin){ toast('로그인이 필요합니다'); openLogin(); return; }
  if(!confirm('현재 편집 중인 프로젝트를 공개 홈페이지로 발행할까요?\n도메인 루트(/)에 즉시 반영됩니다. (기존 공개본은 대체됩니다)')) return;
  const btn=document.getElementById('btn-publish'); const prev=btn?btn.textContent:'';
  if(btn){ btn.textContent='발행 중…'; btn.disabled=true; }
  try{
    await uploadEmbeddedImages();
    const payload={ name: project.name||'홈페이지', data: JSON.stringify(project), updatedAt: new Date().toISOString() };
    await setDoc(doc(db, DOC_PATH[0], DOC_PATH[1]), payload, {merge:true});
    save(true); renderCanvas();
    toast('🚀 발행 완료 — 공개 홈에 반영되었습니다');
  }catch(e){ toast('발행 실패: '+(e.message||e)); }
  finally{ if(btn){ btn.textContent=prev; btn.disabled=false; } }
}
document.getElementById('btn-publish')?.addEventListener('click', publishSite);
async function loadCloud(){
  try{
    let snap;
    if(_prjId){
      snap = await getDoc(doc(db,'editorProjects',_prjId));
    }
    if(!snap?.exists()){
      snap = await getDoc(doc(db, DOC_PATH[0], DOC_PATH[1])); // 구 경로 마이그레이션
    }
    if(snap?.exists() && snap.data().data){
      const nm = snap.data().name||'';
      if(confirm(`클라우드에 저장된 프로젝트${nm?` "${nm}"`:''}가 있습니다. 불러올까요?\n(현재 편집 중 내용은 대체됩니다)`)){
        project=JSON.parse(snap.data().data); curPage=0; selId=null;
        history=[]; hist_i=-1; snapshot();
        renderCanvas(); renderPages(); renderProps(); save(true);
        toast('클라우드에서 불러왔습니다 ☁');
      }
    }
  }catch(e){ console.log('클라우드 로드 실패',e); }
}
// 클라우드 버튼 → 모달 열기
document.getElementById('btn-cloud').onclick=openCloudModal;
document.getElementById('cloud-modal-close').onclick=()=>document.getElementById('cloud-modal').style.display='none';
document.getElementById('cloud-modal').addEventListener('mousedown',e=>{ if(e.target.id==='cloud-modal') e.currentTarget.style.display='none'; });

async function openCloudModal(){
  if(!isAdmin){ toast('로그인이 필요합니다'); openLogin(); return; }
  document.getElementById('cloud-modal').style.display='flex';
  renderPrjList();
  renderCloudFiles();
}

async function renderPrjList(){
  const list=document.getElementById('prj-list');
  list.innerHTML='<div style="text-align:center;padding:20px;color:var(--sub);font-size:13px">불러오는 중…</div>';
  try{
    const snap=await getDocs(collection(db,'editorProjects'));
    if(snap.empty){
      list.innerHTML='<div style="text-align:center;padding:24px;color:var(--sub);font-size:13px">저장된 프로젝트가 없습니다<br><span style="font-size:11px">+ 새 프로젝트로 저장을 눌러 저장하세요</span></div>';
      return;
    }
    const docs=[]; snap.forEach(d=>docs.push({id:d.id,...d.data()}));
    docs.sort((a,b)=>new Date(b.updatedAt||0)-new Date(a.updatedAt||0));
    list.innerHTML='';
    docs.forEach(prj=>{
      const isActive=prj.id===_prjId;
      const d=prj.updatedAt?new Date(prj.updatedAt):null;
      const dateStr=d?`${d.toLocaleDateString('ko-KR')} ${d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}`:'-';
      const card=document.createElement('div');
      card.className='prj-card'+(isActive?' active':'');
      card.innerHTML=`
        <div class="prj-info">
          <div class="prj-name-wrap">
            <input class="prj-name-input" value="${escapeHtml(prj.name||'프로젝트')}" title="클릭해서 이름 변경">
            ${isActive?'<span class="prj-badge">현재</span>':''}
          </div>
          <div class="prj-date">마지막 저장: ${dateStr}</div>
        </div>
        <div class="prj-btns">
          ${isActive
            ? `<button class="pb-save">💾 저장</button>`
            : `<button class="pb-load">불러오기</button>`}
          <button class="pb-del">삭제</button>
        </div>`;

      // 이름 변경
      card.querySelector('.prj-name-input').addEventListener('change', async ev=>{
        const newName=ev.target.value.trim()||'프로젝트';
        try{ await setDoc(doc(db,'editorProjects',prj.id),{name:newName},{merge:true}); toast('이름 변경됨'); }
        catch(e){ toast('변경 실패: '+(e.message||e)); }
      });

      // 저장 (현재 프로젝트)
      const saveBtn=card.querySelector('.pb-save');
      if(saveBtn) saveBtn.addEventListener('click', async()=>{
        const nm=card.querySelector('.prj-name-input').value.trim()||'프로젝트';
        saveBtn.textContent='저장 중…'; saveBtn.disabled=true;
        await cloudSave(nm, prj.id);
        await renderPrjList(); await renderCloudFiles();
      });

      // 불러오기
      const loadBtn=card.querySelector('.pb-load');
      if(loadBtn) loadBtn.addEventListener('click', async()=>{
        if(!confirm(`"${prj.name||'프로젝트'}"을(를) 불러올까요?\n현재 작업 내용은 대체됩니다.`)) return;
        loadBtn.textContent='불러오는 중…'; loadBtn.disabled=true;
        try{
          const s=await getDoc(doc(db,'editorProjects',prj.id));
          if(s.exists()&&s.data().data){
            project=JSON.parse(s.data().data); curPage=0; selId=null;
            history=[]; hist_i=-1; snapshot();
            renderCanvas(); renderPages(); renderProps(); save(true);
            _prjId=prj.id; localStorage.setItem('hw_prj_id',_prjId);
            document.getElementById('cloud-modal').style.display='none';
            toast(`"${prj.name||'프로젝트'}" 불러왔습니다 ☁`);
          }
        }catch(e){ toast('불러오기 실패: '+(e.message||e)); loadBtn.textContent='불러오기'; loadBtn.disabled=false; }
      });

      // 삭제
      card.querySelector('.pb-del').addEventListener('click', async()=>{
        if(!confirm(`"${prj.name||'프로젝트'}"을(를) 삭제할까요?\n이 작업은 되돌릴 수 없습니다.`)) return;
        try{
          await deleteDoc(doc(db,'editorProjects',prj.id));
          if(_prjId===prj.id){ _prjId=null; localStorage.removeItem('hw_prj_id'); }
          toast('프로젝트 삭제됨'); renderPrjList();
        }catch(e){ toast('삭제 실패: '+(e.message||e)); }
      });

      list.appendChild(card);
    });
  }catch(e){
    list.innerHTML=`<div style="text-align:center;padding:20px;color:#ff8da3;font-size:13px">로드 실패: ${e.message||e}</div>`;
  }
}

async function renderCloudFiles(){
  const list=document.getElementById('cloud-file-list');
  list.innerHTML='<div style="text-align:center;padding:20px;color:var(--sub);font-size:13px">파일 목록 불러오는 중…</div>';
  try{
    const dirRef=sRef(storage,'editor/');
    const res=await listAll(dirRef);
    if(res.items.length===0){
      list.innerHTML='<div style="text-align:center;padding:20px;color:var(--sub);font-size:13px">업로드된 파일이 없습니다</div>';
      return;
    }
    const items=await Promise.all(res.items.map(async item=>{
      const [url,meta]=await Promise.all([getDownloadURL(item),getMetadata(item)]);
      return {ref:item,url,name:item.name,size:meta.size,updated:meta.updated};
    }));
    items.sort((a,b)=>new Date(b.updated)-new Date(a.updated));
    list.innerHTML='';
    items.forEach(({ref,url,name,size,updated})=>{
      const kb=(size/1024).toFixed(1);
      const d=new Date(updated);
      const dateStr=`${d.toLocaleDateString('ko-KR')} ${d.toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit'})}`;
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:10px;padding:8px 10px;background:var(--panel2);border:1px solid var(--border);border-radius:9px';
      row.innerHTML=`
        <img src="${url}" style="width:44px;height:36px;object-fit:cover;border-radius:6px;flex-shrink:0;border:1px solid var(--border)">
        <div style="flex:1;min-width:0">
          <div style="font-size:12px;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${name}</div>
          <div style="font-size:11px;color:var(--sub);margin-top:2px">${kb} KB · ${dateStr}</div>
        </div>
        <a href="${url}" target="_blank" style="color:var(--sub);font-size:14px;text-decoration:none;padding:4px 8px;border:1px solid var(--border);border-radius:6px" title="새 탭에서 열기">↗</a>
        <button data-name="${name}" style="background:rgba(180,60,60,.2);border:1px solid rgba(200,80,80,.4);color:#ff8da3;border-radius:6px;padding:4px 9px;font-size:12px;cursor:pointer" title="삭제">🗑</button>`;
      row.querySelector('button').addEventListener('click',async()=>{
        if(!confirm(`"${name}" 파일을 삭제할까요?\n현재 캔버스에서 이 이미지를 사용 중이면 깨질 수 있습니다.`)) return;
        try{
          await deleteObject(ref);
          toast('파일 삭제됨');
          renderCloudFiles();
        }catch(e){ toast('삭제 실패: '+(e.message||e)); }
      });
      list.appendChild(row);
    });
  }catch(e){
    list.innerHTML=`<div style="text-align:center;padding:20px;color:#ff8da3;font-size:13px">파일 목록 로드 실패<br><span style="font-size:11px;color:var(--sub)">${e.message||e}</span></div>`;
  }
}

document.getElementById('cloud-refresh').onclick=renderCloudFiles;
document.getElementById('prj-new-btn').addEventListener('click', async()=>{
  const name=(prompt('새 프로젝트 이름을 입력하세요:','새 프로젝트')||'').trim();
  if(!name) return;
  const btn=document.getElementById('prj-new-btn');
  btn.textContent='저장 중…'; btn.disabled=true;
  const prevId=_prjId;
  _prjId=null;
  try{
    await uploadEmbeddedImages();
    const ref=await addDoc(collection(db,'editorProjects'),{name,data:JSON.stringify(project),updatedAt:new Date().toISOString()});
    _prjId=ref.id; localStorage.setItem('hw_prj_id',_prjId);
    toast(`"${name}" 프로젝트로 저장됨`); renderPrjList();
  }catch(e){ _prjId=prevId; toast('저장 실패: '+(e.message||e)); }
  finally{ btn.textContent='+ 새 프로젝트로 저장'; btn.disabled=false; }
});

// parseAiJson() → public/editor-ai-parse.js 로 분리 (상단 import)

// ───────────────────────── AI 초안 생성 ─────────────────────────
let aiRefImgs=[];
const AI_IMG_MAX=8;
function renderAiThumbs(){
  const n=aiRefImgs.length;
  document.getElementById('ai-img-name').textContent = n? `첨부 ${n}장` : '';
  document.getElementById('ai-img-clear').style.display = n? 'inline' : 'none';
  const host=document.getElementById('ai-img-thumbs');
  host.innerHTML = aiRefImgs.map((im,i)=>`<span style="position:relative;display:inline-block"><img src="data:${im.mediaType};base64,${im.data}" style="width:46px;height:46px;object-fit:cover;border-radius:6px;border:1px solid var(--border)"><span data-rmimg="${i}" title="제거" style="position:absolute;top:-6px;right:-6px;width:16px;height:16px;background:#000a;color:#fff;border-radius:50%;font-size:11px;display:flex;align-items:center;justify-content:center;cursor:pointer">✕</span></span>`).join('');
  host.querySelectorAll('[data-rmimg]').forEach(b=>b.addEventListener('click',()=>{ aiRefImgs.splice(+b.dataset.rmimg,1); renderAiThumbs(); }));
}
async function addAiImg(file){
  if(aiRefImgs.length>=AI_IMG_MAX){ toast(`이미지는 최대 ${AI_IMG_MAX}장까지`); return; }
  try{ const {mediaType,data}=await downscaleToB64(file); aiRefImgs.push({mediaType,data}); renderAiThumbs(); }
  catch(err){ toast('이미지 처리 실패'); }
}
document.getElementById('btn-ai').onclick=()=>{ document.getElementById('ai-modal').style.display='flex'; };
document.getElementById('ai-close').onclick=()=>{ document.getElementById('ai-modal').style.display='none'; };
document.getElementById('ai-modal').addEventListener('mousedown',e=>{ if(e.target.id==='ai-modal') e.currentTarget.style.display='none'; });
document.getElementById('ai-img-pick').onclick=()=>document.getElementById('ai-img-file').click();
document.getElementById('ai-img-clear').onclick=e=>{ e.stopPropagation(); aiRefImgs=[]; renderAiThumbs(); };
document.getElementById('ai-img-file').addEventListener('change', async e=>{
  const files=[...e.target.files]; e.target.value='';
  for(const f of files) await addAiImg(f);
});
function downscaleToB64(file,max=1280){
  return new Promise((res,rej)=>{ const fr=new FileReader(); fr.onload=()=>{ const img=new Image(); img.onload=()=>{ let w=img.width,h=img.height; if(w>max||h>max){ const r=Math.min(max/w,max/h); w=Math.round(w*r); h=Math.round(h*r);} const c=document.createElement('canvas'); c.width=w; c.height=h; c.getContext('2d').drawImage(img,0,0,w,h); res({mediaType:'image/jpeg',data:c.toDataURL('image/jpeg',0.85).split(',')[1]}); }; img.onerror=rej; img.src=fr.result; }; fr.onerror=rej; fr.readAsDataURL(file); });
}
function aiStatus(s){ document.getElementById('ai-status').textContent=s; }
// ── URL로 사이트 분석 ──
let aiSiteRef=null;
document.getElementById('ai-url-go').onclick=async()=>{
  if(!isAdmin){ openLogin(); return; }
  const url=document.getElementById('ai-url').value.trim();
  const st=document.getElementById('ai-url-status');
  if(!url){ st.textContent='주소를 입력하세요.'; return; }
  const btn=document.getElementById('ai-url-go'); btn.disabled=true; btn.textContent='분석 중…';
  st.style.color='var(--sub)'; st.textContent='사이트를 가져오는 중…';
  try{
    const res=await fetchSite({ url });
    const d=res.data||{};
    aiSiteRef=d;
    const cnt=(d.h1?.length||0)+(d.h2?.length||0)+(d.h3?.length||0);
    st.style.color='var(--accent2)';
    st.textContent=`✓ 분석 완료: "${d.title||url}" · 제목 ${cnt}개 · 색상 ${(d.colors||[]).length}개 — '초안 생성하기'를 누르면 이 구조를 참고합니다`;
  }catch(e){
    aiSiteRef=null;
    st.style.color='#ff8da3'; st.textContent='실패: '+((e.message||e+'').replace(/^.*?:/,'')||'가져오지 못했습니다');
  }finally{ btn.disabled=false; btn.textContent='🔗 분석'; }
};
document.getElementById('ai-go').onclick=async()=>{
  if(!isAdmin){ aiStatus('로그인이 필요합니다.'); openLogin(); return; }
  const baseKey=document.getElementById('ai-base').value;
  const desc=document.getElementById('ai-desc').value.trim();
  const appendMode=document.getElementById('ai-append').checked;
  const typeLabel=appendMode?'섹션(한 묶음)':({home:'병원 홈(메인)',about:'병원 소개',service:'진료 안내',contact:'오시는 길'}[baseKey]||'병원 페이지');
  const SCHEMA_EXAMPLE=`{"name":"홈","bg":"#ffffff","elements":[
  {"type":"shape","x":0,"y":0,"w":${PAGE_W},"h":520,"shape":"rect","fill":"#1a2b5c"},
  {"type":"text","x":120,"y":150,"w":620,"h":120,"text":"건강한 내일을 함께","fontSize":54,"fontWeight":900,"color":"#ffffff","align":"left"},
  {"type":"text","x":120,"y":300,"w":520,"h":80,"text":"환자 중심의 따뜻한 진료","fontSize":22,"fontWeight":400,"color":"#cfd8ff","align":"left"},
  {"type":"shape","x":120,"y":410,"w":200,"h":60,"shape":"rrect","fill":"#3b82f6","radius":30},
  {"type":"text","x":120,"y":425,"w":200,"h":32,"text":"진료 예약하기","fontSize":18,"fontWeight":700,"color":"#ffffff","align":"center"},
  {"type":"image","x":760,"y":120,"w":320,"h":320},
  {"type":"text","x":0,"y":640,"w":${PAGE_W},"h":50,"text":"진료 과목","fontSize":36,"fontWeight":900,"color":"#1a2b5c","align":"center"}
]}`;
  const sys=`너는 실력 있는 병원 홈페이지 디자이너다. 사용자의 참고 자료(URL 분석 결과 / 스크린샷 이미지 / 설명)를 바탕으로 '${typeLabel}' 페이지를 **처음부터 새로** 디자인해, 아래 스키마의 JSON 하나로만 응답한다. 베이스 골격은 없다 — 참고 자료의 분위기·구조·색을 살려 자유롭게 구성하라.

캔버스: 가로폭 ${PAGE_W}px 고정. 모든 x는 0~${PAGE_W}. 세로 y는 0부터 아래로(보통 1400~2600), 여러 섹션(히어로/소개/카드/푸터 등)을 구성하라.
요소 타입:
- text: {"type":"text","x","y","w","h","text":"실제 문구","fontSize":숫자,"fontWeight":300~900,"color":"#hex","align":"left|center|right"}
- shape: {"type":"shape","x","y","w","h","shape":"rect|rrect|circle","fill":"#hex","radius":숫자} ← 섹션 배경·카드·버튼 박스에 사용
- image: {"type":"image","x","y","w","h"} ← src는 넣지 마라(자동으로 사진 자리표시자가 들어간다)
- table: {"type":"table","x","y","w","h","cols":열수,"rows":행수,"cells":[{"r":0,"c":0,"text":"머리행항목"},...],"headerBg":"#hex","headerColor":"#fff","cellBg":"#fff","cellColor":"#333","fontSize":14,"borderW":1,"borderColor":"#ddd"} ← 진료시간·의료진·진료과목·가격·오시는길 안내 등 정보가 표로 정리되면 좋을 때 적극 활용. 첫 행(r:0)이 머리행. cells는 실제 한국어 내용으로 빠짐없이 채워라(placeholder 금지). w≈cols×140, h≈rows×44.
규칙:
- 색상(bg, fill, color)은 참고 자료의 톤에 맞춰라.
- 문구는 참고 자료에 있으면 반영하고, 없으면 병원에 어울리는 **자연스러운 한국어 문구를 직접 작성**하라. "제목","본문" 같은 자리표시자는 쓰지 마라.
- 버튼은 둥근 shape(rrect) 위에 text를 겹쳐서 만든다. 카드도 연한 shape 위에 text를 얹는다.
- fontFamily는 보통 생략(기본 본고딕). 강조 제목엔 "Black Han Sans","Do Hyeon" 등을 써도 된다.
- **맨 아래에 푸터 섹션**을 넣어라: 어두운 배경 띠(폭 전체 shape) 위에 병원명·주소·전화·진료시간·저작권(© 2026 …)을 흰/연한 글자로.
- **주요 요소에 진입 효과를 절제해서 "fx"로 넣어도 된다**(없어도 됨): 큰 제목 {"type":"char-reveal"}, 히어로/큰 사진 {"type":"mask-wipe"} 또는 {"type":"blur-in"}, 같은 줄 카드들 {"type":"scroll-reveal","dir":"up","delay":0/100/200}(스태거). 과하지 않게, 본문·작은 글자엔 금지.
- **고정탭(선택)**: 최상위에 "fixedTabs":[{"corner":"br","dir":"col","bg":"#hex","color":"#fff","radius":26,"items":[{"label":"📞 전화상담","action":"url","url":"tel:"},{"label":"예약하기","action":"top"}]}] 를 넣으면 화면 모서리에 항상 떠 있는 플로팅 버튼이 생긴다(전 페이지 공통). 병원 페이지엔 전화/예약 같은 상시 버튼이 유용하니 1개 정도 권장(과하면 생략). corner=tl|tr|bl|br, action=top(맨위로)|url(외부·tel:전화)|link(내부페이지).
출력: 오직 {"name":"..","bg":"#hex","elements":[..],"fixedTabs":[..](선택)} JSON 하나. 마크다운/설명/주석 금지. 큰따옴표·정수·트레일링콤마 없음·끝까지 완성된 유효 JSON.
스키마 예시(형식 참고용, 그대로 베끼지 말 것):
${SCHEMA_EXAMPLE}`;
  let userText = desc ? `요청: ${desc}` : '참고 자료의 분위기에 맞춰 보기 좋은 병원 페이지를 만들어줘.';
  if(aiSiteRef){
    const s=aiSiteRef;
    userText = `아래 [참고 사이트]의 구조·색상·문구를 참고해 비슷한 느낌의 '${typeLabel}'를 처음부터 만들어줘. 똑같이 베끼지 말고 유사한 레이아웃·색 톤으로 재구성하되, 실제 문구는 참고 사이트 내용을 반영해 병원용으로 자연스럽게 써라.\n`+
      `[참고 사이트]\n- 사이트명: ${s.title||''}\n- 설명: ${s.description||''}\n- 대표 색상: ${(s.colors||[]).join(', ')||s.themeColor||''}\n- 큰제목: ${(s.h1||[]).join(' / ')}\n- 중제목: ${(s.h2||[]).slice(0,8).join(' / ')}\n- 소제목: ${(s.h3||[]).slice(0,8).join(' / ')}\n- 버튼 문구: ${(s.buttons||[]).join(' / ')}\n\n추가 요청: ${desc||'(없음)'}`;
  }
  if(aiRefImgs.length){ userText += '\n첨부한 스크린샷의 레이아웃·색감을 참고해 비슷한 구조로 구성해줘.'; }
  const content = aiRefImgs.length
    ? [ ...aiRefImgs.map(im=>({type:'image',source:{type:'base64',media_type:im.mediaType,data:im.data}})), {type:'text',text:userText} ]
    : userText;
  const sysFull = appendMode
    ? sys + '\n\n★섹션 추가 모드: 페이지 전체가 아니라 하나의 섹션(소제목 + 카드/이미지/버튼 한 묶음)만 만들어라. 모든 y는 0부터 시작하는 섹션 내부 좌표로(맨 위 요소 y≈0), 섹션 총 높이는 500~1000px. "name"·"bg"는 출력하지 마라(elements만).'
    : sys;
  aiStatus(appendMode?'AI가 섹션을 생성 중입니다…':'AI가 참고 자료로 템플릿을 생성 중입니다… (10~30초)');
  document.getElementById('ai-go').disabled=true;
  try{
    const res=await aiProxy({ body:{ model:'claude-opus-4-8', max_tokens:12000, system:sysFull, messages:[{role:'user',content}] }});
    const text=res.data?.content?.[0]?.text||'';
    const spec=parseAiJson(text);
    if(!spec) throw new Error('AI 응답을 JSON으로 해석하지 못했습니다. 다시 시도해 주세요.');
    const p=page();
    const norm=e=>{
      const base={id:uid(),rot:e.rot||0,x:0,y:0,w:200,h:60};
      if(e.type==='text') Object.assign(base,{text:'',fontFamily:'Noto Sans KR',fontWeight:400,fontSize:24,color:'#333333',align:'left',lineHeight:1.4,letterSpacing:0,italic:false,underline:false});
      else if(e.type==='table') Object.assign(base,{cols:3,rows:3,cells:[],borderW:1,borderColor:'#333333',headerBg:'#4a5568',headerColor:'#ffffff',cellBg:'#ffffff',cellColor:'#333333',fontSize:14,fontFamily:'Noto Sans KR',fontWeight:400,headerWeight:700,radius:0});
      else if(e.type==='shape') Object.assign(base,{shape:'rect',fill:'#cccccc',radius:0,borderW:0,borderColor:'#333333'});
      else if(e.type==='image') Object.assign(base,{src:PHOTO,fit:'cover',clip:'none',radius:0,borderW:0,borderColor:'#333333'});
      return Object.assign(base,e);
    };
    const newEls=(Array.isArray(spec.elements)?spec.elements:[]).filter(e=>e&&e.type).map(norm);
    if(appendMode){
      // 섹션으로 추가 — 선택 위치(있으면) 또는 기존 내용 아래에 삽입
      let targetY;
      if(selIds.size){ targetY=Math.min(...[...selIds].map(id=>el(id)).filter(Boolean).map(e=>e.y)); }
      else { targetY=(p.elements.length?Math.max(...p.elements.map(e=>e.y+e.h)):0)+60; }
      const top=newEls.length?Math.min(...newEls.map(e=>e.y)):0;
      newEls.forEach(e=>{ e.y=Math.round(e.y-top+targetY); e.x=Math.max(0,Math.min(p.w-e.w,e.x)); });
      p.elements.push(...newEls);
      const bottom=newEls.length?Math.max(...newEls.map(e=>e.y+e.h)):targetY;
      if(bottom+40>p.h) p.h=Math.round(bottom+40);
      selIds=new Set(newEls.map(e=>e.id)); selId=newEls.length?newEls[newEls.length-1].id:null;
    } else {
      if(spec.name) p.name=spec.name;
      if(spec.bg) p.bg=spec.bg;
      p.elements=newEls; selId=null; selIds=new Set();
      // 고정탭(선택) — 전 페이지 공통이라 이미 있으면 중복 생성 방지
      if(Array.isArray(spec.fixedTabs) && spec.fixedTabs.length && !(project.fixedTabs&&project.fixedTabs.length)){
        applyAiActions(spec.fixedTabs.map(ft=>({type:'add_fixtab',fixtab:ft})));
      }
    }
    document.getElementById('ai-modal').style.display='none';
    aiRefImgs=[]; renderAiThumbs();
    aiSiteRef=null; document.getElementById('ai-url').value=''; document.getElementById('ai-url-status').textContent='';
    afterMutate(); toast(appendMode?`섹션 추가 완료 ✨ (${newEls.length}개 요소) — 드래그로 위치 조정 가능`:'AI 생성 완료 ✨ — 마음에 들면 📁 내 템플릿에 저장하세요');
  }catch(e){
    const msg=e.message||String(e);
    aiStatus('실패: '+(msg.includes('unauthenticated')?'로그인이 필요합니다':msg.includes('resource-exhausted')||msg.includes('크레딧')?'AI 크레딧이 소진되었습니다':msg));
  }finally{ document.getElementById('ai-go').disabled=false; }
};
document.getElementById('ai-append').addEventListener('change',function(){
  const ap=this.checked;
  document.getElementById('ai-go').textContent=ap?'＋ 섹션 추가하기':'초안 생성하기';
  const sub=document.querySelector('#ai-modal .modal-sub'); if(sub) sub.textContent=ap?'기존 내용 아래/선택 위치에 섹션 추가':'현재 페이지에 적용됩니다';
  const lbl=document.getElementById('ai-base-lbl'); if(lbl) lbl.firstChild.textContent=ap?'섹션 종류 ':'만들 페이지 종류 ';
});
// ── 내 템플릿 라이브러리 (localStorage · 폴더+이름) ──
function getTemplates(){ try{return JSON.parse(localStorage.getItem('hw_templates')||'[]');}catch{return[];} }
function setTemplates(a){ try{localStorage.setItem('hw_templates',JSON.stringify(a));}catch(e){toast('저장 용량 초과 — 큰 이미지가 포함된 템플릿은 저장이 어려울 수 있어요');} }
function openTplLib(){ renderTplLib(); document.getElementById('tpl-lib-modal').style.display='flex'; }
function saveCurrentTemplate(){
  const name=(prompt('템플릿 이름:', page().name||'새 템플릿')||'').trim(); if(!name) return;
  const folder=(prompt('폴더명 (선택 — 비우면 "기본"):','')||'').trim()||'기본';
  const pg=page(); const arr=getTemplates();
  arr.push({ id:uid(), name, folder, createdAt:new Date().toISOString(),
    page:JSON.parse(JSON.stringify({name:pg.name,w:pg.w,h:pg.h,bg:pg.bg,elements:pg.elements})) });
  setTemplates(arr); toast(`"${name}" 템플릿 저장됨`); renderTplLib();
}
function applyTemplate(t, asNew){
  const src=t.page||{};
  const els=(src.elements||[]).map(e=>Object.assign(JSON.parse(JSON.stringify(e)),{id:uid()}));
  if(asNew){
    const np=newPage(src.name||t.name); np.w=src.w||PAGE_W; np.h=src.h||PAGE_H; np.bg=src.bg||'#ffffff'; np.elements=els;
    addContentPage(np);
  }else{
    const pg=page(); if(src.name)pg.name=src.name; if(src.bg)pg.bg=src.bg; if(src.h)pg.h=src.h; pg.elements=els;
  }
  selId=null; selIds=new Set(); document.getElementById('tpl-lib-modal').style.display='none'; afterMutate(); toast('템플릿 적용됨 ✨');
}
function renderTplLib(){
  const list=document.getElementById('tpl-lib-list'); const arr=getTemplates();
  if(!arr.length){ list.innerHTML='<div style="text-align:center;padding:20px;color:var(--sub);font-size:13px">저장된 템플릿이 없습니다 — 위 버튼으로 현재 페이지를 저장하세요</div>'; return; }
  const byF={}; arr.forEach(t=>{(byF[t.folder||'기본']||(byF[t.folder||'기본']=[])).push(t);});
  let html='';
  Object.keys(byF).sort().forEach(folder=>{
    html+=`<div><div style="font-size:11px;color:var(--sub);font-weight:700;margin-bottom:6px">📁 ${escapeHtml(folder)}</div><div style="display:flex;flex-wrap:wrap;gap:10px">`;
    byF[folder].forEach(t=>{
      html+=`<div style="width:150px;border:1px solid var(--border);border-radius:10px;overflow:hidden;background:var(--panel2)">
        <div data-prev="${t.id}" style="height:120px;background:${(t.page&&t.page.bg)||'#fff'};position:relative;overflow:hidden;cursor:pointer" title="클릭: 새 페이지로 적용"></div>
        <div style="padding:8px">
          <div style="font-size:12px;font-weight:700;color:var(--text);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${escapeHtml(t.name)}</div>
          <div style="display:flex;gap:4px;margin-top:6px">
            <button data-apply="${t.id}" style="flex:1;padding:5px;font-size:11px;background:var(--accent);border:none;border-radius:5px;color:#fff;cursor:pointer">새 페이지로</button>
            <button data-del="${t.id}" title="삭제" style="padding:5px 7px;font-size:11px;background:var(--panel);border:1px solid var(--border);border-radius:5px;color:#ff8da3;cursor:pointer">🗑</button>
          </div>
        </div>
      </div>`;
    });
    html+=`</div></div>`;
  });
  list.innerHTML=html;
  list.querySelectorAll('[data-prev]').forEach(box=>{
    const t=arr.find(x=>x.id===box.dataset.prev); if(!t||!t.page) return;
    const w=t.page.w||PAGE_W, h=t.page.h||PAGE_H, scale=150/w;
    const inner=document.createElement('div'); inner.style.cssText=`width:${w}px;height:${h}px;background:${t.page.bg||'#fff'};transform:scale(${scale});transform-origin:top left;position:absolute;top:0;left:0`;
    (t.page.elements||[]).forEach(e=>{ const n=renderEl(Object.assign(JSON.parse(JSON.stringify(e)),{id:'_t'+uid()})); n.style.pointerEvents='none'; n.classList.remove('selected'); inner.appendChild(n); });
    box.appendChild(inner);
    box.addEventListener('click',()=>applyTemplate(t,true));
  });
  list.querySelectorAll('[data-apply]').forEach(b=>b.addEventListener('click',()=>{ const t=arr.find(x=>x.id===b.dataset.apply); if(t)applyTemplate(t,true); }));
  list.querySelectorAll('[data-del]').forEach(b=>b.addEventListener('click',()=>{ if(!confirm('이 템플릿을 삭제할까요?'))return; setTemplates(getTemplates().filter(x=>x.id!==b.dataset.del)); renderTplLib(); }));
}
document.getElementById('open-tpl-lib').onclick=openTplLib;
document.getElementById('tpl-lib-close').onclick=()=>document.getElementById('tpl-lib-modal').style.display='none';
document.getElementById('tpl-lib-modal').addEventListener('mousedown',e=>{ if(e.target.id==='tpl-lib-modal') e.currentTarget.style.display='none'; });
document.getElementById('tpl-save-cur').onclick=saveCurrentTemplate;

document.getElementById('btn-save').onclick=()=>save();
document.getElementById('btn-undo').onclick=undo;
document.getElementById('btn-redo').onclick=redo;
document.getElementById('btn-preview').onclick=preview;

// ───────────────────────── AI 작업 채팅 ─────────────────────────
let _chatHistory=[];

function buildAiCtx(scope){
  const p=page();
  const scoped = scope && scope.size;
  const list = scoped ? p.elements.filter(e=>scope.has(e.id)) : p.elements;
  const rows=list.map((e)=>{
    const i=p.elements.indexOf(e);
    const oob=(e.x<0||e.y<0||e.x+e.w>p.w||e.y+e.h>p.h);
    let d=`[${i}] id="${e.id}" type=${e.type} pos=(${Math.round(e.x)},${Math.round(e.y)}) size=${Math.round(e.w)}×${Math.round(e.h)}${oob?' ⚠화면밖':''}`;
    if(e.type==='text'){ d+=` 텍스트="${e.text.replace(/\n/g,'↵').slice(0,50)}" font=${e.fontFamily} ${e.fontSize}px w=${e.fontWeight} color=${e.color} align=${e.align}`;
      if(e.valign&&e.valign!=='middle') d+=` valign=${e.valign}`; if(e.highlight) d+=` 강조=${e.highlight}`; if(e.bullet&&e.bullet!=='none') d+=` 글머리=${e.bullet}`; }
    else if(e.type==='shape'){ d+=` fill=${e.fill} shape=${e.shape} radius=${e.radius}`;
      if(e.borderW) d+=` border=${e.borderW}/${e.borderColor}`; if(e.fillOpacity!=null&&e.fillOpacity<100) d+=` 불투명도=${e.fillOpacity}`; if(e.stext) d+=` 내부글자="${e.stext.slice(0,24)}"`; }
    else if(e.type==='image') d+=` fit=${e.fit} clip=${e.clip}`;
    else if(e.type==='table'){ d+=` cols=${e.cols} rows=${e.rows} headerBg=${e.headerBg} cellBg=${e.cellBg}`;
      const filled=(e.cells||[]).filter(c=>c.text); if(filled.length) d+=` 셀=${filled.length}개입력`; }
    if(e.rot) d+=` rot=${e.rot}°`;
    if(e.fx&&e.fx.type) d+=` [fx:${e.fx.type}]`;
    if(e.link){const lp=pageById(e.link);d+=` [링크→${lp?lp.name:e.link}]`;}
    return d;
  });
  const dev = pageDevice(p)==='mobile' ? ' (모바일 페이지)' : pageDevice(p)==='pc' ? ' (PC 전용)' : '';
  const head = scoped
    ? `페이지 "${p.name}"${dev} 중 ★선택된 섹션★ ${list.length}개 요소만 대상 (이 요소들 외엔 절대 건드리지 말 것). 캔버스 ${p.w}×${p.h}px:\n`
    : `페이지: "${p.name}"${dev} ${p.w}×${p.h}px 배경=${p.bg}\n요소(${p.elements.length}개):\n`;
  let out = head+rows.join('\n');
  // 고정탭(모든 페이지 공통, 페이지 요소 아님)
  if(!scoped && project.fixedTabs && project.fixedTabs.length){
    out += '\n\n[고정탭 — 전 페이지 공통 플로팅 탭] '+project.fixedTabs.map(t=>{
      const its=(t.items||[]).map(i=>i.label).filter(Boolean).join('/');
      return `id="${t.id}" 위치=${t.corner||'br'} 항목=[${its}]`;
    }).join(' · ');
  }
  return out;
}

function applyAiActions(actions){
  let changed=false;
  for(const a of actions){
    if(a.type==='update_element'){
      const e=el(a.id); if(!e) continue;
      if(a.props && typeof a.props==='object'){ const pr={...a.props}; delete pr.id; delete pr.type; Object.assign(e, pr); }
      if('fx' in a){ if(a.fx&&a.fx.type) e.fx=a.fx; else delete e.fx; }
      changed=true;
    } else if(a.type==='add_element'){
      const defs=a.element.type==='text'
        ? {fontFamily:'Noto Sans KR',fontWeight:700,fontSize:32,color:'#333333',align:'center',lineHeight:1.3,letterSpacing:0,italic:false,underline:false,text:'텍스트'}
        : a.element.type==='table'
        ? {cols:3,rows:3,cells:[],borderW:1,borderColor:'#333333',headerBg:'#4a5568',headerColor:'#ffffff',cellBg:'#ffffff',cellColor:'#333333',fontSize:14,fontFamily:'Noto Sans KR',fontWeight:400,headerWeight:700,radius:0}
        : a.element.type==='shape'
        ? {shape:'rect',fill:'#6c7bff',radius:0,borderW:0,borderColor:'#333333'}
        : {src:PHOTO,fit:'cover',clip:'none',radius:0,borderW:0,borderColor:'#333333'};
      const ne=Object.assign({id:uid(),rot:0,w:300,h:80,x:100,y:200},defs,a.element);
      page().elements.push(ne); selId=ne.id; changed=true;
    } else if(a.type==='delete_element'){
      page().elements=page().elements.filter(x=>x.id!==a.id);
      if(selId===a.id) selId=null; changed=true;
    } else if(a.type==='update_page'){
      const props=a.props||{};
      if(props.bg) page().bg=props.bg;
      if(props.h) page().h=parseInt(props.h);
      if(props.name) page().name=props.name;
      changed=true;
    } else if(a.type==='reorder_element'){
      const arr=page().elements,i=arr.findIndex(x=>x.id===a.id);
      if(i>=0){
        if(a.to==='front')arr.push(arr.splice(i,1)[0]);
        else if(a.to==='back')arr.unshift(arr.splice(i,1)[0]);
        else if(a.to==='forward'&&i<arr.length-1){[arr[i],arr[i+1]]=[arr[i+1],arr[i]];}
        else if(a.to==='backward'&&i>0){[arr[i-1],arr[i]]=[arr[i],arr[i-1]];}
        changed=true;
      }
    } else if(a.type==='align_elements'){
      const arr=(a.ids||[]).map(id=>el(id)).filter(Boolean); if(arr.length){
        const pg=page(); let b;
        if(a.to==='selection'){ const x0=Math.min(...arr.map(e=>e.x)),y0=Math.min(...arr.map(e=>e.y)),x1=Math.max(...arr.map(e=>e.x+e.w)),y1=Math.max(...arr.map(e=>e.y+e.h)); b={x:x0,y:y0,w:x1-x0,h:y1-y0}; }
        else b={x:0,y:0,w:pg.w,h:pg.h};
        arr.forEach(e=>{ const k=a.mode;
          if(k==='left')e.x=Math.round(b.x); else if(k==='cx')e.x=Math.round(b.x+(b.w-e.w)/2); else if(k==='right')e.x=Math.round(b.x+b.w-e.w);
          else if(k==='top')e.y=Math.round(b.y); else if(k==='cy')e.y=Math.round(b.y+(b.h-e.h)/2); else if(k==='bottom')e.y=Math.round(b.y+b.h-e.h); });
        changed=true;
      }
    } else if(a.type==='distribute_elements'){
      let arr=(a.ids||[]).map(id=>el(id)).filter(Boolean); if(arr.length>=3){
        const axis=a.axis==='v'?'v':'h'; arr.sort((p,q)=>axis==='h'?p.x-q.x:p.y-q.y);
        if(axis==='h'){ const left=arr[0].x,right=arr[arr.length-1].x+arr[arr.length-1].w,sum=arr.reduce((s,e)=>s+e.w,0),gap=(right-left-sum)/(arr.length-1); let c=left; arr.forEach(e=>{e.x=Math.round(c);c+=e.w+gap;}); }
        else { const top=arr[0].y,bot=arr[arr.length-1].y+arr[arr.length-1].h,sum=arr.reduce((s,e)=>s+e.h,0),gap=(bot-top-sum)/(arr.length-1); let c=top; arr.forEach(e=>{e.y=Math.round(c);c+=e.h+gap;}); }
        changed=true;
      }
    } else if(a.type==='group'){ const ids=a.ids||[]; if(ids.length>=2){ const gid='grp_'+uid(); ids.forEach(id=>{const e=el(id);if(e)e.groupId=gid;}); changed=true; } }
    else if(a.type==='ungroup'){ (a.ids||[]).forEach(id=>{const e=el(id);if(e&&e.groupId){delete e.groupId;changed=true;}}); }
    else if(a.type==='add_fixtab'){
      // 고정탭(플로팅 탭) 생성 — project.fixedTabs에 추가. 페이지 요소가 아님.
      const ft=a.fixtab||{};
      const roots=hamburgerRootPages();
      const items=(Array.isArray(ft.items)&&ft.items.length?ft.items:[{label:'예약',action:'top'}]).map(it=>{
        const o={ label:(it.label!=null?it.label:'메뉴'), action:(it.action==='link'||it.action==='url')?it.action:'top',
          link:it.link||(roots[0]&&roots[0].id)||'', url:it.url||'' };
        if(it.bg) o.bg=it.bg; if(it.color) o.color=it.color; return o;
      });
      const corner=/^[tb][lr]$/.test(ft.corner)?ft.corner:'br';
      const t={ id:uid(), items, dir:(ft.dir==='col'?'col':'row'), corner,
        dx:(ft.dx!=null?ft.dx:24), dy:(ft.dy!=null?ft.dy:24),
        w:ft.w||118, h:ft.h||46, bg:ft.bg||'#2b6cff', color:ft.color||'#ffffff',
        fontSize:ft.fontSize||15, fontWeight:ft.fontWeight||700, fontFamily:ft.fontFamily||'Noto Sans KR',
        radius:(ft.radius!=null?ft.radius:23), device:ft.device||'both' };
      if(ft.borderW) t.borderW=ft.borderW; if(ft.borderColor) t.borderColor=ft.borderColor;
      if(ft.fx&&ft.fx.type) t.fx=ft.fx;
      if(!project.fixedTabs) project.fixedTabs=[];
      project.fixedTabs.push(t); changed=true;
    }
    else if(a.type==='delete_fixtab'){
      if(project.fixedTabs&&a.id){ const i=project.fixedTabs.findIndex(x=>x.id===a.id); if(i>=0){ project.fixedTabs.splice(i,1); changed=true; } }
    }
    else if(a.type==='update_fixtab'){
      const t=(project.fixedTabs||[]).find(x=>x.id===a.id);
      if(t&&a.props&&typeof a.props==='object'){ const pr={...a.props}; delete pr.id; Object.assign(t,pr); changed=true; }
    }
  }
  return changed;
}

function chatMsg(role, text, highlight){
  const box=document.getElementById('ai-chat-msgs');
  const d=document.createElement('div');
  const isUser=role==='user';
  d.style.cssText=`padding:8px 12px;border-radius:${isUser?'14px 14px 4px 14px':'14px 14px 14px 4px'};background:${isUser?'var(--accent)':'var(--panel2)'};color:${isUser?'#fff':'var(--text)'};font-size:12px;line-height:1.6;align-self:${isUser?'flex-end':'flex-start'};max-width:92%;white-space:pre-wrap;word-break:break-word`;
  if(highlight) d.style.borderLeft='3px solid #4caf50';
  d.textContent=text; box.appendChild(d); box.scrollTop=box.scrollHeight;
  return d;
}

async function sendChat(){
  if(!isAdmin){toast('로그인이 필요합니다');openLogin();return;}
  const inp=document.getElementById('ai-chat-input');
  const msg=inp.value.trim(); if(!msg && !_chatImg) return;
  inp.value='';
  chatMsg('user',(_chatImg?'📷 ':'')+(msg||'(이미지 분석 요청)'));
  if(_chatImg){
    _chatHistory.push({role:'user',content:[
      {type:'image',source:{type:'base64',media_type:_chatImg.mediaType,data:_chatImg.data}},
      {type:'text',text:msg||'이 이미지를 참고해서 현재 페이지를 비슷하게 만들어줘.'}
    ]});
    clearChatImg();
  }else{
    _chatHistory.push({role:'user',content:msg});
  }

  const sys=`너는 캔버스 에디터 AI 어시스턴트다. 사용자 자연어 지시를 받아 캔버스 요소를 직접 수정한다.

현재 페이지 상태:
${buildAiCtx()}
${selIds.size?`\n[현재 선택된 섹션] 사용자가 선택 중인 요소 id: ${[...selIds].join(', ')} — 사용자가 "이것/선택한 것/이 섹션/여기"라고 하면 이 요소들을 의미한다. 범위가 모호하면 이 선택분에 우선 적용하라.`:''}

수행 가능한 액션:
1. {"type":"update_element","id":"요소ID","props":{변경할속성},"fx":{이펙트 또는 null로제거}}
2. {"type":"add_element","element":{type:"text"|"shape"|"image",x,y,w,h,rot:0,...속성}}
3. {"type":"delete_element","id":"요소ID"}
4. {"type":"update_page","props":{bg:"#hex",h:숫자,name:"문자열"}}
5. {"type":"reorder_element","id":"요소ID","to":"front"|"back"|"forward"|"backward"}
6. {"type":"align_elements","ids":["id1","id2",...],"mode":"left"|"cx"|"right"|"top"|"cy"|"bottom","to":"page"|"selection"} ← 정렬(가운데=cx/cy). 페이지 기준 또는 선택개체끼리
7. {"type":"distribute_elements","ids":[...],"axis":"h"|"v"} ← 3개 이상 균등 간격
8. {"type":"group","ids":[...]} / {"type":"ungroup","ids":[...]} ← 그룹 묶기/풀기
9. {"type":"add_fixtab","fixtab":{corner,dx,dy,w,h,bg,color,fontSize,fontWeight,radius,dir,device,items:[{label,action,link,url,bg,color}],fx}} ← 고정탭(화면 모서리 플로팅 버튼·전 페이지 공통)
   {"type":"update_fixtab","id":"탭ID","props":{...}} / {"type":"delete_fixtab","id":"탭ID"}

속성 참고:
텍스트: text(줄바꿈=\\n), fontFamily, fontWeight(300~900), fontSize, color(#hex), align(left|center|right|justify), valign(top|middle|bottom), lineHeight(0.8~2.5), letterSpacing, italic/underline/strike(bool), highlight(#hex|null), bullet(none|disc|number)
도형: fill(#hex), shape(rect|rrect|circle|line|line-arrow 등), radius, borderW, borderColor(#hex), fillOpacity(0~100), 내부글자=stext/stColor/stSize
이미지: fit(cover|contain), clip(none|circle), radius, borderW, borderColor (src는 바꾸지 마라)
표(type:"table"): cols(열수), rows(행수), cells:[{r:행,c:열,text:"셀내용",bg,color,align},...], colWidths:[열별px] rowHeights:[행별px](생략 시 균등), headerBg(#hex 머리행배경), headerColor(#hex 머리행글자), cellBg(#hex 본문배경), cellColor(#hex 본문글자), fontSize, fontWeight, headerWeight, borderW, borderColor, radius. 첫 행(r:0)은 머리행. 사용자가 표를 붙여넣거나 "표/진료시간표/가격표/의료진표 만들어줘"라고 하면 type:"table"로 add_element하고, 붙여넣은 데이터를 cells에 빠짐없이 채워라(빈 placeholder 금지). cols×rows는 실제 데이터에 맞추고, w는 cols×약140, h는 rows×약44로 잡아라.
고정탭(fixtab): corner(tl|tr|bl|br 화면 모서리), dx/dy(모서리에서 px 여백·기본24), w/h, bg/color(탭 배경·글자색), radius(둥글기·기본23이면 알약형), fontSize/fontWeight, dir(row 가로|col 세로 여러 항목), device(both|pc|mobile), items[]=항목들. 각 item: label(글자), action("top"=맨위로 | "link"=내부페이지(link=페이지ID) | "url"=외부링크(url)), 항목별 bg/color 가능. 전화상담·예약·카카오톡·맨위로 같은 상시 버튼에 쓴다. fx로 등장/펄스 효과도 가능.
이펙트 fx: {type:"scroll-reveal",dir:"up"|"left"|"right"|"fade",delay:ms} | {type:"char-reveal",mode:"char"|"word",stagger:40}(텍스트 전용·글자 등장) | {type:"parallax",speed:0.15}(스크롤 패럴랙스) | {type:"scroll-scrub",mode:"both"|"scale"|"fade"}(스크롤 확대/페이드) | {type:"bg-video",src:"URL",kind:"mp4"|"youtube"|"vimeo"}(도형/이미지 배경영상) | {type:"sticky"}(상단 고정) | {type:"hover-expand",collapsedH:px} | {type:"hover-show"|"hover-hide",group:"ID"} | {type:"tab-trigger"|"tab-content",group:"ID",idx:0} | {type:"hover-zoom"} | {type:"counter",from:0,to:100,suffix:"",dur:2000} | {type:"slider",slides:[],auto:true,arrows:true,dots:true,interval:3000}
진입(스크롤 시 1회): {type:"mask-wipe"|"mask-wipe-l"|"rotate-in"|"blur-in"|"skew-in"|"flip-in"|"zoom-in"|"zoom-out"|"bounce-in"|"fade-in"|"slide-down"|"slide-right"|"slide-left"|"flip-y"|"pop-in"} (옵션 없음)
상시 루프: {type:"float"|"pulse"|"spin"|"wobble"|"shake"|"heartbeat"|"tada"|"swing"|"glow-loop"|"blink"} | {type:"gradient-flow"}(그라데이션 채운 도형) | {type:"marquee"}(텍스트만)
호버: {type:"hover-lift"|"hover-glow"|"hover-tilt"|"hover-grow"|"hover-sink"|"hover-rotate"|"hover-bright"|"hover-border"|"hover-dim"|"hover-float"}
사용가능 폰트: ${FONTS.map(f=>f[0]).join(', ')}
캔버스 크기: ${page().w}×${page().h}px (좌상단=0,0)

[효과 센스 — 절제가 핵심]
- 기본은 등장(scroll-reveal) 위주. 큰 제목 1~2개만 char-reveal. 사진=mask-wipe/blur-in, 카드=zoom-in/bounce-in.
- 같은 줄/그리드 카드는 scroll-reveal에 delay 0,80,160…ms로 순차 등장(스태거).
- parallax=큰 배경사진에만, scroll-scrub=핵심 1~2개만, pulse/spin/marquee=페이지당 1개 이하·제목/본문 금지.
- 한 요소에 fx 1개(루프 중복 금지). 진입+호버는 함께 OK. 사용자가 "과하게/화려하게" 안 했으면 절제(병원=차분/신뢰).
- "효과 다 넣어줘" 같은 요청도 무분별하게 전부 넣지 말고 위 규칙대로 의미 있는 곳에만.

[배치·안전 규칙]
- 모든 x,y,w,h는 캔버스 안(0~${page().w}, 0~${page().h}). 요소를 페이지 밖으로 내보내지 마라. ⚠화면밖 요소는 안으로 들여라.
- 요청과 무관한 요소는 건드리지 마라. 꼭 필요한 최소한만 수정.
- "가운데/정렬/같은 간격"은 각 요소의 x(또는 y)를 직접 계산해 update_element로 맞춰라(가로 가운데 x=(페이지폭-요소폭)/2). 여러 개면 한 번에 여러 action.
- 색/문구만 바꾸라면 위치·크기는 그대로.

[예시1] 버튼 추가
사용자: "제목 키우고 가운데, 그 아래 파란 예약 버튼 추가"
응답: {"reply":"제목을 키워 가운데 정렬하고 아래에 파란 예약 버튼을 추가했어요.","actions":[
 {"type":"update_element","id":"abc","props":{"fontSize":56,"align":"center","x":0,"w":${page().w}}},
 {"type":"add_element","element":{"type":"shape","shape":"rrect","x":${Math.round(page().w/2-120)},"y":300,"w":240,"h":64,"fill":"#2b6cff","radius":32}},
 {"type":"add_element","element":{"type":"text","x":${Math.round(page().w/2-120)},"y":300,"w":240,"h":64,"text":"진료 예약","fontSize":22,"fontWeight":700,"color":"#ffffff","align":"center","valign":"middle"}}
]}
[예시2] 표 만들기
사용자: "진료시간표 만들어줘 평일 9~6, 토요일 9~1, 일요일 휴진"
응답: {"reply":"진료시간표를 추가했어요.","actions":[
 {"type":"add_element","element":{"type":"table","x":${Math.round(page().w/2-280)},"y":260,"w":560,"h":220,"cols":2,"rows":5,"headerBg":"#2b6cff","headerColor":"#ffffff","cellBg":"#ffffff","cellColor":"#333333","borderColor":"#e2e2ee","cells":[{"r":0,"c":0,"text":"요일"},{"r":0,"c":1,"text":"진료시간"},{"r":1,"c":0,"text":"평일"},{"r":1,"c":1,"text":"09:00 - 18:00"},{"r":2,"c":0,"text":"토요일"},{"r":2,"c":1,"text":"09:00 - 13:00"},{"r":3,"c":0,"text":"점심시간"},{"r":3,"c":1,"text":"13:00 - 14:00"},{"r":4,"c":0,"text":"일요일/공휴일"},{"r":4,"c":1,"text":"휴진"}]}}
]}
[예시3] 고정탭(플로팅 버튼)
사용자: "오른쪽 아래에 전화상담이랑 예약 고정탭 만들어줘"
응답: {"reply":"오른쪽 아래에 전화상담·예약 고정탭을 추가했어요.","actions":[
 {"type":"add_fixtab","fixtab":{"corner":"br","dx":24,"dy":24,"dir":"col","bg":"#2b6cff","color":"#ffffff","radius":26,"fontSize":15,"fontWeight":700,"items":[{"label":"📞 전화상담","action":"url","url":"tel:"},{"label":"예약하기","action":"top"}]}}
]}

반드시 JSON만 응답: {"reply":"한국어설명","actions":[...]}`+deviceHint();

  const thinking=chatMsg('assistant','생각 중…');
  const sendBtn=document.getElementById('ai-chat-send');
  sendBtn.disabled=true; sendBtn.textContent='…';
  try{
    const res=await aiProxy({body:{model:'claude-sonnet-4-6',max_tokens:4000,system:sys,messages:_chatHistory.slice(-8)}});
    const raw=res.data?.content?.[0]?.text||'{}';
    const parsed=parseAiJson(raw);
    if(!parsed) throw new Error('AI 응답 JSON 해석 실패 (다시 시도해 주세요)');
    thinking.remove();
    _chatHistory.push({role:'assistant',content:raw});
    const acts=Array.isArray(parsed.actions)?parsed.actions:[];
    const changed=acts.length>0?applyAiActions(acts):false;
    if(changed) afterMutate();
    chatMsg('assistant',(parsed.reply||'완료')+(acts.length?`\n✅ ${acts.length}개 작업 완료`:''), acts.length>0);
  }catch(e){
    thinking.remove();
    const msg2=e.message||String(e);
    chatMsg('assistant','오류: '+(msg2.includes('unauthenticated')?'로그인이 필요합니다':msg2.includes('resource-exhausted')||msg2.includes('크레딧')?'AI 크레딧 소진':msg2));
  }finally{sendBtn.disabled=false;sendBtn.textContent='전송';}
}

document.getElementById('btn-aichat').onclick=()=>{
  const p=document.getElementById('ai-chat-panel');
  const show=p.style.display==='none'||p.style.display==='';
  p.style.display=show?'flex':'none';
  if(show&&!p.dataset.init){
    p.dataset.init='1';
    chatMsg('assistant','안녕하세요! 현재 페이지 요소를 자연어로 수정할 수 있어요.\n\n예시:\n• "제목 폰트 크기 72로 키워줘"\n• "파란 버튼 하나 추가해줘"\n• "카드 3개에 호버 펼침 효과 넣어줘"\n• "배경색을 연한 하늘색으로 바꿔줘"\n• "진료예약 버튼을 맨 앞으로"\n• "헤더 텍스트 굵게, 가운데 정렬"');
  }
};
document.getElementById('ai-chat-close').onclick=()=>{document.getElementById('ai-chat-panel').style.display='none';};
// ── AI 연출 입히기 (자연어 요청 모달) ──
function aifxStatus(s){ const el2=document.getElementById('aifx-status'); if(el2) el2.textContent=s; }
async function runAiFx(desc){
  if(!isAdmin){ toast('로그인이 필요합니다'); openLogin(); return; }
  const p=page();
  if(!p.elements.length){ aifxStatus('요소가 없습니다'); return; }
  const sys=`너는 병원 홈페이지 모션 디자이너다. 페이지 요소 목록을 보고 각 요소에 '센스 있게' 연출(fx)을 입힌다. 핵심은 절제 — 모든 요소에 넣지 말고 의미 있는 곳에만.

[효과 분류 — 같은 종류 안에서 다양하게 골라 단조롭지 않게]
- 진입(스크롤 시 1회): scroll-reveal(기본), fade-in/slide-down/slide-left/slide-right/pop-in(가벼운 등장), mask-wipe/blur-in(사진), zoom-in/bounce-in/flip-y(카드), char-reveal(큰 제목 전용)
- 강조(스크롤 연동): parallax(큰 배경사진), scroll-scrub(핵심 1~2개)
- 호버: hover-lift/hover-glow/hover-float/hover-bright/hover-rotate/hover-border(버튼·카드·이미지)
- 루프(상시·남용 금지): float/pulse(주목 버튼 1개), glow-loop/heartbeat(강조), spin/wobble/swing/tada/shake/blink = 장식 전용 — 페이지당 극소수

[언제 써라 / 쓰지 마라]
- char-reveal: 최상단 큰 제목/슬로건 1~2개만. 본문·작은 글자엔 금지.
- parallax: 화면폭 절반↑ 큰 이미지에만. 작은 사진 금지.
- scroll-scrub: 시선 끌 핵심 1~2개만. 여러 개 금지.
- pulse/spin/marquee: 페이지당 1개 이하. 제목·본문엔 금지(가독성).
- 같은 줄/그리드 카드: scroll-reveal에 delay를 0,80,160…ms로 줘 순차 등장(스태거).

[조합·절제 규칙]
- 한 요소에 fx는 1개. 루프 여러 개 금지.
- 진입+호버는 같은 요소에 OK(진입=1회, 호버=마우스 올릴 때).
- 전체의 약 60~80%만 연출. 푸터·법적고지·작은 라벨은 보통 비움.
- 이미 fx가 있거나 sticky 인 요소는 건드리지 않는다.

[의도 프리셋]
- 차분/신뢰(병원 기본값): scroll-reveal 위주 + 버튼 hover-lift. 루프·스크럽 최소.
- 세련/모던: mask-wipe·blur-in + 큰 배경 parallax 1개.
- 화려/임팩트: scroll-scrub·parallax 적극 + 핵심 버튼 pulse 1개.

[좋은 예시 — 형식 참고]
입력: [t1]큰제목 fontSize54 / [i1]히어로사진520px / [s1][s2][s3]카드3개 / [b1]예약버튼
출력: {"reply":"제목은 글자등장, 사진은 마스크, 카드 3개는 순차 등장, 예약 버튼만 살짝 강조했어요.","actions":[
 {"type":"update_element","id":"t1","fx":{"type":"char-reveal","mode":"char","stagger":40}},
 {"type":"update_element","id":"i1","fx":{"type":"mask-wipe"}},
 {"type":"update_element","id":"s1","fx":{"type":"scroll-reveal","dir":"up","delay":0}},
 {"type":"update_element","id":"s2","fx":{"type":"scroll-reveal","dir":"up","delay":80}},
 {"type":"update_element","id":"s3","fx":{"type":"scroll-reveal","dir":"up","delay":160}},
 {"type":"update_element","id":"b1","fx":{"type":"pulse"}}
]}
${desc?`★ 사용자 요청 최우선 반영: "${desc}" (요청 톤·지정/제외 효과를 우선)`:'요청이 없으면 위 "차분/신뢰" 프리셋을 기본으로.'}
출력은 JSON 하나만: {"reply":"한국어 한두 문장","actions":[{"type":"update_element","id":"요소ID","fx":{...}}]}`+deviceHint();
  const scope = selIds.size ? new Set(selIds) : null;
  const sysScoped = scope ? sys + '\n\n★중요: 위 컨텍스트의 ★선택된 섹션★ 요소들에만 fx를 적용하라. 그 외 요소는 actions에 절대 포함하지 마라.' : sys;
  const ctx=buildAiCtx(scope)+(desc?`\n\n[사용자 요청] ${desc}`:'');
  const go=document.getElementById('aifx-go'); if(go){ go.disabled=true; go.textContent='🎬 구성 중…'; }
  aifxStatus(scope?`AI가 선택한 ${scope.size}개 요소(섹션)에 연출 구성 중…`:'AI가 페이지 전체 연출을 구성 중…');
  try{
    const res=await aiProxy({body:{model:'claude-sonnet-4-6',max_tokens:4000,system:sysScoped,messages:[{role:'user',content:ctx}]}});
    const parsed=parseAiJson(res.data?.content?.[0]?.text||'');
    if(!parsed) throw new Error('응답 해석 실패 (다시 시도)');
    let acts=Array.isArray(parsed.actions)?parsed.actions.filter(a=>a.type==='update_element'&&a.fx):[];
    if(scope) acts=acts.filter(a=>scope.has(a.id)); // 선택 섹션 밖은 무시(안전장치)
    const changed=acts.length?applyAiActions(acts):false;
    if(changed){ afterMutate(); document.getElementById('aifx-modal').style.display='none'; toast('🎬 '+(parsed.reply||`${acts.length}개 요소에 연출 적용됨`)); }
    else aifxStatus('적용할 연출을 찾지 못했습니다. 요청을 더 구체적으로 적어보세요.');
  }catch(e){ const m=e.message||String(e); aifxStatus('실패: '+(m.includes('unauthenticated')?'로그인이 필요합니다':m.includes('resource-exhausted')||m.includes('크레딧')?'AI 크레딧 소진':m)); }
  finally{ if(go){ go.disabled=false; go.textContent='연출 입히기'; } }
}
document.getElementById('btn-aifx').onclick=()=>{
  if(!isAdmin){ toast('로그인이 필요합니다'); openLogin(); return; }
  document.getElementById('aifx-modal').style.display='flex';
  const st=document.getElementById('aifx-status');
  if(st){ if(selIds.size){ st.style.color='var(--accent2)'; st.textContent=`📍 선택한 ${selIds.size}개 요소(섹션)에만 적용됩니다. 페이지 전체로 하려면 빈 곳을 클릭해 선택을 해제하세요.`; } else { st.style.color='var(--sub)'; st.textContent='📄 페이지 전체에 적용됩니다. 특정 섹션만 하려면 그 요소들을 먼저 선택하세요.'; } }
  setTimeout(()=>document.getElementById('aifx-desc').focus(),0);
};
document.getElementById('aifx-close').onclick=()=>document.getElementById('aifx-modal').style.display='none';
document.getElementById('aifx-modal').addEventListener('mousedown',e=>{ if(e.target.id==='aifx-modal') e.currentTarget.style.display='none'; });
document.getElementById('aifx-go').onclick=()=>runAiFx(document.getElementById('aifx-desc').value.trim());
document.querySelectorAll('#aifx-modal [data-aifx-preset]').forEach(b=>b.addEventListener('click',()=>{ document.getElementById('aifx-desc').value=b.dataset.aifxPreset; }));

// ── 공통 AI 호출 ──
async function aiCall(system, content, maxTokens){
  const res=await aiProxy({body:{model:'claude-sonnet-4-6',max_tokens:maxTokens||4000,system:system,messages:[{role:'user',content:content}]}});
  const parsed=parseAiJson(res.data?.content?.[0]?.text||'');
  if(!parsed) throw new Error('AI 응답 해석 실패 (다시 시도)');
  return parsed;
}
function _aiErr(e){ const m=e.message||String(e); return m.includes('unauthenticated')?'로그인이 필요합니다':(m.includes('resource-exhausted')||m.includes('크레딧'))?'AI 크레딧 소진':m; }
// 현재 페이지가 모바일이면 AI 프롬프트에 붙일 컨텍스트
function deviceHint(){
  const p=page();
  if(pageDevice(p)==='mobile' || (!p.isHeader && !p.isFooter && p.w<=560)){
    const cw=p.w-48;
    return `\n[중요·모바일 페이지] 이 페이지는 모바일 화면(폭 ${p.w}px)이다. 다음을 반드시 지켜라:\n- 요소는 세로 1열로 쌓는다(가로 나란히 배치 금지). 좌우 여백 24px → 콘텐츠 폭 약 ${cw}px.\n- 텍스트·버튼·카드·이미지는 대체로 풀폭(x≈24, w≈${cw}).\n- 글자 크기는 모바일 가독성: 큰 제목 28~40, 소제목 20~26, 본문 16~18.\n- 터치 버튼 높이는 ≥44px. 좌표·크기는 0~${p.w} 안.\n- 새 요소를 추가하거나 위치를 정할 때 이 규칙을 적용한다.`;
  }
  return '';
}

// ── AI 카피 작성/다듬기 (선택 텍스트) ──
async function runAiCopy(e, instr){
  if(!isAdmin){ toast('로그인이 필요합니다'); openLogin(); return; }
  if(!e||e.type!=='text') return;
  const sys=`너는 병원 홈페이지 카피라이터다. 주어진 문구를 지시에 맞게 한국어로 다시 쓴다. 줄바꿈(\\n)은 필요하면 유지. 과장·허위 의료광고 표현은 피한다. 오직 JSON: {"text":"새 문구"}`+deviceHint();
  const content=`현재 문구:\n"""${e.text||'(비어있음)'}"""\n\n지시: ${instr}\n같은 자리에 쓸 자연스러운 문구로 다시 써줘. 현재 문구가 비어있으면 지시 내용으로 새로 작성.`;
  toast('AI가 문구를 작성 중…');
  try{ const r=await aiCall(sys,content,1200); if(r.text!=null){ e.text=String(r.text); e._caseOrig=null; liveStyleEl(e); applyAutofits(); renderProps(); snapshot(); toast('문구 적용됨 ✨'); } else toast('결과가 비어있습니다'); }
  catch(err){ toast('실패: '+_aiErr(err)); }
}

// ── AI 색감 테마 ──
function aicolorStatus(s){ const el2=document.getElementById('aicolor-status'); if(el2) el2.textContent=s; }
document.getElementById('btn-aicolor').onclick=()=>{ if(!isAdmin){toast('로그인이 필요합니다');openLogin();return;} document.getElementById('aicolor-modal').style.display='flex'; aicolorStatus(''); setTimeout(()=>document.getElementById('aicolor-desc').focus(),0); };
document.getElementById('aicolor-close').onclick=()=>document.getElementById('aicolor-modal').style.display='none';
document.getElementById('aicolor-modal').addEventListener('mousedown',e=>{ if(e.target.id==='aicolor-modal') e.currentTarget.style.display='none'; });
document.querySelectorAll('#aicolor-modal [data-aicolor-preset]').forEach(b=>b.addEventListener('click',()=>{ document.getElementById('aicolor-desc').value=b.dataset.aicolorPreset; }));
document.getElementById('aicolor-go').onclick=async()=>{
  const p=page(); if(!p.elements.length){ aicolorStatus('요소가 없습니다'); return; }
  const desc=document.getElementById('aicolor-desc').value.trim();
  const sys=`너는 병원 홈페이지 컬러 디자이너다. 페이지 요소 목록을 보고 먼저 머릿속으로 팔레트(주색 1 + 보조 1~2 + 중성/배경)를 정한 뒤, 그 팔레트로 일관되게 적용한다.
규칙:
- 색은 #RRGGBB. 전체 팔레트는 3~4색 이내로 절제. 병원은 신뢰감(차분한 블루/그린/네이비 + 화이트/그레이) 기조가 기본.
- 본문 텍스트는 밝은 배경 위 진한색(대비 충분, 거의 검정 계열). 흰/밝은 배경에 옅은 회색 본문 금지.
- 버튼(둥근 도형) = 포인트색 배경 + 흰색 글자. 카드 배경 = 아주 연한 톤(주색의 10~15% 명도), 그 위 글자는 진하게.
- 큰 섹션 배경은 흰색 또는 아주 연한 톤. 페이지 bg는 보통 흰색/연한색.
- 이미지(type=image)는 색이 없으니 건드리지 마라. 같은 역할(예: 카드들)은 같은 색으로 통일.
- 텍스트=color, 도형=fill로만 바꾼다. 위치·크기·문구는 절대 바꾸지 마라.
${desc?`★ 분위기 요청 우선 반영: "${desc}" (요청 톤에 팔레트를 맞춰라)`:''}
출력 JSON 하나만: {"reply":"어떤 팔레트를 썼는지 한줄","actions":[{"type":"update_element","id":"ID","props":{"fill":"#hex"또는"color":"#hex"}},{"type":"update_page","props":{"bg":"#hex"}}]}`+deviceHint();
  const go=document.getElementById('aicolor-go'); go.disabled=true; go.textContent='🎨 구성 중…'; aicolorStatus('AI가 색감을 구성 중…');
  try{
    const parsed=await aiCall(sys, buildAiCtx()+(desc?`\n\n[분위기] ${desc}`:''), 4000);
    const acts=Array.isArray(parsed.actions)?parsed.actions:[];
    const changed=acts.length?applyAiActions(acts):false;
    if(changed){ afterMutate(); document.getElementById('aicolor-modal').style.display='none'; toast('🎨 '+(parsed.reply||'색감 적용됨')); }
    else aicolorStatus('적용할 색 변경을 찾지 못했습니다');
  }catch(e){ aicolorStatus('실패: '+_aiErr(e)); }
  finally{ go.disabled=false; go.textContent='색감 적용'; }
};

// ── AI 검수·개선 제안 ──
let _aireviewActions=[];
function aireviewStatus(s){ const el2=document.getElementById('aireview-status'); if(el2) el2.textContent=s; }
document.getElementById('btn-aireview').onclick=()=>{ if(!isAdmin){toast('로그인이 필요합니다');openLogin();return;} document.getElementById('aireview-modal').style.display='flex'; aireviewStatus(''); _aireviewActions=[]; document.getElementById('aireview-apply').style.display='none'; document.getElementById('aireview-apply3').style.display='none'; document.getElementById('aireview-result').textContent=''; };
document.getElementById('aireview-close').onclick=()=>document.getElementById('aireview-modal').style.display='none';
document.getElementById('aireview-modal').addEventListener('mousedown',e=>{ if(e.target.id==='aireview-modal') e.currentTarget.style.display='none'; });
document.getElementById('aireview-run').onclick=async()=>{
  const p=page(); if(!p.elements.length){ aireviewStatus('요소가 없습니다'); return; }
  const sys=`너는 병원 홈페이지 UI/UX 검수 전문가다. 현재 페이지를 점검하고 가장 중요한 개선점부터 제시한다.
구체 점검 항목:
- ⚠화면밖 표시된 요소(페이지 경계 초과) → 안으로
- 텍스트-배경 대비 부족(밝은 배경에 옅은 글자 등) → 더 진하게
- 너무 작은 본문 글자(14px 미만) 또는 제목/본문 크기 위계가 약함
- 요소 겹침(같은 영역에 의도치 않게 포개짐), 정렬 안 맞음(좌측·중앙 제각각), 간격 불균일
- 빈 텍스트("") 또는 자리표시자("제목","텍스트") 방치
- 색 통일감 부족(버튼·카드 색이 제각각)
규칙: review는 발견한 문제를 중요도 순으로 •머리표 4~7줄. 추측이 아니라 좌표·크기·색 근거로. actions에는 "확실히 좋아지는 구체 수정"만(없으면 빈 배열). **actions도 영향이 큰 것부터(중요도 순) 정렬**하라. 위치·색·크기 수정만, 문구 창작은 하지 마라.
출력 JSON 하나만: {"review":"한국어 항목별 진단","actions":[{"type":"update_element","id":"ID","props":{...}} ...]}`+deviceHint();
  const btn=document.getElementById('aireview-run'); btn.disabled=true; btn.textContent='🔎 점검 중…'; aireviewStatus('AI가 페이지를 점검 중…');
  try{
    const parsed=await aiCall(sys, buildAiCtx(), 3000);
    document.getElementById('aireview-result').textContent=parsed.review||'특이사항을 찾지 못했습니다.';
    _aireviewActions=Array.isArray(parsed.actions)?parsed.actions.filter(a=>a&&a.type):[];
    const n=_aireviewActions.length;
    document.getElementById('aireview-apply').style.display=n?'block':'none';
    document.getElementById('aireview-apply3').style.display=n>3?'block':'none';
    aireviewStatus(n?`${n}개 자동 수정 제안 (중요도 순) — "전체" 또는 "상위 3개만" 적용`:'자동 적용할 수정은 없습니다 (위 제안을 참고해 직접 조정하세요)');
  }catch(e){ aireviewStatus('실패: '+_aiErr(e)); }
  finally{ btn.disabled=false; btn.textContent='🔎 다시 점검'; }
};
function _applyReview(list){ if(!list.length) return; const changed=applyAiActions(list); if(changed){ afterMutate(); document.getElementById('aireview-modal').style.display='none'; toast(`🔎 개선 제안 ${list.length}개 적용됨`); } }
document.getElementById('aireview-apply').onclick=()=>_applyReview(_aireviewActions);
document.getElementById('aireview-apply3').onclick=()=>_applyReview(_aireviewActions.slice(0,3));
document.getElementById('ai-chat-send').onclick=sendChat;
document.getElementById('ai-chat-input').addEventListener('keydown',ev=>{if(ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();sendChat();}});

// ── 채팅 이미지 첨부 ──
let _chatImg=null;
document.getElementById('ai-chat-img-btn').onclick=()=>document.getElementById('ai-chat-img-file').click();
document.getElementById('ai-chat-img-file').addEventListener('change',async e=>{
  const f=e.target.files[0]; e.target.value=''; if(!f) return;
  try{
    const {mediaType,data}=await downscaleToB64(f);
    _chatImg={mediaType,data};
    document.getElementById('ai-chat-img-name').textContent='📷 '+f.name;
    document.getElementById('ai-chat-imgbar').style.display='flex';
  }catch(err){ toast('이미지를 불러오지 못했습니다'); }
});
function clearChatImg(){ _chatImg=null; document.getElementById('ai-chat-imgbar').style.display='none'; }
document.getElementById('ai-chat-img-clear').onclick=clearChatImg;

// ── 스크린샷/이미지 붙여넣기 (Ctrl+V) ──
function clipboardImageFile(e){
  const cb = e.clipboardData || window.clipboardData;
  if(!cb || !cb.items) return null;
  for(const it of cb.items){ if(it.type && it.type.indexOf('image')===0) return it.getAsFile(); }
  return null;
}
// AI 초안 모달: 설명칸/모달 어디에 붙여넣어도 참고 이미지로 첨부
['ai-desc','ai-modal'].forEach(id=>{
  const t=document.getElementById(id);
  if(t) t.addEventListener('paste', async e=>{
    const f=clipboardImageFile(e); if(!f) return; e.preventDefault();
    await addAiImg(f); toast('스크린샷 첨부됨 📋');
  });
});
// AI 작업 채팅: 입력칸/패널에 붙여넣으면 첨부
['ai-chat-input','ai-chat-panel'].forEach(id=>{
  const t=document.getElementById(id);
  if(t) t.addEventListener('paste', async e=>{
    const f=clipboardImageFile(e); if(!f) return; e.preventDefault();
    try{ const {mediaType,data}=await downscaleToB64(f); _chatImg={mediaType,data};
      document.getElementById('ai-chat-img-name').textContent='📷 붙여넣은 스크린샷';
      document.getElementById('ai-chat-imgbar').style.display='flex'; toast('스크린샷 첨부됨 📋'); }
    catch(err){ toast('이미지 처리 실패'); }
  });
});
// 캔버스에 이미지/스크린샷 붙여넣기 (전역) — 입력창·AI패널·편집중 제외
document.addEventListener('paste', ev=>{
  const ae=document.activeElement;
  if(ae&&ae.closest&&ae.closest('#ai-chat-panel,#ai-modal,#login-modal,#find-modal,#cloud-modal')) return;
  if(ae&&/INPUT|TEXTAREA|SELECT/.test(ae.tagName)) return;
  if(document.querySelector('.el.editing')) return;
  const f=clipboardImageFile(ev); if(!f) return;
  ev.preventDefault(); addImageFromFile(f); toast('이미지 붙여넣기 됨 📋');
});

// ── 모달 / 패널 드래그 이동 ──
function makeDraggable(handle, target){
  handle.addEventListener('mousedown',ev=>{
    if(ev.target.closest('button,input,select,textarea,label,a')) return;
    ev.preventDefault();
    const r=target.getBoundingClientRect();
    target.style.position='fixed'; target.style.margin='0';
    target.style.left=r.left+'px'; target.style.top=r.top+'px';
    target.style.right='auto'; target.style.bottom='auto';
    const sx=ev.clientX-r.left, sy=ev.clientY-r.top;
    function mv(e){
      target.style.left=Math.max(0,Math.min(window.innerWidth-60, e.clientX-sx))+'px';
      target.style.top=Math.max(0,Math.min(window.innerHeight-40, e.clientY-sy))+'px';
    }
    function up(){ window.removeEventListener('mousemove',mv); window.removeEventListener('mouseup',up); }
    window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up);
  });
}
// 모든 .modal: 헤더로 드래그
document.querySelectorAll('.modal-bg > .modal').forEach(m=>{ const h=m.querySelector('.modal-head'); if(h) makeDraggable(h,m); });
// AI 작업 채팅 패널: 헤더로 드래그
(function(){ const p=document.getElementById('ai-chat-panel'), h=document.getElementById('ai-chat-head'); if(p&&h) makeDraggable(h,p); })();
// ───────────────────────── 전역 이벤트 위임: data-pa / data-align ─────────────────────────
document.addEventListener('click', ev=>{
  const paBtn=ev.target.closest('[data-pa]');
  if(paBtn && !paBtn.closest('#ctx-menu')){
    if(!selIds.size) return;
    alignSelection(paBtn.dataset.pa, true); // 페이지 기준 + 그룹은 한 덩어리로
    return;
  }
  const alignBtn=ev.target.closest('[data-align]');
  if(alignBtn && !alignBtn.closest('#ctx-menu')){
    const v=alignBtn.dataset.align;
    if(typeof applyToTexts==='function') applyToTexts(e=>e.align=v);
  }
  const vaBtn=ev.target.closest('[data-valign]');
  if(vaBtn){
    const v=vaBtn.dataset.valign;
    if(typeof applyToTexts==='function'){ applyToTexts(e=>e.valign=v); renderProps(); }
  }
});

// ───────────────────────── updateRibbonState ─────────────────────────
function dis(id,v){ const b=document.getElementById(id); if(b) b.disabled=v; }
function tog(id,v){ document.getElementById(id)?.classList.toggle('on',!!v); }
function updateRibbonState(){
  const e=selId?el(selId):null;
  const isText=e&&e.type==='text';
  const isShape=e&&e.type==='shape';
  const isImg=e&&e.type==='image';
  const hasEl=!!e;
  // 글꼴 그룹 (텍스트 전용)
  ['rb-fsize','rb-fsz-up','rb-fsz-dn','rb-clearfmt','rb-bold','rb-italic','rb-uline','rb-strike','rb-shadow','rb-case','rb-fc-btn','rb-hl-btn','rb-hl-off'].forEach(id=>dis(id,!isText));
  // 단락/간격 그룹 (텍스트 전용)
  ['rb-bullet','rb-number','rb-indent-up','rb-indent-dn','rb-vertical','rb-al-left','rb-al-center','rb-al-right','rb-al-justify','rb-valign','rb-lh-up','rb-lh-dn','rb-ls-up','rb-ls-dn'].forEach(id=>dis(id,!isText));
  if(isText){
    setHomeFontLabel(e.fontFamily);
    const fz=document.getElementById('rb-fsize'); if(fz) fz.value=e.fontSize;
    const fc=document.getElementById('rb-fcolor'); if(fc) fc.value=e.color;
    const fcBar=document.getElementById('rb-fc-bar'); if(fcBar) fcBar.style.background=e.color;
    const hlBar=document.getElementById('rb-hl-bar'); if(hlBar) hlBar.style.background=e.highlight||'#ffe14d';
    tog('rb-bold',e.fontWeight>=700); tog('rb-italic',e.italic); tog('rb-uline',e.underline);
    tog('rb-strike',e.strike); tog('rb-shadow',e.shadow);
    tog('rb-bullet',e.bullet==='disc'); tog('rb-number',e.bullet==='number'); tog('rb-vertical',e.vertical);
    tog('rb-al-left',e.align==='left'); tog('rb-al-center',e.align==='center');
    tog('rb-al-right',e.align==='right'); tog('rb-al-justify',e.align==='justify');
    const lhv=document.getElementById('rb-lh-val'); if(lhv) lhv.textContent=e.lineHeight;
    const lsv=document.getElementById('rb-ls-val'); if(lsv) lsv.textContent=e.letterSpacing;
  } else {
    ['rb-bold','rb-italic','rb-uline','rb-strike','rb-shadow','rb-bullet','rb-number','rb-vertical','rb-al-left','rb-al-center','rb-al-right','rb-al-justify'].forEach(id=>tog(id,false));
  }
  // 도형 스타일 그룹 (도형 전용 / 효과는 도형+이미지)
  ['rb-sfill-btn','rb-soutline-btn','rb-sbw-up','rb-sbw-dn'].forEach(id=>dis(id,!isShape));
  dis('rb-seffect', !(isShape||isImg));
  document.querySelectorAll('#rb-quickstyles button').forEach(b=>b.disabled=!isShape);
  if(isShape){
    document.getElementById('rb-sfill-bar')&&(document.getElementById('rb-sfill-bar').style.background=e.fill);
    document.getElementById('rb-soutline-bar')&&(document.getElementById('rb-soutline-bar').style.background=e.borderColor||'#333');
    const sbw=document.getElementById('rb-sbw-val'); if(sbw) sbw.textContent=e.borderW||0;
    tog('rb-seffect',e.shadow);
  } else if(isImg){ tog('rb-seffect',e.shadow); } else tog('rb-seffect',false);
  // 클립보드/정렬/빠른스타일
  ['rb-copy','rb-cut','rb-arrange-btn'].forEach(id=>dis(id,!hasEl));
  dis('rb-qstyle-btn',!isShape);
  document.querySelectorAll('[data-pa]').forEach(b=>{ if(!b.closest('#ctx-menu')) b.disabled=!hasEl; });
  dis('rb-paste',!(_clipboard&&_clipboard.length));
  // 줌/페이지
  const rv=document.getElementById('rb-zoom-val'); if(rv) rv.textContent=Math.round(zoom*100)+'%';
  const pgBar=document.getElementById('rb-pgbg-bar'); if(pgBar) pgBar.style.background=page().bg;
  const pgH=document.getElementById('rb-pg-h'); if(pgH) pgH.value=page().h;
}

// ───────────────────────── 리본 탭 전환 ─────────────────────────
(function(){
  const tabs=['home','insert','design','view'];
  document.querySelectorAll('.rtab').forEach(t=>{
    t.addEventListener('click',()=>{
      document.querySelectorAll('.rtab').forEach(x=>x.classList.remove('active'));
      t.classList.add('active');
      tabs.forEach(id=>{ const b=document.getElementById('rtab-'+id); if(b) b.style.display='none'; });
      const panel=document.getElementById('rtab-'+t.dataset.rtab);
      if(panel) panel.style.display='flex';
      updateRibbonState();
    });
  });
})();

// ───────────────────────── 리본 버튼 연결 ─────────────────────────
// 클립보드
document.getElementById('rb-paste')?.addEventListener('click',pasteClipboard);
document.getElementById('rb-cut')?.addEventListener('click',cutSel);
document.getElementById('rb-copy')?.addEventListener('click',copySel);
// 페이지
document.getElementById('rb-newpage')?.addEventListener('click',openTplModal);
document.getElementById('rb-delpage')?.addEventListener('click',()=>{
  if(project.pages.length<=1){toast('마지막 페이지는 삭제할 수 없습니다');return;}
  if(!confirm('현재 페이지를 삭제할까요?')) return;
  project.pages.splice(curPage,1);
  if(curPage>=project.pages.length) curPage=project.pages.length-1;
  selId=null; selIds=new Set(); afterMutate();
});
// 글꼴 그룹
(function(){
  setupHomeFontPicker();
  document.getElementById('rb-fsize')?.addEventListener('input',()=>{ const v=parseInt(document.getElementById('rb-fsize').value)||24; applyToTexts(e=>e.fontSize=v,true); });
  document.getElementById('rb-fsize')?.addEventListener('change',()=>snapshot());
  document.getElementById('rb-bold')?.addEventListener('click',()=>{ const arr=selTextEls(); if(!arr.length)return; const on=arr[0].fontWeight>=700; applyToTexts(e=>e.fontWeight=on?400:700); });
  document.getElementById('rb-italic')?.addEventListener('click',()=>{ const arr=selTextEls(); if(!arr.length)return; const on=!arr[0].italic; applyToTexts(e=>e.italic=on); });
  document.getElementById('rb-uline')?.addEventListener('click',()=>{ const arr=selTextEls(); if(!arr.length)return; const on=!arr[0].underline; applyToTexts(e=>e.underline=on); });
  document.getElementById('rb-fsz-up')?.addEventListener('click',()=>applyToTexts(e=>e.fontSize=Math.min(300,e.fontSize+2)));
  document.getElementById('rb-fsz-dn')?.addEventListener('click',()=>applyToTexts(e=>e.fontSize=Math.max(6,e.fontSize-2)));
  // 행간/자간
  document.getElementById('rb-lh-up')?.addEventListener('click',()=>applyToTexts(e=>e.lineHeight=Math.min(3,Math.round((e.lineHeight+0.1)*10)/10)));
  document.getElementById('rb-lh-dn')?.addEventListener('click',()=>applyToTexts(e=>e.lineHeight=Math.max(0.8,Math.round((e.lineHeight-0.1)*10)/10)));
  document.getElementById('rb-ls-up')?.addEventListener('click',()=>applyToTexts(e=>e.letterSpacing=Math.min(20,e.letterSpacing+0.5)));
  document.getElementById('rb-ls-dn')?.addEventListener('click',()=>applyToTexts(e=>e.letterSpacing=Math.max(-5,e.letterSpacing-0.5)));
})();

// ── 글꼴/단락/도형 확장 핸들러 ──
function selTextEls(){ return [...selIds].map(id=>el(id)).filter(e=>e&&e.type==='text'); }
function selShapeEls(){ return [...selIds].map(id=>el(id)).filter(e=>e&&e.type==='shape'); }
function applyToTexts(fn,quiet){ const arr=selTextEls(); if(!arr.length) return; arr.forEach(fn); arr.forEach(liveStyleEl); if(!quiet){ snapshot(); renderProps(); } updateRibbonState(); }
function applyToShapes(fn){ const arr=selShapeEls(); if(!arr.length) return; arr.forEach(fn); arr.forEach(liveStyleEl); snapshot(); renderProps(); updateRibbonState(); }
(function(){
  // 취소선 / 그림자
  document.getElementById('rb-strike')?.addEventListener('click',()=>{ const arr=selTextEls(); if(!arr.length)return; const on=!arr[0].strike; applyToTexts(e=>e.strike=on); });
  document.getElementById('rb-shadow')?.addEventListener('click',()=>{ const arr=selTextEls(); if(!arr.length)return; const on=!arr[0].shadow; applyToTexts(e=>e.shadow=on); });
  // 서식 지우기
  document.getElementById('rb-clearfmt')?.addEventListener('click',()=>applyToTexts(e=>{ e.fontWeight=400;e.italic=false;e.underline=false;e.strike=false;e.shadow=false;e.highlight=null;e.letterSpacing=0;e.lineHeight=1.4;e.color='#333333';e.align='left';e.valign='middle';e.bullet='none';e.indent=0;e.vertical=false; }));
  // 대/소문자 변경 (순환: 원본→대문자→소문자→첫글자대문자)
  document.getElementById('rb-case')?.addEventListener('click',()=>{
    applyToTexts(e=>{ const s=e._caseStep=((e._caseStep||0)+1)%3;
      if(!e._caseOrig) e._caseOrig=e.text;
      if(s===0) e.text=e._caseOrig;
      else if(s===1) e.text=e._caseOrig.toUpperCase();
      else e.text=e._caseOrig.toLowerCase();
    });
  });
  // 글꼴 색 버튼 → 컬러피커
  // 글꼴 색 / 강조 색 → PPT식 색상 팝업
  document.getElementById('rb-fc-btn')?.addEventListener('click',ev=>toggleColorPopup('textColor',ev.currentTarget));
  document.getElementById('rb-hl-btn')?.addEventListener('click',ev=>toggleColorPopup('highlight',ev.currentTarget));
  document.getElementById('rb-hl-off')?.addEventListener('click',()=>applyToTexts(e=>e.highlight=null));
  // 글머리/번호/들여쓰기/세로쓰기
  document.getElementById('rb-bullet')?.addEventListener('click',()=>{ const arr=selTextEls(); if(!arr.length)return; const on=arr[0].bullet==='disc'?'none':'disc'; applyToTexts(e=>e.bullet=on); });
  document.getElementById('rb-number')?.addEventListener('click',()=>{ const arr=selTextEls(); if(!arr.length)return; const on=arr[0].bullet==='number'?'none':'number'; applyToTexts(e=>e.bullet=on); });
  document.getElementById('rb-indent-up')?.addEventListener('click',()=>applyToTexts(e=>e.indent=Math.min(8,(e.indent||0)+1)));
  document.getElementById('rb-indent-dn')?.addEventListener('click',()=>applyToTexts(e=>e.indent=Math.max(0,(e.indent||0)-1)));
  document.getElementById('rb-vertical')?.addEventListener('click',()=>{ const arr=selTextEls(); if(!arr.length)return; const on=!arr[0].vertical; applyToTexts(e=>e.vertical=on); });
  // 세로 맞춤 순환 (위→중간→아래)
  document.getElementById('rb-valign')?.addEventListener('click',()=>{ const order=['top','middle','bottom']; const arr=selTextEls(); if(!arr.length)return; const cur=arr[0].valign||'middle'; const nx=order[(order.indexOf(cur)+1)%3]; applyToTexts(e=>e.valign=nx); toast('세로 맞춤: '+(nx==='top'?'위':nx==='middle'?'중간':'아래')); });
  // ── 도형 스타일 ──
  // 도형 채우기 / 윤곽선 → PPT식 색상 팝업
  document.getElementById('rb-sfill-btn')?.addEventListener('click',ev=>toggleColorPopup('fill',ev.currentTarget));
  document.getElementById('rb-soutline-btn')?.addEventListener('click',ev=>toggleColorPopup('outline',ev.currentTarget));
  document.getElementById('rb-sbw-up')?.addEventListener('click',()=>applyToShapes(e=>e.borderW=Math.min(30,(e.borderW||0)+1)));
  document.getElementById('rb-sbw-dn')?.addEventListener('click',()=>applyToShapes(e=>e.borderW=Math.max(0,(e.borderW||0)-1)));
  document.getElementById('rb-seffect')?.addEventListener('click',()=>{ const arr=selShapeEls().concat([...selIds].map(id=>el(id)).filter(e=>e&&e.type==='image')); if(!arr.length)return; const on=!arr[0].shadow; arr.forEach(e=>e.shadow=on); arr.forEach(liveStyleEl); snapshot(); renderProps(); updateRibbonState(); });
  // (빠른 스타일은 qstyle-dd 그리드에서 처리 — 옛 rb-quickstyles 인라인 버전 제거)
})();
function applyToShapesQuiet(fn){ const arr=selShapeEls(); if(!arr.length) return; arr.forEach(fn); arr.forEach(liveStyleEl); updateRibbonState(); }

// ── 편집 그룹: 찾기/바꾸기 + 선택 ──
(function(){
  const modal=document.getElementById('find-modal');
  let lastIdx=-1;
  function openFind(){ modal.style.display='flex'; setTimeout(()=>document.getElementById('find-q').focus(),0); }
  function closeFind(){ modal.style.display='none'; }
  function targetEls(){
    const allPages=document.getElementById('find-all-pages').checked;
    const out=[];
    (allPages?project.pages:[page()]).forEach((p,pi)=>{ p.elements.forEach(e=>{ if(e.type==='text') out.push({e,p,pIndex:allPages?project.pages.indexOf(p):curPage}); }); });
    return out;
  }
  document.getElementById('rb-find')?.addEventListener('click',openFind);
  document.getElementById('find-close').onclick=closeFind;
  modal.addEventListener('mousedown',e=>{ if(e.target.id==='find-modal') closeFind(); });
  document.getElementById('find-next').onclick=()=>{
    const q=document.getElementById('find-q').value; if(!q){return;}
    const list=targetEls(); const n=list.length; if(!n){document.getElementById('find-status').textContent='텍스트 요소가 없습니다';return;}
    for(let k=1;k<=n;k++){ const idx=(lastIdx+k)%n; const {e,pIndex}=list[idx];
      if(e.text.includes(q)){ lastIdx=idx; if(pIndex!==curPage){curPage=pIndex;} selId=e.id; selIds=new Set([e.id]); renderCanvas(); renderPages(); renderProps(); updateRibbonState();
        const node=canvas.querySelector(`[data-id="${e.id}"]`); if(node)node.scrollIntoView({block:'center',behavior:'smooth'});
        document.getElementById('find-status').textContent=`${idx+1}/${n} 요소에서 발견`; return; } }
    document.getElementById('find-status').textContent='찾을 수 없습니다';
  };
  document.getElementById('find-rep').onclick=()=>{
    const q=document.getElementById('find-q').value, r=document.getElementById('find-r').value; if(!q)return;
    const e=selId?el(selId):null;
    if(e&&e.type==='text'&&e.text.includes(q)){ e.text=e.text.split(q).join(r); e._caseOrig=null; afterMutate(); document.getElementById('find-status').textContent='1건 바꿈'; }
    else document.getElementById('find-next').click();
  };
  document.getElementById('find-repall').onclick=()=>{
    const q=document.getElementById('find-q').value, r=document.getElementById('find-r').value; if(!q)return;
    let cnt=0; targetEls().forEach(({e})=>{ if(e.text.includes(q)){ cnt+=e.text.split(q).length-1; e.text=e.text.split(q).join(r); e._caseOrig=null; } });
    if(cnt){ afterMutate(); document.getElementById('find-status').textContent=`${cnt}건 모두 바꿈`; }
    else document.getElementById('find-status').textContent='찾을 수 없습니다';
  };
  document.getElementById('rb-selall')?.addEventListener('click',()=>{ selIds=new Set(page().elements.map(e=>e.id)); selId=selIds.size?[...selIds].at(-1):null; renderCanvas(); renderProps(); updateRibbonState(); });
  document.getElementById('rb-selnone')?.addEventListener('click',()=>{ selId=null; selIds=new Set(); renderCanvas(); renderProps(); updateRibbonState(); });
})();

// ───────────────────────── 정렬·순서·그룹·회전 (PPT식) ─────────────────────────
let alignToPage = true;
let _lastGroupIds = null; // 재그룹용 마지막 그룹 구성원
function selAll(){ return [...selIds].map(id=>el(id)).filter(Boolean); }
// 선택을 '단위' 배열로 — 같은 groupId는 한 덩어리, 그룹없으면 개별
function selUnits(){
  const arr=selAll(), byG={}, units=[];
  arr.forEach(e=>{ if(e.groupId){ (byG[e.groupId]||(byG[e.groupId]=[])).push(e); } else units.push([e]); });
  Object.keys(byG).forEach(g=>units.push(byG[g]));
  return units;
}
function unitBBox(g){ const x0=Math.min(...g.map(e=>e.x)),y0=Math.min(...g.map(e=>e.y)),x1=Math.max(...g.map(e=>e.x+e.w)),y1=Math.max(...g.map(e=>e.y+e.h)); return {x:x0,y:y0,w:x1-x0,h:y1-y0,cx:(x0+x1)/2,cy:(y0+y1)/2}; }
function withGroups(idSet){
  const out=new Set(idSet); const gids=new Set();
  out.forEach(id=>{ const e=el(id); if(e&&e.groupId) gids.add(e.groupId); });
  if(gids.size) page().elements.forEach(e=>{ if(e.groupId&&gids.has(e.groupId)) out.add(e.id); });
  return out;
}
// 그룹 인식 정렬 — 같은 그룹은 한 덩어리(내부 간격 유지)로 이동
function alignSelection(kind, toPage){
  const arr=selAll(); if(!arr.length) return;
  // 단위 구성: 같은 groupId는 하나의 단위, 그룹 없으면 개별
  const byG={}, units=[];
  arr.forEach(e=>{ if(e.groupId){ (byG[e.groupId]||(byG[e.groupId]=[])).push(e); } else units.push([e]); });
  Object.keys(byG).forEach(g=>units.push(byG[g]));
  const bbox=g=>{ const x0=Math.min(...g.map(e=>e.x)),y0=Math.min(...g.map(e=>e.y)),x1=Math.max(...g.map(e=>e.x+e.w)),y1=Math.max(...g.map(e=>e.y+e.h)); return {x:x0,y:y0,w:x1-x0,h:y1-y0}; };
  // 기준 영역
  let b;
  if(toPage){ const pg=page(); b={x:0,y:0,w:pg.w,h:pg.h}; }
  else { const x0=Math.min(...arr.map(e=>e.x)),y0=Math.min(...arr.map(e=>e.y)),x1=Math.max(...arr.map(e=>e.x+e.w)),y1=Math.max(...arr.map(e=>e.y+e.h)); b={x:x0,y:y0,w:x1-x0,h:y1-y0}; }
  const kinds = kind==='cc' ? ['cx','cy'] : [kind];
  units.forEach(g=>{
    const ub=bbox(g); let dx=0,dy=0;
    kinds.forEach(k=>{
      if(k==='l') dx=b.x-ub.x;
      else if(k==='cx') dx=(b.x+(b.w-ub.w)/2)-ub.x;
      else if(k==='r') dx=(b.x+b.w-ub.w)-ub.x;
      else if(k==='t') dy=b.y-ub.y;
      else if(k==='cy') dy=(b.y+(b.h-ub.h)/2)-ub.y;
      else if(k==='b') dy=(b.y+b.h-ub.h)-ub.y;
    });
    g.forEach(e=>{ e.x=Math.round(e.x+dx); e.y=Math.round(e.y+dy); });
  });
  arr.forEach(liveStyleEl); const pr=el(selId); if(pr)syncPosInputs(pr); snapshot();
}
function arrAlign(kind){ alignSelection(kind, alignToPage); }
function arrDistribute(axis){
  const arr=selAll(); const units=selUnits();
  if(units.length<3){ toast('3개 이상(그룹은 하나로) 선택하세요'); return; }
  const items=units.map(g=>({g, b:unitBBox(g)}));
  items.sort((a,b)=> axis==='h'? a.b.x-b.b.x : a.b.y-b.b.y);
  if(axis==='h'){
    const left=items[0].b.x, right=items[items.length-1].b.x+items[items.length-1].b.w;
    const sumW=items.reduce((s,it)=>s+it.b.w,0), gap=(right-left-sumW)/(items.length-1);
    let cur=left; items.forEach(it=>{ const dx=Math.round(cur)-it.b.x; it.g.forEach(e=>e.x+=dx); cur+=it.b.w+gap; });
  } else {
    const top=items[0].b.y, bot=items[items.length-1].b.y+items[items.length-1].b.h;
    const sumH=items.reduce((s,it)=>s+it.b.h,0), gap=(bot-top-sumH)/(items.length-1);
    let cur=top; items.forEach(it=>{ const dy=Math.round(cur)-it.b.y; it.g.forEach(e=>e.y+=dy); cur+=it.b.h+gap; });
  }
  arr.forEach(liveStyleEl); const pr=el(selId); if(pr)syncPosInputs(pr); snapshot();
}
function arrGroup(){ const ids=[...selIds]; if(ids.length<2){ toast('2개 이상 선택하세요'); return; } const gid='grp_'+uid(); ids.forEach(id=>{ const e=el(id); if(e)e.groupId=gid; }); _lastGroupIds=ids.slice(); afterMutate(); toast('그룹화됨 🔗'); }
function arrUngroup(){ const arr=selAll(); let any=false; const ids=arr.map(e=>e.id); arr.forEach(e=>{ if(e.groupId){ delete e.groupId; any=true; } }); if(any){ _lastGroupIds=ids; afterMutate(); toast('그룹 해제됨'); } else toast('그룹이 없습니다'); }
function arrRegroup(){ if(!_lastGroupIds){ toast('재그룹할 그룹이 없습니다'); return; } const ids=_lastGroupIds.filter(id=>el(id)); if(ids.length<2){ toast('재그룹할 개체가 없습니다'); return; } const gid='grp_'+uid(); ids.forEach(id=>{ const e=el(id); if(e)e.groupId=gid; }); selIds=new Set(ids); selId=ids.at(-1); afterMutate(); toast('재그룹됨 🔗'); }
function arrRotate(deg){
  const arr=selAll(); if(!arr.length)return;
  const rad=deg*Math.PI/180, cos=Math.cos(rad), sin=Math.sin(rad);
  selUnits().forEach(g=>{
    if(g.length===1){ const e=g[0]; e.rot=(((e.rot||0)+deg)%360+360)%360; return; }
    const b=unitBBox(g); // 그룹: 그룹 중심으로 멤버 위치 회전 + 각 멤버 회전(덩어리로)
    g.forEach(e=>{
      const cx=e.x+e.w/2-b.cx, cy=e.y+e.h/2-b.cy;
      const nx=b.cx+cx*cos-cy*sin, ny=b.cy+cx*sin+cy*cos;
      e.x=Math.round(nx-e.w/2); e.y=Math.round(ny-e.h/2);
      e.rot=(((e.rot||0)+deg)%360+360)%360;
    });
  });
  arr.forEach(liveStyleEl); const pr=el(selId); if(pr)syncPosInputs(pr); snapshot();
}
function arrFlip(axis){
  const arr=selAll(); if(!arr.length)return;
  selUnits().forEach(g=>{
    if(g.length===1){ const e=g[0]; if(axis==='h')e.flipH=!e.flipH; else e.flipV=!e.flipV; return; }
    const b=unitBBox(g); // 그룹: 멤버 위치를 그룹 중심축으로 미러 + 각 멤버 뒤집기
    g.forEach(e=>{
      if(axis==='h'){ e.x=Math.round(b.x+b.x+b.w-(e.x+e.w)); e.flipH=!e.flipH; }
      else { e.y=Math.round(b.y+b.y+b.h-(e.y+e.h)); e.flipV=!e.flipV; }
    });
  });
  arr.forEach(liveStyleEl); const pr=el(selId); if(pr)syncPosInputs(pr); snapshot();
}
function arrOrder(kind){
  const arr=page().elements, sel=selIds; if(!sel.size)return;
  if(kind==='front'){ const m=arr.filter(e=>sel.has(e.id)), r=arr.filter(e=>!sel.has(e.id)); page().elements=r.concat(m); }
  else if(kind==='back'){ const m=arr.filter(e=>sel.has(e.id)), r=arr.filter(e=>!sel.has(e.id)); page().elements=m.concat(r); }
  else if(kind==='forward'){ for(let i=arr.length-2;i>=0;i--){ if(sel.has(arr[i].id)&&!sel.has(arr[i+1].id)){ [arr[i],arr[i+1]]=[arr[i+1],arr[i]]; } } }
  else if(kind==='backward'){ for(let i=1;i<arr.length;i++){ if(sel.has(arr[i].id)&&!sel.has(arr[i-1].id)){ [arr[i],arr[i-1]]=[arr[i-1],arr[i]]; } } }
  afterMutate();
}
function arrDup(){ const arr=selAll(); if(!arr.length)return; const ns=new Set(); arr.forEach(e=>{ const c={...JSON.parse(JSON.stringify(e)),id:uid(),x:e.x+20,y:e.y+20}; delete c.groupId; page().elements.push(c); ns.add(c.id); }); selIds=ns; selId=[...ns].at(-1); afterMutate(); }
function arrDel(){ if(!selIds.size)return; page().elements=page().elements.filter(x=>!selIds.has(x.id)); selId=null; selIds=new Set(); afterMutate(); }

// ── 드롭다운 공통 ──
function closeAllDD(){ document.querySelectorAll('.rdd').forEach(d=>d.style.display='none'); }
function openDD(dd, btn){
  closeAllDD(); dd.style.display='block';
  const r=btn.getBoundingClientRect();
  const dw=dd.offsetWidth, dh=dd.offsetHeight;
  // 좌우: 화면 안에 맞추기
  dd.style.left=Math.max(8, Math.min(r.left, window.innerWidth-dw-8))+'px';
  // 위/아래: 아래 공간 부족하면 위로 띄우기
  const spaceBelow=window.innerHeight-r.bottom, spaceAbove=r.top;
  if(spaceBelow < dh+12 && spaceAbove > spaceBelow){
    dd.style.top=Math.max(8, r.top-dh-4)+'px';
  } else {
    dd.style.top=Math.min(r.bottom+4, window.innerHeight-dh-8)+'px';
  }
}
document.addEventListener('mousedown',e=>{ if(!e.target.closest('.rdd')&&!e.target.closest('#rb-arrange-btn')&&!e.target.closest('#rb-qstyle-btn')&&!e.target.closest('#rb-font-btn')&&!e.target.closest('#rb-sfill-btn')&&!e.target.closest('#rb-soutline-btn')&&!e.target.closest('#rb-fc-btn')&&!e.target.closest('#rb-hl-btn')&&!e.target.closest('#rb-pgbg-btn')&&!e.target.closest('.panel-cbtn')) closeAllDD(); });
// 속성 패널 색상칩 → PPT 색상 팝업
document.addEventListener('click',e=>{ const b=e.target.closest('.panel-cbtn'); if(b){ e.preventDefault(); toggleColorPopup(b.dataset.cpkey, b); } });

// ── 정렬 드롭다운 ──
function updateArrangeDD(){
  const n=selIds.size;
  const dd=document.getElementById('arrange-dd');
  const setDis=(sel,cond)=>dd.querySelector(sel)?.classList.toggle('dis',cond);
  ['front','forward','backward','back','dup','del'].forEach(k=>setDis(`[data-arr="${k}"]`, n<1));
  ['rot-r','rot-l','flip-h','flip-v'].forEach(k=>setDis(`[data-arr="${k}"]`, n<1));
  ['al-l','al-cx','al-r','al-t','al-cy','al-b'].forEach(k=>setDis(`[data-arr="${k}"]`, n<1));
  setDis('[data-arr="group"]', n<2);
  const hasGrp=selAll().some(e=>e.groupId); setDis('[data-arr="ungroup"]', !hasGrp);
  setDis('[data-arr="regroup"]', !_lastGroupIds || n<1);
  ['dist-h','dist-v'].forEach(k=>setDis(`[data-arr="${k}"]`, n<3));
}
document.getElementById('rb-arrange-btn')?.addEventListener('click',e=>{
  const dd=document.getElementById('arrange-dd');
  if(dd.style.display==='block'){ closeAllDD(); return; }
  updateArrangeDD(); openDD(dd, e.currentTarget);
});
document.getElementById('arrange-dd').addEventListener('click',e=>{
  if(e.target.closest('#arr-mode-toggle')) return;
  const it=e.target.closest('[data-arr]'); if(!it||it.classList.contains('dis')) return;
  const k=it.dataset.arr; closeAllDD();
  if(['front','forward','backward','back'].includes(k)) arrOrder(k);
  else if(k==='group') arrGroup();
  else if(k==='ungroup') arrUngroup();
  else if(k==='regroup') arrRegroup();
  else if(k==='rot-r') arrRotate(90);
  else if(k==='rot-l') arrRotate(-90);
  else if(k==='flip-h') arrFlip('h');
  else if(k==='flip-v') arrFlip('v');
  else if(k.startsWith('al-')) arrAlign(k.slice(3));
  else if(k==='dist-h') arrDistribute('h');
  else if(k==='dist-v') arrDistribute('v');
  else if(k==='dup') arrDup();
  else if(k==='del') arrDel();
});
document.getElementById('arr-to-page').addEventListener('change',e=>{ alignToPage=e.target.checked; document.getElementById('arr-mode-toggle').classList.toggle('on',e.target.checked); });

// ── 홈탭 글꼴 피커 (검색·추가·파일가져오기) ──
function _customFonts(){ try{ return JSON.parse(localStorage.getItem('hw_custom_fonts')||'[]'); }catch(e){ return []; } }
function fontLabel(fam){ const f=[...FONTS,..._customFonts()].find(x=>x[0]===fam); return f?f[1]:fam; }
function setHomeFontLabel(fam){ const l=document.getElementById('rb-font-label'); if(l){ l.textContent=fontLabel(fam); l.style.fontFamily=`'${fam}',sans-serif`; } }
function setupHomeFontPicker(){
  const btn=document.getElementById('rb-font-btn'), dd=document.getElementById('rb-font-dd'),
        list=document.getElementById('rb-font-list'), search=document.getElementById('rb-font-search');
  if(!btn) return;
  const norm=s=>String(s).toLowerCase().replace(/\s/g,'');
  function render(q=''){
    const lc=norm(q), custom=_customFonts();
    const all=[...FONTS,...custom.filter(cf=>!FONTS.find(f=>f[0]===cf[0]))];
    const cur=(selTextEls()[0]||{}).fontFamily;
    const vis=all.filter(f=>!lc||norm(f[0]).includes(lc)||norm(f[1]).includes(lc)||norm(f[2]).includes(lc));
    const grps={}; vis.forEach(f=>{ (grps[f[2]]||(grps[f[2]]=[])).push(f); });
    let h='';
    Object.entries(grps).forEach(([cat,items])=>{
      h+=`<div class="fcat">${cat}</div>`;
      items.forEach(f=>{ const isDel=cat==='직접 추가';
        h+=`<div class="fitem${cur===f[0]?' sel':''}" data-fam="${f[0]}"><span class="fp" style="font-family:'${f[0]}',sans-serif">가나다 Aa</span><span class="fn">${f[1]}${isDel?` <span data-delfont="${f[0]}" style="cursor:pointer;color:#ff8da3;margin-left:4px" title="삭제">✕</span>`:''}</span></div>`;
      });
    });
    list.innerHTML=h||'<div style="padding:16px;text-align:center;color:var(--sub);font-size:12px">검색 결과 없음</div>';
    list.querySelectorAll('.fitem').forEach(it=>it.addEventListener('click',ev=>{
      if(ev.target.dataset.delfont) return;
      const fam=it.dataset.fam; loadFont(fam);
      if(selTextEls().length) applyToTexts(e=>e.fontFamily=fam); else toast('텍스트를 선택하면 적용됩니다');
      setHomeFontLabel(fam); closeAllDD();
    }));
    list.querySelectorAll('[data-delfont]').forEach(x=>x.addEventListener('click',ev=>{
      ev.stopPropagation(); const fam=x.dataset.delfont;
      localStorage.setItem('hw_custom_fonts',JSON.stringify(_customFonts().filter(f=>f[0]!==fam)));
      render(search.value);
    }));
  }
  btn.addEventListener('click',e=>{ if(dd.style.display==='block'){ closeAllDD(); return; } render(); openDD(dd,e.currentTarget); setTimeout(()=>search.focus(),0); });
  search.addEventListener('input',()=>render(search.value));
  async function addFont(){
    const inp=document.getElementById('rb-font-add-input'); const name=inp.value.trim(); if(!name) return;
    const b=document.getElementById('rb-font-add-btn'); b.textContent='로딩…'; b.disabled=true;
    loadFont(name); await new Promise(r=>setTimeout(r,900));
    const arr=_customFonts(); if(!arr.find(f=>f[0]===name)){ arr.push([name,name,'직접 추가']); localStorage.setItem('hw_custom_fonts',JSON.stringify(arr)); }
    if(selTextEls().length) applyToTexts(e=>e.fontFamily=name);
    setHomeFontLabel(name); inp.value=''; b.textContent='+ 추가'; b.disabled=false; render(); toast(`"${name}" 폰트 추가됨`);
  }
  document.getElementById('rb-font-add-btn').addEventListener('click',addFont);
  document.getElementById('rb-font-add-input').addEventListener('keydown',e=>{ if(e.key==='Enter') addFont(); });
  const fileInput=document.getElementById('font-file');
  document.getElementById('rb-font-file-btn').addEventListener('click',()=>{
    fileInput.onchange=()=>{ const f=fileInput.files[0]; fileInput.value=''; if(f) importFontFile(f,()=>{ render(); const fam=(selTextEls()[0]||{}).fontFamily; if(fam) setHomeFontLabel(fam); }); };
    fileInput.click();
  });
}

// ───────────────────────── PPT식 색상 팝업 (도형 채우기) ─────────────────────────
// 색상 데이터/수학(CP_THEME/CP_TEX/_hex2rgb/_rgb2hex/_lighten/_darken/_shades)은
// public/editor-colors.js로 분리됨 — 상단에서 import.
// 색상 팝업 타겟 — 글꼴색·강조색·도형채우기·윤곽선 공용
let _cpTarget=null;
function _setBar(id,v){ const b=document.getElementById(id); if(b) b.style.background=(v==='transparent'?'repeating-conic-gradient(#fff 0 25%,#ddd 0 50%) 50%/6px 6px':v); }
const CP_TARGETS={
  fill:{ label:'도형 채우기', rich:true, noFill:true, noFillLabel:'채우기 없음',
    current:()=>(selShapeEls()[0]||{}).fill,
    set:v=>{ if(!selShapeEls().length){ toast('도형을 선택하세요'); return; } applyToShapesQuiet(e=>e.fill=v); _setBar('rb-sfill-bar',v); } },
  outline:{ label:'도형 윤곽선', rich:false, noFill:true, noFillLabel:'윤곽선 없음',
    current:()=>(selShapeEls()[0]||{}).borderColor,
    set:v=>{ if(!selShapeEls().length){ toast('도형을 선택하세요'); return; } if(v==='transparent') applyToShapesQuiet(e=>e.borderW=0); else applyToShapesQuiet(e=>{ e.borderColor=v; if(!e.borderW)e.borderW=2; }); _setBar('rb-soutline-bar', v==='transparent'?'#333':v); } },
  textColor:{ label:'글꼴 색', rich:false, noFill:true, noFillLabel:'글자색 없음(투명)',
    current:()=>(selTextEls()[0]||{}).color,
    set:v=>{ applyToTexts(e=>e.color=v,true); _setBar('rb-fc-bar', v==='transparent'?'#333':v); } },
  highlight:{ label:'텍스트 강조 색', rich:false, noFill:true, noFillLabel:'강조 없음',
    current:()=>(selTextEls()[0]||{}).highlight,
    set:v=>{ if(v==='transparent') applyToTexts(e=>e.highlight=null,true); else applyToTexts(e=>e.highlight=v,true); _setBar('rb-hl-bar', v==='transparent'?'#ffe14d':v); } },
  pageBg:{ label:'페이지 배경', rich:true, noFill:true, noFillLabel:'배경 없음(투명)',
    current:()=>page().bg,
    set:v=>{ page().bg=v; canvas.style.background=(v==='transparent'?'transparent':v); const b=document.getElementById('rb-pgbg-bar'); if(b)b.style.background=v; const pt=document.getElementById('pg-bg-t'); if(pt)pt.value=v; const pcb=document.querySelector('#pg-bg span'); if(pcb)pcb.style.background=v; renderPages(); save(true); } },
  imgBorder:{ label:'이미지 테두리', rich:false, noFill:true, noFillLabel:'테두리 없음',
    current:()=>{ const e=selId?el(selId):null; return e&&e.borderColor; },
    set:v=>{ const e=selId?el(selId):null; if(!e)return; if(v==='transparent'){ e.borderW=0; } else { e.borderColor=v; if(!e.borderW)e.borderW=2; } liveStyleEl(e); } },
  shapeText:{ label:'글자 색', rich:false, noFill:true, noFillLabel:'글자색 없음(투명)',
    current:()=>{ const e=selId?el(selId):null; return e&&e.stColor; },
    set:v=>{ const e=selId?el(selId):null; if(!e)return; e.stColor=v; liveStyleEl(e); } },
  hmBtn:{ label:'햄버거 버튼 색', rich:false, current:()=>hamburgerCfg().btnColor||'#1a2b5c',
    set:v=>{ hamburgerCfg().btnColor=v; save(true); refreshHambMenu(); } },
  hmBg:{ label:'메뉴 배경', rich:false, current:()=>hamburgerCfg().bg||'#ffffff',
    set:v=>{ hamburgerCfg().bg=v; save(true); refreshHambMenu(); } },
  hmColor:{ label:'메뉴 글자색', rich:false, current:()=>hamburgerCfg().color||'#1a2b5c',
    set:v=>{ hamburgerCfg().color=v; save(true); refreshHambMenu(); } },
  slArrowBg:{ label:'화살표 배경', rich:false, noFill:true, noFillLabel:'배경 없음',
    current:()=>{ const e=selId?el(selId):null; return e&&e.fx&&e.fx.arrowBg; },
    set:v=>{ const e=selId?el(selId):null; if(!e)return; const fx=_slFx(e); if(v==='transparent'){ fx.arrowShape='none'; } else { fx.arrowBg=v; if(fx.arrowShape==='none')fx.arrowShape='circle'; } _slRerender(e); save(true); } },
  slArrowColor:{ label:'화살표 아이콘색', rich:false, current:()=>{ const e=selId?el(selId):null; return e&&e.fx&&e.fx.arrowColor; },
    set:v=>{ const e=selId?el(selId):null; if(!e)return; _slFx(e).arrowColor=v; _slRerender(e); save(true); } },
  slDotColor:{ label:'점 기본색', rich:false, current:()=>{ const e=selId?el(selId):null; return e&&e.fx&&e.fx.dotColor; },
    set:v=>{ const e=selId?el(selId):null; if(!e)return; _slFx(e).dotColor=v; _slRerender(e); save(true); } },
  slDotOn:{ label:'점 활성색', rich:false, current:()=>{ const e=selId?el(selId):null; return e&&e.fx&&e.fx.dotActiveColor; },
    set:v=>{ const e=selId?el(selId):null; if(!e)return; _slFx(e).dotActiveColor=v; _slRerender(e); save(true); } },
  fixTabBg:{ label:'탭 배경', rich:false, noFill:true, noFillLabel:'배경 없음(투명)', current:()=>{ const t=_fixTab(); return t&&t.bg; },
    set:v=>{ const t=_fixTab(); if(!t)return; t.bg=(v==='transparent'?'transparent':v); _fixSave(); } },
  fixTabColor:{ label:'탭 글자색', rich:false, current:()=>{ const t=_fixTab(); return t&&t.color; },
    set:v=>{ const t=_fixTab(); if(!t)return; t.color=v; _fixSave(); } },
  fixTabBorder:{ label:'탭 테두리 색', rich:false, noFill:true, noFillLabel:'테두리 없음', current:()=>{ const t=_fixTab(); return t&&t.borderColor; },
    set:v=>{ const t=_fixTab(); if(!t)return; if(v==='transparent'){ t.borderW=0; } else { t.borderColor=v; if(!t.borderW)t.borderW=2; } _fixSave(); } },
  fixItemBg:{ label:'항목 배경', rich:false, noFill:true, noFillLabel:'배경 없음(투명)',
    current:()=>{ const t=_fixTab(); const it=t&&fixTabItemsOf(t)[_fixItemIdx]; return it&&it.bg; },
    set:v=>{ const t=_fixTab(); if(!t)return; const it=fixTabItemsOf(t)[_fixItemIdx]; if(!it)return; it.bg=(v==='transparent'?'':v); _fixSave(); } },
  fixItemColor:{ label:'항목 글자색', rich:false, noFill:true, noFillLabel:'기본색 사용',
    current:()=>{ const t=_fixTab(); const it=t&&fixTabItemsOf(t)[_fixItemIdx]; return it&&it.color; },
    set:v=>{ const t=_fixTab(); if(!t)return; const it=fixTabItemsOf(t)[_fixItemIdx]; if(!it)return; it.color=(v==='transparent'?'':v); _fixSave(); } },
  tblHeaderBg:{ label:'머리행 배경', rich:false,
    current:()=>{ const e=selId?el(selId):null; return e&&e.headerBg; },
    set:v=>{ const e=selId?el(selId):null; if(!e)return; e.headerBg=v; liveStyleEl(e); } },
  tblHeaderColor:{ label:'머리행 글자색', rich:false,
    current:()=>{ const e=selId?el(selId):null; return e&&e.headerColor; },
    set:v=>{ const e=selId?el(selId):null; if(!e)return; e.headerColor=v; liveStyleEl(e); } },
  tblCellBg:{ label:'본문 배경', rich:false,
    current:()=>{ const e=selId?el(selId):null; return e&&e.cellBg; },
    set:v=>{ const e=selId?el(selId):null; if(!e)return; e.cellBg=v; liveStyleEl(e); } },
  tblCellColor:{ label:'본문 글자색', rich:false,
    current:()=>{ const e=selId?el(selId):null; return e&&e.cellColor; },
    set:v=>{ const e=selId?el(selId):null; if(!e)return; e.cellColor=v; liveStyleEl(e); } },
  tblBorder:{ label:'표 테두리 색', rich:false,
    current:()=>{ const e=selId?el(selId):null; return e&&e.borderColor; },
    set:v=>{ const e=selId?el(selId):null; if(!e)return; e.borderColor=v; liveStyleEl(e); } },
};
function recentColors(){ try{ return JSON.parse(localStorage.getItem('hw_recent_colors')||'[]'); }catch(_){ return []; } }
function pushRecentColor(v){
  if(!/^#[0-9a-fA-F]{6}$/.test(v||'')) return;       // 솔리드 색만
  let arr=recentColors();
  if(arr[0] && arr[0].toLowerCase()===v.toLowerCase()) return; // 같은 색 연속 방지
  arr=arr.filter(c=>c.toLowerCase()!==v.toLowerCase()); // 전체 중복 제거 후 맨 앞
  arr.unshift(v); arr=arr.slice(0,20);
  localStorage.setItem('hw_recent_colors',JSON.stringify(arr));
}
function cpApply(val){ if(!_cpTarget) return; _cpTarget.set(val); pushRecentColor(val); snapshot(); renderProps(); closeAllDD(); _fixRefreshPopup(); }
function openColorPopup(key, btn){
  const t=CP_TARGETS[key]; if(!t) return; _cpTarget=t;
  document.getElementById('fill-dd-title').textContent=t.label;
  const cur=t.current();
  const sw=c=>`<div class="cp-sw${cur===c?' sel':''}" data-color="${c}" title="${c}" style="background:${c}"></div>`;
  document.getElementById('cp-theme-base').innerHTML=CP_THEME.map(sw).join('');
  const shades=CP_THEME.map(_shades);
  let sh=''; for(let r=0;r<5;r++) for(let c=0;c<10;c++) sh+=sw(shades[c][r]);
  document.getElementById('cp-theme-shades').innerHTML=sh;
  const rc=recentColors();
  document.getElementById('cp-standard').innerHTML = rc.length ? rc.map(sw).join('') : '<div style="grid-column:1/-1;font-size:11px;color:#999;padding:6px 2px">아직 사용한 색이 없어요</div>';
  document.getElementById('cp-tex-grid').innerHTML=CP_TEX.map(tx=>`<div class="cp-sw" data-tex="${tx.replace(/"/g,'&quot;')}" style="background:${tx};height:30px;aspect-ratio:auto"></div>`).join('');
  const nf=document.getElementById('cp-nofill'); nf.style.display=t.noFill?'flex':'none'; if(t.noFill) nf.lastChild.textContent=t.noFillLabel||'채우기 없음';
  document.getElementById('cp-gradient').style.display=t.rich?'flex':'none';
  document.getElementById('cp-image').style.display=t.rich?'flex':'none';
  document.getElementById('cp-texture').style.display=t.rich?'flex':'none';
  document.getElementById('cp-grad-panel').style.display='none';
  document.getElementById('cp-tex-panel').style.display='none';
  openDD(document.getElementById('fill-dd'), btn);
}
function toggleColorPopup(key, btn){ const dd=document.getElementById('fill-dd'); if(dd.style.display==='block'&&_cpTarget===CP_TARGETS[key]){ closeAllDD(); return; } openColorPopup(key, btn); }
(function(){
  const dd=document.getElementById('fill-dd'); if(!dd) return;
  dd.addEventListener('click',ev=>{
    const sw=ev.target.closest('[data-color]'); if(sw){ cpApply(sw.dataset.color); return; }
    const tx=ev.target.closest('[data-tex]'); if(tx){ cpApply(tx.dataset.tex); return; }
  });
  document.getElementById('cp-nofill').onclick=()=>cpApply('transparent');
  document.getElementById('cp-more').onclick=()=>{ const inp=document.getElementById('cp-more-input'); const c=_cpTarget&&_cpTarget.current(); inp.value=(typeof c==='string'&&/^#[0-9a-f]{6}$/i.test(c))?c:'#000000'; inp.oninput=()=>{ if(_cpTarget) _cpTarget.set(inp.value); }; inp.onchange=()=>{ pushRecentColor(inp.value); snapshot(); }; inp.click(); };
  document.getElementById('cp-eyedrop').onclick=async()=>{
    if(!window.EyeDropper){ toast('이 브라우저는 스포이트를 지원하지 않습니다'); return; }
    try{ const r=await new EyeDropper().open(); cpApply(r.sRGBHex); }catch(e){}
  };
  document.getElementById('cp-gradient').onclick=()=>{ const p=document.getElementById('cp-grad-panel'); p.style.display=p.style.display==='none'?'block':'none'; document.getElementById('cp-tex-panel').style.display='none'; };
  document.getElementById('cp-grad-apply').onclick=()=>{
    const c1=document.getElementById('cp-grad-c1').value, c2=document.getElementById('cp-grad-c2').value, dir=document.getElementById('cp-grad-dir').value;
    cpApply(dir==='circle'?`radial-gradient(circle, ${c1}, ${c2})`:`linear-gradient(${dir}, ${c1}, ${c2})`);
  };
  document.getElementById('cp-texture').onclick=()=>{ const p=document.getElementById('cp-tex-panel'); p.style.display=p.style.display==='none'?'block':'none'; document.getElementById('cp-grad-panel').style.display='none'; };
  document.getElementById('cp-image').onclick=()=>{
    if(!selShapeEls().length){ toast('도형을 선택하세요'); return; }
    const fi=document.getElementById('cp-fill-file');
    fi.onchange=()=>{ const f=fi.files[0]; fi.value=''; if(!f) return; const rd=new FileReader(); rd.onload=()=>{ cpApply(`url("${rd.result}") center/cover no-repeat`); }; rd.readAsDataURL(f); };
    fi.click();
  };
})();

// ── 빠른 스타일 드롭다운 ──
(function(){
  const QSTYLES=[
    {name:'채움',fill:'#6c7bff',borderW:0,radius:0,shadow:false},
    {name:'둥근',fill:'#6c7bff',borderW:0,radius:18,shadow:false},
    {name:'윤곽',fill:'#ffffff',borderW:2,borderColor:'#6c7bff',radius:8,shadow:false},
    {name:'그림자카드',fill:'#ffffff',borderW:0,radius:14,shadow:true},
    {name:'강조',fill:'#2b6cff',borderW:0,radius:10,shadow:true},
    {name:'연한',fill:'#eef3ff',borderW:1,borderColor:'#cbd8ff',radius:12,shadow:false},
    {name:'다크',fill:'#1a2b5c',borderW:0,radius:10,shadow:true},
    {name:'성공',fill:'#27ae60',borderW:0,radius:10,shadow:false},
    {name:'경고',fill:'#e67e22',borderW:0,radius:10,shadow:false},
  ];
  const grid=document.getElementById('qstyle-grid');
  if(grid) QSTYLES.forEach(qs=>{
    const c=document.createElement('div'); c.className='qs-cell'; c.title=qs.name;
    c.style.cssText+=`;background:${qs.fill};${qs.borderW?`border:1.5px solid ${qs.borderColor};`:''}${qs.shadow?'box-shadow:1px 2px 4px rgba(0,0,0,.35);':''};border-radius:${Math.min(qs.radius,8)}px`;
    c.addEventListener('click',()=>{
      applyToShapes(e=>{ e.fill=qs.fill; e.borderW=qs.borderW; if(qs.borderColor)e.borderColor=qs.borderColor; if(e.shape!=='circle'&&!SHAPE_CLIP[e.shape])e.radius=qs.radius; e.shadow=qs.shadow; });
      closeAllDD();
    });
    grid.appendChild(c);
  });
  document.getElementById('rb-qstyle-btn')?.addEventListener('click',e=>{
    const dd=document.getElementById('qstyle-dd');
    if(dd.style.display==='block'){ closeAllDD(); return; }
    openDD(dd, e.currentTarget);
  });
})();
// (순서/복제/삭제는 정렬 드롭다운(arrange-dd)·단축키로 통합 — 옛 rb-tofront 등 핸들러 제거)
// 삽입 탭 버튼
document.getElementById('rb2-addtext')?.addEventListener('click',addText);
document.getElementById('rb2-addimg')?.addEventListener('click',addImage);
document.getElementById('rb2-addshape')?.addEventListener('click',()=>document.getElementById('open-shape').click());
document.getElementById('rb2-newpage')?.addEventListener('click',openTplModal);
document.getElementById('rb2-tpl')?.addEventListener('click',openTplModal);
document.getElementById('rb2-fixtab')?.addEventListener('click',addFixedTab);
// 보기 탭 버튼
document.getElementById('rb-zoom-in')?.addEventListener('click',()=>{ zoom=Math.min(3,zoom+0.1); applyZoom(); updateRibbonState(); });
document.getElementById('rb-zoom-out')?.addEventListener('click',()=>{ zoom=Math.max(0.1,zoom-0.1); applyZoom(); updateRibbonState(); });
document.getElementById('rb-zoom-fit')?.addEventListener('click',()=>{ fitZoom(); updateRibbonState(); });
document.getElementById('rb-v-pages')?.addEventListener('click',togglePagesPanel);
document.getElementById('rb-v-props')?.addEventListener('click',togglePropsPanel);
document.getElementById('tog-pages')?.addEventListener('click',togglePagesPanel);
document.getElementById('exp-pages')?.addEventListener('click',togglePagesPanel);
document.getElementById('tog-props')?.addEventListener('click',togglePropsPanel);
document.getElementById('exp-props')?.addEventListener('click',togglePropsPanel);
document.getElementById('rb-v-map')?.addEventListener('click',openMap);
// 디자인 탭
document.getElementById('rb-pgbg-btn')?.addEventListener('click',ev=>toggleColorPopup('pageBg',ev.currentTarget));
document.getElementById('rb-pg-h')?.addEventListener('input',()=>{ const v=parseInt(document.getElementById('rb-pg-h').value)||1600; page().h=v; canvas.style.height=v+'px'; document.getElementById('pmeta').textContent=`${page().w} × ${v}`; renderPages(); save(true); });
document.getElementById('rb-pg-h')?.addEventListener('change',()=>snapshot());

window.addEventListener('keydown',ev=>{
  if(document.querySelector('.el.editing')) return;
  // 실제로 '글자를 타이핑 중'일 때만 단축키 무시 (range 슬라이더·색버튼·체크박스 등은 통과)
  const ae=document.activeElement;
  if(ae){
    const tag=ae.tagName, typ=(ae.type||'').toLowerCase();
    const typing = tag==='TEXTAREA' || ae.isContentEditable ||
      (tag==='INPUT' && !['range','color','checkbox','radio','button','submit','reset','file'].includes(typ));
    if(typing) return;
  }
  const ck=ev.ctrlKey||ev.metaKey;
  const code=ev.code; // 물리 키(KeyC 등) — 한글 IME/레이아웃과 무관
  // F2 / Enter → 선택한 텍스트·도형 글자 편집 (PPT 방식)
  if(!ck && (code==='F2'||code==='Enter'||code==='NumpadEnter') && selId){
    const e=el(selId);
    if(e && (e.type==='text'||e.type==='shape')){ ev.preventDefault(); const node=canvas.querySelector(`[data-id="${e.id}"]`); if(node) startEdit(node,e); return; }
    // 표: 단일 셀 선택 상태에서 F2/Enter → 그 셀 편집
    if(e && e.type==='table' && _tblSel && _tblSel.id===e.id){ const n=_tblNorm(_tblSel); if(n.r0===n.r1&&n.c0===n.c1){ ev.preventDefault(); editTableCell(e,n.r0,n.c0); return; } }
  }
  // 텍스트 서식 단축키 (텍스트 선택 시)
  if(ck&&selTextEls().length){
    if(code==='KeyB'){ ev.preventDefault(); const on=selTextEls()[0].fontWeight>=700; applyToTexts(e=>e.fontWeight=on?400:700); return; }
    if(code==='KeyI'){ ev.preventDefault(); const on=!selTextEls()[0].italic; applyToTexts(e=>e.italic=on); return; }
    if(code==='KeyU'){ ev.preventDefault(); const on=!selTextEls()[0].underline; applyToTexts(e=>e.underline=on); return; }
    if(code==='KeyL'){ ev.preventDefault(); applyToTexts(e=>e.align='left'); return; }
    if(code==='KeyE'){ ev.preventDefault(); applyToTexts(e=>e.align='center'); return; }
    if(code==='KeyR'&&!ev.shiftKey){ ev.preventDefault(); applyToTexts(e=>e.align='right'); return; }
    if(code==='KeyJ'){ ev.preventDefault(); applyToTexts(e=>e.align='justify'); return; }
  }
  if(ck&&code==='KeyF'){ ev.preventDefault(); document.getElementById('rb-find')?.click(); return; }
  if(ck&&code==='KeyZ'&&!ev.shiftKey){ ev.preventDefault(); undo(); }
  else if(ck&&(code==='KeyY'||(ev.shiftKey&&code==='KeyZ'))){ ev.preventDefault(); redo(); }
  else if(ck&&code==='KeyC'){ ev.preventDefault(); if(selIds.size) copySel(); else toast('복사할 요소를 먼저 선택하세요'); }
  else if(ck&&code==='KeyX'){ ev.preventDefault(); if(selIds.size) cutSel(); else toast('잘라낼 요소를 먼저 선택하세요'); }
  else if(ck&&code==='KeyV'){ ev.preventDefault(); if(_clipboard&&_clipboard.length) pasteClipboard(); else toast('붙여넣을 내용이 없습니다 (먼저 Ctrl+C)'); }
  else if((ev.key==='Delete'||ev.key==='Backspace')&&selIds.size){ ev.preventDefault(); page().elements=page().elements.filter(x=>!selIds.has(x.id)); selId=null; selIds=new Set(); afterMutate(); }
  else if(ck&&code==='KeyD'){ ev.preventDefault(); if(selIds.size) dupSel(); }
  else if(ck&&code==='BracketRight'&&selId){ ev.preventDefault(); const arr=page().elements,i=arr.findIndex(x=>x.id===selId); if(ev.shiftKey){arr.push(arr.splice(i,1)[0]);}else if(i<arr.length-1){[arr[i],arr[i+1]]=[arr[i+1],arr[i]];} afterMutate(); }
  else if(ck&&code==='BracketLeft'&&selId){ ev.preventDefault(); const arr=page().elements,i=arr.findIndex(x=>x.id===selId); if(ev.shiftKey){arr.unshift(arr.splice(i,1)[0]);}else if(i>0){[arr[i-1],arr[i]]=[arr[i],arr[i-1]];} afterMutate(); }
  else if(ck&&code==='KeyG'&&ev.shiftKey){ ev.preventDefault(); arrUngroup(); }
  else if(ck&&code==='KeyG'){ ev.preventDefault(); arrGroup(); }
  else if(ck&&code==='KeyA'){ ev.preventDefault(); selIds=new Set(page().elements.map(e=>e.id)); selId=selIds.size>0?[...selIds].at(-1):null; renderCanvas(); renderProps(); updateRibbonState(); }
  else if(ev.key==='Escape'&&selIds.size>0){ selId=null; selIds=new Set(); renderCanvas(); renderProps(); updateRibbonState(); }
  else if(selId && ['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(ev.key)){ ev.preventDefault(); const d=ev.shiftKey?10:1; for(const id of selIds){const e2=el(id);if(!e2)continue;if(ev.key==='ArrowUp')e2.y-=d;if(ev.key==='ArrowDown')e2.y+=d;if(ev.key==='ArrowLeft')e2.x-=d;if(ev.key==='ArrowRight')e2.x+=d;} renderCanvas(); const primary=el(selId); if(primary) syncPosInputs(primary); save(true); }
});

// ───────────────────────── 미리보기(발행 렌더) — site-render.js 공유 ─────────────────────────
function preview(){
  const mob = editorDevice==='mobile';
  const w = mob ? window.open('','_blank','width=440,height=880') : window.open('','_blank');
  if(!w){ toast('팝업이 차단되었습니다 — 허용해 주세요'); return; }
  const baseW = (project.pages.find(p=>!p.isHeader&&!p.isFooter&&inDevice(p,editorDevice))||project.pages[0]||{}).w || PAGE_W;
  w.document.write(SiteRender.buildSiteHtml(project, baseW, {forceDevice: editorDevice}));
  w.document.close();
  toast(mob?'📱 모바일 미리보기':'💻 PC 미리보기');
}

// ───────────────────────── 유틸 ─────────────────────────
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
let toastTimer;
function toast(msg){ const t=document.getElementById('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>t.classList.remove('show'),1600); }

// ───────────────────────── 전역 에러 안전망 ─────────────────────────
// JS 에러 하나가 안내 없이 에디터를 반쯤 멈추게 두지 않는다.
let _lastErrAt = 0;
function reportErr(label, err){
  console.error(label, err);
  const now = Date.now();
  if(now - _lastErrAt < 4000) return; // 동일 에러 폭주 시 토스트 도배 방지
  _lastErrAt = now;
  try{ toast('⚠ 일시적 오류가 발생했습니다 — 작업은 자동 저장돼 있습니다'); }catch(_){}
}
window.addEventListener('error', (e)=> reportErr('window.onerror', e.error || e.message));
window.addEventListener('unhandledrejection', (e)=> reportErr('unhandledrejection', e.reason));

// ───────────────────────── 초기화 ─────────────────────────
project = load() || newProject();
snapshot();
renderCanvas(); renderPages(); renderProps();
window.addEventListener('load', ()=>{ fitZoom(); updateRibbonState(); });
