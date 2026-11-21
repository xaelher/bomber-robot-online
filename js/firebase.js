// =========================================================================
// js/firebase.js - Firebase Realtime Database Sync & Online Multiplayer
// =========================================================================
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getDatabase, ref, set, update, get, remove, onValue, onDisconnect } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-database.js";

import {
    FIREBASE_CONFIG,
    ROBOT_PROFILES,
    MAP_DEFINITIONS,
    DEFAULT_COLS,
    DEFAULT_ROWS,
    ROUND_DURATION_STANDARD,
    MAX_BOMBS,
    POWERUP_TYPES
} from './config.js';

import { game, netState, uiSelection, showToast, showView, escapeHtml } from './state.js';
import { sfx } from './audio.js';
import { resizeCanvas, spawnExplosionParticles, spawnWarpBurst, renderMapSelector } from './renderer.js';
import { createRobot, setupRound, eliminateRemoteDisconnected } from './physics.js';
import { updateMatchHeaderHud, updateGameHud } from './main.js';

export let db = null;
export let auth = null;
export let currentUser = null;
export let firebaseReady = false;

export const appId = typeof __app_id !== 'undefined' ? __app_id : 'bomber-robot-online';
export const ROOMS_PATH = `artifacts/${appId}/public/data/bomber_rooms`;

export function isFirebaseReady() {
    return firebaseReady;
}

export function getCurrentUser() {
    return currentUser;
}

export async function initFirebase() {
    const dot = document.getElementById('netStatusDot');
    const txt = document.getElementById('netStatusText');
    const uidDisplay = document.getElementById('displayUserId');

    try {
        let firebaseConfig = FIREBASE_CONFIG;
        if (typeof __firebase_config !== 'undefined') {
            try {
                firebaseConfig = typeof __firebase_config === 'string' ? JSON.parse(__firebase_config) : __firebase_config;
            } catch (e) {
                firebaseConfig = FIREBASE_CONFIG;
            }
        }
        if (!firebaseConfig.databaseURL) {
            firebaseConfig.databaseURL = `https://${firebaseConfig.projectId}-default-rtdb.europe-west1.firebasedatabase.app`;
        }
        const app = initializeApp(firebaseConfig);
        auth = getAuth(app);
        db = getDatabase(app);

        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }

        currentUser = auth.currentUser;
        if (currentUser) {
            firebaseReady = true;
            if (dot) dot.className = 'w-2 h-2 rounded-full bg-emerald-400';
            if (txt) txt.textContent = 'Network Online';
            if (uidDisplay) uidDisplay.textContent = currentUser.uid;
        }
    } catch (err) {
        console.warn('Online network unavailable, local mode active:', err);
        if (dot) dot.className = 'w-2 h-2 rounded-full bg-rose-400';
        if (txt) txt.textContent = 'Offline / Local Ready';
        if (uidDisplay) uidDisplay.textContent = 'Local-Session-Only';
    }
}

export function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

export function getPlayerName() {
    const el = document.getElementById('inputPlayerName');
    const val = el ? el.value.trim() : '';
    return val || netState.playerName;
}

export function startLobbyHeartbeat() {
    if (netState.lobbyHeartbeatInterval) return;
    netState.lobbyHeartbeatInterval = setInterval(() => {
        if (netState.isOnline && netState.isHost && netState.roomCode && firebaseReady && currentUser) {
            update(ref(db, `${ROOMS_PATH}/${netState.roomCode}`), { updatedAt: Date.now() }).catch(err => {
                console.warn('Lobby heartbeat error:', err);
            });
        }
    }, 10000);
}

export function stopLobbyHeartbeat() {
    if (netState.lobbyHeartbeatInterval) {
        clearInterval(netState.lobbyHeartbeatInterval);
        netState.lobbyHeartbeatInterval = null;
    }
}

export function subscribeHostToInputs(code) {
    if (netState.inputsUnsubscribe && netState.subscribedInputsRoomCode === code) return;
    if (netState.inputsUnsubscribe) {
        netState.inputsUnsubscribe();
        netState.inputsUnsubscribe = null;
    }
    netState.subscribedInputsRoomCode = code;
    const inputsRef = ref(db, `${ROOMS_PATH}/${code}/inputs`);
    netState.inputsUnsubscribe = onValue(inputsRef, (snapshot) => {
        const now = Date.now();
        const inputsData = snapshot.val() || {};
        Object.keys(inputsData).forEach(slotKey => {
            const slot = parseInt(slotKey, 10);
            const data = inputsData[slotKey];
            if (!data) return;
            netState.remoteInputs[slot] = {
                ...data,
                receivedAt: now
            };
        });
    }, (err) => {
        console.error('Host inputs onValue error:', err);
    });
}

