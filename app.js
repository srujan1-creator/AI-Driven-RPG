/* ==========================================================================
   NEURAL_LINK GAME CONTROLLER LOGIC
   ========================================================================== */

// Global Exception Catchers for Terminal Debugging
window.onerror = function(message, source, lineno, colno, error) {
  console.error("Global JS Error Caught:", message, "at", source, ":", lineno);
  const container = document.getElementById("terminal-screen-container");
  if (container) {
    const line = document.createElement("div");
    line.className = "terminal-line system";
    line.style.color = "var(--cyber-magenta)";
    line.style.background = "rgba(255, 0, 160, 0.08)";
    line.style.borderLeft = "2px solid var(--cyber-magenta)";
    line.style.padding = "6px";
    line.style.margin = "4px 0";
    line.textContent = `[KERNEL CRASH] ${message} (${source.split('/').pop()}:${lineno})`;
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
  }
  return false;
};

window.onunhandledrejection = function(event) {
  console.error("Unhandled Promise Rejection:", event.reason);
  const container = document.getElementById("terminal-screen-container");
  if (container) {
    const line = document.createElement("div");
    line.className = "terminal-line system";
    line.style.color = "var(--cyber-magenta)";
    line.style.background = "rgba(255, 0, 160, 0.08)";
    line.style.borderLeft = "2px solid var(--cyber-magenta)";
    line.style.padding = "6px";
    line.style.margin = "4px 0";
    line.textContent = `[PROMISE REJECTION] ${event.reason?.message || event.reason}`;
    container.appendChild(line);
    container.scrollTop = container.scrollHeight;
  }
};

// Global State
let state = null;

// Map coordinates for cyberpunk locations
const CYBER_COORDINATES = {
  "District 09": { x: 80, y: 150 },
  "Kabuki Market": { x: 150, y: 80 },
  "Arasaka Tower": { x: 220, y: 150 },
  "Chiba slums": { x: 150, y: 200 }
};

// Defensive initialization helper to prevent crashes (e.g. after resetGame)
function initializeStateDefaults() {
  let stateModified = false;
  if (!state.exploredLocations) {
    state.exploredLocations = {};
    stateModified = true;
  }
  if (!state.mapConnections) {
    state.mapConnections = [];
    stateModified = true;
  }
  if (Object.keys(state.exploredLocations).length === 0 && state.currentLocation) {
    state.exploredLocations[state.currentLocation] = {
      name: state.currentLocation,
      description: "Main sector.",
      coordinates: CYBER_COORDINATES[state.currentLocation] || { x: 150, y: 125 }
    };
    stateModified = true;
  }
  if (!state.options || !Array.isArray(state.options)) {
    if (state.currentLocation === "District 09") {
      state.options = [
        "Descend into the pulsing shadows.",
        "Strike a light against the encroaching rot.",
        "Force a connection with the screaming grid."
      ];
    } else if (state.currentLocation === "Kabuki Market") {
      state.options = [
        "Query the infodealer at the noodle stand",
        "Hack the Arasaka district relay",
        "Take transit down to Chiba City slums"
      ];
    } else if (state.currentLocation === "Chiba slums") {
      state.options = [
        "Search the cyberware junk heaps",
        "Hack the corporate terminal link",
        "Ride the Mag-Lev transit to Arasaka Tower"
      ];
    } else if (state.currentLocation === "Arasaka Tower") {
      state.options = [
        "Hack the mainframe database terminal",
        "Infiltrate the secure server vault",
        "Flee to the Chiba slums"
      ];
    } else {
      state.options = [
        "Scan surrounding frequencies",
        "Query terminal status",
        "Wait in shadows"
      ];
    }
    stateModified = true;
  }
  return stateModified;
}

// Initialize Game
function initGame() {
  // 1. Session Guard check
  const username = localStorage.getItem("neural_username");
  const session = localStorage.getItem("neural_session");

  if (!username || !session) {
    // Redirect to login page immediately if not authenticated
    window.location.href = "login.html";
    return;
  }

  // 2. Load Progress from Database session or Cache
  const cachedState = localStorage.getItem("neural_link_state");
  if (cachedState) {
    try {
      state = JSON.parse(cachedState);
    } catch (e) {
      console.error("Parse state error, loading from session instead", e);
      state = JSON.parse(session);
    }
  } else {
    // If fresh login, populate from database profile session details
    state = JSON.parse(session);
    localStorage.setItem("neural_link_state", JSON.stringify(state));
  }

  // Load Settings options
  const savedMode = localStorage.getItem("neural_link_mode") || "offline";
  const savedKey = localStorage.getItem("neural_link_key") || "";
  const savedTone = localStorage.getItem("neural_link_tone") || "cyber-noir";

  document.getElementById("engine-mode-select").value = savedMode;
  document.getElementById("gemini-api-key-input").value = savedKey;
  document.getElementById("story-tone-select").value = savedTone;

  toggleApiKeyField(savedMode);

  // Defensive initialization of state properties
  const stateModified = initializeStateDefaults();

  if (stateModified) {
    saveGame();
  }

  // Initialize UI panels
  renderAll();
  
  // Render story logs
  const storyContainer = document.getElementById("story-log-container");
  storyContainer.innerHTML = "";
  state.storyLog.forEach(log => appendStoryNode(log.role, log.text, false));
  scrollToBottom(storyContainer);

  // Render terminal logs
  const terminalContainer = document.getElementById("terminal-screen-container");
  terminalContainer.innerHTML = "";
  state.terminalLogs.forEach(log => appendTerminalNode(log.type, log.text));

  // Add system diagnostics to the screen
  appendTerminalNode("system", `[SYSTEM] --- NEURAL LINK DIAGNOSTICS ---`);
  appendTerminalNode("system", `[SYSTEM] User: ${username} | Class: ${state.player?.class}`);
  appendTerminalNode("system", `[SYSTEM] Location: ${state.currentLocation}`);
  appendTerminalNode("system", `[SYSTEM] Explored Nodes: ${Object.keys(state.exploredLocations).join(", ") || "None"}`);
  Object.values(state.exploredLocations).forEach(loc => {
    appendTerminalNode("system", `[SYSTEM]   -> ${loc.name} at (${loc.coordinates?.x}, ${loc.coordinates?.y})`);
  });
  appendTerminalNode("system", `[SYSTEM] ---------------------------------`);

  scrollToBottom(terminalContainer);

  setupEventListeners();
  showToast(`Welcome back, Operative ${username}`);
}

// Sync State back to local SQLite database
async function syncToDatabase() {
  const username = localStorage.getItem("neural_username");
  if (!username) return;

  try {
    const response = await fetch("/api/save_game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: username,
        state: state
      })
    });
    
    if (!response.ok) {
      console.error("Database sync failed:", response.statusText);
    }
  } catch (err) {
    console.error("Database sync network error:", err);
  }
}

function saveGame() {
  localStorage.setItem("neural_link_state", JSON.stringify(state));
  syncToDatabase();
}

function resetGame() {
  // Restore template defaults based on character class
  const session = JSON.parse(localStorage.getItem("neural_session"));
  if (!session) return;
  
  // Clear cache and pull initial profile structures
  localStorage.removeItem("neural_link_state");
  state = JSON.parse(JSON.stringify(session));
  initializeStateDefaults();
  saveGame();

  // Reset Containers
  const storyContainer = document.getElementById("story-log-container");
  storyContainer.innerHTML = "";
  state.storyLog.forEach(log => appendStoryNode(log.role, log.text, false));
  scrollToBottom(storyContainer);

  const terminalContainer = document.getElementById("terminal-screen-container");
  terminalContainer.innerHTML = "";
  state.terminalLogs.forEach(log => appendTerminalNode(log.type, log.text));
  scrollToBottom(terminalContainer);

  renderAll();
  showToast("SYSTEM REBOOTED");
}

function logoutSession() {
  // Clear credentials
  localStorage.removeItem("neural_username");
  localStorage.removeItem("neural_session");
  localStorage.removeItem("neural_link_state");
  
  showToast("Severing Neural Link...");
  setTimeout(() => {
    window.location.href = "login.html";
  }, 800);
}

