// =========================================================================
// js/main.js - Main Entry Point, Game Loop, Input Handling & UI Controller
// =========================================================================
import { MAP_DEFINITIONS, MAX_BOMBS, POWERUP_TYPES } from './config.js';
import { game, netState, uiSelection, showView, showToast } from './state.js';
import { sfx } from './audio.js';
import { renderArena, resizeCanvas, renderMapSelector } from './renderer.js';
import { updateSimulation, startLocalMatch, advanceToNextRound, rematchCurrentSetup } from './physics.js';
import {
    initFirebase,
    createOnlineRoom,
    joinOnlineRoom,
    leaveOnlineRoom,
    hostLaunchOnlineMatch,
    subscribeToOpenRooms,
    updateLobbySettings,
    toggleReadyStatus,
    handleTabClose
} from './firebase.js';

// =========================================================================
// HUD Updates
// =========================================================================
export function updateMatchHeaderHud() {
    const mapDef = MAP_DEFINITIONS[game.activeMapId] || MAP_DEFINITIONS.foundry;
    const sizeTag = mapDef.isBig ? ' [BIG 19×15]' : '';
    const mapBadge = document.getElementById('hudMapBadge');
    if (mapBadge) mapBadge.textContent = `🗺️ ${mapDef.name.toUpperCase()}${sizeTag}`;
    const roundBadge = document.getElementById('hudRoundBadge');
    if (roundBadge) roundBadge.textContent = `ROUND ${game.roundNumber}`;

    const secs = Math.ceil(game.roundTimer);
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    const timerVal = document.getElementById('hudTimerValue');
    if (timerVal) timerVal.textContent = `${mins}:${rem < 10 ? '0' : ''}${rem}`;

    const timerBox = document.getElementById('hudTimerBox');
    const sdLabel = document.getElementById('hudSdLabel');
    if (timerBox && sdLabel) {
        if (game.suddenDeathActive) {
            timerBox.classList.add('sudden-death-pulse', 'text-rose-300', 'bg-rose-950/80');
            sdLabel.classList.remove('hidden');
        } else {
            timerBox.classList.remove('sudden-death-pulse', 'text-rose-300', 'bg-rose-950/80');
            sdLabel.classList.add('hidden');
        }
    }
}

