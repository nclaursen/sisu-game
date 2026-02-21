import { Enemy, createEnemy, type CollisionRect, type EnemyType } from "./enemy";
import type { Input } from "./input";
import type { SoundManager } from "./sound";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Player extends Rect {
  vx: number;
  vy: number;
  facing: 1 | -1;
  grounded: boolean;
  animationTime: number;
}

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  duration: number;
}

type PlayerAnimationName = "idle" | "run" | "jump" | "digging";

interface DigSpot extends Rect {
  dug: boolean;
  hasBone: boolean;
  dirtDecor: DirtDecorTriangle[];
}

interface BoneCollectible extends Rect {
  active: boolean;
  vy: number;
  state: "popping" | "idle";
  popTimerSec: number;
  startY: number;
  targetY: number;
  settleY: number;
}

interface DigParticle extends Rect {
  vx: number;
  vy: number;
  lifeSec: number;
  maxLifeSec: number;
  colorRgb: string;
}

interface DirtDecorTriangle {
  xOffset: number;
  yOffset: number;
  size: number;
  shadeIndex: number;
  flipX: boolean;
}

interface GoldenToy extends Rect {
  collected: boolean;
}

interface ExitGate extends Rect {}

interface SpawnPoint {
  x: number;
  groundY: number;
}

interface LevelDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  backgroundColor: string;
  platforms: Rect[];
  enemySpawnPoints: SpawnPoint[];
  goldenToyPosition: { x: number; y: number };
  exitGatePosition: { x: number; y: number };
  digSeed: string;
}

type PlayerActionState = "normal" | "digging";
type GameState = "playing" | "gameOver" | "levelComplete" | "demoComplete";

interface LevelCompleteStats {
  bonesCollected: number;
  heartsRemaining: number;
  timeSec: number;
  levelName: string;
}

interface GameCallbacks {
  onGameOver?: () => void;
  onLevelComplete?: (stats: LevelCompleteStats & { hasNextLevel: boolean }) => void;
  onDemoComplete?: (stats: LevelCompleteStats) => void;
  sound?: SoundManager;
}

const INTERNAL_WIDTH = 320;
const INTERNAL_HEIGHT = 180;
const CAMERA_PLAYER_SCREEN_X = INTERNAL_WIDTH * 0.4;
const GRAVITY = 1200;
const ACCEL = 900;
const AIR_ACCEL = 650;
const MAX_SPEED = 170;
const JUMP_SPEED = 420;
const JUMP_CUT_MULTIPLIER = 0.65;
const GROUND_FRICTION = 1200;
const TERMINAL_VELOCITY = 700;
const COYOTE_TIME_MS = 120;
const JUMP_BUFFER_MS = 120;
const COLLISION_SKIN = 0.75;
const STEP_UP_HEIGHT = 2;

const MAX_HEARTS = 3;
const PLAYER_IFRAMES_SEC = 1.0;
const PLAYER_KNOCKBACK_X = 190;
const PLAYER_KNOCKBACK_Y = 220;
const STOMP_TOLERANCE = 4;
const STOMP_BOUNCE_SPEED = JUMP_SPEED * 0.45;

const DIG_DURATION_SEC = 0.5;
const DIG_SPOT_MIN_COUNT = 3;
const DIG_SPOT_MAX_COUNT = 6;
const DIG_SPOT_WIDTH = 16;
const DIG_SPOT_HEIGHT = 6;
const DIG_START_MIN_X_FACTOR = 0.1;
const DIG_MIN_DISTANCE_FROM_START = 28;
const DIG_MIN_DISTANCE_FROM_ENEMY = 34;
const DIG_MIN_SPOT_SPACING = 28;
const DIG_BONE_CHANCE = 0.7;

const BONE_POP_DURATION_SEC = 0.3;
const BONE_POP_INITIAL_VY = -120;
const BONE_POP_GRAVITY = 520;
const BONE_SETTLE_RANGE = 2.5;
const DIG_PARTICLE_LIFE_SEC = 0.45;
const DIG_PARTICLE_LIFE_MIN_SEC = 0.2;
const DIG_PARTICLE_LIFE_MAX_SEC = 0.35;
const DIG_PARTICLE_EMIT_INTERVAL_SEC = 0.075;
const DIG_PARTICLE_GRAVITY = 600;
const DIG_PARTICLE_MAX_COUNT = 30;
const ENEMY_SPAWN_POOF_MIN_PARTICLES = 8;
const ENEMY_SPAWN_POOF_MAX_PARTICLES = 12;
const ENEMY_SPAWN_POOF_COLOR = "170, 142, 104";

const GATE_LOCKED_HINT_SEC = 1.5;

const PLAYER_START_X = 16;
const PLAYER_START_Y = 40;

const LEVEL_WILD_GARDEN: LevelDefinition = {
  id: "wild-garden",
  name: "Wild Garden",
  width: 1800,
  height: INTERNAL_HEIGHT,
  backgroundColor: "#8bd3ff",
  platforms: [
    { x: 0, y: 164, w: 1800, h: 16 },

    // Intro Stretch
    { x: 96, y: 136, w: 74, h: 10 },
    { x: 232, y: 122, w: 62, h: 10 },

    // First Pressure
    { x: 410, y: 138, w: 84, h: 10 },
    { x: 548, y: 120, w: 70, h: 10 },
    { x: 668, y: 140, w: 72, h: 10 },

    // Mid Challenge
    { x: 804, y: 128, w: 86, h: 10 },
    { x: 932, y: 108, w: 72, h: 10 },
    { x: 1048, y: 128, w: 86, h: 10 },

    // Golden Toy Area
    { x: 1220, y: 130, w: 80, h: 10 },
    { x: 1342, y: 108, w: 78, h: 10 },
    { x: 1462, y: 90, w: 72, h: 10 },

    // Gate Run
    { x: 1584, y: 132, w: 88, h: 10 },
    { x: 1708, y: 142, w: 64, h: 10 }
  ],
  enemySpawnPoints: [
    // Intro Stretch
    { x: 160, groundY: 164 },

    // First Pressure
    { x: 448, groundY: 164 },
    { x: 632, groundY: 164 },

    // Mid Challenge
    { x: 838, groundY: 128 },
    { x: 1078, groundY: 128 },

    // Golden Toy Area
    { x: 1312, groundY: 130 },
    { x: 1496, groundY: 90 },

    // Gate Run
    { x: 1628, groundY: 164 },
    { x: 1738, groundY: 164 }
  ],
  goldenToyPosition: { x: 1452, y: 76 },
  exitGatePosition: { x: 1682, y: 132 },
  digSeed: "wild-garden-seed"
};

