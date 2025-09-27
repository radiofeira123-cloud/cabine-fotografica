/*
server.js
Simple signaling server and WebSocket relay using ws + express.
This is not a persistent storage server — it simply relays messages between clients sharing the same sessionId.
Run with: node server.js
*/
import express from "express";
import http from "http";
import { WebSocketServer } from "ws";
import { v4 as uuidv4 } from "uuid";

const app = express();
app.use(express.json());
app.get("/", (req,res)=> res.send("Signaling server running"));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const clients = new Map(); // ws -> meta

wss.on("connection", (ws) => {
  ws.id = uuidv4();
  clients.set(ws, { id: ws.id });
  ws.on("message", (raw) => {
    try{
      const msg = JSON.parse(raw.toString());
      // handle register
      if(msg.type === "register"){
        const meta = clients.get(ws) || {};
        meta.role = msg.role;
        meta.sessionId = msg.sessionId || uuidv4();
        meta.id = ws.id;
        clients.set(ws, meta);
        ws.send(JSON.stringify({ type: "registered", id: ws.id, sessionId: meta.sessionId }));
        return;
      }
      // route message to other clients in same session
      for(const [client, meta] of clients.entries()){
        if(client === ws) continue;
        if(meta.sessionId && meta.sessionId === msg.sessionId){
          try { client.send(JSON.stringify(msg)); } catch(e){ console.warn("send fail", e); }
        }
      }
    }catch(e){
      console.error("invalid message", e);
    }
  });
  ws.on("close", ()=> clients.delete(ws));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, ()=> console.log("Signaling server listening on", PORT));
