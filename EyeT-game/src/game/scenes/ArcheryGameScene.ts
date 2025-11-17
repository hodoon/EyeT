import Phaser from 'phaser';
import type { DiagnosisResult } from '../../App';

const GAZE_CHARGE_DURATION = 7000;
const MIN_MOVEMENT_SQUARED = 4 * 4;

export class ArcheryGameScene extends Phaser.Scene {
  private diagnosisResult: DiagnosisResult | null = null;
  private gameWidth: number = 0;
  private gameHeight: number = 0;

  private player!: Phaser.GameObjects.Sprite;
  private balloon!: Phaser.GameObjects.Sprite;
  private chargeGauge!: Phaser.GameObjects.Graphics;
  private chargeText!: Phaser.GameObjects.Text;
  private eyeGazeIndicator!: Phaser.GameObjects.Graphics;

  private gazePoint: { x: number, y: number } = { x: 0, y: 0 };
  private smoothedGazePoint: { x: number, y: number } = { x: 0, y: 0 };
  private chargeAmount: number = 0;
  private isGazing: boolean = false;
  private isFired: boolean = false;
  
  private readonly SMOOTHING_FACTOR = 0.3;
  
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
    console.log('🎮 ArcheryGameScene.init() 호출됨');
    this.diagnosisResult = data.diagnosis;

    if (data.dimensions) {
      this.gameWidth = data.dimensions.width;
      this.gameHeight = data.dimensions.height;
    } else {
      console.error("ArcheryGameScene: init()에서 dimensions 데이터를 받지 못했습니다.");
      this.gameWidth = 1024;
      this.gameHeight = 768;
    }
    
    this.gazePoint = { x: this.gameWidth / 2, y: this.gameHeight / 2 };
    this.smoothedGazePoint = { x: this.gameWidth / 2, y: this.gameHeight / 2 };
    
    console.log(`🎮 Scene 초기화: 중앙 좌표 (${this.gazePoint.x}, ${this.gazePoint.y})`);
    
    // ✅ Registry 초기화
    this.registry.remove('gazePoint');
    this.registry.set('isGazeValid', false);
  }

  create() {
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

    let playerX: number;

    if (this.diagnosisResult === 'ESOTROPIA') {
      // 내사시: 기존 유지 (플레이어 왼쪽, 풍선 오른쪽)
      playerX = 100;
      this.balloonXRange = { min: this.gameWidth * 0.85, max: this.gameWidth * 0.95 };
    } 
    else if (this.diagnosisResult === 'EXOTROPIA') {
      // 🟢 [수정] 외사시: 풍선을 오른쪽으로 배치
      // 풍선이 오른쪽(0.6 ~ 0.9)에 나타나므로, 플레이어는 왼쪽(100)으로 이동합니다.
      playerX = 100; 
      this.balloonXRange = { min: this.gameWidth * 0.6, max: this.gameWidth * 0.9 };
    } 
    else {
      playerX = 100;
      this.balloonXRange = { min: this.gameWidth * 0.6, max: this.gameWidth * 0.9 };
    }

    this.player = this.add.sprite(playerX, this.gameHeight - 120, 'archer');
    this.anims.create({
      key: 'archer_aiming',
      frames: this.anims.generateFrameNumbers('archer', { start: 0, end: 63 }),
      frameRate: 10,
      repeat: -1
    });
    this.player.anims.play('archer_aiming');
    this.player.setScale(3);

    this.chargeGauge = this.add.graphics({ x: this.gameWidth / 2 - 200, y: this.gameHeight - 60 });
    this.chargeText = this.add.text(this.gameWidth / 2, this.gameHeight - 80, '시선 고정 시간', {
      fontSize: '18px', color: '#FFFFFF'
    }).setOrigin(0.5);

    this.spawnBalloon();

    this.input.on('pointerdown', this.fireArrow, this);

    this.eyeGazeIndicator = this.add.graphics({ x: 0, y: 0 });
    this.eyeGazeIndicator.setDepth(9999);
  }

  spawnBalloon() {
    if (this.balloon) {
      this.balloon.destroy();
    }
    
    const x = Phaser.Math.Between(this.balloonXRange.min, this.balloonXRange.max);
    const y = Phaser.Math.Between(this.gameHeight * 0.2, this.gameHeight * 0.8);
    const color = Phaser.Display.Color.RandomRGB(100, 255).color;

    this.balloon = this.add.sprite(x, y, 'balloon');
    this.balloon.setScale(0.2);
    this.balloon.setData('radius', (this.balloon.width * this.balloon.scaleX) / 2);
    this.balloon.setData('color', color);
    
    console.log(`🎈 풍선 생성: (${x.toFixed(0)}, ${y.toFixed(0)})`);
  }

  update(time: number, delta: number) {
    const newGazePoint = this.registry.get('gazePoint');
    const isGazeValid = this.registry.get('isGazeValid');
    
    // 🔍 디버그: Registry 상태 확인
    if (newGazePoint) {
      console.log(`📦 Registry: gazePoint=(${newGazePoint.x?.toFixed(1)}, ${newGazePoint.y?.toFixed(1)}), valid=${isGazeValid}`);
    }
    
    // ✅ 시선이 유효하고 새 데이터가 있을 때만 업데이트
    if (isGazeValid === true && newGazePoint && 
        typeof newGazePoint.x === 'number' && 
        typeof newGazePoint.y === 'number') {
        
        this.gazePoint.x = newGazePoint.x;
        this.gazePoint.y = newGazePoint.y;
        
        this.smoothedGazePoint.x += (this.gazePoint.x - this.smoothedGazePoint.x) * this.SMOOTHING_FACTOR;
        this.smoothedGazePoint.y += (this.gazePoint.y - this.smoothedGazePoint.y) * this.SMOOTHING_FACTOR;
        
        console.log(`✅ Valid | Raw: (${this.gazePoint.x.toFixed(1)}, ${this.gazePoint.y.toFixed(1)}) → Smoothed: (${this.smoothedGazePoint.x.toFixed(1)}, ${this.smoothedGazePoint.y.toFixed(1)})`);
    }
    // 시선이 유효하지 않을 때는 이전 smoothed 값 유지 (로그 없음)

    this.eyeGazeIndicator.x = this.smoothedGazePoint.x;
    this.eyeGazeIndicator.y = this.smoothedGazePoint.y;
    
    this.eyeGazeIndicator.clear();
    this.eyeGazeIndicator.fillStyle(0xff0000, 0.7); 
    this.eyeGazeIndicator.fillCircle(0, 0, 10); 
    this.eyeGazeIndicator.setVisible(true); 

    if (!this.balloon || this.isFired) return;

    const balloonRadius = this.balloon.getData('radius');
    const distance = Phaser.Math.Distance.Between(
      this.smoothedGazePoint.x, this.smoothedGazePoint.y,
      this.balloon.x, this.balloon.y
    );
    this.isGazing = distance < balloonRadius * 1.5;

    if (this.isGazing && this.chargeAmount < GAZE_CHARGE_DURATION) {
      this.chargeAmount += delta;
      if (this.chargeAmount > GAZE_CHARGE_DURATION) {
        this.chargeAmount = GAZE_CHARGE_DURATION;
      }
    } else if (!this.isGazing) {
      this.chargeAmount = 0;
    }

    this.updateChargeGauge();
  }

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

  hitBalloon() {
    if (!this.balloon) return;

    this.tweens.add({
      targets: this.balloon,
      scale: 1.5,
      alpha: 0,
      duration: 100,
      onComplete: () => {
        this.spawnBalloon();
      }
    });
  }
}