const LEVEL_COURTYARD: LevelDefinition = {
  id: "courtyard",
  name: "Courtyard",
  width: 2200,
  height: INTERNAL_HEIGHT,
  backgroundColor: "#d9dde2",
  platforms: [
    { x: 0, y: 164, w: 2200, h: 16 },
    { x: 40, y: 144, w: 70, h: 10 },
    { x: 150, y: 122, w: 62, h: 10 },
    { x: 250, y: 100, w: 54, h: 10 },
    { x: 350, y: 132, w: 72, h: 10 },
    { x: 500, y: 112, w: 58, h: 10 },
    { x: 620, y: 90, w: 54, h: 10 },
    { x: 760, y: 124, w: 70, h: 10 },
    { x: 920, y: 102, w: 56, h: 10 },
    { x: 1040, y: 82, w: 54, h: 10 },
    { x: 1180, y: 126, w: 72, h: 10 },
    { x: 1360, y: 106, w: 60, h: 10 },
    { x: 1500, y: 86, w: 54, h: 10 },
    { x: 1650, y: 122, w: 74, h: 10 },
    { x: 1830, y: 100, w: 60, h: 10 },
    { x: 1980, y: 124, w: 76, h: 10 }
  ],
  enemySpawnPoints: [
    { x: 70, groundY: 144 },
    { x: 390, groundY: 132 },
    { x: 800, groundY: 124 },
    { x: 1210, groundY: 126 },
    { x: 1690, groundY: 122 },
    { x: 2020, groundY: 124 }
  ],
  goldenToyPosition: { x: 1700, y: 74 },
  exitGatePosition: { x: 2080, y: 132 },
  digSeed: "courtyard-seed"
};

const LEVEL_SNOW_GARDEN: LevelDefinition = {
  id: "snow-garden",
  name: "Snow Garden",
  width: 2200,
  height: INTERNAL_HEIGHT,
  backgroundColor: "#b7d4ef",
  platforms: [
    { x: 0, y: 164, w: 2200, h: 16 },
    { x: 70, y: 132, w: 86, h: 10 },
    { x: 220, y: 110, w: 72, h: 10 },
    { x: 390, y: 136, w: 92, h: 10 },
    { x: 540, y: 102, w: 74, h: 10 },
    { x: 700, y: 126, w: 84, h: 10 },
    { x: 890, y: 98, w: 80, h: 10 },
    { x: 1080, y: 136, w: 96, h: 10 },
    { x: 1260, y: 108, w: 78, h: 10 },
    { x: 1450, y: 124, w: 90, h: 10 },
    { x: 1640, y: 96, w: 82, h: 10 },
    { x: 1830, y: 130, w: 94, h: 10 },
    { x: 2010, y: 112, w: 72, h: 10 }
  ],
  enemySpawnPoints: [
    { x: 120, groundY: 132 },
    { x: 430, groundY: 136 },
    { x: 740, groundY: 126 },
    { x: 1120, groundY: 136 },
    { x: 1500, groundY: 124 },
    { x: 1860, groundY: 130 }
  ],
  goldenToyPosition: { x: 1640, y: 84 },
  exitGatePosition: { x: 2080, y: 132 },
  digSeed: "snow-garden-seed"
};

