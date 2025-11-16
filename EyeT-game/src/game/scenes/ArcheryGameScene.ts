import Phaser from 'phaser';
import type { DiagnosisResult } from '../../App'; // 진단 결과 타입
 // 진단 결과 타입

// GDD 4. UI/UX 구조: 7초 (밀리초)
const GAZE_CHARGE_DURATION = 7000;

export class ArcheryGameScene extends Phaser.Scene {
  private diagnosisResult: DiagnosisResult | null = null;
  private gameWidth: number = 0;
  private gameHeight: number = 0;

  // GDD 3. 게임 객체
  private player!: Phaser.GameObjects.Graphics;
  private balloon!: Phaser.GameObjects.Graphics;
  private targetPicture!: Phaser.GameObjects.Graphics;
  private chargeGauge!: Phaser.GameObjects.Graphics;
  private chargeText!: Phaser.GameObjects.Text;
  
  // GDD 6. GazeHoldGauge 시스템
  private gazePoint: { x: number, y: number } = { x: 0, y: 0 };
  private chargeAmount: number = 0;
  private isGazing: boolean = false;
  private isFired: boolean = false;
  
  // GDD 2. 치료 효과 설계: 풍선 위치
  private balloonXRange: { min: number, max: number } = { min: 0, max: 0 };

  constructor() {
    super('ArcheryGameScene');
  }

  /**
   * GameView.tsx로부터 진단 결과를 받음
   */
  init() {
    this.diagnosisResult = this.registry.get('diagnosis');
    this.gameWidth = this.registry.get('gameDimensions').width;
    this.gameHeight = this.registry.get('gameDimensions').height;
  }

  /**
   * Phaser 씬 생성
   */
  create() {
    // 1. GDD 2. 치료 효과 설계
    // 진단 결과에 따라 플레이어, 풍선, 그림 위치 설정
    let playerX: number, pictureX: number;

    // "오른쪽눈 내사시" (ESOTROPIA) - GDD 2. 치료 효과 설계
    if (this.diagnosisResult === 'ESOTROPIA') {
      playerX = 100; // 플레이어는 왼쪽
      this.balloonXRange = { min: this.gameWidth * 0.6, max: this.gameWidth * 0.9 }; // GDD 3. 풍선은 오른쪽 60~90%
      pictureX = this.gameWidth - 150; // 그림도 오른쪽
    } 
    // 외사시 (EXOTROPIA) - 눈이 바깥쪽(귀쪽)으로 몰림
    else if (this.diagnosisResult === 'EXOTROPIA') {
      playerX = this.gameWidth - 100; // 플레이어는 오른쪽
      this.balloonXRange = { min: this.gameWidth * 0.1, max: this.gameWidth * 0.4 }; // 풍선은 왼쪽
      pictureX = 150; // 그림도 왼쪽
    } 
    // 상/하 사시 또는 정상 (GDD 8. 스테이지 예시)
    // (일단은 내사시 훈련을 기본값으로 설정)
    else {
      playerX = 100;
      this.balloonXRange = { min: this.gameWidth * 0.6, max: this.gameWidth * 0.9 };
      pictureX = this.gameWidth - 150;
    }

    // 2. GDD 4. 게임 객체 생성
    
    // 플레이어 (활) - 'D' 모양으로 변경
    this.player = this.add.graphics({ x: playerX, y: this.gameHeight / 2 });
    this.player.lineStyle(5, 0x00ff00); // 초록색 활
    this.player.beginPath();
    this.player.arc(0, 0, 60, Phaser.Math.DegToRad(-90), Phaser.Math.DegToRad(90));
    this.player.strokePath();
    this.player.lineStyle(2, 0xffffff); // 흰색 시위
    this.player.lineBetween(0, -60, 0, 60);

    // GDD 3. 그림 캔버스
    this.targetPicture = this.add.graphics();
    this.targetPicture.fillStyle(0xeeeeee); // 회색 배경
    this.targetPicture.fillRect(pictureX - 100, this.gameHeight / 2 - 200, 200, 400);

    // GDD 4. 충전 게이지
    this.chargeGauge = this.add.graphics({ x: this.gameWidth / 2 - 200, y: this.gameHeight - 60 });
    this.chargeText = this.add.text(this.gameWidth / 2, this.gameHeight - 80, '시선 고정 시간', {
      fontSize: '18px', color: '#000000' // 배경이 밝으므로 검은색
    }).setOrigin(0.5);

    // 3. 풍선 생성 (함수 호출)
    this.spawnBalloon();

    // 4. GDD 3. 마우스 클릭 이벤트 리스너 등록
    this.input.on('pointerdown', this.fireArrow, this);
  }