export function updateGameHud() {
    const hud = document.getElementById('gameHudBar');
    if (!hud) return;
    hud.innerHTML = game.robots.map(r => {
        const cap = Math.min(MAX_BOMBS, r.maxBombs);
        const avail = Math.max(0, cap - r.activeBombs);

        let pipsHtml = '';
        for (let i = 0; i < MAX_BOMBS; i++) {
            if (i < avail) {
                pipsHtml += `<span class="w-2.5 h-2.5 rounded-full bg-cyan-400 shadow-[0_0_6px_#22d3ee]" title="Ready Bomb"></span>`;
            } else if (i < cap) {
                pipsHtml += `<span class="w-2.5 h-2.5 rounded-full bg-amber-500/50 border border-amber-400" title="Planted Bomb"></span>`;
            } else {
                pipsHtml += `<span class="w-2.5 h-2.5 rounded-full bg-slate-800 border border-slate-700" title="Locked Slot"></span>`;
            }
        }

        const rareBadge = r.rareItem ? `
            <div class="mt-1 flex items-center justify-between text-[11px] px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/40 text-amber-300 font-bold">
                <span>${POWERUP_TYPES[r.rareItem]?.icon || '✨'} ${r.rareItem}</span>
                <span>${r.rareAmmo > 0 ? `${r.rareAmmo} SHOTS` : (r.rareItem === 'DETONATOR' ? `${r.activeDetonatorBombs}/2 C4` : 'READY')}</span>
            </div>
        ` : '';

        return `
            <div class="p-2.5 rounded-xl border transition-all ${r.alive ? 'bg-slate-900/90' : 'bg-slate-950/50 opacity-45'}" style="border-color:${r.color}${r.alive ? '99' : '33'}">
                <div class="flex items-center justify-between gap-1 mb-1.5">
                    <div class="flex items-center gap-1.5 min-w-0">
                        <span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:${r.color}"></span>
                        <span class="font-arcade font-bold text-xs truncate ${r.alive ? 'text-white' : 'text-slate-500 line-through'}">${r.name}</span>
                        ${r.hasShield ? '<span class="text-xs" title="Hex Shield Active">🛡️</span>' : ''}
                        ${r.virusEffect ? '<span class="text-xs animate-bounce" title="System Glitch">👾</span>' : ''}
                    </div>
                    <div class="flex items-center gap-1 shrink-0">
                        <span class="font-arcade text-xs text-amber-300">${r.wins}W</span>
                        <span class="text-[10px] text-slate-500">•</span>
                        <span class="text-[11px] text-slate-400 font-mono">${r.score}</span>
                    </div>
                </div>

                <div class="flex items-center justify-between gap-2 text-[11px] font-mono">
                    <div class="flex items-center gap-1" title="Bombs ready: ${avail}/${cap}">
                        <span class="text-slate-500 text-[10px] mr-0.5">💣</span>
                        <div class="flex items-center gap-1">${pipsHtml}</div>
                    </div>
                    <div class="flex items-center gap-2 text-slate-400 text-[10px]">
                        <span title="Blast Radius">🔥 ${r.blastRadius || 2}</span>
                        <span title="Movement Speed">⚡ ${(r.speed !== undefined && r.speed !== null ? r.speed : 3.75).toFixed(1)}</span>
                    </div>
                </div>

                ${rareBadge}
            </div>
        `;
    }).join('');

    // Update Mobile Action Buttons display
    const localRobot = game.robots.find(r => r.controlType === 'p1' || r.controlType === 'online_local');
    const swapBtn = document.getElementById('btnTouchSwap');
    const detBtn = document.getElementById('btnTouchDetonate');
    const actIcon = document.getElementById('touchActionIcon');
    const actLabel = document.getElementById('touchActionLabel');

    if (localRobot && swapBtn && detBtn && actIcon && actLabel) {
        swapBtn.classList.toggle('hidden', !localRobot.rareItem);
        detBtn.classList.toggle('hidden', localRobot.activeDetonatorBombs <= 0);
        if (localRobot.equippedSlot === 'rare' && localRobot.rareItem) {
            const rm = POWERUP_TYPES[localRobot.rareItem];
            actIcon.textContent = rm.icon;
            actLabel.textContent = localRobot.rareItem === 'SNIPER' ? `SHOT (${localRobot.rareAmmo})` : localRobot.rareItem;
        } else {
            actIcon.textContent = '💣';
            actLabel.textContent = 'BOMB';
        }
    }
}

// =========================================================================
// Touch Controls
// =========================================================================
export function isTouchDevice() {
    return window.matchMedia('(pointer: coarse)').matches || ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
}

let touchControlsVisible = isTouchDevice();

export function applyTouchControlsVisibility() {
    const el = document.getElementById('mobileTouchControls');
    const btn = document.getElementById('btnTouchToggle');
    if (!el) return;
    if (touchControlsVisible) {
        el.classList.remove('hidden');
        el.classList.add('flex');
        if (btn) {
            btn.classList.add('border-cyan-400', 'bg-cyan-500/20');
            btn.classList.remove('opacity-60');
        }
    } else {
        el.classList.add('hidden');
        el.classList.remove('flex');
        if (btn) {
            btn.classList.remove('border-cyan-400', 'bg-cyan-500/20');
            btn.classList.add('opacity-60');
        }
    }
}

// =========================================================================
// Map Selectors
// =========================================================================
export function initLocalMapSelector() {
    renderMapSelector('localMapSelectorGrid', 'localMapDescText', uiSelection.localMap, (chosenId) => {
        uiSelection.localMap = chosenId;
        initLocalMapSelector();
    }, false);
}

// =========================================================================
// Game Loop
// =========================================================================
export function gameLoop(timestamp) {
    if (!game.lastFrameTime) game.lastFrameTime = timestamp;
    const dt = Math.min(0.05, (timestamp - game.lastFrameTime) / 1000);
    game.lastFrameTime = timestamp;
    game.lastDt = dt;

    if (game.active) {
        updateSimulation(dt);
        renderArena(timestamp);
    }

    requestAnimationFrame(gameLoop);
}

