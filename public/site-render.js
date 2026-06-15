/* 발행 렌더링 공유 모듈 — 편집기(미리보기)와 공개 페이지(index.html)가 동일하게 사용.
   순수 함수: project 객체 → 완성된 사이트 HTML 문자열. */
(function(){
  function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  function renderElStatic(e){
    var style='left:'+e.x+'px;top:'+e.y+'px;width:'+e.w+'px;height:'+e.h+'px;'+(e.rot?'transform:rotate('+e.rot+'deg);':'');
    var link = e.link? ' data-link="'+e.link+'"':'';
    if(e.type==='text'){
      style+='display:flex;align-items:center;justify-content:'+(e.align==='left'?'flex-start':e.align==='right'?'flex-end':'center')+';';
      var inner="font-family:'"+e.fontFamily+"',sans-serif;font-weight:"+e.fontWeight+";font-size:"+e.fontSize+"px;color:"+e.color+";text-align:"+e.align+";line-height:"+e.lineHeight+";letter-spacing:"+e.letterSpacing+"px;font-style:"+(e.italic?'italic':'normal')+";text-decoration:"+(e.underline?'underline':'none')+";white-space:pre-wrap";
      return '<div class="el"'+link+' style="'+style+'"><div style="width:100%;'+inner+'">'+escapeHtml(e.text)+'</div></div>';
    }else if(e.type==='image'){
      style+='overflow:hidden;border-radius:'+(e.clip==='circle'?'50%':e.radius+'px')+';'+(e.borderW>0?'border:'+e.borderW+'px solid '+e.borderColor+';':'');
      return '<div class="el"'+link+' style="'+style+'"><img src="'+e.src+'" style="object-fit:'+e.fit+'"></div>';
    }else if(e.type==='shape'){
      style+='background:'+e.fill+';border-radius:'+(e.shape==='circle'?'50%':e.radius+'px')+';'+(e.borderW>0?'border:'+e.borderW+'px solid '+e.borderColor+';':'');
      return '<div class="el"'+link+' style="'+style+'"></div>';
    }
    return '';
  }

  // project + 기준 폭 → 완성 사이트 HTML(상단 탭=루트 페이지, 링크 클릭 이동, 반응형 스케일)
  function buildSiteHtml(project, PAGE_W){
    PAGE_W = PAGE_W || (project.pages[0] && project.pages[0].w) || 1200;
    var firstId = project.pages[0] ? project.pages[0].id : '';
    var roots = project.pages.filter(function(p){ return !p.parentId; });
    var siteTitle = escapeHtml((roots[0] && roots[0].name) || (project.pages[0] && project.pages[0].name) || '홈페이지');
    var menu = roots.map(function(p){ return '<a href="#" data-id="'+p.id+'" class="'+(p.id===firstId?'active':'')+'">'+escapeHtml(p.name||'페이지')+'</a>'; }).join('');
    var pagesHtml = project.pages.map(function(p){
      var els = p.elements.map(renderElStatic).join('');
      return '<section class="pgwrap" data-id="'+p.id+'" style="'+(p.id===firstId?'':'display:none')+'"><div class="pg" style="width:'+p.w+'px;height:'+p.h+'px;background:'+p.bg+'">'+els+'</div></section>';
    }).join('');
    return '<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>'+siteTitle+'</title>'
      + '<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;700;900&family=Nanum+Gothic:wght@400;700;800&family=Nanum+Myeongjo:wght@400;700;800&family=Black+Han+Sans&family=Do+Hyeon&family=Jua&family=Gowun+Dodum&family=Gaegu:wght@400;700&family=Song+Myung&display=swap" rel="stylesheet">'
      + '<style>*{margin:0;box-sizing:border-box}body{background:#eee;font-family:\'Noto Sans KR\',sans-serif}'
      + 'nav{position:sticky;top:0;z-index:100;background:#fff;box-shadow:0 1px 8px #0002;display:flex;gap:4px;justify-content:center;flex-wrap:wrap;padding:12px}'
      + 'nav a{color:#1a2b5c;text-decoration:none;font-weight:700;font-size:15px;padding:7px 16px;border-radius:22px;transition:.15s;cursor:pointer}'
      + 'nav a:hover{background:#eef3ff}nav a.active{background:#2b6cff;color:#fff}'
      + '.pgwrap{display:flex;justify-content:center}.pg{position:relative;overflow:hidden;transform-origin:top center}'
      + '.el{position:absolute}.el img{width:100%;height:100%;display:block}</style></head>'
      + '<body><nav>'+menu+'</nav>'+pagesHtml
      + '<script>var PW='+PAGE_W+';'
      + 'function fit(){var s=Math.min(1,window.innerWidth/PW);document.querySelectorAll(".pgwrap").forEach(function(wr){var pg=wr.querySelector(".pg");pg.style.transform="scale("+s+")";if(wr.style.display!=="none")wr.style.height=(pg.offsetHeight*s)+"px";});}'
      + 'function show(id){var found=false;document.querySelectorAll(".pgwrap").forEach(function(wr){var on=wr.getAttribute("data-id")===id;wr.style.display=on?"flex":"none";if(on)found=true;});document.querySelectorAll("nav a").forEach(function(a){a.classList.toggle("active",a.getAttribute("data-id")===id);});if(found){fit();window.scrollTo(0,0);}}'
      + 'document.querySelectorAll("nav a").forEach(function(a){a.addEventListener("click",function(ev){ev.preventDefault();show(a.getAttribute("data-id"));});});'
      + 'document.querySelectorAll("[data-link]").forEach(function(el){el.style.cursor="pointer";el.addEventListener("click",function(){show(el.getAttribute("data-link"));});});'
      + 'window.addEventListener("resize",fit);window.addEventListener("load",fit);fit();'
      + '<\/script></body></html>';
  }

  window.SiteRender = { buildSiteHtml: buildSiteHtml, renderElStatic: renderElStatic };
})();
