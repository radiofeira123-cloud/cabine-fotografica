// PC.js - PC Central da cabine
const WS_URL = "wss://chatcabinerender.onrender.com";
const IMGBB_API_KEY = "6734e028b20f88d5795128d242f85582";

let ws;
let sessionId = null;
let fotos = [];

const qrContainer = document.createElement("div");
document.body.appendChild(qrContainer);

const galeriaContainer = document.createElement("div");
document.body.appendChild(galeriaContainer);

// Função para gerar QR Code
function gerarQRCode(url) {
  qrContainer.innerHTML = "";
  const qrcode = new QRCode(qrContainer, {
    text: url,
    width: 200,
    height: 200
  });
}

// Conecta WebSocket
function conectarWS() {
  ws = new WebSocket(WS_URL);
  ws.onopen = () => {
    console.log("Conectado ao WebSocket");
    sessionId = generateUUID();
    ws.send(JSON.stringify({ type: "register", role: "pc", sessionId }));
  };
  ws.onmessage = (msg) => {
    try {
      const data = JSON.parse(msg.data);
      if(data.type === "foto") {
        receberFoto(data);
      }
    } catch(e){ console.error(e); }
  };
}

// Recebe foto do celular
function receberFoto(data) {
  const img = new Image();
  img.src = data.url; // já vem com moldura aplicada
  fotos.push(img.src);
  atualizarGaleria();
}

// Atualiza galeria
function atualizarGaleria() {
  galeriaContainer.innerHTML = "";
  fotos.forEach((src, idx) => {
    const div = document.createElement("div");
    div.style.position = "relative";
    const img = document.createElement("img");
    img.src = src;
    img.style.width = "200px";
    img.style.margin = "5px";
    div.appendChild(img);
    const btn = document.createElement("button");
    btn.textContent = "X";
    btn.style.position = "absolute";
    btn.style.top = "0";
    btn.style.right = "0";
    btn.onclick = () => {
      fotos.splice(idx,1);
      atualizarGaleria();
    };
    div.appendChild(btn);
    galeriaContainer.appendChild(div);
  });
}

// Finalizar sessão
async function finalizarSessao() {
  qrContainer.innerHTML = "";
  // Upload fotos para IMGBB
  const urls = [];
  for(const f of fotos) {
    const form = new FormData();
    form.append("image", f.split(",")[1]);
    form.append("key", IMGBB_API_KEY);
    const res = await fetch("https://api.imgbb.com/1/upload", {
      method: "POST",
      body: form
    });
    const json = await res.json();
    urls.push(json.data.url);
  }
  // Gerar QR Code visualizador
  const visualizadorURL = `https://SEU_SITE_VERCEL/visualizador.html?session=${sessionId}`;
  gerarQRCode(visualizadorURL);
  fotos = [];
  atualizarGaleria();
}

// Iniciar sessão (apenas exemplo)
function iniciarSessao() {
  console.log("Sessão iniciada");
}

// Gerar UUID simples
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// Criar botões
const btnGerarQR = document.createElement("button");
btnGerarQR.textContent = "Gerar QR Code do controle";
btnGerarQR.onclick = () => {
  const url = `${window.location.origin}/controle.html?session=${sessionId}`;
  gerarQRCode(url);
};
document.body.appendChild(btnGerarQR);

const btnIniciar = document.createElement("button");
btnIniciar.textContent = "Iniciar sessão";
btnIniciar.onclick = iniciarSessao;
document.body.appendChild(btnIniciar);

const btnFinalizar = document.createElement("button");
btnFinalizar.textContent = "Finalizar sessão";
btnFinalizar.onclick = finalizarSessao;
document.body.appendChild(btnFinalizar);

// Start
conectarWS();