// Render UI Elements
function renderAll() {
  // Bio Profile
  document.getElementById("player-name").textContent = state.player.name.toUpperCase();
  document.getElementById("player-level").textContent = `[LVL_${state.player.level} ${state.player.class.toUpperCase()}]`;

  // Bind dynamic portrait assets
  const portraitImg = document.getElementById("operative-portrait");
  const idTag = document.querySelector(".id-tag");
  const avatarCard = document.querySelector(".avatar-card img");

  if (state.player.class === "netrunner") {
    portraitImg.src = "cyberpunk_netrunner_portrait.png";
    idTag.textContent = "ID: #912-KTHORN";
  } else if (state.player.class === "samurai") {
    portraitImg.src = "cyberpunk_samurai_portrait.png";
    idTag.textContent = "ID: #304-JSTERLING";
  } else {
    portraitImg.src = "cyberpunk_operative_portrait.png";
    idTag.textContent = "ID: #008-EVANCE";
  }
  // Bind dynamic narrative banner asset
  const bannerImg = document.getElementById("narrative-banner");
  if (bannerImg) {
    if (state.currentLocation === "Kabuki Market") {
      bannerImg.src = "cyberpunk_kabuki_market.png";
    } else if (state.currentLocation === "Chiba slums") {
      bannerImg.src = "cyberpunk_chiba_slums.png";
    } else if (state.currentLocation === "Arasaka Tower") {
      bannerImg.src = "cyberpunk_arasaka_tower.png";
    } else {
      bannerImg.src = "cyberpunk_street_banner.png"; // District 09 default
    }
  }
  // Attribute progress lines
  document.getElementById("strength-val").textContent = `${state.player.stats.strength}/100`;
  document.getElementById("strength-bar").style.width = `${state.player.stats.strength}%`;
  document.getElementById("intelligence-val").textContent = `${state.player.stats.intelligence}/100`;
  document.getElementById("intelligence-bar").style.width = `${state.player.stats.intelligence}%`;
  document.getElementById("charisma-val").textContent = `${state.player.stats.charisma}/100`;
  document.getElementById("charisma-bar").style.width = `${state.player.stats.charisma}%`;

  // Map header and badges
  document.getElementById("location-name").textContent = state.currentLocation.toUpperCase().replace(" ", "_");
  document.getElementById("threat-level-badge").textContent = state.threatLevel;
  
  // Threat color styling
  const threatBadge = document.getElementById("threat-level-badge");
  if (state.threatLevel === "HIGH") {
    threatBadge.style.color = "var(--cyber-magenta)";
  } else if (state.threatLevel === "MEDIUM") {
    threatBadge.style.color = "var(--cyber-yellow)";
  } else {
    threatBadge.style.color = "var(--cyber-green)";
  }

  renderCargoGrid();
  renderThreadsList();
  renderOptionsGrid();
  renderRadarMap();
  updateTravelOptionsUI();
}

function renderCargoGrid() {
  const grid = document.getElementById("inventory-grid");
  grid.innerHTML = "";
  const maxSlots = 16;
  
  document.getElementById("cargo-count-text").textContent = `${state.inventory.length} / ${maxSlots} SLOTS`;

  for (let i = 0; i < maxSlots; i++) {
    const slot = document.createElement("div");
    slot.className = "cargo-slot";
    
    if (i < state.inventory.length) {
      const item = state.inventory[i];
      slot.classList.add("filled");
      slot.setAttribute("data-item-id", item.id);
      
      // Cyber icons
      let icon = "fa-microchip";
      if (item.type === "weapon") icon = "fa-shield-halved";
      else if (item.type === "hardware") icon = "fa-cpu";
      else if (item.type === "currency") icon = "fa-credit-card";
      else if (item.type === "quest") icon = "fa-key-skeleton";

      slot.innerHTML = `<i class="fa-solid ${icon}"></i>`;
      
      if (item.quantity > 1) {
        slot.innerHTML += `<span class="cargo-slot-qty">${item.quantity}</span>`;
      }
      
      // Active highlight check
      const detailPanel = document.getElementById("item-detail-panel");
      const activeId = detailPanel.getAttribute("data-active-item-id");
      if (activeId === item.id) {
        slot.classList.add("active");
      }

      slot.addEventListener("click", () => selectCargoItem(item));
    } else {
      slot.classList.add("empty");
      slot.innerHTML = `<i class="fa-solid fa-square-plus" style="opacity: 0.1;"></i>`;
    }
    
    grid.appendChild(slot);
  }
}

function selectCargoItem(item) {
  const panel = document.getElementById("item-detail-panel");
  panel.setAttribute("data-active-item-id", item.id);

  // Rerender active highlights
  const slots = document.querySelectorAll(".cargo-slot");
  slots.forEach(s => {
    if (s.getAttribute("data-item-id") === item.id) {
      s.classList.add("active");
    } else {
      s.classList.remove("active");
    }
  });

  let actionHTML = "";
  if (item.type === "hardware" || item.type === "weapon") {
    actionHTML = `<button onclick="useCargoItem('${item.id}')"><i class="fa-solid fa-bolt"></i> Overdrive</button>`;
  }
  
  panel.innerHTML = `
    <div class="cargo-detail-name">${item.name.toUpperCase()} [${item.type.toUpperCase()}]</div>
    <p class="cargo-detail-desc">${item.description}</p>
    <div class="cargo-actions">
      ${actionHTML}
      <button class="btn-discard" onclick="discardCargoItem('${item.id}')"><i class="fa-solid fa-trash-can"></i> PURGE</button>
    </div>
  `;
}

function clearCargoDetail() {
  const panel = document.getElementById("item-detail-panel");
  panel.removeAttribute("data-active-item-id");
  panel.innerHTML = `<p class="empty-cargo-text">Select a cargo slot to query status...</p>`;
}

// Global actions for inventory items
window.useCargoItem = function(itemId) {
  const item = state.inventory.find(i => i.id === itemId);
  if (!item) return;

  if (itemId === "plasma_blade" || itemId === "katana") {
    appendStoryNode("system", `>> SYSTEM NOTICE: OVERCLOCKING WEAPON MATRIX. STRENGTH OUTPUT ENHANCED.`);
    appendTerminalNode("system", `[SYSTEM] STRENGTH INFLATED (+5).`);
    state.player.stats.strength = Math.min(100, state.player.stats.strength + 5);
  } else if (itemId === "neural_chip" || itemId === "cyberdeck") {
    appendStoryNode("system", `>> SYSTEM NOTICE: OVERDRIVING HARDWARE COPROCESSOR. INTELLIGENCE CALIBRATED.`);
    appendTerminalNode("system", `[SYSTEM] INTELLIGENCE INFLATED (+5).`);
    state.player.stats.intelligence = Math.min(100, state.player.stats.intelligence + 5);
  }
  
  showToast("HARDWARE OVERDRIVE APPLIED");
  saveGame();
  renderAll();
};

window.discardCargoItem = function(itemId) {
  const idx = state.inventory.findIndex(i => i.id === itemId);
  if (idx === -1) return;
  
  const item = state.inventory[idx];
  appendStoryNode("system", `>> SYSTEM NOTICE: DELETED ${item.name.toUpperCase()} FROM MEMORY BANKS.`);
  appendTerminalNode("system", `[SYSTEM] PURGED CARGO SLOT: ${item.id}`);
  
  state.inventory.splice(idx, 1);
  clearCargoDetail();
  
  showToast(`PURGED: ${item.name.toUpperCase()}`);
  saveGame();
  renderAll();
};

function renderThreadsList() {
  const container = document.getElementById("quests-list-container");
  container.innerHTML = "";

  state.quests.forEach(q => {
    const el = document.createElement("div");
    el.className = "thread-item";
    if (state.trackedQuestId === q.id) {
      el.classList.add("active");
    }
    
    let label = "MAIN_FLOW";
    if (q.type === "side") label = "SIDE_THTR";
    else if (q.type === "lore") label = "LORE";

    el.innerHTML = `
      <div class="thread-header">
        <span class="thread-type ${q.type}">[${label}]</span>
        <span class="thread-status ${q.status}">${q.status.toUpperCase()}</span>
      </div>
      <div class="thread-name">${q.name}</div>
      <p class="thread-desc">${q.description}</p>
    `;
    el.addEventListener("click", () => selectQuestThread(q));
    container.appendChild(el);
  });
}

window.selectQuestThread = function(quest) {
  if (!quest) return;

  state.trackedQuestId = quest.id;
  renderThreadsList(); // Update highlight list
  
  showToast(`TRACKING THREAD: ${quest.name.toUpperCase()}`);
  
  // Auto-switch tab navigation to the Narrative tab
  const narrativeTabBtn = document.querySelector('.nav-item[data-target="panel-narrative"]');
  if (narrativeTabBtn) {
    narrativeTabBtn.click();
  }

  // Log to terminal & story console
  appendTerminalNode("system", `[SYSTEM] Sensor array focused on thread: ${quest.name}`);
  appendStoryNode("system", `>> SYSTEM NOTICE: Localizing sensor matrix to thread: ${quest.name}.`);

  // Provide character and story specific AI Core diagnostic guidance
  let hint = "";
  if (quest.id === "chrome_ghost") {
    hint = "AI_CORE: To recover the Chrome Ghost memory drive, you need to reach Arasaka Tower. Transition to Comic Mode to override security systems.";
  } else if (quest.id === "static_wire") {
    hint = "AI_CORE: Signal interference telemetry is localized in Kabuki Market. Travel to Kabuki and hack the district relay.";
  } else if (quest.id === "memory_frags") {
    hint = "AI_CORE: Vance's memory fragments are encoded in the story matrix. Enter Comic Mode to reconstruct his forgotten past.";
  } else if (quest.id === "hack_grid") {
    hint = "AI_CORE: The Kabuki Market subgrid holds the packet tracer. Hack the district relay node in Kabuki to trace the routing origin.";
  } else if (quest.id === "clear_sector") {
    hint = "AI_CORE: Arasaka patrol scouts are sweeping Chiba slums. Confront them or use physical brute force to clear the checkpoint.";
  } else if (quest.id === "infiltrate_tower") {
    hint = "AI_CORE: Arasaka Tower's server core is secured by lasers. Enter Comic Mode to download the Chrome Ghost memories.";
  } else {
    hint = `AI_CORE: Tracking telemetry verified for quest '${quest.name}'. Continue operations in active location.`;
  }

  state.terminalLogs.push({ type: "ai-talk", text: hint });
  appendTerminalNode("ai-talk", hint);
  
  state.storyLog.push({ role: "dialogue", text: `[DIALOGUE: AI_CORE] "${hint}"` });
  appendStoryNode("dialogue", `[DIALOGUE: AI_CORE] "${hint}"`, true);

  saveGame();
};

