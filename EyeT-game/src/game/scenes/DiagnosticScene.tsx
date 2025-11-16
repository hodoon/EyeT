import React, { useRef, useEffect, useState } from "react";
import webSocketService from "../../services/WebSocketService";

// --- 설정값 ---
const CAPTURE_INTERVAL = 300; // 1초에 약 3.3회 전송
const DIAGNOSIS_DURATION = 10000; // 10초
const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;

// --- (추가) YOLOv5 모델 클래스명 한글 변환 ---
const CLASS_NAME_MAP: { [key: string]: string } = {
  "NORMAL": "정상",
  "ESOTROPIA": "내사시",
  "EXOTROPIA": "외사시",
  "HYPERTROPIA": "상사시",
  "HYPOTROPIA": "하사시",
};

/**
 * YOLOv5 클래스명을 한글로 변환합니다.
 * @param className 영어 클래스명 (예: "ESOTROPIA")
 * @returns 한글 클래스명 (예: "내사시")
 */
const translateClassName = (className: string): string => {
  return CLASS_NAME_MAP[className] || className; // 매핑된 이름이 없으면 원본 이름 반환
};

// --- 컴포넌트 ---
const DiagnosisView: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  const [allResults, setAllResults] = useState<any[]>([]);
  const [finalDiagnosis, setFinalDiagnosis] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(DIAGNOSIS_DURATION / 1000);
  
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
      // webSocketService.socket.on 사용 (WebSocketService.ts에서 socket이 public이어야 함)
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
        const className = detection.name; // YOLOv5 결과의 'name' 필드
        counts[className] = (counts[className] || 0) + 1;
      });

      console.log("감지된 클래스별 빈도:", counts);

      let diagnosisText: string;
      if (Object.keys(counts).length === 0) {
        diagnosisText = "진단 결과 없음 (카메라를 확인하세요)";
      } else {
        // 가장 많이 감지된 클래스 (영어)
        const finalResultEng = Object.keys(counts).reduce((a, b) =>
          counts[a] > counts[b] ? a : b
        );
        
        // 한글로 변환
        const finalResultKor = translateClassName(finalResultEng);
        
        diagnosisText = `최종 진단: ${finalResultKor} (총 ${currentResults.length} 프레임 중 ${counts[finalResultEng]}회 감지)`;
      }
      
      setFinalDiagnosis(diagnosisText);
      return []; // allResults state를 빈 배열로 초기화
    });
  };

  // --- 진단 시작 버튼 핸들러 ---
  const startDiagnosis = () => {
    if (isDiagnosing) return;

    setAllResults([]);
    setFinalDiagnosis(null);
    setCountdown(DIAGNOSIS_DURATION / 1000);
    setIsDiagnosing(true); 

    // 카운트다운 타이머
    countdownTimerRef.current = setInterval(() => {
      setCountdown(prev => prev - 1);
    }, 1000);

    // 10초 진단 타이머
    diagnosisTimerRef.current = setTimeout(() => {
      setIsDiagnosing(false); // 진단 중지
      if(countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      analyzeDetections(); // 결과 분석
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

      // (수정) 캔버스에 그릴 때도 거울 모드로 뒤집어 그립니다.
      // 그래야 캡처되어 서버로 전송되는 이미지도 사용자가 보는 것과 동일해집니다.
      context.translate(canvas.width, 0); // X축의 0점(기준점)을 캔버스 오른쪽 끝으로 이동
      context.scale(-1, 1); // X축만 뒤집기

      captureIntervalRef.current = setInterval(() => {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL("image/jpeg", 0.8); // 80% 품질
        webSocketService.sendImage(imageData); // Colab 서버로 전송
      }, CAPTURE_INTERVAL);

    } else {
      // isDiagnosing이 false가 되면 인터벌 중지
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
    }
  }, [isDiagnosing, stream]);

  // --- 웹캠 마운트/언마운트 ---
  useEffect(() => {
    startWebcam(); // 컴포넌트 로드 시 웹캠 시작
    
    // 컴포넌트 언마운트 시 정리
    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop()); // 웹캠 끄기
      }
      // 모든 타이머 정리
      if (diagnosisTimerRef.current) clearTimeout(diagnosisTimerRef.current);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // 처음에 한 번만 실행

  // --- 렌더링 UI (Tailwind v3 클래스) ---
  return (
    // 전체 페이지를 중앙 정렬 (flex)
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      
      {/* 진단 카드 (w-full, max-w-2xl) */}
      <div className="bg-white rounded-lg shadow-xl p-6 md:p-8 max-w-2xl w-full">
        <h3 className="text-2xl font-bold text-center text-gray-800 mb-4">
          1단계: 사시 유형 진단
        </h3>
        
        {/* 카메라 영역 (relative) */}
        <div className="relative w-full rounded-lg overflow-hidden border border-gray-300">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            // (수정) CSS를 이용해 비디오 화면을 좌우 반전(거울 모드)시킵니다.
            className="w-full h-auto transform -scale-x-100" // scaleX(-1)과 동일
            width={VIDEO_WIDTH}
            height={VIDEO_HEIGHT}
          />
          
          {/* 카메라 오버레이 (absolute) */}
          <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-30 p-4">
            <p className="text-white text-xl md:text-2xl font-semibold text-center drop-shadow-md">
              {isDiagnosing
                ? `진단 중... (${countdown}초)`
                : "정면을 응시하고 '진단 시작' 버튼을 눌러주세요."}
            </p>
          </div>
          
          {/* 캡처용 캔버스 (숨김) */}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* 버튼 영역 */}
        <div className="mt-6 text-center">
          <button 
            onClick={startDiagnosis} 
            disabled={isDiagnosing} 
            className={`
              w-full px-6 py-3 text-lg font-bold text-white rounded-lg shadow-md
              transition-all duration-300
              ${isDiagnosing
                ? "bg-gray-400 cursor-not-allowed" // 비활성화 스타일
                : "bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50" // 활성화 스타일
              }
            `}
          >
            {isDiagnosing ? `진단 중... (${countdown}초)` : "▶️ 10초 진단 시작"}
          </button>
        </div>
        
        {/* 최종 진단 결과 표시 */}
        {finalDiagnosis && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <h4 className="text-lg font-semibold text-gray-800 mb-2">진단 결과:</h4>
            <p className="text-blue-700 text-xl font-bold">
              {finalDiagnosis}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DiagnosisView;