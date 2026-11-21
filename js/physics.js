// =========================================================================
// js/physics.js - Core Physics, Robot Mechanics, Weapons & Simulation
// =========================================================================
import {
    ROBOT_PROFILES,
    MAP_DEFINITIONS,
    MAP_IDS,
    getRobotSpawn,
    createSeededRand,
    generateMapLayout,
    buildSpiralOrder,
    TILE_WALL,
    TILE_CRATE,
    TILE_LAVA,
    TILE_CRUSHER,
    TILE_RARE_CRATE,
    TILE_EMPTY,
    ROUND_DURATION_STANDARD,
    ROUND_DURATION_BIG,
    SUDDEN_DEATH_STANDARD,
    SUDDEN_DEATH_BIG,
    MAX_BOMBS,
    MAX_DETONATOR_BOMBS,
    POWERUP_TYPES,
    RARE_DROP_POOL
} from './config.js';

import { game, netState, uiSelection, markGridDirty, showToast, showView } from './state.js';
import { sfx } from './audio.js';
import { resizeCanvas, spawnExplosionParticles, spawnCrateDebris, spawnWarpBurst, addFloatingText } from './renderer.js';
import { updateSmartAiBot } from './ai.js';
import { pushHostGameStateNow, leaveOnlineRoom, sendClientInput, removePlayerSlot, isFirebaseReady, getCurrentUser } from './firebase.js';
import { updateMatchHeaderHud, updateGameHud } from './main.js';

export function createRobot(slotIndex, config) {
    const profile = ROBOT_PROFILES[slotIndex];
    const spawn = getRobotSpawn(slotIndex, game.cols, game.rows);
    return {
        slot: slotIndex,
        name: config.name || profile.name,
        color: profile.color,
        midColor: profile.midColor,
        darkColor: profile.darkColor,
        visorColor: profile.visorColor,
        glow: profile.glow,
        controlType: config.controlType, // 'p1' | 'p2' | 'ai' | 'online_local' | 'online_remote'
        aiDifficulty: config.aiDifficulty || 'hard',
        uid: config.uid || null,
        x: spawn.c + 0.5,
        y: spawn.r + 0.5,
        dir: 'down',
        alive: true,
        wins: config.wins || 0,
        score: config.score || 0,
        maxBombs: 1,
        activeBombs: 0,
        activeDetonatorBombs: 0,
        blastRadius: 2,
        speed: 3.75,
        hasShield: false,
        virusEffect: null,
        virusTimer: 0,
        invulnTimer: 1.4,
        warpCooldown: 0,
        warpCount: config.warpCount || 0,
        walkAnim: 0,
        moving: false,
        netTargetX: spawn.c + 0.5,
        netTargetY: spawn.r + 0.5,
        netDir: 'down',
        netMoving: false,
        netDx: 0,
        netDy: 0,
        netSpeed: 3.75,
        netLastPacketTime: 0,
        // Rare Drop Weapon System
        rareItem: null,        // null | 'SNIPER' | 'KNIFE' | 'DETONATOR'
        rareAmmo: 0,           // 3 for Sniper, -1 (unlimited) for Knife/Detonator
        equippedSlot: 'bomb',  // 'bomb' | 'rare'
        actionCooldown: 0,
        // Tactical AI memory
        aiDecisionTimer: 0,
        aiBombCooldown: 0,
        aiPath: [],
        aiGoalType: 'idle'
    };
}

export function pickActiveMapId(choice, seed) {
    if (choice === 'random') {
        const rand = createSeededRand(seed);
        return MAP_IDS[Math.floor(rand() * MAP_IDS.length)];
    }
    return MAP_DEFINITIONS[choice] ? choice : 'foundry';
}

export function startLocalMatch() {
    sfx.init();
    const modeVal = document.getElementById('localModeSelect').value;
    const aiDiff = document.getElementById('localAiDifficulty').value;
    const winsTarget = parseInt(document.getElementById('localWinsTarget').value, 10);

    game.mode = 'local';
    game.selectedMapChoice = uiSelection.localMap;
    game.winsNeeded = winsTarget;
    game.roundNumber = 1;
    game.matchOver = false;

    const configs = [];
    if (modeVal === '1p_4ffa') {
        configs.push({ slot: 0, name: 'PLAYER 1', controlType: 'p1', wins: 0 });
        configs.push({ slot: 1, name: 'BOT-COBALT', controlType: 'ai', aiDifficulty: aiDiff, wins: 0 });
        configs.push({ slot: 2, name: 'BOT-VIPER', controlType: 'ai', aiDifficulty: aiDiff, wins: 0 });
        configs.push({ slot: 3, name: 'BOT-SOLAR', controlType: 'ai', aiDifficulty: aiDiff, wins: 0 });
    } else if (modeVal === '1p_1v1') {
        configs.push({ slot: 0, name: 'PLAYER 1', controlType: 'p1', wins: 0 });
        configs.push({ slot: 1, name: 'BOT-DUEL', controlType: 'ai', aiDifficulty: aiDiff, wins: 0 });
    } else if (modeVal === '2p_4ffa') {
        configs.push({ slot: 0, name: 'PLAYER 1', controlType: 'p1', wins: 0 });
        configs.push({ slot: 1, name: 'PLAYER 2', controlType: 'p2', wins: 0 });
        configs.push({ slot: 2, name: 'BOT-VIPER', controlType: 'ai', aiDifficulty: aiDiff, wins: 0 });
        configs.push({ slot: 3, name: 'BOT-SOLAR', controlType: 'ai', aiDifficulty: aiDiff, wins: 0 });
    } else if (modeVal === '2p_1v1') {
        configs.push({ slot: 0, name: 'PLAYER 1', controlType: 'p1', wins: 0 });
        configs.push({ slot: 1, name: 'PLAYER 2', controlType: 'p2', wins: 0 });
    }

    setupRound(configs, Date.now());
    showView('viewGame');
    resizeCanvas();
}

export function setupRound(robotConfigs, seed) {
    clearTimeout(game.roundEndTimer);
    const chosenMap = pickActiveMapId(game.selectedMapChoice, seed);
    const layout = generateMapLayout(chosenMap, seed);

    game.activeMapId = layout.mapId;
    game.cols = layout.cols;
    game.rows = layout.rows;
    game.isBig = layout.isBig;
    game.grid = layout.grid;
    game.warpPads = layout.warpPads;

    // Round & Sudden Death durations: 1:30 / 90s for standard maps, 2:00 / 120s for big maps
    const baseDuration = layout.isBig ? ROUND_DURATION_BIG : ROUND_DURATION_STANDARD;
    const sdDuration = layout.isBig ? SUDDEN_DEATH_BIG : SUDDEN_DEATH_STANDARD;

    // Pre-filter non-wall interior tiles so crushers close the entire map in exact sdDuration
    game.sdSpiral = buildSpiralOrder(layout.cols, layout.rows).filter(
        pt => layout.grid[pt.r][pt.c] !== TILE_WALL
    );
    game.sdDuration = sdDuration;
    game.sdStepInterval = Math.max(0.12, (sdDuration - 0.85) / Math.max(1, game.sdSpiral.length));
    game.roundTimer = baseDuration;
    game.suddenDeathActive = false;
    game.rareBlocksSpawned = false;
    game.rareDropQueue = [];
    game.sdSpiralIndex = 0;
    game.sdNextDropTimer = 0;
    game.crusherWarnings = [];
    game.bombs = [];
    game.explosions = [];
    game.powerups = [];
    netState.claimedPowerups = {};
    game.projectiles = [];
    game.knifeSlashes = [];
    game.scorchMarks = [];
    game.particles = [];
    game.debris = [];
    game.floatingTexts = [];
    game.screenShake = 0;
    game.roundOver = false;
    game.active = true;
    game.lastCountdownSec = -1;
    game.gridDirty = true;
    game.gridVersion = 1;
    netState.remoteInputs = {};
    netState.lastSentInput = null;
    netState.lastClientInputPush = 0;
    netState.clientActionId = 0;
    netState.pendingAction = null;
    netState.isPushingInput = false;
    netState.isPushingState = false;

    game.robots = robotConfigs.map((cfg, idx) => createRobot(cfg.slot !== undefined ? cfg.slot : idx, cfg));
    game.robots.forEach(r => {
        r._roundStartTime = Date.now();
        r._lastRemoteSwapSeq = 0;
        r._lastRemoteDetSeq = 0;
        r._lastRemoteActSeq = 0;
        r._lastRemoteActionId = 0;
        r._warpSeq = 0;
        r._lastRemoteWarpSeq = 0;
        r.warpCount = 0;
    });

    document.getElementById('arenaOverlay').classList.add('hidden');
    resizeCanvas();
    updateMatchHeaderHud();
    updateGameHud();
}

