// controle.js - celular da cabine (mantém tudo, não remova partes)
const WS_URL = "wss://chatcabinerender.onrender.com";
const MOLDURA_PATH = "assets/moldura.png";
const VIDEO_PATH = "assets/video-instrucoes.mp4";

const urlParams = new URLSearchParams(location.search);
const sessionId = urlParams.get("session") || null;

let ws;
function connectWS(){
  ws = new WebSocket(WS_URL);
  ws.onopen = ()=> {
    console.log("[CONTROL] WS aberto");
    ws.send(JSON.stringify({ type: "register", role: "control", sessionId }));
  };
  ws.onmessage = (ev)=> {
    try {
      const msg = JSON.parse(ev.data);
      handleMsg(msg);
    } catch(e){ console.error(e); }
  };
  ws.onclose = ()=> { console.log("[CONTROL] WS fechado, reconectando em 2s"); setTimeout(connectWS,2000); };
  ws.onerror = (e)=> console.error("[CONTROL] WS erro", e);
}
connectWS();

const videoInstr = document.getElementById("videoInstr");
const videoCam = document.getElementById("videoCam");
const overlay = document.getElementById("overlay");
const tapBtn = document.getElementById("tapBtn");
const canvasHidden = document.getElementById("canvasHidden");

videoInstr.src = VIDEO_PATH;
videoInstr.play().catch(()=>{});

// handle incoming messages if needed
function handleMsg(msg){
  if(msg.type === "end-session"){
    resetToIntro();
  }
}

async function enterFullscreen(){
  try { await document.documentElement.requestFullscreen(); } catch(e){ console.warn("fs failed", e); }
  // notify PC to hide control QR
  if(ws && ws.readyState===1) ws.send(JSON.stringify({ type:"control-fullscreen", sessionId }));
  // start waiting for tap to actually begin (we already have a button to open FS)
  await waitForTapStart();
}

tapBtn.addEventListener("click", enterFullscreen);

function waitForTapStart(){
  return new Promise((resolve)=>{
    const handler = ()=> { document.removeEventListener("pointerdown", handler); resolve(); };
    document.addEventListener("pointerdown", handler, { once:true });
  }).then(()=> startPhotoFlow());
}

async function startPhotoFlow(){
  // hide instruction video, start camera
  videoInstr.style.display = "none";
  videoCam.style.display = "block";
  overlay.innerText = "";
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
    videoCam.srcObject = stream;
    await videoCam.play();
  } catch(e){
    console.error("camera erro", e);
    return;
  }

  // prepare moldura image
  const mold = new Image();
  mold.crossOrigin = "anonymous";
  mold.src = MOLDURA_PATH;

  // short "prepare" message
  await showOverlayText("Prepare-se para tirar suas fotos", 1500);

  for(let i=1;i<=3;i++){
    await countdownOverlay(5);
    const blob = await captureFramedPhoto(videoCam, mold);
    const dataURL = await blobToDataURL(blob);
    // show preview with mold applied
    showPreview(dataURL);
    // send to PC via WS
    if(ws && ws.readyState===1){
      ws.send(JSON.stringify({ type: "photo", sessionId, filename: `photo_${Date.now()}_${i}.jpg`, data: dataURL }));
    }
    await sleep(3000);
    hidePreview();
  }

  await showOverlayText("✅ Sucesso! Obrigado por utilizar a cabine fotográfica 😃", 2200);

  // after finishing, keep camera open but wait for PC to end session or timeout
  // we'll not auto-reset here; PC triggers end-session
  if(ws && ws.readyState===1){
    ws.send(JSON.stringify({ type: "control-session-done", sessionId }));
  }
}

function captureFramedPhoto(videoEl, moldImage){
  return new Promise((resolve)=>{
    const w = videoEl.videoWidth || 1280;
    const h = videoEl.videoHeight || 720;
    canvasHidden.width = w;
    canvasHidden.height = h;
    const ctx = canvasHidden.getContext("2d");
    ctx.drawImage(videoEl, 0, 0, w, h);
    if(moldImage.complete){
      ctx.drawImage(moldImage, 0, 0, w, h);
      canvasHidden.toBlob(b => resolve(b), "image/jpeg", 0.95);
    } else {
      moldImage.onload = ()=> { ctx.drawImage(moldImage, 0, 0, w, h); canvasHidden.toBlob(b => resolve(b), "image/jpeg", 0.95); };
      moldImage.onerror = ()=> { canvasHidden.toBlob(b => resolve(b), "image/jpeg", 0.95); };
    }
  });
}

function blobToDataURL(blob){
  return new Promise((res)=>{ const fr = new FileReader(); fr.onload = ()=> res(fr.result); fr.readAsDataURL(blob); });
}

function showPreview(dataURL){
  // create or reuse an img overlay
  if(!document.getElementById("__previewImg")){
    const img = document.createElement("img");
    img.id = "__previewImg";
    img.style.position = "absolute";
    img.style.top = "0";
    img.style.left = "0";
    img.style.width = "100%";
    img.style.height = "100%";
    img.style.objectFit = "contain";
    img.style.zIndex = 9998;
    document.body.appendChild(img);
  }
  const img = document.getElementById("__previewImg");
  img.src = dataURL;
  img.style.display = "block";
  // hide camera
  videoCam.style.display = "none";
}

function hidePreview(){
  const img = document.getElementById("__previewImg");
  if(img) img.style.display = "none";
  videoCam.style.display = "block";
}

function showOverlayText(text, ms){
  overlay.innerText = text;
  return sleep(ms).then(()=> overlay.innerText = "");
}

function countdownOverlay(sec){
  return new Promise(async (resolve)=>{
    const overlayCount = document.createElement("div");
    overlayCount.style.position = "absolute";
    overlayCount.style.top = "10%";
    overlayCount.style.width = "100%";
    overlayCount.style.textAlign = "center";
    overlayCount.style.fontSize = "12vw";
    overlayCount.style.zIndex = 9999;
    overlayCount.style.pointerEvents = "none";
    document.body.appendChild(overlayCount);
    for(let i=sec;i>=1;i--){
      overlayCount.innerText = i;
      await sleep(1000);
    }
    document.body.removeChild(overlayCount);
    resolve();
  });
}

function resetToIntro(){
  // stop camera
  try { if(videoCam.srcObject){ videoCam.srcObject.getTracks().forEach(t=>t.stop()); videoCam.srcObject = null; } } catch(e){ console.warn(e); }
  // show instruction again
  videoInstr.style.display = "block";
  videoCam.style.display = "none";
  overlay.innerText = "";
  if(document.exitFullscreen) document.exitFullscreen().catch(()=>{});
}

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
