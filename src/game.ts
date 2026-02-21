import { Enemy, type CollisionRect } from "./enemy";
import type { Input } from "./input";

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

type PlayerActionState = "normal" | "digging";
type GameState = "playing" | "gameOver" | "levelComplete";

interface LevelCompleteStats {
  bonesCollected: number;
  heartsRemaining: number;
  timeSec: number;
}

interface GameCallbacks {
  onGameOver?: () => void;
  onLevelComplete?: (stats: LevelCompleteStats) => void;
}

const INTERNAL_WIDTH = 320;
const INTERNAL_HEIGHT = 180;
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

const GATE_LOCKED_HINT_SEC = 1.5;

const PLAYER_START_X = 16;
const PLAYER_START_Y = 40;

const LEVEL_PLATFORMS: Rect[] = [
  { x: 0, y: 164, w: 320, h: 16 },
  { x: 52, y: 128, w: 72, h: 10 },
  { x: 160, y: 102, w: 62, h: 10 },
  { x: 250, y: 138, w: 56, h: 10 }
];

const ENEMY_SPAWN = { x: 78, y: 116 };
const TOY_SPAWN: GoldenToy = { x: 186, y: 88, w: 8, h: 8, collected: false };
const EXIT_GATE: ExitGate = { x: 292, y: 132, w: 18, h: 32 };

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input: Input;
  private readonly onGameOver?: () => void;
  private readonly onLevelComplete?: (stats: LevelCompleteStats) => void;
  private readonly enemy: Enemy;

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

  private playerState: PlayerActionState = "normal";
  private digTimerSec = 0;
  private activeDigSpotIndex: number | null = null;
  private digSpots: DigSpot[] = [];
  private bones: BoneCollectible[] = [];
  private digParticles: DigParticle[] = [];
  private digEmitTimerSec = 0;

  private goldenToy: GoldenToy = { ...TOY_SPAWN };
  private hasGoldenToy = false;
  private gateHintTimerSec = 0;

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
    this.enemy = new Enemy(ENEMY_SPAWN);
    this.digSpots = this.generateDigSpots("level1");

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

    this.enemy.reset();
    this.digSpots = this.generateDigSpots("level1");
    this.bones = [];
    this.digParticles = [];

    this.goldenToy = { ...TOY_SPAWN, collected: false };
    this.hasGoldenToy = false;
    this.gateHintTimerSec = 0;
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
    this.moveVertical(delta);
    this.player.grounded = this.checkGrounded();
    if (this.player.grounded) {
      this.lastGroundedTimeMs = this.nowMs;
    }

    this.enemy.update(delta, LEVEL_PLATFORMS, GRAVITY, TERMINAL_VELOCITY, COLLISION_SKIN);
    this.handlePlayerEnemyCollision(previousPlayerBottom);
    this.updateBonesAndParticles(delta);
    this.handleGoldenToyAndGate();

    this.player.animationTime += delta;
    this.previousJumpHeld = state.jumpHeld;
  }

  private moveHorizontal(delta: number, state: { left: boolean; right: boolean }): void {
    this.player.x += this.player.vx * delta;

    for (const platform of LEVEL_PLATFORMS) {
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

    for (const platform of LEVEL_PLATFORMS) {
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

    const blockedAtSteppedHeight = LEVEL_PLATFORMS.some((platform) => intersectsWithSkin(steppedRect, platform, COLLISION_SKIN));
    if (blockedAtSteppedHeight) {
      return false;
    }

    this.player.y -= STEP_UP_HEIGHT;
    return true;
  }

  private handlePlayerEnemyCollision(previousPlayerBottom: number): void {
    if (!this.enemy.isAlive()) {
      return;
    }

    const enemyBody = this.enemy.getBody();
    if (!intersectsWithSkin(this.player, enemyBody, 0)) {
      return;
    }

    const playerBottom = this.player.y + this.player.h;
    const isStomp =
      this.player.vy > 0 &&
      previousPlayerBottom <= enemyBody.y + STOMP_TOLERANCE &&
      playerBottom >= enemyBody.y;

    if (isStomp) {
      this.enemy.kill();
      this.player.vy = -STOMP_BOUNCE_SPEED;
      this.player.grounded = false;
      this.lastGroundedTimeMs = -Infinity;
      return;
    }

    if (this.invincibleTimerSec > 0) {
      return;
    }

    this.hearts = Math.max(0, this.hearts - 1);
    this.invincibleTimerSec = PLAYER_IFRAMES_SEC;

    const playerCenter = this.player.x + this.player.w / 2;
    const enemyCenter = enemyBody.x + enemyBody.w / 2;
    this.player.vx = playerCenter < enemyCenter ? -PLAYER_KNOCKBACK_X : PLAYER_KNOCKBACK_X;
    this.player.vy = -PLAYER_KNOCKBACK_Y;
    this.player.grounded = false;

    if (this.hearts <= 0) {
      this.gameState = "gameOver";
      this.onGameOver?.();
    }
  }

  private handleGoldenToyAndGate(): void {
    if (!this.goldenToy.collected && intersectsWithSkin(this.player, this.goldenToy, 0)) {
      this.goldenToy.collected = true;
      this.hasGoldenToy = true;
    }

    if (!intersectsWithSkin(this.player, EXIT_GATE, 0)) {
      return;
    }

    if (!this.hasGoldenToy) {
      this.gateHintTimerSec = Math.max(this.gateHintTimerSec, GATE_LOCKED_HINT_SEC);
      return;
    }

    this.gameState = "levelComplete";
    this.onLevelComplete?.({
      bonesCollected: this.bonesCollected,
      heartsRemaining: this.hearts,
      timeSec: this.elapsedSec
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
        maxLifeSec: DIG_PARTICLE_LIFE_SEC
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
          maxLifeSec: life
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
    const ground = getMainGroundPlatform();
    const rng = createSeededRng(levelSeed);

    const count = DIG_SPOT_MIN_COUNT + Math.floor(rng() * (DIG_SPOT_MAX_COUNT - DIG_SPOT_MIN_COUNT + 1));
    const minX = Math.max(
      ground.x + Math.floor(INTERNAL_WIDTH * DIG_START_MIN_X_FACTOR),
      ground.x + DIG_MIN_DISTANCE_FROM_START
    );
    const maxX = ground.x + ground.w - DIG_SPOT_WIDTH - 2;

    const spots: DigSpot[] = [];
    let attempts = 0;

    while (spots.length < count && attempts < 300) {
      attempts += 1;
      const x = Math.floor(lerp(minX, maxX, rng()));
      const centerX = x + DIG_SPOT_WIDTH / 2;

      if (Math.abs(centerX - ENEMY_SPAWN.x) < DIG_MIN_DISTANCE_FROM_ENEMY) {
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

      if (!isValidDigSpot(candidate, LEVEL_PLATFORMS)) {
        continue;
      }

      spots.push(candidate);
    }

    return spots;
  }

  private render(): void {
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.clearRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

    this.ctx.fillStyle = "#8bd3ff";
    this.ctx.fillRect(0, 0, INTERNAL_WIDTH, INTERNAL_HEIGHT);

    this.ctx.fillStyle = "#669f5d";
    for (const platform of LEVEL_PLATFORMS) {
      this.ctx.fillRect(platform.x, platform.y, platform.w, platform.h);
    }

    this.drawExitGate();
    this.drawGoldenToy();
    this.drawDigSpots();
    this.drawBones();
    this.drawDigParticles();
    this.enemy.draw(this.ctx);
    this.drawPlayer();
    this.drawHud();
    if (this.gateHintTimerSec > 0) {
      this.drawGateHint();
    }
    if (this.debugEnabled) {
      this.drawDebug();
    }
  }

  private drawExitGate(): void {
    const unlocked = this.hasGoldenToy;
    const pulse = 0.75 + Math.sin(this.nowMs * 0.01) * 0.25;

    this.ctx.fillStyle = unlocked ? `rgba(76, 178, 89, ${pulse.toFixed(3)})` : "#6d5f67";
    this.ctx.fillRect(EXIT_GATE.x, EXIT_GATE.y, EXIT_GATE.w, EXIT_GATE.h);

    this.ctx.fillStyle = unlocked ? "#c8f3ce" : "#a99ca4";
    const bars = 3;
    for (let i = 0; i < bars; i += 1) {
      const x = EXIT_GATE.x + 3 + i * 4;
      this.ctx.fillRect(x, EXIT_GATE.y + 3, 2, EXIT_GATE.h - 6);
    }

    this.ctx.strokeStyle = "#283040";
    this.ctx.strokeRect(EXIT_GATE.x, EXIT_GATE.y, EXIT_GATE.w, EXIT_GATE.h);
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
      this.ctx.fillStyle = `rgba(120, 78, 42, ${alpha.toFixed(3)})`;
      this.ctx.fillRect(particle.x, particle.y, particle.w, particle.h);
    }
  }

  private drawPlayer(): void {
    this.ctx.save();

    if (this.invincibleTimerSec > 0 && Math.floor(this.nowMs / 80) % 2 === 0) {
      this.ctx.globalAlpha = 0.35;
    }

    if (this.player.facing === -1) {
      this.ctx.translate(this.player.x + this.player.w, this.player.y);
      this.ctx.scale(-1, 1);
    } else {
      this.ctx.translate(this.player.x, this.player.y);
    }

    this.ctx.fillStyle = this.playerState === "digging" ? "#3b4659" : "#2f4f6f";
    this.ctx.fillRect(0, 0, this.player.w, this.player.h);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillRect(11, 4, 2, 2);

    this.ctx.restore();
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

  private drawDebug(): void {
    const coyoteRemaining = Math.max(0, COYOTE_TIME_MS - (this.nowMs - this.lastGroundedTimeMs));
    const jumpBufferRemaining = Math.max(0, JUMP_BUFFER_MS - (this.nowMs - this.lastJumpPressedTimeMs));
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    this.ctx.fillRect(6, 56, 206, 86);
    this.ctx.fillStyle = "#d7f3ff";
    this.ctx.font = "9px monospace";
    this.ctx.fillText(`GS:${this.gameState} G:${this.player.grounded ? 1 : 0} H:${this.hearts} B:${this.bonesCollected}`, 10, 68);
    this.ctx.fillText(`Toy:${this.hasGoldenToy ? 1 : 0} GateHint:${this.gateHintTimerSec.toFixed(2)}`, 10, 80);
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

    return LEVEL_PLATFORMS.some((platform) => intersectsWithSkin(probe, platform, COLLISION_SKIN));
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

function getMainGroundPlatform(): Rect {
  let best = LEVEL_PLATFORMS[0];
  for (const platform of LEVEL_PLATFORMS) {
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