export function isSolidTile(tile) {
    return tile === TILE_WALL || tile === TILE_CRATE || tile === TILE_LAVA || tile === TILE_CRUSHER || tile === TILE_RARE_CRATE;
}

export function isTileWalkable(c, r, robot, simExtraBomb = null, allowOwnCurrentBomb = true) {
    if (r < 0 || r >= game.rows || c < 0 || c >= game.cols) return false;
    if (isSolidTile(game.grid[r][c])) return false;

    if (simExtraBomb && simExtraBomb.c === c && simExtraBomb.r === r) {
        if (!allowOwnCurrentBomb) return false;
        const rc = Math.floor(robot.x);
        const rr = Math.floor(robot.y);
        if (rc !== c || rr !== r) return false;
    }

    for (const b of game.bombs) {
        if (b.c === c && b.r === r) {
            if (b.passSlots && b.passSlots.has(robot.slot)) continue;
            return false;
        }
    }
    return true;
}

export function updateRobotTimers(robot, dt) {
    if (!robot.alive) return;
    if (robot.warpCooldown > 0) robot.warpCooldown = Math.max(0, robot.warpCooldown - dt);
    if (robot.invulnTimer > 0) robot.invulnTimer = Math.max(0, robot.invulnTimer - dt);
    if (robot.actionCooldown > 0) robot.actionCooldown = Math.max(0, robot.actionCooldown - dt);
    if (robot.virusTimer > 0) {
        robot.virusTimer = Math.max(0, robot.virusTimer - dt);
        if (robot.virusEffect === 'diarrhea') {
            placeBomb(robot);
        }
        if (robot.virusTimer <= 0) {
            robot.virusEffect = null;
            updateGameHud();
        }
    }
}

export function moveRobot(robot, dx, dy, dt) {
    if (!robot.alive) return;

    if (robot.virusTimer > 0 && robot.virusEffect === 'reverse') {
        dx = -dx;
        dy = -dy;
    }

    robot.moving = (dx !== 0 || dy !== 0);
    if (!robot.moving) return;

    // Normalize diagonal input slightly
    if (dx !== 0 && dy !== 0) {
        const inv = 0.7071;
        dx *= inv;
        dy *= inv;
    }

    if (Math.abs(dx) >= Math.abs(dy)) {
        robot.dir = dx > 0 ? 'right' : 'left';
    } else {
        robot.dir = dy > 0 ? 'down' : 'up';
    }

    const speedMult = robot.virusEffect === 'slow' ? 0.55 : 1.0;
    const moveDist = robot.speed * speedMult * dt;
    robot.walkAnim += moveDist * 5.2;

    // Emit thruster spark trail when moving fast
    if (robot.speed >= 4.2 && Math.random() < 0.45) {
        game.particles.push({
            x: robot.x - Math.sign(dx) * 0.15 + (Math.random() - 0.5) * 0.16,
            y: robot.y + 0.12 - Math.sign(dy) * 0.15,
            vx: -dx * 1.1 + (Math.random() - 0.5) * 0.4,
            vy: -dy * 1.1 + (Math.random() - 0.5) * 0.4,
            color: robot.visorColor,
            size: 2.2,
            life: 0.22
        });
    }

    const halfSize = 0.32;
    const assistRate = moveDist * 1.15;

    // Horizontal movement + smooth arcade corner-assist
    if (dx !== 0) {
        const curC = Math.floor(robot.x);
        const nextX = robot.x + dx * moveDist;
        const leadX = dx > 0 ? nextX + halfSize : nextX - halfSize;
        const checkC = Math.floor(leadX);

        if (checkC !== curC) {
            const topR = Math.floor(robot.y - halfSize);
            const botR = Math.floor(robot.y + halfSize);
            const topOpen = isTileWalkable(checkC, topR, robot);
            const botOpen = isTileWalkable(checkC, botR, robot);

            if (topOpen && botOpen) {
                robot.x = nextX;
            } else if (topOpen && !botOpen) {
                const targetY = topR + 0.5;
                const diff = targetY - robot.y;
                robot.y += Math.sign(diff) * Math.min(Math.abs(diff), assistRate);
            } else if (!topOpen && botOpen) {
                const targetY = botR + 0.5;
                const diff = targetY - robot.y;
                robot.y += Math.sign(diff) * Math.min(Math.abs(diff), assistRate);
            } else {
                robot.x = dx > 0 ? checkC - halfSize - 0.001 : checkC + 1 + halfSize + 0.001;
            }
        } else {
            robot.x = nextX;
        }
    }

    // Vertical movement + smooth arcade corner-assist
    if (dy !== 0) {
        const curR = Math.floor(robot.y);
        const nextY = robot.y + dy * moveDist;
        const leadY = dy > 0 ? nextY + halfSize : nextY - halfSize;
        const checkR = Math.floor(leadY);

        if (checkR !== curR) {
            const leftC = Math.floor(robot.x - halfSize);
            const rightC = Math.floor(robot.x + halfSize);
            const leftOpen = isTileWalkable(leftC, checkR, robot);
            const rightOpen = isTileWalkable(rightC, checkR, robot);

            if (leftOpen && rightOpen) {
                robot.y = nextY;
            } else if (leftOpen && !rightOpen) {
                const targetX = leftC + 0.5;
                const diff = targetX - robot.x;
                robot.x += Math.sign(diff) * Math.min(Math.abs(diff), assistRate);
            } else if (!leftOpen && rightOpen) {
                const targetX = rightC + 0.5;
                const diff = targetX - robot.x;
                robot.x += Math.sign(diff) * Math.min(Math.abs(diff), assistRate);
            } else {
                robot.y = dy > 0 ? checkR - halfSize - 0.001 : checkR + 1 + halfSize + 0.001;
            }
        } else {
            robot.y = nextY;
        }
    }

    // Update bomb pass-through status once robot leaves bomb footprint
    for (const b of game.bombs) {
        if (b.passSlots && b.passSlots.has(robot.slot)) {
            const overlaps = (
                robot.x + halfSize > b.c &&
                robot.x - halfSize < b.c + 1 &&
                robot.y + halfSize > b.r &&
                robot.y - halfSize < b.r + 1
            );
            if (!overlaps) {
                b.passSlots.delete(robot.slot);
            }
        }
    }
}

export function checkRobotTileInteractions(robot, isLocalClient = false) {
    if (!robot.alive) return false;
    let interacted = false;

    // Check Warp Pads (Mecha Vault)
    const curTileC = Math.floor(robot.x);
    const curTileR = Math.floor(robot.y);
    if (robot.warpCooldown <= 0 && game.warpPads && game.warpPads.length >= 2) {
        const pad = game.warpPads.find(wp => wp.c === curTileC && wp.r === curTileR);
        if (pad && Math.hypot(robot.x - (pad.c + 0.5), robot.y - (pad.r + 0.5)) < 0.38) {
            const target = game.warpPads.find(wp => wp.id === pad.targetId);
            if (target && !isSolidTile(game.grid[target.r][target.c])) {
                spawnWarpBurst(robot.x, robot.y, pad.color);
                robot.x = target.c + 0.5;
                robot.y = target.r + 0.5;
                robot.warpCooldown = 2.2;
                robot.aiPath = [];
                robot._warpSeq = (robot._warpSeq || 0) + 1;
                robot.warpCount = (robot.warpCount || 0) + 1;
                spawnWarpBurst(robot.x, robot.y, target.color);
                addFloatingText(robot.x, robot.y - 0.45, 'WARP!', target.color);
                sfx.warp();
                interacted = true;
            }
        }
    }

    // Check Powerup Pickup (with contact radius < 0.52 and tile check)
    for (let i = game.powerups.length - 1; i >= 0; i--) {
        const p = game.powerups[i];
        const dist = Math.hypot(robot.x - (p.c + 0.5), robot.y - (p.r + 0.5));
        if (dist < 0.52 || (p.c === curTileC && p.r === curTileR)) {
            applyPowerup(robot, p.type);
            game.powerups.splice(i, 1);
            interacted = true;
            if (isLocalClient) {
                robot._lastPowerupClaimTime = performance.now();
                if (!netState.claimedPowerups) netState.claimedPowerups = {};
                netState.claimedPowerups[`${p.c},${p.r}`] = performance.now();
            }
        }
    }

    return interacted;
}