const LEVELS: ReadonlyArray<LevelDefinition> = [LEVEL_WILD_GARDEN, LEVEL_COURTYARD, LEVEL_SNOW_GARDEN];
const ENEMY_TYPE_WEIGHTS: ReadonlyArray<{ type: EnemyType; weight: number }> = [
  { type: "rat", weight: 0.5 },
  { type: "mouse", weight: 0.3 },
  { type: "tank", weight: 0.2 }
];
const MAX_ENEMIES_ALIVE = 3;
const ENEMY_SPAWN_INTERVAL_MIN_SEC = 6;
const ENEMY_SPAWN_INTERVAL_MAX_SEC = 10;
const ENEMY_RESPAWN_DELAY_MIN_SEC = 2;
const ENEMY_RESPAWN_DELAY_MAX_SEC = 3;
const ENEMY_MIN_PLAYER_DISTANCE_X = 120;
const ENEMY_MIN_SEPARATION_X = 22;
const TOY_SIZE = { w: 8, h: 8 };
const EXIT_GATE_SIZE = { w: 18, h: 32 };

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input: Input;
  private readonly onGameOver?: () => void;
  private readonly onLevelComplete?: (stats: LevelCompleteStats & { hasNextLevel: boolean }) => void;
  private readonly onDemoComplete?: (stats: LevelCompleteStats) => void;
  private readonly sound?: SoundManager;
  private enemies: Enemy[] = [];
  private readonly playerSpriteImage: HTMLImageElement;
  private readonly playerAnimations: Record<PlayerAnimationName, Frame[]>;
  private playerSpriteReady = false;
  private currentPlayerAnimation: PlayerAnimationName = "idle";
  private playerAnimationFrameIndex = 0;
  private playerAnimationFrameElapsed = 0;

  private lastTick = 0;
  private nowMs = 0;
  private isRunning = false;
  private lastGroundedTimeMs = -Infinity;
  private lastJumpPressedTimeMs = -Infinity;
  private previousJumpHeld = false;
  private debugEnabled = false;
  private hearts = MAX_HEARTS;
  private bonesCollected = 0;
  private invincibleTimerSec = 0;
  private gameState: GameState = "playing";
  private elapsedSec = 0;
  private levelIndex = 0;
  private levelTitleTimerSec = 0;
  private camera = { x: 0, y: 0 };

  private playerState: PlayerActionState = "normal";
  private digTimerSec = 0;
  private activeDigSpotIndex: number | null = null;
  private digSpots: DigSpot[] = [];
  private bones: BoneCollectible[] = [];
  private digParticles: DigParticle[] = [];
  private digEmitTimerSec = 0;

  private goldenToy: GoldenToy = { x: 0, y: 0, w: TOY_SIZE.w, h: TOY_SIZE.h, collected: false };
  private exitGate: ExitGate = { x: 0, y: 0, w: EXIT_GATE_SIZE.w, h: EXIT_GATE_SIZE.h };
  private hasGoldenToy = false;
  private gateHintTimerSec = 0;
  private spawnTimerSec = 0;
  private pendingRespawnTimers: number[] = [];

  private readonly player: Player = {
    x: PLAYER_START_X,
    y: PLAYER_START_Y,
    w: 16,
    h: 16,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: false,
    animationTime: 0
  };

  constructor(canvas: HTMLCanvasElement, input: Input, callbacks: GameCallbacks = {}) {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("2D context unavailable");
    }

    this.canvas = canvas;
    this.ctx = context;
    this.input = input;
    this.onGameOver = callbacks.onGameOver;
    this.onLevelComplete = callbacks.onLevelComplete;
    this.onDemoComplete = callbacks.onDemoComplete;
    this.sound = callbacks.sound;
    this.loadLevel(0);
    const playerSprite = createPlaceholderPlayerSpriteSheet();
    this.playerSpriteImage = playerSprite.image;
    this.playerAnimations = playerSprite.animations;
    this.playerSpriteImage.onload = () => {
      this.playerSpriteReady = true;
    };

    this.ctx.imageSmoothingEnabled = false;
    window.addEventListener("keydown", (event) => {
      if (event.code === "Backslash") {
        this.debugEnabled = !this.debugEnabled;
      }
    });

    this.resizeCanvas();
    window.addEventListener("resize", () => this.resizeCanvas());
  }

  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.lastTick = performance.now();
    requestAnimationFrame((time) => this.loop(time));
  }

  restart(): void {
    this.loadLevel(this.levelIndex);
  }

  restartFromFirstLevel(): void {
    this.loadLevel(0);
  }

  nextLevel(): boolean {
    if (this.levelIndex + 1 >= LEVELS.length) {
      this.gameState = "demoComplete";
      this.onDemoComplete?.({
        bonesCollected: this.bonesCollected,
        heartsRemaining: this.hearts,
        timeSec: this.elapsedSec,
        levelName: this.currentLevel().name
      });
      return false;
    }
    this.loadLevel(this.levelIndex + 1);
    return true;
  }

  isDemoComplete(): boolean {
    return this.gameState === "demoComplete";
  }

  getCurrentLevelName(): string {
    return this.currentLevel().name;
  }

  hasNextLevel(): boolean {
    return this.levelIndex + 1 < LEVELS.length;
  }

  private loadLevel(index: number): void {
    this.levelIndex = clamp(index, 0, LEVELS.length - 1);

    this.hearts = MAX_HEARTS;
    this.bonesCollected = 0;
    this.invincibleTimerSec = 0;
    this.gameState = "playing";
    this.lastGroundedTimeMs = -Infinity;
    this.lastJumpPressedTimeMs = -Infinity;
    this.previousJumpHeld = false;
    this.elapsedSec = 0;

    this.playerState = "normal";
    this.digTimerSec = 0;
    this.activeDigSpotIndex = null;
    this.digEmitTimerSec = 0;

    this.player.x = PLAYER_START_X;
    this.player.y = PLAYER_START_Y;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player.facing = 1;
    this.player.grounded = false;
    this.player.animationTime = 0;
    this.currentPlayerAnimation = "idle";
    this.playerAnimationFrameIndex = 0;
    this.playerAnimationFrameElapsed = 0;

    this.resetEnemyWave();
    this.digSpots = this.generateDigSpots(this.currentLevel().digSeed);
    this.bones = [];
    this.digParticles = [];

    this.goldenToy = {
      x: this.currentLevel().goldenToyPosition.x,
      y: this.currentLevel().goldenToyPosition.y,
      w: TOY_SIZE.w,
      h: TOY_SIZE.h,
      collected: false
    };
    this.exitGate = {
      x: this.currentLevel().exitGatePosition.x,
      y: this.currentLevel().exitGatePosition.y,
      w: EXIT_GATE_SIZE.w,
      h: EXIT_GATE_SIZE.h
    };
    this.hasGoldenToy = false;
    this.gateHintTimerSec = 0;
    this.levelTitleTimerSec = 1.5;
    this.camera.x = 0;
    this.camera.y = 0;
  }

  isGameOver(): boolean {
    return this.gameState === "gameOver";
  }

  isLevelComplete(): boolean {
    return this.gameState === "levelComplete";
  }

  private loop(timestamp: number): void {
    if (!this.isRunning) {
      return;
    }

    const delta = Math.min((timestamp - this.lastTick) / 1000, 1 / 30);
    this.lastTick = timestamp;
    this.nowMs = timestamp;

    this.update(delta);
    this.render();

    this.input.endFrame();
    requestAnimationFrame((time) => this.loop(time));
  }

  private update(delta: number): void {
    if (this.gameState !== "playing") {
      return;
    }

    const state = this.input.state;
    const inputDirection = Number(state.right) - Number(state.left);
    const previousPlayerBottom = this.player.y + this.player.h;
    this.elapsedSec += delta;

    if (this.invincibleTimerSec > 0) {
      this.invincibleTimerSec = Math.max(0, this.invincibleTimerSec - delta);
    }

    if (this.gateHintTimerSec > 0) {
      this.gateHintTimerSec = Math.max(0, this.gateHintTimerSec - delta);
    }
    if (this.levelTitleTimerSec > 0) {
      this.levelTitleTimerSec = Math.max(0, this.levelTitleTimerSec - delta);
    }

    if (this.playerState === "normal" && this.input.consumeDigPressed()) {
      const digSpotIndex = this.findDigSpotForPlayer();
      if (this.player.grounded && digSpotIndex !== null) {
        this.playerState = "digging";
        this.digTimerSec = DIG_DURATION_SEC;
        this.activeDigSpotIndex = digSpotIndex;
        this.player.vx = 0;
      }
    }

    if (this.player.grounded) {
      this.lastGroundedTimeMs = this.nowMs;
    }

    if (this.playerState === "normal") {
      if (this.input.consumeJumpPressed()) {
        this.lastJumpPressedTimeMs = this.nowMs;
      }

      if (inputDirection < 0) {
        this.player.facing = -1;
      } else if (inputDirection > 0) {
        this.player.facing = 1;
      }

      const accel = this.player.grounded ? ACCEL : AIR_ACCEL;
      if (inputDirection !== 0) {
        this.player.vx += inputDirection * accel * delta;
      } else if (this.player.grounded) {
        this.player.vx = moveTowards(this.player.vx, 0, GROUND_FRICTION * delta);
      }
      this.player.vx = clamp(this.player.vx, -MAX_SPEED, MAX_SPEED);

      const jumpBuffered = this.nowMs - this.lastJumpPressedTimeMs <= JUMP_BUFFER_MS;
      const inCoyoteWindow = this.player.grounded || this.nowMs - this.lastGroundedTimeMs <= COYOTE_TIME_MS;
      if (jumpBuffered && inCoyoteWindow) {
        this.player.vy = -JUMP_SPEED;
        this.player.grounded = false;
        this.lastJumpPressedTimeMs = -Infinity;
        this.lastGroundedTimeMs = -Infinity;
        this.sound?.playJump();
      }

      if (this.previousJumpHeld && !state.jumpHeld && this.player.vy < 0) {
        this.player.vy *= JUMP_CUT_MULTIPLIER;
      }
    } else {
      if (this.player.grounded) {
        this.player.vx = moveTowards(this.player.vx, 0, GROUND_FRICTION * delta);
      }

      this.emitDigParticlesWhileDigging(delta);
      this.digTimerSec -= delta;
      if (this.digTimerSec <= 0) {
        this.finishDig();
      }
    }

    this.player.vy += GRAVITY * delta;
    this.player.vy = Math.min(this.player.vy, TERMINAL_VELOCITY);

    this.moveHorizontal(delta, state);
    this.clampPlayerToWorldBounds();
    this.moveVertical(delta);
    this.player.grounded = this.checkGrounded();
    if (this.player.grounded) {
      this.lastGroundedTimeMs = this.nowMs;
    }

    this.updateEnemySpawning(delta);
    for (const enemy of this.enemies) {
      enemy.update(delta, this.currentLevel().platforms, GRAVITY, TERMINAL_VELOCITY, COLLISION_SKIN);
    }
    this.handlePlayerEnemyCollision(previousPlayerBottom);
    this.updateBonesAndParticles(delta);
    this.handleGoldenToyAndGate();
    this.updateCamera();
    this.updatePlayerAnimation(delta);

    this.player.animationTime += delta;
    this.previousJumpHeld = state.jumpHeld;
  }

  private moveHorizontal(delta: number, state: { left: boolean; right: boolean }): void {
    this.player.x += this.player.vx * delta;

    for (const platform of this.currentLevel().platforms) {
      if (!intersectsWithSkin(this.player, platform, COLLISION_SKIN)) {
        continue;
      }

      if (this.tryStepUp(state)) {
        continue;
      }

      if (this.player.vx > 0 && this.player.x + this.player.w > platform.x) {
        this.player.x = platform.x - this.player.w + COLLISION_SKIN;
      } else if (this.player.vx < 0) {
        this.player.x = platform.x + platform.w - COLLISION_SKIN;
      }

      this.player.vx = 0;
    }
  }

  private moveVertical(delta: number): void {
    this.player.y += this.player.vy * delta;

    for (const platform of this.currentLevel().platforms) {
      if (!intersectsWithSkin(this.player, platform, COLLISION_SKIN)) {
        continue;
      }

      if (this.player.vy > 0) {
        this.player.y = platform.y - this.player.h + COLLISION_SKIN;
      } else if (this.player.vy < 0) {
        this.player.y = platform.y + platform.h - COLLISION_SKIN;
      }

      this.player.vy = 0;
    }
  }

  private clampPlayerToWorldBounds(): void {
    const maxX = this.currentLevel().width - this.player.w;
    if (this.player.x < 0) {
      this.player.x = 0;
      this.player.vx = Math.max(0, this.player.vx);
    } else if (this.player.x > maxX) {
      this.player.x = maxX;
      this.player.vx = Math.min(0, this.player.vx);
    }
  }

  private tryStepUp(state: { left: boolean; right: boolean }): boolean {
    const movingIntoWall = (state.right && this.player.vx > 0) || (state.left && this.player.vx < 0);
    if (!this.player.grounded || !movingIntoWall) {
      return false;
    }

    const steppedRect: Rect = {
      x: this.player.x,
      y: this.player.y - STEP_UP_HEIGHT,
      w: this.player.w,
      h: this.player.h
    };

    const blockedAtSteppedHeight = this.currentLevel().platforms.some((platform) => intersectsWithSkin(steppedRect, platform, COLLISION_SKIN));
    if (blockedAtSteppedHeight) {
      return false;
    }

    this.player.y -= STEP_UP_HEIGHT;
    return true;
  }

  private handlePlayerEnemyCollision(previousPlayerBottom: number): void {
    for (let i = this.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = this.enemies[i];
      if (!enemy.isAlive()) {
        continue;
      }

      const enemyBody = enemy.getBody();
      if (!intersectsWithSkin(this.player, enemyBody, 0)) {
        continue;
      }

      const playerBottom = this.player.y + this.player.h;
      const isStomp =
        this.player.vy > 0 &&
        previousPlayerBottom <= enemyBody.y + STOMP_TOLERANCE &&
        playerBottom >= enemyBody.y;

      if (isStomp) {
        const stompResult = enemy.applyStomp();
        this.player.vy = -STOMP_BOUNCE_SPEED;
        this.player.grounded = false;
        this.lastGroundedTimeMs = -Infinity;
        this.sound?.playStomp();

        if (stompResult === "killed") {
          this.enemies.splice(i, 1);
          this.pendingRespawnTimers.push(this.randomRange(ENEMY_RESPAWN_DELAY_MIN_SEC, ENEMY_RESPAWN_DELAY_MAX_SEC));
        }
        return;
      }

      if (this.invincibleTimerSec > 0 || !enemy.canDamagePlayer()) {
        continue;
      }

      this.hearts = Math.max(0, this.hearts - 1);
      this.invincibleTimerSec = PLAYER_IFRAMES_SEC;

      const playerCenter = this.player.x + this.player.w / 2;
      const enemyCenter = enemyBody.x + enemyBody.w / 2;
      this.player.vx = playerCenter < enemyCenter ? -PLAYER_KNOCKBACK_X : PLAYER_KNOCKBACK_X;
      this.player.vy = -PLAYER_KNOCKBACK_Y;
      this.player.grounded = false;
      this.sound?.playHurt();

      if (this.hearts <= 0) {
        this.gameState = "gameOver";
        this.onGameOver?.();
      }
      return;
    }
  }

  private resetEnemyWave(): void {
    this.enemies = [];
    this.pendingRespawnTimers = [];
    this.spawnTimerSec = this.randomRange(ENEMY_SPAWN_INTERVAL_MIN_SEC, ENEMY_SPAWN_INTERVAL_MAX_SEC);
    this.spawnEnemyIfPossible();
  }

  private updateEnemySpawning(delta: number): void {
    this.spawnTimerSec -= delta;
    if (this.spawnTimerSec <= 0) {
      this.spawnEnemyIfPossible();
      this.spawnTimerSec = this.randomRange(ENEMY_SPAWN_INTERVAL_MIN_SEC, ENEMY_SPAWN_INTERVAL_MAX_SEC);
    }

    for (let i = this.pendingRespawnTimers.length - 1; i >= 0; i -= 1) {
      this.pendingRespawnTimers[i] -= delta;
      if (this.pendingRespawnTimers[i] <= 0) {
        const spawned = this.spawnEnemyIfPossible();
        if (spawned) {
          this.pendingRespawnTimers.splice(i, 1);
        } else {
          this.pendingRespawnTimers[i] = 1.0;
        }
      }
    }
  }

  private spawnEnemyIfPossible(): boolean {
    if (this.enemies.length >= MAX_ENEMIES_ALIVE) {
      return false;
    }

    const enemyType = this.pickEnemyType();
    const tempEnemy = createEnemy(enemyType, 0, 0);
    const enemySize = tempEnemy.getBody();

    const playerCenterX = this.player.x + this.player.w / 2;
    const shuffled = [...this.currentLevel().enemySpawnPoints].sort(() => Math.random() - 0.5);

    for (const spawnPoint of shuffled) {
      const candidateX = spawnPoint.x;
      const candidateY = spawnPoint.groundY - enemySize.h - 0.01;
      const candidate: CollisionRect = { x: candidateX, y: candidateY, w: enemySize.w, h: enemySize.h };
      const candidateCenterX = candidateX + candidate.w / 2;

      if (Math.abs(candidateCenterX - playerCenterX) < ENEMY_MIN_PLAYER_DISTANCE_X) {
        continue;
      }

      const tooCloseToEnemy = this.enemies.some((enemy) => {
        const body = enemy.getBody();
        const centerX = body.x + body.w / 2;
        return Math.abs(centerX - candidateCenterX) < ENEMY_MIN_SEPARATION_X;
      });
      if (tooCloseToEnemy) {
        continue;
      }

      const intersectsPlatform = this.currentLevel().platforms.some((platform) => intersectsWithSkin(candidate, platform, 0));
      if (intersectsPlatform) {
        continue;
      }

      const hasGroundBelow = this.currentLevel().platforms.some((platform) => {
        const footX = candidate.x + candidate.w / 2;
        const footY = candidate.y + candidate.h + 2;
        const withinX = footX >= platform.x && footX <= platform.x + platform.w;
        const nearY = footY >= platform.y && footY <= platform.y + platform.h + 2;
        return withinX && nearY;
      });
      if (!hasGroundBelow) {
        continue;
      }

      const facing: 1 | -1 = candidateCenterX > playerCenterX ? -1 : 1;
      const enemy = createEnemy(enemyType, candidate.x, candidate.y, facing);
      this.enemies.push(enemy);
      this.emitEnemySpawnPoof(enemy.getBody());
      return true;
    }

    return false;
  }

  private pickEnemyType(): EnemyType {
    const roll = Math.random();
    let cursor = 0;
    for (const entry of ENEMY_TYPE_WEIGHTS) {
      cursor += entry.weight;
      if (roll <= cursor) {
        return entry.type;
      }
    }
    return "rat";
  }

  private randomRange(min: number, max: number): number {
    return min + Math.random() * (max - min);
  }

  private emitEnemySpawnPoof(spawnRect: CollisionRect): void {
    const count = Math.floor(this.randomRange(ENEMY_SPAWN_POOF_MIN_PARTICLES, ENEMY_SPAWN_POOF_MAX_PARTICLES + 1));
    const centerX = spawnRect.x + spawnRect.w / 2;
    const centerY = spawnRect.y + spawnRect.h - 2;

    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = this.randomRange(22, 70);
      const size = Math.random() < 0.5 ? 2 : 3;
      const life = this.randomRange(0.25, 0.35);
      this.pushDigParticle({
        x: centerX + Math.cos(angle) * 2,
        y: centerY + Math.sin(angle) * 1.5,
        w: size,
        h: size,
        vx: clamp(Math.cos(angle) * speed, -60, 60),
        vy: clamp(Math.sin(angle) * speed - 80, -120, -40),
        lifeSec: life,
        maxLifeSec: life,
        colorRgb: ENEMY_SPAWN_POOF_COLOR
      });
    }
  }

  private handleGoldenToyAndGate(): void {
    if (!this.goldenToy.collected && intersectsWithSkin(this.player, this.goldenToy, 0)) {
      this.goldenToy.collected = true;
      this.hasGoldenToy = true;
      this.sound?.playGoldenToyPickup();
      this.sound?.playGateUnlock();
    }

    if (!intersectsWithSkin(this.player, this.exitGate, 0)) {
      return;
    }

    if (!this.hasGoldenToy) {
      this.gateHintTimerSec = Math.max(this.gateHintTimerSec, GATE_LOCKED_HINT_SEC);
      return;
    }

    this.gameState = "levelComplete";
    this.sound?.playLevelComplete();
    this.onLevelComplete?.({
      bonesCollected: this.bonesCollected,
      heartsRemaining: this.hearts,
      timeSec: this.elapsedSec,
      levelName: this.currentLevel().name,
      hasNextLevel: this.hasNextLevel()
    });
  }

  private updateBonesAndParticles(delta: number): void {
    for (const bone of this.bones) {
      if (!bone.active) {
        continue;
      }

      if (bone.state === "popping") {
        bone.popTimerSec += delta;
        bone.vy += BONE_POP_GRAVITY * delta;
        bone.y += bone.vy * delta;

        if (bone.popTimerSec < BONE_POP_DURATION_SEC * 0.75) {
          bone.y = Math.max(bone.targetY, bone.y);
        } else {
          bone.y = Math.min(bone.settleY, Math.max(bone.targetY, bone.y));
        }

        if (bone.popTimerSec >= BONE_POP_DURATION_SEC) {
          bone.state = "idle";
          bone.y = bone.settleY;
          bone.vy = 0;
        }
      }

      if (bone.state === "idle" && intersectsWithSkin(this.player, bone, 0)) {
        bone.active = false;
        this.bonesCollected += 1;
        this.sound?.playBonePickup();
      }
    }

    for (let i = this.digParticles.length - 1; i >= 0; i -= 1) {
      const particle = this.digParticles[i];
      particle.lifeSec -= delta;

      if (particle.lifeSec <= 0) {
        this.digParticles.splice(i, 1);
        continue;
      }

      particle.x += particle.vx * delta;
      particle.y += particle.vy * delta;
      particle.vy += DIG_PARTICLE_GRAVITY * delta;
    }
  }

  private finishDig(): void {
    this.playerState = "normal";
    this.sound?.playDig();

    if (this.activeDigSpotIndex === null) {
      return;
    }

    const spot = this.digSpots[this.activeDigSpotIndex];
    this.activeDigSpotIndex = null;

    if (!spot || spot.dug) {
      return;
    }

    spot.dug = true;
    if (spot.hasBone) {
      this.spawnBoneFromSpot(spot);
    } else {
      this.spawnEmptyDigPuff(spot);
    }
  }

  private spawnBoneFromSpot(spot: DigSpot): void {
    const boneWidth = 8;
    const boneHeight = 6;
    const groundY = spot.y + spot.h;
    const startY = groundY - 4;
    const targetY = groundY - 12;
    const settleY = targetY + BONE_SETTLE_RANGE;

    this.bones.push({
      x: spot.x + (spot.w - boneWidth) / 2,
      y: startY,
      w: boneWidth,
      h: boneHeight,
      active: true,
      vy: BONE_POP_INITIAL_VY,
      state: "popping",
      popTimerSec: 0,
      startY,
      targetY,
      settleY
    });
  }

  private spawnEmptyDigPuff(spot: DigSpot): void {
    const centerX = spot.x + spot.w / 2;
    const centerY = spot.y + 1;
    const particleCount = 3 + Math.floor((spot.x + spot.y) % 4);

    for (let i = 0; i < particleCount; i += 1) {
      const spread = i - (particleCount - 1) / 2;
      this.pushDigParticle({
        x: centerX + spread * 2,
        y: centerY,
        w: 3,
        h: 3,
        vx: spread * 16,
        vy: -45 - Math.abs(spread) * 5,
        lifeSec: DIG_PARTICLE_LIFE_SEC,
        maxLifeSec: DIG_PARTICLE_LIFE_SEC,
        colorRgb: "120, 78, 42"
      });
    }
  }

  private emitDigParticlesWhileDigging(delta: number): void {
    if (this.activeDigSpotIndex === null) {
      return;
    }

    const spot = this.digSpots[this.activeDigSpotIndex];
    if (!spot) {
      return;
    }

    this.digEmitTimerSec -= delta;
    while (this.digEmitTimerSec <= 0) {
      this.digEmitTimerSec += DIG_PARTICLE_EMIT_INTERVAL_SEC;
      const burstCount = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < burstCount; i += 1) {
        const size = Math.random() < 0.5 ? 2 : 3;
        const life = lerp(DIG_PARTICLE_LIFE_MIN_SEC, DIG_PARTICLE_LIFE_MAX_SEC, Math.random());
        this.pushDigParticle({
          x: spot.x + spot.w * (0.25 + Math.random() * 0.5),
          y: spot.y + spot.h - 1,
          w: size,
          h: size,
          vx: lerp(-40, 40, Math.random()),
          vy: lerp(-120, -60, Math.random()),
          lifeSec: life,
          maxLifeSec: life,
          colorRgb: "120, 78, 42"
        });
      }
    }
  }

  private pushDigParticle(particle: DigParticle): void {
    this.digParticles.push(particle);
    if (this.digParticles.length > DIG_PARTICLE_MAX_COUNT) {
      this.digParticles.splice(0, this.digParticles.length - DIG_PARTICLE_MAX_COUNT);
    }
  }

  private findDigSpotForPlayer(): number | null {
    for (let i = 0; i < this.digSpots.length; i += 1) {
      const spot = this.digSpots[i];
      if (spot.dug) {
        continue;
      }

      if (intersectsWithSkin(this.player, spot, 0)) {
        return i;
      }
    }

    return null;
  }

  private generateDigSpots(levelSeed: string): DigSpot[] {
    const ground = getMainGroundPlatform(this.currentLevel().platforms);
    const rng = createSeededRng(levelSeed);

    const count = DIG_SPOT_MIN_COUNT + Math.floor(rng() * (DIG_SPOT_MAX_COUNT - DIG_SPOT_MIN_COUNT + 1));
    const minX = Math.max(
      ground.x + Math.floor(this.currentLevel().width * DIG_START_MIN_X_FACTOR),
      ground.x + DIG_MIN_DISTANCE_FROM_START
    );
    const maxX = ground.x + ground.w - DIG_SPOT_WIDTH - 2;

    const spots: DigSpot[] = [];
    let attempts = 0;

    while (spots.length < count && attempts < 300) {
      attempts += 1;
      const x = Math.floor(lerp(minX, maxX, rng()));
      const centerX = x + DIG_SPOT_WIDTH / 2;

      const tooCloseToEnemySpawn = this.currentLevel().enemySpawnPoints.some((spawn) => Math.abs(centerX - spawn.x) < DIG_MIN_DISTANCE_FROM_ENEMY);
      if (tooCloseToEnemySpawn) {
        continue;
      }

      const tooCloseToOtherSpot = spots.some(
        (spot) => Math.abs(centerX - (spot.x + spot.w / 2)) < DIG_MIN_SPOT_SPACING
      );
      if (tooCloseToOtherSpot) {
        continue;
      }

      const spotY = ground.y - DIG_SPOT_HEIGHT;
      const candidate: DigSpot = {
        x,
        y: spotY,
        w: DIG_SPOT_WIDTH,
        h: DIG_SPOT_HEIGHT,
        dug: false,
        hasBone: rng() < DIG_BONE_CHANCE,
        dirtDecor: createSpotDirtDecor(`${levelSeed}:${x}:${spotY}`)
      };

      if (!isValidDigSpot(candidate, this.currentLevel().platforms)) {
        continue;
      }

      spots.push(candidate);
    }

    return spots;
  }

  private render(): void {
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

    this.ctx.fillStyle = this.currentLevel().backgroundColor;
    this.ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

    this.ctx.save();
    this.ctx.translate(-this.camera.x, -this.camera.y);

    this.ctx.fillStyle = "#669f5d";
    for (const platform of this.currentLevel().platforms) {
      this.ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
    }

    this.drawExitGate();
    this.drawGoldenToy();
    this.drawDigSpots();
    this.drawBones();
    this.drawDigParticles();
    for (const enemy of this.enemies) {
      enemy.draw(this.ctx);
    }
    this.drawPlayer();
    this.ctx.restore();

    this.drawHud();
    if (this.gateHintTimerSec > 0) {
      this.drawGateHint();
    }
    if (this.levelTitleTimerSec > 0) {
      this.drawLevelTitle();
    }
    if (this.debugEnabled) {
      this.drawDebug();
    }
  }

  private drawExitGate(): void {
    const unlocked = this.hasGoldenToy;
    const pulse = 0.75 + Math.sin(this.nowMs * 0.01) * 0.25;

    this.ctx.fillStyle = unlocked ? `rgba(76, 178, 89, ${pulse.toFixed(3)})` : "#6d5f67";
    this.ctx.fillRect(this.exitGate.x, this.exitGate.y, this.exitGate.w, this.exitGate.h);

    this.ctx.fillStyle = unlocked ? "#c8f3ce" : "#a99ca4";
    const bars = 3;
    for (let i = 0; i < bars; i += 1) {
      const x = this.exitGate.x + 3 + i * 4;
      this.ctx.fillRect(x, this.exitGate.y + 3, 2, this.exitGate.h - 6);
    }

    this.ctx.strokeStyle = "#283040";
    this.ctx.strokeRect(this.exitGate.x, this.exitGate.y, this.exitGate.w, this.exitGate.h);
  }

  private drawGoldenToy(): void {
    if (this.goldenToy.collected) {
      return;
    }

    const pulseScale = 1 + Math.sin(this.nowMs * 0.012) * 0.1;
    const drawW = this.goldenToy.w * pulseScale;
    const drawH = this.goldenToy.h * pulseScale;
    const drawX = this.goldenToy.x - (drawW - this.goldenToy.w) / 2;
    const drawY = this.goldenToy.y - (drawH - this.goldenToy.h) / 2;

    this.ctx.fillStyle = "#f5cb42";
    this.ctx.fillRect(drawX, drawY, drawW, drawH);
    this.ctx.fillStyle = "#fff2b8";
    this.ctx.fillRect(drawX + 2, drawY + 2, Math.max(1, drawW - 4), Math.max(1, drawH - 4));
    this.ctx.strokeStyle = "#a87f18";
    this.ctx.strokeRect(drawX, drawY, drawW, drawH);
  }

  private drawDigSpots(): void {
    for (let i = 0; i < this.digSpots.length; i += 1) {
      const spot = this.digSpots[i];
      const isActiveDigSpot = this.activeDigSpotIndex === i && this.playerState === "digging";

      this.ctx.fillStyle = spot.dug ? "#8b7657" : "#56724a";
      this.ctx.fillRect(spot.x, spot.y, spot.w, spot.h);

      if (!spot.dug) {
        this.ctx.fillStyle = isActiveDigSpot ? "#d7c086" : "#8ca574";
        this.ctx.fillRect(spot.x + 2, spot.y + 1, 2, 2);
        this.ctx.fillRect(spot.x + spot.w - 4, spot.y + 1, 2, 2);
      } else {
        this.ctx.fillStyle = "#3f3c34";
        this.ctx.fillRect(spot.x + 2, spot.y + 2, spot.w - 4, 2);
        this.drawDugSpotDecor(spot);
      }

      if (this.debugEnabled) {
        this.ctx.strokeStyle = "rgba(255, 255, 0, 0.8)";
        this.ctx.strokeRect(spot.x, spot.y, spot.w, spot.h);
      }
    }
  }

  private drawDugSpotDecor(spot: DigSpot): void {
    const shades = ["#7f6948", "#6f5b3f", "#8d7450"];
    for (const tri of spot.dirtDecor) {
      const x = spot.x + tri.xOffset;
      const y = spot.y + tri.yOffset;
      const size = tri.size;
      const dir = tri.flipX ? -1 : 1;

      this.ctx.fillStyle = shades[tri.shadeIndex % shades.length];
      this.ctx.beginPath();
      this.ctx.moveTo(x, y);
      this.ctx.lineTo(x + dir * size, y + 1);
      this.ctx.lineTo(x, y + size);
      this.ctx.closePath();
      this.ctx.fill();
    }
  }

  private drawBones(): void {
    for (const bone of this.bones) {
      if (!bone.active) {
        continue;
      }

      this.ctx.fillStyle = "#ffffff";
      this.ctx.fillRect(bone.x, bone.y, bone.w, bone.h);
      this.ctx.strokeStyle = "#d8d8d8";
      this.ctx.strokeRect(bone.x, bone.y, bone.w, bone.h);
    }
  }

  private drawDigParticles(): void {
    for (const particle of this.digParticles) {
      const alpha = clamp(particle.lifeSec / particle.maxLifeSec, 0, 1);
      this.ctx.fillStyle = `rgba(${particle.colorRgb}, ${alpha.toFixed(3)})`;
      this.ctx.fillRect(particle.x, particle.y, particle.w, particle.h);
    }
  }

  private drawPlayer(): void {
    this.ctx.save();

    if (this.invincibleTimerSec > 0 && Math.floor(this.nowMs / 80) % 2 === 0) {
      this.ctx.globalAlpha = 0.35;
    }

    const drawX = this.player.x - 4;
    const drawY = this.player.y - 8;
    const drawW = 24;
    const drawH = 24;

    if (this.player.facing === -1) {
      this.ctx.translate(drawX + drawW, drawY);
      this.ctx.scale(-1, 1);
    } else {
      this.ctx.translate(drawX, drawY);
    }

    if (this.playerSpriteReady) {
      const frame = this.getCurrentPlayerFrame();
      this.ctx.drawImage(this.playerSpriteImage, frame.x, frame.y, frame.w, frame.h, 0, 0, drawW, drawH);
    } else {
      this.ctx.fillStyle = this.playerState === "digging" ? "#3b4659" : "#2f4f6f";
      this.ctx.fillRect(4, 8, this.player.w, this.player.h);
      this.ctx.fillStyle = "#ffffff";
      this.ctx.fillRect(15, 12, 2, 2);
    }

    this.ctx.restore();
  }

  private updatePlayerAnimation(delta: number): void {
    const nextAnimation: PlayerAnimationName =
      this.playerState === "digging"
        ? "digging"
        : !this.player.grounded
          ? "jump"
          : Math.abs(this.player.vx) > 18
            ? "run"
            : "idle";

    if (nextAnimation !== this.currentPlayerAnimation) {
      this.currentPlayerAnimation = nextAnimation;
      this.playerAnimationFrameIndex = 0;
      this.playerAnimationFrameElapsed = 0;
    }

    const frames = this.playerAnimations[this.currentPlayerAnimation];
    if (frames.length <= 1) {
      return;
    }

    this.playerAnimationFrameElapsed += delta;
    while (this.playerAnimationFrameElapsed >= frames[this.playerAnimationFrameIndex].duration) {
      this.playerAnimationFrameElapsed -= frames[this.playerAnimationFrameIndex].duration;
      if (this.playerAnimationFrameIndex < frames.length - 1) {
        this.playerAnimationFrameIndex += 1;
      } else {
        this.playerAnimationFrameIndex = 0;
      }
    }
  }

  private getCurrentPlayerFrame(): Frame {
    const frames = this.playerAnimations[this.currentPlayerAnimation];
    return frames[this.playerAnimationFrameIndex] ?? frames[0];
  }

  private drawHud(): void {
    this.ctx.fillStyle = "rgba(12, 24, 40, 0.72)";
    this.ctx.fillRect(6, 6, 174, 46);

    this.ctx.font = "10px monospace";
    this.ctx.fillStyle = "#f7f3c5";
    this.ctx.fillText("HP", 11, 18);

    for (let i = 0; i < MAX_HEARTS; i += 1) {
      const x = 30 + i * 16;
      const filled = i < this.hearts;
      this.ctx.fillStyle = filled ? "#da4f5d" : "#4b5968";
      this.ctx.fillRect(x, 10, 10, 10);
      this.ctx.strokeStyle = "#81252f";
      this.ctx.strokeRect(x, 10, 10, 10);
    }

    this.ctx.fillStyle = "#f7f3c5";
    this.ctx.fillText(`Bones: ${this.bonesCollected}`, 11, 31);
    this.ctx.fillText(`Toy: ${this.hasGoldenToy ? "1/1" : "0/1"}`, 11, 44);
  }

  private drawGateHint(): void {
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    this.ctx.fillRect(96, 8, 128, 18);
    this.ctx.fillStyle = "#f9e7b8";
    this.ctx.font = "9px monospace";
    this.ctx.fillText("Find the Golden Toy", 105, 20);
  }

  private drawLevelTitle(): void {
    const alpha = clamp(this.levelTitleTimerSec / 1.5, 0, 1);
    this.ctx.fillStyle = `rgba(10, 15, 25, ${(0.62 * alpha).toFixed(3)})`;
    this.ctx.fillRect(88, 28, 144, 24);
    this.ctx.fillStyle = `rgba(246, 240, 214, ${alpha.toFixed(3)})`;
    this.ctx.font = "10px monospace";
    this.ctx.fillText(this.currentLevel().name, 96, 43);
  }

  private drawDebug(): void {
    const coyoteRemaining = Math.max(0, COYOTE_TIME_MS - (this.nowMs - this.lastGroundedTimeMs));
    const jumpBufferRemaining = Math.max(0, JUMP_BUFFER_MS - (this.nowMs - this.lastJumpPressedTimeMs));
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    this.ctx.fillRect(6, 56, 206, 86);
    this.ctx.fillStyle = "#d7f3ff";
    this.ctx.font = "9px monospace";
    this.ctx.fillText(`GS:${this.gameState} G:${this.player.grounded ? 1 : 0} H:${this.hearts} B:${this.bonesCollected}`, 10, 68);
    this.ctx.fillText(`Toy:${this.hasGoldenToy ? 1 : 0} CamX:${this.camera.x.toFixed(1)}`, 10, 80);
    this.ctx.fillText(`State:${this.playerState} DigT:${Math.max(0, this.digTimerSec).toFixed(2)}`, 10, 92);
    this.ctx.fillText(`VX:${this.player.vx.toFixed(1)} VY:${this.player.vy.toFixed(1)}`, 10, 104);
    this.ctx.fillText(`Coyote:${coyoteRemaining.toFixed(0)}ms`, 10, 116);
    this.ctx.fillText(`Buffer:${jumpBufferRemaining.toFixed(0)}ms`, 10, 128);
  }

  private checkGrounded(): boolean {
    const probe: Rect = {
      x: this.player.x,
      y: this.player.y + 1,
      w: this.player.w,
      h: this.player.h
    };

    return this.currentLevel().platforms.some((platform) => intersectsWithSkin(probe, platform, COLLISION_SKIN));
  }

  private updateCamera(): void {
    const maxCameraX = Math.max(0, this.currentLevel().width - INTERNAL_WIDTH);
    const desiredX = this.player.x - CAMERA_PLAYER_SCREEN_X;
    this.camera.x = clamp(desiredX, 0, maxCameraX);
    this.camera.y = 0;
  }

  private currentLevel(): LevelDefinition {
    return LEVELS[this.levelIndex];
  }

  private resizeCanvas(): void {
    const availableWidth = window.innerWidth - 24;
    const availableHeight = window.innerHeight - 150;
    const scale = Math.max(1, Math.floor(Math.min(availableWidth / INTERNAL_WIDTH, availableHeight / INTERNAL_HEIGHT)));

    this.canvas.style.width = `${INTERNAL_WIDTH * scale}px`;
    this.canvas.style.height = `${INTERNAL_HEIGHT * scale}px`;
  }
}

