// pc.js - PC Central
const WS_URL = "wss://chatcabinerender.onrender.com";
const IMGBB_API_KEY = "6734e028b20f88d5795128d242f85582";

let ws, sessionId = null, fotos = [];

const videoPC = document.getElementById("videoPC");
const qrContainer = document.getElementById("qrContainer");
const galeria = document.getElementById("galeria");
const logContainer = document.getElementById("logContainer");
const btnGerarQR = document.getElementById("btnGerarQR");
const btnGerarVisualizador = document.getElementById("btnGerarVisualizador");
const btnFinalizarSessao = document.getElementById("btnFinalizarSessao");
const btnNovaSessao = document.getElementById("btnNovaSessao");
const btnLimparLogs = document.getElementById("btnLimparLogs");

/* --- logs, websocket e galeria mantidos iguais --- */

async function finalizarSessao() {
  if (fotos.length === 0) {
    alert("📭 Nenhuma foto na sessão.");
    return;
  }
  btnFinalizarSessao.disabled = true;
  const uploaded = [];

  for (const f of fotos) {
    const base64 = f.dataURL.split(",")[1];
    const form = new FormData();
    form.append("key", IMGBB_API_KEY);
    form.append("image", base64);
    const res = await fetch("https://api.imgbb.com/1/upload", { method: "POST", body: form });
    const json = await res.json();
    if (json && json.data && json.data.url) uploaded.push(json.data.url);
  }

  if (uploaded.length > 0) {
    generateVisualizerQR(uploaded);
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "end-session", sessionId }));
    }
  }

  btnFinalizarSessao.disabled = false;
}

function generateVisualizerQR(urls) {
  const enc = btoa(unescape(encodeURIComponent(JSON.stringify({ images: urls }))));
  const visualUrl = `${window.location.origin}/visualizador.html?session=${enc}`;
  qrContainer.innerHTML = "";
  new QRCode(qrContainer, { text: visualUrl, width: 220, height: 220 });
  logPC("📊 QR do visualizador pronto", "success");

  btnNovaSessao.style.display = "inline-block";
}

btnNovaSessao.onclick = () => {
  resetSession();
  btnNovaSessao.style.display = "none";
};

function resetSession() {
  fotos = [];
  galeria.innerHTML = "";
  qrContainer.innerHTML = "";
  sessionId = null;
  updateUI();
}
