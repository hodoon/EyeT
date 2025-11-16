import Phaser from 'phaser';
import type { DiagnosisResult } from '../../App'; // 진단 결과 타입

const GAZE_CHARGE_DURATION = 7000;

export class ArcheryGameScene extends Phaser.Scene {
  private diagnosisResult: DiagnosisResult | null = null;
  private gameWidth: number = 0;
  private gameHeight: number = 0;

  // 게임 객체들
  private player!: Phaser.GameObjects.Sprite;
  private balloon!: Phaser.GameObjects.Sprite;
  // private targetPicture!: Phaser.GameObjects.Graphics; // ❌ [삭제] 그림 캔버스 선언
  private chargeGauge!: Phaser.GameObjects.Graphics;
  private chargeText!: Phaser.GameObjects.Text;
  private eyeGazeIndicator!: Phaser.GameObjects.Graphics;

  // GazeHoldGauge 시스템
  private gazePoint: { x: number, y: number } = { x: 0, y: 0 };
  private chargeAmount: number = 0;
  private isGazing: boolean = false;
  private isFired: boolean = false;
  
  // 풍선 위치 범위
  private balloonXRange: { min: number, max: number } = { min: 0, max: 0 };

  constructor() {
    super('ArcheryGameScene');
  }

  preload() {
    this.load.spritesheet('archer', 'assets/archer_sheet.png', {
      frameWidth: 32,
      frameHeight: 32
    });
    this.load.image('background', 'assets/background_tile.png');
    this.load.image('balloon', 'assets/balloon.png');
    this.load.image('arrow', 'assets/arrow.png');
  }

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

  create() {
    // 배경 타일링 (새로운 방식)
    const backgroundTileTexture = this.textures.get('background');
    if (!backgroundTileTexture.key) {
        console.error("Background tile texture not found!");
        return; 
    }
    
    const tileWidth = backgroundTileTexture.source[0].width;
    const tileHeight = backgroundTileTexture.source[0].height;

    const numTiles = Math.ceil(this.gameWidth / tileWidth);

    for (let i = 0; i < numTiles + 1; i++) {
        this.add.image(i * tileWidth + tileWidth / 2, this.gameHeight / 2, 'background')
            .setOrigin(0.5, 0.5)
            .setScrollFactor(0);
    }

    // 1. GDD 2. 치료 효과 설계
    let playerX: number; // pictureX는 더 이상 필요 없음

    if (this.diagnosisResult === 'ESOTROPIA') {
      playerX = 100;
      this.balloonXRange = { min: this.gameWidth * 0.6, max: this.gameWidth * 0.9 };
      // pictureX = this.gameWidth - 150; // ❌ [삭제]
    } 
    else if (this.diagnosisResult === 'EXOTROPIA') {
      playerX = this.gameWidth - 100;
      this.balloonXRange = { min: this.gameWidth * 0.1, max: this.gameWidth * 0.4 };
      // pictureX = 150; // ❌ [삭제]
    } 
    else {
      playerX = 100;
      this.balloonXRange = { min: this.gameWidth * 0.6, max: this.gameWidth * 0.9 };
      // pictureX = this.gameWidth - 150; // ❌ [삭제]
    }

    // 2. GDD 4. 게임 객체 생성
    
    this.player = this.add.sprite(playerX, this.gameHeight - 120, 'archer'); // ✅ 궁수 위치 수정
    this.anims.create({
      key: 'archer_aiming',
      frames: this.anims.generateFrameNumbers('archer', { start: 0, end: 63 }),
      frameRate: 10,
      repeat: -1
    });
    this.player.anims.play('archer_aiming');
    this.player.setScale(3);

    // this.targetPicture = this.add.graphics(); // ❌ [삭제] 그림 캔버스 생성
    // this.targetPicture.fillStyle(0xeeeeee);   // ❌ [삭제]
    // this.targetPicture.fillRect(pictureX - 100, this.gameHeight / 2 - 200, 200, 400); // ❌ [삭제]

    this.chargeGauge = this.add.graphics({ x: this.gameWidth / 2 - 200, y: this.gameHeight - 60 });
    this.chargeText = this.add.text(this.gameWidth / 2, this.gameHeight - 80, '시선 고정 시간', {
      fontSize: '18px', color: '#FFFFFF'
    }).setOrigin(0.5);

    // 3. 풍선 생성
    this.spawnBalloon();

    // 4. GDD 3. 마우스 클릭 이벤트 리스너 등록
    this.input.on('pointerdown', this.fireArrow, this);

    // 시선 표시기 생성
    this.eyeGazeIndicator = this.add.graphics({ x: 0, y: 0 });
    this.eyeGazeIndicator.fillStyle(0xff0000, 0.7);
    this.eyeGazeIndicator.fillCircle(0, 0, 10);
    this.eyeGazeIndicator.setDepth(100);
  }

