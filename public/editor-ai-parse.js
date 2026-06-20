// editor-ai-parse.js — AI 응답 JSON 견고 파서 (순수 함수, editor 상태 비의존 모듈).
// editor.js에서 import. 잘리거나 약간 깨진 JSON도 최대한 복구해서 파싱한다.
function parseAiJson(text){
  if(!text) return null;
  let t=String(text).replace(/```json/gi,'').replace(/```/g,'').trim();
  const i=t.indexOf('{'); if(i<0) return null; t=t.slice(i);
  const tryP=s=>{ try{ return JSON.parse(s); }catch(_){ return undefined; } };
  let r=tryP(t); if(r!==undefined) return r;
  // 1) 트레일링 콤마 제거
  let s=t.replace(/,(\s*[}\]])/g,'$1'); r=tryP(s); if(r!==undefined) return r;
  // 2) 스택으로 괄호 균형 맞추고, 잘린 꼬리 보정
  let stack=[],inStr=false,esc=false;
  for(let k=0;k<s.length;k++){ const ch=s[k];
    if(inStr){ if(esc)esc=false; else if(ch==='\\')esc=true; else if(ch==='"')inStr=false; continue; }
    if(ch==='"')inStr=true; else if(ch==='{'||ch==='[')stack.push(ch==='{'?'}':']'); else if(ch==='}'||ch===']')stack.pop();
  }
  let fixed=s;
  if(inStr) fixed+='"';                       // 문자열 도중 잘림
  fixed=fixed.replace(/[\s,]*$/,'');           // 꼬리 콤마/공백
  fixed=fixed.replace(/:\s*$/,':null');        // 콜론 직후 잘림
  fixed=fixed.replace(/,(\s*[}\]])/g,'$1');
  for(let k=stack.length-1;k>=0;k--) fixed+=stack[k];
  r=tryP(fixed); if(r!==undefined) return r;
  // 3) elements 배열의 마지막 완성 객체까지만 살리기
  const em=s.match(/"elements"\s*:\s*\[/);
  if(em){
    const arrStart=em.index+em[0].length;
    let depth=0,inS=false,es=false,lastObjEnd=-1;
    for(let k=arrStart;k<s.length;k++){ const ch=s[k];
      if(inS){ if(es)es=false; else if(ch==='\\')es=true; else if(ch==='"')inS=false; continue; }
      if(ch==='"')inS=true; else if(ch==='{'||ch==='[')depth++; else if(ch==='}'||ch===']'){ depth--; if(depth===0) lastObjEnd=k; }
    }
    if(lastObjEnd>0){ const cand=s.slice(0,lastObjEnd+1)+']}'; r=tryP(cand); if(r!==undefined) return r; }
  }
  return null;
}

export { parseAiJson };
