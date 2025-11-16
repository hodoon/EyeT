import React, { useRef, useEffect, useState } from "react";
import webSocketService from "../services/WebSocketService";
import type { DiagnosisResult } from "../App"; // 1. App.tsx에서 DiagnosisResult 타입 import
 // 1. App.tsx에서 DiagnosisResult 타입 import

// --- 설정값 ---
const CAPTURE_INTERVAL = 300; 
const DIAGNOSIS_DURATION = 10000;
const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

// --- YOLOv5 모델 클래스명 한글 변환 ---
const CLASS_NAME_MAP: { [key: string]: string } = {
  "NORMAL": "정상",
  "ESOTROPIA": "내사시",
  "EXOTROPIA": "외사시",
  "HYPERTROPIA": "상사시",
  "HYPOTROPIA": "하사시",
};

const translateClassName = (className: string): string => {
  return CLASS_NAME_MAP[className] || className;
};

// --- 2. (수정) App.tsx로부터 함수를 받기 위한 Props 인터페이스 정의 ---
interface DiagnosisViewProps {
  onDiagnosisComplete: (result: DiagnosisResult) => void;
}

// --- 3. (수정) 컴포넌트 정의에 Props 적용 ---
const DiagnosisView: React.FC<DiagnosisViewProps> = ({ onDiagnosisComplete }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  const [allResults, setAllResults] = useState<any[]>([]);
  const [finalDiagnosis, setFinalDiagnosis] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(DIAGNOSIS_DURATION / 1000);
  
  // App.tsx로 전달할 원본 영어 결과 (예: "ESOTROPIA")
  const [rawResult, setRawResult] = useState<DiagnosisResult | null>(null);

  const diagnosisTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const captureIntervalRef = useRef<number | null>(null);

  // --- WebSocket 리스너 ---
  useEffect(() => {
    const onResults = (data: any[]) => {
      if (data.length > 0) {
        setAllResults(prev => [...prev, ...data]);
      }
    };
    
    if (isDiagnosing) {
      webSocketService.socket.on("results", onResults);
    }

    return () => {
      webSocketService.socket.off("results", onResults);
    };
  }, [isDiagnosing]);

  // --- 웹캠 시작 ---
  const startWebcam = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: VIDEO_WIDTH, height: VIDEO_HEIGHT },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setStream(mediaStream);
    } catch (err) {
      console.error("웹캠을 시작할 수 없습니다:", err);
    }
  };

  // --- 10초 후 결과 분석 ---
  const analyzeDetections = () => {
    setAllResults(currentResults => {
      console.log("--- 10초 진단 완료. 분석 시작 ---", currentResults);
      
      const counts: { [key: string]: number } = {};
      currentResults.forEach(detection => {
        const className = detection.name; 
        counts[className] = (counts[className] || 0) + 1;
      });

      console.log("감지된 클래스별 빈도:", counts);

      let diagnosisText: string;
      if (Object.keys(counts).length === 0) {
        diagnosisText = "진단 결과 없음 (카메라를 확인하세요)";
        setRawResult(null);
      } else {
        const finalResultEng = Object.keys(counts).reduce((a, b) =>
          counts[a] > counts[b] ? a : b
        ) as DiagnosisResult;
        
        const finalResultKor = translateClassName(finalResultEng);
        
        diagnosisText = `최종 진단: ${finalResultKor} (총 ${currentResults.length} 프레임 중 ${counts[finalResultEng]}회 감지)`;
        
        setFinalDiagnosis(diagnosisText);
        setRawResult(finalResultEng); // 원본 영어 결과 저장
      }
      
      return []; // allResults state를 빈 배열로 초기화
    });
  };

  // --- 진단 시작 버튼 핸들러 ---
  const startDiagnosis = () => {
    if (isDiagnosing) return;

    setAllResults([]);
    setFinalDiagnosis(null);
    setRawResult(null); 
    setCountdown(DIAGNOSIS_DURATION / 1000);
    setIsDiagnosing(true); 

    countdownTimerRef.current = setInterval(() => {
      setCountdown(prev => prev - 1);
    }, 1000);

    diagnosisTimerRef.current = setTimeout(() => {
      setIsDiagnosing(false); 
      if(countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      analyzeDetections(); 
    }, DIAGNOSIS_DURATION);
  };

  // --- 프레임 전송 useEffect ---
  useEffect(() => {
    if (isDiagnosing && videoRef.current && canvasRef.current && stream) {
      console.log("🧠 10초 진단 및 프레임 전송 시작...");
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");

      if (!context) return;
      canvas.width = VIDEO_WIDTH;
      canvas.height = VIDEO_HEIGHT;

      context.translate(canvas.width, 0); 
      context.scale(-1, 1); 

      captureIntervalRef.current = setInterval(() => {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL("image/jpeg", 0.8); 
        webSocketService.sendImage(imageData); 
      }, CAPTURE_INTERVAL);

    } else {
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
    }
  }, [isDiagnosing, stream]);

  // --- 웹캠 마운트/언마운트 ---
  useEffect(() => {
    startWebcam(); 
    
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop()); 
      }
      if (diagnosisTimerRef.current) clearTimeout(diagnosisTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); 

  // --- 렌더링 UI ---
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      
      <div className="bg-white rounded-lg shadow-xl p-6 md:p-8 max-w-2xl w-full">
        <h3 className="text-2xl font-bold text-center text-gray-800 mb-4">
          1단계: 사시 유형 진단
        </h3>
        
        {/* === 카메라 영역 === */}
        <div className="relative w-full rounded-lg overflow-hidden border border-gray-300">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-auto transform -scale-x-100" // 거울 모드
            width={VIDEO_WIDTH}
            height={VIDEO_HEIGHT}
          />
          
          <canvas ref={canvasRef} className="hidden" />

          {/* '진단 시작 전' 오버레이 */}
          {!isDiagnosing && !finalDiagnosis && (
            <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 p-4">
              <p className="text-white text-xl md:text-2xl font-semibold text-center drop-shadow-md">
                정면을 응시하고 '진단 시작' 버튼을 눌러주세요.
              </p>
            </div>
          )}

          {/* '진단 중' 오버레이 (가이드라인 + 타이머) */}
          {isDiagnosing && (
            <div className="absolute inset-0 flex flex-col items-center justify-between p-4">
              <p className="text-white text-2xl font-bold bg-black/50 px-4 py-2 rounded-lg drop-shadow-md">
                진단 중... ({countdown}초)
              </p>
              <div className="flex-1 flex items-center justify-center w-full h-full">
                <div className="w-1/2 h-2/3 max-w-[280px] max-h-[360px]">
                  <svg className="w-full h-full" viewBox="0 0 200 280" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <ellipse cx="100" cy="140" rx="80" ry="110" stroke="white" strokeWidth="4" strokeOpacity="0.7" strokeDasharray="10 5" />
                    <line x1="50" y1="120" x2="150" y2="120" stroke="white" strokeWidth="2" strokeOpacity="0.5" />
                  </svg>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* --- 버튼 영역 --- */}
        <div className="mt-6 text-center">
          {/* 진단이 완료되지 않았을 때 (진단 시작 버튼) */}
          {!finalDiagnosis && (
            <button 
              onClick={startDiagnosis} 
              disabled={isDiagnosing} 
              className={`
                w-full px-6 py-3 text-lg font-bold text-white rounded-lg shadow-md
                transition-all duration-300
                ${isDiagnosing
                  ? "bg-gray-400 cursor-not-allowed" 
                  : "bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
                }
              `}
            >
              {isDiagnosing ? `진단 중... (${countdown}초)` : "▶️ 10초 진단 시작"}
            </button>
          )}
        </div>
        
        {/* --- 4. (수정) 최종 진단 결과 및 '게임 시작' 버튼 --- */}
        {finalDiagnosis && (
          <div className="mt-6 text-center">
            {/* 진단 결과 텍스트 */}
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="text-lg font-semibold text-gray-800 mb-2">진단 결과:</h4>
              <p className="text-blue-700 text-xl font-bold">
                {finalDiagnosis}
              </p>
            </div>
            
            {/* '게임 시작' 버튼 (진단 결과가 있을 때만) */}
            {rawResult && (
              <button 
                // 5. (수정) 클릭 시 App.tsx의 onDiagnosisComplete 함수 호출
                onClick={() => onDiagnosisComplete(rawResult)}
                className="mt-4 w-full px-6 py-3 text-lg font-bold text-white rounded-lg shadow-md
                           bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 
                           focus:ring-green-500 focus:ring-opacity-50 transition-all duration-300"
              >
                {translateClassName(rawResult)} 맞춤 훈련 시작
              </button>
            )}

            {/* 다시 진단하기 버튼 */}
            <button
              onClick={startDiagnosis}
              disabled={isDiagnosing}
              className="mt-2 w-full text-sm text-gray-600 hover:text-blue-600"
            >
              (다시 진단하기)
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DiagnosisView;