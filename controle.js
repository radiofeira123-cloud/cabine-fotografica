// controle.js - celular da cabine (AJUSTADO)
const WS_URL = "wss://chatcabinerender.onrender.com";
let ws;
let sessionId = null;
let fotoCount = 0;
let maxFotos = 3;
let isCounting = false;

// Elementos
const telaInicial = document.getElementById("telaInicial");
const telaSessao = document.getElementById("telaSessao");
const telaPrepareSe = document.getElementById("telaPrepareSe");
const telaContagem = document.getElementById("telaContagem");
const telaFinal = document.getElementById("telaFinal");
const contadorElement = telaContagem.querySelector(".contador");
const videoCam = document.getElementById("videoCam");
const canvasHidden = document.getElementById("canvasHidden");

// sessionId
const urlParams = new URLSearchParams(window.location.search);
sessionId = urlParams.get('session');

/* ------------- WebSocket ------------- */
function connectWS() {
    ws = new WebSocket(WS_URL);
    ws.onopen = () => {
        if (sessionId) {
            ws.send(JSON.stringify({ type: "register", role: "control", sessionId }));
        }
    };
    ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type === "end-session") resetToIntro();
    };
}

/* ------------- Telas ------------- */
async function entrarTelaCheia() {
    try { await document.documentElement.requestFullscreen(); } catch {}
    telaInicial.style.display = "none";
    telaSessao.classList.add("ativa");
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "control-fullscreen", sessionId }));
    }
}

async function iniciarSessao() {
    if (isCounting) return;
    telaSessao.classList.remove("ativa");
    mostrarTela(telaPrepareSe);
    await sleep(2000);
    startPhotoFlow();
}

function mostrarTela(tela) {
    document.querySelectorAll('.tela-transicao').forEach(t => t.classList.remove('ativa'));
    tela.classList.add('ativa');
}

/* ------------- Contagem com câmera visível ------------- */
async function countdownAnimado(segundos) {
    mostrarTela(telaContagem);
    videoCam.style.display = "block"; // câmera sempre visível
    for (let i = segundos; i >= 1; i--) {
        contadorElement.textContent = i;
        await sleep(1000);
    }
    telaContagem.classList.remove("ativa");
}

/* ------------- Fotos ------------- */
async function startPhotoFlow() {
    isCounting = true;
    fotoCount = 0;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user" }, audio: false });
        videoCam.srcObject = stream;
        await videoCam.play();
    } catch (e) {
        return;
    }

    while (fotoCount < maxFotos) {
        await countdownAnimado(3);
        const dataURL = await capturePhoto(videoCam);
        showPreview(dataURL);
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "photo", sessionId, filename: `photo_${Date.now()}_${fotoCount+1}.jpg`, data: dataURL }));
        }
        fotoCount++;
        await sleep(3000);
        hidePreview();
        if (fotoCount < maxFotos) {
            mostrarTela(telaPrepareSe);
            await sleep(1500);
        }
    }
    mostrarTela(telaFinal);
    isCounting = false;
}

function capturePhoto(videoEl) {
    return new Promise(resolve => {
        const w = videoEl.videoWidth;
        const h = videoEl.videoHeight;
        canvasHidden.width = w;
        canvasHidden.height = h;
        const ctx = canvasHidden.getContext("2d");
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        canvasHidden.toBlob(blob => {
            const fr = new FileReader();
            fr.onload = () => resolve(fr.result);
            fr.readAsDataURL(blob);
        }, "image/jpeg", 0.95);
    });
}

function showPreview(dataURL) {
    let img = document.getElementById("__previewImg");
    if (!img) {
        img = document.createElement("img");
        img.id = "__previewImg";
        img.style.position = "absolute";
        img.style.top = "0";
        img.style.left = "0";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        document.body.appendChild(img);
    }
    img.src = dataURL;
    img.style.display = "block";
    videoCam.style.display = "none";
}

function hidePreview() {
    const img = document.getElementById("__previewImg");
    if (img) img.style.display = "none";
    videoCam.style.display = "block";
}

/* ------------- Reset ------------- */
function resetToIntro() {
    document.querySelectorAll('.tela-transicao').forEach(t => t.classList.remove('ativa'));
    telaSessao.classList.remove("ativa");
    if (videoCam.srcObject) {
        videoCam.srcObject.getTracks().forEach(t => t.stop());
        videoCam.srcObject = null;
    }
    telaInicial.style.display = "flex";
    fotoCount = 0;
    isCounting = false;
    if (document.exitFullscreen) document.exitFullscreen().catch(()=>{});
}

/* ------------- Utils ------------- */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ------------- Init ------------- */
window.addEventListener("load", () => {
    connectWS();
});
