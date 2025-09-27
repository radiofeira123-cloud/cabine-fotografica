// visualizador.js
function decodeSession(enc){
  try{
    const json = decodeURIComponent(escape(atob(enc)));
    return JSON.parse(json);
  }catch(e){
    console.error("decode failed", e);
    return null;
  }
}

window.addEventListener("load", ()=>{
  const params = new URLSearchParams(location.search);
  const enc = params.get("session");
  const container = document.getElementById("fotosContainer");
  if(!enc){ container.innerText = "Sessão inválida."; return; }
  const sess = decodeSession(enc);
  if(!sess || !sess.images || sess.images.length === 0){ container.innerText = "Nenhuma imagem."; return; }
  sess.images.forEach((url, idx)=>{
    const div = document.createElement("div");
    div.className = "foto";
    const img = document.createElement("img");
    img.src = url;
    const btn = document.createElement("button");
    btn.innerText = "Baixar foto";
    btn.onclick = (ev)=>{
      ev.preventDefault();
      const link = document.createElement("a");
      link.href = url;
      link.download = `cabine_${idx+1}.jpg`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };
    div.appendChild(img);
    div.appendChild(btn);
    container.appendChild(div);
  });
});
