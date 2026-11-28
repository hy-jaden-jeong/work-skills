#!/usr/bin/env node
// Capture the editable HTML's .card elements after a strict DOM preflight.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

function options(argv) {
  const opt = { width:1080, height:1350, 'min-readable':42, 'font-family':'Card Sans', 'expect-text':[] };
  const allowed = ['input','out','browser','width','height','expected-cards','min-readable','font-family','expect-text'];
  for (let i=0; i<argv.length; i++) {
    const key=argv[i].replace(/^--/, '');
    if (!argv[i].startsWith('--') || !allowed.includes(key) || !argv[i+1]) throw new Error('Usage: export_cards.cjs --input cards.html --out png-directory [--browser chrome] [--expected-cards N] [--width W --height H] [--min-readable PX] [--font-family FAMILY] [--expect-text TEXT]');
    if (key==='expect-text') opt[key].push(argv[++i]); else opt[key]=argv[++i];
  }
  if (!opt.input || !opt.out) throw new Error('--input and --out are required');
  for (const key of ['width','height','expected-cards','min-readable']) {
    if (opt[key]!==undefined && !/^[1-9]\d*$/.test(String(opt[key]))) throw new Error(`--${key} must be a positive integer`);
    if (opt[key]!==undefined) opt[key]=Number(opt[key]);
  }
  return opt;
}
function browserPath(explicit) {
  if (explicit) { if (!fs.existsSync(explicit)) throw new Error(`Browser not found: ${explicit}`); return explicit; }
  const candidates = process.platform==='darwin'
    ? ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome','/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge']
    : process.platform==='win32'
      ? [path.join(process.env.PROGRAMFILES||'', 'Google/Chrome/Application/chrome.exe')]
      : ['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'];
  return candidates.find(p=>fs.existsSync(p));
}
async function main() {
  const opt=options(process.argv.slice(2)), input=path.resolve(opt.input), out=path.resolve(opt.out);
  if (!fs.existsSync(input)) throw new Error(`HTML not found: ${input}`);
  if (fs.existsSync(out) && fs.readdirSync(out).some(name=>/^card-\d+\.png$/.test(name))) throw new Error('Output already contains card PNGs; use a fresh directory or explicitly remove the previous set.');
  let chromium;
  try { ({chromium}=require('playwright')); } catch { throw new Error('Install playwright or set NODE_PATH to its node_modules directory.'); }
  fs.mkdirSync(out,{recursive:true});
  const browser=await chromium.launch({headless:true,executablePath:browserPath(opt.browser)});
  try {
    const page=await browser.newPage({viewport:{width:opt.width+100,height:opt.height+100},deviceScaleFactor:1});
    const runtimeErrors=[];
    page.on('pageerror',e=>runtimeErrors.push(e.message));
    page.on('requestfailed',r=>runtimeErrors.push(`${r.url()}: ${r.failure()?.errorText}`));
    await page.goto(pathToFileURL(input).href,{waitUntil:'networkidle'});
    await page.addStyleTag({content:'*,*::before,*::after { animation:none !important; transition:none !important; }'});
    const report=await page.evaluate(async opt=>{
      await document.fonts.ready;
      await Promise.all(Array.from(document.images,img=>img.complete ? Promise.resolve() : new Promise(resolve=>{
        img.addEventListener('load',resolve,{once:true}); img.addEventListener('error',resolve,{once:true});
      })));
      const issues=[], sheets=Array.from(document.querySelectorAll('.card'));
      const fontFamily=opt['font-family'], korean=/[\u1100-\u11ff\u3130-\u318f\uac00-\ud7a3]/;
      const hasKorean=sheets.some(s=>korean.test(s.innerText));
      if (hasKorean) {
        try { const loaded=await document.fonts.load(`44px "${fontFamily}"`,'한글 읽기'); if (!loaded.length) issues.push({type:'missing-korean-font',family:fontFamily}); }
        catch(e) { issues.push({type:'missing-korean-font',family:fontFamily,error:e.message}); }
      }
      await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
      const fontFaces=Array.from(document.fonts,f=>({family:f.family.replace(/["']/g,''),weight:f.weight,status:f.status}));
      const cards=sheets.map((sheet,index)=>{
        const bound=sheet.getBoundingClientRect(), card=index+1;
        const safe=Number(sheet.dataset.safe||72);
        const issue=(type,el,extra={})=>issues.push({card,type,element:el?.tagName,class:el?.getAttribute('class'),...extra});
        if (!Number.isFinite(safe) || safe<0 || safe*2>=Math.min(bound.width,bound.height)) issue('invalid-safe-margin',sheet,{safe});
        if (Math.abs(bound.width-opt.width)>.5 || Math.abs(bound.height-opt.height)>.5) issue('card-size',sheet,{actual:[bound.width,bound.height],expected:[opt.width,opt.height]});
        if (sheet.scrollWidth>sheet.clientWidth+2 || sheet.scrollHeight>sheet.clientHeight+2) issue('card-overflow',sheet);
        const inside=(rect,margin)=>rect.left>=bound.left+margin-2 && rect.right<=bound.right-margin+2 && rect.top>=bound.top+margin-2 && rect.bottom<=bound.bottom-margin+2;
        for (const el of sheet.querySelectorAll('*')) {
          if (['SCRIPT','STYLE'].includes(el.tagName)) continue;
          const style=getComputedStyle(el),rect=el.getBoundingClientRect();
          if (style.display==='none' || style.visibility==='hidden' || !rect.width || !rect.height) continue;
          if (!inside(rect,0)) issue('outside-card',el);
          const isBleed=!!el.closest('[data-bleed]');
          if (!isBleed && !inside(rect,safe)) issue('unsafe-margin',el);
          if ((style.overflowX!=='visible' && el.scrollWidth>el.clientWidth+2) || (style.overflowY!=='visible' && el.scrollHeight>el.clientHeight+2)) issue('element-overflow',el);
          if (el.matches('h1,h2,[data-readable]')) {
            let size=parseFloat(style.fontSize);
            if (el instanceof SVGElement) { const matrix=el.getScreenCTM(); if (matrix) size*=Math.hypot(matrix.c,matrix.d); }
            if (size<opt['min-readable']) issue('small-readable-text',el,{text:el.textContent.slice(0,100),px:size,minimum:opt['min-readable']});
          }
          for (const node of el.childNodes) {
            if (node.nodeType!==Node.TEXT_NODE || !node.textContent.trim()) continue;
            const range=document.createRange(); range.selectNodeContents(node);
            for (const ink of range.getClientRects()) {
              if (!ink.width || !ink.height) continue;
              if (!inside(ink,isBleed?0:safe)) issue('text-outside-safe-area',el,{text:node.textContent.trim().slice(0,100)});
              for (let ancestor=el; ancestor && ancestor!==sheet; ancestor=ancestor.parentElement) {
                const aStyle=getComputedStyle(ancestor),a=ancestor.getBoundingClientRect();
                if ((aStyle.overflowX!=='visible' && (ink.left<a.left-2 || ink.right>a.right+2)) || (aStyle.overflowY!=='visible' && (ink.top<a.top-2 || ink.bottom>a.bottom+2))) {
                  issue('clipped-text',ancestor,{text:node.textContent.trim().slice(0,100)}); break;
                }
              }
            }
            if (korean.test(node.textContent)) {
              const first=style.fontFamily.split(',')[0].trim().replace(/["']/g,'');
              if (first.toLowerCase()!==fontFamily.toLowerCase()) issue('korean-font-family',el,{actual:first,expected:fontFamily});
            }
          }
        }
        return {card,width:bound.width,height:bound.height,safe,text:sheet.innerText};
      });
      if (!cards.length) issues.push({type:'no-cards'});
      if (opt['expected-cards'] && cards.length!==opt['expected-cards']) issues.push({type:'card-count',actual:cards.length,expected:opt['expected-cards']});
      const normalize=s=>s.replace(/\s+/g,' ').trim(), allText=normalize(cards.map(c=>c.text).join(' '));
      for (const expected of opt['expect-text']) if (!allText.includes(normalize(expected))) issues.push({type:'missing-expected-text',text:expected});
      return {title:document.title,fontFamily,fontFaces,failedFonts:fontFaces.filter(f=>f.status==='error'),brokenImages:Array.from(document.images).filter(i=>!i.naturalWidth).map(i=>i.src),cards,issues};
    },opt);
    report.runtimeErrors=runtimeErrors;
    report.input=input;
    const diagnostics=path.join(out,'export.json');
    fs.writeFileSync(diagnostics,JSON.stringify(report,null,2)+'\n');
    if (report.issues.length || report.failedFonts.length || report.brokenImages.length || runtimeErrors.length) throw new Error(`Card preflight failed (${report.issues.length} layout/text issues, ${report.failedFonts.length} failed fonts, ${report.brokenImages.length} broken images, ${runtimeErrors.length} load errors); inspect ${diagnostics}`);
    const cards=page.locator('.card'), files=[];
    for (let i=0;i<report.cards.length;i++) {
      const file=path.join(out,`card-${String(i+1).padStart(3,'0')}.png`);
      await cards.nth(i).screenshot({path:file,animations:'disabled',scale:'css'}); files.push(file);
    }
    report.files=files;
    fs.writeFileSync(diagnostics,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({cards:files.length,out,diagnostics}));
  } finally {await browser.close();}
}
main().catch(e=>{console.error(e.message);process.exitCode=1;});