export function applyPowerup(robot, type) {
    if (type === 'BOMB') {
        // STRICT MAX BOMB CAP = 4
        if (robot.maxBombs < MAX_BOMBS) {
            robot.maxBombs = Math.min(MAX_BOMBS, robot.maxBombs + 1);
            robot.score += 50;
            sfx.powerup();
            addFloatingText(robot.x, robot.y - 0.45, `+1 BOMB (${robot.maxBombs}/${MAX_BOMBS})`, '#60a5fa');
        } else {
            robot.score += 150;
            sfx.maxBombBonus();
            addFloatingText(robot.x, robot.y - 0.45, 'MAX BOMBS (4/4) +150', '#fbbf24');
        }
    } else if (type === 'FIRE') {
        robot.blastRadius = Math.min(7, robot.blastRadius + 1);
        robot.score += 50;
        sfx.powerup();
        addFloatingText(robot.x, robot.y - 0.45, '+1 FLAME', '#fb923c');
    } else if (type === 'SPEED') {
        robot.speed = Math.min(6.4, robot.speed + 0.52);
        robot.score += 50;
        sfx.powerup();
        addFloatingText(robot.x, robot.y - 0.45, 'TURBO SPEED!', '#34d399');
    } else if (type === 'SHIELD') {
        robot.hasShield = true;
        robot.score += 75;
        sfx.powerup();
        addFloatingText(robot.x, robot.y - 0.45, 'HEX SHIELD!', '#22d3ee');
    } else if (type === 'VIRUS') {
        sfx.virus();
        const glitches = ['reverse', 'slow', 'diarrhea'];
        const chosen = glitches[Math.floor(Math.random() * glitches.length)];
        robot.virusEffect = chosen;
        robot.virusTimer = 6.5;
        const label = chosen === 'reverse' ? 'CONTROLS INVERTED!' : (chosen === 'slow' ? 'SYSTEM SLOW!' : 'BOMB OVERLOAD!');
        addFloatingText(robot.x, robot.y - 0.45, label, '#c084fc');
    } else if (type === 'SNIPER') {
        robot.rareItem = 'SNIPER';
        robot.rareAmmo = 3;
        robot.equippedSlot = 'rare';
        robot.score += 150;
        sfx.rarePickup();
        addFloatingText(robot.x, robot.y - 0.5, '🎯 SNIPER (3 SHOTS)!', '#38bdf8');
        showToast(`🎯 ${robot.name} acquired the SNIPER RIFLE (3 bullets)!`);
    } else if (type === 'KNIFE') {
        robot.rareItem = 'KNIFE';
        robot.rareAmmo = -1;
        robot.equippedSlot = 'rare';
        robot.score += 150;
        sfx.rarePickup();
        addFloatingText(robot.x, robot.y - 0.5, '🔪 PLASMA KNIFE!', '#fb7185');
        showToast(`🔪 ${robot.name} acquired the PLASMA KNIFE (same-tile strike)!`);
    } else if (type === 'DETONATOR') {
        robot.rareItem = 'DETONATOR';
        robot.rareAmmo = -1;
        robot.equippedSlot = 'rare';
        robot.score += 150;
        sfx.rarePickup();
        addFloatingText(robot.x, robot.y - 0.5, '🧨 DETONATOR C4 (MAX 2)!', '#e879f9');
        showToast(`🧨 ${robot.name} acquired DETONATOR C4 (2 max-radius remote bombs)!`);
    }
    updateGameHud();
}

export function swapRobotWeapon(robot) {
    if (!robot.alive || !robot.rareItem) return;
    robot.equippedSlot = robot.equippedSlot === 'rare' ? 'bomb' : 'rare';
    sfx.weaponSwap();
    const label = robot.equippedSlot === 'rare'
        ? (POWERUP_TYPES[robot.rareItem]?.label || robot.rareItem)
        : '💣 REGULAR BOMBS';
    addFloatingText(robot.x, robot.y - 0.45, label, robot.equippedSlot === 'rare' ? '#facc15' : '#60a5fa');
    updateGameHud();
}

export function eliminateOrShieldHitRobot(victim, killer, label, color) {
    if (!victim.alive || victim.invulnTimer > 0) return false;
    if (victim.hasShield) {
        victim.hasShield = false;
        victim.invulnTimer = 1.45;
        sfx.shieldHit();
        spawnWarpBurst(victim.x, victim.y, '#22d3ee');
        addFloatingText(victim.x, victim.y - 0.5, 'SHIELD BLOCKED!', '#22d3ee');
        updateGameHud();
        return false;
    }
    victim.alive = false;
    if (killer && killer !== victim) killer.score += 200;
    sfx.robotEliminated();
    game.screenShake = Math.max(game.screenShake, 0.36);
    spawnExplosionParticles(victim.x, victim.y, victim.color, 34);
    addFloatingText(victim.x, victim.y - 0.5, label, color);
    updateGameHud();
    return true;
}

export function eliminateRemoteDisconnected(robot, label = 'LEFT MATCH') {
    if (!robot || !robot.alive) return;
    robot.alive = false;
    robot.invulnTimer = 0;
    sfx.robotEliminated();
    game.screenShake = Math.max(game.screenShake, 0.36);
    spawnExplosionParticles(robot.x, robot.y, robot.color, 34);
    addFloatingText(robot.x, robot.y - 0.5, label, '#ff4d6d');
    updateGameHud();
    if (!game.roundOver) {
        const aliveRobots = game.robots.filter(r => r.alive);
        if (aliveRobots.length <= 1) {
            handleRoundComplete(aliveRobots.length === 1 ? aliveRobots[0] : null);
        }
    }
}

export function fireSniper(robot) {
    if (!robot.alive || robot.rareItem !== 'SNIPER' || robot.rareAmmo <= 0) return false;
    if (robot.actionCooldown > 0) return false;

    const dirVec = {
        up: { dx: 0, dy: -1 },
        down: { dx: 0, dy: 1 },
        left: { dx: -1, dy: 0 },
        right: { dx: 1, dy: 0 }
    }[robot.dir] || { dx: 0, dy: 1 };

    robot.rareAmmo--;
    robot.actionCooldown = 0.34;
    sfx.sniperShot();
    game.screenShake = Math.max(game.screenShake, 0.14);

    game.projectiles.push({
        ownerSlot: robot.slot,
        x: robot.x + dirVec.dx * 0.35,
        y: robot.y + dirVec.dy * 0.35,
        dx: dirVec.dx,
        dy: dirVec.dy,
        speed: 22.0,
        color: '#38bdf8',
        life: 1.5
    });

    spawnExplosionParticles(robot.x + dirVec.dx * 0.4, robot.y + dirVec.dy * 0.4, '#38bdf8', 7);

    if (robot.rareAmmo <= 0) {
        robot.rareItem = null;
        robot.equippedSlot = 'bomb';
        addFloatingText(robot.x, robot.y - 0.5, 'SNIPER EMPTY!', '#94a3b8');
    }
    updateGameHud();
    return true;
}

export function slashKnife(robot) {
    if (!robot.alive || robot.rareItem !== 'KNIFE') return false;
    if (robot.actionCooldown > 0) return false;

    robot.actionCooldown = 0.35;
    sfx.knifeSlash();
    game.knifeSlashes.push({
        x: robot.x,
        y: robot.y,
        dir: robot.dir,
        timer: 0.24,
        maxTimer: 0.24
    });

    const myC = Math.floor(robot.x);
    const myR = Math.floor(robot.y);
    let hitAny = false;

    for (const other of game.robots) {
        if (other === robot || !other.alive) continue;
        const oc = Math.floor(other.x);
        const or = Math.floor(other.y);
        // Knife hits if both players are on the exact same block
        if (oc === myC && or === myR) {
            eliminateOrShieldHitRobot(other, robot, 'KNIFED!', '#fb7185');
            hitAny = true;
        }
    }
    if (!hitAny) {
        spawnExplosionParticles(robot.x, robot.y, '#fb7185', 5);
    }
    return true;
}

