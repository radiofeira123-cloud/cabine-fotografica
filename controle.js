// controle.js - celular da cabine COM NOVO DESIGN
const WS_URL = "wss://chatcabinerender.onrender.com";
const MOLDURA_PATH = "assets/moldura.png";

let ws;
let sessionId = null;
let fotoCount = 0;
let maxFotos = 3;
let isCounting = false;

// Elementos da nova interface
const telaInicio = document.getElementById("telaInicio");
const telaPrepareSe = document.getElementById("telaPrepareSe");
const telaContagem = document.getElementById("telaContagem");
const telaFinal = document.getElementById("telaFinal");
const contadorElement = telaContagem.querySelector(".contador");

// Elementos originais
const videoCam = document.getElementById("videoCam");
const overlay = document.getElementById("overlay");
const tapBtn = document.getElementById("tapBtn");
const canvasHidden = document.getElementById("canvasHidden");

// Extrair sessionId da URL
const urlParams = new URLSearchParams(window.location.search);
sessionId = urlParams.get('session');

// Configurar paths
function setupPaths() {
    const baseUrl = window.location.origin;
    MOLDURA_PATH = `${baseUrl}/assets/moldura.png`;
    logControl(`🔗 URLs configuradas: ${baseUrl}`);
}

// Nova função para iniciar sessão
async function iniciarSessao() {
    logControl("🎬 Iniciando sessão fotográfica");
    
    // Animação de saída da tela inicial
    telaInicio.style.opacity = "0";
    await sleep(800);
    telaInicio.style.display = "none";
    
    // Mostrar tela "Prepare-se"
    mostrarTela(telaPrepareSe);
    await sleep(2000);
    
    // Entrar em tela cheia e iniciar fotos
    await enterFullscreen();
    startPhotoFlow();
}

// Função para mostrar telas de transição
function mostrarTela(tela) {
    // Esconder todas as telas
    document.querySelectorAll('.tela-transicao').forEach(t => {
        t.classList.remove('ativa');
    });
    
    // Mostrar tela específica
    tela.classList.add('ativa');
}

// Contagem regressiva animada
async function countdownAnimado(segundos) {
    mostrarTela(telaContagem);
    
    for (let i = segundos; i >= 1; i--) {
        contadorElement.textContent = i;
        contadorElement.style.animation = 'none';
        contadorElement.offsetHeight; // Trigger reflow
        contadorElement.style.animation = 'zoomInOut 1s ease';
        await sleep(1000);
    }
    
    // Esconder tela de contagem
    telaContagem.classList.remove('ativa');
}

// Função principal do fluxo de fotos (ATUALIZADA)
async function startPhotoFlow(){
    if(isCounting || fotoCount >= maxFotos) return;
    
    isCounting = true;
    fotoCount = 0;

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
        mostrarErro("❌ Erro na câmera\nRecarregue a página");
        isCounting = false;
        return; 
    }

    const mold = new Image();
    mold.crossOrigin = "anonymous";
    mold.src = MOLDURA_PATH;

    // TIRAR AS 3 FOTOS
    while(fotoCount < maxFotos){
        // Mostrar contagem regressiva animada
        await countdownAnimado(3);
        
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
        
        // ATUALIZAR MINIATURAS NA TELA FINAL
        atualizarMiniaturas();
        
        // SE NÃO FOR A ÚLTIMA FOTO, PREPARAR PRÓXIMA
        if(fotoCount < maxFotos){
            await sleep(3000); // Mostra a foto por 3s
            hidePreview();
            
            // Mostrar prepare-se para próxima foto
            mostrarTela(telaPrepareSe);
            await sleep(1500);
        }
    }
    
    // ÚLTIMA FOTO: Mostrar por 3s depois tela final
    await sleep(3000);
    hidePreview();
    
    // MOSTRAR TELA FINAL ANIMADA
    mostrarTelaFinal();
    
    isCounting = false;
}

function mostrarTelaFinal() {
    mostrarTela(telaFinal);
    logControl("🎉 Todas as fotos concluídas - Aguardando finalização do PC");
}

function atualizarMiniaturas() {
    const miniaturas = document.querySelectorAll('.miniatura');
    miniaturas.forEach((miniatura, index) => {
        if (index < fotoCount) {
            miniatura.style.background = "linear-gradient(45deg, #00c6ff, #0072ff)";
            miniatura.innerHTML = "✓";
        } else {
            miniatura.style.background = "rgba(255,255,255,0.1)";
            miniatura.innerHTML = index + 1;
        }
    });
}

function mostrarErro(mensagem) {
    overlay.innerText = mensagem;
    overlay.style.backgroundColor = "rgba(255,0,0,0.9)";
    overlay.style.color = "white";
    overlay.style.fontSize = "6vw";
    overlay.style.display = "flex";
}

// WebSocket e funções restantes (MANTIDAS)
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

async function enterFullscreen(){
    try{ 
        await document.documentElement.requestFullscreen(); 
        logControl("✅ Entrou em fullscreen");
    }catch(e){ 
        logControl("❌ FS fail: "+e); 
    }
}

function handleMsg(msg){
    if(msg.type === "end-session"){
        logControl("📵 Recebido comando para finalizar sessão do PC");
        resetToIntro();
    }
}

async function resetToIntro(){
    logControl("🔄 Voltando ao início...");
    
    // Esconder todas as telas
    document.querySelectorAll('.tela-transicao').forEach(t => {
        t.classList.remove('ativa');
    });
    
    // Parar câmera
    try{ 
        if(videoCam.srcObject){ 
            videoCam.srcObject.getTracks().forEach(t => t.stop()); 
            videoCam.srcObject = null; 
        } 
    }catch(e){ logControl("Stop cam fail: " + e); }
    
    // Resetar contadores
    fotoCount = 0;
    isCounting = false;
    atualizarMiniaturas();
    
    // Sair do fullscreen
    if(document.exitFullscreen) document.exitFullscreen().catch(()=>{});
    
    // Mostrar tela inicial novamente
    telaInicio.style.display = "flex";
    setTimeout(() => {
        telaInicio.style.opacity = "1";
    }, 100);
}

// Funções auxiliares (MANTIDAS)
function captureFramedPhoto(videoEl, moldImage){
    return new Promise(resolve => {
        const w = videoEl.videoWidth || 1280;
        const h = videoEl.videoHeight || 720;
        canvasHidden.width = w;
        canvasHidden.height = h;
        const ctx = canvasHidden.getContext("2d");
        ctx.drawImage(videoEl, 0, 0, w, h);
        
        if(moldImage.complete){
            ctx.drawImage(moldImage, 0, 0, w, h);
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

function sleep(ms){ 
    return new Promise(r => setTimeout(r, ms)); 
}

// Inicializar
window.addEventListener('load', () => {
    logControl("🚀 Cabine Fotográfica carregada");
    setupPaths();
    connectWS();
    
    // Adicionar evento para o botão original (compatibilidade)
    tapBtn.addEventListener("click", iniciarSessao);
});