export function subscribeClientToGameState(code) {
    if (netState.gameStateUnsubscribe && netState.subscribedGameStateRoomCode === code) return;
    if (netState.gameStateUnsubscribe) {
        netState.gameStateUnsubscribe();
        netState.gameStateUnsubscribe = null;
    }
    netState.subscribedGameStateRoomCode = code;
    const stateRef = ref(db, `${ROOMS_PATH}/${code}/gameState`);
    netState.gameStateUnsubscribe = onValue(stateRef, (snap) => {
        const gs = snap.val();
        if (gs) {
            handleOnlineGameSync(gs);
        }
    }, (err) => {
        console.warn('GameState onValue error:', err);
    });
}

export function subscribeToOpenRooms() {
    if (!firebaseReady || !db || !currentUser) return;
    if (netState.roomsListUnsubscribe) {
        netState.roomsListUnsubscribe();
        netState.roomsListUnsubscribe = null;
    }

    const roomsRef = ref(db, ROOMS_PATH);
    netState.roomsListUnsubscribe = onValue(roomsRef, (snapshot) => {
        const listEl = document.getElementById('openRoomsList');
        if (!listEl) return;
        const openRooms = [];
        const now = Date.now();
        const roomsData = snapshot.val() || {};

        Object.keys(roomsData).forEach(code => {
            const data = roomsData[code];
            if (!data) return;

            const playerCount = Object.values(data.players || {}).filter(Boolean).length;
            const isDead = (now - (data.updatedAt || 0) > 90000) || playerCount === 0;

            // Automatically clean dead/abandoned rooms older than 90 seconds or empty from database
            if (isDead) {
                remove(ref(db, `${ROOMS_PATH}/${code}`)).catch(err => console.warn('Cleaned dead room error:', code, err));
                return;
            }

            // Freshness filter: 60 seconds, status === 'lobby'
            if (data.status === 'lobby' && (now - (data.updatedAt || 0) < 60000) && playerCount > 0) {
                openRooms.push({ id: code, ...data });
            }
        });

        if (openRooms.length === 0) {
            listEl.innerHTML = `<div class="col-span-full text-center py-6 text-slate-500 text-sm bg-slate-900/50 rounded-xl border border-slate-800">No open rooms right now. Create one to start a battle!</div>`;
            return;
        }

        listEl.innerHTML = openRooms.map(room => {
            const playerCount = Object.values(room.players || {}).filter(Boolean).length;
            const mapLabel = room.mapChoice === 'random' ? 'Random Arena' : (MAP_DEFINITIONS[room.mapChoice]?.name || 'Cyber Foundry');
            return `
                <div class="p-3.5 rounded-xl bg-slate-900 border border-slate-700 hover:border-cyan-400/60 flex items-center justify-between transition">
                    <div>
                        <div class="flex items-center gap-2">
                            <span class="font-arcade font-bold text-cyan-300 text-sm">${escapeHtml(room.code)}</span>
                            <span class="text-[11px] px-2 py-0.5 rounded bg-slate-800 text-amber-300 font-semibold">${escapeHtml(mapLabel)}</span>
                        </div>
                        <div class="text-xs text-slate-400 mt-1">Host: ${escapeHtml(room.hostName || 'Pilot')} • ${playerCount}/4 Pilots</div>
                    </div>
                    <button data-room-code="${escapeHtml(room.code)}" onclick="window.joinOnlineRoom('${escapeHtml(room.code)}')" class="btn-arcade px-3.5 py-2 rounded-lg bg-cyan-500 text-slate-950 font-black text-xs">
                        JOIN
                    </button>
                </div>
            `;
        }).join('');
    }, (err) => {
        console.warn('Rooms list onValue error:', err);
    });
}

export async function createOnlineRoom() {
    if (!firebaseReady || !currentUser) {
        showToast('Online network unavailable. Try Local / Solo Mode!', true);
        return;
    }
    sfx.init();
    const code = generateRoomCode();
    const myName = getPlayerName();
    const roomRef = ref(db, `${ROOMS_PATH}/${code}`);

    const roomData = {
        code,
        hostUid: currentUser.uid,
        hostName: myName,
        status: 'lobby',
        winsNeeded: 3,
        mapChoice: uiSelection.localMap || 'foundry',
        botFill: 'fill',
        botDiff: 'hard',
        updatedAt: Date.now(),
        players: {
            '0': { slot: 0, uid: currentUser.uid, name: myName, ready: true, wins: 0 }
        },
        gameState: null
    };

    try {
        await set(roomRef, roomData);
        // Register onDisconnect to immediately remove room if host disconnects
        onDisconnect(roomRef).remove().catch(err => {
            console.warn('onDisconnect host error:', err);
        });

        netState.isOnline = true;
        netState.roomCode = code;
        netState.isHost = true;
        netState.mySlot = 0;
        enterOnlineRoom(code);
    } catch (err) {
        showToast('Failed to create room: ' + err.message, true);
    }
}

