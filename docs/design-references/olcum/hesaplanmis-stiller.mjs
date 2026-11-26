import { chromium } from 'playwright';
import fs from 'node:fs';
const out = process.argv[2];
const targets = {home:'https://substack.com/', chat:'https://substack.com/chat', inbox:'https://substack.com/inbox', explore:'https://substack.com/explore', signin:'https://substack.com/sign-in'};
const vps = {m:[390,844],d:[1440,900]};
const grab = () => {
  const props=['fontFamily','fontSize','fontWeight','lineHeight','letterSpacing','color','backgroundColor','borderRadius','border','padding','margin','height','width','boxShadow','textTransform'];
  const res=[]; const seen=new Set();
  const all=[...document.querySelectorAll('button,a,input,h1,h2,h3,h4,p,span,div,li,nav,aside,header,svg')];
  for(const el of all){
    const r=el.getBoundingClientRect(); if(r.width<8||r.height<8||r.top>document.documentElement.clientHeight*1.2) continue;
    const cs=getComputedStyle(el);
    const txt=(el.innerText||el.placeholder||'').trim().slice(0,30);
    const interesting = el.matches('button,a,input,h1,h2,h3,h4,nav,aside,header') || cs.boxShadow!=='none' || (cs.borderRadius!=='0px' && cs.backgroundColor!=='rgba(0, 0, 0, 0)');
    if(!interesting) continue;
    const o={tag:el.tagName.toLowerCase(),cls:(el.className&&el.className.baseVal===undefined?String(el.className):'').slice(0,60),txt,role:el.getAttribute('role')||'',w:Math.round(r.width),h:Math.round(r.height),x:Math.round(r.x),y:Math.round(r.y)};
    for(const p of props) o[p]=cs[p];
    const key=[o.tag,o.txt,o.w,o.h].join('|'); if(seen.has(key)) continue; seen.add(key);
    res.push(o);
  }
  // css vars
  const vars={};
  for(const sh of document.styleSheets){ try{ for(const rule of sh.cssRules){ if(rule.style && (rule.selectorText===':root'||rule.selectorText==='html'||rule.selectorText==='body')){ for(const n of rule.style){ if(n.startsWith('--')) vars[n]=rule.style.getPropertyValue(n).trim(); } } } }catch(e){} }
  return {els:res.slice(0,400),vars,fonts:[...document.fonts].map(f=>f.family+' '+f.weight).slice(0,30),body:{bg:getComputedStyle(document.body).backgroundColor,font:getComputedStyle(document.body).fontFamily,size:getComputedStyle(document.body).fontSize}};
};
(async () => {
  const b = await chromium.launch();
  for (const [vn,[w,h]] of Object.entries(vps)) {
    const ctx = await b.newContext({viewport:{width:w,height:h}});
    const p = await ctx.newPage();
    for (const [n,u] of Object.entries(targets)) {
      await p.goto(u,{waitUntil:'networkidle',timeout:45000}).catch(()=>{});
      await p.waitForTimeout(1200);
      const d = await p.evaluate(grab);
      fs.writeFileSync(`${out}/${n}-${vn}.json`, JSON.stringify(d,null,1));
      console.log(n,vn,d.els.length,Object.keys(d.vars).length);
    }
    await ctx.close();
  }
  await b.close();
})();
