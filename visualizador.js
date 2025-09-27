/*
visualizador.js
- Decodes session param (base64 JSON with images array)
- Renders images with "Baixar foto" buttons that force download using a temporary link click
*/
function safeAtob(str){
  try { return atob(str); } catch(e){ return null; }
}

function decodeSession(enc){
  try{
    const json = decodeURIComponent(escape(atob(enc)));
    return JSON.parse(json);
  }catch(e){
    console.error("Failed decoding session", e);
    return null;
  }
}

window.addEventListener("load", ()=>{
  const params = new URLSearchParams(location.search);
  const enc = params.get("session");
  const container = document.getElementById("fotos");
  if(!enc){ container.innerText = "Sessão inválida."; return; }
  const sess = decodeSession(enc);
  if(!sess || !sess.images || sess.images.length===0){ container.innerText = "Nenhuma imagem nesta sessão."; return; }
  sess.images.forEach((url, idx)=>{
    const div = document.createElement("div");
    div.style.marginBottom = "18px";
    const img = document.createElement("img");
    img.src = url;
    img.style.maxWidth = "90%";
    img.style.height = "auto";
    const btn = document.createElement("button");
    btn.innerText = "Baixar foto";
    btn.onclick = (ev)=> {
      ev.preventDefault();
      const link = document.createElement("a");
      link.href = url;
      link.download = `cabine_${idx+1}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
    div.appendChild(img);
    div.appendChild(document.createElement("br"));
    div.appendChild(btn);
    container.appendChild(div);
  });
});
