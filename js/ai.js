// =========================================================================
// SMART TACTICAL AI ENGINE (Chain-Reaction Danger Map + Escape BFS + Hunt)
// =========================================================================

import { game } from './state.js';
import {
    TILE_WALL,
    TILE_CRATE,
    TILE_CRUSHER,
    TILE_RARE_CRATE,
    MAX_BOMBS,
    MAX_DETONATOR_BOMBS,
    CARDINAL_DIRS
} from './config.js';
import {
    isSolidTile,
    isTileWalkable,
    moveRobot,
    placeBomb,
    placeDetonatorBomb,
    fireSniper,
    slashKnife,
    triggerRobotDetonator
} from './physics.js';

/**
 * Builds a precision 2D Danger Map storing minimum seconds until danger on every tile.
 * Handles: active flames (0s), incoming Sudden Death crushers, all active bombs,
 * an optional simulated extraBomb, AND iterative bomb-to-bomb chain reactions!
 */
export function buildDangerMap(extraBomb = null) {
    const danger = Array.from({ length: game.rows }, () => Array(game.cols).fill(Infinity));

    // 1. Active explosions are lethal RIGHT NOW (0s)
    for (const exp of game.explosions) {
        if (exp.r >= 0 && exp.r < game.rows && exp.c >= 0 && exp.c < game.cols) {
            danger[exp.r][exp.c] = 0;
        }
    }

    // 2. Sudden Death incoming crusher warnings
    for (const cw of game.crusherWarnings) {
        danger[cw.r][cw.c] = Math.min(danger[cw.r][cw.c], Math.max(0, cw.timer));
    }

    // 3. Collect all bombs + optional simulated bomb
    const allBombs = game.bombs.map(b => ({
        c: b.c, r: b.r, radius: b.radius,
        timer: b.isDetonator ? 0.9 : b.timer // Treat armed C4 as imminent danger!
    }));
    if (extraBomb) {
        allBombs.push({ c: extraBomb.c, r: extraBomb.r, radius: extraBomb.radius, timer: extraBomb.timer });
    }

    if (allBombs.length === 0) return danger;

    // Compute blast tiles for each bomb
    const bombRays = allBombs.map(b => {
        const tiles = [{ c: b.c, r: b.r }];
        for (const [dc, dr] of CARDINAL_DIRS) {
            for (let step = 1; step <= b.radius; step++) {
                const tc = b.c + dc * step;
                const tr = b.r + dr * step;
                if (tr < 0 || tr >= game.rows || tc < 0 || tc >= game.cols) break;
                const t = game.grid[tr]?.[tc];
                if (t === TILE_WALL || t === TILE_CRUSHER) break;
                tiles.push({ c: tc, r: tr });
                if (t === TILE_CRATE || t === TILE_RARE_CRATE) break;
            }
        }
        return tiles;
    });

    // 4. Chain-reaction propagation (fixed-point iteration)
    const effTimers = allBombs.map(b => b.timer);
    let changed = true;
    let iter = 0;
    while (changed && iter < 12) {
        changed = false;
        iter++;
        for (let i = 0; i < allBombs.length; i++) {
            // If bomb i is hit by active explosion right now
            if (danger[allBombs[i].r]?.[allBombs[i].c] === 0 && effTimers[i] > 0.04) {
                effTimers[i] = 0.04;
                changed = true;
            }
            for (let j = 0; j < allBombs.length; j++) {
                if (i === j) continue;
                // Does bomb i's blast hit bomb j?
                const hitsJ = bombRays[i].some(pt => pt.c === allBombs[j].c && pt.r === allBombs[j].r);
                if (hitsJ && effTimers[i] + 0.04 < effTimers[j]) {
                    effTimers[j] = effTimers[i] + 0.04;
                    changed = true;
                }
            }
        }
    }

    // 5. Project earliest detonation times onto danger grid
    for (let i = 0; i < allBombs.length; i++) {
        const tVal = effTimers[i];
        for (const pt of bombRays[i]) {
            if (pt.r >= 0 && pt.r < game.rows && pt.c >= 0 && pt.c < game.cols) {
                if (tVal < danger[pt.r][pt.c]) {
                    danger[pt.r][pt.c] = tVal;
                }
            }
        }
    }

    return danger;
}

