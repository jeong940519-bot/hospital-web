/* 발행 렌더링 공유 모듈 — 편집기(미리보기)와 공개 페이지(index.html)가 동일하게 사용. */
(function(){
  function esc(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

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
    '.fx-sl-btn{position:absolute;top:50%;transform:translateY(-50%);background:rgba(0,0,0,.45);color:#fff;border:none;border-radius:50%;width:38px;height:38px;font-size:22px;line-height:1;cursor:pointer;z-index:10;display:flex;align-items:center;justify-content:center}',
    '.fx-sl-prev{left:8px}.fx-sl-next{right:8px}',
    '.fx-sl-dots{position:absolute;bottom:10px;left:50%;transform:translateX(-50%);display:flex;gap:7px;z-index:10}',
    '.fx-sl-dot{width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,.45);cursor:pointer;border:none;padding:0;transition:background .2s}',
    '.fx-sl-dot.on{background:#fff}',
    '[data-fx-hz]{transition:transform .3s;transform-origin:center center}',
    '[data-fx-hz]:hover{transform:scale(1.07)!important}',
    '[data-fx-expand]{overflow:hidden;transition:height .42s cubic-bezier(.4,0,.2,1),box-shadow .3s}',
    '[data-fx-expand]:hover{box-shadow:0 8px 32px rgba(0,0,0,.18)}',
    '[data-fx-sticky]{will-change:transform;z-index:600}',
  ].join('');

  /* ── 효과 JS 블록 (사용된 것만 삽입) ── */
  var FX_JS = {
    'scroll-reveal':'(function(){var io=new IntersectionObserver(function(en){en.forEach(function(e){if(e.isIntersecting){e.target.classList.add("fx-sr-in");io.unobserve(e.target);}});},{threshold:0.12});document.querySelectorAll("[data-fx-sr]").forEach(function(el){el.style.transitionDelay=(el.dataset.fxDelay||0)+"ms";io.observe(el);});})();',
    'hover-show':'(function(){var G={};function g(k){return G[k]||(G[k]={tr:[],ct:[]});}document.querySelectorAll("[data-fx-hs-trigger]").forEach(function(t){g(t.dataset.fxHsTrigger).tr.push(t);});document.querySelectorAll("[data-fx-hs-content]").forEach(function(c){g(c.dataset.fxHsContent).ct.push(c);});Object.keys(G).forEach(function(k){var gr=G[k];function sh(){gr.ct.forEach(function(c){c.style.opacity="1";c.style.pointerEvents="auto";});}function hi(){gr.ct.forEach(function(c){c.style.opacity="0";c.style.pointerEvents="none";});}gr.tr.forEach(function(t){t.addEventListener("mouseenter",sh);t.addEventListener("mouseleave",hi);});gr.ct.forEach(function(c){c.addEventListener("mouseenter",sh);c.addEventListener("mouseleave",hi);});hi();});})();',
    'tab':'(function(){var G={};function g(k){return G[k]||(G[k]={tr:[],ct:[]});}document.querySelectorAll("[data-fx-tab-trigger]").forEach(function(t){var gr=g(t.dataset.fxTabTrigger),i=+(t.dataset.fxTabIdx||0);gr.tr[i]=t;t.style.cursor="pointer";});document.querySelectorAll("[data-fx-tab-content]").forEach(function(c){var gr=g(c.dataset.fxTabContent),i=+(c.dataset.fxTabIdx||0);gr.ct[i]=c;});Object.keys(G).forEach(function(k){var gr=G[k];function act(n){gr.tr.forEach(function(t,i){if(t){t.style.opacity=i===n?"1":"0.5";t.style.outline=i===n?"2px solid currentColor":"none";}});gr.ct.forEach(function(c,i){if(c)c.style.display=i===n?"block":"none";});}gr.tr.forEach(function(t,i){if(t)t.addEventListener("click",function(){act(i);});});act(0);});})();',
    'counter':'(function(){var io=new IntersectionObserver(function(en){en.forEach(function(e){if(!e.isIntersecting)return;var el=e.target,from=+(el.dataset.fxFrom||0),to=+(el.dataset.fxTo||100),dur=+(el.dataset.fxDur||2000),suf=el.dataset.fxSuf||"",inner=el.querySelector("div")||el;io.unobserve(el);var s=null;(function step(ts){if(!s)s=ts;var p=Math.min(1,(ts-s)/dur);inner.textContent=Math.round(from+(to-from)*p).toLocaleString()+suf;if(p<1)requestAnimationFrame(step);})(performance.now());});},{threshold:0.5});document.querySelectorAll("[data-fx-counter]").forEach(function(el){io.observe(el);});})();',
    'slider':'(function(){document.querySelectorAll(".fx-slider").forEach(function(sl){var imgs=sl.querySelectorAll(".fx-sl-img"),dots=sl.querySelectorAll(".fx-sl-dot"),cur=0,auto=sl.dataset.slAuto==="1",iv=+(sl.dataset.slIv||3000),tm=null;function go(n){n=(n+imgs.length)%imgs.length;imgs[cur].style.opacity="0";if(dots[cur])dots[cur].classList.remove("on");cur=n;imgs[cur].style.opacity="1";if(dots[cur])dots[cur].classList.add("on");}function rst(){clearInterval(tm);if(auto)tm=setInterval(function(){go(cur+1);},iv);}sl.querySelectorAll(".fx-sl-prev").forEach(function(b){b.addEventListener("click",function(){go(cur-1);rst();});});sl.querySelectorAll(".fx-sl-next").forEach(function(b){b.addEventListener("click",function(){go(cur+1);rst();});});dots.forEach(function(d,i){d.addEventListener("click",function(){go(i);rst();});});go(0);rst();});})();',
    'hover-expand':'(function(){document.querySelectorAll("[data-fx-expand]").forEach(function(el){var col=+(el.dataset.fxColH||60),full=+(el.dataset.fxFullH||200);el.style.height=col+"px";el.style.cursor="pointer";el.addEventListener("mouseenter",function(){el.style.height=full+"px";});el.addEventListener("mouseleave",function(){el.style.height=col+"px";});});})();',
    'sticky':'(function(){var els=[].slice.call(document.querySelectorAll("[data-fx-sticky]"));if(!els.length)return;function upd(){var s=window.__pgScale||1,y=window.scrollY||window.pageYOffset||0;els.forEach(function(el){var b=el.getAttribute("data-fx-base-tf")||"";el.style.transform=(b?b+" ":"")+"translateY("+(y/s)+"px)";});}window.addEventListener("scroll",upd,{passive:true});window.addEventListener("resize",upd);upd();})();'
  };

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
      return '<div class="el"'+lnk+ea+' style="'+s2+'"><div style="width:100%;'+inn+'">'+content+'</div></div>';
    } else if(e.type==='image'){
      var s3=base+'overflow:hidden;border-radius:'+(e.clip==='circle'?'50%':e.radius+'px')+';'+(e.borderW>0?'border:'+e.borderW+'px solid '+e.borderColor+';':'')+(e.shadow?'box-shadow:4px 5px 14px rgba(0,0,0,.28);':'');
      if(ft==='slider'){
        var slides=[e.src].concat(fx.slides||[]);
        var sImgs=slides.map(function(src){return '<img class="fx-sl-img" src="'+src+'">';}).join('');
        var sArrows=fx.arrows!==false?'<button class="fx-sl-btn fx-sl-prev">&#8249;</button><button class="fx-sl-btn fx-sl-next">&#8250;</button>':'';
        var sDots=fx.dots!==false&&slides.length>1?'<div class="fx-sl-dots">'+slides.map(function(){return '<button class="fx-sl-dot"></button>';}).join('')+'</div>':'';
        return '<div class="el fx-slider"'+lnk+ea+' style="'+s3+'" data-sl-auto="'+(fx.auto!==false?'1':'0')+'" data-sl-iv="'+(fx.interval||3000)+'">'+sImgs+sArrows+sDots+'</div>';
      }
      return '<div class="el"'+lnk+ea+' style="'+s3+'"><img src="'+e.src+'" style="width:100%;height:100%;display:block;object-fit:'+e.fit+'"></div>';
    } else if(e.type==='shape'){
      var clip=SHAPE_CLIP[e.shape]||'';
      var bgStyle='position:absolute;inset:0;background:'+e.fill+';'
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

  function buildSiteHtml(project, PAGE_W){
    PAGE_W = PAGE_W||(project.pages[0]&&project.pages[0].w)||1200;
    var firstId = project.pages[0]?project.pages[0].id:'';
    var roots = project.pages.filter(function(p){return !p.parentId;});
    var title = esc((roots[0]&&roots[0].name)||(project.pages[0]&&project.pages[0].name)||'홈페이지');
    // 홈(첫 루트 페이지)은 상단 탭에서 숨김 — 로고/직접 만든 탭으로 이동
    var menu = roots.filter(function(p){return p.id!==firstId;}).map(function(p){
      return '<a href="#" data-id="'+p.id+'">'+esc(p.name||'페이지')+'</a>';
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
      });
    });

    var pagesHtml = project.pages.map(function(p){
      var els=p.elements.map(renderElStatic).join('');
      return '<section class="pgwrap" data-id="'+p.id+'" style="'+(p.id===firstId?'':'display:none')+'"><div class="pg" style="width:'+p.w+'px;height:'+p.h+'px;background:'+p.bg+'">'+els+'</div></section>';
    }).join('');

    var fxJs=Object.keys(usedFx).map(function(k){return FX_JS[k]||'';}).join('\n');

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
      +'<style>*{margin:0;box-sizing:border-box}body{background:#eee;font-family:\'Noto Sans KR\',sans-serif}'
      +'nav{position:sticky;top:0;z-index:100;background:#fff;box-shadow:0 1px 8px #0002;display:flex;gap:4px;justify-content:center;flex-wrap:wrap;padding:12px}'
      +'nav a{color:#1a2b5c;text-decoration:none;font-weight:700;font-size:15px;padding:7px 16px;border-radius:22px;transition:.15s;cursor:pointer}'
      +'nav a:hover{background:#eef3ff}nav a.active{background:#2b6cff;color:#fff}'
      +'.pgwrap{width:100%;overflow:hidden}'
      +'.pg{position:relative;overflow:hidden;transform-origin:top left}'
      +'.el{position:absolute}'
      +FX_CSS
      +'</style></head>'
      +'<body>'+(menu?'<nav>'+menu+'</nav>':'')+pagesHtml
      +'<script>var PW='+PAGE_W+';'
      +'function fit(){'
        +'var s=Math.min(1,window.innerWidth/PW);window.__pgScale=s;'
        +'document.querySelectorAll(".pgwrap").forEach(function(wr){'
          +'var pg=wr.querySelector(".pg");'
          +'pg.style.transform="scale("+s+")";'
          +'pg.style.marginLeft=Math.max(0,(window.innerWidth-PW*s)/2)+"px";'
          +'if(wr.style.display!=="none")wr.style.height=(pg.offsetHeight*s)+"px";'
        +'});'
      +'}'
      +'function show(id){'
        +'document.querySelectorAll(".pgwrap").forEach(function(wr){'
          +'var on=wr.getAttribute("data-id")===id;'
          +'wr.style.display=on?"block":"none";'
        +'});'
        +'document.querySelectorAll("nav a").forEach(function(a){a.classList.toggle("active",a.getAttribute("data-id")===id);});'
        +'fit();window.scrollTo(0,0);'
      +'}'
      +'document.querySelectorAll("nav a").forEach(function(a){a.addEventListener("click",function(ev){ev.preventDefault();show(a.getAttribute("data-id"));});});'
      +'document.querySelectorAll("[data-link]").forEach(function(el){el.style.cursor="pointer";el.addEventListener("click",function(){show(el.getAttribute("data-link"));});});'
      +'window.addEventListener("resize",fit);window.addEventListener("load",fit);fit();'
      +fxJs
      +'<\/script></body></html>';
  }

  window.SiteRender={buildSiteHtml:buildSiteHtml, renderElStatic:renderElStatic};
})();
