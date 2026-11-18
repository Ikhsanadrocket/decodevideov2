const $=id=>document.getElementById(id);
let video,S=[],SUB=[],META={};
const st=t=>$('st').textContent=t;
const seek=t=>new Promise(r=>{video.onseeked=r;video.currentTime=t});
const tc=t=>`${String(Math.floor(t/60)).padStart(2,'0')}:${(t%60).toFixed(1).padStart(4,'0')}`;
const srt=t=>new Date(t*1000).toISOString().substr(11,12).replace('.',',');
const q=v=>`"${String(v??'').replace(/"/g,'""')}"`;
const esc=v=>String(v??'').replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
const b64=b=>new Promise(r=>{const f=new FileReader();f.onload=()=>r(f.result.split(',')[1]);f.readAsDataURL(b)});
const img=async b=>({type:'image',source:{type:'base64',media_type:'image/jpeg',data:await b64(b)}});
const fname=s=>`seg_${String(s.id).padStart(3,'0')}_${Math.floor(s.start/60)}m${Math.floor(s.start%60)}s`;
const kv=o=>Object.entries(o||{}).map(([k,v])=>`- **${k}**: ${typeof v==='object'?JSON.stringify(v):v}`).join('\n');

async function shot(t){
  await seek(t);
  const c=document.createElement('canvas'),w=Math.min(960,video.videoWidth);
  c.width=w;c.height=Math.round(w*video.videoHeight/video.videoWidth);
  c.getContext('2d').drawImage(video,0,0,c.width,c.height);
  return new Promise(r=>c.toBlob(r,'image/jpeg',.85));
}

// ---- Transkrip (.srt/.vtt) ----
const ts=x=>{const m=x.trim().replace(',','.').split(':').map(parseFloat);return m.length===3?m[0]*3600+m[1]*60+m[2]:m[0]*60+m[1]};
function parseSub(txt){
  const out=[];
  for(const b of txt.replace(/\r/g,'').replace(/^WEBVTT.*\n/,'').split(/\n\n+/)){
    const l=b.split('\n'),i=l.findIndex(x=>x.includes('-->'));if(i<0)continue;
    const [a,e]=l[i].split('-->');
    out.push({s:ts(a),e:ts(e.trim().split(' ')[0]),t:l.slice(i+1).join(' ').replace(/<[^>]+>/g,'').trim()});
  }
  return out;
}
const speech=s=>SUB.filter(c=>c.e>s.start&&c.s<s.end).map(c=>c.t).join(' ');

// ---- Sinyal frame: piksel 64x36 + histogram luma 32 bin ----
const sig=d=>{
  const h=new Float32Array(32),n=d.length/4;
  for(let i=0;i<d.length;i+=4)h[((d[i]*.299+d[i+1]*.587+d[i+2]*.114)|0)>>3]++;
  for(let i=0;i<32;i++)h[i]/=n;
  return {d,h};
};
const diff=(a,b)=>{ // skor 0-100: rata-rata selisih piksel + selisih histogram
  let p=0;for(let i=0;i<a.d.length;i+=4)p+=Math.abs(a.d[i]-b.d[i])+Math.abs(a.d[i+1]-b.d[i+1])+Math.abs(a.d[i+2]-b.d[i+2]);
  p=p/(a.d.length*.75)/255*100;
  let h=0;for(let i=0;i<32;i++)h+=Math.abs(a.h[i]-b.h[i]);
  return (p+h*50)/2;
};