function renderOptionsGrid() {
  const container = document.getElementById("predefined-options-container");
  container.innerHTML = "";

  state.options.forEach((opt, idx) => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    
    let sub = "COMMENCE SYSTEM QUERY";
    if (opt.toLowerCase().includes("shadows") || opt.toLowerCase().includes("shadow")) sub = "PERCEPTION RESOLVE";
    else if (opt.toLowerCase().includes("rot") || opt.toLowerCase().includes("strike")) sub = "AGGRESSIVE CONFRONTATION";
    else if (opt.toLowerCase().includes("grid") || opt.toLowerCase().includes("connect")) sub = "SYSTEM INFILTRATION";
    else if (opt.toLowerCase().includes("transit") || opt.toLowerCase().includes("market")) sub = "LOCATION TRANSIT";
    else if (opt.toLowerCase().includes("infiltrate") || opt.toLowerCase().includes("download") || opt.toLowerCase().includes("mainframe")) sub = "SECURE DECRYPT";

    btn.innerHTML = `
      <span class="choice-title">${opt}</span>
      <span class="choice-sub">${sub}</span>
    `;
    btn.addEventListener("click", () => handleNarrativeCommand(opt));
    container.appendChild(btn);
  });
}

// Concentric Vector radar map
function renderRadarMap() {
  const svg = document.getElementById("world-map-svg");
  svg.setAttribute("viewBox", "0 0 300 250");
  svg.innerHTML = "";

  // Draw concentric radar circles
  const circles = [40, 80, 120];
  circles.forEach(r => {
    const c = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    c.setAttribute("cx", 150);
    c.setAttribute("cy", 130);
    c.setAttribute("r", r);
    c.setAttribute("fill", "none");
    c.setAttribute("stroke", "rgba(0, 240, 255, 0.08)");
    c.setAttribute("stroke-width", "0.75");
    c.setAttribute("stroke-dasharray", "3 6");
    svg.appendChild(c);
  });

  // Crosshairs lines
  const drawLine = (x1, y1, x2, y2) => {
    const l = document.createElementNS("http://www.w3.org/2000/svg", "line");
    l.setAttribute("x1", x1);
    l.setAttribute("y1", y1);
    l.setAttribute("x2", x2);
    l.setAttribute("y2", y2);
    l.setAttribute("stroke", "rgba(0, 240, 255, 0.04)");
    l.setAttribute("stroke-width", "1");
    svg.appendChild(l);
  };
  drawLine(150, 10, 150, 240);
  drawLine(10, 130, 290, 130);

  // Draw Discovered Nodes & Paths
  state.mapConnections.forEach(pair => {
    const c1 = state.exploredLocations[pair[0]]?.coordinates;
    const c2 = state.exploredLocations[pair[1]]?.coordinates;
    if (!c1 || !c2) return;

    const link = document.createElementNS("http://www.w3.org/2000/svg", "line");
    link.setAttribute("x1", c1.x);
    link.setAttribute("y1", c1.y);
    link.setAttribute("x2", c2.x);
    link.setAttribute("y2", c2.y);
    link.setAttribute("class", "map-link visited");
    svg.appendChild(link);
  });

  Object.values(state.exploredLocations).forEach(loc => {
    const coords = loc.coordinates;
    if (!coords) return;

    const isCurrent = loc.name === state.currentLocation;
    const group = document.createElementNS("http://www.w3.org/2000/svg", "g");

    if (isCurrent) {
      const outerRing = document.createElementNS("http://www.w3.org/2000/svg", "circle");
      outerRing.setAttribute("cx", coords.x);
      outerRing.setAttribute("cy", coords.y);
      outerRing.setAttribute("r", 9);
      outerRing.setAttribute("fill", "none");
      outerRing.setAttribute("stroke", "var(--cyber-cyan)");
      outerRing.setAttribute("stroke-width", "0.5");
      outerRing.setAttribute("opacity", "0.6");
      group.appendChild(outerRing);
    }

    const node = document.createElementNS("http://www.w3.org/2000/svg", "circle");
    node.setAttribute("cx", coords.x);
    node.setAttribute("cy", coords.y);
    node.setAttribute("r", isCurrent ? "5.5" : "4.5");
    node.setAttribute("class", `map-node visited ${isCurrent ? 'current' : ''}`);

    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = `${loc.name}: ${loc.description}`;
    node.appendChild(title);
    group.appendChild(node);

    // Label Text
    const txt = document.createElementNS("http://www.w3.org/2000/svg", "text");
    txt.setAttribute("x", coords.x);
    txt.setAttribute("y", coords.y - 10);
    txt.setAttribute("class", `map-node-label ${isCurrent ? 'current' : ''}`);
    txt.textContent = loc.name.toUpperCase();
    group.appendChild(txt);

    svg.appendChild(group);
  });
}

function updateTravelOptionsUI() {
  const container = document.getElementById("travel-options-container");
  const options = container.querySelectorAll(".travel-item");
  
  options.forEach(item => {
    item.classList.remove("active");
  });

  if (state.currentLocation === "District 09") {
    document.getElementById("transit-maglev").classList.add("active");
  } else if (state.currentLocation === "Kabuki Market") {
    document.getElementById("transit-streetrun").classList.add("active");
  } else {
    document.getElementById("transit-blackcab").classList.remove("locked");
    document.getElementById("transit-blackcab").classList.add("active");
    document.getElementById("transit-blackcab").innerHTML = `
      <span class="travel-name">BLACK CAB</span>
      <span class="travel-role">3m</span>
    `;
  }
}

// Story Console Append
function appendStoryNode(role, text, animate = true) {
  const container = document.getElementById("story-log-container");
  const entry = document.createElement("div");
  entry.className = `story-entry ${role}`;

  // Smart dialogue parser
  let isDialogue = role === "dialogue" || text.startsWith("[DIALOGUE:") || text.startsWith("[KHAELEN]") || text.startsWith("[AI_CORE]");
  let charName = "CONTACT";
  let dialogueText = text;

  // Attempt pattern match 1: [DIALOGUE: NAME] text
  let match = text.match(/^\[DIALOGUE:\s*([^\]]+)\]\s*(.*)/i);
  if (match) {
    isDialogue = true;
    charName = match[1].trim();
    dialogueText = match[2].trim();
  } else {
    // Attempt pattern match 2: [NAME]: text or NAME: text
    match = text.match(/^\[?([A-Za-z0-9_\s]{2,20})\]?:\s*(.*)/);
    if (match && !text.startsWith("http")) { // avoid matching web URLs
      isDialogue = true;
      charName = match[1].trim();
      dialogueText = match[2].trim();
    }
  }

  if (isDialogue) {
    // Remove outer quotes from dialogue text if present
    if (dialogueText.startsWith('"') && dialogueText.endsWith('"')) {
      dialogueText = dialogueText.slice(1, -1);
    }

    const isAI = charName.toUpperCase().includes("AI");
    const icon = isAI ? "fa-microchip" : "fa-user-ninja";
    
    entry.className = "story-dialogue-card";
    if (isAI) entry.classList.add("ai-card");
    
    entry.innerHTML = `
      <div class="story-avatar-badge ${isAI ? 'ai' : ''}">
        <i class="fa-solid ${icon}"></i>
      </div>
      <div class="story-dialogue-content">
        <span class="story-char-name">${charName.toUpperCase()}</span>
        <span class="story-dialogue-text">""</span>
      </div>
    `;
    
    container.appendChild(entry);
    entry.style.opacity = 1;
    scrollToBottom(container);

    const textSpan = entry.querySelector(".story-dialogue-text");
    if (animate) {
      let idx = 0;
      const speed = 12;
      
      function typeDialogue() {
        if (idx < dialogueText.length) {
          textSpan.textContent = `"${dialogueText.slice(0, idx + 1)}"`;
          idx++;
          scrollToBottom(container);
          setTimeout(typeDialogue, speed);
        }
      }
      typeDialogue();
    } else {
      textSpan.textContent = `"${dialogueText}"`;
    }
    return;
  }

  // Check if rolls card pattern (e.g. system rolls in narrative or terminal rolls)
  if (text.includes("CHECK: SUCCESS") || text.includes("CHECK: FAILED") || text.includes("CHECK: SUCCESS") || text.includes("CHECK: FAILED")) {
    const isSuccess = text.includes("SUCCESS");
    const icon = isSuccess ? "fa-dice-d20" : "fa-triangle-exclamation";
    
    entry.className = `story-roll-banner ${isSuccess ? 'success' : 'fail'}`;
    entry.innerHTML = `
      <i class="fa-solid ${icon} story-roll-icon"></i>
      <span>${text.replace("[", "").replace("]", "")}</span>
    `;
    
    container.appendChild(entry);
    entry.style.opacity = 1;
    scrollToBottom(container);
    return;
  }

  // Fallback to standard typing text
  container.appendChild(entry);
  
  if (animate && role !== "system") {
    let i = 0;
    const speed = 10;
    entry.style.opacity = 1;
    entry.textContent = "";
    
    function type() {
      if (i < text.length) {
        entry.textContent += text.charAt(i);
        i++;
        scrollToBottom(container);
        setTimeout(type, speed);
      }
    }
    type();
  } else {
    entry.textContent = text;
    entry.style.opacity = 1;
    scrollToBottom(container);
  }
}