function intersectsWithSkin(a: CollisionRect, b: CollisionRect, skin: number): boolean {
  return (
    a.x + skin < b.x + b.w &&
    a.x + a.w - skin > b.x &&
    a.y + skin < b.y + b.h &&
    a.y + a.h - skin > b.y
  );
}

function isValidDigSpot(spot: DigSpot, platforms: Rect[]): boolean {
  const groundProbe: Rect = {
    x: spot.x + 2,
    y: spot.y + spot.h,
    w: Math.max(1, spot.w - 4),
    h: 3
  };

  const overlapsFloatingPlatform = platforms.some(
    (platform) => platform.y < 160 && intersectsWithSkin(spot, platform, 0)
  );
  if (overlapsFloatingPlatform) {
    return false;
  }

  return platforms.some((platform) => platform.y >= 160 && intersectsWithSkin(groundProbe, platform, 0));
}

function getMainGroundPlatform(platforms: Rect[]): Rect {
  let best = platforms[0];
  for (const platform of platforms) {
    if (platform.y > best.y) {
      best = platform;
    }
  }
  return best;
}

function createSeededRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }

  return mulberry32(h >>> 0);
}

function createSpotDirtDecor(seed: string): DirtDecorTriangle[] {
  const rng = createSeededRng(seed);
  const count = 3 + Math.floor(rng() * 3);
  const decor: DirtDecorTriangle[] = [];

  for (let i = 0; i < count; i += 1) {
    const onLeft = i % 2 === 0;
    decor.push({
      xOffset: onLeft ? 1 + Math.floor(rng() * 4) : DIG_SPOT_WIDTH - 2 - Math.floor(rng() * 4),
      yOffset: 1 + Math.floor(rng() * 4),
      size: 2 + Math.floor(rng() * 3),
      shadeIndex: Math.floor(rng() * 3),
      flipX: !onLeft
    });
  }

  return decor;
}

