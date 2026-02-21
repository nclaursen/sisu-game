export interface CollisionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface EnemyConfig {
  x: number;
  y: number;
  w?: number;
  h?: number;
  speed?: number;
  respawnDelaySec?: number;
}

const DEFAULT_ENEMY_WIDTH = 14;
const DEFAULT_ENEMY_HEIGHT = 12;
const DEFAULT_ENEMY_SPEED = 56;
const DEFAULT_RESPAWN_DELAY_SEC = 2.4;

export class Enemy {
  private readonly spawnX: number;
  private readonly spawnY: number;
  private readonly width: number;
  private readonly height: number;
  private readonly speed: number;
  private readonly respawnDelaySec: number;

  private x: number;
  private y: number;
  private vx: number;
  private vy: number;
  private grounded = false;
  private facing: 1 | -1 = -1;
  private alive = true;
  private respawnTimerSec = 0;

  constructor(config: EnemyConfig) {
    this.spawnX = config.x;
    this.spawnY = config.y;
    this.width = config.w ?? DEFAULT_ENEMY_WIDTH;
    this.height = config.h ?? DEFAULT_ENEMY_HEIGHT;
    this.speed = config.speed ?? DEFAULT_ENEMY_SPEED;
    this.respawnDelaySec = config.respawnDelaySec ?? DEFAULT_RESPAWN_DELAY_SEC;

    this.x = this.spawnX;
    this.y = this.spawnY;
    this.vx = this.speed * this.facing;
    this.vy = 0;
  }

  update(delta: number, platforms: CollisionRect[], gravity: number, terminalVelocity: number, skin: number): void {
    if (!this.alive) {
      this.respawnTimerSec -= delta;
      if (this.respawnTimerSec <= 0) {
        this.respawn();
      }
      return;
    }

    if (this.grounded && !this.hasGroundAhead(platforms)) {
      this.reverseDirection();
    }

    this.vx = this.speed * this.facing;
    this.x += this.vx * delta;

    let hitWall = false;
    for (const platform of platforms) {
      if (!intersectsWithSkin(this.getBody(), platform, skin)) {
        continue;
      }

      hitWall = true;
      if (this.vx > 0) {
        this.x = platform.x - this.width + skin;
      } else if (this.vx < 0) {
        this.x = platform.x + platform.w - skin;
      }
    }

    if (hitWall) {
      this.reverseDirection();
      this.vx = this.speed * this.facing;
    }

    this.vy = Math.min(this.vy + gravity * delta, terminalVelocity);
    this.y += this.vy * delta;
    this.grounded = false;

    for (const platform of platforms) {
      if (!intersectsWithSkin(this.getBody(), platform, skin)) {
        continue;
      }

      if (this.vy > 0) {
        this.y = platform.y - this.height + skin;
        this.grounded = true;
      } else if (this.vy < 0) {
        this.y = platform.y + platform.h - skin;
      }

      this.vy = 0;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (!this.alive) {
      return;
    }

    ctx.save();
    ctx.fillStyle = "#8b2e3b";
    ctx.fillRect(this.x, this.y, this.width, this.height);
    ctx.fillStyle = "#f8d7db";

    if (this.facing === 1) {
      ctx.fillRect(this.x + this.width - 3, this.y + 3, 2, 2);
    } else {
      ctx.fillRect(this.x + 1, this.y + 3, 2, 2);
    }

    ctx.restore();
  }

  kill(): void {
    if (!this.alive) {
      return;
    }

    this.alive = false;
    this.respawnTimerSec = this.respawnDelaySec;
    this.vx = 0;
    this.vy = 0;
  }

  reset(): void {
    this.alive = true;
    this.respawnTimerSec = 0;
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.facing = -1;
    this.vx = this.speed * this.facing;
    this.vy = 0;
    this.grounded = false;
  }

  isAlive(): boolean {
    return this.alive;
  }

  getBody(): CollisionRect {
    return { x: this.x, y: this.y, w: this.width, h: this.height };
  }

  private hasGroundAhead(platforms: CollisionRect[]): boolean {
    const probeX = this.facing === 1 ? this.x + this.width + 2 : this.x - 2;
    const probeY = this.y + this.height + 2;

    return platforms.some((platform) => {
      const withinX = probeX >= platform.x && probeX <= platform.x + platform.w;
      const nearY = probeY >= platform.y && probeY <= platform.y + platform.h + 1;
      return withinX && nearY;
    });
  }

  private reverseDirection(): void {
    this.facing = this.facing === 1 ? -1 : 1;
  }

  private respawn(): void {
    this.alive = true;
    this.respawnTimerSec = 0;
    this.x = this.spawnX;
    this.y = this.spawnY;
    this.vx = this.speed * this.facing;
    this.vy = 0;
    this.grounded = false;
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