// =========================================================================
// Event Listeners & UI Wiring
// =========================================================================
function setupEventListeners() {
    // Keyboard inputs
    window.addEventListener('keydown', (e) => {
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
            if (game.active) e.preventDefault();
        }
        game.keys[e.code] = true;
    });

    window.addEventListener('keyup', (e) => {
        game.keys[e.code] = false;
    });

    // Mobile Directional Buttons
    document.querySelectorAll('.touch-dir').forEach(btn => {
        const dir = btn.dataset.dir;
        const setDir = (active) => {
            if (!active) {
                if ((dir === 'up' && game.touchDir.y < 0) ||
                    (dir === 'down' && game.touchDir.y > 0) ||
                    (dir === 'left' && game.touchDir.x < 0) ||
                    (dir === 'right' && game.touchDir.x > 0)) {
                    game.touchDir = { x: 0, y: 0 };
                }
                return;
            }
            if (dir === 'up') game.touchDir = { x: 0, y: -1 };
            if (dir === 'down') game.touchDir = { x: 0, y: 1 };
            if (dir === 'left') game.touchDir = { x: -1, y: 0 };
            if (dir === 'right') game.touchDir = { x: 1, y: 0 };
        };
        btn.addEventListener('pointerdown', (e) => { e.preventDefault(); setDir(true); });
        btn.addEventListener('pointerup', (e) => { e.preventDefault(); setDir(false); });
        btn.addEventListener('pointercancel', (e) => { e.preventDefault(); setDir(false); });
        btn.addEventListener('pointerleave', (e) => { e.preventDefault(); setDir(false); });
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); setDir(true); }, { passive: false });
        btn.addEventListener('touchend', (e) => { e.preventDefault(); setDir(false); }, { passive: false });
        btn.addEventListener('touchcancel', (e) => { e.preventDefault(); setDir(false); }, { passive: false });
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); setDir(true); });
        btn.addEventListener('mouseup', (e) => { e.preventDefault(); setDir(false); });
        btn.addEventListener('mouseleave', (e) => { e.preventDefault(); setDir(false); });
    });

    window.addEventListener('blur', () => {
        game.touchDir = { x: 0, y: 0 };
        game.keys = {};
    });
    window.addEventListener('touchcancel', () => {
        game.touchDir = { x: 0, y: 0 };
    });
    window.addEventListener('pointercancel', () => {
        game.touchDir = { x: 0, y: 0 };
    });

    const wireTouchAction = (id, key) => {
        const btn = document.getElementById(id);
        if (!btn) return;
        const trigger = (e) => {
            if (e && e.cancelable) e.preventDefault();
            game.touchQueue[key] = true;
        };
        btn.addEventListener('pointerdown', trigger);
        btn.addEventListener('touchstart', trigger, { passive: false });
        btn.addEventListener('click', trigger);
    };
    wireTouchAction('btnTouchBomb', 'action');
    wireTouchAction('btnTouchSwap', 'swap');
    wireTouchAction('btnTouchDetonate', 'detonate');

    // UI Buttons
    const btnTouchToggle = document.getElementById('btnTouchToggle');
    if (btnTouchToggle) {
        btnTouchToggle.addEventListener('click', () => {
            touchControlsVisible = !touchControlsVisible;
            applyTouchControlsVisibility();
            showToast(touchControlsVisible ? 'Touch controls enabled' : 'Touch controls hidden');
        });
    }

    const btnSoundToggle = document.getElementById('btnSoundToggle');
    if (btnSoundToggle) {
        btnSoundToggle.addEventListener('click', () => {
            const muted = sfx.toggleMute();
            const iconOn = document.getElementById('iconSoundOn');
            const iconOff = document.getElementById('iconSoundOff');
            if (iconOn) iconOn.classList.toggle('hidden', muted);
            if (iconOff) iconOff.classList.toggle('hidden', !muted);
        });
    }

    const btnStartLocal = document.getElementById('btnStartLocal');
    if (btnStartLocal) {
        btnStartLocal.addEventListener('click', startLocalMatch);
    }

    const btnOpenOnlineHub = document.getElementById('btnOpenOnlineHub');
    if (btnOpenOnlineHub) {
        btnOpenOnlineHub.addEventListener('click', () => {
            sfx.init();
            const inputName = document.getElementById('inputPlayerName');
            if (inputName) inputName.value = netState.playerName;
            showView('viewOnlineHub');
            subscribeToOpenRooms();
        });
    }

    const btnBackFromOnlineHub = document.getElementById('btnBackFromOnlineHub');
    if (btnBackFromOnlineHub) {
        btnBackFromOnlineHub.addEventListener('click', () => {
            if (netState.roomsListUnsubscribe) {
                netState.roomsListUnsubscribe();
                netState.roomsListUnsubscribe = null;
            }
            showView('viewMenu');
        });
    }

    const btnCreateRoom = document.getElementById('btnCreateRoom');
    if (btnCreateRoom) {
        btnCreateRoom.addEventListener('click', createOnlineRoom);
    }

    const btnJoinByCode = document.getElementById('btnJoinByCode');
    if (btnJoinByCode) {
        btnJoinByCode.addEventListener('click', () => {
            const inputCode = document.getElementById('inputJoinCode');
            if (inputCode) joinOnlineRoom(inputCode.value);
        });
    }

    // Event delegation on Open Rooms List for JOIN buttons
    const openRoomsList = document.getElementById('openRoomsList');
    if (openRoomsList) {
        openRoomsList.addEventListener('click', (e) => {
            const joinBtn = e.target.closest('[data-room-code]');
            if (joinBtn) {
                const code = joinBtn.getAttribute('data-room-code');
                if (code) joinOnlineRoom(code);
            }
        });
    }

    const btnCopyRoomCode = document.getElementById('btnCopyRoomCode');
    if (btnCopyRoomCode) {
        btnCopyRoomCode.addEventListener('click', () => {
            const codeEl = document.getElementById('lobbyRoomCode');
            const code = codeEl ? codeEl.textContent : '';
            const temp = document.createElement('textarea');
            temp.value = code;
            document.body.appendChild(temp);
            temp.select();
            document.execCommand('copy');
            document.body.removeChild(temp);
            showToast(`Copied Room Code: ${code}`);
        });
    }

    const btnLeaveRoom = document.getElementById('btnLeaveRoom');
    if (btnLeaveRoom) {
        btnLeaveRoom.addEventListener('click', () => leaveOnlineRoom(true));
    }

    // Lobby Settings listeners
    ['lobbyWinsSelect', 'lobbyBotFillSelect', 'lobbyBotDiffSelect'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('change', () => {
                const winsSel = document.getElementById('lobbyWinsSelect');
                const botFillSel = document.getElementById('lobbyBotFillSelect');
                const botDiffSel = document.getElementById('lobbyBotDiffSelect');
                updateLobbySettings({
                    winsNeeded: parseInt(winsSel?.value || '3', 10),
                    botFill: botFillSel?.value || 'fill',
                    botDiff: botDiffSel?.value || 'hard'
                });
            });
        }
    });

    const btnToggleReady = document.getElementById('btnToggleReady');
    if (btnToggleReady) {
        btnToggleReady.addEventListener('click', toggleReadyStatus);
    }

    const btnHostStartOnline = document.getElementById('btnHostStartOnline');
    if (btnHostStartOnline) {
        btnHostStartOnline.addEventListener('click', hostLaunchOnlineMatch);
    }

    const btnNextRound = document.getElementById('btnNextRound');
    if (btnNextRound) {
        btnNextRound.addEventListener('click', advanceToNextRound);
    }

    const btnPlayAgain = document.getElementById('btnPlayAgain');
    if (btnPlayAgain) {
        btnPlayAgain.addEventListener('click', rematchCurrentSetup);
    }

    const exitMatchHandler = () => {
        clearTimeout(game.roundEndTimer);
        game.active = false;
        if (game.mode === 'online') leaveOnlineRoom(true);
        else showView('viewMenu');
    };

    const btnOverlayExit = document.getElementById('btnOverlayExit');
    if (btnOverlayExit) btnOverlayExit.addEventListener('click', exitMatchHandler);

    const btnReturnMenu = document.getElementById('btnReturnMenu');
    if (btnReturnMenu) btnReturnMenu.addEventListener('click', exitMatchHandler);

    window.addEventListener('resize', () => {
        if (game.active) resizeCanvas();
    });

    window.addEventListener('beforeunload', handleTabClose);
    window.addEventListener('pagehide', handleTabClose);
}

// =========================================================================
// Application Boot
// =========================================================================
function boot() {
    initLocalMapSelector();
    applyTouchControlsVisibility();
    setupEventListeners();
    requestAnimationFrame(gameLoop);
    // Initialize Firebase in the background without blocking UI
    initFirebase().catch(err => {
        console.warn('Firebase init error:', err);
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
} else {
    boot();
}

