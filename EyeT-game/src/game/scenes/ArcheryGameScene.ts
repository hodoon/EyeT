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
  private player!: Phaser.GameObjects.Sprite;
  private balloon!: Phaser.GameObjects.Sprite;
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

  // ✅ [수정] 에셋 로드 및 프레임 크기 수정
  preload() {
    // 1. 궁수 (새 이미지에 맞춰 frameWidth, frameHeight, 파일 이름 수정)
    this.load.spritesheet('archer', 'assets/archer_sheet_new.png', { // ✅ 파일 이름도 변경했다고 가정
      frameWidth: 32,  // ⬅️ 256 / 8
      frameHeight: 32 // ⬅️ 256 / 8
    });
    
    // 2. 배경 (이전과 동일)
    this.load.image('background', 'assets/background_tile.png');
    
    // 3. 풍선 (이전과 동일)
    this.load.image('balloon', 'assets/balloon.png');
    
    // 4. 화살 (이전과 동일)
    this.load.image('arrow', 'assets/arrow.png');
  }

  /**
   * GameView.tsx로부터 데이터를 받음
   */
  init(data: { diagnosis: DiagnosisResult | null, dimensions: { width: number, height: number } }) {
    this.diagnosisResult = data.diagnosis;

    if (data.dimensions) {
      this.gameWidth = data.dimensions.width;
      this.gameHeight = data.dimensions.height;
    } else {
      console.error("ArcheryGameScene: init()에서 dimensions 데이터를 받지 못했습니다.");
      this.gameWidth = 1024;
      this.gameHeight = 768;
    }
  }

  /**
   * Phaser 씬 생성
   */
  create() {
    // ✅ [추가] 배경 이미지 추가
    this.add.image(this.gameWidth / 2, this.gameHeight / 2, 'background');

    // 1. GDD 2. 치료 효과 설계
    let playerX: number, pictureX: number;

    // "오른쪽눈 내사시" (ESOTROPIA)
    if (this.diagnosisResult === 'ESOTROPIA') {
      playerX = 100;
      this.balloonXRange = { min: this.gameWidth * 0.6, max: this.gameWidth * 0.9 };
      pictureX = this.gameWidth - 150;
    } 
    // 외사시 (EXOTROPIA)
    else if (this.diagnosisResult === 'EXOTROPIA') {
      playerX = this.gameWidth - 100;
      this.balloonXRange = { min: this.gameWidth * 0.1, max: this.gameWidth * 0.4 };
      pictureX = 150;
    } 
    // 기본값
    else {
      playerX = 100;
      this.balloonXRange = { min: this.gameWidth * 0.6, max: this.gameWidth * 0.9 };
      pictureX = this.gameWidth - 150;
    }

    // 2. GDD 4. 게임 객체 생성
    
    // 플레이어 (스프라이트)
    this.player = this.add.sprite(playerX, this.gameHeight / 2, 'archer');

    // ✅ [수정] 플레이어 애니메이션 생성 (총 64개 프레임을 사용하므로 0~63번)
    this.anims.create({
      key: 'archer_aiming', // 애니메이션 이름
      frames: this.anims.generateFrameNumbers('archer', { 
        start: 0, // 0번 프레임부터
        end: 63   // ✅ 63번 프레임까지 (총 64개 프레임)
      }),
      frameRate: 10,     // 초당 10 프레임
      repeat: -1         // -1은 무한 반복
    });

    // ✅ 애니메이션 재생
    this.player.anims.play('archer_aiming');
    
    // (궁수 크기 조절이 필요하면 주석 해제. 32x32이므로 아마 scale을 늘려야 할 것입니다.)
    this.player.setScale(3); // 예시: 3배 확대 (32*3 = 96px)

    // GDD 3. 그림 캔버스 (유지)
    this.targetPicture = this.add.graphics();
    this.targetPicture.fillStyle(0xeeeeee);
    this.targetPicture.fillRect(pictureX - 100, this.gameHeight / 2 - 200, 200, 400);

    // GDD 4. 충전 게이지 (유지)
    this.chargeGauge = this.add.graphics({ x: this.gameWidth / 2 - 200, y: this.gameHeight - 60 });
    this.chargeText = this.add.text(this.gameWidth / 2, this.gameHeight - 80, '시선 고정 시간', {
      fontSize: '18px', color: '#FFFFFF' // 배경이 어두워졌으므로 흰색
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
    
    const x = Phaser.Math.Between(this.balloonXRange.min, this.balloonXRange.max);
    const y = Phaser.Math.Between(this.gameHeight * 0.2, this.gameHeight * 0.8);
    
    const color = Phaser.Display.Color.RandomRGB(100, 255).color;

    // ✅ [수정] 풍선 (스프라이트)
    this.balloon = this.add.sprite(x, y, 'balloon');
    // (풍선 크기 조절이 필요하면 주석 해제)
    this.balloon.setScale(0.8); // 예시

    // 시선 판정을 위해 이미지의 너비를 'radius' 데이터로 저장
    this.balloon.setData('radius', (this.balloon.width * this.balloon.scaleX) / 2); // ✅ 스케일 적용
    this.balloon.setData('color', color); // 물감 색칠용
  }

  /**
   * 매 프레임마다 실행
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
    this.chargeGauge.fillStyle(0x444444, 0.8);
    this.chargeGauge.fillRect(0, 0, 400, 30);
    
    // 충전량
    const chargeWidth = (this.chargeAmount / GAZE_CHARGE_DURATION) * 400;
    
    if (this.chargeAmount >= GAZE_CHARGE_DURATION) {
      this.chargeGauge.fillStyle(0x00ff00, 0.9); // 녹색
    } else {
      this.chargeGauge.fillStyle(0xffa500, 0.9); // 주황색
    }
    
    this.chargeGauge.fillRect(0, 0, chargeWidth, 30);
  }

  /**
   * GDD 3. 마우스 클릭 시 호출 (화살 발사)
   */
  fireArrow() {
    if (this.chargeAmount >= GAZE_CHARGE_DURATION && !this.isFired && this.player && this.balloon) {
      this.isFired = true;
      
      // ✅ [수정] 화살 (스프라이트)
      const arrow = this.add.sprite(this.player.x, this.player.y, 'arrow');
      this.player.anims.stop(); // ✅ 화살 발사 시 애니메이션 정지 (선택 사항)
      
      // (화살 크기 조절이 필요하면 주석 해제)
      arrow.setScale(0.5);

      // 2. GDD 3. 화살 발사 (Tween 애니메이션)
      this.tweens.add({
        targets: arrow,
        x: this.balloon.x,
        y: this.balloon.y,
        duration: 300,
        ease: 'Linear',
        onComplete: () => {
          // 3. 명중
          arrow.destroy();
          this.hitBalloon();
          this.isFired = false;
          this.player.anims.play('archer_aiming'); // ✅ 애니메이션 다시 재생
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

    // 1. 풍선 터지는 효과
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

    // 2. GDD 3. 그림에 색칠하기
    this.targetPicture.fillStyle(color, 0.5);
    for(let i=0; i<10; i++) {
      this.targetPicture.fillCircle(
        Phaser.Math.Between(-80, 80),
        Phaser.Math.Between(-180, 180),
        radius * Phaser.Math.FloatBetween(0.2, 0.5)
      );
    }
  }
}