// =========================================================================
// CONFIGURATION & CONSTANTS
// =========================================================================

export const DEFAULT_COLS = 15;
export const DEFAULT_ROWS = 13;
export const MAX_BOMBS = 4; // Strict maximum regular bomb capacity limit
export const MAX_DETONATOR_BOMBS = 2; // Strict limit for Remote Detonator Bombs
export const ROUND_DURATION_STANDARD = 60;  // 60s standard map round before Sudden Death
export const SUDDEN_DEATH_STANDARD = 60;    // 60s Sudden Death closes the entire standard map
export const ROUND_DURATION_BIG = 75;      // 75s big map round before Sudden Death
export const SUDDEN_DEATH_BIG = 75;        // 75s Sudden Death closes the entire big map

export const TILE_EMPTY = 0;
export const TILE_WALL = 1;
export const TILE_CRATE = 2;
export const TILE_LAVA = 3;
export const TILE_CRUSHER = 4;
export const TILE_RARE_CRATE = 5; // Shining Sudden-Death Rare Vault Block

export const ROBOT_PROFILES = [
    {
        id: 0, name: 'CRIMSON-01', shortName: 'RED',
        color: '#ff2e54', midColor: '#e11d48', darkColor: '#881337', visorColor: '#38bdf8',
        glow: 'rgba(255, 46, 84, 0.55)'
    },
    {
        id: 1, name: 'COBALT-02', shortName: 'BLUE',
        color: '#0ea5e9', midColor: '#0284c7', darkColor: '#0c4a6e', visorColor: '#67e8f9',
        glow: 'rgba(14, 165, 233, 0.55)'
    },
    {
        id: 2, name: 'VIPER-03', shortName: 'GREEN',
        color: '#10b981', midColor: '#059669', darkColor: '#064e3b', visorColor: '#bef264',
        glow: 'rgba(16, 185, 129, 0.55)'
    },
    {
        id: 3, name: 'SOLAR-04', shortName: 'GOLD',
        color: '#f59e0b', midColor: '#d97706', darkColor: '#78350f', visorColor: '#fef08a',
        glow: 'rgba(245, 158, 11, 0.55)'
    }
];

export function getRobotSpawn(slotIndex, cols, rows) {
    if (slotIndex === 0) return { c: 1, r: 1 };
    if (slotIndex === 1) return { c: cols - 2, r: rows - 2 };
    if (slotIndex === 2) return { c: cols - 2, r: 1 };
    return { c: 1, r: rows - 2 };
}

export const CARDINAL_DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

export const POWERUP_TYPES = {
    BOMB: { id: 'BOMB', label: '+1 BOMB', color: '#3b82f6', icon: '💣', isRare: false },
    FIRE: { id: 'FIRE', label: '+1 FLAME', color: '#f97316', icon: '🔥', isRare: false },
    SPEED: { id: 'SPEED', label: 'TURBO!', color: '#10b981', icon: '⚡', isRare: false },
    SHIELD: { id: 'SHIELD', label: 'SHIELD!', color: '#06b6d4', icon: '🛡️', isRare: false },
    VIRUS: { id: 'VIRUS', label: 'GLITCH!', color: '#a855f7', icon: '☠️', isRare: false },
    SNIPER: { id: 'SNIPER', label: 'SNIPER (3)', color: '#38bdf8', icon: '🎯', isRare: true },
    KNIFE: { id: 'KNIFE', label: 'PLASMA KNIFE', color: '#fb7185', icon: '🔪', isRare: true },
    DETONATOR: { id: 'DETONATOR', label: 'DETONATOR C4', color: '#e879f9', icon: '🧨', isRare: true }
};

export const RARE_DROP_POOL = ['SNIPER', 'KNIFE', 'DETONATOR'];

