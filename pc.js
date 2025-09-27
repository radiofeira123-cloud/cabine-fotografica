// pc.js - PC Central (AJUSTADO)
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

// WebRTC
let pcReceiver = null;
let dataChannelReceiver = null;

/* ------------- Logs ------------- */
function logPC(msg, type = "info") {
    const timestamp = new Date().toLocaleTimeString();
    const logEntry = document.createElement("div");
    logEntry.className = `log-entry log-${type}`;
    logEntry.innerHTML = `[${timestamp}] ${msg}`;
    logContainer.appendChild(logEntry);
    logContainer.scrollTop = logContainer.scrollHeight;
    console.log(`[PC][${type.toUpperCase()}]`, msg);
}

/* ------------- WebSocket com Reconexão ------------- */
function connectWS() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        logPC("⚠️ Máximo de tentativas de reconexão atingido", "error");
        return;
    }

    logPC(`Conectando WebSocket... (Tentativa ${reconnectAttempts + 1})`, "info");

    try {
        ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            logPC("✅ WebSocket conectado", "success");
            reconnectAttempts = 0;
            ws.send(JSON.stringify({ type: "register", role: "pc" }));
        };

        ws.onmessage = (ev) => {
            try {
                const msg = JSON.parse(ev.data);
                handleMessage(msg);
            } catch (e) {
                logPC("❌ Erro parse WS: " + e, "error");
            }
        };

        ws.onclose = (event) => {
            logPC(`🔌 WS fechado (${event.code})`, "warning");
            if (event.code !== 1000) scheduleReconnect();
        };

        ws.onerror = (error) => logPC("❌ Erro WS", "error");

    } catch (error) {
        logPC("❌ Erro criar WS: " + error, "error");
        scheduleReconnect();
    }
}

function scheduleReconnect() {
    reconnectAttempts++;
    const delay = RECONNECT_DELAY * Math.min(reconnectAttempts, 5);
    if (reconnectAttempts <= MAX_RECONNECT_ATTEMPTS) {
        setTimeout(connectWS, delay);
    }
}

function disconnectWS() {
    if (ws) {
        ws.close(1000, "Desconectado pelo usuário");
        ws = null;
    }
}

/* ------------- Mensagens WebSocket ------------- */
function handleMessage(msg) {
    logPC(`📨 Msg recebida: ${msg.type}`, "info");

    switch (msg.type) {
        case "registered":
            sessionId = msg.sessionId;
            updateUI();
            break;

        case "photo":
            addPhotoLocal(msg.filename, msg.data);
            break;

        case "webrtc-offer":
            startWebRTCReceive(msg.sdp, msg.from);
            break;

        case "control-fullscreen":
            clearQR(); // Some com QR do controle
            break;

        case "end-session":
            logPC("📵 Sessão finalizada pelo controle", "warning");
            resetSession();
            break;
    }
}

/* ------------- QR Codes ------------- */
function clearQR() {
    qrContainer.innerHTML = "";
}

function genControlQR() {
    if (!sessionId) {
        alert("⏳ Aguardando conexão...");
        return;
    }
    const controlUrl = `${window.location.origin}/controle.html?session=${sessionId}`;
    clearQR();
    new QRCode(qrContainer, {
        text: controlUrl,
        width: 220,
        height: 220,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });
    logPC(`📱 QR Code do controle: ${controlUrl}`, "success");
}

function generateVisualizerQR() {
    if (fotos.length === 0) {
        alert("📭 Nenhuma foto disponível.");
        return;
    }

    const uploadedUrls = fotos.map(f => f.dataURL);
    const sessionObj = {
        images: uploadedUrls,
        createdAt: new Date().toISOString(),
        photoCount: uploadedUrls.length
    };

    const enc = btoa(unescape(encodeURIComponent(JSON.stringify(sessionObj))));
    const visualUrl = `${window.location.origin}/visualizador.html?session=${enc}`;

    clearQR();
    new QRCode(qrContainer, {
        text: visualUrl,
        width: 220,
        height: 220,
        colorDark: "#000000",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.H
    });

    logPC(`📊 QR Visualizador: ${visualUrl}`, "success");

    const link = document.createElement("a");
    link.href = visualUrl;
    link.target = "_blank";
    link.textContent = "Abrir Visualizador";
    link.style.display = "block";
    link.style.marginTop = "10px";
    link.style.textAlign = "center";
    qrContainer.appendChild(link);
}

/* ------------- Galeria ------------- */
function addPhotoLocal(filename, dataURL) {
    fotos.push({ filename, dataURL, timestamp: new Date().toLocaleTimeString() });
    renderGallery();
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
        img.onclick = () => amplifyPhoto(f.dataURL);

        const btn = document.createElement("button");
        btn.innerText = "X";
        btn.onclick = (e) => {
            e.stopPropagation();
            fotos.splice(idx, 1);
            renderGallery();
            updateUI();
        };

        div.appendChild(img);
        div.appendChild(btn);
        galeria.appendChild(div);
    });
}

function amplifyPhoto(dataURL) {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.background = "rgba(0,0,0,0.95)";
    overlay.style.display = "flex";
    overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center";
    overlay.style.zIndex = "9999";
    overlay.onclick = () => overlay.remove();

    const img = document.createElement("img");
    img.src = dataURL;
    img.style.maxWidth = "90%";
    img.style.maxHeight = "90%";
    overlay.appendChild(img);

    document.body.appendChild(overlay);
}

/* ------------- Finalizar Sessão ------------- */
function finalizarSessao() {
    if (!sessionId) return;
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "end-session", sessionId }));
        logPC("📵 end-session enviado ao celular", "success");
    }
    resetSession();
}

/* ------------- Reset ------------- */
function resetSession() {
    fotos = [];
    galeria.innerHTML = "";
    sessionId = null;
    clearQR();
    updateUI();
    logPC("🔄 Sessão resetada", "info");
}

/* ------------- WebRTC Receiver ------------- */
async function startWebRTCReceive(offerSDP, fromId) {
    if (pcReceiver) pcReceiver.close();
    pcReceiver = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });

    pcReceiver.ontrack = (e) => {
        videoPC.srcObject = e.streams[0];
        videoPC.play().catch(() => {});
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
    }
}

/* ------------- UI ------------- */
function updateUI() {
    const hasSession = !!sessionId;
    const hasPhotos = fotos.length > 0;
    btnGerarQR.disabled = !hasSession;
    btnGerarVisualizador.disabled = !hasPhotos;
    btnFinalizarSessao.disabled = !hasSession;
}

/* ------------- Eventos ------------- */
btnGerarQR.onclick = genControlQR;
btnGerarVisualizador.onclick = generateVisualizerQR;
btnFinalizarSessao.onclick = finalizarSessao;
btnLimparLogs.onclick = () => logContainer.innerHTML = "";

/* ------------- Init ------------- */
document.addEventListener("DOMContentLoaded", () => {
    connectWS();
    updateUI();
    renderGallery();
});
