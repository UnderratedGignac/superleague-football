# Superleague Football ⚽

Interactive 3D arcade football (soccer) game built with **Three.js** and Web Audio API.

## 📂 Project Structure

- **[`legacy/`](./legacy/)**: Complete, fully playable 3D arcade football game (v1.0.0). Includes standalone HTML version (`game.html`), local HTTP server, and Playwright tests.
- **[`superleague/`](./superleague/)**: Next-generation modularized engine & match architecture (v2.0.0), organizing ball physics, procedural kit generation, stadium rendering, match rules, AI, and animations into reusable engine and game modules.

---

## 🎮 Play the Game

### Option 1: Standalone Offline
Open [`legacy/game.html`](./legacy/game.html) directly in any modern web browser.

### Option 2: Local Server
```bash
npm start
```
or:
```bash
node server.js
```
Then visit [http://localhost:3000](http://localhost:3000).

---

## 🕹️ Controls

- **Movement**: `Arrow Keys` or `WASD` / Virtual Joystick on mobile & touch screens
- **Action / Pass / Shoot**: Action buttons on screen or keyboard action keys
- **Pause / Menu**: Escape key or top-right UI button

---

## 🛠️ Tech Stack

- **Graphics**: Three.js (WebGL 3D graphics)
- **Audio & VFX**: Procedural Web Audio API sound synthesis and custom particle systems
- **Bundler**: `esbuild` for single-bundle export
- **Server**: Lightweight zero-dependency Node.js HTTP server
