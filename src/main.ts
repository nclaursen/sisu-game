import "./style.css";
import { Game } from "./game";
import { Input } from "./input";
import { SoundManager } from "./sound";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing #app container");
}

app.innerHTML = `
  <header class="top-bar">
    <h1>Sisu: Guardian of the Garden</h1>
    <button id="soundToggle" type="button" aria-pressed="true">Sound: On</button>
  </header>
  <main class="game-shell">
    <canvas id="gameCanvas" width="320" height="180" aria-label="Game canvas"></canvas>
    <div id="startOverlay" class="start-overlay">
      <div class="start-card">
        <h2>Sisu: Guardian of the Garden</h2>
        <p>Phase 2D Prototype</p>
        <button id="startButton" type="button">Start</button>
      </div>
    </div>
    <div id="gameOverOverlay" class="start-overlay hidden">
      <div class="start-card">
        <h2>Game Over</h2>
        <p>Press R or tap restart.</p>
        <button id="restartButton" type="button">Restart</button>
      </div>
    </div>
    <div id="levelCompleteOverlay" class="start-overlay hidden">
      <div class="start-card">
        <h2>Level Complete!</h2>
        <p id="levelStats">Bones: 0 | Hearts: 0 | Time: 0.0s</p>
        <button id="playAgainButton" type="button">Play Again</button>
        <button id="nextLevelButton" type="button" disabled>Next Level (Soon)</button>
      </div>
    </div>
  </main>
  <footer class="mobile-controls" aria-label="Touch controls">
    <button data-control="left" type="button">Left</button>
    <button data-control="right" type="button">Right</button>
    <button data-control="jump" type="button">Jump</button>
    <button data-control="dig" type="button">Dig</button>
  </footer>
`;

const canvas = document.querySelector<HTMLCanvasElement>("#gameCanvas");
const startOverlay = document.querySelector<HTMLDivElement>("#startOverlay");
const startButton = document.querySelector<HTMLButtonElement>("#startButton");
const gameOverOverlay = document.querySelector<HTMLDivElement>("#gameOverOverlay");
const restartButton = document.querySelector<HTMLButtonElement>("#restartButton");
const levelCompleteOverlay = document.querySelector<HTMLDivElement>("#levelCompleteOverlay");
const levelStats = document.querySelector<HTMLParagraphElement>("#levelStats");
const playAgainButton = document.querySelector<HTMLButtonElement>("#playAgainButton");
const soundToggle = document.querySelector<HTMLButtonElement>("#soundToggle");
const controlButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-control]"));

if (
  !canvas ||
  !startOverlay ||
  !startButton ||
  !gameOverOverlay ||
  !restartButton ||
  !levelCompleteOverlay ||
  !levelStats ||
  !playAgainButton ||
  !soundToggle
) {
  throw new Error("Missing required game UI elements");
}

const input = new Input();
input.attachKeyboard(window);
input.attachTouchButtons(controlButtons);
const sound = new SoundManager();

const game = new Game(canvas, input, {
  sound,
  onGameOver: () => {
    sound.stopMusic();
    gameOverOverlay.classList.remove("hidden");
  },
  onLevelComplete: ({ bonesCollected, heartsRemaining, timeSec }) => {
    sound.stopMusic();
    levelStats.textContent = `Bones: ${bonesCollected} | Hearts: ${heartsRemaining} | Time: ${timeSec.toFixed(1)}s`;
    levelCompleteOverlay.classList.remove("hidden");
  }
});

const restartGame = (): void => {
  game.restart();
  sound.startMusic();
  gameOverOverlay.classList.add("hidden");
  levelCompleteOverlay.classList.add("hidden");
};

let soundOn = true;
soundToggle.addEventListener("click", () => {
  void sound.unlock();
  soundOn = !soundOn;
  sound.setEnabled(soundOn);
  soundToggle.textContent = `Sound: ${soundOn ? "On" : "Off"}`;
  soundToggle.setAttribute("aria-pressed", String(soundOn));
});

startButton.addEventListener("click", () => {
  void sound.unlock();
  startOverlay.classList.add("hidden");
  game.start();
  sound.startMusic();
});

restartButton.addEventListener("click", restartGame);
playAgainButton.addEventListener("click", restartGame);

window.addEventListener("keydown", (event) => {
  if (event.code === "KeyR" && (game.isGameOver() || game.isLevelComplete())) {
    restartGame();
  }
});