// Terminal Append
function appendTerminalNode(type, text) {
  const container = document.getElementById("terminal-screen-container");
  const line = document.createElement("div");
  line.className = `terminal-line ${type}`;
  line.textContent = text;
  
  container.appendChild(line);
  scrollToBottom(container);
}

function scrollToBottom(el) {
  const scrollableParent = el.closest(".scrollable");
  if (scrollableParent) {
    scrollableParent.scrollTop = scrollableParent.scrollHeight;
  } else {
    el.scrollTop = el.scrollHeight;
  }
}

// Action Handlers
async function handleNarrativeCommand(actionText) {
  if (!actionText || actionText.trim() === "") return;

  state.storyLog.push({ role: "story", text: `> ${actionText}` });
  appendStoryNode("story", `> ${actionText}`, false);
  appendTerminalNode("player", `> ${actionText}`);

  // Help Interceptor for conversational help/advice
  const lowercaseAction = actionText.trim().toLowerCase();
  const isHelpQuery = lowercaseAction.startsWith("/help") || 
                      lowercaseAction.startsWith("/ask") || 
                      lowercaseAction.startsWith("/gemini") || 
                      lowercaseAction === "help" ||
                      lowercaseAction.startsWith("help ");

  if (isHelpQuery) {
    await handleHelpQuery(actionText);
    return;
  }

  document.getElementById("story-loader").style.display = "flex";
  document.getElementById("predefined-options-container").innerHTML = "";

  const mode = document.getElementById("engine-mode-select").value;

  try {
    let update = null;
    if (mode === "online") {
      update = await queryGeminiAPI(actionText);
    } else {
      update = await runOfflineHackingSimulation(actionText);
    }

    document.getElementById("story-loader").style.display = "none";
    applyHackingState(update);
  } catch (error) {
    document.getElementById("story-loader").style.display = "none";
    console.error("Narrative Controller Crash:", error);
    appendTerminalNode("system", `[ERROR] DECRYPTION OVERRUN: ${error.message}`);
    
    try {
      const fallback = await runOfflineHackingSimulation(actionText);
      applyHackingState(fallback);
    } catch (e) {
      showToast("CRITICAL KERNEL LOCK");
    }
  }
}

// Conversational AI Help Session Engine
async function handleHelpQuery(actionText) {
  let query = actionText.trim();
  if (query.toLowerCase().startsWith("/help")) query = query.slice(5).trim();
  else if (query.toLowerCase().startsWith("/ask")) query = query.slice(4).trim();
  else if (query.toLowerCase().startsWith("/gemini")) query = query.slice(7).trim();
  else if (query.toLowerCase().startsWith("help ")) query = query.slice(5).trim();
  else if (query.toLowerCase() === "help") query = "";

  appendTerminalNode("system", `[SYSTEM] ROUTING QUERY TO AI_CORE_OMEGA...`);
  
  const loader = document.getElementById("story-loader");
  if (loader) loader.style.display = "flex";

  const mode = document.getElementById("engine-mode-select").value;

  if (mode === "online" && query !== "") {
    const apiKey = document.getElementById("gemini-api-key-input").value.trim();
    if (!apiKey) {
      if (loader) loader.style.display = "none";
      appendTerminalNode("system", `[ERROR] Gemini API Key is missing. Enter a key in settings or use offline help.`);
      showOfflineHelp(query);
      return;
    }

    try {
      const responseText = await queryGeminiHelpAPI(query, apiKey);
      if (loader) loader.style.display = "none";
      
      state.terminalLogs.push({ type: "ai-talk", text: `AI_CORE: ${responseText}` });
      appendTerminalNode("ai-talk", `AI_CORE: ${responseText}`);
      saveGame();
    } catch (err) {
      if (loader) loader.style.display = "none";
      appendTerminalNode("system", `[ERROR] AI Core routing failure: ${err.message}`);
      showOfflineHelp(query);
    }
  } else {
    if (loader) loader.style.display = "none";
    showOfflineHelp(query);
  }
}

async function queryGeminiHelpAPI(query, apiKey) {
  const tone = document.getElementById("story-tone-select").value;
  
  const systemPrompt = `You are the Neural Link AI Assistant (AI_CORE_OMEGA) inside a cyberpunk RPG.
You provide helpful, immersive terminal tips and lore advice.
Active Player Character Details:
Name: ${state.player.name}
Class: ${state.player.class} (Level ${state.player.level})
Attributes: Strength ${state.player.stats.strength}/100, Intelligence ${state.player.stats.intelligence}/100, Charisma ${state.player.stats.charisma}/100
Current Location: ${state.currentLocation}
Inventory: ${JSON.stringify(state.inventory.map(i => i.name))}
Active Quests: ${JSON.stringify(state.quests.map(q => q.name + " (" + q.status + ")"))}

Tone Preset: "${tone}"

The player is asking you the following help/gameplay query: "${query}"

Provide a direct, helpful, and concise answer in character. Do not return JSON. Speak in terminal style. Keep it under 4 sentences.`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 200
      }
    })
  });

  if (!response.ok) {
    throw new Error(response.statusText);
  }

  const resJson = await response.json();
  const textVal = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textVal) throw new Error("Empty AI Core response");
  
  return textVal.trim();
}

function showOfflineHelp(query) {
  const q = query.toLowerCase().trim();
  
  let helpText = "";
  if (q.includes("stat") || q.includes("strength") || q.includes("intelligence") || q.includes("charisma")) {
    helpText = "AI_CORE: Attributes determine your chance of success during checks. Strength is used for physical challenges, Intelligence for hacking encryption, and Charisma for speech negotiations. Overdrive weapons/hardware in cargo slots to boost stats.";
  } else if (q.includes("map") || q.includes("travel") || q.includes("transit")) {
    helpText = "AI_CORE: The world map tracks explored locations. Initiate deployment to travel. Explored connections allow travel to adjacent districts (District 09, Kabuki Market, Chiba slums, Arasaka Tower).";
  } else if (q.includes("quest") || q.includes("chrome") || q.includes("wire")) {
    helpText = "AI_CORE: Current active threads are tracked in your cargo profile panel. Complete main story steps to resolve 'The Chrome Ghost' and 'Infiltrate Arasaka Mainframe'.";
  } else if (q.includes("inventory") || q.includes("cargo") || q.includes("item") || q.includes("purge")) {
    helpText = "AI_CORE: Your cargo hold has 16 slots. Select items to 'Purge' them or 'Overdrive' hardware items (like Plasma Blade/Breaching Cyberdeck) for permanent stat increases.";
  } else if (q.includes("comic") || q.includes("story") || q.includes("panel")) {
    helpText = "AI_CORE: Comic Mode is a dedicated visual narrating deck. Click the COMIC MODE button on Panel 1. Solve Q&A checks to rolling D20 dice and unlock outcomes.";
  } else {
    helpText = "AI_CORE: Offline help database active. Ask about: 'stats', 'map', 'quests', 'inventory', or 'comic' (e.g., type '/help stats'). Toggle 'Online' mode with a Gemini API key in settings for real-time cyber AI feedback.";
  }

  state.terminalLogs.push({ type: "ai-talk", text: helpText });
  appendTerminalNode("ai-talk", helpText);
  saveGame();
}

// Gemini Cyber Hacking Queries
async function queryGeminiAPI(playerAction) {
  const apiKey = document.getElementById("gemini-api-key-input").value.trim();
  if (!apiKey) {
    throw new Error("Missing Gemini API Key. Swap to Offline Mode or enter a valid key in settings.");
  }
  
  const tone = document.getElementById("story-tone-select").value;

  const context = {
    player: state.player,
    inventory: state.inventory,
    quests: state.quests,
    currentLocation: state.currentLocation,
    exploredLocations: Object.keys(state.exploredLocations),
    history: state.storyLog.slice(-5).map(e => `${e.role === 'story' && e.text.startsWith('>') ? 'Operative' : 'System'}: ${e.text}`)
  };

  const systemPrompt = `You are the Neural Link AI Core (Dungeon Master) directing a grim cyber-noir RPG.
Current Game State:
Operative: ${JSON.stringify(context.player)}
Cargo: ${JSON.stringify(context.inventory)}
Narrative Threads: ${JSON.stringify(context.quests)}
Current Location: "${context.currentLocation}"
Explored Districts: ${JSON.stringify(context.exploredLocations)}
District Logs:
${context.history.join("\n")}

Writing Tone Preset: "${tone}" (grim noir cyber-slang, grid logs)

The operative executes the following action: "${playerAction}"

Evaluate this action. Run a system roll/dice check if applicable (e.g. Perception, Strength, Intelligence hack) and write the results.
You must respond ONLY with a single JSON payload. Do NOT write any markdown ticks (\`\`\`json) or text outer wrappers.

Expected Output Schema:
{
  "narration": "Detailed descriptive paragraphs (cyberpunk tone, heavy rain, chrome details, street jargon) narrating the result of the action.",
  "dialogue": "[DIALOGUE: CHAR_NAME] \"Spoken text here...\" (Optional dialogue line from a contact like KHAELEN, AI_CORE, or a street vendor).",
  "currentLocation": "New Location Name (District 09, Kabuki Market, Arasaka Tower, Chiba slums)",
  "locationDescription": "Brief description of the district",
  "mapCoords": { "x": 120, "y": 80 }, // Coordinate maps if new location. X (40-260), Y (40-220) on 300x250 canvas grid.
  "threatLevel": "LOW|MEDIUM|HIGH",
  "terminalLogs": [
    "[SYSTEM] INFILTRATING SECURITY SUITE...",
    "[INTELLIGENCE CHECK: SUCCESS] - Decrypted Arasaka grid nodes.",
    "AI_CORE: Connection to Arasaka DB established."
  ],
  "statChanges": {
    "strength": 0,
    "intelligence": 0,
    "charisma": 0
  },
  "inventoryChanges": {
    "add": [
      {
        "id": "item_id_snake_case",
        "name": "Display Name",
        "type": "weapon|hardware|currency|quest",
        "quantity": 1,
        "description": "Short utility description"
      }
    ],
    "remove": ["item_id_to_remove"]
  },
  "questChanges": {
    "update": [
      { "id": "thread_id", "status": "completed" }
    ],
    "add": [
      { "id": "thread_id", "name": "Thread Name", "description": "Thread detail...", "type": "main|side|lore", "status": "active" }
    ]
  },
  "options": [
    "Narrative option 1",
    "Narrative option 2",
    "Narrative option 3"
  ]
}`;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: systemPrompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.75
      }
    })
  });

  if (!response.ok) {
    const errObj = await response.json().catch(() => ({}));
    throw new Error(errObj.error?.message || response.statusText);
  }

  const resJson = await response.json();
  const textVal = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!textVal) throw new Error("Empty AI Core response");

  return cleanAndDecode(textVal);
}