export async function joinOnlineRoom(rawCode) {
    if (!firebaseReady || !currentUser) {
        showToast('Online service not connected.', true);
        return;
    }
    sfx.init();
    const code = (rawCode || '').trim().toUpperCase();
    if (code.length < 4) {
        showToast('Enter a valid 5-character Room Code.', true);
        return;
    }

    const roomRef = ref(db, `${ROOMS_PATH}/${code}`);
    try {
        const snap = await get(roomRef);
        if (!snap.exists()) {
            showToast(`Room "${code}" not found.`, true);
            return;
        }
        const data = snap.val();
        if (data.status !== 'lobby') {
            showToast('Match is already in progress!', true);
            return;
        }

        const players = data.players || {};
        let assignedSlot = null;
        for (let s = 0; s < 4; s++) {
            if (players[s] && players[s].uid === currentUser.uid) {
                assignedSlot = s;
                break;
            }
        }
        if (assignedSlot === null) {
            for (let s = 0; s < 4; s++) {
                if (!players[s]) {
                    assignedSlot = s;
                    break;
                }
            }
        }
        if (assignedSlot === null) {
            showToast('Room is full (4/4 robots)!', true);
            return;
        }

        const myName = getPlayerName();
        const playerSlotRef = ref(db, `${ROOMS_PATH}/${code}/players/${assignedSlot}`);
        const inputSlotRef = ref(db, `${ROOMS_PATH}/${code}/inputs/${assignedSlot}`);

        await set(playerSlotRef, {
            slot: assignedSlot,
            uid: currentUser.uid,
            name: myName,
            ready: false,
            wins: 0
        });
        await update(roomRef, { updatedAt: Date.now() });

        // Register onDisconnect to immediately remove player & inputs if guest disconnects
        onDisconnect(playerSlotRef).remove().catch(err => {
            console.warn('onDisconnect player error:', err);
        });
        onDisconnect(inputSlotRef).remove().catch(err => {
            console.warn('onDisconnect input error:', err);
        });

        netState.isOnline = true;
        netState.roomCode = code;
        netState.isHost = (data.hostUid === currentUser.uid);
        netState.mySlot = assignedSlot;
        enterOnlineRoom(code);
    } catch (err) {
        showToast('Error joining room: ' + err.message, true);
    }
}

// Expose joinOnlineRoom to window for backwards compatibility with inline onclick handlers
if (typeof window !== 'undefined') {
    window.joinOnlineRoom = joinOnlineRoom;
}

export function enterOnlineRoom(code) {
    if (netState.roomsListUnsubscribe) {
        netState.roomsListUnsubscribe();
        netState.roomsListUnsubscribe = null;
    }
    if (netState.roomUnsubscribe) {
        netState.roomUnsubscribe();
        netState.roomUnsubscribe = null;
    }

    const roomCodeEl = document.getElementById('lobbyRoomCode');
    if (roomCodeEl) roomCodeEl.textContent = code;
    showView('viewRoomLobby');

    const roomRef = ref(db, `${ROOMS_PATH}/${code}`);
    netState.roomUnsubscribe = onValue(roomRef, (snap) => {
        if (!snap.exists()) {
            showToast('Room was closed by host.', true);
            leaveOnlineRoom(false);
            return;
        }
        const room = snap.val();
        netState.isHost = (room.hostUid === currentUser.uid);

        if (netState.isHost) {
            subscribeHostToInputs(code);
            if (netState.gameStateUnsubscribe) {
                netState.gameStateUnsubscribe();
                netState.gameStateUnsubscribe = null;
            }
        } else {
            if (netState.inputsUnsubscribe) {
                netState.inputsUnsubscribe();
                netState.inputsUnsubscribe = null;
                netState.subscribedInputsRoomCode = null;
            }
            subscribeClientToGameState(code);
        }

        if (room.status === 'lobby') {
            if (netState.isHost) {
                startLobbyHeartbeat();
            } else {
                stopLobbyHeartbeat();
            }
            if (game.active) {
                game.active = false;
                showView('viewRoomLobby');
            }
            renderRoomLobby(room);
        } else if (room.status === 'playing') {
            stopLobbyHeartbeat();
            // Host checks if any active remote player disconnected from room.players
            if (netState.isHost && game.active) {
                const players = room.players || {};
                for (const robot of game.robots) {
                    if (robot.alive && robot.controlType === 'online_remote') {
                        if (!players[robot.slot]) {
                            eliminateRemoteDisconnected(robot, 'LEFT MATCH');
                        }
                    }
                }
            }
        }
    }, (err) => {
        console.warn('Room sync error:', err);
    });
}

