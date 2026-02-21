import "./style.css";
import { Game } from "./game";
import { Input } from "./input";

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) {
  throw new Error("Missing #app container");
}

app.innerHTML = `
  <header class="top-bar">
    <h1>Sisu: Guardian of the Garden</h1>
    <button id="soundToggle" type="button" aria-pressed="false">Sound: Off</button>
  </header>
  <main class="game-shell">
    <canvas id="gameCanvas" width="320" height="180" aria-label="Game canvas"></canvas>
    <div id="startOverlay" class="start-overlay">
      <div class="start-card">
        <h2>Sisu: Guardian of the Garden</h2>
        <p>Phase 1 Prototype</p>
        <button id="startButton" type="button">Start</button>
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
const soundToggle = document.querySelector<HTMLButtonElement>("#soundToggle");
const controlButtons = Array.from(document.querySelectorAll<HTMLButtonElement>("[data-control]"));

if (!canvas || !startOverlay || !startButton || !soundToggle) {
  throw new Error("Missing required game UI elements");
}

const input = new Input();
input.attachKeyboard(window);
input.attachTouchButtons(controlButtons);

const game = new Game(canvas, input);

let soundOn = false;
soundToggle.addEventListener("click", () => {
  soundOn = !soundOn;
  soundToggle.textContent = `Sound: ${soundOn ? "On" : "Off"}`;
  soundToggle.setAttribute("aria-pressed", String(soundOn));
});

startButton.addEventListener("click", () => {
  startOverlay.classList.add("hidden");
  game.start();
});
