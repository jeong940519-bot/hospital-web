// editor-colors.js — PPT식 색상 팝업용 순수 색상 데이터/수학(테마·표준·텍스처 + hex 변환·명암). editor 상태 비의존.
// editor.js에서 import. 회귀 시 git으로 복구.

const CP_THEME=['#ffffff','#000000','#e7e6e6','#44546a','#5b9bd5','#ed7d31','#a5a5a5','#ffc000','#4472c4','#70ad47'];
const CP_STD=['#c00000','#ff0000','#ffc000','#ffff00','#92d050','#00b050','#00b0f0','#0070c0','#002060','#7030a0'];
const CP_TEX=[
  'repeating-linear-gradient(45deg,#e2e2e2,#e2e2e2 8px,#f6f6f6 8px,#f6f6f6 16px)',
  'repeating-linear-gradient(0deg,#dfe7f5,#dfe7f5 7px,#eef3fb 7px,#eef3fb 14px)',
  'radial-gradient(#c3d3ff 1.6px,transparent 1.6px) 0 0/14px 14px #eef3ff',
  'linear-gradient(135deg,#f6d365,#fda085)',
  'linear-gradient(135deg,#a1c4fd,#c2e9fb)',
  'linear-gradient(135deg,#d4fc79,#96e6a1)',
  'repeating-linear-gradient(90deg,#ececec,#ececec 2px,#fff 2px,#fff 11px)',
  'conic-gradient(from 45deg,#e6e6e6,#fafafa,#e6e6e6,#fafafa,#e6e6e6)',
];
function _hex2rgb(h){ h=String(h).replace('#',''); if(h.length===3) h=h.split('').map(c=>c+c).join(''); return [parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]; }
function _rgb2hex(a){ return '#'+a.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join(''); }
function _lighten(hex,p){ const c=_hex2rgb(hex); return _rgb2hex(c.map(v=>v+(255-v)*p)); }
function _darken(hex,p){ const c=_hex2rgb(hex); return _rgb2hex(c.map(v=>v*(1-p))); }
function _shades(hex){ return [_lighten(hex,.8),_lighten(hex,.6),_lighten(hex,.4),_darken(hex,.25),_darken(hex,.5)]; }

export { CP_THEME, CP_STD, CP_TEX, _hex2rgb, _rgb2hex, _lighten, _darken, _shades };
