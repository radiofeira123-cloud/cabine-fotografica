// controle.js - CORREÇÕES NA CONTAGEM REGRESSIVA
const WS_URL = "wss://chatcabinerender.onrender.com";
const MOLDURA_PATH = "moldura.png";
const LOGO_PATH = "logo.png";

let ws;
let sessionId = null;
let fotoCount = 0;
let maxFotos = 3;
let isCounting = false;
let fotosCapturadas = [];

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
const mold = new Image();
mold.crossOrigin = "anonymous";
mold.onload = () => { molduraCarregada = true; logControl("✅ Moldura carregada"); };
mold.onerror = () => { logControl("⚠️ Moldura não carregada"); molduraCarregada = false; };
mold.src = MOLDURA_PATH;

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

// Fluxo de telas cheias
async function entrarTelaCheia() {
    try {
        logControl("📱 Entrando em tela cheia...");
        await document.documentElement.requestFullscreen();
        
        telaInicial.style.display = "none";
        telaSessao.classList.add('ativa');
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

// CORREÇÃO: Função simplificada para mostrar telas
function mostrarTela(tela) {
    // Esconder todas as telas
    document.querySelectorAll('.tela, .tela-transicao').forEach(t => {
        t.style.display = 'none';
        t.classList.remove('ativa');
    });
    
    // Mostrar apenas a tela desejada
    tela.style.display = 'flex';
    tela.classList.add('ativa');
}

// **CORREÇÃO PRINCIPAL: Contagem regressiva SOBRE a câmera**
async function countdownAnimado(segundos) {
    logControl("🔴 INICIANDO CONTAGEM SOBRE CÂMERA");
    
    // 1. MOSTRAR APENAS A CÂMERA (sem telas azuis)
    videoCam.style.display = "block";
    overlay.style.display = "flex";
    
    // 2. CONFIGURAR OVERLAY para contagem grande e visível
    overlay.style.position = "fixed";
    overlay.style.top = "0";
    overlay.style.left = "0";
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.backgroundColor = "rgba(0,0,0,0.3)"; // Fundo semi-transparente
    overlay.style.color = "#00ff00";
    overlay.style.fontSize = "25vw";
    overlay.style.fontWeight = "bold";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "1000";
    overlay.style.textShadow = "0 0 20px #00ff00, 0 0 30px #00ff00";
    
    // 3. FAZER CONTAGEM DIRETAMENTE NO OVERLAY
    for (let i = segundos; i >= 1; i--) {
        overlay.textContent = i;
        overlay.style.animation = 'none';
        void overlay.offsetWidth;
        overlay.style.animation = 'zoomInOut 1s ease';
        
        logControl("🔴 CONTAGEM: " + i);
        await sleep(1000);
    }
    
    // 4. MOSTRAR "SORRIA!" NO ÚLTIMO SEGUNDO
    overlay.textContent = "📸 SORRIA!";
    overlay.style.fontSize = "15vw";
    overlay.style.color = "#ff9900";
    overlay.style.textShadow = "0 0 20px #ff9900, 0 0 30px #ff9900";
    await sleep(1000);
    
    // 5. LIMPAR OVERLAY após foto
    overlay.style.display = "none";
    logControl("✅ Contagem finalizada");
}

// Fluxo principal de fotos CORRIGIDO
async function startPhotoFlow(){
    if(isCounting) return;
    
    isCounting = true;
    fotoCount = 0;
    fotosCapturadas = [];

    // Ativar câmera
    try{
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: "user", aspectRatio: 16/9 }, 
            audio: false 
        });
        videoCam.srcObject = stream;
        videoCam.style.display = "block";
        await videoCam.play();
        logControl("✅ Câmera ativada - AGUARDANDO CONTAGEM");
    }catch(e){ 
        logControl("❌ Erro câmera: "+e); 
        mostrarErro("❌ Erro na câmera");
        isCounting = false;
        return; 
    }

    // TIRAR AS 3 FOTOS
    while(fotoCount < maxFotos){
        logControl(`📸 PREPARANDO FOTO ${fotoCount + 1}`);
        
        // MOSTRAR "PREPARE-SE" por 2 segundos
        mostrarTela(telaPrepareSe);
        await sleep(2000);
        
        // **CONTAGEM REGRESSIVA SOBRE A CÂMERA**
        await countdownAnimado(3);
        
        // TIRAR FOTO
        const blob = await captureFramedPhoto(videoCam, mold);
        const dataURL = await blobToDataURL(blob);
        fotosCapturadas.push(dataURL);

        // MOSTRAR PREVIEW da foto
        showPreview(dataURL);
        
        // ENVIAR PARA PC
        if(ws && ws.readyState === WebSocket.OPEN){
            ws.send(JSON.stringify({ 
                type: "photo", 
                sessionId, 
                filename: `photo_${Date.now()}_${fotoCount+1}.jpg`, 
                data: dataURL 
            }));
            logControl(`📤 Foto ${fotoCount + 1} enviada para o PC`);
        }
        
        fotoCount++;
        atualizarMiniaturas();
        logControl(`✅ Foto ${fotoCount}/${maxFotos} capturada`);
        
        // PAUSA ENTRE FOTOS (se não for a última)
        if(fotoCount < maxFotos){
            await sleep(3000); // Mostrar preview por 3 segundos
            hidePreview(); // Voltar para a câmera
            await sleep(1000);
        }
    }
    
    // SESSÃO CONCLUÍDA
    await sleep(3000);
    hidePreview();
    mostrarTelaFinal();
    isCounting = false;
}

// Captura de foto (já estava funcionando)
function captureFramedPhoto(videoEl, moldImage){
    return new Promise(resolve => {
        const w = videoEl.videoWidth || 1280;
        const h = Math.round(w * 9 / 16);
        canvasHidden.width = w;
        canvasHidden.height = h;
        const ctx = canvasHidden.getContext("2d");
        
        ctx.translate(w, 0);
        ctx.scale(-1, 1);
        ctx.drawImage(videoEl, 0, 0, w, h);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        
        if(molduraCarregada && moldImage.complete){
            ctx.drawImage(moldImage, 0, 0, w, h);
        }
        
        canvasHidden.toBlob(blob => resolve(blob), "image/jpeg", 0.95);
    });
}

function mostrarTelaFinal() {
    const telaFinal = document.getElementById("telaFinal");
    mostrarTela(telaFinal);
    logControl("🎉 Todas as fotos concluídas");
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
                miniatura.classList.add('concluida');
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
    
    // Parar câmera
    try{ 
        if(videoCam.srcObject){ 
            videoCam.srcObject.getTracks().forEach(t => t.stop()); 
            videoCam.srcObject = null; 
        } 
    }catch(e){}
    
    // Resetar variáveis
    fotoCount = 0;
    isCounting = false;
    fotosCapturadas = [];
    
    // Mostrar tela inicial
    mostrarTela(telaInicial);
    
    // Atualizar texto do botão
    const btnInicial = document.querySelector('#telaInicial .btn-principal');
    if (btnInicial) {
        btnInicial.textContent = "👆 CLIQUE AQUI PARA INICIAR";
    }
    
    const subtitle = document.querySelector('#telaInicial .subtitle');
    if (subtitle) {
        subtitle.textContent = "Toque para começar a sessão fotográfica";
    }
}

// Preview das fotos
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
    connectWS();
    
    // Verificar se já está em tela cheia
    if(document.fullscreenElement) {
        telaInicial.style.display = "none";
        telaSessao.classList.add('ativa');
    }
});
