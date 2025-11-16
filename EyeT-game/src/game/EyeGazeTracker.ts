import { 
  FaceLandmarker, 
  FilesetResolver
} from "@mediapipe/tasks-vision";

// MediaPipe 모델 경로 (CDN)
const MP_TASKS_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

// 오른쪽 눈과 왼쪽 눈의 홍채(iris) 랜드마크 인덱스
// (왼쪽/오른쪽은 사용자가 보는 기준이 아닌, 모델 기준)
const IRIS_LEFT_INDEXES = [474, 475, 476, 477]; // 왼쪽 눈 홍채
const IRIS_RIGHT_INDEXES = [469, 470, 471, 472]; // 오른쪽 눈 홍채

export class EyeGazeTracker {
  private faceLandmarker: FaceLandmarker | null = null;
  private lastVideoTime = -1;

  /**
   * MediaPipe FaceLandmarker 모델을 비동기적으로 로드하고 초기화합니다.
   */
  public async initialize(): Promise<void> {
    const filesetResolver = await FilesetResolver.forVisionTasks(MP_TASKS_URL);
    this.faceLandmarker = await FaceLandmarker.createFromOptions(filesetResolver, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: "GPU",
      },
      outputFaceBlendshapes: false,
      outputFacialTransformationMatrixes: false,
      runningMode: "VIDEO",
      numFaces: 1, // 얼굴 1개만 추적
    });
  }

  /**
   * 비디오 프레임에서 시선 좌표를 추적합니다.
   * @param videoElement 
   * @returns {Promise<{x: number, y: number} | null>} 0.0 ~ 1.0 사이의 정규화된 시선 좌표
   */
  public async getGazePoint(videoElement: HTMLVideoElement): Promise<{x: number, y: number} | null> {
    if (!this.faceLandmarker || videoElement.readyState < 2) {
      return null;
    }

    // 비디오 시간이 변경되었을 때만 새 예측 수행
    const videoTime = videoElement.currentTime;
    if (this.lastVideoTime === videoTime) {
      return null;
    }
    this.lastVideoTime = videoTime;

    // MediaPipe 모델 실행
    const results = this.faceLandmarker.detectForVideo(videoElement, performance.now());

    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      const landmarks = results.faceLandmarks[0];

      // 1. 양쪽 눈 홍채의 평균 좌표 계산
      let totalX = 0;
      let totalY = 0;
      const allIrisIndexes = [...IRIS_LEFT_INDEXES, ...IRIS_RIGHT_INDEXES];

      for (const index of allIrisIndexes) {
        totalX += landmarks[index].x;
        totalY += landmarks[index].y;
      }

      // 2. 정규화된 평균 좌표 (0.0 ~ 1.0)
      // (x좌표는 거울 모드이므로 1.0에서 빼서 반전시킴)
      const avgX = 1.0 - (totalX / allIrisIndexes.length);
      const avgY = totalY / allIrisIndexes.length;
      
      return { x: avgX, y: avgY };
    }

    return null;
  }

  /**
   * MediaPipe 리소스 해제
   */
  public close(): void {
    this.faceLandmarker?.close();
  }
}