// Langkah 1: segmentasi multi-sinyal
// cut      = skor vs sampel sebelumnya melonjak (hard cut; histogram menahan false-positive gerak kamera/objek)
// change   = isi layar sudah jauh berbeda dari keyframe terakhir (dissolve, UI/peta/grafik yang berubah dalam satu shot)
// interval = tidak ada perubahan apa pun selama "segmen maks." detik
$('go1').onclick=async()=>{
  const f=$('file').files[0];if(!f)return alert('Pilih video dulu');
  video=document.createElement('video');video.muted=true;video.src=URL.createObjectURL(f);
  await new Promise(r=>video.onloadedmetadata=r);
  SUB=[];const sf=$('sub').files[0];if(sf)SUB=parseSub(await sf.text());
  const dur=video.duration,th=+$('th').value,minD=+$('min').value,maxSeg=+$('max').value,chg=$('chg').checked;
  const step=dur>180?.5:.25;
  const c=document.createElement('canvas');c.width=64;c.height=36;
  const x=c.getContext('2d',{willReadFrequently:true});
  let prev=null,ref=null,cuts=[{t:0,kind:'start'}],last=0,hist=[];
  for(let t=0;t<dur;t+=step){
    await seek(t);x.drawImage(video,0,0,64,36);
    const cur=sig(x.getImageData(0,0,64,36).data);
    if(prev){
      const sc=diff(cur,prev),avg=hist.length?hist.reduce((a,b)=>a+b)/hist.length:0;
      let kind=null;
      if(sc>th&&sc>avg*2.5+2)kind='cut';
      else if(chg&&diff(cur,ref)>th*.65)kind='change';
      else if(t-last>=maxSeg)kind='interval';
      if(kind&&t-last>=minD){cuts.push({t,kind});last=t;ref=cur}
      hist.push(sc);if(hist.length>6)hist.shift();
    }else ref=cur;
    prev=cur;st(`Mendeteksi segmen... ${Math.round(t/dur*100)}%`);
  }
  let shot_n=0;
  S=cuts.map((k,i)=>{if(k.kind==='start'||k.kind==='cut')shot_n++;return{id:i+1,start:k.t,end:cuts[i+1]?.t??dur,kind:k.kind,shot:shot_n}});
  for(const s of S){
    st(`Mengambil frame segmen ${s.id}/${S.length}`);
    s.a=await shot(Math.min(s.start+.3,s.end-.05));
    if(s.end-s.start>=3)s.m=await shot((s.start+s.end)/2);
    s.b=await shot(Math.max(s.end-.3,s.start));
  }
  const d=S.map(s=>s.end-s.start);
  META={file:f.name,duration_s:+dur.toFixed(1),resolution:`${video.videoWidth}x${video.videoHeight}`,aspect:+(video.videoWidth/video.videoHeight).toFixed(2),
    segments:S.length,shots:shot_n,avg_shot_len_s:+(dur/shot_n).toFixed(2),shots_per_min:+(shot_n/dur*60).toFixed(1),
    has_transcript:SUB.length>0,words_per_sec:SUB.length?+(SUB.map(c=>c.t).join(' ').split(/\s+/).length/dur).toFixed(2):null};
  $('grid').innerHTML='';
  S.forEach(s=>{const fg=document.createElement('figure');
    fg.innerHTML=`<img alt="Segmen ${s.id}" src="${URL.createObjectURL(s.a)}">#${s.id} ${s.kind} ${tc(s.start)}-${tc(s.end)}`;$('grid').append(fg)});
  st(`${S.length} segmen (${shot_n} shot). Geser sensitivitas lalu deteksi ulang jika kurang pas, atau lanjut ekspor.`);
  $('go2').disabled=false;
};

// Langkah 2: analisis Claude -> Content DNA
const SYS='Kamu analis konten video untuk riset produksi ulang. Balas HANYA dengan JSON valid, tanpa markdown. Jangan mengarang hal yang tidak terlihat atau tidak ada di transkrip.';
const ask=async(content,max_tokens)=>{
  const r=await fetch('/api/analyze',{method:'POST',headers:{'content-type':'application/json','x-app-key':$('pw').value},body:JSON.stringify({system:SYS,content,max_tokens})});
  const j=await r.json();if(!r.ok)throw new Error(j.error?.message||r.status);
  return JSON.parse(j.content.map(c=>c.text||'').join('').replace(/```json|```/g,'').trim());
};
const save=async z=>{const a=document.createElement('a');a.href=URL.createObjectURL(await z.generateAsync({type:'blob'}));a.download='video-decode.zip';a.click();st('Selesai. ZIP terunduh.')};

