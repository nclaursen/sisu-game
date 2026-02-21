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

const LEVEL_PLATFORMS: Rect[] = [
  { x: 0, y: 164, w: 320, h: 16 },
  { x: 52, y: 128, w: 72, h: 10 },
  { x: 160, y: 102, w: 62, h: 10 },
  { x: 250, y: 138, w: 56, h: 10 }
];

export class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly input: Input;
  private lastTick = 0;
  private nowMs = 0;
  private isRunning = false;
  private lastGroundedTimeMs = -Infinity;
  private lastJumpPressedTimeMs = -Infinity;
  private previousJumpHeld = false;
  private debugEnabled = false;

  private readonly player: Player = {
    x: 16,
    y: 40,
    w: 16,
    h: 16,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: false,
    animationTime: 0
  };

  constructor(canvas: HTMLCanvasElement, input: Input) {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("2D context unavailable");
    }

    this.canvas = canvas;
    this.ctx = context;
    this.input = input;

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
    const state = this.input.state;
    const inputDirection = Number(state.right) - Number(state.left);

    if (this.input.consumeJumpPressed()) {
      this.lastJumpPressedTimeMs = this.nowMs;
    }

    if (this.player.grounded) {
      this.lastGroundedTimeMs = this.nowMs;
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

    this.player.vy += GRAVITY * delta;
    this.player.vy = Math.min(this.player.vy, TERMINAL_VELOCITY);

    this.moveHorizontal(delta, state);
    this.moveVertical(delta);
    this.player.grounded = this.checkGrounded();
    if (this.player.grounded) {
      this.lastGroundedTimeMs = this.nowMs;
    }

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

    // Step-up forgiveness only applies when colliding into the side of a small ledge.
    const blockedAtSteppedHeight = LEVEL_PLATFORMS.some((platform) => intersectsWithSkin(steppedRect, platform, COLLISION_SKIN));

    if (blockedAtSteppedHeight) {
      return false;
    }

    this.player.y -= STEP_UP_HEIGHT;
    return true;
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

    this.drawPlayer();
    this.drawHud();
    if (this.debugEnabled) {
      this.drawDebug();
    }
  }

  private drawPlayer(): void {
    this.ctx.save();

    if (this.player.facing === -1) {
      this.ctx.translate(this.player.x + this.player.w, this.player.y);
      this.ctx.scale(-1, 1);
    } else {
      this.ctx.translate(this.player.x, this.player.y);
    }

    // Temporary placeholder: always-visible square while sprite pipeline is validated.
    this.ctx.fillStyle = "#2f4f6f";
    this.ctx.fillRect(0, 0, this.player.w, this.player.h);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillRect(11, 4, 2, 2);

    this.ctx.restore();
  }

  private drawHud(): void {
    this.ctx.fillStyle = "rgba(12, 24, 40, 0.7)";
    this.ctx.fillRect(6, 6, 84, 18);

    this.ctx.font = "10px monospace";
    this.ctx.fillStyle = "#f7f3c5";
    this.ctx.fillText("HP", 11, 18);

    for (let i = 0; i < 3; i += 1) {
      this.ctx.fillStyle = "#da4f5d";
      this.ctx.fillRect(30 + i * 16, 10, 10, 10);
      this.ctx.strokeStyle = "#81252f";
      this.ctx.strokeRect(30 + i * 16, 10, 10, 10);
    }
  }

  private drawDebug(): void {
    const coyoteRemaining = Math.max(0, COYOTE_TIME_MS - (this.nowMs - this.lastGroundedTimeMs));
    const jumpBufferRemaining = Math.max(0, JUMP_BUFFER_MS - (this.nowMs - this.lastJumpPressedTimeMs));
    this.ctx.fillStyle = "rgba(0, 0, 0, 0.65)";
    this.ctx.fillRect(6, 28, 156, 52);
    this.ctx.fillStyle = "#d7f3ff";
    this.ctx.font = "9px monospace";
    this.ctx.fillText(`G:${this.player.grounded ? 1 : 0} VX:${this.player.vx.toFixed(1)} VY:${this.player.vy.toFixed(1)}`, 10, 40);
    this.ctx.fillText(`Coyote:${coyoteRemaining.toFixed(0)}ms`, 10, 52);
    this.ctx.fillText(`Buffer:${jumpBufferRemaining.toFixed(0)}ms`, 10, 64);
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

function intersectsWithSkin(a: Rect, b: Rect, skin: number): boolean {
  return (
    a.x + skin < b.x + b.w &&
    a.x + a.w - skin > b.x &&
    a.y + skin < b.y + b.h &&
    a.y + a.h - skin > b.y
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function moveTowards(current: number, target: number, maxDelta: number): number {
  if (Math.abs(target - current) <= maxDelta) {
    return target;
  }
  return current + Math.sign(target - current) * maxDelta;
}
