// Fixed-canvas Chrome capture. The composition owns all semantic state.
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL,fileURLToPath}=require('node:url');
const crypto=require('node:crypto');
const {chromium}=require('playwright');

(async()=>{
  const metadataPath=path.resolve(process.argv[2]);
  const output=path.resolve(process.argv[3]);
  const metadata=JSON.parse(fs.readFileSync(metadataPath,'utf8'));
  const width=metadata.width || 1080,height=metadata.height || 1350,duration=metadata.duration || 20,fps=metadata.fps || 30;
  const browser=await chromium.launch(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH,headless:true} : {channel:'chrome',headless:true});
  try {
    const page=await browser.newPage({viewport:{width,height},deviceScaleFactor:1});
    const remoteAssets=[];
    const localAssetErrors=new Set();
    const canonicalPath=name=>{try{return fs.realpathSync(name);}catch{return path.resolve(name);}};
    const allowedFiles=new Set([metadata.scene || 'scene.html',...metadata.assets || []].map(name=>canonicalPath(path.join(path.dirname(metadataPath),name))));
    const localAssets=new Set();
    const assertAssets=()=>{
      if(remoteAssets.length) throw Error(`Remote assets are not reproducible: ${remoteAssets.join(', ')}`);
      if(localAssetErrors.size) throw Error(`Local assets failed: ${[...localAssetErrors].join('; ')}. Register required local files in composition.json assets.`);
    };
    page.on('requestfailed',request=>{
      if(request.url().startsWith('file:')) localAssetErrors.add(`failed request ${request.url()} (${request.failure()?.errorText || 'load error'})`);
    });
    await page.route('**/*',route=>{
      const url=route.request().url();
      if(/^(data|blob):/.test(url)) return route.continue();
      if(url.startsWith('file:')) {
        const asset=canonicalPath(fileURLToPath(url));localAssets.add(asset);
        if(!allowedFiles.has(asset)) {localAssetErrors.add(`unregistered file ${asset}`);return route.abort();}
        return route.continue();
      }
      remoteAssets.push(url);return route.abort();
    });
    await page.goto(pathToFileURL(path.join(path.dirname(metadataPath),metadata.scene || 'scene.html')).href);
    await page.evaluate(()=>document.fonts.ready);
    assertAssets();
    const capture=async t=>{
      const state=await page.evaluate(async t=>{
        if(typeof window.renderAt!=='function') throw Error('Composition must define window.renderAt(t)');
        const value=window.renderAt(t);
        if(!value || typeof value!=='object') throw Error('renderAt(t) must return a semantic state object');
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        return JSON.parse(JSON.stringify(value));
      },t);
      assertAssets();
      const png=await page.locator('#canvas').screenshot({animations:'disabled'});
      assertAssets();
      return {state,png};
    };
    const digest=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
    fs.mkdirSync(path.join(output,'repro-check'),{recursive:true});
    fs.mkdirSync(path.join(output,'frames'),{recursive:true});
    await capture(0);
    const representative=await capture(metadata.representativeTime ?? duration-2);
    fs.writeFileSync(path.join(output,'representative.png'),representative.png);
    const references=[];const rasterComparisons=[];const keyframeStates=[];
    for(const [i,key] of metadata.keyframes.entries()) {
      const result=await capture(key.time);
      references[i]={state:JSON.stringify(result.state),hash:digest(result.png)};
      fs.writeFileSync(path.join(output,'repro-check',`reference-${i}.png`),result.png);
      fs.writeFileSync(path.join(output,`keyframe-${String(i).padStart(2,'0')}.png`),result.png);
      keyframeStates.push({time:key.time,label:key.label,state:result.state});
    }
    for(let i=metadata.keyframes.length-1;i>=0;i--) for(const kind of ['reversed','repeated']) {
      const key=metadata.keyframes[i],result=await capture(key.time);
      if(JSON.stringify(result.state)!==references[i].state) throw Error(`Semantic state changes with call order at ${key.time}s`);
      const compared=`${kind}-${i}.png`;
      fs.writeFileSync(path.join(output,'repro-check',compared),result.png);
      rasterComparisons.push({time:key.time,kind,exactPngMatch:digest(result.png)===references[i].hash,reference:`reference-${i}.png`,compared});
    }
    const textBounds=await page.evaluate(()=>Array.from(document.querySelectorAll('#canvas text')).map(node=>{
      const box=node.getBBox(),matrix=node.getCTM();
      const points=[new DOMPoint(box.x,box.y),new DOMPoint(box.x+box.width,box.y+box.height)].map(p=>p.matrixTransform(matrix));
      return {text:node.textContent,fontSize:parseFloat(getComputedStyle(node).fontSize),x:points[0].x,y:points[0].y,width:points[1].x-points[0].x,height:points[1].y-points[0].y};
    }));
    // SVG source text remains inspectable even when hidden in a transition.
    const outOfBounds=textBounds.filter(b=>b.x<0 || b.y<0 || b.x+b.width>width || b.y+b.height>height);
    for(let i=0;i<Math.round(duration*fps);i++) fs.writeFileSync(path.join(output,'frames',String(i).padStart(4,'0')+'.png'),(await capture(i/fps)).png);
    await page.waitForLoadState('networkidle',{timeout:5000});
    assertAssets();
    fs.writeFileSync(path.join(output,'capture-validation.json'),JSON.stringify({stateCallOrderIndependent:true,comparisons:rasterComparisons.length,rasterComparisons,keyframeStates,representativeState:representative.state,textBounds,outOfBounds,remoteAssets,localAssets:[...localAssets],frameCount:Math.round(duration*fps)},null,2)+'\n');
    console.log(JSON.stringify({capturedFrames:Math.round(duration*fps),representative:path.join(output,'representative.png')}));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
