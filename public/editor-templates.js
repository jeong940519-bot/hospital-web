// editor-templates.js — 내장 템플릿 데이터 + 순수 엘리먼트 빌더 (editor 상태 비의존 모듈).
// editor.js에서 import. buildTemplate(상태 의존)은 editor.js에 잔류하고 여기 빌더만 사용한다.
// uid는 난수 id 생성기라 자체 포함(중복돼도 무해) — 모듈을 self-contained하게 유지.
function uid(){ return Math.random().toString(36).slice(2,9); }

const PHOTO = 'data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="#e6e9f2"/><text x="50%" y="50%" font-size="26" fill="#9aa3c0" text-anchor="middle" dominant-baseline="middle">사진</text></svg>');

function tEl(o){ return Object.assign({id:uid(),rot:0}, o); }
function tText(x,y,w,h,text,o){ return tEl(Object.assign({type:'text',x,y,w,h,text,fontFamily:'Noto Sans KR',fontWeight:400,fontSize:24,color:'#333333',align:'left',lineHeight:1.4,letterSpacing:0,italic:false,underline:false},o||{})); }
function tImg(x,y,w,h,o){ return tEl(Object.assign({type:'image',x,y,w,h,src:PHOTO,fit:'cover',radius:0,clip:'none',borderW:0,borderColor:'#333333'},o||{})); }
function tShape(x,y,w,h,o){ return tEl(Object.assign({type:'shape',x,y,w,h,shape:'rect',fill:'#6c7bff',radius:0,borderW:0,borderColor:'#333333'},o||{})); }
function tCard(x,title,desc){
  return [ tShape(x,820,300,250,{fill:'#f5f7fc',radius:16}),
    tText(x,910,300,40,title,{fontSize:24,fontWeight:700,align:'center',color:'#1a2b5c'}),
    tText(x,958,300,70,desc,{fontSize:16,align:'center',color:'#667089',lineHeight:1.5}) ]; }

const TEMPLATES = [
  { key:'blank', name:'빈 페이지', desc:'아무것도 없는 캔버스' },
  { key:'home', name:'병원 홈(메인)', desc:'히어로 + 진료과목 카드' },
  { key:'about', name:'병원 소개', desc:'사진 + 소개 문단' },
  { key:'service', name:'진료 안내', desc:'카드 그리드' },
  { key:'contact', name:'오시는 길', desc:'지도 자리 + 연락처' },
];

export { PHOTO, tEl, tText, tImg, tShape, tCard, TEMPLATES };
