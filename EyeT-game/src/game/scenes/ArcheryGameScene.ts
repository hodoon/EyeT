// hodoon/eyet/EyeT-eaaf522f0858267e704c53039fcda85cb12ae3d5/EyeT-game/src/game/scenes/ArcheryGameScene.ts
import Phaser from 'phaser';
import type { DiagnosisResult } from '../../App'; // 진단 결과 타입

// GDD 4. UI/UX 구조: 7초 (밀리초)
const GAZE_CHARGE_DURATION = 7000;

export class ArcheryGameScene extends Phaser.Scene {
  private diagnosisResult: DiagnosisResult | null = null;
  private gameWidth: number = 0;
  private gameHeight: number = 0;

  // GDD 3. 게임 객체
  private player!: Phaser.GameObjects.Sprite; // ✅ [수정] Graphics -> Sprite
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

  // ✅ [추가] 에셋 로드
  preload() {
    // public/assets/archer_sheet.png 파일을 로드합니다.
    // 프레임 크기는 960x960 이미지를 4x3으로 나눈 값입니다.
    this.load.spritesheet('archer', 'assets/archer_sheet.png', {
      frameWidth: 240,  // 960 / 4
      frameHeight: 320 // 960 / 3
    });
    
    // (추후 풍선, 화살 이미지도 여기에 추가)
    // this.load.image('balloon', 'assets/balloon.png');
    // this.load.image('arrow', 'assets/arrow.png');
  }

  /**
   * ✅ [수정] GameView.tsx로부터 데이터를 받도록 init 메서드 시그니처 변경
   */
  init(data: { diagnosis: DiagnosisResult | null, dimensions: { width: number, height: number } }) {
    this.diagnosisResult = data.diagnosis;

    if (data.dimensions) {
      this.gameWidth = data.dimensions.width;
      this.gameHeight = data.dimensions.height;
    } else {
      console.error("ArcheryGameScene: init()에서 dimensions 데이터를 받지 못했습니다.");
      // 데이터가 없는 경우를 대비한 기본값
      this.gameWidth = 1024;
      this.gameHeight = 768;
    }
  }

  /**
   * Phaser 씬 생성
   */
  create() {
    // ✅ [제거] 레지스트리에서 값을 읽어오던 코드 제거

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
    
    // ✅ [수정] 플레이어 (스프라이트)
    this.player = this.add.sprite(playerX, this.gameHeight / 2, 'archer');

    // ✅ [추가] 플레이어 애니메이션 생성
    this.anims.create({
      key: 'archer_aiming', // 애니메이션 이름
      frames: this.anims.generateFrameNumbers('archer', { 
        start: 0, // 0번 프레임부터
        end: 10   // 10번 프레임까지 (총 11개 프레임)
      }),
      frameRate: 10,     // 초당 10 프레임
      repeat: -1         // -1은 무한 반복
    });

    // ✅ [추가] 애니메이션 재생
    this.player.anims.play('archer_aiming');
    
    // (크기가 너무 크면 주석 해제)
    // this.player.setScale(0.5); 


    // GDD 3. 그림 캔버스 (유지)
    this.targetPicture = this.add.graphics();
    this.targetPicture.fillStyle(0xeeeeee); // 회색 배경
    this.targetPicture.fillRect(pictureX - 100, this.gameHeight / 2 - 200, 200, 400);

    // GDD 4. 충전 게이지 (유지)
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
   * GDD 3. 새 풍선 생성 (유지)
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
   * GDD 4. 충전 게이지 UI 그리기 (유지)
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
   * GDD 3. 마우스 클릭 시 호출 (화살 발사) (유지)
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
   * GDD 3. 풍선 명중 시 (유지)
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