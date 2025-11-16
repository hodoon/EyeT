import React, { useState } from 'react'
import DiagnosisView from './components/DiagnosisView'
import GameView from './components/GameView' // 1. GameView import

// 앱의 현재 상태: '진단' 또는 '게임'
type AppView = 'diagnosis' | 'game';

// (수정) DiagnosisResult 타입을 export하여 다른 파일(DiagnosisView)에서 import할 수 있게 함
export type DiagnosisResult = "NORMAL" | "ESOTROPIA" | "EXOTROPIA" | "HYPERTROPIA" | "HYPOTROPIA";

function App() {
  // const [currentView, setCurrentView] = useState<AppView>('diagnosis');
  // const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);
  const [currentView, setCurrentView] = useState<AppView>('game'); // 테스트용으로 기본값을 'game'으로 설정
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>("ESOTROPIA"); // 테스트용으로 기본값 설정

  /**
   * DiagnosisView가 진단을 완료했을 때 호출하는 함수
   */
  const handleDiagnosisComplete = (result: DiagnosisResult) => {
    console.log("App.tsx: 진단 완료. 게임 모드로 전환.", result);
    setDiagnosisResult(result); // 진단 결과 저장
    setCurrentView('game');     // 게임 화면으로 전환
  };

  /**
   * GameView에서 '돌아가기' 버튼을 눌렀을 때 호출하는 함수
   */
  const handleReturnToDiagnosis = () => {
    setCurrentView('diagnosis');
    setDiagnosisResult(null);
  }

  return (
    <>
      {currentView === 'diagnosis' && (
        // (수정) DiagnosisView에 onDiagnosisComplete 함수를 prop으로 전달
        <DiagnosisView onDiagnosisComplete={handleDiagnosisComplete} />
      )}
      
      {currentView === 'game' && (
        <GameView 
          diagnosisResult={diagnosisResult} 
          onReturn={handleReturnToDiagnosis} 
        />
      )}
    </>
  )
}

export default App