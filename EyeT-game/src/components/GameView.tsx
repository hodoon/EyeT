import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import type { DiagnosisResult } from '../App';
import { EyeGazeTracker } from '../game/EyeGazeTracker';
import { ArcheryGameScene } from '../game/scenes/ArcheryGameScene';

// 시선 민감도 (픽셀)
const GAZE_SENSITIVITY = 3200; 

const HEAD_SAFE_ZONE = {
  xMin: 0.3,
  xMax: 0.7,
  yMin: 0.25,
  yMax: 0.75,
};

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
    // 🟢 [수정 1] 중복 실행 방지를 위한 ignore 플래그 추가
    let ignore = false;

    console.log('🎮 GameView useEffect 시작');

    const initGame = async () => {
      if (!videoRef.current) {
        console.error("비디오 Ref가 없습니다.");
        return;
      }
      
      const videoElement = videoRef.current;

      try {
        // 스트림이 없을 때만 요청
        if (!videoElement.srcObject) {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            
            // 🟢 [수정 2] 비동기 대기 후 언마운트 상태라면 중단
            if (ignore) {
                stream.getTracks().forEach(track => track.stop());
                return;
            }
            videoElement.srcObject = stream;
        }
        await videoElement.play(); 
      } catch (err) {
        console.error("웹캠을 시작할 수 없습니다:", err);
        return;
      }

      const tracker = new EyeGazeTracker();
      await tracker.initialize();

      // 🟢 [수정 3] 트래커 초기화 후에도 언마운트 체크
      if (ignore) {
          tracker.close();
          return;
      }
      gazeTrackerRef.current = tracker;

      const gameDimensions = { width: 1280, height: 768 }; 
      const config: Phaser.Types.Core.GameConfig = {
        type: Phaser.AUTO,
        width: gameDimensions.width,
        height: gameDimensions.height,
        parent: 'phaser-game-container',
        scene: [],
        backgroundColor: 'transparent',
        physics: {
          default: 'arcade',
          arcade: { debug: false },
        },
        scale: {
            mode: Phaser.Scale.RESIZE,
            autoCenter: Phaser.Scale.CENTER_BOTH,
        }
      };

      // 🟢 [수정 4] 혹시 모를 기존 인스턴스 정리 (방어 코드)
      if (phaserGameRef.current) {
          phaserGameRef.current.destroy(true);
          phaserGameRef.current = null;
      }

      const game = new Phaser.Game(config);
      phaserGameRef.current = game;

      // Registry 초기화
      game.registry.remove('gazePoint');
      game.registry.set('isGazeValid', false);

      if (!game.scene.getScene('ArcheryGameScene')) {
        game.scene.add('ArcheryGameScene', ArcheryGameScene, true, {
          diagnosis: diagnosisResult,
          dimensions: gameDimensions
        });
        console.log('✅ ArcheryGameScene 생성 및 시작');
      }

      gameLoopInterval = setInterval(async () => {
        // 🟢 [수정 5] 루프 실행 시에도 언마운트 체크
        if (ignore) return;

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
            currentGame.registry.set('isGazeValid', inBounds);

            if (inBounds) {
              const relativeX = (1.0 - gaze.x) - offset.x; 
              const relativeY = (1.0 - gaze.y) - offset.y; 

              const centerX = (gameConfig.width as number) / 2;
              const centerY = (gameConfig.height as number) / 2;

              const gazePoint = {
                x: centerX + (relativeX * GAZE_SENSITIVITY),
                y: centerY + (relativeY * GAZE_SENSITIVITY)
              };
              
              // console.log(`🎯 Game Gaze Point: X=${gazePoint.x.toFixed(2)}, Y=${gazePoint.y.toFixed(2)} | Valid=true`);
              currentGame.registry.set('gazePoint', gazePoint);
            } else {
              currentGame.registry.remove('gazePoint');
            }

          } else {
            setIsHeadInBounds(false);
            currentGame.registry.set('isGazeValid', false);
            currentGame.registry.remove('gazePoint');
          }
        }
      }, 100);

    };

    initGame();

    const handleResize = () => {
      if (phaserGameRef.current) {
        phaserGameRef.current.scale.resize(1280, 768);
      }
    };

    window.addEventListener('load', handleResize);

    return () => {
      // 🟢 [수정 6] Cleanup 함수 실행 시 ignore를 true로 설정하여 진행 중인 initGame 중단
      ignore = true;
      
      console.log('🧹 GameView cleanup 시작');
      clearInterval(gameLoopInterval);
      window.removeEventListener('load', handleResize);
      window.removeEventListener('resize', handleResize);
      
      if (gazeTrackerRef.current) {
        gazeTrackerRef.current.close();
        gazeTrackerRef.current = null;
      }
      
      if (phaserGameRef.current) {
        try {
          phaserGameRef.current.registry.destroy();
        } catch (e) {
          console.warn('Registry 파괴 중 오류:', e);
        }
        
        // Scene 제거
        const scene = phaserGameRef.current.scene.getScene('ArcheryGameScene');
        if (scene) {
          phaserGameRef.current.scene.remove('ArcheryGameScene');
        }
        
        phaserGameRef.current.destroy(true);
        phaserGameRef.current = null;
        console.log('🧹 Phaser Game 파괴됨');
      }
      
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, [diagnosisResult, onReturn]); 

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      
      <h2 className="text-3xl font-bold mb-4 z-20">맞춤형 훈련 게임: 양궁</h2>
      <p className="text-xl mb-6 z-20">
        진단 결과: <span className="font-bold text-yellow-400">{diagnosisResult}</span> (훈련 시작)
      </p>

      <div 
        className="rounded-lg shadow-lg relative overflow-hidden bg-black"
        style={{ width: '1280px', height: '768px' }}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute top-0 left-0 w-full h-full object-cover transform -scale-x-100 z-0" 
        />

        <svg
          className="absolute top-0 left-0 w-full h-full z-10 pointer-events-none"
          viewBox="0 0 1280 768"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <ellipse 
            cx="640" 
            cy="384" 
            rx="145"
            ry="192"
            stroke={isHeadInBounds ? 'rgba(0, 255, 0, 0.7)' : 'rgba(255, 0, 0, 0.7)'}
            strokeWidth="8"
            strokeDasharray="10 5"
          />
          {!isHeadInBounds && (
            <text 
              x="640" y="300"
              fill="white" 
              fontSize="30" 
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
        
      </div>

      <p className="mt-4 text-lg z-30">
        현재 상태: <span className={isHeadInBounds ? 'text-green-400' : 'text-red-400'}>
          {isHeadInBounds ? '플레이 가능' : '머리 위치 조정 필요'}
        </span>
      </p>

      <button
        onClick={onReturn}
        className="mt-4 px-6 py-3 text-lg font-bold text-white bg-blue-600 rounded-lg shadow-md
                   hover:bg-blue-700 transition-all duration-300 z-30"
      >
        ← 진단 화면으로 돌아가기
      </button>
    </div>
  );
};

export default GameView;