// Helper: get warp destination if tile is a warp pad and robot can warp
export function getWarpNeighbor(c, r, robot) {
    if (robot.warpCooldown > 0.3 || game.warpPads.length < 2) return null;
    const wp = game.warpPads.find(p => p.c === c && p.r === r);
    if (!wp) return null;
    const target = game.warpPads.find(p => p.id === wp.targetId);
    if (target && !isSolidTile(game.grid[target.r]?.[target.c])) {
        return { c: target.c, r: target.r };
    }
    return null;
}

/**
 * Time-aware BFS to find the fastest completely safe tile (danger === Infinity).
 * Never walks through active flames or tiles about to explode before arrival!
 */
export function findSafeEscapePath(robot, startC, startR, dangerMap, simExtraBomb = null) {
    const effSpeed = robot.speed * (robot.virusEffect === 'slow' ? 0.55 : 1.0);
    const timePerTile = 1 / Math.max(2.0, effSpeed);
    const safetyMargin = 0.28; // Extra reaction cushion

    const queue = [{ c: startC, r: startR, dist: 0, path: [] }];
    const visited = new Set([`${startC},${startR}`]);
    let bestFallback = null;
    let bestFallbackTime = dangerMap[startR]?.[startC] ?? Infinity;

    while (queue.length > 0) {
        const curr = queue.shift();
        const arriveTime = curr.dist * timePerTile;

        // Goal reached: completely safe tile!
        if (dangerMap[curr.r]?.[curr.c] === Infinity) {
            return { safe: true, path: curr.path, arriveTime };
        }

        // Track best fallback tile with longest remaining timer just in case
        if (dangerMap[curr.r]?.[curr.c] > bestFallbackTime && curr.path.length > 0) {
            bestFallbackTime = dangerMap[curr.r][curr.c];
            bestFallback = curr.path;
        }

        // Gather neighbors (4 cardinal + warp pad jump if standing on one)
        const neighbors = [];
        for (const [dc, dr] of CARDINAL_DIRS) {
            neighbors.push({ c: curr.c + dc, r: curr.r + dr });
        }
        const warpDest = getWarpNeighbor(curr.c, curr.r, robot);
        if (warpDest) neighbors.push(warpDest);

        for (const nb of neighbors) {
            const key = `${nb.c},${nb.r}`;
            if (visited.has(key)) continue;

            // Can we walk onto nb?
            if (!isTileWalkable(nb.c, nb.r, robot, simExtraBomb, false)) continue;

            const nextDist = curr.dist + 1;
            const nextArrive = nextDist * timePerTile;
            const tileDanger = dangerMap[nb.r]?.[nb.c] ?? Infinity;

            // MUST NOT walk into active flame or a blast that detonates before/as we arrive
            if (tileDanger <= nextArrive + safetyMargin) continue;

            visited.add(key);
            queue.push({
                c: nb.c,
                r: nb.r,
                dist: nextDist,
                path: [...curr.path, { c: nb.c, r: nb.r }]
            });
        }
    }

    return { safe: false, path: bestFallback || [], arriveTime: Infinity };
}

/**
 * MANDATORY ESCAPE LOOKAHEAD: Simulates planting a bomb at (c, r) and confirms
 * the bot can reach a completely safe tile well before detonation.
 */
export function canSafelyPlantBomb(robot, c, r, isDetonator = false) {
    if (isDetonator) {
        if (robot.activeDetonatorBombs >= MAX_DETONATOR_BOMBS) return false;
    } else {
        const cap = Math.min(MAX_BOMBS, robot.maxBombs);
        if (robot.activeBombs >= cap) return false;
    }
    if (game.bombs.some(b => b.c === c && b.r === r)) return false;

    const simBomb = {
        c, r,
        radius: isDetonator ? Math.max(game.cols, game.rows) : robot.blastRadius,
        timer: 2.35
    };
    const simDanger = buildDangerMap(simBomb);
    const escape = findSafeEscapePath(robot, c, r, simDanger, simBomb);

    // Must find a completely safe tile AND arrive with time to spare!
    return escape.safe && escape.path.length > 0 && escape.arriveTime < 1.85;
}

/**
 * Checks if a robot at (c, r) has clear line-of-sight to an opponent within given range.
 * Returns direction string ('up'|'down'|'left'|'right') if found, else null.
 */