export function placeDetonatorBomb(robot, customC, customR, isOptimistic = false) {
    if (!robot.alive || robot.rareItem !== 'DETONATOR') return false;
    // Strict cap of 2 Detonator Bombs! If 2 are already planted, pressing action triggers them!
    if (robot.activeDetonatorBombs >= MAX_DETONATOR_BOMBS) {
        return triggerRobotDetonator(robot);
    }
    const c = (customC !== undefined && customC >= 0 && customC < game.cols) ? customC : Math.floor(robot.x);
    const r = (customR !== undefined && customR >= 0 && customR < game.rows) ? customR : Math.floor(robot.y);
    if (isSolidTile(game.grid[r][c])) return false;
    if (game.bombs.some(b => b.c === c && b.r === r)) return false;

    const passSlots = new Set();
    for (const other of game.robots) {
        if (!other.alive) continue;
        const half = 0.32;
        if (other.x + half > c && other.x - half < c + 1 && other.y + half > r && other.y - half < r + 1) {
            passSlots.add(other.slot);
        }
    }

    robot.activeDetonatorBombs++;
    robot.actionCooldown = 0.24;
    const newBomb = {
        id: Math.random().toString(36).slice(2),
        c,
        r,
        ownerSlot: robot.slot,
        radius: Math.max(game.cols, game.rows), // MAX MAP RADIUS!
        timer: Infinity, // Only explodes when player presses detonator (or chain-blasted)
        maxTimer: 2.35,
        isDetonator: true,
        passSlots
    };
    if (isOptimistic) {
        newBomb.optimistic = true;
        newBomb.createdAt = performance.now();
    }
    game.bombs.push(newBomb);
    sfx.detonatorPlant();
    updateGameHud();
    return true;
}

export function triggerRobotDetonator(robot) {
    if (!robot.alive) return false;
    const myDetBombs = game.bombs.filter(b => b.isDetonator && b.ownerSlot === robot.slot);
    if (myDetBombs.length === 0) return false;

    sfx.detonatorTrigger();
    addFloatingText(robot.x, robot.y - 0.45, '💥 DETONATE!', '#e879f9');
    // Detonate all armed remote bombs owned by this robot
    for (const b of [...myDetBombs]) {
        if (game.bombs.includes(b)) {
            detonateBomb(b);
        }
    }
    return true;
}

export function useEquippedItem(robot, isFreshPress = true, isOptimistic = false) {
    if (!robot.alive) return false;
    if (robot.equippedSlot === 'rare' && robot.rareItem) {
        if (robot.rareItem === 'SNIPER') {
            return isFreshPress ? fireSniper(robot) : false;
        }
        if (robot.rareItem === 'KNIFE') {
            return isFreshPress ? slashKnife(robot) : false;
        }
        if (robot.rareItem === 'DETONATOR') {
            return isFreshPress ? placeDetonatorBomb(robot, undefined, undefined, isOptimistic) : false;
        }
    }
    return placeBomb(robot, undefined, undefined, isOptimistic);
}

export function placeBomb(robot, customC, customR, isOptimistic = false) {
    if (!robot.alive) return false;
    const cap = Math.min(MAX_BOMBS, robot.maxBombs);
    if (robot.activeBombs >= cap) return false;

    const c = (customC !== undefined && customC >= 0 && customC < game.cols) ? customC : Math.floor(robot.x);
    const r = (customR !== undefined && customR >= 0 && customR < game.rows) ? customR : Math.floor(robot.y);
    if (isSolidTile(game.grid[r][c])) return false;
    if (game.bombs.some(b => b.c === c && b.r === r)) return false;

    // Record every robot currently overlapping this tile so they can smoothly walk off
    const passSlots = new Set();
    for (const other of game.robots) {
        if (!other.alive) continue;
        const half = 0.32;
        if (other.x + half > c && other.x - half < c + 1 && other.y + half > r && other.y - half < r + 1) {
            passSlots.add(other.slot);
        }
    }

    robot.activeBombs++;
    const newBomb = {
        id: Math.random().toString(36).slice(2),
        c,
        r,
        ownerSlot: robot.slot,
        radius: robot.blastRadius,
        timer: 2.35,
        maxTimer: 2.35,
        isDetonator: false,
        passSlots
    };
    if (isOptimistic) {
        newBomb.optimistic = true;
        newBomb.createdAt = performance.now();
    }
    game.bombs.push(newBomb);
    sfx.bombDrop();
    updateGameHud();
    return true;
}

export function detonateBomb(bomb) {
    const idx = game.bombs.indexOf(bomb);
    if (idx !== -1) game.bombs.splice(idx, 1);

    const owner = game.robots.find(r => r.slot === bomb.ownerSlot);
    if (owner) {
        if (bomb.isDetonator) {
            owner.activeDetonatorBombs = Math.max(0, owner.activeDetonatorBombs - 1);
        } else {
            owner.activeBombs = Math.max(0, owner.activeBombs - 1);
        }
    }

    sfx.explosion();
    game.screenShake = Math.max(game.screenShake, bomb.isDetonator ? 0.42 : 0.30);

    spawnExplosionTile(bomb.c, bomb.r, 'center');

    const dirs = [
        { dc: 1, dr: 0, dir: 'horiz' },
        { dc: -1, dr: 0, dir: 'horiz' },
        { dc: 0, dr: 1, dir: 'vert' },
        { dc: 0, dr: -1, dir: 'vert' }
    ];

    for (const { dc, dr, dir } of dirs) {
        for (let step = 1; step <= bomb.radius; step++) {
            const tc = bomb.c + dc * step;
            const tr = bomb.r + dr * step;
            if (tr < 0 || tr >= game.rows || tc < 0 || tc >= game.cols) break;

            const tile = game.grid[tr][tc];
            if (tile === TILE_WALL || tile === TILE_CRUSHER) break;

            // Chain-detonate other bombs immediately (including remote C4!)
            const chainBomb = game.bombs.find(b => b.c === tc && b.r === tr);
            if (chainBomb) {
                chainBomb.timer = Math.min(chainBomb.timer, 0.04);
            }

            // Destroy regular uncollected powerups caught in blast (never erase Rare Drops!)
            const pIdx = game.powerups.findIndex(p => p.c === tc && p.r === tr && !p.isRare);
            if (pIdx !== -1) game.powerups.splice(pIdx, 1);

            spawnExplosionTile(tc, tr, dir);

            if (tile === TILE_CRATE) {
                game.grid[tr][tc] = TILE_EMPTY;
                markGridDirty();
                if (owner) owner.score += 15;
                spawnCrateDebris(tc + 0.5, tr + 0.5);
                maybeSpawnPowerup(tc, tr);
                break; // Blast stops after shattering 1 crate
            }

            if (tile === TILE_RARE_CRATE) {
                game.grid[tr][tc] = TILE_EMPTY;
                markGridDirty();
                if (owner) owner.score += 100;
                spawnExplosionParticles(tc + 0.5, tr + 0.5, '#facc15', 28);
                const rareType = game.rareDropQueue.shift() || RARE_DROP_POOL[Math.floor(Math.random() * RARE_DROP_POOL.length)];
                game.powerups.push({ c: tc, r: tr, type: rareType, isRare: true, bobTimer: 0 });
                sfx.rareBlockSpawn();
                addFloatingText(tc + 0.5, tr + 0.2, `✨ ${POWERUP_TYPES[rareType].label}!`, '#facc15');
                break;
            }
        }
    }
    updateGameHud();
}

export function spawnExplosionTile(c, r, dir) {
    game.explosions.push({ c, r, dir, timer: 0.46, maxTimer: 0.46 });
    game.scorchMarks.push({ c, r, alpha: 0.55 });
    if (game.scorchMarks.length > 60) game.scorchMarks.shift();
    spawnExplosionParticles(c + 0.5, r + 0.5, '#ff6b00', 5);
}

export function maybeSpawnPowerup(c, r) {
    if (Math.random() > 0.50) return;
    const roll = Math.random();
    let type = 'BOMB';
    if (roll < 0.30) type = 'BOMB';
    else if (roll < 0.58) type = 'FIRE';
    else if (roll < 0.78) type = 'SPEED';
    else if (roll < 0.89) type = 'SHIELD';
    else type = 'VIRUS';

    game.powerups.push({ c, r, type, bobTimer: Math.random() * 6 });
}

