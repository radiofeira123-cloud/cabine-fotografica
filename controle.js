// controle.js - CORREÇÃO DA RESOLUÇÃO E OUTROS PROBLEMAS
const WS_URL = "wss://chatcabinerender.onrender.com";
const MOLDURA_PATH = "assets/moldura.png";
const LOGO_PATH = "assets/logo.png";

let ws;
let sessionId = null;
let fotoCount = 0;
let maxFotos = 3;
let isCounting = false;
let fotosCapturadas = [];
let cameraStream = null; // CORREÇÃO: Guardar a stream globalmente

// Elementos da interface
const telaInicial = document.getElementById("telaInicial");
const telaSessao = document.getElementById("telaSessao");
const telaPrepareSe = document.getElementById("telaPrepareSe");
const telaContagem = document.getElementById("telaContagem");
const videoCam = document.getElementById("videoCam");
const overlay = document.getElementById("overlay");
const canvasHidden = document.getElementById("canvasHidden");

// Sistema de carregamento
let molduraCarregada = false;
let molduraPromise = null;

function carregarMoldura() {
    if (molduraPromise) return molduraPromise;
    
    molduraPromise = new Promise((resolve, reject) => {
        const mold = new Image();
        mold.crossOrigin = "anonymous";
        
        mold.onload = () => {
            molduraCarregada = true;
            logControl("✅ Moldura carregada com sucesso");
            resolve(mold);
        };
        
        mold.onerror = () => {
            logControl("❌ Erro ao carregar moldura");
            molduraCarregada = false;
            resolve(null);
        };
        
        mold.src = MOLDURA_PATH;
    });
    
    return molduraPromise;
}

// Extrair sessionId da URL
const urlParams = new URLSearchParams(window.location.search);
sessionId = urlParams.get('session');
logControl("SessionID: " + sessionId);

// WebSocket
function connectWS(){
    if(ws && ws.readyState === WebSocket.OPEN) return;
    
    ws = new WebSocket(WS_URL);
    ws.onopen = ()=> {
        logControl("✅ WebSocket conectado");
        if (sessionId) {
            ws.send(JSON.stringify({ type: "register", role: "control", sessionId }));
        }
    };
    ws.onmessage = (ev)=>{
        try{
            const msg = JSON.parse(ev.data);
            handleMsg(msg);
        }catch(e){ logControl("❌ Erro parse WS: "+e); }
    };
    ws.onclose = ()=> { 
        logControl("🔌 WebSocket fechado, reconectando...");
        setTimeout(connectWS, 2000); 
    };
    ws.onerror = (e)=> logControl("❌ WS error: "+e);
}

function logControl(msg){
    console.log("[CONTROL]", msg);
}

// CORREÇÃO: Função para obter a melhor resolução da câmera
async function obterMelhorCamera() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        // Tentar resoluções altas
        const constraints = {
            video: {
                facingMode: "user",
                width: { ideal: 1920 },
                height: { ideal: 1080 },
                aspectRatio: { ideal: 16/9 }
            },
            audio: false
        };
        
        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        logControl("📷 Câmera configurada com alta resolução");
        return stream;
        
    } catch (error) {
        logControl("⚠️ Usando resolução padrão: " + error);
        // Fallback para resolução básica
        return await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: false
        });
    }
}

async function entrarTelaCheia() {
    try {
        logControl("📱 Entrando em tela cheia...");
        await document.documentElement.requestFullscreen();
        
        telaInicial.style.display = "none";
        telaSessao.style.display = "flex";
        telaSessao.classList.add('ativa');
        
    } catch (error) {
        logControl("❌ Erro ao entrar em tela cheia: " + error);
        telaInicial.style.display = "none";
        telaSessao.style.display = "flex";
        telaSessao.classList.add('ativa');
    }
}

