# Neural Link | Cyberpunk AI-Driven RPG Deck

Welcome to **Neural Link**, a grim cyber-noir RPG terminal deck set in the rain-slicked neon streets of Neo-Tokyo.

🎮 **Live Deployment**: [https://ai-driven-rpg.onrender.com/login.html](https://ai-driven-rpg.onrender.com/login.html)

This interactive game combines text-based RPG mechanics with an immersive **Graphic Comic Mode**, active **CCTV surveillance camera visualizers**, character profiles, and real-time hacking feedback powered by the **Gemini AI Core**.

---

## 🎮 Game Features

### 📖 Graphic Comic Mode (Visual Campaign)
* **Chapter Selection Dropdown**: Docked chapter controls that allow switching between Chapters I, II, III, IV, and the ending log sequentially or at will.
* **Class-Specific Story Campaigns**: Tailored story paths, descriptions, tasks, difficulties, and monologues for all three character classes:
  * **Operative (Elias Vance)**: Tactical espionage, siphoning credentials, and bypassing server lockouts.
  * **Netrunner (Kira Thorn)**: Deep subgrid siphons, hologram koi overflows, and AI logic scrambles.
  * **Samurai (Jaxen Sterling)**: Blade power-cell slicing, faction checkpoint sweeps, and cooling vault breaches.
* **Gamified Q&A & Dice Rolls**: Real-time D20 roll checks with dynamic visual outcome panels, detailed narration, character dialogues, and pop-out visual sound effects (e.g. `BREACHED!`, `ZAP!`).

### 🖥️ Main RPG Deck (Dashboard UI)
* **Narrative Log & Options Grid**: High-fidelity terminal console rendering story history logs and action buttons for choice resolution.
* **CCTV Surveillance Feeds**: 
  * **Live Video Feed**: Direct, real-time municipal street monitoring.
  * **Secure Matrix Rain overlay**: Classic code drops running directly on a canvas viewport.
  * **Radar Sonar scanner**: Interactive swept vector radar tracking sentries, enforcers, and local grid nodes.
* **Character Profile Biometrics**: Real-time rendering of stats, active narrative quest tracking, and a **16-slot Cargo Hold** with Overdrive (overclock stat boosts) and Purge commands.
* **Secure Neural Terminal**: Direct command inputs with inline hacking diagnostics.

### 🤖 Gemini AI Integrations (Online Core)
* **Online/Offline Narrative Engine**: Toggle between a pre-packaged offline campaign controller and the online Gemini model.
* **Conversational Hacking advisor**: Type `/help`, `/ask`, or `/gemini` in the terminal to query the AI Core for context-aware tips, active quest guidance, and lore advice.

---

## 🛠️ Technical Stack
* **Frontend**: HTML5, Vanilla JavaScript, CSS3 (Harmonious cyber-HSL tokens, glassmorphism, responsive grid layouts, animations).
* **Backend**: Python 3 standard library (`http.server` wrapper with custom API request routing).
* **Database**: SQLite3 (automatically initializes database tables and default character sheets for persistent offline saves).

---

## 🚀 Getting Started

### Prerequisites
* Python 3.x installed.

### Setup and Running Locally
1. Clone the repository:
   ```bash
   git clone https://github.com/srujan1-creator/AI-Driven-RPG.git
   cd AI-Driven-RPG
   ```
2. Start the local server:
   ```bash
   python server.py
   ```
3. Open your browser and navigate to **http://127.0.0.1:8000/login.html** to initialize your link connection.

### Configuring Online Mode (Optional)
1. Open the **Engine Config Settings** (the gears floating button at the bottom right).
2. Change "Game Engine Mode" to **Online Controller (Gemini AI)**.
3. Paste a valid **Gemini API Key** into the input. The key will be stored securely in your browser's local storage.

---

## ☁️ Deployment to Render

To deploy this site onto [Render](https://render.com), configure a **Web Service** with the following settings:

* **Repository**: `https://github.com/srujan1-creator/AI-Driven-RPG.git`
* **Environment**: `Python`
* **Build Command**: `pip install -r requirements.txt` (or leave empty if no external dependencies are needed, since the backend uses python standard libraries)
* **Start Command**: `python server.py`
* **Port**: `8000` (The server binds to the port provided by the environment variable `PORT` automatically).