export function renderRoomLobby(room) {
    const players = room.players || {};
    const container = document.getElementById('lobbyPlayersContainer');

    const winsSel = document.getElementById('lobbyWinsSelect');
    const botFillSel = document.getElementById('lobbyBotFillSelect');
    const botDiffSel = document.getElementById('lobbyBotDiffSelect');

    if (winsSel) {
        winsSel.value = String(room.winsNeeded || 3);
        winsSel.disabled = !netState.isHost;
    }
    if (botFillSel) {
        botFillSel.value = room.botFill || 'fill';
        botFillSel.disabled = !netState.isHost;
    }
    if (botDiffSel) {
        botDiffSel.value = room.botDiff || 'hard';
        botDiffSel.disabled = !netState.isHost;
    }

    uiSelection.lobbyMap = room.mapChoice || 'foundry';
    renderMapSelector('lobbyMapSelectorGrid', 'lobbyMapDescText', uiSelection.lobbyMap, async (chosenMapId) => {
        if (!netState.isHost || !netState.roomCode || !firebaseReady || !currentUser) return;
        await update(ref(db, `${ROOMS_PATH}/${netState.roomCode}`), { mapChoice: chosenMapId, updatedAt: Date.now() }).catch(err => {
            console.warn('Lobby map update error:', err);
        });
    }, !netState.isHost);

    const startBtn = document.getElementById('btnHostStartOnline');
    const roleSub = document.getElementById('lobbyRoleSubtitle');
    if (netState.isHost) {
        if (startBtn) startBtn.classList.remove('hidden');
        if (roleSub) roleSub.textContent = 'You are Host. Choose a map, configure bots, and launch when ready!';
    } else {
        if (startBtn) startBtn.classList.add('hidden');
        if (roleSub) roleSub.textContent = 'Waiting for host to launch the cyber arena...';
    }

    const myPlayer = players[netState.mySlot];
    const readyBtn = document.getElementById('btnToggleReady');
    if (readyBtn) {
        if (myPlayer && myPlayer.ready) {
            readyBtn.textContent = '✓ READY (CLICK TO UNREADY)';
            readyBtn.className = 'btn-arcade w-full py-3 rounded-xl bg-slate-800 text-emerald-300 border border-emerald-400 font-black text-sm';
        } else {
            readyBtn.textContent = '⚡ CLICK TO READY UP';
            readyBtn.className = 'btn-arcade w-full py-3 rounded-xl bg-emerald-500 text-slate-950 font-black text-sm';
        }
    }

    if (!container) return;
    let html = '';
    for (let s = 0; s < 4; s++) {
        const profile = ROBOT_PROFILES[s];
        const p = players[s];
        if (p) {
            const isMe = (p.uid === currentUser.uid);
            const isRoomHost = (p.uid === room.hostUid);
            html += `
                <div class="p-3 rounded-xl bg-slate-900/95 border flex items-center justify-between" style="border-color: ${profile.color}66">
                    <div class="flex items-center gap-2.5 min-w-0">
                        <div class="w-9 h-9 rounded-lg flex items-center justify-center font-arcade font-black text-xs text-slate-950 shrink-0" style="background:${profile.color}">
                            R${s + 1}
                        </div>
                        <div class="min-w-0">
                            <div class="flex items-center gap-1.5">
                                <span class="font-bold text-white text-sm truncate">${escapeHtml(p.name)}</span>
                                ${isMe ? '<span class="text-[9px] px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300 font-bold">YOU</span>' : ''}
                                ${isRoomHost ? '<span class="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">HOST</span>' : ''}
                            </div>
                            <div class="text-[11px]" style="color:${profile.color}">${profile.name}</div>
                        </div>
                    </div>
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-arcade font-bold shrink-0 ${p.ready ? 'bg-emerald-500/20 border border-emerald-400 text-emerald-300' : 'bg-slate-800 border border-slate-600 text-slate-400'}">
                        ${p.ready ? 'READY' : 'WAIT'}
                    </span>
                </div>
            `;
        } else {
            const botLabel = room.botFill === 'fill'
                ? `AI (${(room.botDiff || 'hard').toUpperCase()})`
                : 'OPEN SLOT';
            html += `
                <div class="p-3 rounded-xl bg-slate-950/60 border border-dashed border-slate-800 flex items-center justify-between opacity-75">
                    <div class="flex items-center gap-2.5">
                        <div class="w-9 h-9 rounded-lg bg-slate-800 flex items-center justify-center font-arcade font-bold text-xs text-slate-500">
                            R${s + 1}
                        </div>
                        <div>
                            <div class="font-semibold text-slate-400 text-xs">${botLabel}</div>
                            <div class="text-[10px] text-slate-600">${profile.name}</div>
                        </div>
                    </div>
                    <span class="text-[10px] text-slate-600 font-mono">EMPTY</span>
                </div>
            `;
        }
    }
    container.innerHTML = html;
}