export function getEnemyLineOfSightDir(robot, c, r, maxRange) {
    const enemies = game.robots.filter(o => o !== robot && o.alive);
    const dirDefs = [
        { dc: 1, dr: 0, name: 'right' },
        { dc: -1, dr: 0, name: 'left' },
        { dc: 0, dr: 1, name: 'down' },
        { dc: 0, dr: -1, name: 'up' }
    ];
    for (const e of enemies) {
        const ec = Math.floor(e.x);
        const er = Math.floor(e.y);
        if (ec === c && er === r) return robot.dir;

        for (const { dc, dr, name } of dirDefs) {
            for (let step = 1; step <= maxRange; step++) {
                const tc = c + dc * step;
                const tr = r + dr * step;
                if (tr < 0 || tr >= game.rows || tc < 0 || tc >= game.cols) break;
                const tl = game.grid[tr]?.[tc];
                if (tl === TILE_WALL || tl === TILE_CRUSHER || tl === TILE_CRATE || tl === TILE_RARE_CRATE) break;
                if (tc === ec && tr === er) return name;
            }
        }
    }
    return null;
}

export function enemyInBlastLine(robot, c, r) {
    return !!getEnemyLineOfSightDir(robot, c, r, robot.blastRadius);
}

/**
 * General Safe BFS for Power-Up Farming, Hunting Opponents, & Crate-Breaching.
 * Never walks through danger tiles or Virus skulls!
 */
export function planTacticalObjective(robot, startC, startR, dangerMap) {
    const isHard = robot.aiDifficulty === 'hard';
    const isRuthless = robot.aiDifficulty === 'ruthless';
    const virusSet = new Set(game.powerups.filter(p => p.type === 'VIRUS').map(p => `${p.c},${p.r}`));
    const goodPowerups = game.powerups.filter(p => p.type !== 'VIRUS');
    const enemies = game.robots.filter(o => o !== robot && o.alive);

    // BFS over currently walkable, completely safe tiles
    const queue = [{ c: startC, r: startR, path: [] }];
    const visited = new Set([`${startC},${startR}`]);
    const reachable = [];

    while (queue.length > 0) {
        const curr = queue.shift();
        reachable.push(curr);

        const neighbors = [];
        for (const [dc, dr] of CARDINAL_DIRS) neighbors.push({ c: curr.c + dc, r: curr.r + dr });
        const warpDest = getWarpNeighbor(curr.c, curr.r, robot);
        if (warpDest) neighbors.push(warpDest);

        for (const nb of neighbors) {
            const key = `${nb.c},${nb.r}`;
            if (visited.has(key)) continue;
            if (!isTileWalkable(nb.c, nb.r, robot)) continue;
            if (dangerMap[nb.r]?.[nb.c] < Infinity) continue; // Strictly avoid threatened tiles
            if (virusSet.has(key)) continue; // Actively avoid Virus Glitch pickups!

            visited.add(key);
            queue.push({ c: nb.c, r: nb.r, path: [...curr.path, { c: nb.c, r: nb.r }] });
        }
    }

    // 1. Evaluate Good Power-Ups (Rare Drops have MAXIMUM priority!)
    let bestPowerupNode = null;
    let bestPowerupScore = -Infinity;
    for (const p of goodPowerups) {
        const node = reachable.find(n => n.c === p.c && n.r === p.r);
        if (!node) continue;
        let value = 30;
        if (p.isRare) value = 140;
        else if (p.type === 'BOMB') value = robot.maxBombs < MAX_BOMBS ? 55 : 18;
        else if (p.type === 'FIRE') value = 52;
        else if (p.type === 'SHIELD') value = robot.hasShield ? 10 : 62;
        else if (p.type === 'SPEED') value = 48;

        const weight = (isRuthless ? 1.35 : isHard ? 1.15 : 0.85) * value - node.path.length * 4.5;
        if (weight > bestPowerupScore) {
            bestPowerupScore = weight;
            bestPowerupNode = node;
        }
    }
    if (bestPowerupNode && bestPowerupScore > 12) {
        return { type: 'powerup', path: bestPowerupNode.path };
    }

    // 2. Evaluate Hunting / Trapping Spots near Enemies
    let bestHuntNode = null;
    let bestHuntScore = -Infinity;
    for (const node of reachable) {
        if (node.path.length > 16) continue;
        for (const e of enemies) {
            const distToEnemy = Math.abs(node.c - Math.floor(e.x)) + Math.abs(node.r - Math.floor(e.y));
            if (distToEnemy <= (isRuthless ? 4 : 3)) {
                const hasLOS = enemyInBlastLine(robot, node.c, node.r);
                const score = (hasLOS ? 45 : 22) - distToEnemy * 6 - node.path.length * 3;
                if (score > bestHuntScore) {
                    bestHuntScore = score;
                    bestHuntNode = node;
                }
            }
        }
    }
    if (bestHuntNode && bestHuntScore > 14) {
        return { type: 'hunt', path: bestHuntNode.path };
    }

    // 3. Find Optimal Crate-Breaching Tile (Shining Rare Crates have massive priority!)
    let bestCrateNode = null;
    let bestCrateScore = -Infinity;
    const nearestEnemy = enemies[0] || null;

    for (const node of reachable) {
        let adjCrates = 0;
        let adjRare = 0;
        for (const [dc, dr] of CARDINAL_DIRS) {
            const nc = node.c + dc;
            const nr = node.r + dr;
            if (nr >= 0 && nr < game.rows && nc >= 0 && nc < game.cols) {
                if (game.grid[nr]?.[nc] === TILE_CRATE) adjCrates++;
                else if (game.grid[nr]?.[nc] === TILE_RARE_CRATE) adjRare++;
            }
        }
        if (adjCrates === 0 && adjRare === 0) continue;

        let enemyBias = 0;
        if (nearestEnemy) {
            const d = Math.abs(node.c - nearestEnemy.x) + Math.abs(node.r - nearestEnemy.y);
            enemyBias = Math.max(0, 18 - d * 1.1);
        }
        const score = adjRare * 110 + adjCrates * 14 + enemyBias - node.path.length * 3.5;
        if (score > bestCrateScore) {
            bestCrateScore = score;
            bestCrateNode = node;
        }
    }

    if (bestCrateNode) {
        return { type: 'crate', path: bestCrateNode.path };
    }

    // 4. Fallback: Advance toward center or nearest enemy safely
    if (reachable.length > 1) {
        let bestNode = reachable[1];
        let bestDist = Infinity;
        const targetX = nearestEnemy ? nearestEnemy.x : game.cols / 2;
        const targetY = nearestEnemy ? nearestEnemy.y : game.rows / 2;
        for (const node of reachable) {
            if (node.path.length === 0) continue;
            const d = Math.hypot(node.c + 0.5 - targetX, node.r + 0.5 - targetY);
            if (d < bestDist) {
                bestDist = d;
                bestNode = node;
            }
        }
        return { type: 'roam', path: bestNode.path };
    }

    return { type: 'hold', path: [] };
}

