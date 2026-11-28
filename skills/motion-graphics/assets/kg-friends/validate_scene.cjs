// Read the real scene in Chrome; do not duplicate graph answers in this test.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const {pathToFileURL} = require('node:url');
const {chromium} = require('playwright');

(async () => {
  const output = path.resolve(process.argv[2] || '.');
  const browser = await chromium.launch({channel:'chrome', headless:true});
  try {
    const page = await browser.newPage({viewport:{width:1080,height:1350}});
    await page.goto(pathToFileURL(path.join(__dirname, 'scene.html')).href);
    await page.evaluate(() => document.fonts.ready);
    const metadata = JSON.parse(fs.readFileSync(path.join(__dirname, 'composition.json')));
    const records = [];
    for (const {time} of metadata.keyframes) {
      records.push(await page.evaluate(t => {
        const state = window.renderAt(t), ctx = document.createElement('canvas').getContext('2d');
        const boxes = [...document.querySelectorAll('#canvas text')].map(n => {
          const style = getComputedStyle(n);
          ctx.font = style.fontWeight+' '+style.fontSize+' '+style.fontFamily;
          const m = ctx.measureText(n.textContent), matrix = n.getCTM(), anchor = n.getAttribute('text-anchor');
          const anchorOffset = anchor === 'middle' ? m.width / 2 : anchor === 'end' ? m.width : 0;
          const x = +n.getAttribute('x') - anchorOffset, y = +n.getAttribute('y');
          const a = new DOMPoint(x-m.actualBoundingBoxLeft,y-m.actualBoundingBoxAscent).matrixTransform(matrix);
          const z = new DOMPoint(x+m.actualBoundingBoxRight,y+m.actualBoundingBoxDescent).matrixTransform(matrix);
          let opacity = 1, node = n;
          while (node && node !== document) {opacity *= Number(node.getAttribute?.('opacity') ?? 1); node = node.parentNode;}
          return {id:n.id,text:n.textContent,opacity,x:a.x,y:a.y,width:z.x-a.x,height:z.y-a.y,fontSize:parseFloat(style.fontSize)*matrix.a};
        });
        return {time:t,state,boxes};
      }, time));
    }
    const outside = records.flatMap(r => r.boxes.filter(b => b.opacity > .98 && (b.x<32 || b.y<24 || b.x+b.width>1048 || b.y+b.height>1326)).map(b => ({time:r.time,...b})));
    if (outside.length) throw new Error('Visible text outside safe area: '+JSON.stringify(outside));
    const claireMinimum = Math.min(...records.flatMap(r => r.boxes.filter(b => b.id==='person-Claire').map(b => b.fontSize)));
    if (claireMinimum < 45) throw new Error('Claire smaller than 45px');
    const first = records[0].state, final = records.at(-1).state;
    if (first.phase!=='question' || first.people.length!==6) throw new Error('Opening context missing');
    if (JSON.stringify(final.answer)!==JSON.stringify(final.sqlAnswer)) throw new Error('Final graph and SQL disagree');
    if (!final.sqlRowsRemain || final.duplicateMerge.to!==1) throw new Error('Final SQL rows or duplicate merge missing');
    const hashes = [];
    for (const t of [0,8.5,17.6,22.4,17.6,8.5,0,22.4]) {
      await page.evaluate(t => window.renderAt(t), t);
      hashes.push({t,hash:crypto.createHash('sha256').update(await page.locator('#canvas').screenshot()).digest('hex')});
    }
    for (const {t,hash} of hashes) if (hashes.find(h=>h.t===t).hash!==hash) throw new Error('Raster depends on call order at '+t);
    const report = {passed:true,checkedKeyframes:records.length,safeBounds:true,claireMinimumPx:claireMinimum,callOrderIndependent:true,records};
    fs.mkdirSync(output,{recursive:true});
    fs.writeFileSync(path.join(output,'semantic-validation.json'),JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({passed:true,checkedKeyframes:records.length,safeBounds:true,claireMinimumPx:claireMinimum,callOrderIndependent:true}));
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