export async function hostLaunchOnlineMatch() {
    if (!netState.isHost || !netState.roomCode || !currentUser) return;
    const roomRef = ref(db, `${ROOMS_PATH}/${netState.roomCode}`);
    const snap = await get(roomRef);
    if (!snap.exists()) return;
    const room = snap.val();

    const players = room.players || {};
    const botFill = room.botFill || 'fill';
    const botDiff = room.botDiff || 'hard';
    const seed = Date.now();

    const configs = [];
    for (let s = 0; s < 4; s++) {
        if (players[s]) {
            configs.push({
                slot: s,
                uid: players[s].uid,
                name: players[s].name,
                controlType: s === netState.mySlot ? 'online_local' : 'online_remote',
                wins: 0
            });
        } else if (botFill === 'fill') {
            configs.push({
                slot: s,
                uid: null,
                name: `BOT-${ROBOT_PROFILES[s].shortName}`,
                controlType: 'ai',
                aiDifficulty: botDiff,
                wins: 0
            });
        }
    }

    if (configs.length < 2) {
        showToast('Need at least 2 combatants! Enable AI fill or invite a friend.', true);
        return;
    }

    stopLobbyHeartbeat();
    subscribeHostToInputs(netState.roomCode);

    // Clean previous input docs for fresh match
    await remove(ref(db, `${ROOMS_PATH}/${netState.roomCode}/inputs`)).catch(() => { });

    game.mode = 'online';
    game.selectedMapChoice = room.mapChoice || 'foundry';
    game.winsNeeded = parseInt(room.winsNeeded || 3, 10);
    game.roundNumber = 1;
    game.matchOver = false;
    netState.lastProcessedRoundSeed = seed;

    setupRound(configs, seed);

    const initialGameState = serializeOnlineGameState(seed, true);
    await update(roomRef, {
        status: 'playing',
        gameState: initialGameState,
        updatedAt: Date.now()
    });

    showView('viewGame');
    resizeCanvas();
}

export function serializeOnlineGameState(seed = netState.lastProcessedRoundSeed, forceGrid = false) {
    const sendGrid = forceGrid || game.gridDirty;
    if (game.gridDirty) game.gridDirty = false;
    return {
        seed,
        roundNumber: game.roundNumber,
        roundTimer: Number(game.roundTimer.toFixed(1)),
        suddenDeathActive: game.suddenDeathActive,
        roundOver: game.roundOver,
        matchOver: game.matchOver,
        activeMapId: game.activeMapId,
        cols: game.cols,
        rows: game.rows,
        isBig: game.isBig,
        winsNeeded: game.winsNeeded,
        gridVersion: game.gridVersion || 1,
        ...(sendGrid ? { gridFlat: game.grid.flat() } : {}),
        warpPads: game.warpPads,
        crusherWarnings: game.crusherWarnings.map(w => ({ c: w.c, r: w.r, timer: Number(w.timer.toFixed(2)) })),
        robots: game.robots.map(r => ({
            slot: r.slot, uid: r.uid, name: r.name,
            controlType: r.controlType, aiDifficulty: r.aiDifficulty,
            x: Number((r.alive && r.controlType === 'online_remote' && r.netTargetX !== undefined ? r.netTargetX : r.x).toFixed(3)),
            y: Number((r.alive && r.controlType === 'online_remote' && r.netTargetY !== undefined ? r.netTargetY : r.y).toFixed(3)),
            dir: r.dir, moving: r.moving, alive: r.alive,
            wins: r.wins, score: r.score,
            maxBombs: r.maxBombs, activeBombs: r.activeBombs,
            activeDetonatorBombs: r.activeDetonatorBombs,
            blastRadius: r.blastRadius, speed: Number(r.speed.toFixed(2)),
            invulnTimer: Number(r.invulnTimer.toFixed(2)),
            hasShield: r.hasShield, virusEffect: r.virusEffect,
            rareItem: r.rareItem, rareAmmo: r.rareAmmo, equippedSlot: r.equippedSlot
        })),
        bombs: game.bombs.map(b => ({
            id: b.id, c: b.c, r: b.r, ownerSlot: b.ownerSlot,
            radius: b.radius, timer: b.isDetonator ? 999 : Number(b.timer.toFixed(2)),
            isDetonator: !!b.isDetonator,
            passSlots: Array.from(b.passSlots || [])
        })),
        explosions: game.explosions.map(e => ({
            c: e.c, r: e.r, timer: Number(e.timer.toFixed(2)), dir: e.dir || 'center'
        })),
        powerups: game.powerups.map(p => ({ c: p.c, r: p.r, type: p.type, isRare: !!p.isRare })),
        projectiles: game.projectiles.map(pr => ({
            x: Number(pr.x.toFixed(2)), y: Number(pr.y.toFixed(2)),
            dx: pr.dx, dy: pr.dy, color: pr.color
        })),
        knifeSlashes: game.knifeSlashes.map(ks => ({
            x: Number(ks.x.toFixed(2)), y: Number(ks.y.toFixed(2)),
            dir: ks.dir, timer: Number(ks.timer.toFixed(2))
        })),
        overlay: {
            visible: !document.getElementById('arenaOverlay')?.classList.contains('hidden'),
            badge: document.getElementById('overlayBadge')?.textContent || '',
            title: document.getElementById('overlayTitle')?.textContent || '',
            subtitle: document.getElementById('overlaySubtitle')?.textContent || ''
        }
    };
}

