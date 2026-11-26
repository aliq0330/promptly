const { chromium } = require('playwright');
const out = process.argv[2];
const pages = {home:'https://substack.com/', chat:'https://substack.com/chat', inbox:'https://substack.com/inbox', signin:'https://substack.com/sign-in', explore:'https://substack.com/explore'};
const vps = {m:[390,844],t:[820,1180],d:[1440,900]};
(async () => {
  const b = await chromium.launch();
  for (const [vn,[w,h]] of Object.entries(vps)) {
    const ctx = await b.newContext({viewport:{width:w,height:h}, deviceScaleFactor:1});
    const p = await ctx.newPage();
    for (const [n,u] of Object.entries(pages)) {
      try {
        await p.goto(u,{waitUntil:'networkidle',timeout:45000}).catch(()=>{});
        await p.waitForTimeout(1500);
        await p.screenshot({path:`${out}/${n}-${vn}.png`, fullPage:false});
        console.log('ok',n,vn,p.url());
      } catch(e){ console.log('ERR',n,vn,e.message.slice(0,100)); }
    }
    await ctx.close();
  }
  await b.close();
})();