  /**
   * 새 풍선 생성
   */
  spawnBalloon() {
    if (this.balloon) {
      this.balloon.destroy();
    }
    
    const x = Phaser.Math.Between(this.balloonXRange.min, this.balloonXRange.max);
    const y = Phaser.Math.Between(this.gameHeight * 0.2, this.gameHeight * 0.8);
    
    const color = Phaser.Display.Color.RandomRGB(100, 255).color;

    this.balloon = this.add.sprite(x, y, 'balloon');
    this.balloon.setScale(0.2); // ✅ 풍선 크기 수정

    this.balloon.setData('radius', (this.balloon.width * this.balloon.scaleX) / 2);
    this.balloon.setData('color', color);
  }

  /**
   * 매 프레임마다 실행
   */
  update(time: number, delta: number) {
    // 1. React(MediaPipe)로부터 시선 좌표 받기
    this.gazePoint = this.registry.get('gazePoint') || { x: 0, y: 0 };
    if (!this.balloon || this.isFired) return;

    // 시선 표시기 위치 업데이트
    if (this.gazePoint.x !== 0 || this.gazePoint.y !== 0) {
      this.eyeGazeIndicator.x = this.gazePoint.x;
      this.eyeGazeIndicator.y = this.gazePoint.y;
      this.eyeGazeIndicator.setVisible(true);
    } else {
      this.eyeGazeIndicator.setVisible(false);
    }

    // 2. GDD 3. 시선이 풍선 위에 있는지 확인
    const balloonRadius = this.balloon.getData('radius');
    const distance = Phaser.Math.Distance.Between(
      this.gazePoint.x, this.gazePoint.y,
      this.balloon.x, this.balloon.y
    );
    this.isGazing = distance < balloonRadius * 1.5;

    // 3. GDD 3. 시선 충전 로직
    if (this.isGazing && this.chargeAmount < GAZE_CHARGE_DURATION) {
      this.chargeAmount += delta;
      if (this.chargeAmount > GAZE_CHARGE_DURATION) {
        this.chargeAmount = GAZE_CHARGE_DURATION;
      }
    } 
    else if (!this.isGazing) {
      this.chargeAmount = 0;
    }

    // 4. 충전 게이지 UI 업데이트
    this.updateChargeGauge();
  }

  /**
   * 충전 게이지 UI 그리기
   */
  updateChargeGauge() {
    this.chargeGauge.clear();
    
    this.chargeGauge.fillStyle(0x444444, 0.8);
    this.chargeGauge.fillRect(0, 0, 400, 30);
    
    const chargeWidth = (this.chargeAmount / GAZE_CHARGE_DURATION) * 400;
    
    if (this.chargeAmount >= GAZE_CHARGE_DURATION) {
      this.chargeGauge.fillStyle(0x00ff00, 0.9);
    } else {
      this.chargeGauge.fillStyle(0xffa500, 0.9);
    }
    
    this.chargeGauge.fillRect(0, 0, chargeWidth, 30);
  }

  /**
   * 마우스 클릭 시 호출 (화살 발사)
   */
  fireArrow() {
    if (this.chargeAmount >= GAZE_CHARGE_DURATION && !this.isFired && this.player && this.balloon) {
      this.isFired = true;
      
      const arrow = this.add.sprite(this.player.x, this.player.y, 'arrow');
      this.player.anims.stop();
      
      arrow.setScale(0.09);

      this.tweens.add({
        targets: arrow,
        x: this.balloon.x,
        y: this.balloon.y,
        duration: 300,
        ease: 'Linear',
        onComplete: () => {
          arrow.destroy();
          this.hitBalloon();
          this.isFired = false;
          this.player.anims.play('archer_aiming');
        }
      });

      this.chargeAmount = 0;
    }
  }

  /**
   * 풍선 명중 시
   */
  hitBalloon() {
    if (!this.balloon) return;

    this.tweens.add({
      targets: this.balloon,
      scale: 1.5,
      alpha: 0,
      duration: 100,
      onComplete: () => {
        this.spawnBalloon(); // 새 풍선 생성
      }
    });

  }
}