// hodoon/eyet/EyeT-eaaf522f0858267e704c53039fcda85cb12ae3d5/EyeT-game/src/components/GameView.tsx
import React, { useEffect, useRef } from 'react';
import Phaser from 'phaser';
import type { DiagnosisResult } from '../App';
import { EyeGazeTracker } from '../game/EyeGazeTracker';
import { ArcheryGameScene } from '../game/scenes/ArcheryGameScene';

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
      videoElement.style.display = 'none';
      document.body.appendChild(videoElement);
      
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      videoElement.srcObject = stream;
      videoRef.current = videoElement;

      // 2. 시선 추적기 초기화
      tracker = new EyeGazeTracker();
      await tracker.initialize();
      gazeTrackerRef.current = tracker;
      console.log("EyeGazeTracker 초기화 완료");

      // 3. Phaser 게임 설정 (데이터를 변수로 관리)
      const gameDimensions = { width: 1024, height: 768 };

      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: gameDimensions.width,
        height: gameDimensions.height,
        parent: 'phaser-game-container',
        scene: [], // ✅ [수정] 씬을 비워두고 나중에 수동으로 추가
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

      // 5. ✅ [수정] 씬을 수동으로 'add'하고 'start'하면서 init 데이터를 주입
      game.scene.add('ArcheryGameScene', ArcheryGameScene, true, {
        diagnosis: diagnosisResult,
        dimensions: gameDimensions
      });

      // 6. 매 프레임마다 시선 좌표를 React -> Phaser로 전달 (GazePoint는 Registry 사용)
      const gameLoop = async () => {
        if (tracker && game && videoElement) {
          const normalizedPoint = await tracker.getGazePoint(videoElement);
          
          if (normalizedPoint) {
            const gazePoint = {
              x: normalizedPoint.x * (config.width as number),
              y: normalizedPoint.y * (config.height as number)
            };
            // 시선 좌표(gazePoint)는 매 프레임 업데이트되므로 registry를 계속 사용합니다.
            game.registry.set('gazePoint', gazePoint);
          }
        }
        animationFrameRef.current = requestAnimationFrame(gameLoop);
      };
      
      gameLoop();
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
  // (기존 코드와 동일)
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      <h2 className="text-3xl font-bold mb-4">맞춤형 훈련 게임: 양궁</h2>
      
      <p className="text-xl mb-6">
        진단 결과: <span className="font-bold text-yellow-400">{diagnosisResult}</span> (훈련 시작)
      </p>

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