/**
 * Smooth sub-tile center-aligned path follower so bots never snag on corners.
 */
export function followAiPath(robot, path, dt) {
    if (!path || path.length === 0) return;

    const nextTile = path[0];
    const targetX = nextTile.c + 0.5;
    const targetY = nextTile.r + 0.5;
    const curC = Math.floor(robot.x);
    const curR = Math.floor(robot.y);
    const curCenterX = curC + 0.5;
    const curCenterY = curR + 0.5;

    const diffX = targetX - robot.x;
    const diffY = targetY - robot.y;

    if (Math.hypot(diffX, diffY) < 0.14) {
        path.shift();
        return;
    }

    let dx = 0, dy = 0;
    // If moving horizontally to next tile, gently align Y to current tile center first
    if (Math.abs(diffX) > Math.abs(diffY)) {
        dx = Math.sign(diffX);
        if (Math.abs(robot.y - curCenterY) > 0.12 && nextTile.r === curR) {
            dy = Math.sign(curCenterY - robot.y);
        }
    } else {
        dy = Math.sign(diffY);
        if (Math.abs(robot.x - curCenterX) > 0.12 && nextTile.c === curC) {
            dx = Math.sign(curCenterX - robot.x);
        }
    }

    moveRobot(robot, dx, dy, dt);
}

