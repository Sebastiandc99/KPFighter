// Normalize generated chroma-key sheets into the engine's 270px cells.
// Usage: node scripts/build-galante-assets.cjs SOURCE_SHEET
const sharp=require('sharp'),fs=require('node:fs');
async function keyed(file){
 const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const count=info.width*info.height,seen=new Uint8Array(count),queue=new Int32Array(count);let head=0,tail=0;
 const key=(n)=>{const i=n*4;return Math.min(data[i],data[i+2])-data[i+1]>18 && data[i]>30 && data[i+2]>30;};
 for(let n=0;n<count;n++){const i=n*4;if(Math.min(data[i],data[i+2])-data[i+1]>150){seen[n]=1;queue[tail++]=n;}}
 while(head<tail){const n=queue[head++],x=n%info.width;for(const v of [x>0?n-1:-1,x<info.width-1?n+1:-1,n-info.width,n+info.width])if(v>=0&&v<count&&!seen[v]&&key(v)){seen[v]=1;queue[tail++]=v;}}
 for(let n=0;n<count;n++)if(seen[n])data.fill(0,n*4,n*4+4);
 return sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
}
async function isolate(region) {
 const {data,info}=await sharp(region).raw().toBuffer({resolveWithObject:true});
 const count=info.width*info.height,seen=new Uint8Array(count),queue=new Int32Array(count);let largest=[];
 for(let seed=0;seed<count;seed++){
  if(seen[seed]||data[seed*4+3]<10)continue;
  let head=0,tail=1;queue[0]=seed;seen[seed]=1;
  while(head<tail){const n=queue[head++],x=n%info.width;for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
   const v=n+dy*info.width+dx;if(x+dx>=0&&x+dx<info.width&&v>=0&&v<count&&!seen[v]&&data[v*4+3]>=10){seen[v]=1;queue[tail++]=v;}
  }}
  if(tail>largest.length)largest=Array.from(queue.subarray(0,tail));
 }
 const keep=new Uint8Array(count);for(const n of largest)keep[n]=1;
 for(let n=0;n<count;n++)if(!keep[n])data.fill(0,n*4,n*4+4);
 return sharp(data,{raw:{width:info.width,height:info.height,channels:4}}).png().toBuffer();
}
(async()=>{
 const source=await keyed(process.argv[2]);
 const xs=[[0,310,650,1000,1254],[0,332,643,950,1254],[0,310,645,955,1254],[0,313,640,983,1254]],ys=[0,310,615,908,1254],frames=[];
 for(let pose=0;pose<16;pose++){
  const row=Math.floor(pose/4),col=pose%4,left=pose===5?320:xs[row][col],top=ys[row],width=(pose===4?335:xs[row][col+1])-left,height=ys[row+1]-top;
  const region=await sharp(source).extract({left,top,width,height}).png().toBuffer();
  const crop=await sharp(await isolate(region)).trim({background:'#00000000',threshold:0}).png().toBuffer();
  const meta=await sharp(crop).metadata(),scale=Math.min(234/278,258/meta.width,254/meta.height);
  const w=Math.round(meta.width*scale),h=Math.round(meta.height*scale);
  const resized=await sharp(crop).resize(w,h).png().toBuffer();
  frames.push({input:resized,left:col*270+Math.round((270-w)/2),top:row*270+260-h});
  if(pose===0)await sharp(crop).webp({quality:95,alphaQuality:100}).toFile('assets/galante-portrait-v3.webp');
 }
 await sharp({create:{width:1080,height:1080,channels:4,background:'#00000000'}}).composite(frames).webp({quality:94,alphaQuality:100}).toFile('assets/galante-atlas-v3.webp');
 console.log('Saved new-reference Galante, matching Sergio standing height.');
})();