// 8 Distinct Playable Maps: 5 Standard (15x13) + 3 Big Arenas (19x15)
export const MAP_DEFINITIONS = {
    foundry: {
        id: 'foundry',
        name: 'Cyber Foundry',
        tag: 'CLASSIC',
        cols: 15, rows: 13, isBig: false,
        desc: 'Symmetrical steel grid, amber hazard stripes & glowing magma floor vents.',
        palette: {
            floorA: '#18202f', floorB: '#1e283b', floorAccent: '#f59e0b',
            wallTop: '#475569', wallFace: '#1e293b', wallHighlight: '#64748b', wallGlow: '#f59e0b',
            crateTop: '#b45309', crateFace: '#78350f', crateBorder: '#fbbf24'
        }
    },
    circuit: {
        id: 'circuit',
        name: 'Neon Circuit',
        tag: 'FAST LANES',
        cols: 15, rows: 13, isBig: false,
        desc: 'Electric cyan circuit traces, fewer pillars & wide high-speed brawl corridors.',
        palette: {
            floorA: '#0b1026', floorB: '#101836', floorAccent: '#00f3ff',
            wallTop: '#312e81', wallFace: '#1e1b4b', wallHighlight: '#4f46e5', wallGlow: '#00f3ff',
            crateTop: '#0e7490', crateFace: '#164e63', crateBorder: '#22d3ee'
        }
    },
    cryo: {
        id: 'cryo',
        name: 'Cryo Core',
        tag: 'OPEN CENTER',
        cols: 15, rows: 13, isBig: false,
        desc: 'Icy crystalline lab with glossy frost floor, 4 bunkers & an open central reactor.',
        palette: {
            floorA: '#0f2236', floorB: '#152d47', floorAccent: '#7dd3fc',
            wallTop: '#38bdf8', wallFace: '#0369a1', wallHighlight: '#bae6fd', wallGlow: '#e0f2fe',
            crateTop: '#1d4ed8', crateFace: '#1e3a8a', crateBorder: '#93c5fd'
        }
    },
    lava: {
        id: 'lava',
        name: 'Lava Reactor',
        tag: 'LAVA BRIDGES',
        cols: 15, rows: 13, isBig: false,
        desc: 'Obsidian fortress with animated lava trenches, narrow stone bridges & embers.',
        palette: {
            floorA: '#1c1917', floorB: '#26211e', floorAccent: '#fb923c',
            wallTop: '#44403c', wallFace: '#1c1917', wallHighlight: '#78716c', wallGlow: '#f97316',
            crateTop: '#9a3412', crateFace: '#431407', crateBorder: '#fb923c'
        }
    },
    vault: {
        id: 'vault',
        name: 'Mecha Vault',
        tag: 'WARP PADS',
        cols: 15, rows: 13, isBig: false,
        desc: 'Emerald & gold labyrinth featuring 2 linked glowing Warp Pads for instant teleports.',
        palette: {
            floorA: '#0c1f1c', floorB: '#112b26', floorAccent: '#fbbf24',
            wallTop: '#065f46', wallFace: '#022c22', wallHighlight: '#10b981', wallGlow: '#fbbf24',
            crateTop: '#92400e', crateFace: '#451a03', crateBorder: '#fcd34d'
        }
    },
    // 3 BIGGER MAPS (19x15) — 2 Rare Drops in Sudden Death!
    orbital: {
        id: 'orbital',
        name: 'Orbital Citadel',
        tag: 'BIG 19×15',
        cols: 19, rows: 15, isBig: true,
        desc: 'Massive deep-space deck with twin warp gates, sniper corridors & 2 Sudden Death Rare Drops!',
        palette: {
            floorA: '#120d26', floorB: '#1a1338', floorAccent: '#a855f7',
            wallTop: '#5b21b6', wallFace: '#2e1065', wallHighlight: '#8b5cf6', wallGlow: '#38bdf8',
            crateTop: '#be185d', crateFace: '#500724', crateBorder: '#f472b6'
        }
    },
    bio: {
        id: 'bio',
        name: 'Bio-Hazard Hive',
        tag: 'BIG 19×15',
        cols: 19, rows: 15, isBig: true,
        desc: 'Sprawling toxic research lab with acid sludge trenches, catwalks & 2 Sudden Death Rare Drops!',
        palette: {
            floorA: '#0e1b14', floorB: '#14261c', floorAccent: '#84cc16',
            wallTop: '#365314', wallFace: '#1a2e05', wallHighlight: '#65a30d', wallGlow: '#bef264',
            crateTop: '#4d7c0f', crateFace: '#1f3307', crateBorder: '#a3e635'
        }
    },
    solar: {
        id: 'solar',
        name: 'Solar Sanctum',
        tag: 'BIG 19×15',
        cols: 19, rows: 15, isBig: true,
        desc: 'Grand cyber-desert temple with golden pyramid chambers, warp obelisks & 2 Rare Drops!',
        palette: {
            floorA: '#241a10', floorB: '#2e2214', floorAccent: '#facc15',
            wallTop: '#b45309', wallFace: '#451a03', wallHighlight: '#f59e0b', wallGlow: '#fef08a',
            crateTop: '#c2410c', crateFace: '#7c2d12', crateBorder: '#fdba74'
        }
    }
};

