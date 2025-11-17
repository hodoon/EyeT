import React, { useEffect, useRef, useState } from 'react';
import Phaser from 'phaser';
import type { DiagnosisResult } from '../App';
import { EyeGazeTracker } from '../game/EyeGazeTracker';
import { ArcheryGameScene } from '../game/scenes/ArcheryGameScene';

// 시선 민감도 (픽셀)
const GAZE_SENSITIVITY = 1000; 

const HEAD_SAFE_ZONE = {
  // 🟢 [수정] X축 범위를 0.4 -> 0.3, 0.6 -> 0.7로 대폭 확장 (총 40% -> 70%)
  xMin: 0.3,
  xMax: 0.7,
  // 🟢 [수정] Y축 범위를 0.35 -> 0.3, 0.65 -> 0.7로 대폭 확장 (총 30% -> 70%)
  yMin: 0.3,
  yMax: 0.7,
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

  
  // 컴포넌트 마운트 시 게임 및 시선 추적기 초기화
  useEffect(() => {
    if (!diagnosisResult) {
      console.error("GameView: 진단 결과가 없습니다. 진단 화면으로 돌아갑니다.");
      onReturn();
      return;
    }

    let gameLoopInterval: number;

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

      // ✅ [수정] 게임 해상도를 1280x768로 변경
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
            mode: Phaser.Scale.RESIZE, // 컨테이너 크기에 맞춰 크기 조정 허용
            autoCenter: Phaser.Scale.CENTER_BOTH, // 캔버스 중앙 정렬
        }
      };

      const game = new Phaser.Game(config);
      phaserGameRef.current = game;

      game.scene.add('ArcheryGameScene', ArcheryGameScene, true, {
        diagnosis: diagnosisResult,
        dimensions: gameDimensions // 고정된 해상도 전달
      });

      // 6. gameLoop를 setInterval로 실행 (성능 최적화)
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

            // --- 1. 머리 위치 확인 ---
            const headX = 1.0 - head.x; 
            const headY = head.y;
            
            const inBounds = 
                 headX > HEAD_SAFE_ZONE.xMin && headX < HEAD_SAFE_ZONE.xMax &&
                 headY > HEAD_SAFE_ZONE.yMin && headY < HEAD_SAFE_ZONE.yMax;
            
            setIsHeadInBounds(inBounds);

            // --- 2. 시선 좌표 계산 (머리가 범위 내에 있을 때만) ---
            if (inBounds) {
              // 캘리브레이션 값(0.5)을 기준으로 상대 좌표 계산
              const relativeX = (1.0 - gaze.x) - offset.x; 
              const relativeY = (1.0 - gaze.y) - offset.y; 

              const centerX = (gameConfig.width as number) / 2;
              const centerY = (gameConfig.height as number) / 2;

              // 최종 시선 좌표 (중앙 + 상대좌표 * 민감도)
              const gazePoint = {
                x: centerX + (relativeX * GAZE_SENSITIVITY),
                y: centerY + (relativeY * GAZE_SENSITIVITY)
              };
              
              console.log(`🎯 Game Gaze Point: X=${gazePoint.x.toFixed(2)}, Y=${gazePoint.y.toFixed(2)}`); // 이 부분이 추가되었습니다.
              
              currentGame.registry.set('gazePoint', gazePoint);
            } else {
                 setIsHeadInBounds(false);
            }

          } else {
            setIsHeadInBounds(false);
          }
        }
      }, 100); // 100ms (1초에 10번)

    };

    initGame();

    const handleResize = () => {
      // Phaser 캔버스가 컨테이너 크기(1280x768)에 맞춰지도록 설정
      if (phaserGameRef.current) {
        phaserGameRef.current.scale.resize(1280, 768);
      }
    };

    window.addEventListener('load', handleResize);

    return () => {
      clearInterval(gameLoopInterval);
      window.removeEventListener('load', handleResize);
      window.removeEventListener('resize', handleResize);
      gazeTrackerRef.current?.close();
      
      if (phaserGameRef.current) {
        phaserGameRef.current.destroy(true);
      }
      
      if (videoRef.current && videoRef.current.srcObject) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach(track => track.stop());
      }
    };
  }, [diagnosisResult, onReturn]); 

  
  // --- 렌더링 (UI) ---
  return (
    // ✅ [수정] 전체 화면 div 대신, 고정된 크기의 중앙 컨테이너로 변경
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white p-4">
      
      {/* 1. 게임 타이틀 및 버튼 */}
      <h2 className="text-3xl font-bold mb-4 z-20">맞춤형 훈련 게임: 양궁</h2>
      <p className="text-xl mb-6 z-20">
        진단 결과: <span className="font-bold text-yellow-400">{diagnosisResult}</span> (훈련 시작)
      </p>

      {/* 2. 게임 컨테이너 (비디오 + 가이드라인 + Phaser) */}
      <div 
        className="rounded-lg shadow-lg relative overflow-hidden bg-black"
        // ✅ [수정] 고정된 게임 해상도 크기 적용 (1280px)
        style={{ width: '1280px', height: '768px' }}
      >
        {/* 2-1. 비디오 배경 (항상 렌더링) */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          // ✅ [수정] 캔버스 크기에 맞게 채우도록 설정 (w-full h-full object-cover)
          className="absolute top-0 left-0 w-full h-full object-cover transform -scale-x-100 z-0" 
        />

        {/* 2-2. 얼굴 가이드라인 (SVG 오버레이) */}
        <svg
          className="absolute top-0 left-0 w-full h-full z-10 pointer-events-none"
          viewBox="0 0 1280 768" // ✅ [수정] viewBox를 캔버스 해상도에 맞춤 (1280px)
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          {/* 얼굴 타원형 가이드 (VIEWBOX 기준 좌표 사용) */}
          <ellipse 
            cx="640" // 1280 / 2
            cy="384" // 768 / 2
            rx="145" // ⬅️ [수정] 가로 반지름을 줄입니다 (768px의 15% 사용)
            ry="192" // ⬅️ [수정] 세로 반지름을 늘립니다 (1280px의 15% 사용)
            stroke={isHeadInBounds ? 'rgba(0, 255, 0, 0.7)' : 'rgba(255, 0, 0, 0.7)'}
            strokeWidth="8" // 두껍게
            strokeDasharray="10 5"
          />
          {/* 머리가 벗어났을 때 경고 메시지 */}
          {!isHeadInBounds && (
            <text 
              x="640" y="300" // X좌표도 중앙에 맞춤
              fill="white" 
              fontSize="30" // 크게
              fontWeight="bold"
              textAnchor="middle"
              className="drop-shadow-md"
            >
              얼굴을 가이드라인 안으로 맞춰주세요
            </text>
          )}
        </svg>

        {/* 2-3. Phaser 게임 캔버스 */}
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

      {/* 3. 돌아가기 버튼 (게임 컨테이너 밖에 배치) */}
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