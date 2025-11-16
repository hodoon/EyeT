// src/App.tsx

import React from "react";
import DiagnosisView from "./components/DiagnosisView"; // 방금 만든 컴포넌트 import

function App() {
  // 지금은 진단 모드만 렌더링합니다.
  // 추후 이 곳에서 진단 모드 <-> 게임 모드(Phaser) 전환 로직을 구현합니다.
  return (
    <div className="App">
      <DiagnosisView />
    </div>
  );
}

export default App;