export function isKeyJustPressed(code) {
    return !!game.keys[code] && !game.prevKeys[code];
}

export function getLocalInputs() {
    let p1x = 0, p1y = 0, p1Action = false, p1ActionFresh = false, p1Swap = false, p1Det = false;
    let p2x = 0, p2y = 0, p2Action = false, p2ActionFresh = false, p2Swap = false, p2Det = false;

    const k = game.keys;
    const localModeEl = document.getElementById('localModeSelect');
    const singleLocal = game.mode === 'online' || (localModeEl && localModeEl.value.startsWith('1p'));

    if (singleLocal) {
        if (k['KeyA'] || k['ArrowLeft']) p1x -= 1;
        if (k['KeyD'] || k['ArrowRight']) p1x += 1;
        if (k['KeyW'] || k['ArrowUp']) p1y -= 1;
        if (k['KeyS'] || k['ArrowDown']) p1y += 1;
        if (k['Space'] || k['Enter']) p1Action = true;
        if (isKeyJustPressed('Space') || isKeyJustPressed('Enter')) p1ActionFresh = true;
        if (isKeyJustPressed('KeyQ') || isKeyJustPressed('ShiftLeft')) p1Swap = true;
        if (isKeyJustPressed('KeyE') || isKeyJustPressed('KeyF') || isKeyJustPressed('ShiftRight')) p1Det = true;
    } else {
        if (k['KeyA']) p1x -= 1;
        if (k['KeyD']) p1x += 1;
        if (k['KeyW']) p1y -= 1;
        if (k['KeyS']) p1y += 1;
        if (k['Space']) p1Action = true;
        if (isKeyJustPressed('Space')) p1ActionFresh = true;
        if (isKeyJustPressed('KeyQ') || isKeyJustPressed('ShiftLeft')) p1Swap = true;
        if (isKeyJustPressed('KeyE') || isKeyJustPressed('KeyF')) p1Det = true;

        if (k['ArrowLeft']) p2x -= 1;
        if (k['ArrowRight']) p2x += 1;
        if (k['ArrowUp']) p2y -= 1;
        if (k['ArrowDown']) p2y += 1;
        if (k['Enter']) p2Action = true;
        if (isKeyJustPressed('Enter')) p2ActionFresh = true;
        if (isKeyJustPressed('ShiftRight') || isKeyJustPressed('Slash')) p2Swap = true;
        if (isKeyJustPressed('ControlRight') || isKeyJustPressed('Period') || isKeyJustPressed('Quote')) p2Det = true;
    }

    if (game.touchDir.x !== 0 || game.touchDir.y !== 0) {
        p1x = game.touchDir.x;
        p1y = game.touchDir.y;
    }
    if (game.touchQueue.action) {
        p1Action = true;
        p1ActionFresh = true;
        game.touchQueue.action = false;
    }
    if (game.touchQueue.swap) {
        p1Swap = true;
        game.touchQueue.swap = false;
    }
    if (game.touchQueue.detonate) {
        p1Det = true;
        game.touchQueue.detonate = false;
    }

    return { p1x, p1y, p1Action, p1ActionFresh, p1Swap, p1Det, p2x, p2y, p2Action, p2ActionFresh, p2Swap, p2Det };
}

