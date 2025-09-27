// controle.js - celular da cabine
const WS_URL = "wss://chatcabinerender.onrender.com";

// URLs serão definidas automaticamente pela URL do deploy
let MOLDURA_PATH, VIDEO_PATH;

let ws;
let sessionId = null;
let fotoCount = 0;
let maxFotos = 3;
let isCounting = false;

// Extrair sessionId da URL
const urlParams = new URLSearchParams(window.location.search);
sessionId = urlParams.get('session');

const videoInstr = document.getElementById("videoInstr");
const videoCam = document.getElementById("videoCam");
const overlay = document.getElementById("overlay");
const tapBtn = document.getElementById("tapBtn");
const canvasHidden = document.getElementById("canvasHidden");

// Configurar URLs baseadas na URL atual
function setupPaths() {
    const baseUrl = window.location.origin;
    MOLDURA_PATH = `${baseUrl}/assets/moldura.png`;
    VIDEO_PATH = `${baseUrl}/assets/video-instrucoes.mp4`;
    logControl(`🔗 URLs configuradas: ${baseUrl}`);
}

// Configuração robusta do vídeo
function setupVideo() {
    setupPaths();
    
    videoInstr.src = VIDEO_PATH;
    videoInstr.loop = true;
    videoInstr.muted = true;
    videoInstr.playsInline = true;
    videoInstr.preload = "auto";
    
    videoInstr.addEventListener('loadeddata', () => {
        logControl("✅ Vídeo carregado, tentando reproduzir...");
        playVideoWithFallback();
    });
    
    videoInstr.addEventListener('error', (e) => {
        logControl("❌ Erro no vídeo, usando fallback");
        showVideoFallback();
    });
    
    videoInstr.load();
}

// Tentar reproduzir com fallback
async function playVideoWithFallback() {
    try {
        await videoInstr.play();
        logControl("🎥 Vídeo em reprodução");
        overlay.style.display = "none";
    } catch (error) {
        logControl("❌ Autoplay bloqueado, mostrando fallback");
        showVideoFallback();
    }
}

// Fallback se o vídeo falhar
function showVideoFallback() {
    overlay.innerText = "📸 Cabine Fotográfica\n🔴 Toque para começar";
    overlay.style.backgroundColor = "rgba(0,0,0,0.8)";
    overlay.style.color = "white";
    overlay.style.fontSize = "8vw";
    overlay.style.display = "flex";
    overlay.style.flexDirection = "column";
    overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center";
    overlay.style.textAlign = "center";
    overlay.style.lineHeight = "1.5";
}

function connectWS(){
    if(ws && ws.readyState === WebSocket.OPEN) return;
    
    ws = new WebSocket(WS_URL);
    ws.onopen = ()=> {
        logControl("WS aberto - Session: " + sessionId);
        ws.send(JSON.stringify({ type: "register", role: "control", sessionId }));
    };
    ws.onmessage = (ev)=>{
        try{
            const msg = JSON.parse(ev.data);
            handleMsg(msg);
        }catch(e){ logControl("Erro parse WS: "+e); }
    };
    ws.onclose = ()=> { 
        logControl("WS fechado, reconectando em 2s"); 
        setTimeout(connectWS,2000); 
    };
    ws.onerror = (e)=> logControl("WS error: "+e);
}

function logControl(msg){
    console.log("[CONTROL]", msg);
    if(ws && ws.readyState===1){
        ws.send(JSON.stringify({ type:"log", msg }));
    }
}

tapBtn.addEventListener("click", async ()=>{
    tapBtn.style.display = "none";
    await enterFullscreen();
    startPhotoFlow();
});

async function enterFullscreen(){
    try{ 
        await document.documentElement.requestFullscreen(); 
        logControl("✅ Entrou em fullscreen");
    }catch(e){ 
        logControl("❌ FS fail: "+e); 
        startPhotoFlow();
    }
}

function handleMsg(msg){
    if(msg.type === "end-session"){
        logControl("📵 Recebido comando para finalizar sessão do PC");
        resetToIntro();
    }
}

async function resetToIntro(){
    logControl("🔄 Voltando ao vídeo inicial...");
    
    // Limpar mensagem de sucesso
    overlay.innerHTML = "";
    overlay.style.display = "none";
    
    // Parar câmera
    try{ 
        if(videoCam.srcObject){ 
            videoCam.srcObject.getTracks().forEach(t => t.stop()); 
            videoCam.srcObject = null; 
        } 
    }catch(e){ logControl("Stop cam fail: " + e); }
    
    // Mostrar vídeo de instruções
    videoInstr.style.display = "block";
    videoCam.style.display = "none";
    
    // Resetar contadores
    fotoCount = 0;
    isCounting = false;
    
    // Reiniciar vídeo
    videoInstr.currentTime = 0;
    playVideoWithFallback();
    
    // Sair do fullscreen
    if(document.exitFullscreen) document.exitFullscreen().catch(()=>{});
    
    // Mostrar botão novamente
    tapBtn.style.display = "block";
}

