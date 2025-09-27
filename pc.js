// pc.js - PC Central (AJUSTADO E COMPLETO)
const WS_URL = "wss://chatcabinerender.onrender.com";
const IMGBB_API_KEY = "6734e028b20f88d5795128d242f85582";

let ws;
let sessionId = null;
let fotos = [];
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
const statusWS = document.getElementById("statusWS");
const statusSession = document.getElementById("statusSession");
const statusFotos = document.getElementById("statusFotos");
const fotoCount = document.getElementById("fotoCount");

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
    
    // Atualizar status
    updateStatus();
}

function updateStatus() {
    statusWS.textContent = ws && ws.readyState === WebSocket.OPEN ? "🟢 Conectado" : "🔴 Desconectado";
    statusSession.textContent = sessionId ? `Sessão: ${sessionId}` : "Sessão: Aguardando...";
    statusFotos.textContent = `Fotos: ${fotos.length}`;
    fotoCount.textContent = fotos.length;
}

/* ------------- WebSocket com Reconexão Inteligente ------------- */
function connectWS() {
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
            reconnectAttempts = 0;
            ws.send(JSON.stringify({ type: "register", role: "pc" }));
            updateStatus();
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
            logPC(`🔌 WebSocket fechado. Código: ${event.code}`, "warning");
            updateStatus();
            
            if (event.code !== 1000) {
                scheduleReconnect();
            }
        };
        
        ws.onerror = (error) => {
            logPC("❌ Erro no WebSocket", "error");
            updateStatus();
        };
        
    } catch (error) {
        logPC("❌ Erro ao criar WebSocket: " + error, "error");
        scheduleReconnect();
    }
}

function scheduleReconnect() {
    reconnectAttempts++;
    const delay = RECONNECT_DELAY * Math.min(reconnectAttempts, 5);
    
    if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
        logPC(`🔄 Tentativa de reconexão em ${delay/1000} segundos...`, "warning");
        setTimeout(connectWS, delay);
    }
}

function disconnectWS() {
    if (ws) {
        ws.close(1000, "Desconexão solicitada pelo usuário");
        ws = null;
        updateStatus();
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
            logPC("📱 Controle entrou em tela cheia", "success");
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
        
        const link = document.createElement("a");
        link.href = controlUrl;
        link.target = "_blank";
        link.textContent = "Abrir Controle";
        link.style.display = "block";
        link.style.marginTop = "10px";
        link.style.textAlign = "center";
        qrContainer.appendChild(link);
        
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
    updateUI();
}

function renderGallery() {
    galeria.innerHTML = "";
    
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
            updateUI();
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

/* ------------- Upload para ImgBB ------------- */
async function uploadParaImgBB() {
    if (fotos.length === 0) {
        alert("📭 Nenhuma foto para enviar.");
        return [];
    }
    
    logPC(`🔄 Iniciando upload de ${fotos.length} foto${fotos.length !== 1 ? 's' : ''} para o ImgBB...`, "info");
    
    const uploaded = [];
    
    for (const [index, f] of fotos.entries()) {
        try {
            // Se já tem URL do ImgBB, usa ela
            if (f.imgbbUrl) {
                uploaded.push(f.imgbbUrl);
                logPC(`✅ Foto ${index + 1} já enviada anteriormente: ${f.imgbbUrl}`, "success");
                continue;
            }
            
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
                throw new Error("Resposta inválida do ImgBB");
            }
            
            if (index < fotos.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
            
        } catch (error) {
            logPC(`❌ Erro no upload da foto ${index + 1}: ${error.message}`, "error");
        }
    }
    
    return uploaded;
}

/* ------------- Gerar QR do Visualizador ------------- */
async function generateVisualizerQR() {
    if (fotos.length === 0) {
        alert("📭 Nenhuma foto disponível para gerar o visualizador.");
        return;
    }

    btnGerarVisualizador.disabled = true;
    btnGerarVisualizador.textContent = "Enviando...";

    // Fazer upload primeiro
    const uploaded = await uploadParaImgBB();

    if (uploaded.length === 0) {
        alert("❌ Nenhuma foto foi enviada com sucesso.");
        btnGerarVisualizador.disabled = false;
        btnGerarVisualizador.textContent = "🔗 Gerar QR Code do visualizador";
        return;
    }

    // Gerar QR do visualizador
    const sessionObj = { 
        images: uploaded, 
        createdAt: new Date().toISOString(),
        photoCount: uploaded.length
    };
    
    const enc = btoa(unescape(encodeURIComponent(JSON.stringify(sessionObj))));
    const visualUrl = `${window.location.origin}/visualizador.html?session=${enc}`;
    
    clearQR();
    
    try {
        if (typeof QRCode !== "undefined") {
            new QRCode(qrContainer, { 
                text: visualUrl, 
                width: 220, 
                height: 220,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        }
        
        const link = document.createElement("a");
        link.href = visualUrl;
        link.target = "_blank";
        link.textContent = "Abrir Visualizador";
        link.style.display = "block";
        link.style.marginTop = "10px";
        link.style.textAlign = "center";
        qrContainer.appendChild(link);
        
        logPC(`📊 QR do visualizador gerado: ${visualUrl}`, "success");
        alert(`✅ QR do visualizador gerado para ${uploaded.length} foto${uploaded.length !== 1 ? 's' : ''}!`);
        
    } catch (error) {
        logPC("❌ Erro ao gerar QR do visualizador: " + error, "error");
    }
    
    btnGerarVisualizador.disabled = false;
    btnGerarVisualizador.textContent = "🔗 Gerar QR Code do visualizador";
}

/* ------------- Finalizar Sessão ------------- */
async function finalizarSessao() {
    if (fotos.length === 0) {
        alert("📭 Nenhuma foto na sessão.");
        return;
    }
    
    if (!confirm("Deseja realmente finalizar a sessão? O celular voltará ao início.")) {
        return;
    }
    
    // Enviar comando para celular voltar ao início
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
            type: "end-session", 
            sessionId 
        }));
        logPC("📵 Comando 'end-session' enviado para o celular", "success");
    }
    
    // Limpar interface do PC
    resetSession();
    clearQR();
    
    alert("Sessão finalizada com sucesso!");
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
    btnFinalizarSessao.disabled = !hasSession;
    btnGerarVisualizador.disabled = !hasPhotos;
    
    if (hasPhotos) {
        btnFinalizarSessao.textContent = `⏹️ Finalizar sessão (${fotos.length} foto${fotos.length !== 1 ? 's' : ''})`;
    } else {
        btnFinalizarSessao.textContent = "⏹️ Finalizar sessão";
    }
    
    updateStatus();
}

/* ------------- Event Listeners ------------- */
btnGerarQR.onclick = genControlQR;
btnGerarVisualizador.onclick = generateVisualizerQR;
btnFinalizarSessao.onclick = finalizarSessao;
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
    renderGallery();
});
