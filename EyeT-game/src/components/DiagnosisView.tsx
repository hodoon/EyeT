import React, { useRef, useEffect, useState } from "react";
import webSocketService from "../services/WebSocketService";

const CAPTURE_INTERVAL = 300;
const DIAGNOSIS_DURATION = 10000; // 10초

const DiagnosisView: React.FC = () => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  
  const [allResults, setAllResults] = useState<any[]>([]);
  const [finalDiagnosis, setFinalDiagnosis] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(DIAGNOSIS_DURATION / 1000);
  
  // 1. (수정) 타이머 타입: 브라우저 환경에서는 'number'가 맞습니다.
  const diagnosisTimerRef = useRef<number | null>(null);
  const countdownTimerRef = useRef<number | null>(null);
  const captureIntervalRef = useRef<number | null>(null);


  // --- WebSocket 서버로부터 "results" 이벤트를 수신하는 리스너 ---
  useEffect(() => {
    // onResults 핸들러
    const onResults = (data: any[]) => {
      // "진단 중"일 때만 결과를 allResults 배열에 추가
      // (isDiagnosing state를 직접 참조하는 대신,
      //  리스너 자체를 isDiagnosing state에 따라 등록/해제합니다)
      if (data.length > 0) {
        setAllResults(prev => [...prev, ...data]);
      }
    };
    
    // 2. (수정) isDiagnosing이 true일 때만 리스너를 등록합니다.
    if (isDiagnosing) {
      webSocketService.socket.on("results", onResults);
    }

    // 컴포넌트 언마운트 시 또는 isDiagnosing이 false가 되면 리스너 해제
    return () => {
      webSocketService.socket.off("results", onResults);
    };
    
    // isDiagnosing 상태가 변경될 때마다 이 useEffect가 실행되어
    // 리스너를 등록하거나 해제합니다.
  }, [isDiagnosing]);


  // --- 1. 웹캠 시작 함수 ---
  const startWebcam = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 320, height: 240 },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      setStream(mediaStream);
    } catch (err) {
      console.error("웹캠을 시작할 수 없습니다:", err);
    }
  };

  // --- 2. 10초 경과 후 결과 분석 함수 ---
  const analyzeDetections = () => {
    // 3. (추가) allResults state가 최신화된 이후에 분석하도록
    //    analyzeDetections 함수가 allResults를 인자로 받도록 수정
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
      } else {
        const finalResult = Object.keys(counts).reduce((a, b) =>
          counts[a] > counts[b] ? a : b
        );
        diagnosisText = `최종 진단: ${finalResult} (총 ${currentResults.length} 프레임 중 ${counts[finalResult]}회 감지)`;
      }
      
      setFinalDiagnosis(diagnosisText);
      
      // 분석이 끝났으니 결과 배열 초기화
      return []; 
    });
  };

  // --- 3. '진단 시작' 버튼 클릭 시 호출될 함수 ---
  const startDiagnosis = () => {
    if (isDiagnosing) return;

    setAllResults([]); // 결과 배열 초기화
    setFinalDiagnosis(null);
    setCountdown(DIAGNOSIS_DURATION / 1000);
    setIsDiagnosing(true); 

    countdownTimerRef.current = setInterval(() => {
      setCountdown(prev => prev - 1);
    }, 1000);

    diagnosisTimerRef.current = setTimeout(() => {
      console.log("10초 경과, 진단 중지.");
      setIsDiagnosing(false); 
      if(countdownTimerRef.current) clearInterval(countdownTimerRef.current);
      
      // 4. (수정) state 업데이트가 비동기이므로,
      //    analyzeDetections가 isDiagnosing=false가 된 직후에 호출되도록 함
      analyzeDetections(); 

    }, DIAGNOSIS_DURATION);
  };


  // --- 4. 'isDiagnosing' 상태에 따라 프레임을 전송하는 useEffect ---
  useEffect(() => {
    if (isDiagnosing && videoRef.current && canvasRef.current && stream) {
      console.log("🧠 10초 진단 및 프레임 전송 시작...");
      
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");

      if (!context) return;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      captureIntervalRef.current = setInterval(() => {
        context.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL("image/jpeg", 0.8);
        webSocketService.sendImage(imageData);
      }, CAPTURE_INTERVAL);

    } else {
      // isDiagnosing이 false가 되면 인터벌 중지
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
    }
  }, [isDiagnosing, stream]);


  // --- 5. 웹캠 시작/중지 (기존과 동일) ---
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

  // --- 6. 렌더링 UI (기존과 동일) ---
  return (
    <div style={{ padding: "20px" }}>
      <h3>1단계: 사시 유형 진단</h3>
      <p>정면을 응시한 후 '진단 시작' 버튼을 눌러주세요. 10초간 진단합니다.</p>
      
      <video
        ref={videoRef} autoPlay playsInline muted
        style={{ width: "320px", height: "240px", border: "1px solid black" }}
      />
      
      <canvas ref={canvasRef} style={{ display: "none" }} />
      <br />
      
      <button onClick={startDiagnosis} disabled={isDiagnosing} style={{ fontSize: "1.2rem", padding: "10px" }}>
        {isDiagnosing ? `진단 중... (${countdown}초)` : "▶️ 10초 진단 시작"}
      </button>
      
      {finalDiagnosis && (
        <div style={{ marginTop: '20px', padding: '10px', backgroundColor: '#f0f0f0' }}>
          <h4>진단 결과:</h4>
          <p style={{ color: 'blue', fontWeight: 'bold' }}>{finalDiagnosis}</p>
        </div>
      )}
    </div>
  );
};

export default DiagnosisView;