const PROMPT=`# Cara pakai
1. Unggah semua gambar satu folder batch + scenes.csv (+ transcript.srt jika ada) ke chat, lalu tempel instruksi di bawah garis.
2. Batch berikutnya: unggah folder batch itu dan tulis "Lanjut batch 02".
3. Setelah batch terakhir: "Sintesis semua batch menjadi content_dna.json".

---
Kamu analis konten video untuk riset produksi ulang. Video bisa berjenis apa saja (cinematic, explainer, screen recording, vlog, animasi). Gambar = frame A (awal), M (tengah, bila ada), B (akhir) tiap segmen; nama file memuat nomor segmen. scenes.csv berisi waktu, jenis pemotongan, dan potongan transkrip.

Per segmen beri JSON: role (hook|setup|explain|example|transition|payoff|cta|other), visual (deskripsi objektif), slot (deskripsi fungsi visual yang NETRAL TOPIK, bahasa Inggris, agar bisa dipakai ulang untuk topik lain), gen_prompt (prompt bahasa Inggris untuk membuat visual serupa) + negative_prompt, on_screen_text (persis seperti terlihat), shot_type, camera, motion (apa yang berubah A->B), transition_in.

Setelah semua batch, sintesis: format (genre, hook_type, target_audience), style_dna (visual_style, color_grade, typography_text_overlay, music_voice, editing_pacing), subjects (subjek yang berulang), beats (name, purpose, segment_ids, start, end, pattern netral topik), remake_template (summary, rules, slots).
Jangan mengarang hal yang tidak terlihat atau tidak ada di transkrip.
`;

