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
}

interface BoneCollectible extends Rect {
  active: boolean;
  targetY: number;
  popSpeed: number;
}

type PlayerActionState = "normal" | "digging";

interface GameCallbacks {
  onGameOver?: () => void;
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

const PLAYER_START_X = 16;
const PLAYER_START_Y = 40;

const LEVEL_PLATFORMS: Rect[] = [
  { x: 0, y: 164, w: 320, h: 16 },
  { x: 52, y: 128, w: 72, h: 10 },
  { x: 160, y: 102, w: 62, h: 10 },
  { x: 250, y: 138, w: 56, h: 10 }
];

const ENEMY_SPAWN = { x: 78, y: 116 };

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input: Input;
  private readonly onGameOver?: () => void;
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
  private gameOver = false;

  private playerState: PlayerActionState = "normal";
  private digTimerSec = 0;
  private activeDigSpotIndex: number | null = null;
  private digSpots: DigSpot[] = [];
  private bones: BoneCollectible[] = [];

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
    this.gameOver = false;
    this.lastGroundedTimeMs = -Infinity;
    this.lastJumpPressedTimeMs = -Infinity;
    this.previousJumpHeld = false;

    this.playerState = "normal";
    this.digTimerSec = 0;
    this.activeDigSpotIndex = null;

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
  }

  isGameOver(): boolean {
    return this.gameOver;
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
    if (this.gameOver) {
      return;
    }

    const state = this.input.state;
    const inputDirection = Number(state.right) - Number(state.left);
    const previousPlayerBottom = this.player.y + this.player.h;

    if (this.invincibleTimerSec > 0) {
      this.invincibleTimerSec = Math.max(0, this.invincibleTimerSec - delta);
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
    this.updateBones(delta);

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
      this.gameOver = true;
      this.onGameOver?.();
    }
  }

  private updateBones(delta: number): void {
    for (const bone of this.bones) {
      if (!bone.active) {
        continue;
      }

      if (bone.y > bone.targetY) {
        bone.y = Math.max(bone.targetY, bone.y - bone.popSpeed * delta);
      }

      if (intersectsWithSkin(this.player, bone, 0)) {
        bone.active = false;
        this.bonesCollected += 1;
      }
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
    }
  }

  private spawnBoneFromSpot(spot: DigSpot): void {
    const boneWidth = 8;
    const boneHeight = 6;
    const targetY = spot.y - boneHeight - 2;

    this.bones.push({
      x: spot.x + (spot.w - boneWidth) / 2,
      y: targetY + 8,
      w: boneWidth,
      h: boneHeight,
      active: true,
      targetY,
      popSpeed: 32
    });
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
        hasBone: rng() > 0.35
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

    this.drawDigSpots();
    this.drawBones();
    this.enemy.draw(this.ctx);
    this.drawPlayer();
    this.drawHud();
    if (this.debugEnabled) {
      this.drawDebug();
    }
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
      }

      if (this.debugEnabled) {
        this.ctx.strokeStyle = "rgba(255, 255, 0, 0.8)";
        this.ctx.strokeRect(spot.x, spot.y, spot.w, spot.h);
      }
    }
  }

  private drawBones(): void {
    for (const bone of this.bones) {
      if (!bone.active) {
        continue;
      }

      this.ctx.fillStyle = "#f1e7ce";
      this.ctx.fillRect(bone.x, bone.y + 2, bone.w, 2);
      this.ctx.fillRect(bone.x + 1, bone.y, bone.w - 2, bone.h);
      this.ctx.fillStyle = "#b7ab8a";
      this.ctx.fillRect(bone.x + 2, bone.y + 2, bone.w - 4, 2);
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
    this.ctx.fillStyle = "rgba(12, 24, 40, 0.7)";
    this.ctx.fillRect(6, 6, 174, 18);

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
    this.ctx.fillText(`Bones: ${this.bonesCollected}`, 84, 18);
  }

  private drawDebug(): void {
    const coyoteRemaining = Math.max(0, COYOTE_TIME_MS - (this.nowMs - this.lastGroundedTimeMs));
    const jumpBufferRemaining = Math.max(0, JUMP_BUFFER_MS - (this.nowMs - this.lastJumpPressedTimeMs));
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    this.ctx.fillRect(6, 28, 196, 76);
    this.ctx.fillStyle = "#d7f3ff";
    this.ctx.font = "9px monospace";
    this.ctx.fillText(`G:${this.player.grounded ? 1 : 0} H:${this.hearts} B:${this.bonesCollected}`, 10, 40);
    this.ctx.fillText(`State:${this.playerState} DigT:${Math.max(0, this.digTimerSec).toFixed(2)}`, 10, 52);
    this.ctx.fillText(`VX:${this.player.vx.toFixed(1)} VY:${this.player.vy.toFixed(1)}`, 10, 64);
    this.ctx.fillText(`Coyote:${coyoteRemaining.toFixed(0)}ms`, 10, 76);
    this.ctx.fillText(`Buffer:${jumpBufferRemaining.toFixed(0)}ms`, 10, 88);
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