export function pushHostGameStateNow(forceGrid = false) {
    if (game.mode === 'online' && netState.isHost && firebaseReady && currentUser && netState.roomCode) {
        netState.lastStatePushTime = performance.now();
        const stateRef = ref(db, `${ROOMS_PATH}/${netState.roomCode}/gameState`);
        set(stateRef, serializeOnlineGameState(netState.lastProcessedRoundSeed, forceGrid)).catch(err => {
            console.error('Host state push error:', err);
        });
    }
}

export function handleOnlineGameSync(data) {
    const gs = data && data.gameState ? data.gameState : data;
    if (!gs) return;

    const viewGame = document.getElementById('viewGame');
    if (viewGame && viewGame.classList.contains('hidden')) {
        showView('viewGame');
        resizeCanvas();
    }

    if (netState.isHost) return;

    // Client applies authoritative Host state
    netState.lastHostStateReceived = Date.now();
    const dimChanged = (gs.cols && gs.cols !== game.cols) || (gs.rows && gs.rows !== game.rows);
    game.mode = 'online';
    game.activeMapId = gs.activeMapId || 'foundry';
    game.cols = gs.cols || DEFAULT_COLS;
    game.rows = gs.rows || DEFAULT_ROWS;
    game.isBig = !!gs.isBig;
    if (dimChanged) resizeCanvas();

    game.winsNeeded = gs.winsNeeded || 3;
    game.roundNumber = gs.roundNumber || 1;
    game.roundTimer = gs.roundTimer ?? ROUND_DURATION_STANDARD;
    if (!game.suddenDeathActive && gs.suddenDeathActive) {
        sfx.suddenDeathAlarm();
        sfx.rareBlockSpawn();
    }
    game.suddenDeathActive = !!gs.suddenDeathActive;
    game.roundOver = gs.roundOver;
    game.matchOver = gs.matchOver;
    game.warpPads = gs.warpPads || [];
    game.crusherWarnings = (gs.crusherWarnings || []).map(w => ({ ...w, maxTimer: 0.85 }));
    game.active = true;

    // Only update grid when gridFlat is sent (new gridVersion or round start)
    if (gs.gridFlat && gs.gridFlat.length === game.rows * game.cols) {
        if (game.clientGridVersion !== gs.gridVersion || !game.grid || dimChanged) {
            game.clientGridVersion = gs.gridVersion;
            const newGrid = [];
            for (let r = 0; r < game.rows; r++) {
                newGrid.push(gs.gridFlat.slice(r * game.cols, (r + 1) * game.cols));
            }
            game.grid = newGrid;
        }
    }

    // Sync robots smoothly with Client-Authoritative position & Opponent Interpolation
    (gs.robots || []).forEach(sr => {
        let localR = game.robots.find(r => r.slot === sr.slot);
        if (!localR) {
            localR = createRobot(sr.slot, {
                name: sr.name, uid: sr.uid,
                controlType: sr.slot === netState.mySlot ? 'online_local' : 'online_remote',
                wins: sr.wins, score: sr.score
            });
            game.robots.push(localR);
        }

        if (sr.slot === netState.mySlot) {
            // Client is authoritative for its own predicted robot!
            // Only snap if massive discrepancy (> 3.2 tiles) e.g. Warp Pad or round reset
            const diff = Math.hypot(sr.x - localR.x, sr.y - localR.y);
            if (diff > 3.2) {
                if (localR.alive && sr.alive) {
                    sfx.warp();
                    spawnWarpBurst(sr.x, sr.y, '#00f3ff');
                }
                localR.x = sr.x;
                localR.y = sr.y;
            }
            // NEVER pull back or lerp backwards during normal gameplay to eliminate rubber-banding!
        } else {
            // Remote robots: store target and direction for smooth 60 FPS interpolation in updateSimulation
            localR.netTargetX = sr.x;
            localR.netTargetY = sr.y;
            localR.netDir = sr.dir;
            localR.netMoving = sr.moving;
            const jumpDist = Math.hypot(sr.x - localR.x, sr.y - localR.y);
            if (jumpDist > 3.0) {
                if (localR.alive && sr.alive) {
                    sfx.warp();
                    spawnWarpBurst(sr.x, sr.y, '#00f3ff');
                }
                localR.x = sr.x;
                localR.y = sr.y;
            }
        }

        if (localR.alive && !sr.alive) {
            sfx.robotEliminated();
            spawnExplosionParticles(localR.x, localR.y, localR.color, 26);
            game.screenShake = Math.max(game.screenShake, 0.35);
        }
        localR.alive = sr.alive;
        localR.wins = sr.wins;
        if (sr.slot === netState.mySlot) {
            const isRecentlyClaimed = (performance.now() - (localR._lastPowerupClaimTime || 0)) < 400;
            if (isRecentlyClaimed) {
                localR.maxBombs = Math.min(MAX_BOMBS, Math.max(localR.maxBombs, sr.maxBombs));
                localR.blastRadius = Math.max(localR.blastRadius, sr.blastRadius);
                localR.speed = Math.max(localR.speed, sr.speed);
                localR.hasShield = localR.hasShield || sr.hasShield;
                localR.score = Math.max(localR.score, sr.score || 0);
                if (!sr.rareItem && localR.rareItem) {
                    // keep locally picked up rare item until host acknowledges
                } else {
                    localR.rareItem = sr.rareItem || null;
                    localR.rareAmmo = sr.rareAmmo || 0;
                }
            } else {
                localR.maxBombs = Math.min(MAX_BOMBS, sr.maxBombs);
                localR.blastRadius = sr.blastRadius;
                localR.speed = sr.speed;
                localR.hasShield = sr.hasShield;
                localR.score = sr.score || 0;
                localR.rareItem = sr.rareItem || null;
                localR.rareAmmo = sr.rareAmmo || 0;
            }
            const pendingOptimistic = game.bombs.filter(b => b.optimistic && b.ownerSlot === netState.mySlot).length;
            localR.activeBombs = Math.max(sr.activeBombs || 0, pendingOptimistic);
        } else {
            localR.maxBombs = Math.min(MAX_BOMBS, sr.maxBombs);
            localR.blastRadius = sr.blastRadius;
            localR.speed = sr.speed;
            localR.hasShield = sr.hasShield;
            localR.score = sr.score || 0;
            localR.rareItem = sr.rareItem || null;
            localR.rareAmmo = sr.rareAmmo || 0;
            localR.activeBombs = sr.activeBombs || 0;
        }
        localR.activeDetonatorBombs = sr.activeDetonatorBombs || 0;
        localR.invulnTimer = sr.invulnTimer !== undefined ? sr.invulnTimer : 0;
        localR.virusEffect = sr.virusEffect;
        localR.equippedSlot = sr.equippedSlot || 'bomb';
    });

    // Reconcile bombs: preserve recent local optimistic bombs (< 450ms)
    const nextBombs = (gs.bombs || []).map(b => ({
        ...b,
        maxTimer: 2.35,
        passSlots: new Set(b.passSlots || [])
    }));

    // Sound check for newly dropped bombs from other players
    const hasNewOtherBomb = nextBombs.some(nb =>
        nb.ownerSlot !== netState.mySlot &&
        !game.bombs.some(gb => gb.c === nb.c && gb.r === nb.r)
    );
    if (hasNewOtherBomb) sfx.bombDrop();

    const nowPerf = performance.now();
    for (const localB of game.bombs) {
        if (localB.optimistic && localB.ownerSlot === netState.mySlot) {
            const matchedInServer = nextBombs.some(sb => sb.c === localB.c && sb.r === localB.r);
            if (!matchedInServer && (nowPerf - (localB.createdAt || 0) < 450)) {
                nextBombs.push(localB);
            }
        }
    }
    game.bombs = nextBombs;

    if ((gs.explosions || []).length > game.explosions.length) {
        sfx.explosion();
        game.screenShake = Math.max(game.screenShake, 0.28);
    }
    if ((gs.projectiles || []).length > game.projectiles.length) sfx.sniperShot();
    if ((gs.knifeSlashes || []).length > game.knifeSlashes.length) sfx.knifeSlash();

    game.explosions = (gs.explosions || []).map(e => ({ ...e, maxTimer: 0.48 }));

    // Powerups reconciliation: filter out powerups client recently picked up optimistically (< 450ms)
    const nowSync = performance.now();
    const filteredPowerups = (gs.powerups || []).filter(p => {
        const claimKey = `${p.c},${p.r}`;
        const claimTime = netState.claimedPowerups ? netState.claimedPowerups[claimKey] : null;
        if (claimTime && (nowSync - claimTime < 450)) {
            return false;
        }
        return true;
    });
    game.powerups = filteredPowerups.map(p => ({ ...p, bobTimer: performance.now() / 280 }));
    game.projectiles = (gs.projectiles || []).map(pr => ({ ...pr }));
    game.knifeSlashes = (gs.knifeSlashes || []).map(ks => ({ ...ks, maxTimer: 0.24 }));

    const overlay = document.getElementById('arenaOverlay');
    if (gs.overlay && gs.overlay.visible) {
        const badgeEl = document.getElementById('overlayBadge');
        const titleEl = document.getElementById('overlayTitle');
        const subEl = document.getElementById('overlaySubtitle');
        if (badgeEl) badgeEl.textContent = gs.overlay.badge || 'ROUND COMPLETE';
        if (titleEl) {
            titleEl.textContent = gs.overlay.title || 'ROUND OVER';
            titleEl.style.color = '#ffffff';
        }
        if (subEl) subEl.textContent = gs.overlay.subtitle || '';
        const btnNext = document.getElementById('btnNextRound');
        const btnRematch = document.getElementById('btnPlayAgain');
        if (btnNext) btnNext.classList.add('hidden');
        if (btnRematch) btnRematch.classList.add('hidden');
        if (overlay) overlay.classList.remove('hidden');
    } else {
        if (overlay) overlay.classList.add('hidden');
    }

    updateMatchHeaderHud();
    updateGameHud();
}

