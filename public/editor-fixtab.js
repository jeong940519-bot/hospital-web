// editor-fixtab.js — 고정탭(플로팅 탭) 기능 모듈. editor.js와 상호 import(순환, ESM 안전).
// 최상위는 선언만 → init 시 editor.js 바인딩 미접근. 회귀 시 git으로 복구.
import { _clamp } from './editor-shapes.js';
import { page, zoom, canvas, save, snapshot, renderCanvas, renderProps, toast, hamburgerRootPages, uid, FONTS, _fontOpts, project, selId, selIds, _clearSel, _resetCpTarget } from './editor.js';

let _fixTabSel=null;
let _fixItemIdx=0;   // 항목별 색상 팝업이 가리키는 항목 인덱스
let _fixPopupT=null; // 현재 열린 고정탭 팝업의 대상 탭(색 선택 후 스와치 갱신용)
// 색 선택 직후 고정탭 팝업의 스와치를 즉시 갱신(위치 유지). 팝업이 없으면 무시.
function _fixRefreshPopup(){ const p=document.getElementById('fixtab-popup'); if(p&&_fixPopupT){ const r=p.getBoundingClientRect(); openFixTabPopup(_fixPopupT, r.left, r.top, r.width, r.height); } }
// 팝업 위치·크기를 localStorage에 보존 → 닫았다 다시 열어도 유지
function _fixSaveGeo(){ const p=document.getElementById('fixtab-popup'); if(!p)return; const r=p.getBoundingClientRect(); try{ localStorage.setItem('hw_fixtab_geo', JSON.stringify({x:Math.round(r.left),y:Math.round(r.top),w:Math.round(r.width),h:Math.round(r.height)})); }catch(_){} }
function _fixLoadGeo(){ try{ return JSON.parse(localStorage.getItem('hw_fixtab_geo')||'null'); }catch(_){ return null; } }
function fixedTabs(){ if(!project.fixedTabs) project.fixedTabs=[]; return project.fixedTabs; }
function _fixTab(){ return fixedTabs().find(t=>t.id===_fixTabSel)||null; }
function _fixSave(){ renderFixTabsOnCanvas(); save(true); }
function addFixedTab(){
  const roots=hamburgerRootPages();
  const p=page(), w=118, h=46;
  // 스크롤을 옮기지 않고 "현재 보이는 영역"의 우하단에 생성 → 바로 보임
  const st=document.getElementById('stage');
  const visTop=st? st.scrollTop/zoom : 0;
  const visH=st? st.clientHeight/zoom : p.h;
  const left=_clamp(p.w-24-w, 0, p.w-w);
  const top=_clamp(visTop+visH-h-24, 8, p.h-h-8);
  const cx=left+w/2, cy=top+h/2;
  const corner=(cy<p.h/2?'t':'b')+(cx<p.w/2?'l':'r');
  const dx=Math.round(corner.indexOf('l')>=0?left:(p.w-(left+w)));
  const dy=Math.round(corner.indexOf('t')>=0?top:(p.h-(top+h)));
  const t={ id:uid(), items:[{ label:'예약', action:'top', link:(roots[0]&&roots[0].id)||'', url:'' }],
    dir:'row', corner, dx, dy, w, h, bg:'#2b6cff', color:'#ffffff', fontSize:15, fontWeight:700, fontFamily:'Noto Sans KR', radius:23, device:'both' };
  fixedTabs().push(t); _fixTabSel=t.id; _clearSel();
  renderCanvas(); renderProps(); snapshot();
  toast('고정탭 추가 — 드래그=위치 · 8방향 모서리=크기 · 우클릭=항목·색·폰트');
}
// 레거시(단일 label) 탭을 items 배열 모델로 정규화
function fixTabItemsOf(t){
  if(t.items && t.items.length) return t.items;
  t.items=[{ label:(t.label!=null?t.label:'예약'), action:(t.action||'top'), link:t.link||'', url:t.url||'' }];
  return t.items;
}
function renderFixTabsOnCanvas(){
  canvas.querySelectorAll('.fixtab-edit').forEach(n=>n.remove());
  const R=(window.SiteRender&&SiteRender.fixTabResolve); if(!R) return;
  fixedTabs().forEach(t=>{
    const r=R(t), sel=(t.id===_fixTabSel && !selId && !selIds.size);
    const node=document.createElement('div'); node.className='fixtab-edit';
    node.style.cssText='position:absolute;z-index:90;'+r.hx+';'+r.hy+';'+r.container+(sel?';outline:2px solid var(--accent);outline-offset:2px':'');
    // 항목들을 발행본과 동일하게 시각적으로 표시(편집기에선 클릭 비활성, 컨테이너 단위로 선택)
    r.items.forEach((it,i)=>{
      const cell=document.createElement('div');
      cell.style.cssText=r.itemStyle(it,i)+';pointer-events:none';
      cell.textContent=(it.label!=null?it.label:'')||' ';
      node.appendChild(cell);
    });
    if(t.fx&&t.fx.type){ const fb=document.createElement('div'); fb.textContent='✨'; fb.title='효과: '+t.fx.type+' (미리보기에서 재생)'; fb.style.cssText='position:absolute;top:-9px;left:-9px;width:18px;height:18px;font-size:11px;background:var(--accent);color:#fff;border-radius:50%;display:flex;align-items:center;justify-content:center;z-index:92;pointer-events:none'; node.appendChild(fb); }
    node.title='드래그=위치 · 8방향 모서리=크기 · 우클릭=항목·색·폰트';
    node.addEventListener('mousedown',ev=>{ ev.stopPropagation(); if(!sel){ _fixTabSel=t.id; _clearSel(); renderCanvas(); renderProps(); } startFixTabDrag(ev,t); });
    node.addEventListener('contextmenu',ev=>{ ev.preventDefault(); ev.stopPropagation(); _fixTabSel=t.id; _clearSel(); renderCanvas(); openFixTabPopup(t,ev.clientX,ev.clientY); });
    if(sel){
      const CUR={nw:'nwse',ne:'nesw',sw:'nesw',se:'nwse',n:'ns',s:'ns',w:'ew',e:'ew'};
      const POS={ // [left/right, top/bottom] in px offsets relative to container
        nw:['left:-7px','top:-7px'], ne:['right:-7px','top:-7px'], sw:['left:-7px','bottom:-7px'], se:['right:-7px','bottom:-7px'],
        n:['left:calc(50% - 6px)','top:-7px'], s:['left:calc(50% - 6px)','bottom:-7px'], w:['left:-7px','top:calc(50% - 6px)'], e:['right:-7px','top:calc(50% - 6px)'] };
      Object.keys(POS).forEach(pos=>{
        const h=document.createElement('div');
        h.style.cssText=`position:absolute;${POS[pos][0]};${POS[pos][1]};width:12px;height:12px;background:var(--accent);border:2px solid #fff;border-radius:50%;cursor:${CUR[pos]}-resize;z-index:91`;
        h.addEventListener('mousedown',ev=>{ ev.stopPropagation(); startFixTabResize(ev,t,pos); });
        node.appendChild(h);
      });
    }
    canvas.appendChild(node);
  });
}
function startFixTabDrag(ev,t){
  ev.preventDefault();
  const p=page(), r0=SiteRender.fixTabResolve(t), w=r0.w, h=r0.h, rect=canvas.getBoundingClientRect();
  const startLeft=((t.corner||'br').indexOf('l')>=0)? t.dx : (p.w - t.dx - w);
  const startTop =((t.corner||'br').indexOf('t')>=0)? t.dy : (p.h - t.dy - h);
  const grabX=(ev.clientX-rect.left)/zoom-startLeft, grabY=(ev.clientY-rect.top)/zoom-startTop;
  function mv(ev2){
    let left=_clamp((ev2.clientX-rect.left)/zoom-grabX, 0, p.w-w), top=_clamp((ev2.clientY-rect.top)/zoom-grabY, 0, p.h-h);
    const cx=left+w/2, cy=top+h/2;
    t.corner=(cy<p.h/2?'t':'b')+(cx<p.w/2?'l':'r');
    t.dx=Math.round(t.corner.indexOf('l')>=0?left:(p.w-(left+w)));
    t.dy=Math.round(t.corner.indexOf('t')>=0?top:(p.h-(top+h)));
    _fixSave();
  }
  function up(){ window.removeEventListener('mousemove',mv); window.removeEventListener('mouseup',up); snapshot(); }
  window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up);
}
function startFixTabResize(ev,t,pos){
  ev.preventDefault();
  pos=pos||'se';
  const p=page(), rect=canvas.getBoundingClientRect();
  const corner=t.corner||'br', hasL=corner.indexOf('l')>=0, hasT=corner.indexOf('t')>=0;
  // 현재 절대 박스
  const left0=hasL? t.dx : (p.w - t.dx - t.w);
  const top0 =hasT? t.dy : (p.h - t.dy - t.h);
  const right0=left0+t.w, bottom0=top0+t.h;
  const MINW=40, MINH=24;
  function mv(ev2){
    const mx=(ev2.clientX-rect.left)/zoom, my=(ev2.clientY-rect.top)/zoom;
    let left=left0, right=right0, top=top0, bottom=bottom0;
    if(pos.indexOf('w')>=0) left =_clamp(mx, 0, right0-MINW);
    if(pos.indexOf('e')>=0) right=_clamp(mx, left0+MINW, p.w);
    if(pos.indexOf('n')>=0) top  =_clamp(my, 0, bottom0-MINH);
    if(pos.indexOf('s')>=0) bottom=_clamp(my, top0+MINH, p.h);
    // 같은 corner 기준으로 dx/dy 재계산(앵커 고정 → 튐 없음)
    t.dx=Math.round(hasL? left : (p.w-right));
    t.dy=Math.round(hasT? top : (p.h-bottom));
    t.w=Math.round(right-left); t.h=Math.round(bottom-top);
    _fixSave();
  }
  function up(){ window.removeEventListener('mousemove',mv); window.removeEventListener('mouseup',up); snapshot(); }
  window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up);
}
function openFixTabPopup(t,x,y,pw,ph){
  document.getElementById('fixtab-popup')?.remove();
  _fixPopupT=t;
  // 새로 여는 경우(프로그램 재오픈 아님) 저장된 위치·크기 복원
  if(pw==null){ const g=_fixLoadGeo(); if(g){ x=g.x; y=g.y; pw=g.w; ph=g.h; } }
  const items=fixTabItemsOf(t), dir=(t.dir==='col')?'col':'row';
  const ea=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;');
  const roots=hamburgerRootPages();
  const IN='padding:5px 7px;border:1px solid var(--border,#dcdce8);border-radius:7px;background:var(--bg,#fff);color:var(--text,#222);font-size:12px;outline:none;box-sizing:border-box';
  const SL='font-size:11px;font-weight:700;color:var(--sub,#8a8aa0);margin:0 0 6px;letter-spacing:.02em';
  const pageOptsSel=sel=>roots.map(p=>`<option value="${p.id}"${sel===p.id?' selected':''}>${ea(p.name||'페이지')}</option>`).join('');
  const fontOpts=_fontOpts(t.fontFamily||'Noto Sans KR');
  // 효과(이펙트) — 발행본 FX_ANIM/LOOP/HOVER 키와 동일. 미리보기·발행에서 재생.
  const curFx=(t.fx&&t.fx.type)||'';
  const fxOpt=(v,l)=>`<option value="${v}"${curFx===v?' selected':''}>${l}</option>`;
  const fxOpts=fxOpt('','없음')
    +`<optgroup label="등장(한 번)">${fxOpt('pop-in','팝')}${fxOpt('fade-in','페이드')}${fxOpt('bounce-in','바운스')}${fxOpt('zoom-in','줌 인')}${fxOpt('slide-down','위에서 내려옴')}</optgroup>`
    +`<optgroup label="계속(루프)">${fxOpt('pulse','펄스')}${fxOpt('float','둥둥')}${fxOpt('glow-loop','반짝임')}${fxOpt('heartbeat','하트비트')}${fxOpt('shake','흔들기')}${fxOpt('swing','스윙')}</optgroup>`
    +`<optgroup label="마우스 호버">${fxOpt('hover-lift','떠오름')}${fxOpt('hover-grow','확대')}${fxOpt('hover-glow','빛남')}</optgroup>`;
  const swatch=(key,col)=>`<button type="button" class="panel-cbtn" data-cpkey="${key}" title="색 선택" style="display:flex;align-items:center;gap:6px;padding:5px 8px;border:1px solid var(--border,#dcdce8);border-radius:7px;background:var(--bg,#fff);cursor:pointer;flex:1"><span style="width:16px;height:16px;border-radius:4px;border:1px solid rgba(0,0,0,.15);background:${col||'#ffffff'}"></span><span style="font-size:11px;color:var(--sub,#888)">색</span></button>`;
  const dbtn=(val,lbl)=>`<button type="button" class="ft-dir" data-d="${val}" style="flex:1;padding:6px;border:1px solid ${dir===val?'var(--accent,#2b6cff)':'var(--border,#dcdce8)'};border-radius:7px;background:${dir===val?'var(--accent,#2b6cff)':'transparent'};color:${dir===val?'#fff':'var(--text,#333)'};cursor:pointer;font-size:11px;font-weight:600">${lbl}</button>`;
  // 항목별 색 스와치(클릭 시 _fixItemIdx 지정 후 공용 색상 팝업)
  const isw=(i,which,col,lbl)=>`<button type="button" class="panel-cbtn ft-isw" data-cpkey="${which==='bg'?'fixItemBg':'fixItemColor'}" data-i="${i}" title="항목 ${lbl}" style="display:flex;align-items:center;gap:5px;padding:4px 7px;border:1px solid var(--border,#dcdce8);border-radius:6px;background:var(--bg,#fff);cursor:pointer;flex:1"><span style="width:14px;height:14px;border-radius:4px;border:1px solid rgba(0,0,0,.18);background:${col||'transparent'}"></span><span style="font-size:10px;color:var(--sub,#888)">${lbl}</span></button>`;
  const itemHtml=items.map((it,i)=>`
    <div style="border:1px solid var(--border,#e7e7f1);border-radius:9px;padding:7px;margin-bottom:6px;background:rgba(127,127,170,.05)">
      <div style="display:flex;gap:6px;align-items:center">
        <input class="ft-l" data-i="${i}" type="text" value="${ea(it.label)}" placeholder="항목 이름" style="${IN};flex:1">
        ${items.length>1?`<button class="ft-rm" data-i="${i}" title="항목 삭제" style="border:none;background:transparent;cursor:pointer;font-size:13px;color:#e36;padding:3px">🗑</button>`:''}
      </div>
      <div style="display:flex;gap:6px;margin-top:6px">
        <select class="ft-act" data-i="${i}" style="${IN};flex:1">
          <option value="top"${it.action==='top'?' selected':''}>맨 위로</option>
          <option value="link"${it.action==='link'?' selected':''}>내부 페이지</option>
          <option value="url"${it.action==='url'?' selected':''}>외부 링크</option>
        </select>
        ${it.action==='link'?`<select class="ft-lk" data-i="${i}" style="${IN};flex:1.2">${pageOptsSel(it.link)}</select>`:''}
      </div>
      ${it.action==='url'?`<input class="ft-u" data-i="${i}" type="text" value="${ea(it.url)}" placeholder="https://" style="${IN};width:100%;margin-top:6px">`:''}
      <div style="display:flex;gap:6px;margin-top:6px">${isw(i,'bg',it.bg,'배경')}${isw(i,'color',it.color,'글자')}</div>
    </div>`).join('');
  const pop=document.createElement('div'); pop.id='fixtab-popup';
  pop.style.cssText=`position:fixed;left:${Math.max(8,Math.min(x,innerWidth-296))}px;top:${Math.max(8,Math.min(y,innerHeight-440))}px;z-index:9500;background:var(--panel,#fff);color:var(--text,#222);border:1px solid var(--border,#e2e2ee);border-radius:13px;box-shadow:0 14px 44px rgba(0,0,0,.26);padding:13px 14px;width:276px;max-height:84vh;overflow:auto;font-size:12px;resize:both;min-width:240px;min-height:150px`;
  pop.addEventListener('mousedown',ev=>ev.stopPropagation());
  pop.addEventListener('contextmenu',ev=>ev.preventDefault());
  pop.innerHTML=`
    <div id="ft-head" style="display:flex;align-items:center;gap:7px;cursor:move;user-select:none;margin:-13px -14px 9px;padding:11px 14px 9px;border-bottom:1px solid var(--border,#ececf4);position:sticky;top:-13px;background:var(--panel,#fff);z-index:2;border-radius:13px 13px 0 0">
      <span style="font-weight:800;font-size:14px">📌 고정탭</span>
      <span style="color:var(--sub,#bbb);font-size:13px;margin-left:auto;letter-spacing:1px" title="드래그로 이동">⠿⠿</span>
    </div>
    <div style="color:var(--sub,#999);font-size:11px;margin:0 0 11px">탭 하나에 여러 항목 · 창은 드래그로 이동</div>
    <div style="${SL}">항목</div>
    <div id="ft-items">${itemHtml}</div>
    <button id="ft-add" style="width:100%;padding:7px;border:1px dashed var(--accent,#2b6cff);border-radius:8px;background:transparent;color:var(--accent,#2b6cff);cursor:pointer;font-size:12px;font-weight:600">＋ 항목 추가</button>
    <div style="height:1px;background:var(--border,#ececf4);margin:12px 0"></div>
    <div style="${SL}">스타일</div>
    <div style="display:flex;gap:6px;margin-bottom:8px">${dbtn('row','가로 배열')}${dbtn('col','세로 배열')}</div>
    <div style="display:flex;gap:6px;margin-bottom:8px">${swatch('fixTabBg',t.bg||'#2b6cff')}${swatch('fixTabColor',t.color||'#ffffff')}</div>
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <label style="flex:1;display:flex;flex-direction:column;gap:3px"><span style="font-size:10px;color:var(--sub,#999)">글자크기</span><input type="number" id="ft-fs" value="${t.fontSize||15}" style="${IN}"></label>
      <label style="flex:1;display:flex;flex-direction:column;gap:3px"><span style="font-size:10px;color:var(--sub,#999)">모서리 둥글기</span><input type="number" id="ft-rad" value="${t.radius!=null?t.radius:23}" style="${IN}"></label>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:8px">
      <label style="flex:1;display:flex;flex-direction:column;gap:3px"><span style="font-size:10px;color:var(--sub,#999)">자간(px)</span><input type="number" id="ft-ls" value="${t.letterSpacing||0}" step="0.5" style="${IN}"></label>
      <label style="flex:1;display:flex;flex-direction:column;gap:3px"><span style="font-size:10px;color:var(--sub,#999)">행간</span><input type="number" id="ft-lh" value="${t.lineHeight!=null?t.lineHeight:1.2}" step="0.1" style="${IN}"></label>
      <label style="flex:1;display:flex;flex-direction:column;gap:3px"><span style="font-size:10px;color:var(--sub,#999)">항목 간격</span><input type="number" id="ft-gap" value="${t.gap!=null?t.gap:''}" placeholder="자동" style="${IN}"></label>
    </div>
    <div style="display:flex;gap:6px;margin-bottom:8px;align-items:flex-end">
      <label style="flex:1;display:flex;flex-direction:column;gap:3px"><span style="font-size:10px;color:var(--sub,#999)">칸 둥글기</span><input type="number" id="ft-irad" value="${t.itemRadius!=null?t.itemRadius:''}" placeholder="자동" style="${IN}"></label>
      <label style="flex:1;display:flex;flex-direction:column;gap:3px"><span style="font-size:10px;color:var(--sub,#999)">테두리 굵기</span><input type="number" id="ft-bw" value="${t.borderW||0}" style="${IN}"></label>
      <div style="flex:1.2;display:flex;flex-direction:column;gap:3px"><span style="font-size:10px;color:var(--sub,#999)">테두리 색</span>${swatch('fixTabBorder',t.borderColor||'#e2e2ee')}</div>
    </div>
    <label style="display:flex;flex-direction:column;gap:3px;margin-bottom:8px"><span style="font-size:10px;color:var(--sub,#999)">폰트</span><select id="ft-font" style="${IN};width:100%">${fontOpts}</select></label>
    <div style="display:flex;gap:6px;margin-bottom:4px">
      <label style="flex:1;display:flex;flex-direction:column;gap:3px"><span style="font-size:10px;color:var(--sub,#999)">굵기</span><select id="ft-fw" style="${IN}"><option value="400"${(t.fontWeight||700)==400?' selected':''}>보통</option><option value="700"${(t.fontWeight||700)==700?' selected':''}>굵게</option><option value="900"${(t.fontWeight||700)==900?' selected':''}>매우굵게</option></select></label>
      <label style="flex:1;display:flex;flex-direction:column;gap:3px"><span style="font-size:10px;color:var(--sub,#999)">표시</span><select id="ft-dev" style="${IN}"><option value="both"${(t.device||'both')==='both'?' selected':''}>PC+모바일</option><option value="pc"${t.device==='pc'?' selected':''}>PC만</option><option value="mobile"${t.device==='mobile'?' selected':''}>모바일만</option></select></label>
    </div>
    <label style="display:flex;flex-direction:column;gap:3px;margin-top:8px"><span style="font-size:10px;color:var(--sub,#999)">효과 (▶ 미리보기·발행에서 재생)</span><select id="ft-fx" style="${IN};width:100%">${fxOpts}</select></label>
    <button id="ft-del" style="width:100%;margin-top:11px;padding:7px;border-radius:8px;border:1px solid #e36;background:transparent;color:#e36;cursor:pointer;font-weight:600">🗑 이 고정탭 삭제</button>`;
  document.body.appendChild(pop);
  // 사용자가 조절한 크기 유지(재오픈 시)
  if(pw){ pop.style.width=pw+'px'; }
  if(ph){ pop.style.height=ph+'px'; pop.style.maxHeight='none'; }
  // 실제 크기 기준으로 화면 안에 들어오게 보정(아래 잘림 방지)
  const rc=pop.getBoundingClientRect();
  let px=Math.max(8,Math.min(x,innerWidth-rc.width-8));
  let py=Math.max(8,Math.min(y,innerHeight-rc.height-8));
  pop.style.left=px+'px'; pop.style.top=py+'px';
  const q=id=>pop.querySelector('#'+id);
  // 재렌더(항목 추가/삭제/동작변경)해도 옮겨둔 위치 유지
  const reopen=()=>{ const r=pop.getBoundingClientRect(); openFixTabPopup(t, r.left, r.top, r.width, r.height); };
  // 헤더 드래그로 창 이동
  const head=q('ft-head');
  head.addEventListener('mousedown',ev=>{
    ev.preventDefault();
    const sx=ev.clientX, sy=ev.clientY, l0=pop.getBoundingClientRect().left, t0=pop.getBoundingClientRect().top;
    const mv=e2=>{ pop.style.left=_clamp(l0+e2.clientX-sx,0,innerWidth-pop.offsetWidth)+'px'; pop.style.top=_clamp(t0+e2.clientY-sy,0,innerHeight-pop.offsetHeight)+'px'; };
    const up=()=>{ window.removeEventListener('mousemove',mv); window.removeEventListener('mouseup',up); _fixSaveGeo(); };
    window.addEventListener('mousemove',mv); window.addEventListener('mouseup',up);
  });
  // 모서리 드래그(resize:both) 종료 시 크기 저장
  pop.addEventListener('mouseup',_fixSaveGeo);
  // 항목별 핸들러
  pop.querySelectorAll('.ft-l').forEach(inp=>{ inp.addEventListener('input',()=>{ items[+inp.dataset.i].label=inp.value; _fixSave(); }); inp.addEventListener('change',()=>snapshot()); });
  pop.querySelectorAll('.ft-act').forEach(sel=>sel.addEventListener('change',()=>{ items[+sel.dataset.i].action=sel.value; _fixSave(); snapshot(); reopen(); }));
  pop.querySelectorAll('.ft-lk').forEach(sel=>sel.addEventListener('change',()=>{ items[+sel.dataset.i].link=sel.value; _fixSave(); snapshot(); }));
  pop.querySelectorAll('.ft-u').forEach(inp=>{ inp.addEventListener('input',()=>{ items[+inp.dataset.i].url=inp.value; _fixSave(); }); inp.addEventListener('change',()=>snapshot()); });
  pop.querySelectorAll('.ft-rm').forEach(b=>b.addEventListener('click',()=>{ items.splice(+b.dataset.i,1); _fixSave(); snapshot(); reopen(); }));
  q('ft-add').addEventListener('click',()=>{ items.push({ label:'메뉴', action:'top', link:(roots[0]&&roots[0].id)||'', url:'' }); _fixSave(); snapshot(); reopen(); });
  pop.querySelectorAll('.ft-dir').forEach(b=>b.addEventListener('click',()=>{ t.dir=b.dataset.d; _fixSave(); snapshot(); reopen(); }));
  q('ft-fs').addEventListener('input',()=>{ t.fontSize=parseInt(q('ft-fs').value)||15; _fixSave(); });
  q('ft-fs').addEventListener('change',()=>snapshot());
  q('ft-rad').addEventListener('input',()=>{ t.radius=parseInt(q('ft-rad').value)||0; _fixSave(); });
  q('ft-rad').addEventListener('change',()=>snapshot());
  q('ft-ls').addEventListener('input',()=>{ t.letterSpacing=parseFloat(q('ft-ls').value)||0; _fixSave(); });
  q('ft-ls').addEventListener('change',()=>snapshot());
  q('ft-lh').addEventListener('input',()=>{ t.lineHeight=parseFloat(q('ft-lh').value)||1.2; _fixSave(); });
  q('ft-lh').addEventListener('change',()=>snapshot());
  q('ft-bw').addEventListener('input',()=>{ t.borderW=parseInt(q('ft-bw').value)||0; _fixSave(); });
  q('ft-bw').addEventListener('change',()=>snapshot());
  q('ft-gap').addEventListener('input',()=>{ const v=q('ft-gap').value.trim(); t.gap=(v===''?null:(parseInt(v)||0)); _fixSave(); });
  q('ft-gap').addEventListener('change',()=>snapshot());
  q('ft-irad').addEventListener('input',()=>{ const v=q('ft-irad').value.trim(); t.itemRadius=(v===''?null:(parseInt(v)||0)); _fixSave(); });
  q('ft-irad').addEventListener('change',()=>snapshot());
  // 항목별 색 스와치: 클릭 시 대상 항목 인덱스 지정 + 토글 모호성 제거(항상 새로 열기)
  pop.querySelectorAll('.ft-isw').forEach(b=>b.addEventListener('click',()=>{ _fixItemIdx=+b.dataset.i; _resetCpTarget(); }));
  q('ft-font').addEventListener('change',()=>{ t.fontFamily=q('ft-font').value; _fixSave(); snapshot(); });
  q('ft-fw').addEventListener('change',()=>{ t.fontWeight=parseInt(q('ft-fw').value); _fixSave(); snapshot(); });
  q('ft-dev').addEventListener('change',()=>{ t.device=q('ft-dev').value; _fixSave(); snapshot(); });
  q('ft-fx').addEventListener('change',()=>{ const v=q('ft-fx').value; if(v) t.fx={type:v}; else delete t.fx; _fixSave(); snapshot(); });
  q('ft-del').addEventListener('click',()=>{ const a=fixedTabs(); const i=a.findIndex(x=>x.id===t.id); if(i>=0)a.splice(i,1); _fixTabSel=null; pop.remove(); renderCanvas(); save(true); snapshot(); toast('고정탭 삭제됨'); });
  const closer=ev=>{ if(!ev.target.closest('#fixtab-popup') && !ev.target.closest('#fill-dd')){ _fixSaveGeo(); pop.remove(); document.removeEventListener('mousedown',closer); } };
  setTimeout(()=>document.addEventListener('mousedown',closer),0);
}

function clearFixTabSel(){ _fixTabSel=null; }
export { renderFixTabsOnCanvas, addFixedTab, openFixTabPopup, _fixTab, fixTabItemsOf, _fixSave, _fixRefreshPopup, _fixItemIdx, clearFixTabSel };
