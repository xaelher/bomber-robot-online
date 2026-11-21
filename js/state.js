// =========================================================================
// SHARED GAME & NETWORK STATE
// =========================================================================

import {
    DEFAULT_COLS,
    DEFAULT_ROWS,
    ROUND_DURATION_STANDARD,
    SUDDEN_DEATH_STANDARD
} from './config.js';

export const uiSelection = {
    localMap: 'foundry',
    lobbyMap: 'foundry'
};

export const netState = {
    isOnline: false,
    roomCode: null,
    isHost: false,
    mySlot: 0,
    playerName: 'Pilot-' + Math.floor(100 + Math.random() * 900),
    roomUnsubscribe: null,
    roomsListUnsubscribe: null,
    inputsUnsubscribe: null,
    subscribedInputsRoomCode: null,
    gameStateUnsubscribe: null,
    subscribedGameStateRoomCode: null,
    lobbyHeartbeatInterval: null,
    lastStatePushTime: 0,
    lastClientInputPush: 0,
    lastSentInput: null,
    clientInputSeq: 0,
    lastHostStateReceived: 0,
    lastProcessedRoundSeed: null,
    remoteInputs: {},
    claimedPowerups: {},
    // Jitter & In-Flight congestion protection
    hostTick: 0,
    lastClientTick: 0,
    lastAppliedSeed: null,
    isPushingState: false,
    isPushingInput: false
};

export const game = {
    active: false,
    mode: 'local', // 'local' | 'online'
    selectedMapChoice: 'foundry', // can be 'random'
    activeMapId: 'foundry',
    cols: DEFAULT_COLS,
    rows: DEFAULT_ROWS,
    isBig: false,
    grid: [],
    gridDirty: true,
    gridVersion: 1,
    clientGridVersion: 0,
    lastDt: 0.016,
    winsNeeded: 3,
    roundNumber: 1,
    roundTimer: ROUND_DURATION_STANDARD,
    sdDuration: SUDDEN_DEATH_STANDARD,
    suddenDeathActive: false,
    sdSpiral: [],
    sdSpiralIndex: 0,
    sdNextDropTimer: 0,
    sdStepInterval: 0.52,
    rareBlocksSpawned: false,
    rareDropQueue: [],
    crusherWarnings: [], // { c, r, timer, maxTimer }
    roundOver: false,
    matchOver: false,
    warpPads: [],
    robots: [],
    bombs: [],
    explosions: [],
    powerups: [],
    projectiles: [], // Sniper bullets
    knifeSlashes: [], // Knife slash visuals
    scorchMarks: [],
    particles: [],
    debris: [],
    floatingTexts: [],
    screenShake: 0,
    keys: {},
    prevKeys: {},
    touchDir: { x: 0, y: 0 },
    touchQueue: { swap: false, detonate: false, action: false },
    lastFrameTime: 0,
    lastCountdownSec: -1,
    roundEndTimer: null
};

export function markGridDirty() {
    game.gridDirty = true;
    game.gridVersion = (game.gridVersion || 1) + 1;
}

let toastTimeout = null;
export function showToast(msg, isError = false) {
    const banner = document.getElementById('toastBanner');
    const content = document.getElementById('toastContent');
    if (!banner || !content) return;
    content.textContent = msg;
    content.className = isError
        ? 'px-5 py-2.5 rounded-full bg-rose-950/95 border border-rose-400 text-rose-200 font-semibold text-sm shadow-2xl'
        : 'px-5 py-2.5 rounded-full bg-slate-900/95 border border-cyan-400 text-cyan-200 font-semibold text-sm shadow-2xl';
    banner.classList.remove('opacity-0', '-translate-y-2');
    banner.classList.add('opacity-100', 'translate-y-0');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        banner.classList.remove('opacity-100', 'translate-y-0');
        banner.classList.add('opacity-0', '-translate-y-2');
    }, 2800);
}

export function showView(viewId) {
    ['viewMenu', 'viewOnlineHub', 'viewRoomLobby', 'viewGame'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.classList.add('hidden');
    });
    const target = document.getElementById(viewId);
    if (target) target.classList.remove('hidden');
    const returnBtn = document.getElementById('btnReturnMenu');
    if (returnBtn) returnBtn.classList.toggle('hidden', viewId !== 'viewGame');
}

export function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[m]);
}

