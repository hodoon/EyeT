import React, { useState } from 'react'
import DiagnosisView from './components/DiagnosisView'
import GameView from './components/GameView'

type AppView = 'diagnosis' | 'game';

export type DiagnosisResult = "NORMAL" | "ESOTROPIA" | "EXOTROPIA" | "HYPERTROPIA" | "HYPOTROPIA";

function App() {
  const [currentView, setCurrentView] = useState<AppView>('diagnosis');
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnosisResult | null>(null);


  const handleDiagnosisComplete = (result: DiagnosisResult) => {
    console.log("App.tsx: 진단 완료. 게임 모드로 전환.", result);
    setDiagnosisResult(result);
    setCurrentView('game');
  };

  const handleReturnToDiagnosis = () => {
    setCurrentView('diagnosis');
    setDiagnosisResult(null);
  }

  return (
    <>
      {currentView === 'diagnosis' && (
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