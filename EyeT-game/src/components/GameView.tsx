import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { DiagnosisResult } from '../App';
import { EyeGazeTracker } from '../game/EyeGazeTracker'; // 1. 시선 추적기 import
import { ArcheryGameScene } from '../game/scenes/ArcheryGameScene'; // 2. 새 게임 씬 import

// GameView가 받을 Props 정의
interface GameViewProps {
  diagnosisResult: DiagnosisResult | null;
  onReturn: () => void;
}

const GameView: React.FC<GameViewProps> = ({ diagnosisResult, onReturn }) => {
  // Phaser 게임 인스턴스와 시선 추적기를 ref로 관리
  const phaserGameRef = useRef<Phaser.Game | null>(null);
  const gazeTrackerRef = useRef<EyeGazeTracker | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const animationFrameRef = useRef<number>(0);

  // 컴포넌트 마운트 시 게임 및 시선 추적기 초기화
  useEffect(() => {
    // 진단 결과가 없으면 즉시 복귀
    if (!diagnosisResult) {
      console.error("GameView: 진단 결과가 없습니다. 진단 화면으로 돌아갑니다.");
      onReturn();
      return;
    }

    let tracker: EyeGazeTracker;
    let game: Phaser.Game;

    // 비동기 초기화 함수
    const initGame = async () => {
      // 1. 숨겨진 비디오 요소 생성 및 웹캠 시작
      const videoElement = document.createElement('video');
      videoElement.autoplay = true;
      videoElement.playsInline = true;
      videoElement.style.display = 'none'; // 화면에는 보이지 않음
      document.body.appendChild(videoElement);
      
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoElement.srcObject = stream;
      videoRef.current = videoElement;

      // 2. 시선 추적기 초기화
      tracker = new EyeGazeTracker();
      await tracker.initialize();
      gazeTrackerRef.current = tracker;
      console.log("EyeGazeTracker 초기화 완료");

      // 3. Phaser 게임 설정
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: 1024, // 게임 해상도
        height: 768,
        parent: 'phaser-game-container', // 게임 캔버스를 렌더링할 div의 id
        scene: [ArcheryGameScene],
        backgroundColor: '#f0f0f0',
        physics: {
          default: 'arcade',
          arcade: {
            debug: false,
          },
        },
      };

      // 4. Phaser 게임 인스턴스 생성
      game = new Phaser.Game(config);
      phaserGameRef.current = game;

      // 5. 게임 씬이 준비되면, 진단 결과(diagnosisResult)를 씬으로 전달
      game.events.on('ready', () => {
        game.registry.set('diagnosis', diagnosisResult);
        game.registry.set('gameDimensions', { width: config.width, height: config.height });
      });

      // 6. 매 프레임마다 시선 좌표를 React -> Phaser로 전달
      const gameLoop = async () => {
        if (tracker && game && videoElement) {
          // 시선 좌표 (0.0 ~ 1.0)
          const normalizedPoint = await tracker.getGazePoint(videoElement);
          
          if (normalizedPoint) {
            // 게임 좌표 (0 ~ 1024)로 변환
            const gazePoint = {
              x: normalizedPoint.x * (config.width as number),
              y: normalizedPoint.y * (config.height as number)
            };
            
            // 'gazePoint'라는 키로 Phaser 씬에 좌표 전달
            game.registry.set('gazePoint', gazePoint);
          }
        }
        animationFrameRef.current = requestAnimationFrame(gameLoop);
      };
      
      gameLoop(); // 루프 시작
    };

    initGame();

    // 컴포넌트 언마운트 시 모든 리소스 정리
    return () => {
      cancelAnimationFrame(animationFrameRef.current);
      gazeTrackerRef.current?.close();
      phaserGameRef.current?.destroy(true);
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
        videoRef.current.remove();
      }
      console.log("GameView: 게임 및 시선 추적기 리소스 정리 완료");
    };
  }, [diagnosisResult, onReturn]);

  
  // --- 렌더링 (UI) ---
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <h2 className="text-3xl font-bold mb-4">맞춤형 훈련 게임: 양궁</h2>
      
      <p className="text-xl mb-6">
        진단 결과: <span className="font-bold text-yellow-400">{diagnosisResult}</span> (훈련 시작)
      </p>

      {/* Phaser 게임 캔버스가 이 div 안에 생성됩니다. */}
      <div id="phaser-game-container" 
           className="w-full max-w-4xl h-[768px] bg-black rounded-lg shadow-lg mb-6"
           style={{ width: '1024px', height: '768px' }}>
        {/* Phaser가 여기에 캔버스를 삽입합니다. */}
      </div>

      <button
        onClick={onReturn}
        className="px-6 py-3 text-lg font-bold text-white bg-blue-600 rounded-lg shadow-md
                   hover:bg-blue-700 focus:outline-none focus:ring-2 
                   focus:ring-blue-500 focus:ring-opacity-50 transition-all duration-300"
      >
        ← 진단 화면으로 돌아가기
      </button>
    </div>
  );
};

export default GameView;