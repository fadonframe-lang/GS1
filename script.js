'use strict';
const el=id=>document.getElementById(id);
const input=el('code'),status=el('status'),result=el('result'),canvas=el('matrix');
function say(message,type=''){status.textContent=message;status.className='status '+type;status.hidden=!message;}
const GS='';
function parse(raw){
  let s=raw.trim().replace(/<GS>|\x1[dD]|\u001[dD]|\[GS\]/gi,GS);
  // Scanner output may begin with a literal ASCII 29 (GS).
  // The encoder itself writes the mandatory initial GS1 FNC1.
  s=s.replace(/^+/, '');
  // Supports both scanner output with GS, AIs in parentheses, and pasted space-delimited codes.
  let match=s.match(/^\(01\)(\d{14})\(21\)([\s\S]{1,20}?)\(91\)([\s\S]{1,90}?)\(92\)([\s\S]+)$/);
  if(!match){
    match=s.match(/^01(\d{14})21([\s\S]{1,20}?)(?:|\s+)91([\s\S]{1,90}?)(?:|\s+)92([\s\S]+)$/);
  }
  if(!match)throw Error('Не удалось распознать структуру. Ожидаются группы 01 (14 цифр), 21, 91 и 92. Между 21/91 и 91/92 должны быть пробелы, GS или скобки вокруг AI.');
  const [all,gtin,serial,key,crypto]=match;
  if(!serial||!key||!crypto)throw Error('Одна из групп 21, 91, 92 пустая.');
  for(const [name,val] of [['21',serial],['91',key],['92',crypto]]){
    if(/[\x00-\x1f\x7f-\uffff]/.test(val))throw Error('В группе '+name+' есть недопустимые символы.');
  }
  return {gtin,serial,key,crypto,encoded:'01'+gtin+'21'+serial+GS+'91'+key+GS+'92'+crypto};
}

function getHumanLines(p){
  return [
    '(01) ' + p.gtin,
    '(21) ' + p.serial
  ];
}

function renderCanvas(targetCanvas,p){
  const temp=document.createElement('canvas');
  OfflineGS1DM.draw(temp,p.encoded,10,2);

  const lines=getHumanLines(p);
  const ctx=targetCanvas.getContext('2d');
  const width=temp.width;
  const fontSize=Math.max(28, Math.round(width/15));
  const lineHeight=Math.round(fontSize*1.12);
  const textTopPad=Math.round(fontSize*0.42);
  const textBottomPad=Math.round(fontSize*0.30);
  const textBlockHeight=textTopPad + lineHeight*lines.length + textBottomPad;

  targetCanvas.width=width;
  targetCanvas.height=temp.height + textBlockHeight;

  ctx.fillStyle='#ffffff';
  ctx.fillRect(0,0,targetCanvas.width,targetCanvas.height);
  ctx.drawImage(temp,0,0);

  ctx.fillStyle='#000000';
  ctx.textAlign='left';
  ctx.textBaseline='top';
  ctx.font='600 ' + fontSize + 'px "Courier New", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

  const textLeftPad=Math.round(width*0.04);
  lines.forEach((line,index)=>{
    ctx.fillText(line, textLeftPad, temp.height + textTopPad + index*lineHeight);
  });
}

let last=null;
function generate(){try{const p=parse(input.value);renderCanvas(canvas,p);last=p;result.hidden=false;
  el('parts').replaceChildren(...[['01 · GTIN',p.gtin],['21 · Серийный номер',p.serial],['91 · Ключ проверки',p.key],['92 · Код проверки',p.crypto]].map(([k,v])=>{let div=document.createElement('div');div.className='part';let b=document.createElement('b');b.textContent=k;div.append(b,document.createTextNode(v));return div;}));
  say('','ok');
 }catch(e){last=null;result.hidden=true;say(e.message||String(e),'error');}}
el('generate').addEventListener('click',generate);
el('clear').addEventListener('click',()=>{input.value='';result.hidden=true;last=null;say('');input.focus();});
el('paste').addEventListener('click',async()=>{try{input.value=await navigator.clipboard.readText();generate();}catch(e){say('Автовставка недоступна из локального файла. Используйте долгое нажатие → «Вставить».','error');input.focus();}});
el('save').addEventListener('click',()=>{if(!last)return;const link=document.createElement('a');link.href=canvas.toDataURL('image/png');link.download='gs1-datamatrix-'+last.gtin+'.png';document.body.appendChild(link);link.click();link.remove();});
el('copyImage').addEventListener('click',async()=>{if(!last)return;try{const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('PNG недоступен');await navigator.clipboard.write([new ClipboardItem({'image/png':blob})]);say('Изображение скопировано.','ok');}catch(e){say('Копирование картинки из локального файла может быть запрещено браузером. Используйте «Скачать PNG».','error');}});