  /**
   * GDD 3. 새 풍선 생성
   */
  spawnBalloon() {
    if (this.balloon) {
      this.balloon.destroy();
    }
    
    // GDD 3. 오른쪽 영역, Y축 랜덤
    const x = Phaser.Math.Between(this.balloonXRange.min, this.balloonXRange.max);
    const y = Phaser.Math.Between(this.gameHeight * 0.2, this.gameHeight * 0.8);
    const radius = Phaser.Math.Between(30, 50); // GDD 7. 난이도 (크기)
    
    // GDD 3. 풍선마다 색깔 코드
    const color = Phaser.Display.Color.RandomRGB(100, 255).color;

    this.balloon = this.add.graphics({ x, y });
    this.balloon.fillStyle(color);
    this.balloon.fillCircle(0, 0, radius);
    this.balloon.setData('radius', radius);
    this.balloon.setData('color', color);
  }

  /**
   * 매 프레임마다 실행 (GDD 6. GazeHoldGauge 시스템)
   */
  update(time: number, delta: number) {
    // 1. React(MediaPipe)로부터 시선 좌표 받기
    this.gazePoint = this.registry.get('gazePoint') || { x: 0, y: 0 };
    if (!this.balloon || this.isFired) return;

    // 2. GDD 3. 시선이 풍선 위에 있는지 확인
    const balloonRadius = this.balloon.getData('radius');
    const distance = Phaser.Math.Distance.Between(
      this.gazePoint.x, this.gazePoint.y,
      this.balloon.x, this.balloon.y
    );
    this.isGazing = distance < balloonRadius * 1.5; // (판정 범위 1.5배)

    // 3. GDD 3. 시선 충전 로직
    if (this.isGazing && this.chargeAmount < GAZE_CHARGE_DURATION) {
      this.chargeAmount += delta;
      if (this.chargeAmount > GAZE_CHARGE_DURATION) {
        this.chargeAmount = GAZE_CHARGE_DURATION;
      }
    } 
    // 시선을 뗐을 때 (게이지 즉시 리셋)
    else if (!this.isGazing) {
      this.chargeAmount = 0;
    }

    // 4. 충전 게이지 UI 업데이트
    this.updateChargeGauge();
  }

  /**
   * GDD 4. 충전 게이지 UI 그리기
   */
  updateChargeGauge() {
    this.chargeGauge.clear();
    
    // 배경
    this.chargeGauge.fillStyle(0x444444);
    this.chargeGauge.fillRect(0, 0, 400, 30);
    
    // 충전량
    const chargeWidth = (this.chargeAmount / GAZE_CHARGE_DURATION) * 400;
    
    // 7초가 다 차면 색상 변경
    if (this.chargeAmount >= GAZE_CHARGE_DURATION) {
      this.chargeGauge.fillStyle(0x00ff00); // 녹색 (발사 준비 완료)
    } else {
      this.chargeGauge.fillStyle(0xffa500); // 주황색 (충전 중)
    }
    
    this.chargeGauge.fillRect(0, 0, chargeWidth, 30);
  }

  /**
   * GDD 3. 마우스 클릭 시 호출 (화살 발사)
   */
  fireArrow() {
    // 7초 충전이 완료되었고, 아직 발사되지 않았을 때
    if (this.chargeAmount >= GAZE_CHARGE_DURATION && !this.isFired && this.player && this.balloon) {
      this.isFired = true; // 중복 발사 방지
      
      // 1. 화살 생성 (간단한 선)
      const arrow = this.add.graphics({ x: this.player.x, y: this.player.y });
      arrow.lineStyle(5, 0x8B4513); // 갈색
      arrow.lineBetween(0, 0, 40, 0);

      // 2. GDD 3. 화살 발사 (Tween 애니메이션)
      this.tweens.add({
        targets: arrow,
        x: this.balloon.x,
        y: this.balloon.y,
        duration: 300, // 0.3초
        ease: 'Linear',
        onComplete: () => {
          // 3. 명중
          arrow.destroy();
          this.hitBalloon();
          this.isFired = false; // 다시 발사 가능
        }
      });

      // 4. 게이지 초기화
      this.chargeAmount = 0;
    }
  }

  /**
   * GDD 3. 풍선 명중 시
   */
  hitBalloon() {
    if (!this.balloon) return;
    
    const color = this.balloon.getData('color');
    const radius = this.balloon.getData('radius');

    // 1. 풍선 터지는 효과 (임시: 파티클을 쓰려면 'pixel' 에셋 로드가 필요함)
    // 간단히 크기 변경으로 대체
    this.tweens.add({
      targets: this.balloon,
      scale: 1.5,
      alpha: 0,
      duration: 100,
      onComplete: () => {
         // 3. 잠시 후 새 풍선 생성
        this.spawnBalloon();
      }
    });

    // 2. GDD 3. 그림에 색칠하기 (물감 튀는 효과)
    this.targetPicture.fillStyle(color, 0.5); // 50% 투명도
    for(let i=0; i<10; i++) { // 10개의 작은 물감 방울
      this.targetPicture.fillCircle(
        Phaser.Math.Between(-80, 80), // 캔버스 내 랜덤 위치
        Phaser.Math.Between(-180, 180),
        radius * Phaser.Math.FloatBetween(0.2, 0.5) // 풍선 크기 비례
      );
    }
  }
}