export async function leaveOnlineRoom(notifyServer = true) {
    stopLobbyHeartbeat();
    if (netState.inputsUnsubscribe) {
        netState.inputsUnsubscribe();
        netState.inputsUnsubscribe = null;
    }
    netState.subscribedInputsRoomCode = null;
    netState.remoteInputs = {};

    if (netState.gameStateUnsubscribe) {
        netState.gameStateUnsubscribe();
        netState.gameStateUnsubscribe = null;
    }
    netState.subscribedGameStateRoomCode = null;

    if (netState.roomUnsubscribe) {
        netState.roomUnsubscribe();
        netState.roomUnsubscribe = null;
    }
    if (notifyServer && firebaseReady && currentUser && netState.roomCode) {
        const code = netState.roomCode;
        try {
            if (netState.isHost) {
                onDisconnect(ref(db, `${ROOMS_PATH}/${code}`)).cancel().catch(() => { });
                await remove(ref(db, `${ROOMS_PATH}/${code}`));
            } else {
                onDisconnect(ref(db, `${ROOMS_PATH}/${code}/players/${netState.mySlot}`)).cancel().catch(() => { });
                onDisconnect(ref(db, `${ROOMS_PATH}/${code}/inputs/${netState.mySlot}`)).cancel().catch(() => { });
                await remove(ref(db, `${ROOMS_PATH}/${code}/players/${netState.mySlot}`));
                await remove(ref(db, `${ROOMS_PATH}/${code}/inputs/${netState.mySlot}`));
                await update(ref(db, `${ROOMS_PATH}/${code}`), { updatedAt: Date.now() });
            }
        } catch (e) {
            console.warn('leaveOnlineRoom error:', e);
        }
    }
    netState.isOnline = false;
    netState.roomCode = null;
    netState.isHost = false;
    netState.claimedPowerups = {};
    game.active = false;
    showView('viewMenu');
}

