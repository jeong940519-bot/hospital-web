/* 발행 렌더링 공유 모듈 — 편집기(미리보기)와 공개 페이지(index.html)가 동일하게 사용. */
(function(){
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  /* 슬라이더 화살표/점 스타일 해석 — 편집기 미리보기와 발행본이 동일하게 사용(드리프트 방지).
     반환: 컨테이너에 붙일 CSS 변수 문자열(vars) + 표시여부(arrows/dots). */
  var SL_GLYPHS={ chevron:['‹','›'], triangle:['◀','▶'], arrow:['←','→'], double:['«','»'], angle:['〈','〉'] };
  function slStyleVars(fx){
    fx=fx||{};
    var glyph=SL_GLYPHS[fx.arrowGlyph]||SL_GLYPHS.chevron;
    var none = fx.arrowShape==='none';
    var arrSize=+(fx.arrowSize||38);
    var arrRadius = fx.arrowShape==='square'?'8px':(none?'0':'50%');
    var arrBg = none?'transparent':(fx.arrowBg||'rgba(0,0,0,.45)');
    var arrColor = fx.arrowColor||'#fff';
    var arrGap = (fx.arrowGap!=null?+fx.arrowGap:8);
    var arrY = (fx.arrowY!=null?+fx.arrowY:50);
    var dotShape = fx.dotShape||'circle';
    var dotH=+(fx.dotSize||9);
    var dotW = dotShape==='bar'?Math.round(dotH*2.6):dotH;
    var dotRadius = dotShape==='square'?'2px':(Math.round(dotH/2)+'px');
    var dotColor = fx.dotColor||'rgba(255,255,255,.45)';
    var dotOn = fx.dotActiveColor||'#fff';
    var dotGap = (fx.dotGap!=null?+fx.dotGap:7);
    var dotBottom = (fx.dotBottom!=null?+fx.dotBottom:10);
    var dotX = (fx.dotX!=null?+fx.dotX:50);
    var vars='--sl-arr-size:'+arrSize+'px;--sl-arr-bg:'+arrBg+';--sl-arr-color:'+arrColor+';--sl-arr-radius:'+arrRadius+';--sl-arr-gap:'+arrGap+'px;--sl-arr-y:'+arrY+'%;'
      +'--sl-dot-w:'+dotW+'px;--sl-dot-h:'+dotH+'px;--sl-dot-radius:'+dotRadius+';--sl-dot:'+dotColor+';--sl-dot-on:'+dotOn+';--sl-dot-gap:'+dotGap+'px;--sl-dot-bottom:'+dotBottom+'px;--sl-dot-x:'+dotX+'%;';
    return { vars:vars, arrows:fx.arrows!==false, dots:fx.dots!==false,
      raw:{ arrSize:arrSize, arrBg:arrBg, arrColor:arrColor, arrRadius:arrRadius, arrGap:arrGap, arrY:arrY,
        dotW:dotW, dotH:dotH, dotRadius:dotRadius, dotColor:dotColor, dotOn:dotOn, dotGap:dotGap, dotBottom:dotBottom, dotX:dotX, dotShape:dotShape, arrowShape:(fx.arrowShape||'circle'), prev:glyph[0], next:glyph[1] } };
  }

  /* 고정탭 항목 정규화 — 신규(items[]) / 레거시(단일 label·action) 모두 items 배열로. */
  function fixTabItems(t){
    t=t||{};
    if(t.items && t.items.length) return t.items;
    return [{ label:(t.label!=null?t.label:'예약'), action:(t.action||'top'), link:t.link||'', url:t.url||'' }];
  }
  /* 고정탭(플로팅 탭) 스타일 해석 — 편집기·발행본 공유. corner=tl|tr|bl|br + dx/dy 오프셋, 항목 여러 개 가능. */
  function fixTabResolve(t){
    t=t||{};
    var corner=t.corner||'br';
    var dx=(t.dx!=null?+t.dx:24), dy=(t.dy!=null?+t.dy:24);
    var w=(t.w!=null?+t.w:118), h=(t.h!=null?+t.h:46);
    var hx=(corner.indexOf('l')>=0)?('left:'+dx+'px'):('right:'+dx+'px');
    var hy=(corner.indexOf('t')>=0)?('top:'+dy+'px'):('bottom:'+dy+'px');
    var radius=(t.radius!=null?+t.radius:23);
    var dir=(t.dir==='col')?'column':'row';
    var items=fixTabItems(t);
    var pill=items.some(function(it){return it&&it.bg;});   // 항목별 배경이 하나라도 있으면 '알약' 모드
    var lh=(t.lineHeight!=null?+t.lineHeight:1.2);
    var ls=(t.letterSpacing!=null?+t.letterSpacing:0);
    var bw=(t.borderW!=null?+t.borderW:0);
    var pad=pill?6:0, gap=pill?6:0;
    var innerR=pill?Math.max(4,radius-pad):0;
    var container='width:'+w+'px;height:'+h+'px;background:'+(t.bg||'#2b6cff')+';color:'+(t.color||'#ffffff')
      +';font-size:'+(+(t.fontSize||15))+'px;font-weight:'+(t.fontWeight||700)+";font-family:'"+(t.fontFamily||'Noto Sans KR')+"',sans-serif"
      +';border-radius:'+radius+'px;display:flex;flex-direction:'+dir+';align-items:stretch'
      +';line-height:'+lh+';letter-spacing:'+ls+'px'
      +(bw>0?';border:'+bw+'px solid '+(t.borderColor||'#e2e2ee'):'')
      +(pad?';padding:'+pad+'px;gap:'+gap+'px':'')
      +';box-shadow:0 4px 14px rgba(0,0,0,.22);box-sizing:border-box;overflow:hidden';
    var itemBase='flex:1 1 0;min-width:0;display:flex;align-items:center;justify-content:center;text-align:center;cursor:pointer;padding:2px 8px;white-space:pre-line;text-decoration:none;color:inherit;overflow:hidden';
    var divCss=(dir==='column')?'border-top:1px solid rgba(255,255,255,.28)':'border-left:1px solid rgba(255,255,255,.28)';
    function itemStyle(it,i){
      var s=itemBase;
      if(pill){ s+=';border-radius:'+innerR+'px'; }
      else if(i>0){ s+=';'+divCss; }
      if(it&&it.bg) s+=';background:'+it.bg;
      if(it&&it.color) s+=';color:'+it.color;
      return s;
    }
    return { hx:hx, hy:hy, w:w, h:h, container:container, itemCss:itemBase, divCss:divCss, itemStyle:itemStyle, dir:dir, radius:radius, items:items, dev:(t.device||'both') };
  }
  function fixTabHtml(t){
    var r=fixTabResolve(t);
    var inner=r.items.map(function(it,i){
      var css=r.itemStyle(it,i);
      var attr=' class="fixtab-item" style="'+css+'"';
      var lbl=esc(it.label!=null?it.label:'');
      if(it.action==='url') return '<a href="'+esc(it.url||'#')+'" target="_blank" rel="noopener"'+attr+'>'+lbl+'</a>';
      if(it.action==='link') return '<div data-link="'+esc(it.link||'')+'"'+attr+'>'+lbl+'</div>';
      return '<div data-fixtab="top"'+attr+'>'+lbl+'</div>';
    }).join('');
    return '<div class="fixtab" data-dev="'+r.dev+'" style="position:fixed;z-index:500;'+r.hx+';'+r.hy+';'+r.container+'">'+inner+'</div>';
  }

  /* ── 효과 CSS ── */
  var FX_CSS = [
    '[data-fx-sr]{opacity:0;transition:opacity .65s ease,transform .65s ease}',
    '[data-fx-sr="up"]{transform:translateY(48px)}',
    '[data-fx-sr="left"]{transform:translateX(-48px)}',
    '[data-fx-sr="right"]{transform:translateX(48px)}',
    '[data-fx-sr="fade"]{transform:none}',
    '.fx-sr-in{opacity:1!important;transform:none!important}',
    '[data-fx-hs-content]{transition:opacity .25s;pointer-events:none}',
    '.fx-slider{position:absolute;inset:0;overflow:hidden}',
    '.fx-sl-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .6s}',
    '.fx-sl-btn{position:absolute;top:var(--sl-arr-y,50%);transform:translateY(-50%);background:var(--sl-arr-bg,rgba(0,0,0,.45));color:var(--sl-arr-color,#fff);border:none;border-radius:var(--sl-arr-radius,50%);width:var(--sl-arr-size,38px);height:var(--sl-arr-size,38px);font-size:calc(var(--sl-arr-size,38px)*0.58);line-height:1;cursor:pointer;z-index:10;display:flex;align-items:center;justify-content:center}',
    '.fx-sl-prev{left:var(--sl-arr-gap,8px)}.fx-sl-next{right:var(--sl-arr-gap,8px)}',
    '.fx-sl-dots{position:absolute;bottom:var(--sl-dot-bottom,10px);left:var(--sl-dot-x,50%);transform:translateX(-50%);display:flex;gap:var(--sl-dot-gap,7px);z-index:10}',
    '.fx-sl-dot{width:var(--sl-dot-w,9px);height:var(--sl-dot-h,9px);border-radius:var(--sl-dot-radius,50%);background:var(--sl-dot,rgba(255,255,255,.45));cursor:pointer;border:none;padding:0;transition:background .2s}',
    '.fx-sl-dot.on{background:var(--sl-dot-on,#fff)}',
    '[data-fx-hz]{transition:transform .3s;transform-origin:center center}',
    '[data-fx-hz]:hover{transform:scale(1.07)!important}',
    '[data-fx-expand]{overflow:hidden;transition:height .42s cubic-bezier(.4,0,.2,1),box-shadow .3s}',
    '[data-fx-expand]:hover{box-shadow:0 8px 32px rgba(0,0,0,.18)}',
    '[data-fx-sticky]{will-change:transform;z-index:600}',
    '[data-fx-chars] .c{display:inline-block;white-space:pre;opacity:0;transform:translateY(16px);transition:opacity .55s ease,transform .55s ease}',
    '[data-fx-chars].fx-chars-in .c{opacity:1;transform:none}',
    '[data-fx-parallax]{will-change:transform}',
    '[data-fx-scrub]{will-change:transform,opacity}',
    '.fx-bgvid{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border:0;z-index:0;pointer-events:none}',
    // ── 진입 애니메이션 (data-fx-anim, 관찰자가 .fx-anim-in 부여) ──
    '[data-fx-anim]{transition:opacity .65s ease,transform .65s ease,filter .65s ease,clip-path .7s ease}',
    '[data-fx-anim="mask"]{clip-path:inset(0 0 100% 0)}',
    '[data-fx-anim="maskL"]{clip-path:inset(0 100% 0 0)}',
    '[data-fx-anim="rot"]{opacity:0;transform:rotate(-8deg) scale(.92)}',
    '[data-fx-anim="blur"]{opacity:0;filter:blur(14px)}',
    '[data-fx-anim="skew"]{opacity:0;transform:skewY(6deg) translateY(34px)}',
    '[data-fx-anim="flip"]{opacity:0;transform:perspective(800px) rotateX(42deg);transform-origin:top center}',
    '[data-fx-anim="zin"]{opacity:0;transform:scale(.7)}',
    '[data-fx-anim="zout"]{opacity:0;transform:scale(1.18)}',
    '[data-fx-anim="bounce"]{opacity:0;transform:translateY(40px)}',
    '[data-fx-anim="fade"]{opacity:0}',
    '[data-fx-anim="sdown"]{opacity:0;transform:translateY(-44px)}',
    '[data-fx-anim="sright"]{opacity:0;transform:translateX(-56px)}',
    '[data-fx-anim="sleft"]{opacity:0;transform:translateX(56px)}',
    '[data-fx-anim="flipy"]{opacity:0;transform:perspective(800px) rotateY(60deg);transform-origin:left center}',
    '[data-fx-anim="pop"]{opacity:0;transform:scale(.4)}',
    '[data-fx-anim].fx-anim-in{opacity:1;transform:none;filter:none;clip-path:inset(0 0 0 0)}',
    '[data-fx-anim="pop"].fx-anim-in{transition:opacity .45s,transform .6s cubic-bezier(.34,1.56,.64,1)}',
    '[data-fx-anim="bounce"].fx-anim-in{transition:opacity .5s,transform .7s cubic-bezier(.34,1.56,.64,1)}',
    // ── 상시 루프 (data-fx-loop, 순수 CSS) ──
    '@keyframes fx-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}',
    '@keyframes fx-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.05)}}',
    '@keyframes fx-spin{to{transform:rotate(360deg)}}',
    '@keyframes fx-wobble{0%,100%{transform:rotate(-2.2deg)}50%{transform:rotate(2.2deg)}}',
    '@keyframes fx-grad{0%{background-position:0% 50%}100%{background-position:200% 50%}}',
    '@keyframes fx-marquee{0%{transform:translateX(70%)}100%{transform:translateX(-110%)}}',
    '[data-fx-loop="float"]{animation:fx-float 3.2s ease-in-out infinite}',
    '[data-fx-loop="pulse"]{animation:fx-pulse 2s ease-in-out infinite}',
    '[data-fx-loop="spin"]{animation:fx-spin 9s linear infinite}',
    '[data-fx-loop="wobble"]{animation:fx-wobble 2.6s ease-in-out infinite}',
    '[data-fx-loop="grad"]{background-size:220% 220%!important;animation:fx-grad 7s linear infinite}',
    '[data-fx-loop="marquee"]{overflow:hidden}',
    '[data-fx-loop="marquee"]>div{white-space:nowrap!important;display:inline-block!important;animation:fx-marquee 13s linear infinite}',
    '@keyframes fx-shake{0%,92%,100%{transform:translateX(0)}94%{transform:translateX(-6px)}96%{transform:translateX(6px)}98%{transform:translateX(-4px)}}',
    '@keyframes fx-heart{0%,40%,100%{transform:scale(1)}10%{transform:scale(1.14)}25%{transform:scale(1.14)}}',
    '@keyframes fx-tada{0%,100%{transform:scale(1) rotate(0)}10%,20%{transform:scale(.93) rotate(-3deg)}30%,50%,70%,90%{transform:scale(1.08) rotate(3deg)}40%,60%,80%{transform:scale(1.08) rotate(-3deg)}}',
    '@keyframes fx-swing{0%,100%{transform:rotate(0)}20%{transform:rotate(9deg)}40%{transform:rotate(-7deg)}60%{transform:rotate(5deg)}80%{transform:rotate(-3deg)}}',
    '@keyframes fx-glow{0%,100%{box-shadow:0 0 6px rgba(108,123,255,.35)}50%{box-shadow:0 0 26px rgba(108,123,255,.85)}}',
    '@keyframes fx-blink{0%,100%{opacity:1}50%{opacity:.35}}',
    '[data-fx-loop="shake"]{animation:fx-shake 3.6s ease-in-out infinite}',
    '[data-fx-loop="heart"]{animation:fx-heart 2.2s ease-in-out infinite}',
    '[data-fx-loop="tada"]{animation:fx-tada 3.4s ease-in-out infinite}',
    '[data-fx-loop="swing"]{transform-origin:top center;animation:fx-swing 3s ease-in-out infinite}',
    '[data-fx-loop="glowloop"]{animation:fx-glow 2.2s ease-in-out infinite}',
    '[data-fx-loop="blink"]{animation:fx-blink 1.6s ease-in-out infinite}',
    // ── 호버 마이크로 인터랙션 (data-fx-hover, 순수 CSS) ──
    '[data-fx-hover]{transition:transform .25s ease,box-shadow .25s ease,filter .25s ease}',
    '[data-fx-hover="lift"]:hover{transform:translateY(-8px);box-shadow:0 16px 34px rgba(0,0,0,.20)}',
    '[data-fx-hover="glow"]:hover{box-shadow:0 0 26px rgba(108,123,255,.6);filter:brightness(1.06)}',
    '[data-fx-hover="tilt"]:hover{transform:perspective(600px) rotateX(6deg) rotateY(-6deg)}',
    '[data-fx-hover="grow"]:hover{transform:scale(1.06)}',
    '[data-fx-hover="sink"]:hover{transform:translateY(4px);filter:brightness(.94)}',
    '[data-fx-hover="rotate"]:hover{transform:rotate(4deg) scale(1.03)}',
    '[data-fx-hover="bright"]:hover{filter:brightness(1.15)}',
    '[data-fx-hover="border"]:hover{box-shadow:0 0 0 3px #6c7bff}',
    '[data-fx-hover="dim"]:hover{filter:brightness(.8)}',
    '[data-fx-hover="float-h"]:hover{transform:translateY(-8px) scale(1.03);box-shadow:0 18px 36px rgba(0,0,0,.22)}',
  ].join('');

  /* ── 효과 JS 블록 (사용된 것만 삽입) ── */
  var FX_JS = {
    'scroll-reveal':'(function(){var io=new IntersectionObserver(function(en){en.forEach(function(e){if(e.isIntersecting){e.target.classList.add("fx-sr-in");io.unobserve(e.target);}});},{threshold:0.12});document.querySelectorAll("[data-fx-sr]").forEach(function(el){el.style.transitionDelay=(el.dataset.fxDelay||0)+"ms";io.observe(el);});})();',
    'hover-show':'(function(){var G={};function g(k){return G[k]||(G[k]={tr:[],ct:[]});}document.querySelectorAll("[data-fx-hs-trigger]").forEach(function(t){g(t.dataset.fxHsTrigger).tr.push(t);});document.querySelectorAll("[data-fx-hs-content]").forEach(function(c){g(c.dataset.fxHsContent).ct.push(c);});Object.keys(G).forEach(function(k){var gr=G[k];function sh(){gr.ct.forEach(function(c){c.style.opacity="1";c.style.pointerEvents="auto";});}function hi(){gr.ct.forEach(function(c){c.style.opacity="0";c.style.pointerEvents="none";});}gr.tr.forEach(function(t){t.addEventListener("mouseenter",sh);t.addEventListener("mouseleave",hi);});gr.ct.forEach(function(c){c.addEventListener("mouseenter",sh);c.addEventListener("mouseleave",hi);});hi();});})();',
    'tab':'(function(){var G={};function g(k){return G[k]||(G[k]={tr:[],ct:[]});}document.querySelectorAll("[data-fx-tab-trigger]").forEach(function(t){var gr=g(t.dataset.fxTabTrigger),i=+(t.dataset.fxTabIdx||0);gr.tr[i]=t;t.style.cursor="pointer";});document.querySelectorAll("[data-fx-tab-content]").forEach(function(c){var gr=g(c.dataset.fxTabContent),i=+(c.dataset.fxTabIdx||0);gr.ct[i]=c;});Object.keys(G).forEach(function(k){var gr=G[k];function act(n){gr.tr.forEach(function(t,i){if(t){t.style.opacity=i===n?"1":"0.5";t.style.outline=i===n?"2px solid currentColor":"none";}});gr.ct.forEach(function(c,i){if(c)c.style.display=i===n?"block":"none";});}gr.tr.forEach(function(t,i){if(t)t.addEventListener("click",function(){act(i);});});act(0);});})();',
    'counter':'(function(){var io=new IntersectionObserver(function(en){en.forEach(function(e){if(!e.isIntersecting)return;var el=e.target,from=+(el.dataset.fxFrom||0),to=+(el.dataset.fxTo||100),dur=+(el.dataset.fxDur||2000),suf=el.dataset.fxSuf||"",inner=el.querySelector("div")||el;io.unobserve(el);var s=null;(function step(ts){if(!s)s=ts;var p=Math.min(1,(ts-s)/dur);inner.textContent=Math.round(from+(to-from)*p).toLocaleString()+suf;if(p<1)requestAnimationFrame(step);})(performance.now());});},{threshold:0.5});document.querySelectorAll("[data-fx-counter]").forEach(function(el){io.observe(el);});})();',
    'slider':'(function(){document.querySelectorAll(".fx-slider").forEach(function(sl){var imgs=sl.querySelectorAll(".fx-sl-img"),dots=sl.querySelectorAll(".fx-sl-dot"),cur=0,auto=sl.dataset.slAuto==="1",iv=+(sl.dataset.slIv||3000),tm=null;function go(n){n=(n+imgs.length)%imgs.length;imgs[cur].style.opacity="0";if(dots[cur])dots[cur].classList.remove("on");cur=n;imgs[cur].style.opacity="1";if(dots[cur])dots[cur].classList.add("on");}function rst(){clearInterval(tm);if(auto)tm=setInterval(function(){go(cur+1);},iv);}sl.querySelectorAll(".fx-sl-prev").forEach(function(b){b.addEventListener("click",function(){go(cur-1);rst();});});sl.querySelectorAll(".fx-sl-next").forEach(function(b){b.addEventListener("click",function(){go(cur+1);rst();});});dots.forEach(function(d,i){d.addEventListener("click",function(){go(i);rst();});});go(0);rst();});})();',
    'hover-expand':'(function(){document.querySelectorAll("[data-fx-expand]").forEach(function(el){var col=+(el.dataset.fxColH||60),full=+(el.dataset.fxFullH||200);el.style.height=col+"px";el.style.cursor="pointer";el.addEventListener("mouseenter",function(){el.style.height=full+"px";});el.addEventListener("mouseleave",function(){el.style.height=col+"px";});});})();',
    'sticky':'(function(){var els=[].slice.call(document.querySelectorAll("[data-fx-sticky]"));if(!els.length)return;function upd(){var s=window.__pgScale||1,y=window.scrollY||window.pageYOffset||0;els.forEach(function(el){var b=el.getAttribute("data-fx-base-tf")||"";el.style.transform=(b?b+" ":"")+"translateY("+(y/s)+"px)";});}window.addEventListener("scroll",upd,{passive:true});window.addEventListener("resize",upd);upd();})();',
    'char-reveal':'(function(){var io=new IntersectionObserver(function(en){en.forEach(function(e){if(e.isIntersecting){e.target.classList.add("fx-chars-in");io.unobserve(e.target);}});},{threshold:0.18});document.querySelectorAll("[data-fx-chars]").forEach(function(el){io.observe(el);});})();',
    'parallax':'(function(){var els=[].slice.call(document.querySelectorAll("[data-fx-parallax]"));if(!els.length)return;function upd(){var s=window.__pgScale||1,y=window.scrollY||window.pageYOffset||0;els.forEach(function(el){var sp=parseFloat(el.dataset.fxSpeed||0.15),b=el.getAttribute("data-fx-base-tf")||"";el.style.transform=(b?b+" ":"")+"translateY("+(y*sp/s)+"px)";});}window.addEventListener("scroll",upd,{passive:true});window.addEventListener("resize",upd);upd();})();',
    'scroll-scrub':'(function(){var els=[].slice.call(document.querySelectorAll("[data-fx-scrub]"));if(!els.length)return;function pinProg(b){var s=window.__pgScale||1,L=+b.dataset.secPinlen||600,r=b.getBoundingClientRect();return Math.max(0,Math.min(1,(-r.top)/(L*s)));}function upd(){var vh=window.innerHeight;els.forEach(function(el){var pb=el.closest?el.closest(".secblock.pinned"):null,p;if(pb){p=pinProg(pb);}else{var r=el.getBoundingClientRect();p=Math.max(0,Math.min(1,(vh-r.top)/(vh*0.7)));}var m=el.dataset.fxScrub||"both",b=el.getAttribute("data-fx-base-tf")||"";if(m==="fade"||m==="both")el.style.opacity=p;if(m==="scale"||m==="both")el.style.transform=(b?b+" ":"")+"scale("+(0.85+0.15*p)+")";});}window.addEventListener("scroll",upd,{passive:true});window.addEventListener("resize",upd);upd();})();'
  };
  FX_JS['anim']='(function(){var io=new IntersectionObserver(function(en){en.forEach(function(e){if(e.isIntersecting){e.target.classList.add("fx-anim-in");io.unobserve(e.target);}});},{threshold:0.15});document.querySelectorAll("[data-fx-anim]").forEach(function(el){el.style.transitionDelay=(el.dataset.fxDelay||0)+"ms";io.observe(el);});})();';
  // 새 효과 타입 → data 속성 매핑
  var FX_ANIM={'mask-wipe':'mask','mask-wipe-l':'maskL','rotate-in':'rot','blur-in':'blur','skew-in':'skew','flip-in':'flip','zoom-in':'zin','zoom-out':'zout','bounce-in':'bounce','fade-in':'fade','slide-down':'sdown','slide-right':'sright','slide-left':'sleft','flip-y':'flipy','pop-in':'pop'};
  var FX_LOOP={'float':'float','pulse':'pulse','spin':'spin','wobble':'wobble','gradient-flow':'grad','marquee':'marquee','shake':'shake','heartbeat':'heart','tada':'tada','swing':'swing','glow-loop':'glowloop','blink':'blink'};
  var FX_HOVER={'hover-lift':'lift','hover-glow':'glow','hover-tilt':'tilt','hover-grow':'grow','hover-sink':'sink','hover-rotate':'rotate','hover-bright':'bright','hover-border':'border','hover-dim':'dim','hover-float':'float-h'};
  function _ytId(u){ var m=String(u).match(/(?:youtu\.be\/|v=|embed\/)([\w-]{11})/); return m?m[1]:String(u); }
  function bgVideoHtml(fx){
    var src=fx.src||''; if(!src) return '';
    var kind=fx.kind||(/youtu/.test(src)?'youtube':/vimeo/.test(src)?'vimeo':'mp4');
    if(kind==='youtube'){ var id=_ytId(src); return '<iframe class="fx-bgvid" src="https://www.youtube.com/embed/'+id+'?autoplay=1&mute=1&loop=1&controls=0&showinfo=0&modestbranding=1&playsinline=1&playlist='+id+'" allow="autoplay; encrypted-media" allowfullscreen></iframe>'; }
    if(kind==='vimeo'){ var vm=(src.match(/(\d{6,})/)||[])[1]||''; return '<iframe class="fx-bgvid" src="https://player.vimeo.com/video/'+vm+'?autoplay=1&muted=1&loop=1&background=1" allow="autoplay"></iframe>'; }
    return '<video class="fx-bgvid" autoplay muted loop playsinline src="'+src+'"></video>';
  }

  var SHAPE_CLIP={
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
    'arrow-r':'polygon(0% 20%,60% 20%,60% 0%,100% 50%,60% 100%,60% 80%,0% 80%)',
    'arrow-l':'polygon(100% 20%,40% 20%,40% 0%,0% 50%,40% 100%,40% 80%,100% 80%)',
    'arrow-u':'polygon(50% 0%,100% 45%,72% 45%,72% 100%,28% 100%,28% 45%,0% 45%)',
    'arrow-d':'polygon(28% 0%,72% 0%,72% 55%,100% 55%,50% 100%,0% 55%,28% 55%)',
    'arrow-lr':'polygon(0% 50%,22% 20%,22% 38%,78% 38%,78% 20%,100% 50%,78% 80%,78% 62%,22% 62%,22% 80%)',
    'arrow-ud':'polygon(50% 0%,80% 22%,62% 22%,62% 78%,80% 78%,50% 100%,20% 78%,38% 78%,38% 22%,20% 22%)',
    'chevron':'polygon(0% 0%,72% 0%,100% 50%,72% 100%,0% 100%,28% 50%)',
    'home-plate':'polygon(0% 0%,72% 0%,100% 50%,72% 100%,0% 100%)',
    'star':'polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)',
    'star4':'polygon(50% 0%,62% 38%,100% 50%,62% 62%,50% 100%,38% 62%,0% 50%,38% 38%)',
    'star6':'polygon(50% 0%,63% 25%,91% 25%,77% 50%,91% 75%,63% 75%,50% 100%,37% 75%,9% 75%,23% 50%,9% 25%,37% 25%)',
    'star8':'polygon(50% 0%,60% 25%,85% 15%,75% 40%,100% 50%,75% 60%,85% 85%,60% 75%,50% 100%,40% 75%,15% 85%,25% 60%,0% 50%,25% 40%,15% 15%,40% 25%)',
    'callout':'polygon(0% 0%,100% 0%,100% 72%,38% 72%,22% 100%,25% 72%,0% 72%)',
  };
  function _starPoly(points,inner){ var p=[]; for(var i=0;i<points*2;i++){ var r=(i%2===0)?0.5:inner*0.5, ang=-Math.PI/2+i*Math.PI/points; p.push((50+r*100*Math.cos(ang)).toFixed(1)+'% '+(50+r*100*Math.sin(ang)).toFixed(1)+'%'); } return 'polygon('+p.join(',')+')'; }
  var SHAPE_ADJ={
    'arrow-r':{def:{head:.4,thick:.6},clip:function(a){var s=(1-a.head)*100,t0=(1-a.thick)/2*100,t1=100-t0;return 'polygon(0% '+t0+'%,'+s+'% '+t0+'%,'+s+'% 0%,100% 50%,'+s+'% 100%,'+s+'% '+t1+'%,0% '+t1+'%)';}},
    'arrow-l':{def:{head:.4,thick:.6},clip:function(a){var s=a.head*100,t0=(1-a.thick)/2*100,t1=100-t0;return 'polygon(100% '+t0+'%,'+s+'% '+t0+'%,'+s+'% 0%,0% 50%,'+s+'% 100%,'+s+'% '+t1+'%,100% '+t1+'%)';}},
    'arrow-u':{def:{head:.45,thick:.44},clip:function(a){var s=a.head*100,t0=(1-a.thick)/2*100,t1=100-t0;return 'polygon(50% 0%,100% '+s+'%,'+t1+'% '+s+'%,'+t1+'% 100%,'+t0+'% 100%,'+t0+'% '+s+'%,0% '+s+'%)';}},
    'arrow-d':{def:{head:.45,thick:.44},clip:function(a){var s=(1-a.head)*100,t0=(1-a.thick)/2*100,t1=100-t0;return 'polygon('+t0+'% 0%,'+t1+'% 0%,'+t1+'% '+s+'%,100% '+s+'%,50% 100%,0% '+s+'%,'+t0+'% '+s+'%)';}},
    'star':{def:{inner:.4},clip:function(a){return _starPoly(5,a.inner);}},
    'star6':{def:{inner:.5},clip:function(a){return _starPoly(6,a.inner);}},
    'callout':{def:{tx:.22,ty:1},clip:function(a){var bx=a.tx*100,ty=a.ty*100,b=70;return 'polygon(0% 0%,100% 0%,100% '+b+'%,'+Math.min(96,bx+12).toFixed(1)+'% '+b+'%,'+bx.toFixed(1)+'% '+ty.toFixed(1)+'%,'+Math.max(4,bx+2).toFixed(1)+'% '+b+'%,0% '+b+'%)';}}
  };
  function shapeClipOf(e){ var c=SHAPE_ADJ[e.shape]; if(c){ var a={},k; for(k in c.def)a[k]=c.def[k]; if(e.adj)for(k in e.adj)a[k]=e.adj[k]; return c.clip(a); } return SHAPE_CLIP[e.shape]||''; }

  function renderElStatic(e){
    var fx = e.fx||{}, ft = fx.type||'';
    var _tf=''; if(e.rot)_tf+='rotate('+e.rot+'deg)'; if(e.flipH)_tf+=' scaleX(-1)'; if(e.flipV)_tf+=' scaleY(-1)';
    var base = 'left:'+e.x+'px;top:'+e.y+'px;width:'+e.w+'px;height:'+e.h+'px;'+(_tf?'transform:'+_tf.trim()+';':'');
    var lnk = e.link?' data-link="'+e.link+'"':'';

    var ea='';
    if(ft==='scroll-reveal') ea=' data-fx-sr="'+(fx.dir||'up')+'" data-fx-delay="'+(fx.delay||0)+'"';
    else if(ft==='hover-show') ea=' data-fx-hs-trigger="'+(fx.group||'g1')+'"';
    else if(ft==='hover-hide') ea=' data-fx-hs-content="'+(fx.group||'g1')+'"';
    else if(ft==='tab-trigger') ea=' data-fx-tab-trigger="'+(fx.group||'tabs1')+'" data-fx-tab-idx="'+(fx.idx||0)+'"';
    else if(ft==='tab-content') ea=' data-fx-tab-content="'+(fx.group||'tabs1')+'" data-fx-tab-idx="'+(fx.idx||0)+'"';
    else if(ft==='counter') ea=' data-fx-counter data-fx-from="'+(fx.from||0)+'" data-fx-to="'+(fx.to||100)+'" data-fx-dur="'+(fx.dur||2000)+'" data-fx-suf="'+esc(fx.suffix||'')+'"';
    else if(ft==='hover-zoom') ea=' data-fx-hz';
    else if(ft==='hover-expand') ea=' data-fx-expand data-fx-col-h="'+(fx.collapsedH||60)+'" data-fx-full-h="'+e.h+'"';
    else if(ft==='sticky') ea=' data-fx-sticky="1" data-fx-base-tf="'+_tf.trim()+'"';
    else if(ft==='parallax') ea=' data-fx-parallax="1" data-fx-speed="'+(fx.speed!=null?fx.speed:0.15)+'" data-fx-base-tf="'+_tf.trim()+'"';
    else if(ft==='scroll-scrub') ea=' data-fx-scrub="'+(fx.mode||'both')+'" data-fx-base-tf="'+_tf.trim()+'"';
    else if(FX_ANIM[ft]) ea=' data-fx-anim="'+FX_ANIM[ft]+'"'+(fx.delay?' data-fx-delay="'+fx.delay+'"':'');
    else if(FX_LOOP[ft]) ea=' data-fx-loop="'+FX_LOOP[ft]+'"';
    else if(FX_HOVER[ft]) ea=' data-fx-hover="'+FX_HOVER[ft]+'"';

    // 배경 영상 — 도형/이미지 요소를 영상 박스로
    if(ft==='bg-video' && (e.type==='shape'||e.type==='image')){
      var bvr=(e.type==='image'?(e.clip==='circle'?'50%':e.radius+'px'):(e.shape==='circle'?'50%':(e.radius||0)+'px'));
      return '<div class="el"'+lnk+' style="'+base+'overflow:hidden;border-radius:'+bvr+';background:'+(e.type==='shape'?(e.fill||'#000'):'#000')+'">'+bgVideoHtml(fx)+'</div>';
    }

    if(e.type==='text'){
      var va=e.valign||'middle';
      var ai=va==='top'?'flex-start':va==='bottom'?'flex-end':'center';
      var jc=e.align==='right'?'flex-end':e.align==='center'?'center':e.align==='justify'?'stretch':'flex-start';
      var s2=base+'display:flex;align-items:'+ai+';justify-content:'+jc+';';
      var deco=[]; if(e.underline)deco.push('underline'); if(e.strike)deco.push('line-through');
      var ta=e.align==='justify'?'justify':e.align;
      var inn="font-family:'"+e.fontFamily+"',sans-serif;font-weight:"+e.fontWeight+";font-size:"+e.fontSize+"px;color:"+e.color+";text-align:"+ta+";line-height:"+e.lineHeight+";letter-spacing:"+e.letterSpacing+"px;font-style:"+(e.italic?'italic':'normal')+";text-decoration:"+(deco.length?deco.join(' '):'none')+";"
        +(e.shadow?'text-shadow:2px 2px 4px rgba(0,0,0,.4);':'')
        +(e.indent?'padding-left:'+(e.indent*28)+'px;':'')
        +(e.vertical?'writing-mode:vertical-rl;':'');
      var hl=e.highlight;
      function hlw(s){ return hl?'<span style="background:'+hl+';box-decoration-break:clone;-webkit-box-decoration-break:clone;padding:0 .12em">'+s+'</span>':s; }
      var content;
      if(ft==='counter'){ content='0'+(fx.suffix||''); }
      else if(e.bullet&&e.bullet!=='none'){
        inn+='white-space:normal;';
        content=esc(e.text).split('\n').map(function(ln,i){
          var mk=e.bullet==='number'?(i+1)+'. ':'• ';
          return '<div style="display:flex;gap:.3em"><span style="flex-shrink:0">'+mk+'</span><span style="flex:1">'+hlw(ln||'&nbsp;')+'</span></div>';
        }).join('');
      } else { inn+='white-space:pre-wrap;'; content=hlw(esc(e.text)); }
      // 글자 한 자씩 등장
      var charsAttr='';
      if(ft==='char-reveal'){
        var unit=fx.mode==='word'?e.text.split(/(\s+)/):e.text.split('');
        var stg=fx.stagger!=null?fx.stagger:40, idx=0;
        content=unit.map(function(u){ if(/^\s+$/.test(u)) return esc(u); var d=(idx++)*stg; return '<span class="c" style="transition-delay:'+d+'ms">'+esc(u)+'</span>'; }).join('');
        charsAttr=' data-fx-chars="1"';
      }
      var afAttr=e.autofit?' data-autofit="1" data-af-max="'+e.fontSize+'"':'';
      return '<div class="el"'+lnk+ea+' style="'+s2+'"><div'+afAttr+charsAttr+' style="width:100%;'+inn+'">'+content+'</div></div>';
    } else if(e.type==='image'){
      var s3=base+'overflow:hidden;border-radius:'+(e.clip==='circle'?'50%':e.radius+'px')+';'+(e.borderW>0?'border:'+e.borderW+'px solid '+e.borderColor+';':'')+(e.shadow?'box-shadow:4px 5px 14px rgba(0,0,0,.28);':'');
      if(ft==='slider'){
        var slv=slStyleVars(fx);
        var slides=[e.src].concat(fx.slides||[]);
        var sImgs=slides.map(function(src){return '<img class="fx-sl-img" src="'+src+'">';}).join('');
        var sArrows=slv.arrows?'<button class="fx-sl-btn fx-sl-prev">'+slv.raw.prev+'</button><button class="fx-sl-btn fx-sl-next">'+slv.raw.next+'</button>':'';
        var sDots=slv.dots&&slides.length>1?'<div class="fx-sl-dots">'+slides.map(function(){return '<button class="fx-sl-dot"></button>';}).join('')+'</div>':'';
        return '<div class="el fx-slider"'+lnk+ea+' style="'+s3+slv.vars+'" data-sl-auto="'+(fx.auto!==false?'1':'0')+'" data-sl-iv="'+(fx.interval||3000)+'">'+sImgs+sArrows+sDots+'</div>';
      }
      return '<div class="el"'+lnk+ea+' style="'+s3+'"><img src="'+e.src+'" style="width:100%;height:100%;display:block;object-fit:'+e.fit+'"></div>';
    } else if(e.type==='shape'){
      if(e.shape==='line'||e.shape==='line-arrow'){
        var lcol=e.fill||'#333333', llw=Math.max(1,e.borderW||4);
        var lbar='<div style="position:absolute;left:0;right:0;top:50%;transform:translateY(-50%);height:'+llw+'px;background:'+lcol+'"></div>';
        var larr='';
        if(e.shape==='line-arrow'){ var ls=Math.max(7,llw*2.4); larr='<div style="position:absolute;right:0;top:50%;transform:translateY(-50%);width:0;height:0;border-top:'+ls+'px solid transparent;border-bottom:'+ls+'px solid transparent;border-left:'+(ls*1.5)+'px solid '+lcol+'"></div>'; }
        return '<div class="el"'+lnk+ea+' style="'+base+'">'+lbar+larr+'</div>';
      }
      var clip=shapeClipOf(e);
      var _op=(e.fillOpacity==null?100:e.fillOpacity), _fillBg=e.fill, _layerOp='';
      if(_op<100){ var _mm=/^#([0-9a-fA-F]{6})$/.exec(e.fill||''); if(_mm){ var _n=parseInt(_mm[1],16); _fillBg='rgba('+((_n>>16)&255)+','+((_n>>8)&255)+','+(_n&255)+','+(_op/100)+')'; } else { _layerOp='opacity:'+(_op/100)+';'; } }
      var bgStyle='position:absolute;inset:0;background:'+_fillBg+';'+_layerOp
        +(clip?'clip-path:'+clip+';':'border-radius:'+(e.shape==='circle'?'50%':e.radius+'px')+';')
        +(e.borderW>0&&!clip?'border:'+e.borderW+'px solid '+e.borderColor+';':'')
        +(e.shadow?(clip?'filter:drop-shadow(3px 4px 6px rgba(0,0,0,.3));':'box-shadow:4px 5px 14px rgba(0,0,0,.28);'):'');
      var stxt='';
      if(e.stext){
        var sva=e.stValign||'middle', sal=e.stAlign||'center';
        var ai=sva==='top'?'flex-start':sva==='bottom'?'flex-end':'center';
        var jc=sal==='left'?'flex-start':sal==='right'?'flex-end':'center';
        var tinn="font-family:'"+(e.stFont||'Noto Sans KR')+"',sans-serif;font-weight:"+(e.stWeight||700)+";font-size:"+(e.stSize||28)+"px;color:"+(e.stColor||'#ffffff')+";text-align:"+sal+";width:100%;line-height:1.25;white-space:pre-wrap";
        stxt='<div style="position:absolute;inset:0;display:flex;overflow:hidden;padding:8px;box-sizing:border-box;align-items:'+ai+';justify-content:'+jc+'"><div style="'+tinn+'">'+esc(e.stext)+'</div></div>';
      }
      return '<div class="el"'+lnk+ea+' style="'+base+'"><div style="'+bgStyle+'"></div>'+stxt+'</div>';
    }
    return '';
  }

  function buildSiteHtml(project, PAGE_W, opts){
    opts = opts || {};
    PAGE_W = PAGE_W||(project.pages[0]&&project.pages[0].w)||1200;
    // 상단 고정 바(직접 디자인한 헤더) 분리
    var headerPages = [], footerPages = [], contentPages = [];
    project.pages.forEach(function(p){ if(p.isHeader) headerPages.push(p); else if(p.isFooter) footerPages.push(p); else contentPages.push(p); });
    var firstId = contentPages[0]?contentPages[0].id:'';
    var roots = contentPages.filter(function(p){return !p.parentId;});
    var title = esc((roots[0]&&roots[0].name)||(contentPages[0]&&contentPages[0].name)||'홈페이지');
    // 직접 만든 상단 바가 있으면 자동 메뉴는 숨김
    var menu = headerPages.length ? '' : roots.filter(function(p){return p.id!==firstId;}).map(function(p){
      return '<a href="#" data-id="'+p.id+'" data-dev="'+(p.device||'both')+'">'+esc(p.name||'페이지')+'</a>';
    }).join('');

    var usedFx={};
    project.pages.forEach(function(p){
      p.elements.forEach(function(e){
        var t=(e.fx||{}).type||'';
        if(t==='scroll-reveal') usedFx['scroll-reveal']=1;
        if(t==='hover-show'||t==='hover-hide') usedFx['hover-show']=1;
        if(t==='tab-trigger'||t==='tab-content') usedFx['tab']=1;
        if(t==='counter') usedFx['counter']=1;
        if(t==='slider') usedFx['slider']=1;
        if(t==='hover-expand') usedFx['hover-expand']=1;
        if(t==='sticky') usedFx['sticky']=1;
        if(t==='char-reveal') usedFx['char-reveal']=1;
        if(t==='parallax') usedFx['parallax']=1;
        if(t==='scroll-scrub') usedFx['scroll-scrub']=1;
        if(FX_ANIM[t]) usedFx['anim']=1;
      });
    });

    function secsOf(p){ if(!p.sections||p.sections.length<2) return null; var s=p.sections.slice().sort(function(a,b){return a.y-b.y;}); s[0]=Object.assign({},s[0],{y:0}); return s; }
    var pagesHtml = contentPages.map(function(p){
      var disp=(p.id===firstId?'':'display:none');
      var wattr=' data-dev="'+(p.device||'both')+'" data-root="'+(p.parentId?'0':'1')+'"';
      var secs=secsOf(p);
      if(!secs){
        var els=p.elements.map(renderElStatic).join('');
        return '<section class="pgwrap" data-id="'+p.id+'"'+wattr+' style="'+disp+'"><div class="pg" data-pw="'+p.w+'" style="width:'+p.w+'px;height:'+p.h+'px;background:'+p.bg+'">'+els+'</div></section>';
      }
      var blocks=secs.map(function(sec,i){
        var top=sec.y, bot=(secs[i+1]?secs[i+1].y:p.h), hh=Math.max(1,bot-top);
        var inSec=p.elements.filter(function(e){ var cy=e.y+e.h/2; return cy>=top && cy<bot; });
        var els=inSec.map(function(e){ var c={}; for(var k in e)c[k]=e[k]; c.y=e.y-top; return renderElStatic(c); }).join('');
        var pgDiv='<div class="pg" data-pw="'+p.w+'" style="width:'+p.w+'px;height:'+hh+'px;background:'+p.bg+'">'+els+'</div>';
        if(sec.pin){ return '<div class="secblock pinned" data-sec-pinlen="'+(sec.pinLen||600)+'"><div class="pinwrap">'+pgDiv+'</div></div>'; }
        return '<div class="secblock">'+pgDiv+'</div>';
      }).join('');
      return '<section class="pgwrap" data-id="'+p.id+'"'+wattr+' style="'+disp+';overflow:visible">'+blocks+'</section>';
    }).join('');
    // 직접 디자인한 상단 고정 바 (디바이스별로 여러 개 가능 — JS가 화면폭에 맞는 것만 표시)
    var topbarHtml = headerPages.map(function(hp){
      var hEls=hp.elements.map(renderElStatic).join('');
      return '<div class="topbar" data-dev="'+(hp.device||'both')+'" style="display:none;background:'+hp.bg+'"><div class="pg topbar-pg" data-pw="'+hp.w+'" style="width:'+hp.w+'px;height:'+hp.h+'px;background:'+hp.bg+';transform-origin:top left">'+hEls+'</div></div>';
    }).join('');
    // 하단 바 — 모든 페이지 하단(고정X). 배경색은 화면 끝까지 이어짐(full-width)
    var footerHtml = footerPages.map(function(fp){
      var fEls=fp.elements.map(renderElStatic).join('');
      return '<div class="footerbar" data-dev="'+(fp.device||'both')+'" style="display:none;background:'+fp.bg+'"><div class="pg footer-pg" data-pw="'+fp.w+'" style="width:'+fp.w+'px;height:'+fp.h+'px;background:'+fp.bg+';transform-origin:top left">'+fEls+'</div></div>';
    }).join('');
    // 모바일 햄버거 메뉴 (좌측상단) — 편집 가능한 설정(항목·순서·색). 모바일에서만 표시.
    var hm = project.hamburger || {};
    var pageMap = {}; project.pages.forEach(function(p){ pageMap[p.id]=p; });
    var hmItems = (hm.items && hm.items.length) ? hm.items : roots.map(function(p){ return {name:p.name, link:p.id}; });
    var hmBg = hm.bg||'#ffffff', hmColor = hm.color||'#1a2b5c', hmBtnC = hm.btnColor||'#1a2b5c';
    var hmSize = hm.size||46, hmPos = hm.pos||'left';
    var hmBtnStyle = 'color:'+hmBtnC+';width:'+hmSize+'px;height:'+hmSize+'px;font-size:'+Math.round(hmSize*0.55)+'px;'+(hmPos==='right'?'right:10px;left:auto;':'left:10px;right:auto;');
    var drawerLinks = hmItems.map(function(it){ var pg=pageMap[it.link]; return '<a href="#" data-id="'+(it.link||'')+'" data-dev="'+((pg&&pg.device)||'both')+'">'+esc(it.name||'')+'</a>'; }).join('');
    var hamburgerHtml = '<button id="hmbtn" aria-label="메뉴" style="'+hmBtnStyle+'">☰</button><div id="hmoverlay"></div><nav id="hmdrawer" style="background:'+hmBg+';color:'+hmColor+'">'+drawerLinks+'</nav>';
    // 고정탭(플로팅) — 모든 페이지에 항상 표시
    var fixTabsHtml = (project.fixedTabs||[]).map(fixTabHtml).join('');

    var fxJs=Object.keys(usedFx).map(function(k){return FX_JS[k]||'';}).join('\n');
    var hasAf=false; project.pages.forEach(function(p){p.elements.forEach(function(e){if(e.type==='text'&&e.autofit)hasAf=true;});});
    if(hasAf) fxJs+=';(function(){function aft(){document.querySelectorAll("[data-autofit]").forEach(function(inner){var box=inner.parentNode;if(!box)return;var max=+inner.getAttribute("data-af-max")||parseFloat(getComputedStyle(inner).fontSize);var s=max;inner.style.fontSize=s+"px";var g=0;while(inner.scrollHeight>box.clientHeight+1&&s>6&&g<240){s-=1;inner.style.fontSize=s+"px";g++;}});}window.addEventListener("load",aft);window.addEventListener("resize",aft);aft();})();';
    // 고정탭: 맨위로 동작 + 디바이스별 표시/숨김
    if((project.fixedTabs||[]).length) fxJs+=';(function(){function dev(){return window.__forceDev||(innerWidth<=768?"mobile":"pc");}function upd(){var d=dev();document.querySelectorAll(".fixtab").forEach(function(el){var x=el.getAttribute("data-dev")||"both";el.style.display=(x==="both"||x===d)?"flex":"none";});}document.querySelectorAll("[data-fixtab=\\"top\\"]").forEach(function(el){el.addEventListener("click",function(){window.scrollTo({top:0,behavior:"smooth"});});});window.addEventListener("resize",upd);upd();})();';
    // 관성 부드러운 스크롤 (모바일/접근성 자동 예외)
    if(project.smoothScroll) fxJs+=';(function(){try{if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;}catch(_){}if("ontouchstart" in window||navigator.maxTouchPoints>0)return;var target=window.scrollY||0,running=false;function maxY(){return Math.max(0,document.documentElement.scrollHeight-window.innerHeight);}function loop(){var cur=window.scrollY,d=target-cur;if(Math.abs(d)<0.5){running=false;return;}window.scrollTo(0,cur+d*0.09);requestAnimationFrame(loop);}window.addEventListener("wheel",function(e){if(e.ctrlKey)return;e.preventDefault();target=Math.max(0,Math.min(maxY(),(running?target:window.scrollY)+e.deltaY));if(!running){running=true;requestAnimationFrame(loop);}},{passive:false});window.addEventListener("resize",function(){target=Math.max(0,Math.min(maxY(),target));});})();';

    // 사용된 폰트만 수집 → Google Fonts URL 동적 생성
    var _usedFonts=['Noto Sans KR'];
    project.pages.forEach(function(p){p.elements.forEach(function(e){if(e.type==='text'&&e.fontFamily&&_usedFonts.indexOf(e.fontFamily)<0)_usedFonts.push(e.fontFamily);});});
    var _GFW={'Noto Sans KR':'wght@300;400;500;700;900','Noto Serif KR':'wght@400;700','Nanum Gothic':'wght@400;700;800','Nanum Myeongjo':'wght@400;700;800','Gaegu':'wght@400;700','Sunflower':'wght@300;500;700','Dancing Script':'wght@400;500;700','Open Sans':'wght@300;400;500;700;800','Inter':'wght@300;400;500;700;900','Roboto':'wght@300;400;500;700;900','Lato':'wght@300;400;700;900','Montserrat':'wght@300;400;500;700;900','Poppins':'wght@300;400;500;700;900','Oswald':'wght@300;400;500;700','Raleway':'wght@300;400;500;700;900','Nunito':'wght@300;400;500;700;900','Quicksand':'wght@300;400;500;700','Playfair Display':'wght@400;500;700;900','Merriweather':'wght@300;400;700;900'};
    var _noW=['Nanum Pen Script','Black Han Sans','Do Hyeon','Jua','Gowun Dodum','Song Myung','Cute Font','East Sea Dokdo','Pacifico','Bebas Neue'];
    // 가져온 폰트 파일(@font-face base64)과 Google 폰트 분리
    var _fileFonts={}; try{ _fileFonts=JSON.parse(localStorage.getItem('hw_font_files')||'{}'); }catch(e){}
    var _ff='', _gFonts=[];
    _usedFonts.forEach(function(f){
      if(_fileFonts[f]){ var d=_fileFonts[f]; _ff+="@font-face{font-family:'"+f+"';src:url(data:"+(d.mime||'font/ttf')+";base64,"+d.b64+") format('"+d.fmt+"');font-display:swap;}"; }
      else _gFonts.push(f);
    });
    var _fontsUrl='https://fonts.googleapis.com/css2?'+_gFonts.map(function(f){var slug=f.replace(/ /g,'+');return 'family='+slug+(_noW.indexOf(f)>=0?'':':'+(_GFW[f]||'wght@300;400;500;700;900'));}).join('&')+'&display=swap';

    return '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+title+'</title>'
      +(_gFonts.length?'<link href="'+_fontsUrl+'" rel="stylesheet">':'')
      +(_ff?'<style>'+_ff+'</style>':'')
      +'<style>*{margin:0;box-sizing:border-box}body{background:#ffffff;font-family:\'Noto Sans KR\',sans-serif}'
      +'.topnav{position:sticky;top:0;z-index:100;background:#fff;box-shadow:0 1px 8px #0002;display:flex;gap:4px;justify-content:center;flex-wrap:wrap;padding:12px}'
      +'.topnav a{color:#1a2b5c;text-decoration:none;font-weight:700;font-size:15px;padding:7px 16px;border-radius:22px;transition:.15s;cursor:pointer}'
      +'.topnav a:hover{background:#eef3ff}.topnav a.active{background:#2b6cff;color:#fff}'
      +'.pgwrap{width:100%;overflow:hidden}'
      +'.pg{position:relative;overflow:hidden;transform-origin:top left}'
      +'.secblock{width:100%;overflow:hidden;position:relative}'
      +'.secblock.pinned{overflow:visible}'
      +'.pinwrap{position:sticky;overflow:hidden;width:100%}'
      +'.topbar{position:fixed;top:0;left:0;width:100%;z-index:300;overflow:hidden;box-shadow:0 1px 10px rgba(0,0,0,.12)}'
      +'.footerbar{width:100%;overflow:hidden}'
      +'#hmbtn{display:none;position:fixed;top:8px;left:10px;z-index:400;width:46px;height:46px;border:none;border-radius:8px;background:transparent;font-size:26px;line-height:1;cursor:pointer;color:#1a2b5c}'
      +'#hmbtn:active{background:rgba(0,0,0,.06)}'
      +'#hmdrawer{position:fixed;top:0;left:0;height:100%;width:74%;max-width:300px;background:#fff;z-index:420;transform:translateX(-100%);transition:transform .28s;box-shadow:2px 0 18px rgba(0,0,0,.25);padding:60px 0 20px;overflow-y:auto}'
      +'#hmdrawer.open{transform:none}'
      +'#hmdrawer a{display:block;padding:15px 24px;color:inherit;text-decoration:none;font-weight:700;font-size:'+(hm.itemSize||17)+'px;border-bottom:1px solid rgba(0,0,0,.06);border-radius:0;background:none}'
      +'#hmdrawer a.active{background:rgba(0,0,0,.05);color:inherit}'
      +'#hmdrawer a:active{background:#eef3ff}'
      +'#hmoverlay{position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:410;opacity:0;pointer-events:none;transition:opacity .28s}'
      +'#hmoverlay.open{opacity:1;pointer-events:auto}'
      +'.el{position:absolute}'
      +FX_CSS
      +'</style></head>'
      +'<body>'+topbarHtml+hamburgerHtml+(menu?'<nav class="topnav">'+menu+'</nav>':'')+pagesHtml+footerHtml+fixTabsHtml
      +'<script>var PW='+PAGE_W+';'+(opts.forceDevice?'window.__forceDev="'+opts.forceDevice+'";':'')
      +'function fit(){'
        +'var iw=window.innerWidth,HH=0;'
        +'document.querySelectorAll(".topbar").forEach(function(tb){if(tb.style.display==="none")return;var tp=tb.querySelector(".topbar-pg");var tw=tp.offsetWidth||PW;var ts=Math.min(1,iw/tw);tp.style.transform="scale("+ts+")";tp.style.marginLeft=Math.max(0,(iw-tw*ts)/2)+"px";HH=tp.offsetHeight*ts;tb.style.height=HH+"px";});'
        +'document.body.style.paddingTop=HH+"px";'
        +'document.querySelectorAll(".pgwrap").forEach(function(wr){'
          +'if(wr.style.display==="none")return;'
          +'wr.querySelectorAll(".pg").forEach(function(pg){'
            +'var pw=+pg.getAttribute("data-pw")||PW;var s=Math.min(1,iw/pw),ml=Math.max(0,(iw-pw*s)/2);window.__pgScale=s;'
            +'pg.style.transform="scale("+s+")";pg.style.marginLeft=ml+"px";'
            +'var holder=pg.parentNode,ph=pg.offsetHeight*s;'
            +'if(holder.className.indexOf("pinwrap")>=0){holder.style.height=ph+"px";holder.style.top=HH+"px";var blk=holder.parentNode,L=+blk.dataset.secPinlen||600;blk.style.height=(ph+L*s)+"px";}'
            +'else{holder.style.height=ph+"px";}'
          +'});'
        +'});'
        +'document.querySelectorAll(".footerbar").forEach(function(fb){if(fb.style.display==="none")return;var fp=fb.querySelector(".footer-pg");var fw=fp.offsetWidth||PW;var fs=Math.min(1,iw/fw);fp.style.transform="scale("+fs+")";fp.style.marginLeft=Math.max(0,(iw-fw*fs)/2)+"px";fb.style.height=(fp.offsetHeight*fs)+"px";});'
      +'}'
      +'function curDev(){return window.__forceDev||(window.innerWidth<=768?"mobile":"pc");}'
      +'function devOk(el){var x=el.getAttribute("data-dev")||"both";var d=curDev();return x==="both"||x===d;}'
      +'function pickBar(sel){var bars=[].slice.call(document.querySelectorAll(sel));if(!bars.length)return;var d=curDev(),spec=null,both=null;bars.forEach(function(b){var x=b.getAttribute("data-dev")||"both";if(x===d&&!spec)spec=b;if(x==="both"&&!both)both=b;});var ch=spec||both||bars[0];bars.forEach(function(b){b.style.display=(b===ch)?"block":"none";});}'
      +'function hmToggle(o){var dr=document.getElementById("hmdrawer"),ov=document.getElementById("hmoverlay");if(!dr)return;var open=(o!=null)?o:!dr.classList.contains("open");dr.classList.toggle("open",open);ov.classList.toggle("open",open);}'
      +'function show(id){'
        +'document.querySelectorAll(".pgwrap").forEach(function(wr){wr.style.display=(wr.getAttribute("data-id")===id)?"block":"none";});'
        +'document.querySelectorAll("nav a").forEach(function(a){a.classList.toggle("active",a.getAttribute("data-id")===id);});'
        +'fit();window.scrollTo(0,0);'
      +'}'
      +'function applyDevice(){'
        +'pickBar(".topbar");pickBar(".footerbar");'
        +'var d=curDev();'
        +'document.querySelectorAll("a[data-dev]").forEach(function(a){a.style.display=devOk(a)?"":"none";});'
        +'var hb=document.getElementById("hmbtn");if(hb)hb.style.display=(d==="mobile")?"block":"none";'
        +'if(d!=="mobile")hmToggle(false);'
        +'var cur=null;document.querySelectorAll(".pgwrap").forEach(function(w){if(w.style.display!=="none")cur=w;});'
        +'if(!cur||!devOk(cur)){var first=null;'
          +'document.querySelectorAll(".pgwrap[data-root=\\"1\\"]").forEach(function(w){if(!first&&devOk(w))first=w;});'
          +'if(!first)document.querySelectorAll(".pgwrap").forEach(function(w){if(!first&&devOk(w))first=w;});'
          +'if(first){show(first.getAttribute("data-id"));return;}}'
        +'fit();'
      +'}'
      +'document.querySelectorAll("nav a").forEach(function(a){a.addEventListener("click",function(ev){ev.preventDefault();show(a.getAttribute("data-id"));if(a.closest("#hmdrawer"))hmToggle(false);});});'
      +'var _hb=document.getElementById("hmbtn");if(_hb)_hb.addEventListener("click",function(){hmToggle();});'
      +'var _ho=document.getElementById("hmoverlay");if(_ho)_ho.addEventListener("click",function(){hmToggle(false);});'
      +'document.querySelectorAll("[data-link]").forEach(function(el){el.style.cursor="pointer";el.addEventListener("click",function(){show(el.getAttribute("data-link"));});});'
      +'window.addEventListener("resize",applyDevice);window.addEventListener("load",applyDevice);applyDevice();'
      +fxJs
      +'<\/script></body></html>';
  }

  window.SiteRender={buildSiteHtml:buildSiteHtml, renderElStatic:renderElStatic, slStyleVars:slStyleVars, fixTabResolve:fixTabResolve};
})();