export const MAP_IDS = ['foundry', 'circuit', 'cryo', 'lava', 'vault', 'orbital', 'bio', 'solar'];

// Seeded PRNG for deterministic map layouts
export function createSeededRand(seed) {
    let s = (seed || Date.now()) % 2147483647;
    if (s <= 0) s += 2147483646;
    return () => {
        s = (s * 16807) % 2147483647;
        return (s - 1) / 2147483646;
    };
}

export function pickActiveMapId(choice, seed) {
    if (choice === 'random') {
        const rand = createSeededRand(seed);
        return MAP_IDS[Math.floor(rand() * MAP_IDS.length)];
    }
    return MAP_DEFINITIONS[choice] ? choice : 'foundry';
}

// Generates grid + warpPads + dimensions for any of the 8 distinct maps
export function generateMapLayout(mapId, seed = Date.now()) {
    const actualId = MAP_DEFINITIONS[mapId] ? mapId : 'foundry';
    const def = MAP_DEFINITIONS[actualId];
    const cols = def.cols;
    const rows = def.rows;
    const rand = createSeededRand(seed);
    const grid = Array.from({ length: rows }, () => Array(cols).fill(TILE_EMPTY));
    const warpPads = [];

    // Safe spawn zones around all 4 corners (L-shaped clear zones so no robot is trapped)
    const safeTiles = new Set();
    for (let slot = 0; slot < 4; slot++) {
        const { c, r } = getRobotSpawn(slot, cols, rows);
        const dc = c === 1 ? 1 : -1;
        const dr = r === 1 ? 1 : -1;
        safeTiles.add(`${c},${r}`);
        safeTiles.add(`${c + dc},${r}`);
        safeTiles.add(`${c},${r + dr}`);
        safeTiles.add(`${c + dc * 2},${r}`);
        safeTiles.add(`${c},${r + dr * 2}`);
    }

    // Outer border walls
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
                grid[r][c] = TILE_WALL;
            }
        }
    }

    if (actualId === 'foundry') {
        // Classic symmetrical grid
        for (let r = 1; r < rows - 1; r++) {
            for (let c = 1; c < cols - 1; c++) {
                if (r % 2 === 0 && c % 2 === 0) {
                    grid[r][c] = TILE_WALL;
                } else if (!safeTiles.has(`${c},${r}`) && rand() < 0.70) {
                    grid[r][c] = TILE_CRATE;
                }
            }
        }
    } else if (actualId === 'circuit') {
        // Wider tactical lanes, fewer spaced pillars, fast brawl center
        for (let r = 1; r < rows - 1; r++) {
            for (let c = 1; c < cols - 1; c++) {
                const isPillar = (r === 2 || r === 5 || r === 7 || r === 10) && (c === 3 || c === 6 || c === 8 || c === 11);
                if (isPillar) {
                    grid[r][c] = TILE_WALL;
                } else if (!safeTiles.has(`${c},${r}`)) {
                    const inCenterCross = (c === 7 || r === 6);
                    if (rand() < (inCenterCross ? 0.35 : 0.62)) {
                        grid[r][c] = TILE_CRATE;
                    }
                }
            }
        }
    } else if (actualId === 'cryo') {
        // Open central reactor arena surrounded by 4 bunker quadrants
        for (let r = 1; r < rows - 1; r++) {
            for (let c = 1; c < cols - 1; c++) {
                const inCenter = (c >= 5 && c <= 9 && r >= 4 && r <= 8);
                const isCoreCrystal = (r === 4 || r === 8) && (c === 5 || c === 9);
                const isQuadrantWall = !inCenter && (r % 2 === 0 && c % 2 === 0);
                if (isCoreCrystal || isQuadrantWall) {
                    grid[r][c] = TILE_WALL;
                } else if (!safeTiles.has(`${c},${r}`)) {
                    if (inCenter) {
                        if ((c === 7 && (r === 5 || r === 7)) || (r === 6 && (c === 6 || c === 8))) {
                            grid[r][c] = TILE_CRATE;
                        }
                    } else if (rand() < 0.72) {
                        grid[r][c] = TILE_CRATE;
                    }
                }
            }
        }
    } else if (actualId === 'lava') {
        // Obsidian fortress with animated lava trenches and narrow tactical stone bridges
        const lavaCoords = [
            [4, 3], [4, 4], [4, 5], [4, 7], [4, 8], [4, 9],
            [10, 3], [10, 4], [10, 5], [10, 7], [10, 8], [10, 9],
            [5, 3], [6, 3], [8, 3], [9, 3],
            [5, 9], [6, 9], [8, 9], [9, 9]
        ];
        const lavaSet = new Set(lavaCoords.map(([c, r]) => `${c},${r}`));

        for (let r = 1; r < rows - 1; r++) {
            for (let c = 1; c < cols - 1; c++) {
                if (lavaSet.has(`${c},${r}`)) {
                    grid[r][c] = TILE_LAVA;
                } else if (
                    (r % 2 === 0 && c % 2 === 0) &&
                    c !== 4 && c !== 10 && !(c === 7 && (r === 4 || r === 8))
                ) {
                    grid[r][c] = TILE_WALL;
                } else if (!safeTiles.has(`${c},${r}`)) {
                    const isBridge = (c === 4 || c === 10) && (r === 2 || r === 6 || r === 10) || (c === 7 && (r === 3 || r === 9));
                    if (rand() < (isBridge ? 0.25 : 0.66)) {
                        grid[r][c] = TILE_CRATE;
                    }
                }
            }
        }
    } else if (actualId === 'vault') {
        // Asymmetric emerald & gold cover labyrinth + 2 linked glowing Warp Pads
        warpPads.push(
            { id: 0, c: 3, r: 6, targetId: 1, color: '#00f3ff' },
            { id: 1, c: 11, r: 6, targetId: 0, color: '#fbbf24' }
        );
        const warpProtected = new Set([
            '3,6', '2,6', '4,6', '3,5', '3,7',
            '11,6', '10,6', '12,6', '11,5', '11,7'
        ]);
        const wallBlocks = [
            [3, 2], [4, 2], [10, 2], [11, 2],
            [3, 10], [4, 10], [10, 10], [11, 10],
            [6, 4], [8, 4], [6, 8], [8, 8],
            [7, 6], [2, 4], [12, 8], [12, 4], [2, 8],
            [5, 6], [9, 6]
        ];
        const wallSet = new Set(wallBlocks.map(([c, r]) => `${c},${r}`));

        for (let r = 1; r < rows - 1; r++) {
            for (let c = 1; c < cols - 1; c++) {
                if (wallSet.has(`${c},${r}`)) {
                    grid[r][c] = TILE_WALL;
                } else if (!safeTiles.has(`${c},${r}`) && !warpProtected.has(`${c},${r}`)) {
                    if (rand() < 0.68) {
                        grid[r][c] = TILE_CRATE;
                    }
                }
            }
        }
    } else if (actualId === 'orbital') {
        // BIG MAP 1 (19x15): Deep-space station with central docking plaza, long sniper lanes & 4-way dual warp gates
        warpPads.push(
            { id: 0, c: 3, r: 7, targetId: 1, color: '#38bdf8' },
            { id: 1, c: 15, r: 7, targetId: 0, color: '#f472b6' }
        );
        const protectedSet = new Set([
            '3,7', '2,7', '4,7', '3,6', '3,8',
            '15,7', '14,7', '16,7', '15,6', '15,8'
        ]);

        for (let r = 1; r < rows - 1; r++) {
            for (let c = 1; c < cols - 1; c++) {
                const inDockPlaza = (c >= 7 && c <= 11 && r >= 5 && r <= 9);
                const isHubCorner = (r === 5 || r === 9) && (c === 7 || c === 11);
                const isSymPillar = !inDockPlaza && (r % 2 === 0 && c % 2 === 0) && c !== 9 && r !== 7;

                if (isHubCorner || isSymPillar) {
                    grid[r][c] = TILE_WALL;
                } else if (!safeTiles.has(`${c},${r}`) && !protectedSet.has(`${c},${r}`)) {
                    const isLongLane = (r === 7 || c === 9);
                    if (inDockPlaza) {
                        if ((c === 9 && (r === 6 || r === 8)) || (r === 7 && (c === 8 || c === 10))) {
                            grid[r][c] = TILE_CRATE;
                        }
                    } else if (rand() < (isLongLane ? 0.36 : 0.64)) {
                        grid[r][c] = TILE_CRATE;
                    }
                }
            }
        }
    } else if (actualId === 'bio') {
        // BIG MAP 2 (19x15): Bio-Hazard Hive with glowing toxic acid trenches & catwalk bridges
        const acidCoords = [
            // Left & Right Acid Vats
            [5, 3], [5, 4], [5, 5], [5, 9], [5, 10], [5, 11],
            [13, 3], [13, 4], [13, 5], [13, 9], [13, 10], [13, 11],
            // Upper & Lower Reactor Moats
            [7, 3], [8, 3], [10, 3], [11, 3],
            [7, 11], [8, 11], [10, 11], [11, 11],
            // Center twin acid pits
            [8, 7], [10, 7]
        ];
        const acidSet = new Set(acidCoords.map(([c, r]) => `${c},${r}`));

        for (let r = 1; r < rows - 1; r++) {
            for (let c = 1; c < cols - 1; c++) {
                if (acidSet.has(`${c},${r}`)) {
                    grid[r][c] = TILE_LAVA; // Rendered as bubbling green acid on Bio map!
                } else if (
                    (r % 2 === 0 && c % 2 === 0) &&
                    !(c >= 7 && c <= 11 && r >= 5 && r <= 9 && (c === 9 || r === 7))
                ) {
                    grid[r][c] = TILE_WALL;
                } else if (!safeTiles.has(`${c},${r}`)) {
                    const isCatwalk = (r === 7 || c === 9 || c === 5 || c === 13);
                    if (rand() < (isCatwalk ? 0.35 : 0.65)) {
                        grid[r][c] = TILE_CRATE;
                    }
                }
            }
        }
    } else if (actualId === 'solar') {
        // BIG MAP 3 (19x15): Solar Sanctum temple with stepped sandstone walls & diagonal warp obelisks
        warpPads.push(
            { id: 0, c: 9, r: 2, targetId: 1, color: '#facc15' },
            { id: 1, c: 9, r: 12, targetId: 0, color: '#fb923c' }
        );
        const protectedSet = new Set([
            '9,2', '8,2', '10,2', '9,3', '9,1',
            '9,12', '8,12', '10,12', '9,11', '9,13'
        ]);
        const templeWalls = [
            // Inner pyramid chamber corners (4 wide openings)
            [6, 4], [7, 4], [11, 4], [12, 4],
            [6, 10], [7, 10], [11, 10], [12, 10],
            [6, 5], [12, 5], [6, 9], [12, 9],
            [9, 7], // Central golden sun pillar
            // Outer temple obelisks
            [3, 3], [3, 5], [3, 9], [3, 11],
            [15, 3], [15, 5], [15, 9], [15, 11],
            [4, 7], [14, 7]
        ];
        const wallSet = new Set(templeWalls.map(([c, r]) => `${c},${r}`));

        for (let r = 1; r < rows - 1; r++) {
            for (let c = 1; c < cols - 1; c++) {
                if (wallSet.has(`${c},${r}`)) {
                    grid[r][c] = TILE_WALL;
                } else if (!safeTiles.has(`${c},${r}`) && !protectedSet.has(`${c},${r}`)) {
                    const inInnerSanctum = (c >= 7 && c <= 11 && r >= 5 && r <= 9);
                    if (rand() < (inInnerSanctum ? 0.38 : 0.64)) {
                        grid[r][c] = TILE_CRATE;
                    }
                }
            }
        }
    }

    return { mapId: actualId, cols, rows, isBig: def.isBig, grid, warpPads };
}

