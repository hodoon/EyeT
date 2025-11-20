import {
  FaceLandmarker,
  FilesetResolver,
  type NormalizedLandmark
} from "@mediapipe/tasks-vision";

const MP_TASKS_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

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

const NOSE_TIP_INDEX = 1;

export class EyeGazeTracker {
  private faceLandmarker: FaceLandmarker | null = null;
  private lastVideoTime = -1;
  private lastGoodGazeAndHead: { gaze: { x: number, y: number }, head: { x: number, y: number } } | null = null;
  private framesSinceLastDetection = 0;
  private readonly DETECTION_LOSS_THRESHOLD = 10;

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

  public async getGazeAndHead(videoElement: HTMLVideoElement): Promise<{ gaze: { x: number, y: number }, head: { x: number, y: number } } | null> {
    if (!this.faceLandmarker || videoElement.readyState < 2) {
      return null;
    }

    const videoTime = videoElement.currentTime;
    if (this.lastVideoTime === videoTime) {
      return this.lastGoodGazeAndHead;
    }
    this.lastVideoTime = videoTime;

    const results = this.faceLandmarker.detectForVideo(videoElement, performance.now());

    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
      this.framesSinceLastDetection = 0;
      const landmarks = results.faceLandmarks[0];

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
        if (this.framesSinceLastDetection < this.DETECTION_LOSS_THRESHOLD) {
          return this.lastGoodGazeAndHead;
        }
        return null;
      }

      const leftEyeRelativeX = (leftIrisCenter.x - leftEyeInner.x) / leftEyeWidth;
      const leftEyeRelativeY = (leftIrisCenter.y - leftEyeTop.y) / leftEyeHeight;

      const rightEyeRelativeX = (rightIrisCenter.x - rightEyeInner.x) / rightEyeWidth;
      const rightEyeRelativeY = (rightIrisCenter.y - rightEyeTop.y) / rightEyeHeight;

      const avgX = (leftEyeRelativeX + rightEyeRelativeX) / 2;
      const avgY = (leftEyeRelativeY + rightEyeRelativeY) / 2;

      const gazeX = Math.max(0, Math.min(1, avgX));
      const gazeY = Math.max(0, Math.min(1, avgY));

      console.log(`👁️ Gaze Tracked: X=${gazeX.toFixed(4)}, Y=${gazeY.toFixed(4)}`);

      const headCenter = landmarks[NOSE_TIP_INDEX];

      this.lastGoodGazeAndHead = {
        gaze: { x: gazeX, y: gazeY },
        head: { x: headCenter.x, y: headCenter.y }
      };
      return this.lastGoodGazeAndHead;
    } else {
      this.framesSinceLastDetection++;
      if (this.framesSinceLastDetection < this.DETECTION_LOSS_THRESHOLD && this.lastGoodGazeAndHead) {
        return this.lastGoodGazeAndHead;
      } else {
        this.lastGoodGazeAndHead = null;
        return null;
      }
    }
  }

  public close(): void {
    this.faceLandmarker?.close();
  }
}