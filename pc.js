// pc.js - PC Central
const WS_URL = "wss://chatcabinerender.onrender.com";
const IMGBB_API_KEY = "6734e028b20f88d5795128d242f85582";

let ws;
let sessionId = null;
let fotos = []; // { filename, dataURL, imgbbUrl }
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 2000;

// Elementos da interface
const videoPC = document.getElementById("videoPC");
const qrContainer = document.getElementById("qrContainer");
const galeria = document.getElementById("galeria");
const logContainer = document.getElementById("logContainer");
const btnGerarQR = document.getElementById("btnGerarQR");
const btnGerarVisualizador = document.getElementById("btnGerarVisualizador");
const btnFinalizarSessao = document.getElementById("btnFinalizarSessao");
const btnLimparLogs = document.getElementById("btnLimparLogs");

// WebRTC
let pcReceiver = null;
let dataChannelReceiver = null;

/* ------------- Sistema de Logs Melhorado ------------- */
function logPC(msg, type = "info") {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement("div");
  logEntry.className = `log-entry log-${type}`;
  logEntry.innerHTML = `[${timestamp}] ${msg}`;
  logContainer.appendChild(logEntry);
  logContainer.scrollTop = logContainer.scrollHeight;
  console.log(`[PC][${type.toUpperCase()}]`, msg);
}

/* ------------- WebSocket com Reconexão Inteligente ------------- */
function connectWS() {
  // Evitar múltiplas conexões
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
    logPC("WebSocket já está conectado/conectando...", "warning");
    return;
  }

  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    logPC(`Máximo de tentativas de reconexão atingido (${MAX_RECONNECT_ATTEMPTS})`, "error");
    return;
  }

  logPC(`Conectando ao WebSocket... (Tentativa ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`, "info");
  
  try {
    ws = new WebSocket(WS_URL);
    
    ws.onopen = () => {
      logPC("✅ WebSocket conectado com sucesso", "success");
      reconnectAttempts = 0; // Resetar contador em conexão bem-sucedida
      ws.send(JSON.stringify({ type: "register", role: "pc" }));
    };
    
    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);
        handleMessage(msg);
      } catch (e) { 
        logPC("❌ Erro ao parsear mensagem WebSocket: " + e, "error"); 
      }
    };
    
    ws.onclose = (event) => {
      logPC(`🔌 WebSocket fechado. Código: ${event.code}, Razão: ${event.reason || 'N/A'}`, "warning");
      
      if (event.code !== 1000) { // 1000 = fechamento normal
        scheduleReconnect();
      }
    };
    
    ws.onerror = (error) => {
      logPC("❌ Erro no WebSocket: " + JSON.stringify(error), "error");
    };
    
  } catch (error) {
    logPC("❌ Erro ao criar WebSocket: " + error, "error");
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  reconnectAttempts++;
  const delay = RECONNECT_DELAY * Math.min(reconnectAttempts, 5); // Backoff exponencial limitado
  
  if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
    logPC(`🔄 Tentativa de reconexão em ${delay/1000} segundos...`, "warning");
    setTimeout(connectWS, delay);
  }
}

function disconnectWS() {
  if (ws) {
    ws.close(1000, "Desconexão solicitada pelo usuário");
    ws = null;
  }
}

/* ------------- Manipulação de Mensagens WebSocket ------------- */
function handleMessage(msg) {
  logPC(`📨 Mensagem recebida: ${msg.type}`, "info");
  
  switch (msg.type) {
    case "registered":
      sessionId = msg.sessionId;
      logPC(`✅ Registrado com sessionId: ${sessionId}`, "success");
      updateUI();
      break;
      
    case "photo":
      addPhotoLocal(msg.filename, msg.data);
      break;
      
    case "webrtc-offer":
      startWebRTCReceive(msg.sdp, msg.from);
      break;
      
    case "control-fullscreen":
      clearQR();
      break;
      
    case "end-session":
      logPC("📵 Sessão finalizada pelo controle", "warning");
      resetSession();
      break;
      
    case "log":
      logPC(`[CONTROL] ${msg.msg}`, "info");
      break;
      
    default:
      logPC(`⚠️ Tipo de mensagem desconhecido: ${msg.type}`, "warning");
  }
}

/* ------------- Gerenciamento de QR Codes ------------- */
function clearQR() { 
  qrContainer.innerHTML = ""; 
}

