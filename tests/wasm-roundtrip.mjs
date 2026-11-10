import {chromium} from 'playwright';
import assert from 'node:assert/strict';

const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage();
  page.on('pageerror', e => console.error('PAGE ERROR:', e.message));
  await page.goto('http://127.0.0.1:8000/', {waitUntil:'load'});
  const result=await page.evaluate(async()=>{
    const GS=String.fromCharCode(29);
    const code='0108809680716353215qGWjGQa?HTrD'+GS+'91EE11'+GS+'92JdS5QPI0mvwiRBJ2FdSOdDPjjb/nks2ktSJXXAwsid4=';
    document.getElementById('code').value=code;
    document.getElementById('generate').click();
    const canvas=document.getElementById('matrix');
    if(document.getElementById('result').hidden)throw Error('generator failed: '+document.getElementById('status').textContent);
    const z=window.ZXingWASM;
    if(!z?.readBarcodes)throw Error('ZXing JS missing');
    z.prepareZXingModule({overrides:{locateFile:()=>new URL('vendor/zxing/zxing_reader.wasm',document.baseURI).href}});
    // Generated PNG includes a label, while decoder must read just the DataMatrix.
    const cv=document.createElement('canvas');
    cv.width=canvas.width;
    cv.height=canvas.width;
    cv.getContext('2d').drawImage(canvas,0,0,canvas.width,canvas.width,0,0,canvas.width,canvas.width);
    const ctx=cv.getContext('2d');
    const image=ctx.getImageData(0,0,cv.width,cv.height);
    const read=await z.readBarcodes(image,{formats:['DataMatrix'],tryHarder:true,tryRotate:true,tryInvert:true,maxNumberOfSymbols:1});
    return {input:code,decoded:read.map(r=>({format:r.format,text:r.text,symbologyIdentifier:r.symbologyIdentifier})), canvasSize:[canvas.width,canvas.height]};
  });
  console.log(result);
  assert.ok(result.decoded.length>0,'No DataMatrix decoded');
  assert.equal(result.decoded[0].format,'DataMatrix');
  const value=result.decoded[0].text.replace(/^\]d2/,'').replace(/^\x1d/,'');
  assert.equal(value,result.input,'GS1 payload did not roundtrip');
  console.log('PASS: offline ZXing decoder roundtrip on app-generated GS1 DataMatrix');
} finally {await browser.close();}