export function sendClientInput(payload) {
    if (!firebaseReady || !currentUser || !netState.roomCode) return;
    const inputRef = ref(db, `${ROOMS_PATH}/${netState.roomCode}/inputs/${netState.mySlot}`);
    set(inputRef, payload).catch((err) => {
        console.error('Client input send error:', err);
    });
}

export function removePlayerSlot(slot) {
    if (!firebaseReady || !netState.roomCode) return;
    remove(ref(db, `${ROOMS_PATH}/${netState.roomCode}/players/${slot}`)).catch(err => console.error('Disconnection slot clear error:', err));
    remove(ref(db, `${ROOMS_PATH}/${netState.roomCode}/inputs/${slot}`)).catch(() => { });
}

export async function updateLobbySettings(settings) {
    if (!netState.isHost || !netState.roomCode || !firebaseReady || !currentUser) return;
    await update(ref(db, `${ROOMS_PATH}/${netState.roomCode}`), {
        ...settings,
        updatedAt: Date.now()
    }).catch(err => {
        console.warn('Lobby settings update error:', err);
    });
}

export async function toggleReadyStatus() {
    if (!netState.roomCode || !firebaseReady || !currentUser) return;
    const playerSlotRef = ref(db, `${ROOMS_PATH}/${netState.roomCode}/players/${netState.mySlot}`);
    const snap = await get(playerSlotRef);
    if (!snap.exists()) return;
    const currentReady = snap.val()?.ready || false;
    await update(playerSlotRef, { ready: !currentReady }).catch(err => {
        console.warn('Toggle ready update error:', err);
    });
    await update(ref(db, `${ROOMS_PATH}/${netState.roomCode}`), { updatedAt: Date.now() }).catch(() => { });
}

export function handleTabClose() {
    if (!netState.isOnline || !netState.roomCode || !firebaseReady || !currentUser) return;
    const code = netState.roomCode;
    if (netState.isHost) {
        remove(ref(db, `${ROOMS_PATH}/${code}`)).catch(() => { });
    } else {
        remove(ref(db, `${ROOMS_PATH}/${code}/players/${netState.mySlot}`)).catch(() => { });
        remove(ref(db, `${ROOMS_PATH}/${code}/inputs/${netState.mySlot}`)).catch(() => { });
    }
}

