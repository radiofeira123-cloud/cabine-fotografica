// controle.js - celular da cabine
const WS_URL = "wss://chatcabinerender.onrender.com";
const MOLDURA_PATH = "assets/moldura.png";
const VIDEO_PATH = "assets/video-instrucoes.mp4";

let ws;
let sessionId = null;
let fotoCount = 0;
let maxFotos = 3;
let isCounting = false;

const videoInstr = document.getElementById("videoInstr");
const videoCam = document.getElementById("videoCam");
const overlay = document.getElementById("overlay");
const tapBtn = document.getElementById("tapBtn");
const canvasHidden = document.getElementById("canvasHidden");

videoInstr.src = VIDEO_PATH;
videoInstr.loop = true;
videoInstr.play().catch(()=>{});

function connectWS(){
  ws = new WebSocket(WS_URL);
  ws.onopen = ()=> {
    logControl("WS aberto");
    ws.send(JSON.stringify({ type: "register", role: "control", sessionId }));
  };
  ws.onmessage = (ev)=>{
    try{
      const msg = JSON.parse(ev.data);
      handleMsg(msg);
    }catch(e){ logControl("Erro parse WS: "+e); }
  };
  ws.onclose = ()=> { logControl("WS fechado, reconectando em 2s"); setTimeout(connectWS,2000); };
  ws.onerror = (e)=> logControl("WS error: "+e);
}
connectWS();

function logControl(msg){
  console.log("[CONTROL]", msg);
  if(ws && ws.readyState===1){
    ws.send(JSON.stringify({ type:"log", msg }));
  }
}

tapBtn.addEventListener("click", async ()=>{
  tapBtn.style.display = "none";
  await enterFullscreen();
});

async function enterFullscreen(){
  try{ await document.documentElement.requestFullscreen(); }catch(e){ logControl("FS fail: "+e); }
  logControl("Entrou em fullscreen");
}

function handleMsg(msg){
  if(msg.type==="end-session"){
    resetToIntro();
  }
}

async function resetToIntro(){
  try{ if(videoCam.srcObject){ videoCam.srcObject.getTracks().forEach(t=>t.stop()); videoCam.srcObject=null; } }catch(e){ logControl("Stop cam fail: "+e);}
  videoInstr.style.display="block";
  videoCam.style.display="none";
  overlay.innerText="";
  fotoCount=0;
  isCounting=false;
  if(document.exitFullscreen) document.exitFullscreen().catch(()=>{});
  videoInstr.play().catch(()=>{});
  logControl("Voltou ao vídeo inicial");
}

tapBtn.addEventListener("click", startPhotoFlow);

async function startPhotoFlow(){
  if(isCounting || fotoCount>=maxFotos){
    logControl("Ignorando clique: contagem em andamento ou limite atingido");
    return;
  }
  isCounting=true;
  videoInstr.style.display="none";
  videoCam.style.display="block";

  try{
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:"user", width:{ideal:1920}, height:{ideal:1080} }, audio:false });
    videoCam.srcObject = stream;
    await videoCam.play();
  }catch(e){ logControl("Erro câmera: "+e); return; }

  const mold = new Image();
  mold.crossOrigin="anonymous";
  mold.src=MOLDURA_PATH;

  await showOverlayText("Prepare-se para tirar suas fotos",1500);

  while(fotoCount<maxFotos){
    await countdownOverlay(5);
    const blob = await captureFramedPhoto(videoCam, mold);
    const dataURL = await blobToDataURL(blob);
    showPreview(dataURL);
    if(ws && ws.readyState===1){
      ws.send(JSON.stringify({ type:"photo", sessionId, filename:`photo_${Date.now()}_${fotoCount+1}.jpg`, data:dataURL }));
    }
    fotoCount++;
    await sleep(3000);
    hidePreview();
    if(fotoCount===maxFotos){
      overlay.innerText="✅ Sucesso! Obrigado por utilizar a cabine fotográfica 😃";
      overlay.style.backgroundColor="rgba(0,0,0,0.7)";
      overlay.style.color="white";
      overlay.style.fontSize="4vw";
      overlay.style.display="flex";
      overlay.style.alignItems="center";
      overlay.style.justifyContent="center";
      overlay.style.height="100%";
      break;
    }
  }
  isCounting=false;
}

function captureFramedPhoto(videoEl, moldImage){
  return new Promise(resolve=>{
    const w=videoEl.videoWidth||1280;
    const h=videoEl.videoHeight||720;
    canvasHidden.width=w;
    canvasHidden.height=h;
    const ctx = canvasHidden.getContext("2d");
    ctx.drawImage(videoEl,0,0,w,h);
    if(moldImage.complete){
      ctx.drawImage(moldImage,0,0,w,h);
      canvasHidden.toBlob(b=>resolve(b),"image/jpeg",0.95);
    }else{
      moldImage.onload=()=>{ ctx.drawImage(moldImage,0,0,w,h); canvasHidden.toBlob(b=>resolve(b),"image/jpeg",0.95); };
      moldImage.onerror=()=>{ canvasHidden.toBlob(b=>resolve(b),"image/jpeg",0.95); };
    }
  });
}

function blobToDataURL(blob){
  return new Promise(res=>{ const fr=new FileReader(); fr.onload=()=>res(fr.result); fr.readAsDataURL(blob); });
}

function showPreview(dataURL){
  let img=document.getElementById("__previewImg");
  if(!img){
    img=document.createElement("img");
    img.id="__previewImg";
    img.style.position="absolute";
    img.style.top="0";
    img.style.left="0";
    img.style.width="100%";
    img.style.height="100%";
    img.style.objectFit="contain";
    img.style.zIndex=9998;
    document.body.appendChild(img);
  }
  img.src=dataURL;
  img.style.display="block";
  videoCam.style.display="none";
}

function hidePreview(){
  const img=document.getElementById("__previewImg");
  if(img) img.style.display="none";
  videoCam.style.display="block";
}

function showOverlayText(text,ms){
  overlay.innerText=text;
  return sleep(ms).then(()=> overlay.innerText="");
}

function countdownOverlay(sec){
  return new Promise(async resolve=>{
    const overlayCount=document.createElement("div");
    overlayCount.style.position="absolute";
    overlayCount.style.top="10%";
    overlayCount.style.width="100%";
    overlayCount.style.textAlign="center";
    overlayCount.style.fontSize="12vw";
    overlayCount.style.zIndex=9999;
    overlayCount.style.pointerEvents="none";
    document.body.appendChild(overlayCount);
    for(let i=sec;i>=1;i--){
      overlayCount.innerText=i;
      await sleep(1000);
    }
    document.body.removeChild(overlayCount);
    resolve();
  });
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }
