// pc.js - PC Central
const WS_URL = "wss://chatcabinerender.onrender.com";
const IMGBB_API_KEY = "6734e028b20f88d5795128d242f85582";

let ws;
let sessionId = null;
let fotos = []; // { filename, dataURL, imgbbUrl }

const videoPC = document.getElementById("videoPC");
const qrContainer = document.getElementById("qrContainer");
const galeria = document.getElementById("galeria");
const btnGerarQR = document.getElementById("btnGerarQR");
const btnGerarVisualizador = document.getElementById("btnGerarVisualizador");
const btnFinalizarSessao = document.getElementById("btnFinalizarSessao");
const logContainer = document.getElementById("logContainer");

function logPC(msg){
  console.log("[PC]", msg);
  if(logContainer){
    const p = document.createElement("p");
    p.innerText = msg;
    logContainer.appendChild(p);
    logContainer.scrollTop = logContainer.scrollHeight;
  }
}

function connectWS(){
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    logPC("WS aberto");
    ws.send(JSON.stringify({ type: "register", role: "pc" }));
  };
  ws.onmessage = (ev) => {
    try{
      const msg = JSON.parse(ev.data);
      handleMessage(msg);
    }catch(e){ logPC("Erro parse WS: "+e); }
  };
  ws.onclose = ()=> { logPC("WS fechado, reconectando em 2s"); setTimeout(connectWS,2000); };
  ws.onerror = (e)=> logPC("WS error: "+e);
}

function handleMessage(msg){
  if(msg.type === "registered"){
    sessionId = msg.sessionId;
    logPC("Registrado sessionId="+sessionId);
  } else if(msg.type === "photo"){
    addPhotoLocal(msg.filename, msg.data);
  } else if(msg.type === "webrtc-offer"){
    startWebRTCReceive(msg.sdp, msg.from);
  } else if(msg.type === "control-fullscreen"){
    clearQR();
  } else if(msg.type === "end-session"){
    logPC("Sessão finalizada pelo controle");
  } else if(msg.type === "log"){
    logPC("[CONTROL] "+msg.msg);
  }
}

/* ------------- QR helpers ------------- */
function clearQR(){ qrContainer.innerHTML = ""; }

function genControlQR(){
  if(!sessionId){
    alert("Aguardando conexão com o servidor...");
    return;
  }
  const controlUrl = `${location.origin}/controle.html?session=${sessionId}`;
  qrContainer.innerHTML = "";
  new QRCode(qrContainer, { text: controlUrl, width:220, height:220 });
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
    div.className="thumb";
    const img = document.createElement("img");
    img.src=f.dataURL;
    img.alt=f.filename;
    img.style.cursor="pointer";
    img.onclick = ()=>{
      // ampliar na mesma página
      const overlayImg = document.createElement("div");
      overlayImg.style.position="fixed";
      overlayImg.style.top=0;
      overlayImg.style.left=0;
      overlayImg.style.width="100%";
      overlayImg.style.height="100%";
      overlayImg.style.background="rgba(0,0,0,0.9)";
      overlayImg.style.display="flex";
      overlayImg.style.justifyContent="center";
      overlayImg.style.alignItems="center";
      overlayImg.style.zIndex=9999;
      overlayImg.innerHTML=`<img src="${f.dataURL}" style="max-width:90%; max-height:90%;">`;
      overlayImg.addEventListener("click", ()=>{ overlayImg.remove(); });
      document.body.appendChild(overlayImg);
    };
    const btn = document.createElement("button");
    btn.innerText="X";
    btn.onclick = ()=>{
      fotos.splice(idx,1);
      renderGallery();
    };
    div.appendChild(img);
    div.appendChild(btn);
    galeria.appendChild(div);
  });
}

/* ------------- Finalizar sessão ------------- */
async function finalizarSessao(){
  if(fotos.length===0){ alert("Nenhuma foto na sessão."); return; }
  btnGerarVisualizador.disabled=true;

  const uploaded=[];
  for(const f of fotos){
    try{
      const base64 = f.dataURL.split(",")[1];
      const form = new FormData();
      form.append("key", IMGBB_API_KEY);
      form.append("image", base64);
      const res = await fetch("https://api.imgbb.com/1/upload", { method:"POST", body:form });
      const json = await res.json();
      if(json && json.data && json.data.url){
        uploaded.push(json.data.url);
        f.imgbbUrl=json.data.url;
        logPC("Foto "+f.filename+" enviada para IMGBB");
      } else { logPC("IMGBB resposta inválida: "+JSON.stringify(json)); }
    }catch(e){ logPC("Erro upload IMGBB: "+e); }
  }

  const sessionObj={ images: uploaded, createdAt: Date.now() };
  const enc=btoa(unescape(encodeURIComponent(JSON.stringify(sessionObj))));
  const visualUrl=`${location.origin}/visualizador.html?session=${enc}`;

  qrContainer.innerHTML="";
  new QRCode(qrContainer,{ text:visualUrl, width:220, height:220 });
  logPC("QR do visualizador gerado");

  fotos=[];
  renderGallery();

  if(ws && ws.readyState===1){
    ws.send(JSON.stringify({ type:"end-session", sessionId }));
  }

  alert("Sessão finalizada. QR de visualização gerado.");
}

/* ------------- WebRTC receiver (vídeo celular) ------------- */
let pcReceiver=null;
let dataChannelReceiver=null;

async function startWebRTCReceive(offerSDP, fromId){
  if(pcReceiver){ pcReceiver.close(); pcReceiver=null; }
  pcReceiver=new RTCPeerConnection();
  pcReceiver.ontrack=(e)=>{
    try{ videoPC.srcObject=e.streams[0]; videoPC.play().catch(()=>{}); logPC("Recebendo vídeo do celular"); }
    catch(err){ logPC("Erro attach vídeo: "+err); }
  };
  pcReceiver.ondatachannel=(ev)=>{
    dataChannelReceiver=ev.channel;
    dataChannelReceiver.onmessage=(e)=>{ logPC("[DataChannel] "+e.data); };
  };
  await pcReceiver.setRemoteDescription({ type:"offer", sdp:offerSDP });
  const answer = await pcReceiver.createAnswer();
  await pcReceiver.setLocalDescription(answer);
  if(ws && ws.readyState===1){
    ws.send(JSON.stringify({ type:"webrtc-answer", sessionId, to:fromId, sdp:pcReceiver.localDescription.sdp }));
  }
  logPC("WebRTC answer enviado");
}

/* ------------- Bind UI ------------- */
btnGerarQR.onclick=genControlQR;
btnFinalizarSessao.onclick=finalizarSessao;
btnGerarVisualizador.onclick=()=>{
  alert("O QR do visualizador é gerado automaticamente ao finalizar a sessão (use Finalizar sessão).");
};

/* ------------- Start WS ------------- */
connectWS();