function mulberry32(a: number): () => number {
  return () => {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function lerp(min: number, max: number, t: number): number {
  return min + (max - min) * t;
}

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }
  return current + Math.sign(target - current) * maxDelta;
}

function createPlaceholderPlayerSpriteSheet(): {
  image: HTMLImageElement;
  animations: Record<PlayerAnimationName, Frame[]>;
} {
  const frameSize = 24;
  const cols = 4;
  const rows = 3;
  const sheet = document.createElement("canvas");
  sheet.width = cols * frameSize;
  sheet.height = rows * frameSize;
  const ctx = sheet.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to create placeholder sprite sheet");
  }

  const drawDog = (col: number, row: number, variant: "idleA" | "idleB" | "runA" | "runB" | "runC" | "runD" | "jump" | "digA" | "digB"): void => {
    const x = col * frameSize;
    const y = row * frameSize;
    ctx.clearRect(x, y, frameSize, frameSize);

    const outline = "#1b1513";
    const maskDark = "#2a1d1a";
    const coatDark = "#3a2a22";
    const coatMid = "#5a3e2f";
    const cream = "#d8bf92";
    const creamLight = "#f0dfbe";
    const dirt = "#7f5b38";

    const isRun = variant === "runA" || variant === "runB" || variant === "runC" || variant === "runD";
    const isDig = variant === "digA" || variant === "digB";
    const isJump = variant === "jump";
    const isIdleB = variant === "idleB";

    const headX = x + 11;
    const headY = y + (isIdleB ? 6 : 7);
    const bodyX = x + 7;
    const bodyY = y + (isRun ? 11 : 12);

    // Tail plume (slight sway/trail by frame).
    const tailOffsetY = variant === "runA" || variant === "runD" ? -1 : variant === "runB" || variant === "runC" ? 0 : isIdleB ? -1 : 0;
    const tailOffsetX = variant === "runC" ? -1 : 0;
    ctx.fillStyle = outline;
    ctx.fillRect(x + 3 + tailOffsetX, y + 8 + tailOffsetY, 4, 7);
    ctx.fillStyle = coatMid;
    ctx.fillRect(x + 4 + tailOffsetX, y + 8 + tailOffsetY, 3, 6);
    ctx.fillStyle = cream;
    ctx.fillRect(x + 4 + tailOffsetX, y + 8 + tailOffsetY, 2, 2);

    // Body and back.
    ctx.fillStyle = outline;
    ctx.fillRect(bodyX, bodyY, 12, 8);
    ctx.fillStyle = coatDark;
    ctx.fillRect(bodyX + 1, bodyY, 10, 7);
    ctx.fillStyle = coatMid;
    ctx.fillRect(bodyX + 2, bodyY + 3, 8, 4);

    // Head (slightly larger heroic puppy head).
    ctx.fillStyle = outline;
    ctx.fillRect(headX, headY, 9, 8);
    ctx.fillStyle = coatDark;
    ctx.fillRect(headX + 1, headY + 1, 7, 6);

    // Pointy ears.
    const earTwitch = isIdleB ? -1 : 0;
    ctx.fillStyle = outline;
    ctx.fillRect(headX + 1, headY - 2 + earTwitch, 2, 2);
    ctx.fillRect(headX + 6, headY - 3, 2, 3);
    ctx.fillStyle = cream;
    ctx.fillRect(headX + 2, headY - 1 + earTwitch, 1, 1);
    ctx.fillRect(headX + 6, headY - 1, 1, 1);

    // Dark mask and cream markings.
    ctx.fillStyle = maskDark;
    ctx.fillRect(headX + 3, headY + 2, 5, 4);
    ctx.fillStyle = cream;
    ctx.fillRect(headX + 4, headY + 1, 1, 1); // eyebrow L
    ctx.fillRect(headX + 6, headY + 1, 1, 1); // eyebrow R
    ctx.fillRect(headX + 6, headY + 4, 2, 2); // muzzle
    ctx.fillStyle = creamLight;
    ctx.fillRect(headX + 6, headY + 3, 1, 1);

    // Cream chest fluff.
    ctx.fillStyle = cream;
    ctx.fillRect(bodyX + 8, bodyY + 5, 4, 3);
    ctx.fillStyle = creamLight;
    ctx.fillRect(bodyX + 9, bodyY + 5, 2, 2);

    // Legs by animation.
    ctx.fillStyle = outline;
    if (variant === "runA") {
      ctx.fillRect(bodyX + 1, bodyY + 7, 2, 2);
      ctx.fillRect(bodyX + 7, bodyY + 6, 2, 3);
    } else if (variant === "runB") {
      ctx.fillRect(bodyX + 2, bodyY + 6, 2, 3);
      ctx.fillRect(bodyX + 8, bodyY + 7, 2, 2);
    } else if (variant === "runC") {
      ctx.fillRect(bodyX + 1, bodyY + 6, 2, 3);
      ctx.fillRect(bodyX + 8, bodyY + 7, 2, 2);
    } else if (variant === "runD") {
      ctx.fillRect(bodyX + 2, bodyY + 7, 2, 2);
      ctx.fillRect(bodyX + 7, bodyY + 6, 2, 3);
    } else if (isJump) {
      ctx.fillRect(bodyX + 2, bodyY + 6, 2, 2);
      ctx.fillRect(bodyX + 8, bodyY + 6, 2, 2);
    } else if (isDig) {
      ctx.fillRect(bodyX + 2, bodyY + 7, 2, 2);
      ctx.fillRect(bodyX + 8, bodyY + 7, 2, 2);
      ctx.fillStyle = dirt;
      ctx.fillRect(x + 5, y + 20, 14, 3);
      if (variant === "digB") {
        ctx.fillRect(x + 4, y + 19, 2, 2);
        ctx.fillRect(x + 18, y + 19, 2, 2);
      }
    } else {
      ctx.fillRect(bodyX + 2, bodyY + 7, 2, 2);
      ctx.fillRect(bodyX + 8, bodyY + 7, 2, 2);
    }
  };

  drawDog(0, 0, "idleA");
  drawDog(1, 0, "idleB");
  drawDog(2, 0, "idleA");
  drawDog(3, 0, "idleB");

  drawDog(0, 1, "runA");
  drawDog(1, 1, "runB");
  drawDog(2, 1, "runC");
  drawDog(3, 1, "runD");

  drawDog(0, 2, "jump");
  drawDog(1, 2, "digA");
  drawDog(2, 2, "digB");
  drawDog(3, 2, "idleA");

  const frame = (col: number, row: number, duration: number): Frame => ({
    x: col * frameSize,
    y: row * frameSize,
    w: frameSize,
    h: frameSize,
    duration
  });

  const animations: Record<PlayerAnimationName, Frame[]> = {
    idle: [frame(0, 0, 0.16), frame(1, 0, 0.16), frame(2, 0, 0.16), frame(3, 0, 0.16)],
    run: [frame(0, 1, 0.1), frame(1, 1, 0.1), frame(2, 1, 0.1), frame(3, 1, 0.1)],
    jump: [frame(0, 2, 0.2)],
    digging: [frame(1, 2, 0.12), frame(2, 2, 0.12)]
  };

  const image = new Image();
  image.src = sheet.toDataURL("image/png");
  return { image, animations };
}
