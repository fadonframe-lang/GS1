/* Standalone GS1 DataMatrix ECC200 encoder.
 * Data Matrix placement algorithm adapted from the public ReportLab ECC200 reference
 * (Kyle Macfarlane, huBarcode placement approach). Fixed 44x44 symbol (144 data,
 * 56 parity codewords), ASCII encodation, GS1 FNC1. No network dependencies.
 */
(function(global){'use strict';
const ECC_FACTORS=[175,9,223,238,12,17,220,208,100,29,175,170,230,192,215,235,150,159,36,223,38,200,132,54,228,146,218,234,117,203,29,232,144,238,22,150,201,117,62,207,164,13,137,245,127,67,247,28,155,43,203,107,233,53,143,46];
const SIZE=44, REGION=20, INNER=40, CAPACITY=144;
const gfExp=new Array(512),gfLog=new Array(256).fill(0);
let x=1;for(let i=0;i<255;i++){gfExp[i]=x;gfLog[x]=i;x<<=1;if(x&256)x^=301;}for(let i=255;i<512;i++)gfExp[i]=gfExp[i-255];
function mul(a,b){return a&&b?gfExp[(gfLog[a]+gfLog[b])%255]:0;}
function asciiCodewords(str){const out=[232]; // first FNC1: GS1 identification
  for(let i=0;i<str.length;i++){
    const c=str.charCodeAt(i);
    if(c===29){out.push(232);continue;} // variable field separator FNC1
    if(c>=48&&c<=57 && i+1<str.length){let n=str.charCodeAt(i+1);if(n>=48&&n<=57){out.push(130+10*(c-48)+(n-48));i++;continue;}}
    if(c>127){throw Error('Код содержит неподдерживаемый символ Unicode в позиции '+(i+1));}
    out.push(c+1);
  }
  if(out.length>CAPACITY)throw Error('Слишком длинный код для этой версии (максимум 144 кодовых слова).');
  if(out.length<CAPACITY){out.push(129);while(out.length<CAPACITY){const pos=out.length+1;const r=((149*pos)%253)+1;const val=129+r;out.push(val<=254?val:val-254);}}
  return out;
}
function ecc(data){let parity=new Array(56).fill(0);
  for(const d of data){let v=d^parity[55];for(let i=55;i>=0;i--){parity[i]=mul(v,ECC_FACTORS[i]);if(i>0)parity[i]^=parity[i-1];}}
  return parity.reverse();
}
function placement(words){const grid=Array.from({length:INNER},()=>Array(INNER).fill(-1));let ptr=0;
  function bit(row,col,val){
    if(row<0){row+=INNER;col+=4-((INNER+4)%8);}
    if(col<0){col+=INNER;row+=4-((INNER+4)%8);}
    if(row<0||row>=INNER||col<0||col>=INNER)throw Error('Ошибка размещения');
    grid[row][col]=val;
  }
  function place(points){if(ptr>=words.length)throw Error('Ошибка вместимости матрицы');const value=words[ptr++];points.forEach(([r,c],i)=>bit(r,c,(value>>(7-i))&1));}
  function utah(row,col){place([[row-2,col-2],[row-2,col-1],[row-1,col-2],[row-1,col-1],[row-1,col],[row,col-2],[row,col-1],[row,col]]);}
  let row=4,col=0;
  while(true){
    if(row===INNER&&col===0)place([[INNER-1,0],[INNER-1,1],[INNER-1,2],[0,INNER-2],[0,INNER-1],[1,INNER-1],[2,INNER-1],[3,INNER-1]]);
    else if(row===INNER-2&&col===0&&INNER%4!==0)place([[INNER-3,0],[INNER-2,0],[INNER-1,0],[0,INNER-4],[0,INNER-3],[0,INNER-2],[0,INNER-1],[1,INNER-1]]);
    else if(row===INNER-2&&col===0&&INNER%8===4)place([[INNER-3,0],[INNER-2,0],[INNER-1,0],[0,INNER-2],[0,INNER-1],[1,INNER-1],[2,INNER-1],[3,INNER-1]]);
    else if(row===INNER+4&&col===2&&INNER%8===0)place([[INNER-1,0],[INNER-1,INNER-1],[0,INNER-3],[0,INNER-2],[0,INNER-1],[1,INNER-3],[1,INNER-2],[1,INNER-1]]);
    do{if(row<INNER&&col>=0&&grid[row][col]<0)utah(row,col);row-=2;col+=2;}while(row>=0&&col<INNER);
    row++;col+=3;
    do{if(row>=0&&col<INNER&&grid[row][col]<0)utah(row,col);row+=2;col-=2;}while(row<INNER&&col>=0);
    row+=3;col++;
    if(row>=INNER&&col>=INNER)break;
  }
  // per ECC200, bottom right may be unused; set fixed pattern
  if(grid[INNER-1][INNER-1]<0){grid[INNER-1][INNER-1]=1;grid[INNER-2][INNER-2]=1;}
  return grid;
}
function matrix(text){const data=asciiCodewords(text),raw=placement(data.concat(ecc(data)));
 const out=Array.from({length:SIZE},()=>Array(SIZE).fill(0));
 for(let ry=0;ry<2;ry++)for(let rx=0;rx<2;rx++){
   const Y=ry*22,X=rx*22;
   for(let j=0;j<22;j++)for(let i=0;i<22;i++){
     let b;
     if(j===0)b=(i+1)%2;else if(j===21)b=1;
     else if(i===0)b=1;else if(i===21)b=j%2;
     else b=raw[ry*REGION+j-1][rx*REGION+i-1];
     out[Y+j][X+i]=b;
   }
 }
 return out;
}
function draw(canvas,data,moduleSize,quiet){const grid=matrix(data),p=Math.max(1,moduleSize|0),q=Math.max(1,quiet|0);
 canvas.width=canvas.height=(SIZE+2*q)*p;const ctx=canvas.getContext('2d',{alpha:false});ctx.imageSmoothingEnabled=false;
 ctx.fillStyle='#ffffff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#000000';
 for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++)if(grid[y][x])ctx.fillRect((x+q)*p,(y+q)*p,p,p);
 return canvas;
}
global.OfflineGS1DM={draw,matrix,capacity:CAPACITY};
})(typeof window!=='undefined'?window:globalThis);
