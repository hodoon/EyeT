import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import type { DiagnosisResult } from '../App';
import { EyeGazeTracker } from '../game/EyeGazeTracker';
import { ArcheryGameScene } from '../game/scenes/ArcheryGameScene';

// 시선 민감도 (픽셀)
const GAZE_SENSITIVITY = 1000; 

// 얼굴 가이드라인 영역 (정규화된 좌표 0.0 ~ 1.0)
const HEAD_SAFE_ZONE = {
  xMin: 0.4,
  xMax: 0.6,
  yMin: 0.35,
  yMax: 0.65,
};

// GameView가 받을 Props 정의
interface GameViewProps {
  diagnosisResult: DiagnosisResult | null;
  onReturn: () => void;
}

const GameView: React.FC<GameViewProps> = ({ diagnosisResult, onReturn }) => {
  const phaserGameRef = useRef<Phaser.Game | null>(null);
  const gazeTrackerRef = useRef<EyeGazeTracker | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  
  const [isHeadInBounds, setIsHeadInBounds] = useState(true);
  const gazeOffsetRef = useRef<{x: number, y: number}>({ x: 0.5, y: 0.5 }); 

  useEffect(() => {
    if (!diagnosisResult) {
      console.error("GameView: 진단 결과가 없습니다. 진단 화면으로 돌아갑니다.");
      onReturn();
      return;
    }

    let gameLoopInterval: number;
    const initialDimensions = { width: window.innerWidth, height: window.innerHeight };

    const initGame = async () => {
      if (!videoRef.current) {
        console.error("비디오 Ref가 없습니다.");
        return;
      }
      
      const videoElement = videoRef.current;

      try {
        videoElement.srcObject = await navigator.mediaDevices.getUserMedia({ video: true });
        videoElement.play();
      } catch (err) {
        console.error("웹캠을 시작할 수 없습니다:", err);
        return;
      }

      const tracker = new EyeGazeTracker();
      await tracker.initialize();
      gazeTrackerRef.current = tracker;
      console.log("EyeGazeTracker 초기화 완료");

      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: initialDimensions.width,
        height: initialDimensions.height,
        parent: 'phaser-game-container',
        scene: [],
        backgroundColor: 'transparent',
        physics: {
          default: 'arcade',
          arcade: { debug: false },
        },
      };

      const game = new Phaser.Game(config);
      phaserGameRef.current = game;

      game.scene.add('ArcheryGameScene', ArcheryGameScene, true, {
        diagnosis: diagnosisResult,
        dimensions: initialDimensions
      });

      gameLoopInterval = setInterval(async () => {
        const currentTracker = gazeTrackerRef.current;
        const currentGame = phaserGameRef.current;
        const currentVideo = videoRef.current;
        const offset = gazeOffsetRef.current;
        const gameConfig = currentGame?.config;

        if (currentTracker && currentGame && currentVideo && gameConfig) {
          const trackingData = await currentTracker.getGazeAndHead(currentVideo);
          
          if (trackingData) {
            const { gaze, head } = trackingData;
            const headX = 1.0 - head.x; 
            const headY = head.y;
            
            const inBounds = 
                 headX > HEAD_SAFE_ZONE.xMin && headX < HEAD_SAFE_ZONE.xMax &&
                 headY > HEAD_SAFE_ZONE.yMin && headY < HEAD_SAFE_ZONE.yMax;
            
            setIsHeadInBounds(inBounds);

            if (inBounds) {
              const relativeX = (1.0 - gaze.x) - offset.x; 
              const relativeY = gaze.y - offset.y;
              const centerX = (gameConfig.width as number) / 2;
              const centerY = (gameConfig.height as number) / 2;
              const gazePoint = {
                x: centerX + (relativeX * GAZE_SENSITIVITY),
                y: centerY + (relativeY * GAZE_SENSITIVITY)
              };
              currentGame.registry.set('gazePoint', gazePoint);
            }
          } else {
            setIsHeadInBounds(false);
          }
        }
      }, 100);
    };

    initGame();

    const handleResize = () => {
      if (phaserGameRef.current) {
        phaserGameRef.current.scale.resize(window.innerWidth, window.innerHeight);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      clearInterval(gameLoopInterval);
      window.removeEventListener('resize', handleResize);
      gazeTrackerRef.current?.close();
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true);
      }
      
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
      console.log("GameView: 게임 및 시선 추적기 리소스 정리 완료");
    };
  }, [diagnosisResult, onReturn]); 

  return (
    <div className="w-screen h-screen bg-gray-900 text-white relative">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        className="absolute top-0 left-0 w-full h-full object-cover transform -scale-x-100 z-0"
      />
      <svg
        className="absolute top-0 left-0 w-full h-full z-10 pointer-events-none"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <ellipse 
          cx="50%"
          cy="50%"
          rx="10%"
          ry="15%"
          stroke={isHeadInBounds ? 'rgba(0, 255, 0, 0.7)' : 'rgba(255, 0, 0, 0.7)'}
          strokeWidth="4"
          strokeDasharray="10 5"
        />
        {!isHeadInBounds && (
          <text 
            x="50%" y="40%"
            fill="white" 
            fontSize="24" 
            fontWeight="bold"
            textAnchor="middle"
            className="drop-shadow-md"
          >
            얼굴을 가이드라인 안으로 맞춰주세요
          </text>
        )}
      </svg>
      
      <div 
        id="phaser-game-container"
        className="absolute top-0 left-0 w-full h-full z-20 transition-opacity duration-300"
        style={{ opacity: isHeadInBounds ? 1 : 0.3 }}
      />

      <p className="absolute top-4 left-4 text-xl z-30 pointer-events-none">
        진단 결과: <span className="font-bold text-yellow-400">{diagnosisResult}</span>
      </p>

      <button
        onClick={onReturn}
        className="absolute top-4 right-4 px-6 py-3 text-lg font-bold text-white bg-blue-600 rounded-lg shadow-md
                   hover:bg-blue-700 focus:outline-none focus:ring-2 
                   focus:ring-blue-500 focus:ring-opacity-50 transition-all duration-300 z-30"
      >
        ← 진단 화면으로 돌아가기
      </button>
    </div>
  );
};

export default GameView;