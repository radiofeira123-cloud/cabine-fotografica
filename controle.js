// controle.js - celular da cabine CORRIGIDO E COMPLETO
const WS_URL = "wss://chatcabinerender.onrender.com";
const MOLDURA_PATH = "assets/moldura.png";

let ws;
let sessionId = null;
let fotoCount = 0;
let maxFotos = 3;
let isCounting = false;
let fotosCapturadas = []; // armazenar dataURLs para miniaturas finais

// Elementos da interface
const telaInicial = document.getElementById("telaInicial");
const telaSessao = document.getElementById("telaSessao");
const telaPrepareSe = document.getElementById("telaPrepareSe");
const telaContagem = document.getElementById("telaContagem");
const telaFinal = document.getElementById("telaFinal");
const contadorElement = telaContagem.querySelector(".contador");
const videoCam = document.getElementById("videoCam");
const overlay = document.getElementById("overlay");
const canvasHidden = document.getElementById("canvasHidden");

// Extrair sessionId da URL
const urlParams = new URLSearchParams(window.location.search);
sessionId = urlParams.get('session');
logControl("SessionID: " + sessionId);

// Configurar paths
function setupPaths() {
    const baseUrl = window.location.origin;
    logControl(`🔗 URLs configuradas: ${baseUrl}`);
}

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

// Fluxo de telas cheias
async function entrarTelaCheia() {
    try {
        logControl("📱 Entrando em tela cheia...");
        await document.documentElement.requestFullscreen();
        
        telaInicial.style.display = "none";
        telaSessao.classList.add('ativa');

        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "control-fullscreen", sessionId }));
        }

        logControl("✅ Tela cheia ativada");
        
    } catch (error) {
        logControl("❌ Erro ao entrar em tela cheia: " + error);
        telaInicial.style.display = "none";
        telaSessao.classList.add('ativa');
    }
}

async function iniciarSessao() {
    if(isCounting) return;
    
    logControl("🎬 Iniciando sessão fotográfica");
    telaSessao.classList.remove('ativa');
    mostrarTela(telaPrepareSe);
    await sleep(2000);
    startPhotoFlow();
}

// Função para mostrar telas de transição
function mostrarTela(tela) {
    document.querySelectorAll('.tela-transicao').forEach(t => {
        t.classList.remove('ativa');
    });
    tela.classList.add('ativa');
}

// Contagem regressiva animada sobre vídeo
async function countdownAnimado(segundos) {
    mostrarTela(telaContagem);
    // overlay é usado para mostrar o contador sobre o vídeo (sem fundo azul)
    overlay.style.display = "flex";
    overlay.style.pointerEvents = "none";
    videoCam.style.display = "block"; // garantir que o vídeo esteja visível atrás
    for (let i = segundos; i >= 1; i--) {
        contadorElement.textContent = i;
        // animação simples forçada (reset)
        contadorElement.style.animation = 'none';
        // forcing reflow for restart (optional)
        void contadorElement.offsetWidth;
        contadorElement.style.animation = 'zoomInOut 1s ease';
        await sleep(1000);
    }
    overlay.style.display = "none";
    telaContagem.classList.remove('ativa');
}

// Fluxo principal de fotos
async function startPhotoFlow(){
    if(isCounting || fotoCount >= maxFotos) return;
    
    isCounting = true;
    fotoCount = 0;
    fotosCapturadas = [];

    // Ativar câmera sem limitar resolução, pedindo apenas 16:9
    try{
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user", aspectRatio: 16/9 }, 
            audio: false 
        });
        videoCam.srcObject = stream;
        videoCam.style.display = "block";
        await videoCam.play();
        logControl("✅ Câmera ativada");
    }catch(e){ 
        logControl("❌ Erro câmera: "+e); 
        mostrarErro("❌ Erro na câmera\nRecarregue a página");
        isCounting = false;
        return; 
    }

    const mold = new Image();
    mold.crossOrigin = "anonymous";
    mold.src = MOLDURA_PATH;

    // TIRAR AS 3 FOTOS
    while(fotoCount < maxFotos){
        await countdownAnimado(3);
        
        const blob = await captureFramedPhoto(videoCam, mold);
        const dataURL = await blobToDataURL(blob);
        fotosCapturadas.push(dataURL);

        showPreview(dataURL);
        
        if(ws && ws.readyState === WebSocket.OPEN){
            ws.send(JSON.stringify({ 
                type: "photo", 
                sessionId, 
                filename: `photo_${Date.now()}_${fotoCount+1}.jpg`, 
                data: dataURL 
            }));
            logControl(`📤 Foto ${fotoCount + 1} enviada para o PC`);
        } else {
            logControl("❌ WebSocket não conectado, tentando reconectar...");
            connectWS();
        }
        
        fotoCount++;
        atualizarMiniaturas();
        logControl(`✅ Foto ${fotoCount}/${maxFotos} capturada`);
        
        if(fotoCount < maxFotos){
            await sleep(3000);
            hidePreview();
            mostrarTela(telaPrepareSe);
            await sleep(1500);
        }
    }
    
    await sleep(3000);
    hidePreview();
    mostrarTelaFinal();
    isCounting = false;
}

