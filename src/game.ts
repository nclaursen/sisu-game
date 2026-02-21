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
const GRAVITY = 900;
const MOVE_ACCEL = 1000;
const MAX_SPEED = 115;
const JUMP_IMPULSE = 320;
const GROUND_FRICTION = 0.8;

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
  private isRunning = false;

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

    this.update(delta);
    this.render();

    this.input.endFrame();
    requestAnimationFrame((time) => this.loop(time));
  }

  private update(delta: number): void {
    const state = this.input.state;

    if (state.left && !state.right) {
      this.player.vx -= MOVE_ACCEL * delta;
      this.player.facing = -1;
    } else if (state.right && !state.left) {
      this.player.vx += MOVE_ACCEL * delta;
      this.player.facing = 1;
    } else if (this.player.grounded) {
      this.player.vx *= GROUND_FRICTION;
    }

    this.player.vx = clamp(this.player.vx, -MAX_SPEED, MAX_SPEED);

    if (this.player.grounded && this.input.consumeJumpPressed()) {
      this.player.vy = -JUMP_IMPULSE;
      this.player.grounded = false;
    }

    this.player.vy += GRAVITY * delta;

    this.moveHorizontal(delta);
    this.moveVertical(delta);

    this.player.animationTime += delta;
  }

  private moveHorizontal(delta: number): void {
    this.player.x += this.player.vx * delta;

    for (const platform of LEVEL_PLATFORMS) {
      if (!intersects(this.player, platform)) {
        continue;
      }

      if (this.player.vx > 0) {
        this.player.x = platform.x - this.player.w;
      } else if (this.player.vx < 0) {
        this.player.x = platform.x + platform.w;
      }

      this.player.vx = 0;
    }
  }

  private moveVertical(delta: number): void {
    this.player.y += this.player.vy * delta;
    this.player.grounded = false;

    for (const platform of LEVEL_PLATFORMS) {
      if (!intersects(this.player, platform)) {
        continue;
      }

      if (this.player.vy > 0) {
        this.player.y = platform.y - this.player.h;
        this.player.grounded = true;
      } else if (this.player.vy < 0) {
        this.player.y = platform.y + platform.h;
      }

      this.player.vy = 0;
    }
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

  private resizeCanvas(): void {
    const availableWidth = window.innerWidth - 24;
    const availableHeight = window.innerHeight - 150;
    const scale = Math.max(1, Math.floor(Math.min(availableWidth / INTERNAL_WIDTH, availableHeight / INTERNAL_HEIGHT)));

    this.canvas.style.width = `${INTERNAL_WIDTH * scale}px`;
    this.canvas.style.height = `${INTERNAL_HEIGHT * scale}px`;
  }
}

function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
