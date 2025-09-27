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
    setupPaths(); // Configurar URLs
    
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
    
    videoInstr.style.display = "block";
    videoCam.style.display = "none";
    overlay.innerText = "";
    overlay.style.backgroundColor = "transparent";
    fotoCount = 0;
    isCounting = false;
    
    videoInstr.currentTime = 0;
    playVideoWithFallback();
    
    if(document.exitFullscreen) document.exitFullscreen().catch(()=>{});
    tapBtn.style.display = "block";
    logControl("🔄 Voltou ao início");
}

async function startPhotoFlow(){
    if(isCounting || fotoCount>=maxFotos) return;
    
    isCounting=true;
    videoInstr.style.display="none";
    videoCam.style.display="block";

    try{
        const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode:"user", width:{ideal:1920}, height:{ideal:1080} }, 
            audio:false 
        });
        videoCam.srcObject = stream;
        await videoCam.play();
    }catch(e){ 
        logControl("Erro câmera: "+e); 
        isCounting = false;
        return; 
    }

    const mold = new Image();
    mold.crossOrigin="anonymous";
    mold.src=MOLDURA_PATH;

    await showOverlayText("Prepare-se para tirar suas fotos",1500);

    while(fotoCount<maxFotos){
        await countdownOverlay(3);
        const blob = await captureFramedPhoto(videoCam, mold);
        const dataURL = await blobToDataURL(blob);
        showPreview(dataURL);
        
        if(ws && ws.readyState===1){
            ws.send(JSON.stringify({ 
                type:"photo", 
                sessionId, 
                filename:`photo_${Date.now()}_${fotoCount+1}.jpg`, 
                data:dataURL 
            }));
        }
        
        fotoCount++;
        
        if(fotoCount < maxFotos){
            await sleep(3000);
            hidePreview();
            await showOverlayText("Prepare-se para a próxima foto",1000);
        }
    }
    
    // ⚠️ CORREÇÃO: Fluxo final correto
    overlay.innerText="✅ Sucesso! Obrigado por utilizar a cabine fotográfica 😃";
    overlay.style.backgroundColor="rgba(0,0,0,0.9)";
    overlay.style.color="white";
    overlay.style.fontSize="6vw";
    overlay.style.display="flex";
    
    await sleep(5000); // Mostrar mensagem por 5s
    resetToIntro(); // Voltar ao início
    isCounting=false;
}

function captureFramedPhoto(videoEl, moldImage){
    return new Promise(resolve=>{
        const w=videoEl.videoWidth||1280;
        const h=videoEl.videoHeight||720;
        canvasHidden.width=w;
        canvasHidden.height=h;
        const ctx = canvasHidden.getContext("2d");
        ctx.drawImage(videoEl,0,0,w,h);
        if(moldImage.complete){
            ctx.drawImage(moldImage,0,0,w,h);
            canvasHidden.toBlob(b=>resolve(b),"image/jpeg",0.95);
        }else{
            moldImage.onload=()=>{ 
                ctx.drawImage(moldImage,0,0,w,h); 
                canvasHidden.toBlob(b=>resolve(b),"image/jpeg",0.95); 
            };
        }
    });
}

function blobToDataURL(blob){
    return new Promise(res=>{ 
        const fr=new FileReader(); 
        fr.onload=()=>res(fr.result); 
        fr.readAsDataURL(blob); 
    });
}

function showPreview(dataURL){
    let img=document.getElementById("__previewImg");
    if(!img){
        img=document.createElement("img");
        img.id="__previewImg";
        img.style.position="absolute";
        img.style.top="0";
        img.style.left="0";
        img.style.width="100%";
        img.style.height="100%";
        img.style.objectFit="contain";
        img.style.zIndex=9998;
        document.body.appendChild(img);
    }
    img.src=dataURL;
    img.style.display="block";
    videoCam.style.display="none";
}

function hidePreview(){
    const img=document.getElementById("__previewImg");
    if(img) img.style.display="none";
    videoCam.style.display="block";
}

function showOverlayText(text,ms){
    overlay.innerText=text;
    overlay.style.display="flex";
    return sleep(ms).then(()=> overlay.innerText="");
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

function sleep(ms){ return new Promise(r => setTimeout(r, ms)); }

// Inicializar
window.addEventListener('load', () => {
    logControl("🚀 Página carregada");
    setupVideo();
    connectWS();
});
