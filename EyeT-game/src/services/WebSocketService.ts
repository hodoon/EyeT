import { io, Socket } from "socket.io-client";

const SERVER_URL = "https://unhabitually-unsued-roseanne.ngrok-free.dev";

class WebSocketService {
  public socket: Socket;

  constructor() {
    this.socket = io(SERVER_URL, {
      transports: ["websocket"],
    });

    this.setupListeners();
  }

  private setupListeners(): void {
    this.socket.on("connect", () => {
      console.log(`✅ WebSocket 연결 성공 (ID: ${this.socket.id})`);
    });

    this.socket.on("disconnect", () => {
      console.log("❌ WebSocket 연결 끊김");
    });

    this.socket.on("error", (error: string) => {
      console.error("WebSocket 오류:", error);
    });
  }

  public sendImage(imageData: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit("image", imageData);
    }
  }

  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

const webSocketService = new WebSocketService();
export default webSocketService;