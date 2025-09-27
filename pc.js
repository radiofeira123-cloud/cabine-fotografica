// pc.js - PC Central
// ATENÇÃO: mantenha exatamente este arquivo (não remova partes).
const WS_URL = "wss://chatcabinerender.onrender.com"; // seu servidor Render
const IMGBB_API_KEY = "6734e028b20f88d5795128d242f85582"; // sua API key

let ws;
let sessionId = null;
let fotos = []; // { filename, dataURL, imgbbUrl }

const videoPC = document.getElementById("videoPC");
const qrContainer = document.getElementById("qrContainer");
const galeria = document.getElementById("galeria");
const btnGerarQR = document.getElementById("btnGerarQR");
const btnGerarVisualizador = document.getElementById("btnGerarVisualizador");
const btnFinalizarSessao = document.getElementById("btnFinalizarSessao");

function connectWS(){
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    console.log("[PC] WS aberto");
    ws.send(JSON.stringify({ type: "register", role: "pc" }));
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      handleMessage(msg);
    } catch(e){ console.error("[PC] parse msg", e); }
  };
  ws.onclose = ()=> { console.log("[PC] WS fechado, reconectando em 2s"); setTimeout(connectWS,2000); };
  ws.onerror = (e)=> console.error("[PC] WS error", e);
}

function handleMessage(msg){
  if(msg.type === "registered"){
    sessionId = msg.sessionId;
    console.log("[PC] registrado sessionId=", sessionId);
  } else if(msg.type === "photo"){
    // photo from control: msg.data is dataURL
    addPhotoLocal(msg.filename, msg.data);
  } else if(msg.type === "webrtc-offer"){
    // offer contains sdp and from
    startWebRTCReceive(msg.sdp, msg.from);
  } else if(msg.type === "control-fullscreen"){
    // hide QR (control entered fullscreen)
    clearQR();
  } else if(msg.type === "end-session"){
    // control signaled session end
    console.log("[PC] control ended session");
  }
}

/* ------------- QR helpers ------------- */
function clearQR(){ qrContainer.innerHTML = ""; }

function genControlQR(){
  if(!sessionId){
    alert("Aguardando conexão com o servidor. Aguarde 1s e tente novamente.");
    return;
  }
  const controlUrl = `${location.origin}/controle.html?session=${sessionId}`;
  qrContainer.innerHTML = "";
  new QRCode(qrContainer, { text: controlUrl, width: 220, height:220 });
}

/* ------------- Gallery ------------- */
function addPhotoLocal(filename, dataURL){
  fotos.push({ filename, dataURL });
  renderGallery();
}

function renderGallery(){
  galeria.innerHTML = "";
  fotos.forEach((f, idx)=>{
    const div = document.createElement("div");
    div.className = "thumb";
    const img = document.createElement("img");
    img.src = f.dataURL;
    img.alt = f.filename;
    img.onclick = ()=> {
      const w = window.open("");
      w.document.write(`<img src="${f.dataURL}" style="max-width:100%;">`);
    };
    const btn = document.createElement("button");
    btn.innerText = "X";
    btn.onclick = ()=> { fotos.splice(idx,1); renderGallery(); };
    div.appendChild(img);
    div.appendChild(btn);
    galeria.appendChild(div);
  });
}

/* ------------- Finalizar sessão (upload IMGBB + gerar QR visualizador) ------------- */
async function finalizarSessao(){
  if(fotos.length === 0) { alert("Nenhuma foto na sessão."); return; }

  btnGerarVisualizador.disabled = true;
  // upload all fotos
  const uploaded = [];
  for(const f of fotos){
    try {
      const base64 = f.dataURL.split(",")[1];
      const form = new FormData();
      form.append("key", IMGBB_API_KEY);
      form.append("image", base64);
      const res = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: form });
      const json = await res.json();
      if(json && json.data && json.data.url) {
        uploaded.push(json.data.url);
        f.imgbbUrl = json.data.url;
      } else {
        console.error("[PC] IMGBB responso inválido", json);
      }
    } catch(e){
      console.error("[PC] upload erro", e);
    }
  }

  // criar session object e codificar em base64
  const sessionObj = { images: uploaded, createdAt: Date.now() };
  const enc = btoa(unescape(encodeURIComponent(JSON.stringify(sessionObj))));
  const visualUrl = `${location.origin}/visualizador.html?session=${enc}`;

  // gerar QR do visualizador
  qrContainer.innerHTML = "";
  new QRCode(qrContainer, { text: visualUrl, width: 220, height:220 });
  btnGerarVisualizador.disabled = false;

  // limpar fotos locais (PC)
  fotos = [];
  renderGallery();

  // notificar controle para voltar ao vídeo inicial
  if(ws && ws.readyState === 1){
    ws.send(JSON.stringify({ type: "end-session", sessionId }));
  }

  alert("Sessão finalizada. QR de visualização gerado.");
}

/* ------------- WebRTC receiver (video do celular para PC) ------------- */
let pcReceiver = null;
let dataChannelReceiver = null;

async function startWebRTCReceive(offerSDP, fromId){
  // cria RTCPeerConnection
  if(pcReceiver) {
    pcReceiver.close();
    pcReceiver = null;
  }
  pcReceiver = new RTCPeerConnection();
  pcReceiver.ontrack = (e) => {
    // primeira track de vídeo -> attach to videoPC
    try {
      videoPC.srcObject = e.streams[0];
      videoPC.play().catch(()=>{});
    } catch(err){ console.error(err); }
  };
  pcReceiver.ondatachannel = (ev) => {
    dataChannelReceiver = ev.channel;
    dataChannelReceiver.onmessage = (e) => {
      // caso precise mensagens extras
      console.log("[PC] dataChannel msg:", e.data);
    };
  };

  await pcReceiver.setRemoteDescription({ type: "offer", sdp: offerSDP });
  const answer = await pcReceiver.createAnswer();
  await pcReceiver.setLocalDescription(answer);

  // enviar answer via signaling
  if(ws && ws.readyState===1){
    ws.send(JSON.stringify({ type: "webrtc-answer", sessionId, to: fromId, sdp: pcReceiver.localDescription.sdp }));
  }
}

/* ------------- Utilidades ------------- */
function generateUUID(){
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c){
    const r = Math.random()*16|0, v = c==='x' ? r : (r&0x3|0x8);
    return v.toString(16);
  });
}

/* ------------- Bind UI ------------- */
btnGerarQR.onclick = genControlQR;
btnFinalizarSessao.onclick = finalizarSessao;
btnGerarVisualizador.onclick = ()=> {
  alert("O QR do visualizador é gerado automaticamente ao finalizar a sessão (use Finalizar sessão).");
};

/* ------------- Start WS ------------- */
connectWS();