export function updateSmartAiBot(robot, dt) {
    if (!robot.alive) return;

    if (robot.aiBombCooldown > 0) robot.aiBombCooldown -= dt;
    if (robot.aiDecisionTimer > 0) robot.aiDecisionTimer -= dt;

    const c = Math.floor(robot.x);
    const r = Math.floor(robot.y);
    const dangerMap = buildDangerMap();

    // PRIORITY 1: IMMEDIATE SAFE-PATH EVASION (Zero hesitation on danger!)
    const onDanger = dangerMap[r]?.[c] < Infinity;
    if (onDanger) {
        const escape = findSafeEscapePath(robot, c, r, dangerMap);
        if (escape.path.length > 0) {
            robot.aiPath = escape.path;
            robot.aiGoalType = 'evade';
            followAiPath(robot, robot.aiPath, dt);
            return;
        }
    }

    // PRIORITY 1.5: AI RARE WEAPON USAGE (Sniper, Knife, Remote Detonator Trigger!)
    if (robot.rareItem === 'SNIPER' && robot.rareAmmo > 0 && robot.actionCooldown <= 0) {
        const losDir = getEnemyLineOfSightDir(robot, c, r, Math.max(game.cols, game.rows));
        if (losDir) {
            robot.equippedSlot = 'rare';
            robot.dir = losDir;
            fireSniper(robot);
        }
    } else if (robot.rareItem === 'KNIFE' && robot.actionCooldown <= 0) {
        const sameBlockEnemy = game.robots.some(o => o !== robot && o.alive && Math.floor(o.x) === c && Math.floor(o.y) === r);
        if (sameBlockEnemy) {
            robot.equippedSlot = 'rare';
            slashKnife(robot);
        }
    } else if (robot.activeDetonatorBombs > 0 && !onDanger) {
        // Bot is completely safe outside its C4 blast lines -> trigger remotely!
        triggerRobotDetonator(robot);
    }

    // If our existing path leads into newly created danger, abort it immediately!
    if (robot.aiPath.length > 0) {
        const nextStep = robot.aiPath[0];
        if (
            !isTileWalkable(nextStep.c, nextStep.r, robot) ||
            dangerMap[nextStep.r]?.[nextStep.c] < Infinity
        ) {
            robot.aiPath = [];
        }
    }

    const reactionInterval = robot.aiDifficulty === 'ruthless' ? 0.03
        : (robot.aiDifficulty === 'hard' ? 0.11 : 0.25);

    // PRIORITY 2: TACTICAL BOMB PLANTING (ALWAYS gated by Mandatory Escape Lookahead)
    if (robot.aiBombCooldown <= 0 && !onDanger) {
        const enemyHit = enemyInBlastLine(robot, c, r);
        const nearEnemy = game.robots.some(o =>
            o !== robot && o.alive &&
            (Math.abs(Math.floor(o.x) - c) + Math.abs(Math.floor(o.y) - r) <= (robot.aiDifficulty === 'ruthless' ? 3 : 2))
        );
        let adjCrates = 0;
        for (const [dc, dr] of CARDINAL_DIRS) {
            const nc = c + dc, nr = r + dr;
            if (nr >= 0 && nr < game.rows && nc >= 0 && nc < game.cols &&
                (game.grid[nr]?.[nc] === TILE_CRATE || game.grid[nr]?.[nc] === TILE_RARE_CRATE)) {
                adjCrates++;
            }
        }

        const shouldBombEnemy = enemyHit || (robot.aiDifficulty !== 'normal' && nearEnemy);
        const shouldBombCrate = adjCrates > 0 && robot.aiGoalType !== 'powerup';

        if (shouldBombEnemy || shouldBombCrate) {
            const useC4 = (robot.rareItem === 'DETONATOR' && robot.activeDetonatorBombs < MAX_DETONATOR_BOMBS && canSafelyPlantBomb(robot, c, r, true));
            const useReg = !useC4 && canSafelyPlantBomb(robot, c, r, false);
            let planted = false;
            if (useC4) {
                robot.equippedSlot = 'rare';
                planted = placeDetonatorBomb(robot);
            } else if (useReg) {
                robot.equippedSlot = 'bomb';
                planted = placeBomb(robot);
            }
            if (planted) {
                robot.aiBombCooldown = robot.aiDifficulty === 'ruthless' ? 0.35 : (robot.aiDifficulty === 'hard' ? 0.55 : 0.95);
                const postDanger = buildDangerMap();
                const escape = findSafeEscapePath(robot, c, r, postDanger);
                robot.aiPath = escape.path;
                robot.aiGoalType = 'evade';
                followAiPath(robot, robot.aiPath, dt);
                return;
            }
        }
    }

    // PRIORITY 3: RE-PLAN HUNTING / POWER-UP FARMING / CRATE CLEARING
    if (robot.aiDecisionTimer <= 0 || robot.aiPath.length === 0) {
        robot.aiDecisionTimer = reactionInterval;
        const plan = planTacticalObjective(robot, c, r, dangerMap);
        robot.aiGoalType = plan.type;
        robot.aiPath = plan.path;
    }

    // Execute path movement safely
    if (robot.aiPath.length > 0) {
        followAiPath(robot, robot.aiPath, dt);
    } else {
        // Keep neatly centered on current safe tile
        const cx = c + 0.5, cy = r + 0.5;
        if (Math.hypot(cx - robot.x, cy - robot.y) > 0.08) {
            moveRobot(robot, Math.sign(cx - robot.x), Math.sign(cy - robot.y), dt);
        } else {
            robot.moving = false;
        }
    }
}

