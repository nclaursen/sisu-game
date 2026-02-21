export interface CollisionRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export type EnemyType = "rat" | "mouse" | "tank";

interface EnemyConfig {
  type: EnemyType;
  x: number;
  y: number;
  facing?: 1 | -1;
}

interface EnemyStats {
  width: number;
  height: number;
  speed: number;
  hp: number;
  baseColor: string;
  eyeColor: string;
}

const BASE_SPEED = 56;
const SPAWN_ANIM_SEC = 0.18;

interface EnemySpriteDef {
  image: HTMLImageElement;
  frameW: number;
  frameH: number;
  frameDuration: number;
}

const ENEMY_STATS: Record<EnemyType, EnemyStats> = {
  rat: {
    width: 14,
    height: 12,
    speed: BASE_SPEED,
    hp: 1,
    baseColor: "#8b2e3b",
    eyeColor: "#f8d7db"
  },
  mouse: {
    width: 11,
    height: 9,
    speed: BASE_SPEED * 1.4,
    hp: 1,
    baseColor: "#8c5a73",
    eyeColor: "#f9e9f2"
  },
  tank: {
    width: 17,
    height: 14,
    speed: BASE_SPEED * 0.75,
    hp: 2,
    baseColor: "#4d5f72",
    eyeColor: "#d8e7f5"
  }
};

export class Enemy {
  readonly type: EnemyType;
  readonly maxHp: number;

  private readonly width: number;
  private readonly height: number;
  private readonly speed: number;
  private readonly baseColor: string;
  private readonly eyeColor: string;

  private x: number;
  private y: number;
  private vx: number;
  private vy: number;
  private facing: 1 | -1;
  private grounded = false;
  private alive = true;
  private hp: number;
  private hitStunTimerSec = 0;
  private spawnTimerSec = SPAWN_ANIM_SEC;
  private animTimerSec = 0;

  constructor(config: EnemyConfig) {
    const stats = ENEMY_STATS[config.type];

    this.type = config.type;
    this.maxHp = stats.hp;

    this.width = stats.width;
    this.height = stats.height;
    this.speed = stats.speed;
    this.baseColor = stats.baseColor;
    this.eyeColor = stats.eyeColor;

    this.x = config.x;
    this.y = config.y;
    this.facing = config.facing ?? -1;
    this.vx = this.speed * this.facing;
    this.vy = 0;
    this.hp = this.maxHp;
  }

