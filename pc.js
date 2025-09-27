/*
pc.js
PC Central logic:
- Connects to WebSocket signaling server
- Generates QR for control (control.html?session=SESSIONID)
- Receives photos from control as dataURLs and shows in gallery
- Uploads images to IMGBB on Finalizar sessão using IMGBB_API_KEY
- Generates visualizador QR with session encoded in base64 JSON
PLACEHOLDERS: Replace WS_URL, VERCEL_BASE, IMGBB_API_KEY with real values.
*/
const WS_URL = "ws://SEU_WEBSOCKET_AQUI:3000"; // <-- substitua
const VERCEL_BASE = "https://SEU-PROJETO.vercel.app"; // <-- substitua
const IMGBB_API_KEY = "6734e028b20f88d5795128d242f85582"; // sua API key (recomendo mover para server-side em produção)

let ws;
let sessionId = null;
let images = []; // { filename, dataURL, imgbbUrl }

function connectWS(){
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    console.log("[PC] WS open, registering...");
    ws.send(JSON.stringify({ type: "register", role: "pc" }));
  };
  ws.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    console.log("[PC] message", msg);
    if(msg.type === "registered"){
      sessionId = msg.sessionId;
      console.log("[PC] registered sessionId=", sessionId);
    } else if(msg.type === "photo"){
      // msg.data is dataURL
      addPhotoLocal(msg.filename, msg.data);
    } else if(msg.type === "control-fullscreen"){
      // hide control QR
      hideQRImmediate();
    } else if(msg.type === "control-session-done"){
      console.log("[PC] control signaled session done");
    }
  };
  ws.onclose = ()=> { console.log("[PC] WS closed, reconnecting in 2s"); setTimeout(connectWS,2000); };
  ws.onerror = (e)=> console.error(e);
}

function genControlQr(){
  if(!sessionId){
    alert("Aguardando conexão com o servidor. Tente novamente em 1s.");
    return;
  }
  const controlUrl = `${VERCEL_BASE}/controle.html?session=${sessionId}`;
  const qrContainer = document.getElementById("qrcode");
  qrContainer.innerHTML = "";
  QRCode.toCanvas(controlUrl, { width: 240 }, function (err, canvas) {
    if (err) { console.error(err); alert("Erro gerando QR"); return; }
    qrContainer.appendChild(canvas);
  });
}

function hideQRImmediate(){
  const container = document.getElementById("qrcode");
  container.innerHTML = "";
}

function addPhotoLocal(filename, dataURL){
  const gallery = document.getElementById("galeria");
  const div = document.createElement("div");
  div.className = "thumb";
  div.style.width = "220px";
  div.style.height = "150px";
  div.style.position = "relative";
  div.style.overflow = "hidden";
  const img = document.createElement("img");
  img.src = dataURL;
  img.style.width = "100%";
  img.style.height = "100%";
  img.style.objectFit = "cover";
  div.appendChild(img);
  const removeBtn = document.createElement("button");
  removeBtn.innerText = "X";
  removeBtn.style.position = "absolute";
  removeBtn.style.top = "6px";
  removeBtn.style.right = "6px";
  removeBtn.onclick = ()=> { gallery.removeChild(div); images = images.filter(i=>i.dataURL !== dataURL); };
  div.appendChild(removeBtn);
  // enlarge on click
  img.onclick = ()=> {
    const w = window.open("");
    w.document.write(`<img src="${dataURL}" style="max-width:100%;height:auto" />`);
  };
  gallery.appendChild(div);
  images.push({ filename, dataURL });
}

async function finalizarSessao(){
  if(images.length === 0){ alert("Nenhuma foto na sessão."); return; }
  // upload each to IMGBB
  const uploadedUrls = [];
  for(let i=0;i<images.length;i++){
    const img = images[i];
    const base64 = img.dataURL.split(",")[1];
    const form = new FormData();
    form.append("key", IMGBB_API_KEY);
    form.append("image", base64);
    try{
      const res = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: form });
      const json = await res.json();
      if(json && json.success && json.data && json.data.url){
        uploadedUrls.push(json.data.url);
        img.imgbbUrl = json.data.url;
      } else {
        console.error("[PC] IMGBB error", json);
      }
    } catch(e){
      console.error("[PC] upload failed", e);
    }
  }
  // prepare visualizador session (encode JSON base64)
  const sessionObj = { images: uploadedUrls, createdAt: Date.now() };
  const enc = btoa(unescape(encodeURIComponent(JSON.stringify(sessionObj))));
  const visualUrl = `${VERCEL_BASE}/visualizador.html?session=${enc}`;
  // show QR for visualizador
  const qrContainer = document.getElementById("qrcode");
  qrContainer.innerHTML = "";
  QRCode.toCanvas(visualUrl, { width: 240 }, function(err, canvas){
    if(err){ console.error(err); }
    qrContainer.appendChild(canvas);
  });
  // clear local images
  images = [];
  document.getElementById("galeria").innerHTML = "";
  // notify control to reset
  if(ws && ws.readyState === 1){ ws.send(JSON.stringify({ type: "end-session", sessionId })); }
  alert("Sessão finalizada. QR de visualização gerado.");
}

window.addEventListener("load", ()=>{
  if(typeof QRCode === "undefined") {
    console.warn("QRCode library required (script tag included in index).");
  }
  document.getElementById("btnQr").onclick = genControlQr;
  document.getElementById("finalizar").onclick = finalizarSessao;
  document.getElementById("iniciar").onclick = ()=> {
    if(ws && ws.readyState===1) ws.send(JSON.stringify({ type:"start-session", sessionId }));
  };
  connectWS();
});
