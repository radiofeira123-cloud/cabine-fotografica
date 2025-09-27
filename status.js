// status.js - para verificar se está funcionando
function verificarConexao() {
    console.log("=== STATUS DA CONEXÃO ===");
    console.log("WebSocket:", ws ? ws.readyState : "Não iniciado");
    console.log("SessionID:", sessionId);
    console.log("Fotos no PC:", fotos.length);
    console.log("========================");
}

// Chamar no console do navegador para debug
window.verificar = verificarConexao;
