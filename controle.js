// controle.js - celular da cabine
const WS_URL = "wss://chatcabinerender.onrender.com";
// USAR URL ABSOLUTA PARA O VÍDEO - MUDAR CONFORME SUA HOSPEDAGEM
const MOLDURA_PATH = "https://seusite.com/assets/moldura.png";
const VIDEO_PATH = "https://seusite.com/assets/video-instrucoes.mp4";

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

// Configurar vídeo com fallback
videoInstr.src = VIDEO_PATH;
videoInstr.loop = true;
videoInstr.muted = true;
videoInstr.playsInline = true;

videoInstr.addEventListener('loadeddata', () => {
    logControl("Vídeo de instruções carregado");
    videoInstr.play().catch(e => logControl("Erro play vídeo: " + e));
});

videoInstr.addEventListener('error', (e) => {
    logControl("❌ Erro no vídeo, usando fallback: " + e);
    // Fallback: mostrar imagem estática ou mensagem
    overlay.innerText = "📸 Cabine Fotográfica\nToque para começar";
    overlay.style.display = "flex";
});

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
connectWS();

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
        // Continuar mesmo sem fullscreen
        startPhotoFlow();
    }
}

function handleMsg(msg){
    if(msg.type==="end-session"){
        resetToIntro();
    }
}

async function resetToIntro(){
    try{ 
        if(videoCam.srcObject){ 
            videoCam.srcObject.getTracks().forEach(t=>t.stop()); 
            videoCam.srcObject=null; 
        } 
    }catch(e){ logControl("Stop cam fail: "+e);}
    
    // MOSTRAR VÍDEO DE INSTRUÇÕES NOVAMENTE
    videoInstr.style.display = "block";
    videoCam.style.display = "none";
    overlay.innerText = "";
    overlay.style.backgroundColor = "transparent";
    overlay.style.fontSize = "6vw";
    fotoCount = 0;
    isCounting = false;
    
    // Tentar reproduzir o vídeo novamente
    videoInstr.currentTime = 0;
    videoInstr.play().catch(e => logControl("Erro replay vídeo: " + e));
    
    // Sair do fullscreen se estiver
    if(document.exitFullscreen) document.exitFullscreen().catch(()=>{});
    
    // Mostrar botão novamente
    tapBtn.style.display = "block";
    logControl("🔄 Voltou ao vídeo inicial");
}

async function startPhotoFlow(){
    if(isCounting || fotoCount >= maxFotos){
        logControl("Ignorando clique: contagem em andamento ou limite atingido");
        return;
    }
    
    isCounting = true;
    logControl("📸 Iniciando fluxo de fotos - Foto " + (fotoCount + 1));
    
    // ESCONDER VÍDEO DE INSTRUÇÕES
    videoInstr.style.display = "none";
    videoCam.style.display = "block";

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
        await videoCam.play();
        logControl("✅ Câmera ativada");
    }catch(e){ 
        logControl("❌ Erro câmera: "+e); 
        // Fallback: mostrar mensagem de erro
        overlay.innerText = "❌ Erro na câmera\nRecarregue a página";
        overlay.style.display = "flex";
        isCounting = false;
        return; 
    }

    const mold = new Image();
    mold.crossOrigin = "anonymous";
    mold.src = MOLDURA_PATH;

    await showOverlayText("📸 Prepare-se para tirar suas fotos", 1500);

    // TIRAR FOTOS SEQUENCIAIS
    while(fotoCount < maxFotos){
        await countdownOverlay(3);
        
        // CAPTURAR FOTO
        const blob = await captureFramedPhoto(videoCam, mold);
        const dataURL = await blobToDataURL(blob);
        
        // MOSTRAR PREVIEW POR 3 SEGUNDOS APENAS
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
        
        // AGUARDAR 3 SEGUNDOS MOSTRANDO A FOTO
        await sleep(3000);
        
        // ESCONDER PREVIEW E VOLTAR PARA CÂMERA
        hidePreview();
        
        // SE NÃO FOR A ÚLTIMA FOTO, PREPARAR PRÓXIMA
        if(fotoCount < maxFotos){
            await showOverlayText("📸 Prepare-se para a próxima foto", 1000);
        }
    }
    
    // ⚠️ CORREÇÃO: APÓS A ÚLTIMA FOTO, MOSTRAR MENSAGEM DE SUCESSO
    // E DEPOIS VOLTAR AO INÍCIO - NÃO TRAVAR NA FOTO
    
    logControl("🎉 Todas as fotos concluídas!");
    
    // 1. Mostrar mensagem de sucesso por 5 segundos
    overlay.innerText = "✅ Sucesso!\nObrigado por utilizar a cabine fotográfica 😃";
    overlay.style.backgroundColor = "rgba(0,0,0,0.9)";
    overlay.style.color = "white";
    overlay.style.fontSize = "6vw";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.height = "100%";
    
    // 2. Aguardar 5 segundos com a mensagem
    await sleep(5000);
    
    // 3. VOLTAR AO VÍDEO INICIAL (não travar na última foto)
    resetToIntro();
    
    isCounting = false;
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
            
            // Timeout para não travar se a moldura não carregar
            setTimeout(applyMoldura, 1000);
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
        img.style.zIndex = 9998;
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
        overlayCount.style.zIndex = 9999;
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

// Fallback: tentar reproduzir vídeo quando a página carregar
window.addEventListener('load', () => {
    setTimeout(() => {
        videoInstr.play().catch(e => {
            logControl("Autoplay bloqueado, mostrando fallback");
            overlay.innerText = "📸 Cabine Fotográfica\nToque para começar";
            overlay.style.display = "flex";
        });
    }, 1000);
});