$('go2').onclick=async()=>{
  const ai=!!$('pw').value;
  S.forEach(s=>s.speech=speech(s));
  if(!ai){
    st('Menyusun ZIP untuk dianalisis di chat Claude...');
    const z=new JSZip(),B=6;
    S.forEach(s=>{const d=z.folder('batch_'+String(Math.ceil(s.id/B)).padStart(2,'0')),n=fname(s);
      d.file(n+'_A.jpg',s.a);if(s.m)d.file(n+'_M.jpg',s.m);d.file(n+'_B.jpg',s.b)});
    z.file('scenes.csv','segmen,jenis,shot,mulai,selesai,durasi_detik,transkrip\n'+S.map(s=>[s.id,s.kind,s.shot,tc(s.start),tc(s.end),(s.end-s.start).toFixed(1),s.speech].map(q).join(',')).join('\n'));
    z.file('meta.json',JSON.stringify(META,null,2));
    if(SUB.length)z.file('transcript.srt',SUB.map((c,i)=>`${i+1}\n${srt(c.s)} --> ${srt(c.e)}\n${c.t}\n`).join('\n'));
    z.file('PROMPT_UNTUK_CLAUDE.md',PROMPT);
    return save(z);
  }
  for(const s of S){
    st(`Menganalisis segmen ${s.id}/${S.length}`);
    const c=[{type:'text',text:'Frame A (awal):'},await img(s.a)];
    if(s.m)c.push({type:'text',text:'Frame M (tengah):'},await img(s.m));
    c.push({type:'text',text:'Frame B (akhir):'},await img(s.b),{type:'text',text:
`Segmen ${s.id}, durasi ${(s.end-s.start).toFixed(1)} dtk, dipotong karena: ${s.kind}. Transkrip pada segmen ini: ${s.speech||'(tidak ada)'}
JSON: {"role":"hook|setup|explain|example|transition|payoff|cta|other","visual":"deskripsi objektif (Indonesia)","slot":"fungsi visual netral topik agar bisa dipakai ulang untuk topik lain (English)","gen_prompt":"English prompt to recreate a similar visual: style, subject, lighting, camera","negative_prompt":"","on_screen_text":"teks di layar persis seperti terlihat, kosong jika tidak ada","shot_type":"","camera":"","motion":"apa yang berubah dari A ke B","transition_in":"cut|dissolve|fade|wipe|zoom|none|unknown"}`});
    try{Object.assign(s,await ask(c,1200))}catch(e){s.error=e.message}
  }
  let dna={};
  try{
    st('Menyintesis struktur & gaya...');
    const pick=S.filter((_,i)=>i%Math.max(1,Math.ceil(S.length/4))===0).slice(0,4);
    const rows=S.map(s=>({id:s.id,t:[+s.start.toFixed(1),+s.end.toFixed(1)],kind:s.kind,shot:s.shot,role:s.role,visual:s.visual,text:s.on_screen_text,speech:(s.speech||'').slice(0,200)}));
    dna=await ask([...await Promise.all(pick.map(s=>img(s.a))),{type:'text',text:
`Meta video: ${JSON.stringify(META)}\nData segmen: ${JSON.stringify(rows)}\n
Buat Content DNA. JSON: {"topic":"","format":{"genre":"","hook_type":"","target_audience":""},"style_dna":{"visual_style":"","color_grade":"","typography_text_overlay":"","music_voice":"","editing_pacing":""},"subjects":[{"name":"","description":"subjek/objek/UI berulang"}],"beats":[{"name":"","purpose":"","segment_ids":[],"start":0,"end":0,"pattern":"apa yang terjadi di beat ini, netral topik"}],"remake_template":{"summary":"struktur & gaya yang bisa dipakai ulang untuk topik lain","rules":["aturan gaya/struktur yang harus dipertahankan"],"slots":["jenis konten yang harus diisi saat topik baru (mis. data, studi kasus, visual utama)"]}}`}],4000);
  }catch(e){dna={error:'Sintesis gagal: '+e.message}}
  st('Menyusun ZIP...');
  const z=new JSZip(),f=z.folder('01_frames'),T=fn=>S.map(fn).join('\n');
  S.forEach(s=>{const n=fname(s);f.file(n+'_A.jpg',s.a);if(s.m)f.file(n+'_M.jpg',s.m);f.file(n+'_B.jpg',s.b)});
  const shots=S.map(s=>({id:s.id,shot:s.shot,kind:s.kind,start:+s.start.toFixed(2),end:+s.end.toFixed(2),role:s.role,visual:s.visual,slot:s.slot,gen_prompt:s.gen_prompt,negative_prompt:s.negative_prompt,on_screen_text:s.on_screen_text,shot_type:s.shot_type,camera:s.camera,motion:s.motion,transition_in:s.transition_in,speech:s.speech,frames:fname(s),error:s.error}));
  z.file('content_dna.json',JSON.stringify({version:2,meta:META,...dna,shots,transcript:SUB},null,2));
  z.file('00_style_dna/style_dna.md','# Format\n'+kv(dna.format)+'\n\n# Style DNA\n'+kv(dna.style_dna)+'\n\n# Remake template\n'+(dna.remake_template?.summary||'')+'\n\n## Aturan\n'+(dna.remake_template?.rules||[]).map(r=>'- '+r).join('\n')+'\n\n## Slot\n'+(dna.remake_template?.slots||[]).map(r=>'- '+r).join('\n'));
  z.file('00_style_dna/subjects.md',(dna.subjects||[]).map(c=>`## ${c.name}\n${c.description}\n`).join('\n'));
  z.file('02_prompts/image_prompts.md',T(s=>`## Segmen ${s.id} (${tc(s.start)})\n${s.gen_prompt||''}\n\nNegative: ${s.negative_prompt||''}\nSlot: ${s.slot||''}\n`));
  z.file('03_structure/beats.md',(dna.beats||[]).map(b=>`## ${b.name} (${tc(b.start||0)}-${tc(b.end||0)}) — segmen ${(b.segment_ids||[]).join(', ')}\n*${b.purpose||''}*\n\n${b.pattern||''}\n`).join('\n'));
  if(SUB.length)z.file('03_structure/transcript.srt',SUB.map((c,i)=>`${i+1}\n${srt(c.s)} --> ${srt(c.e)}\n${c.t}\n`).join('\n'));
  z.file('05_data/shots.csv','segmen,shot,jenis,mulai,durasi,role,shot_type,kamera,transisi,teks_layar\n'+T(s=>[s.id,s.shot,s.kind,tc(s.start),(s.end-s.start).toFixed(1),s.role,s.shot_type,s.camera,s.transition_in,s.on_screen_text].map(q).join(',')));
  z.file('storyboard.html','<meta charset="utf-8"><title>Storyboard</title><style>body{font:14px system-ui;max-width:900px;margin:auto}.s{display:grid;grid-template-columns:1fr 1fr;gap:12px;border-top:1px solid #ccc;padding:12px 0}img{width:100%;margin-bottom:6px}</style>'+T(s=>`<div class="s"><div><img src="01_frames/${fname(s)}_A.jpg"><img src="01_frames/${fname(s)}_B.jpg"></div><div><b>${s.id}. [${esc(s.role)}] ${tc(s.start)}-${tc(s.end)} (${s.kind})</b><p>${esc(s.visual)}</p><p><i>${esc(s.speech)}</i></p><code>${esc(s.gen_prompt)}</code></div></div>`));
  z.file('README.md','# Hasil Video Decode v2\nFile utama: content_dna.json (untuk tool remake). storyboard.html = ringkasan visual.\n');
  await save(z);
};
