import { io, Socket } from "socket.io-client";

// 1. 🔴 여기에 Colab에서 복사한 ngrok 주소를 붙여넣으세요.
const SERVER_URL = "https://unhabitually-unsued-roseanne.ngrok-free.dev"; // 예: "https://abcdef123.ngrok-free.app"

class WebSocketService {
  // 1. (수정) socket을 public으로 변경하여 컴포넌트에서 접근 허용
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

    // 2. (제거) 컴포넌트가 직접 리스닝하므로 서비스의 'results' 핸들러는 제거
    // this.socket.on("results", (data: any) => { ... });
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