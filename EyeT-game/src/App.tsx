import React from 'react'
// import './App.css' // App.css가 비어있으므로 이 줄은 있어도/없어도 됩니다.
import DiagnosisView from './game/scenes/DiagnosticScene'

function App() {
  // 불필요한 <div> 래퍼를 제거합니다.
  // DiagnosisView 컴포넌트 자체가 전체 화면을 제어하도록 합니다.
  return (
    <DiagnosisView />
  )
}

export default App