import type { RacerInputState } from "../race/raceState";

export interface KartInputKeyEvent {
  readonly code?: string;
  readonly key?: string;
  readonly repeat?: boolean;
}

const THROTTLE_KEYS = new Set(["ArrowUp", "KeyW"]);
const BRAKE_KEYS = new Set(["ArrowDown", "KeyS"]);
const LEFT_KEYS = new Set(["ArrowLeft", "KeyA"]);
const RIGHT_KEYS = new Set(["ArrowRight", "KeyD"]);
const DRIFT_KEYS = new Set(["ShiftLeft", "ShiftRight"]);
const USE_ITEM_KEYS = new Set(["Space", "KeyE"]);

export class KeyboardKartInputState {
  private readonly pressedKeys = new Set<string>();
  private useItemQueued = false;

  public press(event: KartInputKeyEvent): void {
    const keyCode = getInputKeyCode(event);

    if (keyCode === null) {
      return;
    }

    this.pressedKeys.add(keyCode);

    if (USE_ITEM_KEYS.has(keyCode) && event.repeat !== true) {
      this.useItemQueued = true;
    }
  }

  public release(event: KartInputKeyEvent): void {
    const keyCode = getInputKeyCode(event);

    if (keyCode === null) {
      return;
    }

    this.pressedKeys.delete(keyCode);
  }

  public sample(): RacerInputState {
    const input: RacerInputState = {
      throttle: this.isAnyPressed(THROTTLE_KEYS) ? 1 : 0,
      brake: this.isAnyPressed(BRAKE_KEYS) ? 1 : 0,
      steer:
        (this.isAnyPressed(RIGHT_KEYS) ? 1 : 0) -
        (this.isAnyPressed(LEFT_KEYS) ? 1 : 0),
      drift: this.isAnyPressed(DRIFT_KEYS),
      useItem: this.useItemQueued
    };

    this.useItemQueued = false;
    return input;
  }

  public reset(): void {
    this.pressedKeys.clear();
    this.useItemQueued = false;
  }

  private isAnyPressed(keys: ReadonlySet<string>): boolean {
    for (const key of keys) {
      if (this.pressedKeys.has(key)) {
        return true;
      }
    }

    return false;
  }
}

export function bindKeyboardKartInput(
  target: Window,
  input: KeyboardKartInputState
): () => void {
  const handleKeyDown = (event: KeyboardEvent): void => {
    input.press(event);
  };
  const handleKeyUp = (event: KeyboardEvent): void => {
    input.release(event);
  };
  const handleBlur = (): void => {
    input.reset();
  };

  target.addEventListener("keydown", handleKeyDown);
  target.addEventListener("keyup", handleKeyUp);
  target.addEventListener("blur", handleBlur);

  return () => {
    target.removeEventListener("keydown", handleKeyDown);
    target.removeEventListener("keyup", handleKeyUp);
    target.removeEventListener("blur", handleBlur);
  };
}

function getInputKeyCode(event: KartInputKeyEvent): string | null {
  if (event.code !== undefined && event.code.length > 0) {
    return event.code;
  }

  if (event.key === undefined || event.key.length === 0) {
    return null;
  }

  switch (event.key) {
    case "ArrowUp":
    case "ArrowDown":
    case "ArrowLeft":
    case "ArrowRight":
      return event.key;
    case " ":
    case "Spacebar":
      return "Space";
    case "Shift":
      return "ShiftLeft";
    default:
      return event.key.length === 1
        ? `Key${event.key.toUpperCase()}`
        : event.key;
  }
}
