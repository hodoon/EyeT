import { 
  FaceLandmarker, 
  FilesetResolver,
  type NormalizedLandmark
} from "@mediapipe/tasks-vision";

// MediaPipe 모델 경로 (CDN)
const MP_TASKS_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

// --- 눈동자 및 눈 경계 랜드마크 인덱스 ---
const IRIS_LEFT_INDEXES = [474, 475, 476, 477];
const EYE_LEFT_OUTER_CORNER = 263;
const EYE_LEFT_INNER_CORNER = 362;
const EYE_LEFT_TOP_LID = 386;
const EYE_LEFT_BOTTOM_LID = 374;
const IRIS_RIGHT_INDEXES = [469, 470, 471, 472];
const EYE_RIGHT_OUTER_CORNER = 133;
const EYE_RIGHT_INNER_CORNER = 33;
const EYE_RIGHT_TOP_LID = 159;
const EYE_RIGHT_BOTTOM_LID = 145;

// --- ✅ [추가] 얼굴 중심 (코 끝) ---
const NOSE_TIP_INDEX = 1;

export class EyeGazeTracker {
  private faceLandmarker: FaceLandmarker | null = null;
  private lastVideoTime = -1;

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
      numFaces: 1,
    });
  }

  private getAveragePosition(landmarks: NormalizedLandmark[], indexes: number[]): { x: number, y: number } {
    let totalX = 0;
    let totalY = 0;
    for (const index of indexes) {
      totalX += landmarks[index].x;
      totalY += landmarks[index].y;
    }
    return { x: totalX / indexes.length, y: totalY / indexes.length };
  }

  /**
   * ✅ [수정] 반환 타입을 gaze와 head로 변경
   * @param videoElement 
   * @returns {Promise<{ gaze: { x, y }, head: { x, y } } | null>}
   */
  public async getGazeAndHead(videoElement: HTMLVideoElement): Promise<{ gaze: { x: number, y: number }, head: { x: number, y: number } } | null> {
    if (!this.faceLandmarker || videoElement.readyState < 2) {
      return null;
    }

    const videoTime = videoElement.currentTime;
    if (this.lastVideoTime === videoTime) {
      return null;
    }
    this.lastVideoTime = videoTime;

    const results = this.faceLandmarker.detectForVideo(videoElement, performance.now());

    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      const landmarks = results.faceLandmarks[0];

      // --- 1. 시선(gaze) 계산 (이전과 동일) ---
      const leftIrisCenter = this.getAveragePosition(landmarks, IRIS_LEFT_INDEXES);
      const rightIrisCenter = this.getAveragePosition(landmarks, IRIS_RIGHT_INDEXES);
      const leftEyeOuter = landmarks[EYE_LEFT_OUTER_CORNER];
      const leftEyeInner = landmarks[EYE_LEFT_INNER_CORNER];
      const leftEyeTop = landmarks[EYE_LEFT_TOP_LID];
      const leftEyeBottom = landmarks[EYE_LEFT_BOTTOM_LID];
      const rightEyeOuter = landmarks[EYE_RIGHT_OUTER_CORNER];
      const rightEyeInner = landmarks[EYE_RIGHT_INNER_CORNER];
      const rightEyeTop = landmarks[EYE_RIGHT_TOP_LID];
      const rightEyeBottom = landmarks[EYE_RIGHT_BOTTOM_LID];
      const leftEyeWidth = Math.abs(leftEyeInner.x - leftEyeOuter.x);
      const leftEyeHeight = Math.abs(leftEyeBottom.y - leftEyeTop.y);
      const rightEyeWidth = Math.abs(rightEyeInner.x - rightEyeOuter.x);
      const rightEyeHeight = Math.abs(rightEyeBottom.y - rightEyeTop.y);

      if (leftEyeWidth <= 0 || leftEyeHeight <= 0 || rightEyeWidth <= 0 || rightEyeHeight <= 0) {
        return null;
      }

      // 좌안: Inner(최소 X)를 기준으로 계산
      const leftEyeRelativeX = (leftIrisCenter.x - leftEyeInner.x) / leftEyeWidth; 
      const leftEyeRelativeY = (leftIrisCenter.y - leftEyeTop.y) / leftEyeHeight;
      
      // 우안: Inner(최소 X)를 기준으로 계산
      const rightEyeRelativeX = (rightIrisCenter.x - rightEyeInner.x) / rightEyeWidth; 
      const rightEyeRelativeY = (rightIrisCenter.y - rightEyeTop.y) / rightEyeHeight;
      
      const avgX = (leftEyeRelativeX + rightEyeRelativeX) / 2;
      const avgY = (leftEyeRelativeY + rightEyeRelativeY) / 2;
      
      const gazeX = Math.max(0, Math.min(1, avgX));
      const gazeY = Math.max(0, Math.min(1, avgY));

      // ✅ [추가된 로그] 실시간 동공 추적 로그
      console.log(`👁️ Gaze Tracked: X=${gazeX.toFixed(4)}, Y=${gazeY.toFixed(4)}`);

      // --- 2. 머리(head) 위치 계산 ---
      const headCenter = landmarks[NOSE_TIP_INDEX]; // 코 끝을 얼굴 중심으로 사용

      return { 
        gaze: { x: gazeX, y: gazeY }, 
        head: { x: headCenter.x, y: headCenter.y }
      };
    }

    return null;
  }

  public close(): void {
    this.faceLandmarker?.close();
  }
}