function genControlQR() {
  if (!sessionId) {
    alert("⏳ Aguardando conexão com o servidor...");
    return;
  }
  
  const controlUrl = `${window.location.origin}/controle.html?session=${sessionId}`;
  clearQR();
  
  try {
    new QRCode(qrContainer, { 
      text: controlUrl, 
      width: 220, 
      height: 220,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
    logPC(`📱 QR Code do controle gerado: ${controlUrl}`, "success");
  } catch (error) {
    logPC("❌ Erro ao gerar QR Code: " + error, "error");
  }
}

/* ------------- Galeria de Fotos ------------- */
function addPhotoLocal(filename, dataURL) {
  const foto = { filename, dataURL, timestamp: new Date().toLocaleTimeString() };
  fotos.push(foto);
  renderGallery();
  logPC(`📸 Foto recebida: ${filename} (Total: ${fotos.length})`, "success");
}

function renderGallery() {
  galeria.innerHTML = "";
  
  // Atualizar título da galeria
  const galleryTitle = document.querySelector("h3");
  if (galleryTitle) {
    galleryTitle.textContent = `Galeria de Fotos (${fotos.length} foto${fotos.length !== 1 ? 's' : ''})`;
  }
  
  fotos.forEach((f, idx) => {
    const div = document.createElement("div");
    div.className = "thumb";
    div.title = `Foto ${idx + 1} - ${f.timestamp}`;
    
    const img = document.createElement("img");
    img.src = f.dataURL;
    img.alt = f.filename;
    img.style.cursor = "pointer";
    img.onclick = () => amplifyPhoto(f.dataURL);
    
    const btn = document.createElement("button");
    btn.innerText = "X";
    btn.title = "Remover foto";
    btn.onclick = (e) => {
      e.stopPropagation();
      fotos.splice(idx, 1);
      renderGallery();
      logPC(`🗑️ Foto ${idx + 1} removida`, "warning");
    };
    
    div.appendChild(img);
    div.appendChild(btn);
    galeria.appendChild(div);
  });
}

function amplifyPhoto(dataURL) {
  const overlayImg = document.createElement("div");
  overlayImg.style.position = "fixed";
  overlayImg.style.top = "0";
  overlayImg.style.left = "0";
  overlayImg.style.width = "100%";
  overlayImg.style.height = "100%";
  overlayImg.style.background = "rgba(0,0,0,0.95)";
  overlayImg.style.display = "flex";
  overlayImg.style.justifyContent = "center";
  overlayImg.style.alignItems = "center";
  overlayImg.style.zIndex = "9999";
  overlayImg.style.cursor = "pointer";
  
  const imgElement = document.createElement("img");
  imgElement.src = dataURL;
  imgElement.style.maxWidth = "90%";
  imgElement.style.maxHeight = "90%";
  imgElement.style.objectFit = "contain";
  
  overlayImg.appendChild(imgElement);
  overlayImg.addEventListener("click", () => overlayImg.remove());
  document.body.appendChild(overlayImg);
  
  logPC("🔍 Foto ampliada", "info");
}

/* ------------- Finalizar Sessão e Upload ------------- */
async function finalizarSessao() {
  if (fotos.length === 0) {
    alert("📭 Nenhuma foto na sessão para finalizar.");
    return;
  }
  
  if (!confirm(`Deseja finalizar a sessão? ${fotos.length} foto${fotos.length !== 1 ? 's' : ''} serão enviadas para o ImgBB.`)) {
    return;
  }
  
  btnFinalizarSessao.disabled = true;
  btnFinalizarSessao.textContent = "Enviando...";
  
  logPC(`🔄 Iniciando upload de ${fotos.length} foto${fotos.length !== 1 ? 's' : ''} para o ImgBB...`, "info");
  
  const uploaded = [];
  
  for (const [index, f] of fotos.entries()) {
    try {
      logPC(`📤 Enviando foto ${index + 1}/${fotos.length}: ${f.filename}`, "info");
      
      const base64 = f.dataURL.split(",")[1];
      const form = new FormData();
      form.append("key", IMGBB_API_KEY);
      form.append("image", base64);
      
      const res = await fetch("https://api.imgbb.com/1/upload", { 
        method: "POST", 
        body: form 
      });
      
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      
      const json = await res.json();
      
      if (json && json.data && json.data.url) {
        uploaded.push(json.data.url);
        f.imgbbUrl = json.data.url;
        logPC(`✅ Foto ${index + 1} enviada: ${json.data.url}`, "success");
      } else {
        throw new Error("Resposta inválida do ImgBB: " + JSON.stringify(json));
      }
      
      // Pequena pausa entre uploads para evitar rate limiting
      if (index < fotos.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
    } catch (error) {
      logPC(`❌ Erro no upload da foto ${index + 1}: ${error.message}`, "error");
    }
  }
  
  if (uploaded.length > 0) {
    generateVisualizerQR(uploaded);
  } else {
    logPC("❌ Nenhuma foto foi enviada com sucesso", "error");
    alert("Erro: Nenhuma foto foi enviada. Verifique os logs.");
  }
  
  btnFinalizarSessao.disabled = false;
  btnFinalizarSessao.textContent = "Finalizar sessão";
}

function generateVisualizerQR(uploadedUrls) {
  const sessionObj = { 
    images: uploadedUrls, 
    createdAt: new Date().toISOString(),
    photoCount: uploadedUrls.length
  };
  
  const enc = btoa(unescape(encodeURIComponent(JSON.stringify(sessionObj))));
  const visualUrl = `${window.location.origin}/visualizador.html?session=${enc}`;
  
  clearQR();
  
  try {
    new QRCode(qrContainer, { 
      text: visualUrl, 
      width: 220, 
      height: 220,
      colorDark: "#000000",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
    
    logPC(`📊 QR do visualizador gerado: ${visualUrl}`, "success");
    logPC(`✅ Sessão finalizada com ${uploadedUrls.length} foto${uploadedUrls.length !== 1 ? 's' : ''} enviadas`, "success");
    
    // Adicionar link abaixo do QR
    const link = document.createElement("a");
    link.href = visualUrl;
    link.target = "_blank";
    link.textContent = "Abrir Visualizador";
    link.style.display = "block";
    link.style.marginTop = "10px";
    link.style.textAlign = "center";
    qrContainer.appendChild(link);
    
  } catch (error) {
    logPC("❌ Erro ao gerar QR do visualizador: " + error, "error");
  }
  
  // Limpar galeria e resetar sessão
  fotos = [];
  renderGallery();
  resetSession();
  
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: "end-session", sessionId }));
  }
  
  alert(`✅ Sessão finalizada! ${uploadedUrls.length} foto${uploadedUrls.length !== 1 ? 's' : ''} enviadas com sucesso.`);
}

function resetSession() {
  fotos = [];
  renderGallery();
  sessionId = null;
  updateUI();
  logPC("🔄 Sessão resetada", "info");
}

/* ------------- WebRTC Receiver ------------- */
async function startWebRTCReceive(offerSDP, fromId) {
  if (pcReceiver) {
    pcReceiver.close();
    pcReceiver = null;
  }
  
  try {
    pcReceiver = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    
    pcReceiver.ontrack = (e) => {
      try {
        videoPC.srcObject = e.streams[0];
        videoPC.play().catch(() => {});
        logPC("📹 Recebendo vídeo do celular", "success");
      } catch (err) {
        logPC("❌ Erro ao anexar vídeo: " + err, "error");
      }
    };
    
    pcReceiver.ondatachannel = (ev) => {
      dataChannelReceiver = ev.channel;
      dataChannelReceiver.onmessage = (e) => {
        logPC(`[DataChannel] ${e.data}`, "info");
      };
    };
    
    await pcReceiver.setRemoteDescription({ type: "offer", sdp: offerSDP });
    const answer = await pcReceiver.createAnswer();
    await pcReceiver.setLocalDescription(answer);
    
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ 
        type: "webrtc-answer", 
        sessionId, 
        to: fromId, 
        sdp: pcReceiver.localDescription.sdp 
      }));
      logPC("✅ WebRTC answer enviado", "success");
    }
    
  } catch (error) {
    logPC("❌ Erro no WebRTC: " + error, "error");
  }
}

/* ------------- Atualização da Interface ------------- */
function updateUI() {
  const hasSession = !!sessionId;
  const hasPhotos = fotos.length > 0;
  
  btnGerarQR.disabled = !hasSession;
  btnFinalizarSessao.disabled = !hasPhotos;
}

/* ------------- Event Listeners ------------- */
btnGerarQR.onclick = genControlQR;
btnFinalizarSessao.onclick = finalizarSessao;
btnGerarVisualizador.onclick = () => {
  alert("ℹ️ O QR do visualizador é gerado automaticamente ao finalizar a sessão.");
};

btnLimparLogs.onclick = () => {
  logContainer.innerHTML = "";
  logPC("📋 Logs limpos", "info");
};

// Limpeza ao fechar a página
window.addEventListener("beforeunload", () => {
  disconnectWS();
  if (pcReceiver) {
    pcReceiver.close();
  }
});

/* ------------- Inicialização ------------- */
document.addEventListener("DOMContentLoaded", () => {
  logPC("🚀 PC Central inicializado", "success");
  connectWS();
  updateUI();
});
