// editor-shapes.js — 도형 기하 데이터(클립패스/조절점/라벨/카테고리). editor 상태 비의존 순수 모듈.
// editor.js에서 import. 회귀 시 git으로 이 파일 삭제 + editor.js 블록 복원으로 복구 가능.

const SHAPE_CLIP={
  // 기본 도형
  'triangle':'polygon(50% 0%,0% 100%,100% 100%)',
  'right-triangle':'polygon(0% 0%,0% 100%,100% 100%)',
  'triangle-down':'polygon(0% 0%,100% 0%,50% 100%)',
  'diamond':'polygon(50% 0%,100% 50%,50% 100%,0% 50%)',
  'parallelogram':'polygon(20% 0%,100% 0%,80% 100%,0% 100%)',
  'trapezoid':'polygon(15% 0%,85% 0%,100% 100%,0% 100%)',
  'pentagon':'polygon(50% 0%,100% 38%,82% 100%,18% 100%,0% 38%)',
  'hexagon':'polygon(25% 0%,75% 0%,100% 50%,75% 100%,25% 100%,0% 50%)',
  'heptagon':'polygon(50% 0%,89% 21%,99% 61%,75% 97%,25% 97%,1% 61%,11% 21%)',
  'octagon':'polygon(29% 0%,71% 0%,100% 29%,100% 71%,71% 100%,29% 100%,0% 71%,0% 29%)',
  'cross':'polygon(33% 0%,67% 0%,67% 33%,100% 33%,100% 67%,67% 67%,67% 100%,33% 100%,33% 67%,0% 67%,0% 33%,33% 33%)',
  'lshape':'polygon(0% 0%,40% 0%,40% 60%,100% 60%,100% 100%,0% 100%)',
  'lightning':'polygon(40% 0%,65% 0%,50% 38%,75% 38%,28% 100%,42% 52%,18% 52%)',
  // 블록 화살표
  'arrow-r':'polygon(0% 20%,60% 20%,60% 0%,100% 50%,60% 100%,60% 80%,0% 80%)',
  'arrow-l':'polygon(100% 20%,40% 20%,40% 0%,0% 50%,40% 100%,40% 80%,100% 80%)',
  'arrow-u':'polygon(50% 0%,100% 45%,72% 45%,72% 100%,28% 100%,28% 45%,0% 45%)',
  'arrow-d':'polygon(28% 0%,72% 0%,72% 55%,100% 55%,50% 100%,0% 55%,28% 55%)',
  'arrow-lr':'polygon(0% 50%,22% 20%,22% 38%,78% 38%,78% 20%,100% 50%,78% 80%,78% 62%,22% 62%,22% 80%)',
  'arrow-ud':'polygon(50% 0%,80% 22%,62% 22%,62% 78%,80% 78%,50% 100%,20% 78%,38% 78%,38% 22%,20% 22%)',
  'chevron':'polygon(0% 0%,72% 0%,100% 50%,72% 100%,0% 100%,28% 50%)',
  'home-plate':'polygon(0% 0%,72% 0%,100% 50%,72% 100%,0% 100%)',
  // 별 및 현수막
  'star':'polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)',
  'star4':'polygon(50% 0%,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0% 50%,38% 38%)',
  'star6':'polygon(50% 0%,63% 25%,91% 25%,77% 50%,91% 75%,63% 75%,50% 100%,37% 75%,9% 75%,23% 50%,9% 25%,37% 25%)',
  'star8':'polygon(50% 0%,60% 25%,85% 15%,75% 40%,100% 50%,75% 60%,85% 85%,60% 75%,50% 100%,40% 75%,15% 85%,25% 60%,0% 50%,25% 40%,15% 15%,40% 25%)',
  // 설명선
  'callout':'polygon(0% 0%,100% 0%,100% 72%,38% 72%,22% 100%,25% 72%,0% 72%)',
};
// ── 노란 조절점(adjust handle) 지원 도형: 파라미터로 clip-path 생성 ──
const _clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
function _starPoly(points,inner){
  let p=[];
  for(let i=0;i<points*2;i++){ const r=(i%2===0)?0.5:inner*0.5, ang=-Math.PI/2+i*Math.PI/points;
    p.push(`${(50+r*100*Math.cos(ang)).toFixed(1)}% ${(50+r*100*Math.sin(ang)).toFixed(1)}%`); }
  return `polygon(${p.join(',')})`;
}
const SHAPE_ADJ={
  'arrow-r':{ def:{head:.4,thick:.6},
    clip:a=>{const s=(1-a.head)*100,t0=(1-a.thick)/2*100,t1=100-t0;return `polygon(0% ${t0}%,${s}% ${t0}%,${s}% 0%,100% 50%,${s}% 100%,${s}% ${t1}%,0% ${t1}%)`;},
    handles:[ {hx:a=>1-a.head,hy:_=>0,set:(a,lx)=>a.head=_clamp(1-lx,.05,.95)},
              {hx:_=>0,hy:a=>(1-a.thick)/2,set:(a,lx,ly)=>a.thick=_clamp(1-2*ly,.05,.98)} ]},
  'arrow-l':{ def:{head:.4,thick:.6},
    clip:a=>{const s=a.head*100,t0=(1-a.thick)/2*100,t1=100-t0;return `polygon(100% ${t0}%,${s}% ${t0}%,${s}% 0%,0% 50%,${s}% 100%,${s}% ${t1}%,100% ${t1}%)`;},
    handles:[ {hx:a=>a.head,hy:_=>0,set:(a,lx)=>a.head=_clamp(lx,.05,.95)},
              {hx:_=>1,hy:a=>(1-a.thick)/2,set:(a,lx,ly)=>a.thick=_clamp(1-2*ly,.05,.98)} ]},
  'arrow-u':{ def:{head:.45,thick:.44},
    clip:a=>{const s=a.head*100,t0=(1-a.thick)/2*100,t1=100-t0;return `polygon(50% 0%,100% ${s}%,${t1}% ${s}%,${t1}% 100%,${t0}% 100%,${t0}% ${s}%,0% ${s}%)`;},
    handles:[ {hx:_=>0,hy:a=>a.head,set:(a,lx,ly)=>a.head=_clamp(ly,.05,.95)},
              {hx:a=>(1-a.thick)/2,hy:_=>1,set:(a,lx)=>a.thick=_clamp(1-2*lx,.05,.98)} ]},
  'arrow-d':{ def:{head:.45,thick:.44},
    clip:a=>{const s=(1-a.head)*100,t0=(1-a.thick)/2*100,t1=100-t0;return `polygon(${t0}% 0%,${t1}% 0%,${t1}% ${s}%,100% ${s}%,50% 100%,0% ${s}%,${t0}% ${s}%)`;},
    handles:[ {hx:_=>1,hy:a=>1-a.head,set:(a,lx,ly)=>a.head=_clamp(1-ly,.05,.95)},
              {hx:a=>(1-a.thick)/2,hy:_=>0,set:(a,lx)=>a.thick=_clamp(1-2*lx,.05,.98)} ]},
  'star':{ def:{inner:.4}, clip:a=>_starPoly(5,a.inner),
    handles:[ {hx:a=>0.5+a.inner*0.5*Math.cos(-Math.PI/2+Math.PI/5),hy:a=>0.5+a.inner*0.5*Math.sin(-Math.PI/2+Math.PI/5),
               set:(a,lx,ly)=>a.inner=_clamp(Math.hypot(lx-.5,ly-.5)*2,.1,.9)} ]},
  'star6':{ def:{inner:.5}, clip:a=>_starPoly(6,a.inner),
    handles:[ {hx:a=>0.5+a.inner*0.5*Math.cos(-Math.PI/2+Math.PI/6),hy:a=>0.5+a.inner*0.5*Math.sin(-Math.PI/2+Math.PI/6),
               set:(a,lx,ly)=>a.inner=_clamp(Math.hypot(lx-.5,ly-.5)*2,.15,.9)} ]},
  'callout':{ def:{tx:.22,ty:1},
    clip:a=>{const bx=a.tx*100,ty=a.ty*100,b=70;return `polygon(0% 0%,100% 0%,100% ${b}%,${Math.min(96,bx+12).toFixed(1)}% ${b}%,${bx.toFixed(1)}% ${ty.toFixed(1)}%,${Math.max(4,bx+2).toFixed(1)}% ${b}%,0% ${b}%)`;},
    handles:[ {hx:a=>a.tx,hy:a=>a.ty,set:(a,lx,ly)=>{a.tx=_clamp(lx,0,1);a.ty=_clamp(ly,.7,1);}} ]},
};
function adjOf(e){ const c=SHAPE_ADJ[e.shape]; return c? Object.assign({},c.def,e.adj||{}) : null; }
function shapeClipOf(e){ const c=SHAPE_ADJ[e.shape]; return c? c.clip(adjOf(e)) : SHAPE_CLIP[e.shape]; }
const SHAPE_LABELS={
  'rect':'직사각형','rrect':'둥근 직사각형','circle':'타원',
  'triangle':'이등변 삼각형','right-triangle':'직각 삼각형','triangle-down':'역삼각형',
  'diamond':'다이아몬드','parallelogram':'평행사변형','trapezoid':'사다리꼴',
  'pentagon':'오각형','hexagon':'육각형','heptagon':'칠각형','octagon':'팔각형',
  'cross':'십자','lshape':'ㄴ자','lightning':'번개',
  'arrow-r':'오른쪽 화살표','arrow-l':'왼쪽 화살표','arrow-u':'위쪽 화살표','arrow-d':'아래쪽 화살표',
  'arrow-lr':'좌우 화살표','arrow-ud':'상하 화살표','chevron':'갈매기형','home-plate':'오각형 화살표',
  'star':'5각 별','star4':'4각 별','star6':'6각 별','star8':'8각 별','callout':'말풍선',
  'line':'직선','line-arrow':'화살표 선',
};
// PPT식 카테고리 갤러리 구성
const SHAPE_CATS=[
  {name:'선', keys:['line','line-arrow']},
  {name:'사각형', keys:['rect','rrect']},
  {name:'기본 도형', keys:['circle','triangle','right-triangle','triangle-down','parallelogram','trapezoid','diamond','pentagon','hexagon','heptagon','octagon','cross','lshape','lightning']},
  {name:'블록 화살표', keys:['arrow-r','arrow-l','arrow-u','arrow-d','arrow-lr','arrow-ud','chevron','home-plate']},
  {name:'별 및 현수막', keys:['star','star4','star6','star8']},
  {name:'설명선', keys:['callout']},
];

export { SHAPE_CLIP, _clamp, _starPoly, SHAPE_ADJ, adjOf, shapeClipOf, SHAPE_LABELS, SHAPE_CATS };