async function iniciarSessao() {
    if(isCounting) {
        logControl("⚠️ Sessão já em andamento");
        return;
    }
    
    logControl("🎬 Iniciando sessão fotográfica");
    telaSessao.style.display = "none";
    mostrarTela(telaPrepareSe);
    await sleep(2000);
    startPhotoFlow();
}

function mostrarTela(tela) {
    document.querySelectorAll('.tela, .tela-transicao').forEach(t => {
        t.style.display = 'none';
        t.classList.remove('ativa');
    });
    
    tela.style.display = 'flex';
    tela.classList.add('ativa');
}

// Contagem regressiva
async function countdownAnimado(segundos) {
    videoCam.style.display = "block";
    overlay.style.display = "flex";
    
    overlay.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.3); color: #00ff00; font-size: 25vw;
        font-weight: bold; display: flex; align-items: center; 
        justify-content: center; z-index: 1000;
        text-shadow: 0 0 20px #00ff00, 0 0 30px #00ff00;
    `;
    
    for (let i = segundos; i >= 1; i--) {
        overlay.textContent = i;
        overlay.style.animation = 'none';
        void overlay.offsetWidth;
        overlay.style.animation = 'zoomInOut 1s ease';
        await sleep(1000);
    }
    
    overlay.textContent = "📸 SORRIA!";
    overlay.style.fontSize = "15vw";
    overlay.style.color = "#ff9900";
    overlay.style.textShadow = "0 0 20px #ff9900, 0 0 30px #ff9900";
    await sleep(1000);
    
    overlay.style.display = "none";
}

// CORREÇÃO: Fluxo principal com melhor resolução
async function startPhotoFlow(){
    if(isCounting) return;
    
    isCounting = true;
    fotoCount = 0;
    fotosCapturadas = [];

    // Carregar moldura
    const molduraImg = await carregarMoldura();

    // CORREÇÃO: Usar função de melhor resolução
    try{
        cameraStream = await obterMelhorCamera();
        videoCam.srcObject = cameraStream;
        videoCam.style.display = "block";
        
        await new Promise((resolve) => {
            videoCam.onloadedmetadata = resolve;
        });
        
        await videoCam.play();
        logControl(`✅ Câmera ativada: ${videoCam.videoWidth}x${videoCam.videoHeight}`);
    }catch(e){ 
        logControl("❌ Erro câmera: "+e); 
        mostrarErro("❌ Erro na câmera");
        isCounting = false;
        return; 
    }

    // TIRAR AS 3 FOTOS
    while(fotoCount < maxFotos && isCounting){
        logControl(`📸 Foto ${fotoCount + 1} de ${maxFotos}`);
        
        mostrarTela(telaPrepareSe);
        await sleep(2000);
        
        await countdownAnimado(3);
        
        // CORREÇÃO: Capturar com alta qualidade
        const blob = await captureFramedPhoto(videoCam, molduraImg);
        if (!blob) {
            logControl("❌ Erro ao capturar foto");
            continue;
        }
        
        const dataURL = await blobToDataURL(blob);
        fotosCapturadas.push(dataURL);

        showPreview(dataURL);
        
        if(ws && ws.readyState === WebSocket.OPEN){
            ws.send(JSON.stringify({ 
                type: "photo", 
                sessionId, 
                filename: `photo_${Date.now()}_${fotoCount+1}_${videoCam.videoWidth}x${videoCam.videoHeight}.jpg`, 
                data: dataURL 
            }));
        }
        
        fotoCount++;
        atualizarMiniaturas();
        
        if(fotoCount < maxFotos){
            await sleep(3000);
            hidePreview();
            await sleep(1000);
        }
    }
    
    if(isCounting) {
        await sleep(3000);
        hidePreview();
        mostrarTelaFinal();
    }
    isCounting = false;
}

// CORREÇÃO: Captura em alta resolução
function captureFramedPhoto(videoEl, molduraImg){
    return new Promise(resolve => {
        // Usar a resolução REAL do vídeo
        const w = videoEl.videoWidth;
        const h = videoEl.videoHeight;
        
        logControl(`🖼️ Capturando em: ${w}x${h}`);
        
        canvasHidden.width = w;
        canvasHidden.height = h;
        const ctx = canvasHidden.getContext("2d", { willReadFrequently: true });
        
        // Desenhar vídeo (espelhado)
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        // Aplicar moldura
        if (molduraCarregada && molduraImg) {
            ctx.drawImage(molduraImg, 0, 0, w, h);
        }
        
        // CORREÇÃO: Qualidade máxima
        canvasHidden.toBlob(blob => {
            logControl(`✅ Foto capturada: ${(blob.size/1024/1024).toFixed(2)}MB`);
            resolve(blob);
        }, "image/jpeg", 0.95); // 95% de qualidade
    });
}

function mostrarTelaFinal() {
    const telaFinal = document.getElementById("telaFinal");
    mostrarTela(telaFinal);
}

function atualizarMiniaturas() {
    for(let i = 1; i <= 3; i++) {
        const miniatura = document.getElementById(`miniatura${i}`);
        if(miniatura && i <= fotosCapturadas.length) {
            miniatura.style.backgroundImage = `url(${fotosCapturadas[i-1]})`;
            miniatura.style.backgroundSize = "cover";
            miniatura.textContent = "";
            miniatura.classList.add('concluida');
        }
    }
}

// CORREÇÃO: Reset melhorado
async function resetToIntro(){
    logControl("🔄 Resetando para início...");
    
    isCounting = false; // IMPORTANTE: Parar o loop de fotos
    
    // Parar câmera corretamente
    if(cameraStream) {
        cameraStream.getTracks().forEach(track => {
            track.stop();
            cameraStream.removeTrack(track);
        });
        cameraStream = null;
    }
    
    if(videoCam.srcObject) {
        videoCam.srcObject = null;
    }
    
    videoCam.style.display = "none";
    overlay.style.display = "none";
    
    const previewImg = document.getElementById("__previewImg");
    if(previewImg) previewImg.style.display = "none";
    
    // Resetar variáveis
    fotoCount = 0;
    fotosCapturadas = [];
    
    // Mostrar tela inicial
    mostrarTela(telaInicial);
    
    // CORREÇÃO: Reativar botão
    const btnInicial = document.querySelector('#telaInicial .btn-principal');
    if (btnInicial) {
        btnInicial.disabled = false;
        btnInicial.onclick = iniciarSessao;
        btnInicial.style.opacity = "1";
    }
    
    logControl("✅ Reset completo");
}

function handleMsg(msg){
    if(msg.type === "end-session"){
        logControl("📵 Finalizando sessão...");
        resetToIntro();
    }
}

// Restante do código permanece igual...
function showPreview(dataURL){
    videoCam.style.display = "none";
    overlay.style.display = "none";
    
    let img = document.getElementById("__previewImg");
    if(!img){
        img = document.createElement("img");
        img.id = "__previewImg";
        img.style.position = "fixed";
        img.style.top = "0";
        img.style.left = "0";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        img.style.zIndex = "9999";
        img.style.backgroundColor = "#000";
        document.body.appendChild(img);
    }
    img.src = dataURL;
    img.style.display = "block";
}

function hidePreview(){
    const img = document.getElementById("__previewImg");
    if(img) img.style.display = "none";
    videoCam.style.display = "block";
}

function blobToDataURL(blob){
    return new Promise(res => { 
        const fr = new FileReader(); 
        fr.onload = () => res(fr.result); 
        fr.readAsDataURL(blob); 
    });
}

function sleep(ms){ 
    return new Promise(r => setTimeout(r, ms)); 
}

window.addEventListener('load', () => {
    logControl("🚀 Sistema carregado");
    connectWS();
    carregarMoldura();
    
    if(document.fullscreenElement) {
        telaInicial.style.display = "none";
        telaSessao.style.display = "flex";
        telaSessao.classList.add('ativa');
    }
});
