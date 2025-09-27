// controle.js - celular da cabine CORRIGIDO
const WS_URL = "wss://chatcabinerender.onrender.com";
const MOLDURA_PATH = "assets/moldura.png";

let ws;
let sessionId = null;
let fotoCount = 0;
let maxFotos = 3;
let isCounting = false;

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
    MOLDURA_PATH = `${baseUrl}/assets/moldura.png`;
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
        
        // Mostrar tela de sessão após entrar em tela cheia
        telaInicial.style.display = "none";
        telaSessao.classList.add('ativa');
        logControl("✅ Tela cheia ativada");
        
    } catch (error) {
        logControl("❌ Erro ao entrar em tela cheia: " + error);
        // Fallback: ir direto para a sessão
        telaInicial.style.display = "none";
        telaSessao.classList.add('ativa');
    }
}

async function iniciarSessao() {
    if(isCounting) return;
    
    logControl("🎬 Iniciando sessão fotográfica");
    
    // Esconder tela de sessão
    telaSessao.classList.remove('ativa');
    
    // Mostrar tela "Prepare-se"
    mostrarTela(telaPrepareSe);
    await sleep(2000);
    
    // Iniciar fluxo de fotos
    startPhotoFlow();
}

// Função para mostrar telas de transição
function mostrarTela(tela) {
    document.querySelectorAll('.tela-transicao').forEach(t => {
        t.classList.remove('ativa');
    });
    tela.classList.add('ativa');
}

// Contagem regressiva animada
async function countdownAnimado(segundos) {
    mostrarTela(telaContagem);
    
    for (let i = segundos; i >= 1; i--) {
        contadorElement.textContent = i;
        contadorElement.style.animation = 'none';
        contadorElement.offsetHeight;
        contadorElement.style.animation = 'zoomInOut 1s ease';
        await sleep(1000);
    }
    
    telaContagem.classList.remove('ativa');
}

// Fluxo principal de fotos
async function startPhotoFlow(){
    if(isCounting || fotoCount >= maxFotos) return;
    
    isCounting = true;
    fotoCount = 0;

    // Ativar câmera
    try{
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { 
                facingMode: "user", 
                width: { ideal: 1920 }, 
                height: { ideal: 1080 } 
            }, 
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
        
        // CAPTURAR FOTO (CORRIGIDO - câmera espelhada)
        const blob = await captureFramedPhoto(videoCam, mold);
        const dataURL = await blobToDataURL(blob);
        
        // MOSTRAR PREVIEW POR 3 SEGUNDOS
        showPreview(dataURL);
        
        // ENVIAR PARA O PC
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
        
        // SE NÃO FOR A ÚLTIMA FOTO, PREPARAR PRÓXIMA
        if(fotoCount < maxFotos){
            await sleep(3000);
            hidePreview();
            mostrarTela(telaPrepareSe);
            await sleep(1500);
        }
    }
    
    // ÚLTIMA FOTO: Mostrar por 3s depois tela final
    await sleep(3000);
    hidePreview();
    mostrarTelaFinal();
    isCounting = false;
}

// Captura de foto CORRIGIDA (câmera espelhada)
function captureFramedPhoto(videoEl, moldImage){
    return new Promise(resolve => {
        const w = videoEl.videoWidth || 1280;
        const h = videoEl.videoHeight || 720;
        canvasHidden.width = w;
        canvasHidden.height = h;
        const ctx = canvasHidden.getContext("2d");
        
        // CORREÇÃO: Espelhar horizontalmente para ficar natural
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.setTransform(1, 0, 0, 1, 0, 0); // Resetar transformação
        
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
    logControl("🎉 Todas as fotos concluídas - Aguardando finalização do PC");
}

function atualizarMiniaturas() {
    for(let i = 1; i <= 3; i++) {
        const miniatura = document.getElementById(`miniatura${i}`);
        if(miniatura) {
            if(i <= fotoCount) {
                miniatura.classList.add('concluida');
                miniatura.textContent = '✓';
            } else {
                miniatura.classList.remove('concluida');
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
    
    // Esconder todas as telas
    document.querySelectorAll('.tela-transicao').forEach(t => {
        t.classList.remove('ativa');
    });
    telaSessao.classList.remove('ativa');
    
    // Parar câmera
    try{ 
        if(videoCam.srcObject){ 
            videoCam.srcObject.getTracks().forEach(t => t.stop()); 
            videoCam.srcObject = null; 
            videoCam.style.display = "none";
        } 
    }catch(e){ logControl("❌ Stop cam fail: " + e); }
    
    // Resetar contadores
    fotoCount = 0;
    isCounting = false;
    atualizarMiniaturas();
    
    // Sair do fullscreen
    if(document.exitFullscreen) {
        document.exitFullscreen().catch(()=>{});
    }
    
    // Mostrar tela inicial novamente
    telaInicial.style.display = "flex";
    setTimeout(() => {
        telaInicial.style.opacity = "1";
    }, 100);
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
    
    // Verificar se já está em tela cheia (recarregamento)
    if(document.fullscreenElement) {
        telaInicial.style.display = "none";
        telaSessao.classList.add('ativa');
    }
});

// Debug no console
window.verificarStatus = () => {
    console.log("=== STATUS CELULAR ===");
    console.log("SessionID:", sessionId);
    console.log("Fotos tiradas:", fotoCount);
    console.log("WebSocket:", ws ? ws.readyState : "Não conectado");
    console.log("Câmera ativa:", !!videoCam.srcObject);
    console.log("======================");
};