// Captura de foto mantendo 16:9 e moldura
function captureFramedPhoto(videoEl, moldImage){
    return new Promise(resolve => {
        // usar a largura do vídeo e calcular altura 16:9
        const w = videoEl.videoWidth || Math.max(1280, Math.floor(window.innerWidth));
        const h = Math.round(w * 9 / 16); // garantir 16:9
        canvasHidden.width = w;
        canvasHidden.height = h;
        const ctx = canvasHidden.getContext("2d");
        
        // espelhar para ficar natural (selfie)
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        // desenhar o vídeo cortando/ajustando para 16:9
        // centraliza verticalmente caso vídeo seja maior
        const videoH = videoEl.videoHeight || h;
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.setTransform(1, 0, 0, 1, 0, 0); // reset
        
        if(moldImage.complete){
            ctx.drawImage(moldImage, 0, 0, w, h);
        } else {
            moldImage.onload = () => {
                ctx.drawImage(moldImage, 0, 0, w, h);
            };
        }
        
        canvasHidden.toBlob(blob => resolve(blob), "image/jpeg", 0.95);
    });
}

function mostrarTelaFinal() {
    mostrarTela(telaFinal);
    const titulo = document.querySelector("#telaFinal .mensagem-principal");
    const subt = document.querySelector("#telaFinal .mensagem-secundaria");
    if(titulo) titulo.textContent = "SUCESSO!";
    if(subt) subt.textContent = "Obrigado por utilizar a cabine 🎉";
    logControl("🎉 Todas as fotos concluídas - Aguardando finalização do PC");
}

function atualizarMiniaturas() {
    for(let i = 1; i <= 3; i++) {
        const miniatura = document.getElementById(`miniatura${i}`);
        if(miniatura) {
            if(i <= fotosCapturadas.length) {
                miniatura.style.backgroundImage = `url(${fotosCapturadas[i-1]})`;
                miniatura.style.backgroundSize = "cover";
                miniatura.style.backgroundPosition = "center";
                miniatura.textContent = "";
            } else {
                miniatura.style.backgroundImage = "none";
                miniatura.textContent = i;
            }
        }
    }
}

function mostrarErro(mensagem) {
    overlay.innerText = mensagem;
    overlay.style.backgroundColor = "rgba(255,0,0,0.9)";
    overlay.style.color = "white";
    overlay.style.fontSize = "5vw";
    overlay.style.display = "flex";
}

// Mensagens do WebSocket
function handleMsg(msg){
    if(msg.type === "end-session"){
        logControl("📵 Recebido comando para finalizar sessão do PC");
        resetToIntro();
    }
}

// Reset para o início
async function resetToIntro(){
    logControl("🔄 Voltando ao início...");
    document.querySelectorAll('.tela-transicao').forEach(t => {
        t.classList.remove('ativa');
    });
    telaSessao.classList.remove('ativa');
    try{ 
        if(videoCam.srcObject){ 
            videoCam.srcObject.getTracks().forEach(t => t.stop()); 
            videoCam.srcObject = null; 
            videoCam.style.display = "none";
        } 
    }catch(e){ logControl("❌ Stop cam fail: " + e); }
    fotoCount = 0;
    isCounting = false;
    fotosCapturadas = [];
    atualizarMiniaturas();
    if(document.exitFullscreen) {
        document.exitFullscreen().catch(()=>{});
    }
    telaInicial.style.display = "flex";
    setTimeout(() => { telaInicial.style.opacity = "1"; }, 100);
}

// Preview das fotos
function showPreview(dataURL){
    let img = document.getElementById("__previewImg");
    if(!img){
        img = document.createElement("img");
        img.id = "__previewImg";
        img.style.position = "absolute";
        img.style.top = "0";
        img.style.left = "0";
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "contain";
        img.style.zIndex = "9998";
        img.style.backgroundColor = "#000";
        document.body.appendChild(img);
    }
    img.src = dataURL;
    img.style.display = "block";
    videoCam.style.display = "none";
}

function hidePreview(){
    const img = document.getElementById("__previewImg");
    if(img) img.style.display = "none";
    videoCam.style.display = "block";
}

// Utilitários
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

// Inicializar
window.addEventListener('load', () => {
    logControl("🚀 Cabine Fotográfica carregada");
    setupPaths();
    connectWS();
    // Se já estiver em tela cheia (recarregamento)
    if(document.fullscreenElement) {
        telaInicial.style.display = "none";
        telaSessao.classList.add('ativa');
    }
});
