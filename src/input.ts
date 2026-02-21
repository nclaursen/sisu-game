export interface InputState {
  left: boolean;
  right: boolean;
  jumpHeld: boolean;
  jumpPressed: boolean;
  dig: boolean;
  digPressed: boolean;
}

const CONTROL_KEYS: Record<string, keyof InputState | null> = {
  ArrowLeft: "left",
  ArrowRight: "right",
  ArrowDown: "dig",
  Space: "jumpHeld"
};

const TOUCH_CONTROLS = ["left", "right", "jump", "dig"] as const;
type TouchControl = (typeof TOUCH_CONTROLS)[number];

export class Input {
  readonly state: InputState = {
    left: false,
    right: false,
    jumpHeld: false,
    jumpPressed: false,
    dig: false,
    digPressed: false
  };

  private hasConsumedJump = false;
  private hasConsumedDig = false;

  attachKeyboard(target: Window): void {
    target.addEventListener("keydown", (event) => {
      const control = CONTROL_KEYS[event.code];
      if (!control) {
        return;
      }

      event.preventDefault();
      if (control === "jumpHeld") {
        if (!this.state.jumpHeld) {
          this.state.jumpPressed = true;
        }
        this.state.jumpHeld = true;
        return;
      }

      if (control === "dig") {
        if (!this.state.dig) {
          this.state.digPressed = true;
        }
        this.state.dig = true;
        return;
      }

      this.state[control] = true;
    });

    target.addEventListener("keyup", (event) => {
      const control = CONTROL_KEYS[event.code];
      if (!control) {
        return;
      }

      event.preventDefault();
      if (control === "jumpHeld") {
        this.state.jumpHeld = false;
        return;
      }

      if (control === "dig") {
        this.state.dig = false;
        return;
      }

      this.state[control] = false;
    });
  }

  attachTouchButtons(buttons: HTMLButtonElement[]): void {
    buttons.forEach((button) => {
      const rawControl = button.dataset.control;
      if (!rawControl || !TOUCH_CONTROLS.includes(rawControl as TouchControl)) {
        return;
      }

      const control = rawControl as TouchControl;
      const press = (event: Event): void => {
        event.preventDefault();
        if (control === "jump") {
          if (!this.state.jumpHeld) {
            this.state.jumpPressed = true;
          }
          this.state.jumpHeld = true;
          return;
        }

        if (control === "left") {
          this.state.left = true;
        }

        if (control === "right") {
          this.state.right = true;
        }

        if (control === "dig") {
          if (!this.state.dig) {
            this.state.digPressed = true;
          }
          this.state.dig = true;
        }
      };

      const release = (event: Event): void => {
        event.preventDefault();
        if (control === "jump") {
          this.state.jumpHeld = false;
          return;
        }

        if (control === "left") {
          this.state.left = false;
        }

        if (control === "right") {
          this.state.right = false;
        }

        if (control === "dig") {
          this.state.dig = false;
        }
      };

      button.addEventListener("pointerdown", press);
      button.addEventListener("pointerup", release);
      button.addEventListener("pointerleave", release);
      button.addEventListener("pointercancel", release);
      button.addEventListener("contextmenu", (event) => event.preventDefault());
    });
  }

  consumeJumpPressed(): boolean {
    if (this.hasConsumedJump || !this.state.jumpPressed) {
      return false;
    }

    this.hasConsumedJump = true;
    return true;
  }

  consumeDigPressed(): boolean {
    if (this.hasConsumedDig || !this.state.digPressed) {
      return false;
    }

    this.hasConsumedDig = true;
    return true;
  }

  endFrame(): void {
    this.state.jumpPressed = false;
    this.state.digPressed = false;
    this.hasConsumedJump = false;
    this.hasConsumedDig = false;
  }
}
