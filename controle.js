/*
controle.js
Controle (celular) logic:
- Connects to WS server and registers as control with session from URL param
- Plays loop video until first touch
- On fullscreen entry, notifies PC to hide QR
- On touch: run photo flow:
  - show "Prepare-se..." text
  - for each of 3 photos: 5s countdown overlay, capture frame, apply frame PNG, send to PC via WS (photo message with dataURL), show framed preview for 3s
- After flow, show success message briefly and keep waiting. On receiving end-session from PC, reset to intro video.
PLACEHOLDERS: Replace WS_URL, GITHUB_RAW_MOLDURA_URL, GITHUB_RAW_VIDEO_URL
*/
const WS_URL = "ws://SEU_WEBSOCKET_AQUI:3000"; // <-- substitua
const GITHUB_MOLDURA = "GITHUB_RAW_MOLDURA_URL"; // <-- substitua (raw.githubusercontent link)
const GITHUB_VIDEO = "GITHUB_RAW_VIDEO_URL"; // <-- substitua

const urlParams = new URLSearchParams(location.search);
const sessionId = urlParams.get("session") || null;

let ws;
function connectWS(){
  ws = new WebSocket(WS_URL);
  ws.onopen = ()=> {
    console.log("[CONTROL] WS open, registering");
    ws.send(JSON.stringify({ type: "register", role: "control", sessionId }));
  };
  ws.onmessage = (ev)=> {
    const msg = JSON.parse(ev.data);
    console.log("[CONTROL] msg", msg);
    if(msg.type === "end-session"){
      resetToIntro();
    }
  };
  ws.onclose = ()=> { console.log("[CONTROL] WS closed, reconnecting in 2s"); setTimeout(connectWS,2000); };
}
connectWS();

const instr = document.getElementById("video-instrucoes");
const cam = document.getElementById("camera");
const fsBtn = document.getElementById("fullscreen");
const previewCanvas = document.getElementById("canvas");
const mensagem = document.getElementById("mensagem");
const previewImg = document.createElement("img");
previewImg.style.width = "100%";
previewImg.style.height = "100%";
previewImg.style.objectFit = "contain";
document.body.appendChild(previewImg);
previewImg.style.display = "none";

// load video src
instr.src = GITHUB_VIDEO;
instr.loop = true;
instr.muted = true;
instr.play().catch(()=>{});

// fullscreen entry
async function enterFullscreenAndStart(){
  try{
    if(document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
  }catch(e){
    console.warn("Fullscreen request failed", e);
  }
  // notify PC to hide QR
  if(ws && ws.readyState===1) ws.send(JSON.stringify({ type: "control-fullscreen", sessionId }));
  // hide controls UI, play video and wait for touch
  instr.style.display = "block";
  cam.style.display = "none";
  previewImg.style.display = "none";
  mensagem.innerText = "";
  // wait for first tap to start flow
  const handler = async ()=> {
    document.removeEventListener("pointerdown", handler);
    await startPhotoFlow();
  };
  document.addEventListener("pointerdown", handler, { once: true });
}

fsBtn.addEventListener("click", enterFullscreenAndStart);

async function startPhotoFlow(){
  // stop instruction and start camera
  instr.style.display = "none";
  previewImg.style.display = "none";
  cam.style.display = "block";
  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false });
  cam.srcObject = stream;
  await cam.play();

  // prepare mold image
  const mold = new Image();
  mold.crossOrigin = "anonymous";
  mold.src = GITHUB_MOLDURA;

  await sleep(600);
  await showText("Prepare-se para tirar suas fotos", 1400);

  for(let i=1;i<=3;i++){
    await countdown(5);
    const blob = await captureFramedPhoto(cam, mold);
    const dataURL = await blobToDataURL(blob);
    // show framed preview
    previewImg.src = dataURL;
    previewImg.style.display = "block";
    cam.style.display = "none";
    // send to PC
    if(ws && ws.readyState===1){
      ws.send(JSON.stringify({ type: "photo", sessionId, filename: `photo_${Date.now()}_${i}.jpg`, data: dataURL }));
    }
    await sleep(3000);
    previewImg.style.display = "none";
    cam.style.display = "block";
  }

  await showText("✅ Sucesso! Obrigado por utilizar a cabine fotográfica 😃", 2300);
  // notify PC optional
  if(ws && ws.readyState===1) ws.send(JSON.stringify({ type: "control-session-done", sessionId }));
}

function captureFramedPhoto(videoEl, moldImage){
  return new Promise((resolve)=> {
    const w = videoEl.videoWidth || 1280;
    const h = videoEl.videoHeight || 720;
    previewCanvas.width = w;
    previewCanvas.height = h;
    const ctx = previewCanvas.getContext("2d");
    // draw video frame
    ctx.drawImage(videoEl, 0, 0, w, h);
    // draw mold covering whole canvas
    if(moldImage.complete){
      ctx.drawImage(moldImage, 0, 0, w, h);
      previewCanvas.toBlob((b)=> resolve(b), "image/jpeg", 0.95);
    } else {
      moldImage.onload = ()=> {
        ctx.drawImage(moldImage, 0, 0, w, h);
        previewCanvas.toBlob((b)=> resolve(b), "image/jpeg", 0.95);
      };
      moldImage.onerror = ()=> {
        // even if mold fails, send bare photo
        previewCanvas.toBlob((b)=> resolve(b), "image/jpeg", 0.95);
      };
    }
  });
}

function blobToDataURL(blob){
  return new Promise((res)=> {
    const fr = new FileReader();
    fr.onload = ()=> res(fr.result);
    fr.readAsDataURL(blob);
  });
}

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

async function showText(txt, ms){
  mensagem.style.position = "fixed";
  mensagem.style.left = "0";
  mensagem.style.right = "0";
  mensagem.style.top = "10%";
  mensagem.style.fontSize = "32px";
  mensagem.style.textAlign = "center";
  mensagem.style.background = "rgba(0,0,0,0.35)";
  mensagem.style.color = "#fff";
  mensagem.style.padding = "12px";
  mensagem.innerText = txt;
  await sleep(ms);
  mensagem.innerText = "";
}

function countdown(seconds){
  return new Promise(async (resolve)=>{
    const overlay = document.createElement("div");
    overlay.id = "countOverlay";
    overlay.style.position = "fixed";
    overlay.style.top = "10%";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.textAlign = "center";
    overlay.style.fontSize = "96px";
    overlay.style.fontWeight = "700";
    overlay.style.color = "#fff";
    overlay.style.zIndex = 9999;
    document.body.appendChild(overlay);
    for(let i=seconds;i>=1;i--){
      overlay.innerText = i;
      await sleep(1000);
    }
    document.body.removeChild(overlay);
    resolve();
  });
}

function resetToIntro(){
  // stop camera
  try{
    if(cam.srcObject){
      const tracks = cam.srcObject.getTracks();
      tracks.forEach(t=>t.stop());
      cam.srcObject = null;
    }
  }catch(e){ console.warn(e); }
  // show instruction video and button
  instr.style.display = "block";
  cam.style.display = "none";
  previewImg.style.display = "none";
  mensagem.innerText = "";
  if(document.exitFullscreen) document.exitFullscreen().catch(()=>{});
}

// utility to convert blob to base64 (if needed)
// blobToDataURL defined above