function cleanAndDecode(raw) {
  let cleaned = raw.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\n?/i, "");
    cleaned = cleaned.replace(/\n?```$/i, "");
  }
  return JSON.parse(cleaned.trim());
}

// State Update Applicator
function applyHackingState(update) {
  state.storyLog.push({ role: "story", text: update.narration });
  appendStoryNode("story", update.narration, true);

  if (update.dialogue) {
    state.storyLog.push({ role: "dialogue", text: update.dialogue });
    appendStoryNode("dialogue", update.dialogue, true);
  }

  const prevLoc = state.currentLocation;
  const newLoc = update.currentLocation;
  if (newLoc && newLoc !== prevLoc) {
    state.currentLocation = newLoc;
    state.threatLevel = update.threatLevel || "MEDIUM";

    if (!state.exploredLocations[newLoc]) {
      const coords = update.mapCoords || {
        x: Math.floor(Math.random() * 200) + 50,
        y: Math.floor(Math.random() * 150) + 40
      };
      
      state.exploredLocations[newLoc] = {
        name: newLoc,
        description: update.locationDescription || "A newly breached sector grid.",
        coordinates: coords
      };
    }

    const linked = state.mapConnections.some(pair =>
      (pair[0] === prevLoc && pair[1] === newLoc) ||
      (pair[0] === newLoc && pair[1] === prevLoc)
    );
    if (!linked) {
      state.mapConnections.push([prevLoc, newLoc]);
    }

    showToast(`BREACHED SECTOR: ${newLoc.toUpperCase()}`);
    appendTerminalNode("system", `[SYSTEM] BREACHED NODE PATH: ${prevLoc} -> ${newLoc}`);
  }

  if (update.terminalLogs && Array.isArray(update.terminalLogs)) {
    update.terminalLogs.forEach(line => {
      let type = "system";
      if (line.includes("SUCCESS")) type = "roll-result";
      else if (line.startsWith("AI_CORE") || line.startsWith("AI")) type = "ai-talk";
      
      state.terminalLogs.push({ type, text: line });
      appendTerminalNode(type, line);
    });
  }

  if (update.statChanges) {
    const sc = update.statChanges;
    if (sc.strength) {
      state.player.stats.strength = Math.min(100, Math.max(0, state.player.stats.strength + sc.strength));
      showToast(`STR ADJUSTED: ${sc.strength > 0 ? '+' + sc.strength : sc.strength}`);
    }
    if (sc.intelligence) {
      state.player.stats.intelligence = Math.min(100, Math.max(0, state.player.stats.intelligence + sc.intelligence));
      showToast(`INT ADJUSTED: ${sc.intelligence > 0 ? '+' + sc.intelligence : sc.intelligence}`);
    }
    if (sc.charisma) {
      state.player.stats.charisma = Math.min(100, Math.max(0, state.player.stats.charisma + sc.charisma));
      showToast(`CHA ADJUSTED: ${sc.charisma > 0 ? '+' + sc.charisma : sc.charisma}`);
    }
  }

  if (update.inventoryChanges) {
    const inv = update.inventoryChanges;
    if (inv.remove && Array.isArray(inv.remove)) {
      inv.remove.forEach(id => {
        const idx = state.inventory.findIndex(item => item.id === id);
        if (idx !== -1) {
          appendTerminalNode("system", `[SYSTEM] PURGED LOG ENTRY: ${state.inventory[idx].name}`);
          state.inventory.splice(idx, 1);
        }
      });
    }
    if (inv.add && Array.isArray(inv.add)) {
      inv.add.forEach(newItem => {
        const existing = state.inventory.find(item => item.id === newItem.id);
        if (existing) {
          existing.quantity += (newItem.quantity || 1);
        } else {
          state.inventory.push({
            id: newItem.id,
            name: newItem.name,
            type: newItem.type || "other",
            quantity: newItem.quantity || 1,
            description: newItem.description || "Synthesised hardware asset."
          });
        }
        appendTerminalNode("system", `[SYSTEM] RECONSTRUCTED MEMORY SECTOR: ${newItem.name}`);
        showToast(`CARGO ADDED: ${newItem.name}`);
      });
    }
  }

  if (update.questChanges) {
    const qc = update.questChanges;
    if (qc.add && Array.isArray(qc.add)) {
      qc.add.forEach(q => {
        const exist = state.quests.some(ex => ex.id === q.id);
        if (!exist) {
          state.quests.push({
            id: q.id,
            name: q.name,
            description: q.description,
            type: q.type || "side",
            status: "active"
          });
          showToast(`NARRATIVE UPDATE: ${q.name}`);
        }
      });
    }
    if (qc.update && Array.isArray(qc.update)) {
      qc.update.forEach(up => {
        const quest = state.quests.find(q => q.id === up.id);
        if (quest) {
          quest.status = up.status;
          if (up.status === "completed") {
            showToast(`RESOLVED THREAD: ${quest.name}`);
          }
        }
      });
    }
  }

  if (update.options && Array.isArray(update.options)) {
    state.options = update.options;
  } else {
    state.options = ["Scan surrounding frequencies", "Query terminal status", "Wait in shadows"];
  }

  saveGame();
  renderAll();
}

// Offline Cyberpunk Campaign Engine
function runOfflineHackingSimulation(actionText) {
  return new Promise((resolve) => {
    setTimeout(() => {
      const act = actionText.toLowerCase();
      const currentLoc = state.currentLocation;
      
      let out = {
        narration: "",
        dialogue: null,
        currentLocation: currentLoc,
        locationDescription: state.locationDescription,
        mapCoords: null,
        threatLevel: state.threatLevel,
        terminalLogs: [],
        statChanges: { strength: 0, intelligence: 0, charisma: 0 },
        inventoryChanges: { add: [], remove: [] },
        questChanges: { add: [], update: [] },
        options: []
      };

      if (currentLoc === "District 09") {
        if (act.includes("shadows") || act.includes("descend")) {
          out.narration = "You creep down the narrow alleyway. The air is warm and smells of damp iron and ozone. In the darkness, you locate a discarded syndicate courier rig covered in black grime. Wiping it down reveals a live fiber port.";
          out.dialogue = "[DIALOGUE: KHAELEN] \"Good. That port connects to the Kabuki sub-network. Infiltrate it and look for the infodealer.\"";
          
          out.terminalLogs.push("[PERCEPTION CHECK: SUCCESS] - Revealed hidden terminal link in District 09.");
          out.terminalLogs.push("[SYSTEM] CONNECTION SECURED. BUFFER ALLOCATED.");
          
          out.inventoryChanges.add.push({
            id: "data_decryptor",
            name: "Hacking Rig",
            type: "hardware",
            quantity: 1,
            description: "A handheld syndicate decryption tool for tapping municipal lines."
          });
          out.statChanges.intelligence = 2;
          
          out.options = [
            "Hack the nearby public terminal",
            "Ride the Mag-Lev transit to Kabuki Market"
          ];
        } else if (act.includes("rot") || act.includes("strike")) {
          out.narration = "You draw your weapon and strike! Two corporate scouts in tactical plating emerge from the steam pipes. Your blade sizzles as it slices their armor. They recoil, retreating back into the smog-filled vents.";
          
          out.terminalLogs.push("[STRENGTH CHECK: SUCCESS] - Banished Arasaka security scouts.");
          out.terminalLogs.push("[SYSTEM] DISCHARGED WEAPON MATRIX.");
          
          out.statChanges.strength = 3;
          out.options = [
            "Descend into the pulsing shadows.",
            "Ride the Mag-Lev transit to Kabuki Market"
          ];
        } else if (act.includes("grid") || act.includes("screaming") || act.includes("force")) {
          out.narration = "You tap into the buzzing utility lines of the district. The datastream is a messy, roaring current of code. Your neural co-processor filters the static, downloading an override blueprint for transit gates.";
          
          out.terminalLogs.push("[INTELLIGENCE CHECK: SUCCESS] - Overloaded gate firewalls.");
          out.terminalLogs.push("[SYSTEM] RECONSTRUCTED: TRANSIT_OVERRIDE.DAT");
          
          out.inventoryChanges.add.push({
            id: "transit_pass",
            name: "Transit Bypass",
            type: "quest",
            quantity: 1,
            description: "A spoofed token allowing free access to mag-lev tubes."
          });
          out.statChanges.intelligence = 4;
          
          out.options = [
            "Descend into the pulsing shadows.",
            "Ride the Mag-Lev transit to Kabuki Market"
          ];
        } else if (act.includes("kabuki") || act.includes("ride") || act.includes("mag-lev")) {
          out.narration = "You slide your transit token into the Mag-Lev turnstile. The bullet capsule arrives with a low static hiss. You step inside, and seconds later the train rockets through tube tunnels, emerging at the neon bazaar of Kabuki Market.";
          
          out.currentLocation = "Kabuki Market";
          out.locationDescription = "A packed multi-level night market lit by holograms.";
          out.mapCoords = CYBER_COORDINATES["Kabuki Market"];
          out.threatLevel = "LOW";
          
          out.terminalLogs.push("[SYSTEM] TRANSIT COMPLETED. DISTRICT REGISTERED: KABUKI_MARKET");
          out.questChanges.update.push({ id: "static_wire", status: "completed" });
          
          out.options = [
            "Query the infodealer at the noodle stand",
            "Hack the Arasaka district relay",
            "Take transit down to Chiba City slums"
          ];
        } else {
          out.narration = `You perform: "${actionText}". The neon lights reflect off your synthetic leather coat. You can explore the shadows, challenge the scouts, or catch the mag-lev to the market.`;
          out.options = [
            "Descend into the pulsing shadows.",
            "Strike a light against the encroaching rot.",
            "Force a connection with the screaming grid."
          ];
        }
      }
      else if (currentLoc === "Kabuki Market") {
        if (act.includes("infodealer") || act.includes("noodle") || act.includes("query")) {
          out.narration = "You approach a street vendor boiling synthetic noodles under a blue projection. The dealer, a cyborg with optical lenses, nods. In exchange for your Syndicate Cred-Key, he slips you an Arasaka mainframe access protocol.";
          
          const hasCred = state.inventory.some(i => i.id === "cred_key");
          if (hasCred) {
            out.inventoryChanges.remove.push("cred_key");
            out.inventoryChanges.add.push({
              id: "mainframe_pass",
              name: "Mainframe Protocol",
              type: "quest",
              quantity: 1,
              description: "Decryption scripts to bypass the security wall at Arasaka Tower."
            });
            out.terminalLogs.push("[CHARISMA CHECK: SUCCESS] - Convinced infodealer to trade codes.");
            out.terminalLogs.push("[SYSTEM] DOWNLOADED ACCESS_PROTOCOL.SH");
            out.statChanges.charisma = 5;
            out.questChanges.update.push({ id: "chrome_ghost", status: "completed" });
            out.questChanges.add.push({
              id: "infiltrate_tower",
              name: "Infiltrate Arasaka Mainframe",
              description: "Breach the Arasaka tower central terminal using the infodealer's protocols.",
              status: "active",
              type: "main"
            });
          } else {
            out.narration = "The dealer refuses to talk. \"Syndicate credits first, Operative. I don't give away code blocks for free.\"";
            out.terminalLogs.push("[CHARISMA CHECK: FAILED] - Insufficient credits to query vendor.");
          }
          out.options = [
            "Hack the Arasaka district relay",
            "Take transit down to Chiba City slums"
          ];
        } else if (act.includes("relay") || act.includes("hack the arasaka")) {
          const hasRig = state.inventory.some(i => i.id === "data_decryptor") || state.player.class === "netrunner";
          if (hasRig) {
            out.narration = "You hook your decryptor rig into the Arasaka district node. Command interfaces fly across your visor screen. You bypass their security sweeps, gaining regional credentials.";
            out.terminalLogs.push("[INTELLIGENCE CHECK: SUCCESS] - Breached district relay.");
            out.terminalLogs.push("[SYSTEM] LOCAL GRID ACCESS LEVEL: ADMIN.");
            out.statChanges.intelligence = 6;
          } else {
            out.narration = "You try to tap the fiber line with bare implants, but the security buffer pushes you out. You need a specialized hacking rig to parse their encryption.";
            out.terminalLogs.push("[INTELLIGENCE CHECK: FAILED] - Insufficient decrypters.");
          }
          out.options = [
            "Query the infodealer at the noodle stand",
            "Take transit down to Chiba City slums"
          ];
        } else if (act.includes("slums") || act.includes("chiba") || act.includes("transit")) {
          out.narration = "You ride the cargo freight lift down to the lowest sector of Neo-Tokyo. Chiba slums are a grid of rust-coated shacks, dangling wiring, and toxic puddles. Steam hissed from the grates.";
          
          out.currentLocation = "Chiba slums";
          out.locationDescription = "The dark underbelly of Neo-Tokyo covered in smog.";
          out.mapCoords = CYBER_COORDINATES["Chiba slums"];
          out.threatLevel = "HIGH";
          
          out.terminalLogs.push("[SYSTEM] BREACHED NODE PATH: KABUKI -> CHIBA_SLUMS");
          
          out.options = [
            "Search the cyberware junk heaps",
            "Hack the corporate terminal link",
            "Ride the Mag-Lev transit to Arasaka Tower"
          ];
        } else {
          out.narration = `You perform: "${actionText}". Neon ads flicker. You can check the noodle vendor, hack the relay node, or head down to the slums.`;
          out.options = [
            "Query the infodealer at the noodle stand",
            "Hack the Arasaka district relay",
            "Take transit down to Chiba City slums"
          ];
        }
      }
      else if (currentLoc === "Chiba slums") {
        if (act.includes("junk") || act.includes("search")) {
          out.narration = "You sift through piles of discarded electronics. Beneath rusted server sheets, you recover a high-capacity RAM chip that looks functional.";
          out.inventoryChanges.add.push({
            id: "ram_chip",
            name: "Syndicate RAM Card",
            type: "hardware",
            quantity: 1,
            description: "Improves data decryption processing speeds."
          });
          out.terminalLogs.push("[PERCEPTION CHECK: SUCCESS] - Salvaged rare RAM components.");
          out.statChanges.intelligence = 2;
          
          out.options = [
            "Hack the corporate terminal link",
            "Ride the Mag-Lev transit to Arasaka Tower"
          ];
        } else if (act.includes("link") || act.includes("corporate")) {
          out.narration = "You tap into a corporate communications link. You siphon off encrypted logs detailing syndicate plans and security profiles of the Arasaka Tower gate buffers.";
          out.inventoryChanges.add.push({
            id: "sec_logs",
            name: "Syndicate Logs",
            type: "quest",
            quantity: 1,
            description: "Encrypted logs mapping out tower access paths."
          });
          out.terminalLogs.push("[INTELLIGENCE CHECK: SUCCESS] - Siphoned regional data buffers.");
          out.statChanges.intelligence = 4;
          
          out.options = [
            "Search the cyberware junk heaps",
            "Ride the Mag-Lev transit to Arasaka Tower"
          ];
        } else if (act.includes("arasaka") || act.includes("tower") || act.includes("ride")) {
          out.narration = "You step into the express mag-lev elevator. It climbs past the clouds, stopping at the high-security lobby of Arasaka Tower. Turrets hum, tracking your bio-signature.";
          
          out.currentLocation = "Arasaka Tower";
          out.locationDescription = "The towering glass corporate headquarters of Arasaka.";
          out.mapCoords = CYBER_COORDINATES["Arasaka Tower"];
          out.threatLevel = "HIGH";
          
          out.terminalLogs.push("[SYSTEM] SECTOR INTRUSION DETECTED. ENFORCERS STANDING BY.");
          
          out.options = [
            "Hack the mainframe database terminal",
            "Infiltrate the secure server vault",
            "Flee to the Chiba slums"
          ];
        } else {
          out.options = [
            "Search the cyberware junk heaps",
            "Hack the corporate terminal link",
            "Ride the Mag-Lev transit to Arasaka Tower"
          ];
        }
      }
      else if (currentLoc === "Arasaka Tower") {
        if (act.includes("mainframe") || act.includes("hack the mainframe")) {
          const hasPass = state.inventory.some(i => i.id === "mainframe_pass");
          if (hasPass) {
            out.narration = "You plug in the Mainframe Protocol. The screen terminal goes green as the security walls crumble. You download the decrypted Chrome Ghost files. The data reveals that Vance was actually the architect of the AI Core Omega!";
            out.terminalLogs.push("[INTELLIGENCE CHECK: SUCCESS] - Mainframe database fully breached.");
            out.terminalLogs.push("AI_CORE: Mainframe access granted. Memory sector restored.");
            out.questChanges.update.push({ id: "infiltrate_tower", status: "completed" });
            out.questChanges.update.push({ id: "memory_frags", status: "completed" });
            
            out.options = ["Reset System Deck in Settings drawer to begin a new run."];
          } else {
            out.narration = "You try to hack the terminal, but the security sweeps identify your signatures. Security grids blast your neural interface with bio-electric shocks, knocking you back!";
            out.terminalLogs.push("[INTELLIGENCE CHECK: FAILED] - Alert triggered. Neural feedback loop active.");
            out.statChanges.strength = -10;
            out.options = [
              "Infiltrate the secure server vault",
              "Flee to the Chiba slums"
            ];
          }
        } else if (act.includes("vault") || act.includes("infiltrate")) {
          out.narration = "You bypass the secondary enforcers and break into the security vault. You find a high-tech laser carbine resting on an assembly deck. You slot it in your cargo hold.";
          out.inventoryChanges.add.push({
            id: "laser_carbine",
            name: "Laser Carbine",
            type: "weapon",
            quantity: 1,
            description: "High-yield laser weapon for melting corporate enforcer plates."
          });
          out.terminalLogs.push("[STEALTH CHECK: SUCCESS] - Siphoned secure vault assets.");
          out.options = [
            "Hack the mainframe database terminal",
            "Flee to the Chiba slums"
          ];
        } else if (act.includes("flee") || act.includes("slums")) {
          out.narration = "You leap into the waste disposal chute, sliding down to the ventilation ducts of Chiba slums, escaping the enforcers' sweeps.";
          out.currentLocation = "Chiba slums";
          out.threatLevel = "HIGH";
          out.options = [
            "Search the cyberware junk heaps",
            "Hack the corporate terminal link",
            "Ride the Mag-Lev transit to Arasaka Tower"
          ];
        } else {
          out.options = [
            "Hack the mainframe database terminal",
            "Infiltrate the secure server vault",
            "Flee to the Chiba slums"
          ];
        }
      }

      resolve(out);
    }, 400);
  });
}

// DOM Event Listeners
function setupEventListeners() {
  // Mobile Tab navigation
  const navItems = document.querySelectorAll(".nav-item");
  navItems.forEach(item => {
    item.addEventListener("click", () => {
      const targetPanelId = item.getAttribute("data-target");
      
      navItems.forEach(n => n.classList.remove("active"));
      item.classList.add("active");
      
      const panels = document.querySelectorAll(".deck-panel");
      panels.forEach(p => p.classList.remove("active"));
      
      const targetPanel = document.getElementById(targetPanelId);
      targetPanel.classList.add("active");
      
      showToast(`Tab Swapped: ${targetPanelId.replace("panel-", "").toUpperCase()}`);
    });
  });

  // Settings drawer open/close
  const settingsBtn = document.getElementById("settings-trigger-btn");
  const closeBtn = document.getElementById("settings-close-btn");
  const drawer = document.getElementById("settings-drawer-container");
  
  settingsBtn.addEventListener("click", () => {
    drawer.classList.add("open");
  });
  
  closeBtn.addEventListener("click", () => {
    drawer.classList.remove("open");
  });

  // Eye toggle for API keys in drawer
  document.getElementById("toggle-key-visibility").addEventListener("click", () => {
    const input = document.getElementById("gemini-api-key-input");
    const icon = document.querySelector("#toggle-key-visibility i");
    if (input.type === "password") {
      input.type = "text";
      icon.className = "fa-solid fa-eye-slash";
    } else {
      input.type = "password";
      icon.className = "fa-solid fa-eye";
    }
  });

  // Mode select
  document.getElementById("engine-mode-select").addEventListener("change", (e) => {
    const mode = e.target.value;
    localStorage.setItem("neural_link_mode", mode);
    toggleApiKeyField(mode);
    showToast(`Engine Core: ${mode.toUpperCase()} mode enabled`);
  });

  // Save key
  document.getElementById("gemini-api-key-input").addEventListener("input", (e) => {
    localStorage.setItem("neural_link_key", e.target.value.trim());
  });

  // Tone choice
  document.getElementById("story-tone-select").addEventListener("change", (e) => {
    localStorage.setItem("neural_link_tone", e.target.value);
    showToast(`Narrator matrix: ${e.target.value.toUpperCase()}`);
  });

  // Reset System deck button
  document.getElementById("reset-game-btn").addEventListener("click", () => {
    resetGame();
    drawer.classList.remove("open");
  });

  // Disconnect Session (Logout) button
  document.getElementById("logout-session-btn").addEventListener("click", () => {
    logoutSession();
    drawer.classList.remove("open");
  });

  // Custom terminal command input
  document.getElementById("custom-action-btn").addEventListener("click", triggerTerminalCommand);
  document.getElementById("custom-action-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") triggerTerminalCommand();
  });

  // Deployment trigger button on Map panel
  document.getElementById("initiate-deployment-btn").addEventListener("click", () => {
    const narrativeNavBtn = document.querySelector('.nav-item[data-target="panel-narrative"]');
    if (narrativeNavBtn) narrativeNavBtn.click();
    
    // Trigger transition based on starting location
    let transitionTarget = "Ride the Mag-Lev transit to Kabuki Market";
    if (state.currentLocation === "Kabuki Market") {
      transitionTarget = "Take transit down to Chiba City slums";
    } else if (state.currentLocation === "Chiba slums") {
      transitionTarget = "Ride the Mag-Lev transit to Arasaka Tower";
    }
    
    handleNarrativeCommand(transitionTarget);
  });

  // Map controls zoom triggers
  document.getElementById("map-zoom-in").addEventListener("click", () => {
    showToast("Map Grid Zoom: +15%");
  });
  document.getElementById("map-zoom-out").addEventListener("click", () => {
    showToast("Map Grid Zoom: -15%");
  });

  // CCTV Interactive Video Panel Setup
  initCCTV();
}

function toggleApiKeyField(mode) {
  const grp = document.getElementById("api-key-group");
  if (mode === "online") {
    grp.style.display = "flex";
  } else {
    grp.style.display = "none";
  }
}

function triggerTerminalCommand() {
  const input = document.getElementById("custom-action-input");
  const textVal = input.value.trim();
  if (textVal === "") return;

  input.value = "";
  handleNarrativeCommand(textVal);
}

// Toast alerts system
function showToast(message) {
  const toast = document.getElementById("toast-notification");
  toast.textContent = message;
  toast.style.display = "flex";

  if (window.toastTimeout) clearTimeout(window.toastTimeout);
  window.toastTimeout = setTimeout(() => {
    toast.style.display = "none";
  }, 2500);
}


// ==========================================================================
// CCTV INTERACTIVE SURVEILLANCE VIDEO LOGIC
// ==========================================================================
let cctvActive = false;
let currentCamIndex = 0;
const cctvCams = [
  { id: "CAM_01_STREET", name: "CAM_01: STREET_FEED", type: "video" },
  { id: "CAM_02_MATRIX", name: "CAM_02: SECURE_MATRIX", type: "matrix" },
  { id: "CAM_03_RADAR", name: "CAM_03: RADAR_SONAR", type: "sonar" }
];
let canvasAnimId = null;
let glitchActive = false;
let matrixDrops = [];
let sonarAngle = 0;
let sonarBlips = [];

function initCCTV() {
  const toggleBtn = document.getElementById("toggle-cctv-feed");
  const prevCamBtn = document.getElementById("cctv-prev-cam");
  const nextCamBtn = document.getElementById("cctv-next-cam");

  if (toggleBtn) {
    toggleBtn.addEventListener("click", toggleCCTVFeed);
  }
  if (prevCamBtn) {
    prevCamBtn.addEventListener("click", () => switchCamera(-1));
  }
  if (nextCamBtn) {
    nextCamBtn.addEventListener("click", () => switchCamera(1));
  }

  // Handle window resizing for canvas overlays
  window.addEventListener("resize", resizeCCTVCanvas);
}

function toggleCCTVFeed() {
  const video = document.getElementById("narrative-video");
  const canvas = document.getElementById("cctv-effects-canvas");
  const banner = document.getElementById("narrative-banner");
  const hud = document.getElementById("cctv-hud-panel");
  const switcher = document.getElementById("cctv-switcher-group");
  const toggleText = document.getElementById("cctv-toggle-text");
  
  cctvActive = !cctvActive;
  
  if (cctvActive) {
    // Activate Live Feed
    banner.style.display = "none";
    video.style.display = "block";
    canvas.style.display = "block";
    hud.style.display = "flex";
    switcher.style.display = "flex";
    toggleText.textContent = "SHUT DOWN";

    // Set video src if empty
    if (!video.src) {
      video.src = "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/TearsOfSteel.mp4";
    }

    resizeCCTVCanvas();
    switchCamera(0); // Trigger first load

    appendTerminalNode("system", "[SYSTEM] CCTV INTERFACE ONLINE. BYPASSING MUNICIPAL GRID...");
    showToast("SURVEILLANCE FEED ONLINE");
  } else {
    // Shut down feed
    video.pause();
    video.style.display = "none";
    canvas.style.display = "none";
    hud.style.display = "none";
    switcher.style.display = "none";
    banner.style.display = "block";
    toggleText.textContent = "ACTIVATE FEED";

    if (canvasAnimId) {
      cancelAnimationFrame(canvasAnimId);
      canvasAnimId = null;
    }

    appendTerminalNode("system", "[SYSTEM] SURVEILLANCE FEED SEVERED.");
    showToast("FEED CONNECT TERMINATED");
  }
}

function switchCamera(dir) {
  if (!cctvActive) return;

  glitchActive = true;
  currentCamIndex = (currentCamIndex + dir + cctvCams.length) % cctvCams.length;
  const currentCam = cctvCams[currentCamIndex];
  
  // Set camera HUD labels
  document.getElementById("cctv-cam-id").textContent = currentCam.name;
  
  const video = document.getElementById("narrative-video");
  if (currentCam.type === "video") {
    video.style.display = "block";
    video.play().catch(e => console.log("Autoplay blocked/waiting for interaction", e));
  } else {
    video.pause();
    video.style.display = "none";
  }

  // Trigger terminal logs
  appendTerminalNode("system", `[SYSTEM] TUNING RECEIVER: ${currentCam.name}...`);

  // Initialize camera specific states
  if (currentCam.type === "matrix") {
    initMatrixRain();
  } else if (currentCam.type === "sonar") {
    initSonarRadar();
  }

  // End glitch after 200ms
  setTimeout(() => {
    glitchActive = false;
  }, 200);

  // Restart canvas loop if not running
  if (!canvasAnimId) {
    canvasAnimId = requestAnimationFrame(drawCCTVOverlay);
  }
}

function resizeCCTVCanvas() {
  const canvas = document.getElementById("cctv-effects-canvas");
  const container = document.getElementById("cctv-banner-container");
  if (canvas && container) {
    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;
    
    // Reinit matrix columns if active
    if (cctvCams[currentCamIndex].type === "matrix") {
      initMatrixRain();
    }
  }
}

function initMatrixRain() {
  const canvas = document.getElementById("cctv-effects-canvas");
  if (!canvas) return;
  const columns = Math.floor(canvas.width / 12);
  matrixDrops = [];
  for (let i = 0; i < columns; i++) {
    matrixDrops[i] = Math.random() * -100;
  }
}

function initSonarRadar() {
  sonarAngle = 0;
  sonarBlips = [
    { x: 0.3, y: 0.4, intensity: 1, label: "ENFORCER_DRONE" },
    { x: 0.7, y: 0.3, intensity: 0.8, label: "ARASAKA_SENTRY" },
    { x: 0.5, y: 0.7, intensity: 0.5, label: "NET_NODE" }
  ];
}

function drawCCTVOverlay() {
  if (!cctvActive) return;

  const canvas = document.getElementById("cctv-effects-canvas");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;

  // 1. Draw camera content
  const currentCam = cctvCams[currentCamIndex];

  if (glitchActive) {
    // Draw Glitch Static
    ctx.fillStyle = "rgba(10, 14, 20, 0.9)";
    ctx.fillRect(0, 0, w, h);
    
    ctx.strokeStyle = "rgba(0, 240, 255, 0.4)";
    ctx.lineWidth = 1;
    for (let i = 0; i < h; i += Math.random() * 20 + 5) {
      ctx.beginPath();
      ctx.moveTo(0, i);
      ctx.lineTo(w, i + (Math.random() * 10 - 5));
      ctx.stroke();
    }

    // Static particles
    for (let i = 0; i < 50; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? "rgba(0, 240, 255, 0.5)" : "rgba(255, 0, 160, 0.5)";
      ctx.fillRect(Math.random() * w, Math.random() * h, Math.random() * 20 + 5, Math.random() * 4 + 1);
    }
  } else if (currentCam.type === "matrix") {
    // Clear with transparent green fade
    ctx.fillStyle = "rgba(5, 7, 10, 0.15)";
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "#00ff66";
    ctx.font = "10px Share Tech Mono";
    
    const chars = "ｦｧｨｩｪｫｬｭｮｯｰｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    
    for (let i = 0; i < matrixDrops.length; i++) {
      const text = chars.charAt(Math.floor(Math.random() * chars.length));
      const x = i * 12;
      const y = matrixDrops[i];

      // Fade colors
      if (Math.random() > 0.98) {
        ctx.fillStyle = "#ffffff"; // Highlight head
      } else {
        ctx.fillStyle = "rgba(0, 255, 102, 0.85)";
      }

      ctx.fillText(text, x, y);

      if (y > h && Math.random() > 0.975) {
        matrixDrops[i] = 0;
      }
      matrixDrops[i] += 12;
    }
  } else if (currentCam.type === "sonar") {
    // Sonar sweep background
    ctx.fillStyle = "rgba(5, 7, 10, 0.08)";
    ctx.fillRect(0, 0, w, h);

    const cx = w / 2;
    const cy = h / 2;
    const maxRadius = Math.min(cx, cy) * 0.9;

    // Draw sonar radar grid lines
    ctx.strokeStyle = "rgba(0, 240, 255, 0.08)";
    ctx.lineWidth = 0.5;
    for (let r = maxRadius / 4; r <= maxRadius; r += maxRadius / 4) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(cx - maxRadius, cy);
    ctx.lineTo(cx + maxRadius, cy);
    ctx.moveTo(cx, cy - maxRadius);
    ctx.lineTo(cx, cy + maxRadius);
    ctx.stroke();

    // Rotating Sweep line
    sonarAngle = (sonarAngle + 0.02) % (Math.PI * 2);
    const sx = cx + Math.cos(sonarAngle) * maxRadius;
    const sy = cy + Math.sin(sonarAngle) * maxRadius;

    ctx.strokeStyle = "rgba(0, 240, 255, 0.4)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(sx, sy);
    ctx.stroke();

    // Fade sweep trail
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxRadius);
    grad.addColorStop(0, "rgba(0, 240, 255, 0.0)");
    grad.addColorStop(1, "rgba(0, 240, 255, 0.05)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, maxRadius, sonarAngle - 0.4, sonarAngle);
    ctx.lineTo(cx, cy);
    ctx.fill();

    // Blips
    sonarBlips.forEach(blip => {
      const bx = cx + (blip.x - 0.5) * 2 * maxRadius * 0.8;
      const by = cy + (blip.y - 0.5) * 2 * maxRadius * 0.8;

      // Check angle distance from sweep to illuminate blip
      const blipAngle = Math.atan2(by - cy, bx - cx);
      const angleDiff = (sonarAngle - blipAngle + Math.PI * 2) % (Math.PI * 2);

      if (angleDiff < 0.25) {
        blip.intensity = 1.0;
      } else {
        blip.intensity = Math.max(0, blip.intensity - 0.005);
      }

      if (blip.intensity > 0) {
        // Draw blip circle
        ctx.fillStyle = `rgba(0, 255, 102, ${blip.intensity})`;
        ctx.beginPath();
        ctx.arc(bx, by, 4 * blip.intensity + 1, 0, Math.PI * 2);
        ctx.fill();

        // Label
        ctx.fillStyle = `rgba(0, 255, 102, ${blip.intensity * 0.7})`;
        ctx.font = "6px Share Tech Mono";
        ctx.fillText(blip.label, bx + 6, by + 2);
      }
    });
  } else {
    // CAM_01 Video Clear Overlay Canvas
    ctx.clearRect(0, 0, w, h);
  }

  // 2. Draw standard HUD overlays on canvas
  ctx.strokeStyle = "rgba(0, 240, 255, 0.15)";
  ctx.lineWidth = 1;
  
  // Corners
  const len = 12;
  // Top-left
  ctx.beginPath(); ctx.moveTo(6, 6 + len); ctx.lineTo(6, 6); ctx.lineTo(6 + len, 6); ctx.stroke();
  // Top-right
  ctx.beginPath(); ctx.moveTo(w - 6 - len, 6); ctx.lineTo(w - 6, 6); ctx.lineTo(w - 6, 6 + len); ctx.stroke();
  // Bottom-left
  ctx.beginPath(); ctx.moveTo(6, h - 6 - len); ctx.lineTo(6, h - 6); ctx.lineTo(6 + len, h - 6); ctx.stroke();
  // Bottom-right
  ctx.beginPath(); ctx.moveTo(w - 6 - len, h - 6); ctx.lineTo(w - 6, h - 6); ctx.lineTo(w - 6, h - 6 - len); ctx.stroke();

  // Draw Scanlines
  ctx.fillStyle = "rgba(5, 7, 10, 0.05)";
  for (let i = 0; i < h; i += 4) {
    ctx.fillRect(0, i, w, 1);
  }

  // Draw Timestamp
  ctx.fillStyle = "rgba(0, 240, 255, 0.5)";
  ctx.font = "8px Share Tech Mono";
  const now = new Date();
  const timeStr = `${now.toISOString().slice(0, 10)} ${now.toTimeString().slice(0, 8)}:${String(now.getMilliseconds()).padStart(3, '0')}`;
  ctx.fillText(`SYS_TIME: ${timeStr}`, 15, h - 16);

  // Target Biometrics
  if (state && state.player) {
    const targetText = `TARGET: ${state.player.name.toUpperCase()} [LVL_${state.player.level} ${state.player.class.toUpperCase()}]`;
    ctx.fillText(targetText, 15, h - 28);
  }

  // Request next frame
  canvasAnimId = requestAnimationFrame(drawCCTVOverlay);
}

// Init execution
document.addEventListener("DOMContentLoaded", initGame);
