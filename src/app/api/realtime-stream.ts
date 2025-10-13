import WebSocket, { WebSocketServer } from "ws";
import fetch from "node-fetch";

export const config = { runtime: "nodejs" };
let wsServer: WebSocketServer;

async function createOpenAIConnection() {
  const sessionRes = await fetch("https://api.openai.com/v1/realtime/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model: "gpt-4o-realtime-preview-2025-06-03", voice: "alloy" }),
  });
  const session = await sessionRes.json();

  return new WebSocket(session.client_secret.value, {
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
  });
}

export default function handler(req: any, res: any) {
  if (req.headers.upgrade !== "websocket") {
    res.status(426).send("Expected WebSocket");
    return;
  }

  if (!wsServer) {
    wsServer = new WebSocketServer({ noServer: true });

    wsServer.on("connection", async (twilioWs) => {
      console.log("🔌 Twilio connected to WebSocket stream");
      let openaiWs;

      try { openaiWs = await createOpenAIConnection(); }
      catch (e) { console.error("❌ OpenAI connection failed", e); twilioWs.close(); return; }

      openaiWs.on("message", (msg) => {
        const data = JSON.parse(msg.toString());
        if (data.type === "response.audio.delta") {
          twilioWs.send(JSON.stringify({
            event: "media",
            streamSid: "realtime-audio",
            media: { payload: data.delta },
          }));
        }
      });

      twilioWs.on("message", (msg) => {
        const data = JSON.parse(msg.toString());
        if (data.event === "media") openaiWs.send(JSON.stringify({ type: "input_audio_buffer.append", audio: data.media.payload }));
        else if (data.event === "stop") {
          openaiWs.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
          openaiWs.send(JSON.stringify({ type: "response.create" }));
        }
      });

      twilioWs.on("close", () => console.log("❌ Twilio disconnected"));
    });
  }

  const { socket } = res;
  wsServer.handleUpgrade(req, socket, Buffer.alloc(0), (ws) => wsServer.emit("connection", ws, req));
}
