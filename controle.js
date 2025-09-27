// controle.js - celular da cabine
const WS_URL = "wss://chatcabinerender.onrender.com";

let MOLDURA_PATH, VIDEO_PATH;
let ws;
let sessionId = null;
let fotoCount = 0;
let maxFotos = 3;
let isCounting = false;

const urlParams = new URLSearchParams(window.location.search);
sessionId = urlParams.get("session");

const videoInstr = document.getElementById("videoInstr");
const videoCam = document.getElementById("videoCam");
const overlay = document.getElementById("overlay");
const tapBtn = document.getElementById("tapBtn");
const canvasHidden = document.getElementById("canvasHidden");

function setupPaths() {
  const baseUrl = window.location.origin;
  MOLDURA_PATH = `${baseUrl}/assets/moldura.png`;
  VIDEO_PATH = `${baseUrl}/assets/video-instrucoes.mp4`;
}

function setupVideo() {
  setupPaths();
  videoInstr.src = VIDEO_PATH;
  videoInstr.loop = true;
  videoInstr.muted = true;
  videoInstr.playsInline = true;
  videoInstr.preload = "auto";
  videoInstr.addEventListener("loadeddata", () => {
    videoInstr.play().catch(() => showVideoFallback());
  });
  videoInstr.addEventListener("error", () => showVideoFallback());
  videoInstr.load();
}

function showVideoFallback() {
  overlay.innerText = "📸 Cabine Fotográfica\n🔴 Toque para começar";
  overlay.style.backgroundColor = "rgba(0,0,0,0.8)";
  overlay.style.display = "flex";
}

function connectWS() {
  if (ws && ws.readyState === WebSocket.OPEN) return;
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    ws.send(JSON.stringify({ type: "register", role: "control", sessionId }));
  };
  ws.onmessage = (ev) => {
    try {
      const msg = JSON.parse(ev.data);
      if (msg.type === "end-session") resetToIntro();
    } catch {}
  };
}

tapBtn.addEventListener("click", async () => {
  tapBtn.style.display = "none";
  await enterFullscreen();
  showStartButton();
});

async function enterFullscreen() {
  try {
    await document.documentElement.requestFullscreen();
  } catch {}
}

function showStartButton() {
  overlay.innerHTML = `<button id="startBtn" style="padding:20px;font-size:22px;">Iniciar Fotos</button>`;
  overlay.style.display = "flex";
  document.getElementById("startBtn").onclick = () => {
    overlay.style.display = "none";
    startPhotoFlow();
  };
}

async function resetToIntro() {
  overlay.innerHTML = "";
  overlay.style.display = "none";
  try {
    if (videoCam.srcObject) {
      videoCam.srcObject.getTracks().forEach((t) => t.stop());
      videoCam.srcObject = null;
    }
  } catch {}
  videoInstr.style.display = "block";
  videoCam.style.display = "none";
  fotoCount = 0;
  isCounting = false;
  videoInstr.currentTime = 0;
  videoInstr.play().catch(() => {});
  if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
  tapBtn.style.display = "block";
}

/* --- resto igual ao teu fluxo atual (startPhotoFlow, captura, previews etc.) --- */