  update(delta: number, platforms: CollisionRect[], gravity: number, terminalVelocity: number, skin: number): void {
    if (!this.alive) {
      return;
    }

    if (this.hitStunTimerSec > 0) {
      this.hitStunTimerSec = Math.max(0, this.hitStunTimerSec - delta);
    }
    if (this.spawnTimerSec > 0) {
      this.spawnTimerSec = Math.max(0, this.spawnTimerSec - delta);
    }
    this.animTimerSec += delta;

    const canMove = this.hitStunTimerSec <= 0;

    if (canMove && this.grounded && !this.hasGroundAhead(platforms)) {
      this.reverseDirection();
    }

    this.vx = canMove ? this.speed * this.facing : 0;
    this.x += this.vx * delta;

    if (canMove) {
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

    const body = this.getBody();
    const scale = this.spawnTimerSec > 0 ? 0.8 + (1 - this.spawnTimerSec / SPAWN_ANIM_SEC) * 0.2 : 1;
    const centerX = body.x + body.w / 2;
    const baseY = body.y + body.h;
    const drawW = body.w * scale;
    const drawH = body.h * scale;
    const drawX = centerX - drawW / 2;
    const drawY = baseY - drawH;

    const sprite = getEnemySpriteDef(this.type);
    const frameIndex = Math.floor(this.animTimerSec / sprite.frameDuration) % 2;
    const crackedRow = this.type === "tank" && this.hp === 1 ? 1 : 0;

    if (sprite.image.complete && sprite.image.naturalWidth > 0) {
      const sx = frameIndex * sprite.frameW;
      const sy = crackedRow * sprite.frameH;
      ctx.save();
      if (this.facing === -1) {
        ctx.translate(drawX + drawW, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(sprite.image, sx, sy, sprite.frameW, sprite.frameH, 0, 0, drawW, drawH);
      } else {
        ctx.drawImage(sprite.image, sx, sy, sprite.frameW, sprite.frameH, drawX, drawY, drawW, drawH);
      }
      ctx.restore();
      return;
    }

    // Fallback if sprite image has not decoded yet.
    ctx.save();
    ctx.fillStyle = this.baseColor;
    ctx.fillRect(drawX, drawY, drawW, drawH);
    ctx.fillStyle = this.eyeColor;
    ctx.fillRect(drawX + drawW - 3, drawY + 3, 2, 2);
    ctx.restore();
  }

  canDamagePlayer(): boolean {
    return this.alive && this.hitStunTimerSec <= 0 && this.spawnTimerSec <= 0;
  }

  applyStomp(): "damaged" | "killed" {
    if (!this.alive) {
      return "killed";
    }

    this.hp -= 1;
    this.hitStunTimerSec = 0.2;

    if (this.hp <= 0) {
      this.alive = false;
      this.vx = 0;
      this.vy = 0;
      return "killed";
    }

    return "damaged";
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
}

export function createEnemy(type: EnemyType, x: number, y: number, facing: 1 | -1 = -1): Enemy {
  return new Enemy({ type, x, y, facing });
}

function intersectsWithSkin(a: CollisionRect, b: CollisionRect, skin: number): boolean {
  return (
    a.x + skin < b.x + b.w &&
    a.x + a.w - skin > b.x &&
    a.y + skin < b.y + b.h &&
    a.y + a.h - skin > b.y
  );
}

function getEnemySpriteDef(type: EnemyType): EnemySpriteDef {
  if (!enemySpriteCache) {
    enemySpriteCache = createEnemySpriteCache();
  }
  return enemySpriteCache[type];
}

let enemySpriteCache: Record<EnemyType, EnemySpriteDef> | null = null;

function createEnemySpriteCache(): Record<EnemyType, EnemySpriteDef> {
  return {
    rat: createRatSpriteDef(),
    mouse: createMouseSpriteDef(),
    tank: createTankSpriteDef()
  };
}

function createRatSpriteDef(): EnemySpriteDef {
  const frameW = 20;
  const frameH = 14;
  const sheet = document.createElement("canvas");
  sheet.width = frameW * 2;
  sheet.height = frameH;
  const ctx = sheet.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to create rat sprite");
  }

  const drawRatFrame = (frame: 0 | 1): void => {
    const ox = frame * frameW;
    const bodyDark = "#2f2420";
    const bodyMid = "#5c4639";
    const bodyLight = "#7c604b";
    const eye = "#d8595b";
    const tail = "#a78176";

    // Tail
    ctx.fillStyle = tail;
    ctx.fillRect(ox + 1, 8, 5, 1);
    ctx.fillRect(ox + 0, 9, 3, 1);

    // Body + head bump
    ctx.fillStyle = bodyDark;
    ctx.fillRect(ox + 5, 5, 11, 6);
    ctx.fillRect(ox + 14, 4, 4, 4);
    ctx.fillStyle = bodyMid;
    ctx.fillRect(ox + 6, 6, 9, 4);
    ctx.fillRect(ox + 14, 5, 3, 2);
    ctx.fillStyle = bodyLight;
    ctx.fillRect(ox + 8, 7, 5, 2);

    // Ear and eye
    ctx.fillStyle = bodyDark;
    ctx.fillRect(ox + 15, 3, 1, 1);
    ctx.fillStyle = eye;
    ctx.fillRect(ox + 16, 6, 1, 1);

    // Legs (2-frame cycle)
    ctx.fillStyle = bodyDark;
    if (frame === 0) {
      ctx.fillRect(ox + 7, 11, 2, 2);
      ctx.fillRect(ox + 12, 10, 2, 3);
    } else {
      ctx.fillRect(ox + 8, 10, 2, 3);
      ctx.fillRect(ox + 12, 11, 2, 2);
    }
  };

  drawRatFrame(0);
  drawRatFrame(1);

  const image = new Image();
  image.src = sheet.toDataURL("image/png");
  return { image, frameW, frameH, frameDuration: 0.12 };
}

function createMouseSpriteDef(): EnemySpriteDef {
  const frameW = 16;
  const frameH = 12;
  const sheet = document.createElement("canvas");
  sheet.width = frameW * 2;
  sheet.height = frameH;
  const ctx = sheet.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to create mouse sprite");
  }

  const drawMouseFrame = (frame: 0 | 1): void => {
    const ox = frame * frameW;
    const bodyDark = "#493744";
    const bodyMid = "#8c6f82";
    const ear = "#d2a8bf";
    const eye = "#ff8088";
    const tail = "#cfafba";

    // Thin tail
    ctx.fillStyle = tail;
    ctx.fillRect(ox + 0, 7, 4, 1);

    // Body
    ctx.fillStyle = bodyDark;
    ctx.fillRect(ox + 4, 5, 8, 4);
    ctx.fillRect(ox + 10, 4, 3, 3);
    ctx.fillStyle = bodyMid;
    ctx.fillRect(ox + 5, 6, 6, 2);

    // Big ears
    ctx.fillStyle = ear;
    ctx.fillRect(ox + 9, 2, 2, 2);
    ctx.fillRect(ox + 11, 2, 2, 2);

    // Eye
    ctx.fillStyle = eye;
    ctx.fillRect(ox + 11, 5, 1, 1);

    // Legs faster cycle
    ctx.fillStyle = bodyDark;
    if (frame === 0) {
      ctx.fillRect(ox + 5, 9, 1, 2);
      ctx.fillRect(ox + 9, 8, 1, 3);
    } else {
      ctx.fillRect(ox + 6, 8, 1, 3);
      ctx.fillRect(ox + 9, 9, 1, 2);
    }
  };

  drawMouseFrame(0);
  drawMouseFrame(1);

  const image = new Image();
  image.src = sheet.toDataURL("image/png");
  return { image, frameW, frameH, frameDuration: 0.08 };
}

function createTankSpriteDef(): EnemySpriteDef {
  const frameW = 22;
  const frameH = 16;
  const sheet = document.createElement("canvas");
  sheet.width = frameW * 2;
  sheet.height = frameH * 2; // row0 normal, row1 cracked armor
  const ctx = sheet.getContext("2d");
  if (!ctx) {
    throw new Error("Unable to create tank sprite");
  }

  const drawTankFrame = (frame: 0 | 1, cracked: boolean): void => {
    const ox = frame * frameW;
    const oy = cracked ? frameH : 0;
    const bodyDark = "#2d3a48";
    const bodyMid = "#526475";
    const armor = "#9caec2";
    const eye = "#deeffa";
    const tail = "#6f8397";

    // Tail
    ctx.fillStyle = tail;
    ctx.fillRect(ox + 1, oy + 9, 5, 1);

    // Large body
    ctx.fillStyle = bodyDark;
    ctx.fillRect(ox + 5, oy + 6, 13, 7);
    ctx.fillRect(ox + 15, oy + 5, 4, 4);
    ctx.fillStyle = bodyMid;
    ctx.fillRect(ox + 6, oy + 7, 11, 5);

    // Armor band
    ctx.fillStyle = armor;
    ctx.fillRect(ox + 6, oy + 8, 11, 2);

    if (cracked) {
      ctx.fillStyle = "#263443";
      ctx.fillRect(ox + 11, oy + 8, 1, 2);
      ctx.fillRect(ox + 12, oy + 9, 1, 1);
      ctx.fillRect(ox + 10, oy + 9, 1, 1);
    }

    // Eye
    ctx.fillStyle = eye;
    ctx.fillRect(ox + 17, oy + 7, 1, 1);

    // Legs (heavier cycle)
    ctx.fillStyle = bodyDark;
    if (frame === 0) {
      ctx.fillRect(ox + 7, oy + 13, 2, 2);
      ctx.fillRect(ox + 13, oy + 12, 2, 3);
    } else {
      ctx.fillRect(ox + 8, oy + 12, 2, 3);
      ctx.fillRect(ox + 13, oy + 13, 2, 2);
    }
  };

  drawTankFrame(0, false);
  drawTankFrame(1, false);
  drawTankFrame(0, true);
  drawTankFrame(1, true);

  const image = new Image();
  image.src = sheet.toDataURL("image/png");
  return { image, frameW, frameH, frameDuration: 0.14 };
}