// Precompute Sudden Death inward spiral order dynamically for any map size
export function buildSpiralOrder(cols, rows) {
    const list = [];
    let top = 1, bottom = rows - 2, left = 1, right = cols - 2;
    while (top <= bottom && left <= right) {
        for (let c = left; c <= right; c++) list.push({ c, r: top });
        top++;
        for (let r = top; r <= bottom; r++) list.push({ c: right, r });
        right--;
        if (top <= bottom) {
            for (let c = right; c >= left; c--) list.push({ c, r: bottom });
            bottom--;
        }
        if (left <= right) {
            for (let r = bottom; r >= top; r--) list.push({ c: left, r });
            left++;
        }
    }
    // Close the entire interior of the map
    return list;
}

export const FIREBASE_CONFIG = {
    apiKey: "AIzaSyCsd9NFcbjut6RYxulFlP-0Cs14Sg4C_uQ",
    authDomain: "bomber-robot-online.firebaseapp.com",
    databaseURL: "https://bomber-robot-online-default-rtdb.europe-west1.firebasedatabase.app/",
    projectId: "bomber-robot-online",
    storageBucket: "bomber-robot-online.firebasestorage.app",
    messagingSenderId: "624198268651",
    appId: "1:624198268651:web:0ed896c543bf41fd8cf0ae"
};

