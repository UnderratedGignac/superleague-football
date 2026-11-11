# Superleague Football ⚽

An interactive 3D arcade football (soccer) game built with **Three.js** and Web Audio API.

## 🎮 Play

- **Offline / Standalone**: Open `game.html` directly in any modern web browser.
- **Local Server**:
  ```bash
  npm install
  npm start
  ```
  Visit [http://localhost:3000](http://localhost:3000) to play.

## 🕹️ Controls

- **Movement**: `Arrow Keys` or `WASD` / Virtual Joystick on mobile & touch screens
- **Action / Pass / Shoot**: Action buttons on screen or keyboard action keys
- **Pause / Menu**: Escape key or top-right UI button

## 🛠️ Tech Stack & Architecture

- **Engine**: Three.js (WebGL 3D graphics)
- **Audio & VFX**: Web Audio API procedural sound synthesis + custom particle effects
- **Bundler**: `esbuild` for minification and bundling self-contained HTML
- **Server**: Zero-dependency Node.js HTTP server (`server.js`)

## 📦 Building

To recompile the bundle into `public/` and generate the standalone `game.html`:

```bash
npm run build
```

## 🧪 Testing

Run automated smoke tests with Playwright:

```bash
npm test
```