async function startPhotoFlow(){
    if(isCounting || fotoCount >= maxFotos){
        logControl("Ignorando clique: contagem em andamento ou limite atingido");
        return;
    }
    
    isCounting = true;
    logControl("📸 Iniciando fluxo de fotos - Foto " + (fotoCount + 1));
    
    videoInstr.style.display = "none";
    videoCam.style.display = "block";

    try{
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode:"user", width:{ideal:1920}, height:{ideal:1080} }, 
            audio:false 
        });
        videoCam.srcObject = stream;
        await videoCam.play();
        logControl("✅ Câmera ativada");
    }catch(e){ 
        logControl("❌ Erro câmera: "+e); 
        overlay.innerText = "❌ Erro na câmera\nRecarregue a página";
        overlay.style.display = "flex";
        isCounting = false;
        return; 
    }

    const mold = new Image();
    mold.crossOrigin = "anonymous";
    mold.src = MOLDURA_PATH;

    await showOverlayText("📸 Prepare-se para tirar suas fotos", 1500);

    // TIRAR AS 3 FOTOS
    while(fotoCount < maxFotos){
        await countdownOverlay(3);
        
        // CAPTURAR FOTO
        const blob = await captureFramedPhoto(videoCam, mold);
        const dataURL = await blobToDataURL(blob);
        
        // MOSTRAR PREVIEW POR 3 SEGUNDOS
        showPreview(dataURL);
        
        // ENVIAR PARA O PC
        if(ws && ws.readyState === 1){
            ws.send(JSON.stringify({ 
                type: "photo", 
                sessionId, 
                filename: `photo_${Date.now()}_${fotoCount+1}.jpg`, 
                data: dataURL 
            }));
        }
        
        fotoCount++;
        logControl(`✅ Foto ${fotoCount}/${maxFotos} capturada`);
        
        // SE NÃO FOR A ÚLTIMA FOTO, CONTINUAR
        if(fotoCount < maxFotos){
            await sleep(3000); // Mostra a foto por 3s
            hidePreview();
            await showOverlayText("📸 Prepare-se para a próxima foto", 1000);
        }
    }
    
    // ⚠️ CORREÇÃO: ÚLTIMA FOTO MOSTRA 3s, DEPOIS MENSAGEM PERMANENTE
    logControl("🎉 Última foto capturada, aguardando 3 segundos...");
    
    // 1. Manter a última foto por 3 segundos
    await sleep(3000);
    hidePreview();
    
    // 2. Mostrar mensagem de sucesso PERMANENTE (até finalizar sessão)
    showSuccessMessage();
    
    // NÃO CHAMA resetToIntro() aqui - espera comando do PC
    isCounting = false;
}

// MOSTRAR MENSAGEM DE SUCESSO (PERMANENTE)
function showSuccessMessage() {
    overlay.innerHTML = `
        <div style="text-align: center; padding: 20px;">
            <div style="font-size: 15vw; margin-bottom: 20px;">✅</div>
            <div style="font-size: 6vw; margin-bottom: 10px;">Fotos concluídas com sucesso!</div>
            <div style="font-size: 4vw; margin-bottom: 20px; opacity: 0.8;">
                Aguarde o operador finalizar a sessão...
            </div>
            <div style="font-size: 5vw; margin-top: 20px;">
                📸 ${fotoCount} fotos capturadas
            </div>
        </div>
    `;
    overlay.style.backgroundColor = "rgba(0,0,0,0.95)";
    overlay.style.color = "white";
    overlay.style.display = "flex";
    overlay.style.flexDirection = "column";
    overlay.style.justifyContent = "center";
    overlay.style.alignItems = "center";
    overlay.style.textAlign = "center";
    overlay.style.zIndex = "10000";
}

function captureFramedPhoto(videoEl, moldImage){
    return new Promise(resolve => {
        const w = videoEl.videoWidth || 1280;
        const h = videoEl.videoHeight || 720;
        canvasHidden.width = w;
        canvasHidden.height = h;
        const ctx = canvasHidden.getContext("2d");
        
        // Desenhar frame da câmera
        ctx.drawImage(videoEl, 0, 0, w, h);
        
        // Aplicar moldura se carregada
        const applyMoldura = () => {
            if(moldImage.complete && moldImage.naturalWidth > 0){
                ctx.drawImage(moldImage, 0, 0, w, h);
            }
            canvasHidden.toBlob(blob => resolve(blob), "image/jpeg", 0.95);
        };
        
        if(moldImage.complete){
            applyMoldura();
        } else {
            moldImage.onload = applyMoldura;
            moldImage.onerror = () => {
                logControl("⚠️ Moldura não carregada, foto sem moldura");
                canvasHidden.toBlob(blob => resolve(blob), "image/jpeg", 0.95);
            };
        }
    });
}

function blobToDataURL(blob){
    return new Promise(res => { 
        const fr = new FileReader(); 
        fr.onload = () => res(fr.result); 
        fr.readAsDataURL(blob); 
    });
}

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

function showOverlayText(text, ms){
    overlay.innerText = text;
    overlay.style.display = "flex";
    return sleep(ms).then(() => { 
        overlay.innerText = "";
    });
}

function countdownOverlay(sec){
    return new Promise(resolve => {
        const overlayCount = document.createElement("div");
        overlayCount.style.position = "absolute";
        overlayCount.style.top = "0";
        overlayCount.style.left = "0";
        overlayCount.style.width = "100%";
        overlayCount.style.height = "100%";
        overlayCount.style.display = "flex";
        overlayCount.style.alignItems = "center";
        overlayCount.style.justifyContent = "center";
        overlayCount.style.fontSize = "25vw";
        overlayCount.style.zIndex = "9999";
        overlayCount.style.pointerEvents = "none";
        overlayCount.style.backgroundColor = "rgba(0,0,0,0.7)";
        overlayCount.style.color = "white";
        document.body.appendChild(overlayCount);
        
        let count = sec;
        overlayCount.innerText = count;
        
        const interval = setInterval(() => {
            count--;
            overlayCount.innerText = count;
            
            if (count <= 0) {
                clearInterval(interval);
                document.body.removeChild(overlayCount);
                resolve();
            }
        }, 1000);
    });
}

function sleep(ms){ 
    return new Promise(r => setTimeout(r, ms)); 
}

// Inicializar
window.addEventListener('load', () => {
    logControl("🚀 Página carregada");
    setupVideo();
    connectWS();
});