export function spawnRareCratesForSuddenDeath() {
    if (game.rareBlocksSpawned) return;
    game.rareBlocksSpawned = true;

    // 1 Rare Drop per standard game, 2 Rare Drops on Big Maps!
    const targetCount = game.isBig ? 2 : 1;
    const shuffledRare = [...RARE_DROP_POOL].sort(() => Math.random() - 0.5);
    game.rareDropQueue = shuffledRare.slice(0, targetCount);

    const candidates = [];
    for (let r = 3; r <= game.rows - 4; r++) {
        for (let c = 3; c <= game.cols - 4; c++) {
            const tl = game.grid[r][c];
            if (tl !== TILE_EMPTY && tl !== TILE_CRATE) continue;
            if (game.warpPads.some(wp => wp.c === c && wp.r === r)) continue;
            if (game.bombs.some(b => b.c === c && b.r === r)) continue;
            if (game.robots.some(rb => rb.alive && Math.floor(rb.x) === c && Math.floor(rb.y) === r)) continue;
            if (game.crusherWarnings.some(cw => cw.c === c && cw.r === r)) continue;
            candidates.push({ c, r });
        }
    }

    // Shuffle candidates and place separated shining blocks
    for (let i = candidates.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    const chosen = [];
    for (const cand of candidates) {
        if (chosen.length >= targetCount) break;
        if (chosen.some(p => Math.abs(p.c - cand.c) + Math.abs(p.r - cand.r) < 5)) continue;
        chosen.push(cand);
    }
    while (chosen.length < targetCount && candidates.length > chosen.length) {
        const fallback = candidates.find(c => !chosen.includes(c));
        if (!fallback) break;
        chosen.push(fallback);
    }

    for (const pos of chosen) {
        game.grid[pos.r][pos.c] = TILE_RARE_CRATE;
        markGridDirty();
        const pIdx = game.powerups.findIndex(p => p.c === pos.c && p.r === pos.r);
        if (pIdx !== -1) game.powerups.splice(pIdx, 1);
        spawnExplosionParticles(pos.c + 0.5, pos.r + 0.5, '#facc15', 24);
        addFloatingText(pos.c + 0.5, pos.r + 0.1, '✨ RARE VAULT!', '#facc15');
    }

    if (chosen.length > 0) {
        sfx.rareBlockSpawn();
        showToast(
            targetCount > 1
                ? '✨ 2 SHINING RARE BLOCKS APPEARED! BLAST THEM WITH A BOMB!'
                : '✨ A SHINING RARE BLOCK APPEARED! BLAST IT WITH A BOMB!'
        );
    }
}

export function updateProjectiles(dt) {
    for (let i = game.projectiles.length - 1; i >= 0; i--) {
        const pr = game.projectiles[i];
        pr.life -= dt;
        if (pr.life <= 0) {
            game.projectiles.splice(i, 1);
            continue;
        }

        // Sub-step high-speed sniper bullet so it never tunnels through a robot or wall
        const steps = 4;
        const subDt = dt / steps;
        let destroyed = false;

        for (let s = 0; s < steps; s++) {
            pr.x += pr.dx * pr.speed * subDt;
            pr.y += pr.dy * pr.speed * subDt;

            const tc = Math.floor(pr.x);
            const tr = Math.floor(pr.y);
            if (tr < 0 || tr >= game.rows || tc < 0 || tc >= game.cols) {
                destroyed = true;
                break;
            }
            const tl = game.grid[tr][tc];
            if (tl === TILE_WALL || tl === TILE_CRUSHER || tl === TILE_CRATE || tl === TILE_RARE_CRATE) {
                spawnExplosionParticles(pr.x, pr.y, '#38bdf8', 9);
                destroyed = true;
                break;
            }

            // Check hit on enemy robots
            const shooter = game.robots.find(r => r.slot === pr.ownerSlot);
            for (const robot of game.robots) {
                if (!robot.alive || robot.slot === pr.ownerSlot) continue;
                if (Math.hypot(robot.x - pr.x, robot.y - pr.y) < 0.44) {
                    eliminateOrShieldHitRobot(robot, shooter, 'SNIPED!', '#38bdf8');
                    destroyed = true;
                    break;
                }
            }
            if (destroyed) break;
        }

        if (destroyed) {
            game.projectiles.splice(i, 1);
        }
    }

    for (let i = game.knifeSlashes.length - 1; i >= 0; i--) {
        game.knifeSlashes[i].timer -= dt;
        if (game.knifeSlashes[i].timer <= 0) game.knifeSlashes.splice(i, 1);
    }
}

export function updateSuddenDeath(dt) {
    if (game.roundOver) return;

    game.roundTimer = Math.max(0, game.roundTimer - dt);

    const sec = Math.ceil(game.roundTimer);
    if (sec !== game.lastCountdownSec) {
        game.lastCountdownSec = sec;
        if (!game.suddenDeathActive && sec <= 3 && sec > 0) sfx.countdownBeep(false);
        if (game.suddenDeathActive && sec <= 5 && sec > 0) sfx.countdownBeep(true);
        updateMatchHeaderHud();
    }

    if (!game.suddenDeathActive && game.roundTimer <= 0) {
        game.suddenDeathActive = true;
        game.roundTimer = game.sdDuration;
        game.lastCountdownSec = Math.ceil(game.roundTimer);
        const sdLabel = game.isBig ? '2:00' : '1:30';
        sfx.suddenDeathAlarm();
        showToast(`⚠️ SUDDEN DEATH (${sdLabel})! ARENA CLOSING!`, true);
        spawnRareCratesForSuddenDeath();
        updateMatchHeaderHud();
    }

    if (game.suddenDeathActive) {
        game.sdNextDropTimer -= dt;
        if (game.sdNextDropTimer <= 0 && game.sdSpiralIndex < game.sdSpiral.length) {
            game.sdNextDropTimer += game.sdStepInterval;
            while (game.sdSpiralIndex < game.sdSpiral.length) {
                const target = game.sdSpiral[game.sdSpiralIndex++];
                if (game.grid[target.r][target.c] !== TILE_WALL && game.grid[target.r][target.c] !== TILE_CRUSHER) {
                    game.crusherWarnings.push({ c: target.c, r: target.r, timer: 0.85, maxTimer: 0.85 });
                    break;
                }
            }
        }
    }

    // Update falling crusher warnings
    for (let i = game.crusherWarnings.length - 1; i >= 0; i--) {
        const cw = game.crusherWarnings[i];
        cw.timer -= dt;
        if (cw.timer <= 0) {
            game.crusherWarnings.splice(i, 1);
            game.grid[cw.r][cw.c] = TILE_CRUSHER;
            markGridDirty();
            sfx.crusherSlam();
            game.screenShake = Math.max(game.screenShake, 0.16);
            spawnExplosionParticles(cw.c + 0.5, cw.r + 0.5, '#ef4444', 10);

            const pIdx = game.powerups.findIndex(p => p.c === cw.c && p.r === cw.r);
            if (pIdx !== -1) game.powerups.splice(pIdx, 1);
            const bIdx = game.bombs.findIndex(b => b.c === cw.c && b.r === cw.r);
            if (bIdx !== -1) {
                const b = game.bombs[bIdx];
                game.bombs.splice(bIdx, 1);
                const owner = game.robots.find(r => r.slot === b.ownerSlot);
                if (owner) {
                    if (b.isDetonator) owner.activeDetonatorBombs = Math.max(0, owner.activeDetonatorBombs - 1);
                    else owner.activeBombs = Math.max(0, owner.activeBombs - 1);
                }
            }

            for (const robot of game.robots) {
                if (robot.alive && Math.floor(robot.x) === cw.c && Math.floor(robot.y) === cw.r) {
                    robot.alive = false;
                    sfx.robotEliminated();
                    spawnExplosionParticles(robot.x, robot.y, robot.color, 30);
                    addFloatingText(robot.x, robot.y - 0.5, 'CRUSHED!', '#ef4444');
                    updateGameHud();
                }
            }
        }
    }
}

export function updateSimulation(dt) {
    if (!game.active) return;

    // Ambient Lava Reactor embers / Bio-Hazard spores
    if ((game.activeMapId === 'lava' || game.activeMapId === 'bio') && Math.random() < 0.25) {
        game.particles.push({
            x: 1 + Math.random() * (game.cols - 2),
            y: 1 + Math.random() * (game.rows - 2),
            vx: (Math.random() - 0.5) * 0.5,
            vy: -0.7 - Math.random() * 0.8,
            color: game.activeMapId === 'bio'
                ? (Math.random() < 0.5 ? '#84cc16' : '#bef264')
                : (Math.random() < 0.5 ? '#fb923c' : '#fde047'),
            size: 1.8 + Math.random() * 1.8,
            life: 0.7 + Math.random() * 0.5
        });
    }

    // Decay screen shake & visual VFX
    if (game.screenShake > 0) game.screenShake = Math.max(0, game.screenShake - dt * 1.4);

    for (let i = game.particles.length - 1; i >= 0; i--) {
        const pt = game.particles[i];
        pt.x += pt.vx * dt;
        pt.y += pt.vy * dt;
        pt.life -= dt;
        if (pt.life <= 0) game.particles.splice(i, 1);
    }

    for (let i = game.debris.length - 1; i >= 0; i--) {
        const dbChunk = game.debris[i];
        dbChunk.x += dbChunk.vx * dt;
        dbChunk.y += dbChunk.vy * dt;
        dbChunk.vy += 9.5 * dt;
        dbChunk.rot += dbChunk.vrot * dt;
        dbChunk.life -= dt;
        if (dbChunk.life <= 0) game.debris.splice(i, 1);
    }

    for (let i = game.floatingTexts.length - 1; i >= 0; i--) {
        const ft = game.floatingTexts[i];
        ft.y -= 0.75 * dt;
        ft.life -= dt;
        if (ft.life <= 0) game.floatingTexts.splice(i, 1);
    }

    for (let i = game.scorchMarks.length - 1; i >= 0; i--) {
        game.scorchMarks[i].alpha -= dt * 0.04;
        if (game.scorchMarks[i].alpha <= 0) game.scorchMarks.splice(i, 1);
    }

    const inputs = getLocalInputs();

    // Online Guest Client: Send inputs & run Client-Side Prediction
    if (game.mode === 'online' && !netState.isHost) {
        // If host hasn't updated gameState for > 10 seconds, notify and return to menu
        if (netState.lastHostStateReceived && (Date.now() - netState.lastHostStateReceived > 10000)) {
            showToast('Хост отключился. Возврат в главное меню.', true);
            leaveOnlineRoom(false);
            return;
        }

        const myRobot = game.robots.find(r => r.slot === netState.mySlot);
        let hasAction = false;

        if (myRobot && myRobot.alive) {
            updateRobotTimers(myRobot, dt);
            moveRobot(myRobot, inputs.p1x, inputs.p1y, dt);
            checkRobotTileInteractions(myRobot, true);

            // Optimistic execution on client for instant 0ms response!
            if (inputs.p1Swap) {
                swapRobotWeapon(myRobot);
                netState.clientActionId = (netState.clientActionId || 0) + 1;
                netState.pendingAction = {
                    actionId: netState.clientActionId,
                    actionType: 'swap'
                };
                hasAction = true;
            }
            if (inputs.p1Det) {
                triggerRobotDetonator(myRobot);
                netState.clientActionId = (netState.clientActionId || 0) + 1;
                netState.pendingAction = {
                    actionId: netState.clientActionId,
                    actionType: 'detonate'
                };
                hasAction = true;
            }
            if (inputs.p1ActionFresh) {
                const actType = (myRobot.equippedSlot === 'rare' && myRobot.rareItem) ? myRobot.rareItem : 'bomb';
                const executed = useEquippedItem(myRobot, true, true);
                if (executed) {
                    netState.clientActionId = (netState.clientActionId || 0) + 1;
                    netState.pendingAction = {
                        actionId: netState.clientActionId,
                        actionType: actType,
                        actionC: Math.floor(myRobot.x),
                        actionR: Math.floor(myRobot.y),
                        actionDir: myRobot.dir
                    };
                    hasAction = true;
                }
            }
        }

        const now = performance.now();
        const cur = {
            dx: inputs.p1x,
            dy: inputs.p1y,
            bomb: inputs.p1Action,
            actionFresh: inputs.p1ActionFresh,
            swap: inputs.p1Swap,
            detonate: inputs.p1Det
        };

        const last = netState.lastSentInput;
        const stateChanged = !last ||
            last.dx !== cur.dx ||
            last.dy !== cur.dy ||
            last.bomb !== cur.bomb ||
            hasAction;

        const isMoving = cur.dx !== 0 || cur.dy !== 0 || (myRobot && myRobot.moving);
        const timeSincePush = now - (netState.lastClientInputPush || 0);
        // Push immediately on action, or throttled to 33 ms while moving or on input change (~30 Hz), or heartbeat every 250 ms
        let shouldPush = hasAction || ((stateChanged || isMoving) && timeSincePush >= 33) || (timeSincePush >= 250);

        // In-flight guard: if previous set() is still in progress and no immediate action, skip to prevent congestion
        if (netState.isPushingInput && !hasAction) {
            shouldPush = false;
        }

        if (isFirebaseReady() && getCurrentUser() && netState.roomCode && shouldPush && myRobot) {
            netState.lastClientInputPush = now;
            netState.lastSentInput = cur;
            netState.clientInputSeq = (netState.clientInputSeq || 0) + 1;
            const nextSeq = netState.clientInputSeq;

            const act = netState.pendingAction;
            netState.pendingAction = null;

            sendClientInput({
                slot: netState.mySlot,
                dx: cur.dx,
                dy: cur.dy,
                x: Number(myRobot.x.toFixed(3)),
                y: Number(myRobot.y.toFixed(3)),
                dir: myRobot.dir,
                moving: !!myRobot.moving,
                warpSeq: myRobot._warpSeq || 0,
                bomb: cur.bomb,
                actionFresh: cur.actionFresh,
                swap: cur.swap,
                detonate: cur.detonate,
                actionId: act ? act.actionId : (netState.clientActionId || 0),
                actionType: act ? act.actionType : null,
                actionC: Math.floor(myRobot.x),
                actionR: Math.floor(myRobot.y),
                actionDir: myRobot.dir,
                seq: nextSeq,
                ts: Date.now()
            });
        }

        // Smooth 60 FPS interpolation + extrapolation for remote opponents and host on client screen
        for (const robot of game.robots) {
            if (!robot.alive || robot.slot === netState.mySlot) continue;
            if (robot.netTargetX !== undefined && robot.netTargetY !== undefined) {
                let targetX = robot.netTargetX;
                let targetY = robot.netTargetY;

                const timeSincePacket = performance.now() - (robot.netLastPacketTime || 0);
                if (timeSincePacket < 110 && robot.netMoving && robot.netDir) {
                    const dirVec = {
                        up: { dx: 0, dy: -1 },
                        down: { dx: 0, dy: 1 },
                        left: { dx: -1, dy: 0 },
                        right: { dx: 1, dy: 0 }
                    }[robot.netDir] || { dx: 0, dy: 0 };

                    const moveSpeed = robot.netSpeed || robot.speed || 3.75;
                    const leadDist = Math.min(0.30, moveSpeed * (timeSincePacket / 1000) * 0.85);
                    const testX = targetX + dirVec.dx * leadDist;
                    const testY = targetY + dirVec.dy * leadDist;
                    const leadC = Math.floor(testX);
                    const leadR = Math.floor(testY);

                    if (leadC >= 0 && leadC < game.cols && leadR >= 0 && leadR < game.rows) {
                        const leadTile = game.grid[leadR][leadC];
                        if (!isSolidTile(leadTile) && leadTile !== TILE_LAVA && leadTile !== TILE_CRUSHER) {
                            const bombOnLead = game.bombs.some(b => b.c === leadC && b.r === leadR && !(b.passSlots && b.passSlots.has(robot.slot)));
                            if (!bombOnLead) {
                                targetX = testX;
                                targetY = testY;
                            }
                        }
                    }
                }

                const alpha = 1 - Math.exp(-22 * dt);
                robot.x += (targetX - robot.x) * alpha;
                robot.y += (targetY - robot.y) * alpha;

                if (robot.netDir) robot.dir = robot.netDir;
                robot.moving = !!robot.netMoving || (Math.hypot(targetX - robot.x, targetY - robot.y) > 0.02);
                if (robot.moving) {
                    robot.walkAnim += (robot.netSpeed || robot.speed) * dt * 5.2;
                }
            }
        }

        // Update local optimistic bombs timer on client for smooth animation and detonation
        for (let i = game.bombs.length - 1; i >= 0; i--) {
            const b = game.bombs[i];
            if (b.optimistic && Number.isFinite(b.timer)) {
                b.timer -= dt;
                if (b.timer <= 0) detonateBomb(b);
            }
        }
        updateProjectiles(dt);

        game.prevKeys = { ...game.keys };
        return;
    }

    // Check for disconnected online guests (>12s with no heartbeat)
    if (game.mode === 'online' && netState.isHost) {
        const now = Date.now();
        for (const robot of game.robots) {
            if (!robot.alive || robot.controlType !== 'online_remote') continue;
            const rInp = netState.remoteInputs[robot.slot];
            const lastRecv = (rInp && rInp.receivedAt >= (robot._roundStartTime || 0)) ? rInp.receivedAt : (robot._roundStartTime || now);
            if (now - lastRecv > 12000) {
                eliminateRemoteDisconnected(robot, 'LEFT MATCH');
                if (netState.roomCode) {
                    removePlayerSlot(robot.slot);
                }
            }
        }
    }

    // Authoritative Simulation (Local Mode or Online Host)
    updateSuddenDeath(dt);

    for (const robot of game.robots) {
        if (!robot.alive) continue;

        // Update timers at top of loop for all alive robots even if stationary
        updateRobotTimers(robot, dt);

        if (robot.controlType === 'p1' || robot.controlType === 'online_local') {
            moveRobot(robot, inputs.p1x, inputs.p1y, dt);
            if (inputs.p1Swap) swapRobotWeapon(robot);
            if (inputs.p1Det) triggerRobotDetonator(robot);
            if (inputs.p1Action) useEquippedItem(robot, inputs.p1ActionFresh);
        } else if (robot.controlType === 'p2') {
            moveRobot(robot, inputs.p2x, inputs.p2y, dt);
            if (inputs.p2Swap) swapRobotWeapon(robot);
            if (inputs.p2Det) triggerRobotDetonator(robot);
            if (inputs.p2Action) useEquippedItem(robot, inputs.p2ActionFresh);
        } else if (robot.controlType === 'online_remote') {
            const rInp = netState.remoteInputs[robot.slot];
            // Host checks timeout relative to host's OWN receivedAt time (< 3000 ms)
            const isFresh = rInp && (Date.now() - (rInp.receivedAt || 0) < 3000);
            if (isFresh) {
                const seqVal = rInp.seq !== undefined ? rInp.seq : (rInp.ts || 0);
                if (seqVal !== robot._lastRemoteSeq) {
                    robot._lastRemoteSeq = seqVal;
                    robot.netLastPacketTime = performance.now();
                    if (rInp.dir) robot.netDir = rInp.dir;
                    robot.netMoving = !!rInp.moving;
                    robot.netDx = rInp.dx || 0;
                    robot.netDy = rInp.dy || 0;

                    // 1. Position validation: trust client coordinates if within reasonable distance & not solid
                    if (rInp.warpSeq && rInp.warpSeq !== robot._lastRemoteWarpSeq) {
                        robot._lastRemoteWarpSeq = rInp.warpSeq;
                        robot.x = rInp.x;
                        robot.y = rInp.y;
                        robot.netTargetX = rInp.x;
                        robot.netTargetY = rInp.y;
                        if (rInp.dir) robot.dir = rInp.dir;
                        robot.moving = !!rInp.moving;
                        sfx.warp();
                        spawnWarpBurst(robot.x, robot.y, '#00f3ff');
                    } else if (rInp.x !== undefined && rInp.y !== undefined) {
                        const targetC = Math.floor(rInp.x);
                        const targetR = Math.floor(rInp.y);
                        const inBounds = targetC >= 0 && targetC < game.cols && targetR >= 0 && targetR < game.rows;
                        const tile = inBounds ? game.grid[targetR][targetC] : TILE_WALL;
                        const isWalkable = inBounds && !isSolidTile(tile) && tile !== TILE_LAVA && tile !== TILE_CRUSHER;
                        const dist = Math.hypot(rInp.x - robot.x, rInp.y - robot.y);

                        if (isWalkable) {
                            if (dist > 2.5) {
                                // Snap if large jump (round start / sudden desync)
                                robot.x = rInp.x;
                                robot.y = rInp.y;
                                robot.netTargetX = rInp.x;
                                robot.netTargetY = rInp.y;
                            } else {
                                robot.netTargetX = rInp.x;
                                robot.netTargetY = rInp.y;
                            }
                        }
                    }
                }

                // Smooth frame-by-frame interpolation + velocity extrapolation on host (60+ FPS)
                let targetX = robot.netTargetX !== undefined ? robot.netTargetX : robot.x;
                let targetY = robot.netTargetY !== undefined ? robot.netTargetY : robot.y;

                const timeSincePacket = performance.now() - (robot.netLastPacketTime || 0);
                if (timeSincePacket < 120 && robot.netMoving && (robot.netDx || robot.netDy)) {
                    const leadDist = Math.min(0.35, robot.speed * (timeSincePacket / 1000) * 0.85);
                    const testX = targetX + Math.sign(robot.netDx) * leadDist;
                    const testY = targetY + Math.sign(robot.netDy) * leadDist;
                    const leadC = Math.floor(testX);
                    const leadR = Math.floor(testY);
                    if (leadC >= 0 && leadC < game.cols && leadR >= 0 && leadR < game.rows) {
                        const leadTile = game.grid[leadR][leadC];
                        if (!isSolidTile(leadTile) && leadTile !== TILE_LAVA && leadTile !== TILE_CRUSHER) {
                            const bombOnLead = game.bombs.some(b => b.c === leadC && b.r === leadR && !(b.passSlots && b.passSlots.has(robot.slot)));
                            if (!bombOnLead) {
                                targetX = testX;
                                targetY = testY;
                            }
                        }
                    }
                }

                const lerpFactor = 1 - Math.exp(-22 * dt);
                robot.x += (targetX - robot.x) * lerpFactor;
                robot.y += (targetY - robot.y) * lerpFactor;

                if (robot.netDir) robot.dir = robot.netDir;
                robot.moving = !!robot.netMoving || (Math.hypot(targetX - robot.x, targetY - robot.y) > 0.02);
                if (robot.moving) {
                    robot.walkAnim += robot.speed * dt * 5.2;
                }

                // 2. Action processing by unique actionId
                if (rInp.actionId && rInp.actionId !== robot._lastRemoteActionId) {
                    robot._lastRemoteActionId = rInp.actionId;
                    if (rInp.actionType === 'swap') {
                        swapRobotWeapon(robot);
                    } else if (rInp.actionType === 'detonate') {
                        triggerRobotDetonator(robot);
                    } else if (rInp.actionType === 'SNIPER') {
                        if (rInp.actionDir) robot.dir = rInp.actionDir;
                        fireSniper(robot);
                    } else if (rInp.actionType === 'KNIFE') {
                        if (rInp.actionDir) robot.dir = rInp.actionDir;
                        slashKnife(robot);
                    } else if (rInp.actionType === 'DETONATOR') {
                        placeDetonatorBomb(robot, rInp.actionC, rInp.actionR);
                    } else if (rInp.actionType === 'bomb' || rInp.bomb) {
                        placeBomb(robot, rInp.actionC, rInp.actionR);
                    }
                } else {
                    // Fallback for actions sent without actionId
                    const seqVal = rInp.seq !== undefined ? rInp.seq : (rInp.ts || 0);
                    if (rInp.swap && seqVal !== robot._lastRemoteSwapSeq) {
                        robot._lastRemoteSwapSeq = seqVal;
                        swapRobotWeapon(robot);
                    }
                    if (rInp.detonate && seqVal !== robot._lastRemoteDetSeq) {
                        robot._lastRemoteDetSeq = seqVal;
                        triggerRobotDetonator(robot);
                    }
                    if (rInp.bomb) {
                        const isFresh = !!rInp.actionFresh && seqVal !== robot._lastRemoteActSeq;
                        if (isFresh) {
                            robot._lastRemoteActSeq = seqVal;
                            useEquippedItem(robot, true);
                        }
                    }
                }
            } else {
                robot.moving = false;
            }
        } else if (robot.controlType === 'ai') {
            updateSmartAiBot(robot, dt);
        }

        // Check tile interactions (powerup pickup & warp pads) for ALL alive robots (Local & Online)
        const tileInteracted = checkRobotTileInteractions(robot, false);
        if (tileInteracted && game.mode === 'online' && netState.isHost) {
            pushHostGameStateNow();
        }
    }

    // Update Sniper Projectiles & Knife Slashes
    updateProjectiles(dt);

    // Update Bombs (Remote Detonator bombs have timer = Infinity unless chain-blasted!)
    for (let i = game.bombs.length - 1; i >= 0; i--) {
        const b = game.bombs[i];
        if (Number.isFinite(b.timer)) {
            b.timer -= dt;
            if (b.timer <= 0) detonateBomb(b);
        }
    }

    // Update Explosions & Damage Detection
    for (let i = game.explosions.length - 1; i >= 0; i--) {
        const exp = game.explosions[i];
        exp.timer -= dt;

        for (const robot of game.robots) {
            if (!robot.alive || robot.invulnTimer > 0) continue;
            const rc = Math.floor(robot.x);
            const rr = Math.floor(robot.y);
            if (rc === exp.c && rr === exp.r) {
                eliminateOrShieldHitRobot(robot, null, 'ELIMINATED!', '#ff2e54');
            }
        }

        if (exp.timer <= 0) game.explosions.splice(i, 1);
    }

    for (const p of game.powerups) p.bobTimer += dt * 4.5;

    // Check Round End
    if (!game.roundOver) {
        const aliveRobots = game.robots.filter(r => r.alive);
        if ((aliveRobots.length <= 1 && game.explosions.length === 0) || (game.suddenDeathActive && game.roundTimer <= 0)) {
            handleRoundComplete(aliveRobots.length === 1 ? aliveRobots[0] : null);
        }
    }

    // Push authoritative state from Host to RTDB every 35-40 ms (~25-28 ticks/sec)
    if (game.mode === 'online' && netState.isHost && isFirebaseReady() && getCurrentUser() && netState.roomCode) {
        const now = performance.now();
        if (now - netState.lastStatePushTime >= 35) {
            pushHostGameStateNow();
        }
    }

    game.prevKeys = { ...game.keys };
}

export function handleRoundComplete(winnerRobot) {
    game.roundOver = true;
    const overlay = document.getElementById('arenaOverlay');
    const badge = document.getElementById('overlayBadge');
    const title = document.getElementById('overlayTitle');
    const sub = document.getElementById('overlaySubtitle');
    const btnNext = document.getElementById('btnNextRound');
    const btnRematch = document.getElementById('btnPlayAgain');

    if (winnerRobot) {
        winnerRobot.wins++;
        winnerRobot.score += 300;
        sfx.victory();
        updateGameHud();

        if (winnerRobot.wins >= game.winsNeeded) {
            game.matchOver = true;
            badge.textContent = '🏆 CHAMPION CROWNED';
            title.textContent = `${winnerRobot.name} WINS MATCH!`;
            title.style.color = winnerRobot.color;
            sub.textContent = `Conquered the arena with ${winnerRobot.wins} victories and ${winnerRobot.score} pts!`;
            btnNext.classList.add('hidden');
            btnRematch.classList.remove('hidden');
        } else {
            badge.textContent = `ROUND ${game.roundNumber} COMPLETE`;
            title.textContent = `${winnerRobot.name} WINS ROUND!`;
            title.style.color = winnerRobot.color;
            sub.textContent = `First to ${game.winsNeeded} wins takes the cyber trophy.`;
            btnNext.classList.remove('hidden');
            btnRematch.classList.add('hidden');
        }
    } else {
        badge.textContent = `ROUND ${game.roundNumber} DRAW`;
        title.textContent = 'DOUBLE ELIMINATION!';
        title.style.color = '#38bdf8';
        sub.textContent = 'No robot survived the arena shockwave.';
        btnNext.classList.remove('hidden');
        btnRematch.classList.add('hidden');
    }

    if (game.mode === 'online' && !netState.isHost) {
        btnNext.classList.add('hidden');
        btnRematch.classList.add('hidden');
    }

    overlay.classList.remove('hidden');

    if (game.mode === 'online' && netState.isHost && !game.matchOver) {
        game.roundEndTimer = setTimeout(() => advanceToNextRound(), 3500);
    }
}

export function advanceToNextRound() {
    if (game.matchOver) return;
    game.roundNumber++;
    const configs = game.robots.map(r => ({
        slot: r.slot, uid: r.uid, name: r.name,
        controlType: r.controlType, aiDifficulty: r.aiDifficulty,
        wins: r.wins, score: r.score
    }));
    const seed = Date.now();
    netState.lastProcessedRoundSeed = seed;
    setupRound(configs, seed);
}

export function rematchCurrentSetup() {
    game.roundNumber = 1;
    game.matchOver = false;
    const configs = game.robots.map(r => ({
        slot: r.slot, uid: r.uid, name: r.name,
        controlType: r.controlType, aiDifficulty: r.aiDifficulty,
        wins: 0, score: 0
    }));
    const seed = Date.now();
    netState.lastProcessedRoundSeed = seed;
    setupRound(configs, seed);
}

