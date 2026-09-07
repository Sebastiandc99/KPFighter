// Normalize generated chroma-key sheets into the engine's 270px cells.
// Usage: node scripts/build-galante-assets.cjs ATTACK_SHEET MOVEMENT_SHEET
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
(async()=>{
 const attack=await keyed(process.argv[2]),motion=await keyed(process.argv[3]);
 const a=[[0,0,512,520],[512,0,560,520],[1072,0,464,520],[0,520,510,504],[510,520,514,504],[1024,520,512,504]];
 const m=Array.from({length:9},(_,i)=>[(i%3)*418,Math.floor(i/3)===0?0:Math.floor(i/3)===1?397:798,418,Math.floor(i/3)===0?397:Math.floor(i/3)===1?401:456]);
 const map=[0,1,2,3,4,5,0,1,2,3,4,3,6,7,8,5],frames=[];
 for(let pose=0;pose<16;pose++){
  const move=pose>=6,idx=map[pose],[left,top,width,height]=(move?m:a)[idx];
  const region=await sharp(move?motion:attack).extract({left,top,width,height}).png().toBuffer();
  const crop=await sharp(region).trim({background:'#00000000',threshold:0}).png().toBuffer();
  const meta=await sharp(crop).metadata(),scale=move?.60:.48;
  const w=Math.round(meta.width*scale),h=Math.round(meta.height*scale);
  const resized=await sharp(crop).resize(w,h).png().toBuffer();
  frames.push({input:resized,left:(pose%4)*270+Math.round((270-w)/2),top:Math.floor(pose/4)*270+260-h});
  if(pose===0)await sharp(crop).webp({quality:95,alphaQuality:100}).toFile('assets/galante-portrait-v2.webp');
 }
 await sharp({create:{width:1080,height:1080,channels:4,background:'#00000000'}}).composite(frames).webp({quality:94,alphaQuality:100}).toFile('assets/galante-atlas-v2.webp');
 console.log('Saved transparent portrait and 16 normalized poses.');
})();
