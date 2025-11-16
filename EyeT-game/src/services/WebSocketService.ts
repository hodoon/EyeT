import { io, Socket } from "socket.io-client";

// 1. 🔴 여기에 Colab에서 복사한 ngrok 주소를 붙여넣으세요.
const SERVER_URL = "https://unhabitually-unsued-roseanne.ngrok-free.dev"; // 예: "https://abcdef123.ngrok-free.app"

class WebSocketService {
  // (수정) socket을 public으로 변경하여 컴포넌트에서 접근 허용
  public socket: Socket;

  constructor() {
    this.socket = io(SERVER_URL, {
      transports: ["websocket"], // WebSocket 우선 사용
    });

    this.setupListeners();
  }

  // 기본 리스너 설정
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

  /**
   * Base64 인코딩된 이미지를 서버로 전송합니다.
   * @param imageData (예: "data:image/jpeg;base64,...")
   */
  public sendImage(imageData: string): void {
    if (this.socket && this.socket.connected) {
      this.socket.emit("image", imageData); // "image" 이벤트로 전송
    }
  }

  // 연결 해제
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

// 싱글톤 인스턴스 생성
const webSocketService = new WebSocketService();
export default webSocketService;