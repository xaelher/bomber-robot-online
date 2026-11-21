// =========================================================================
// HIGH-DPI 3D-EXTRUDED SCI-FI CANVAS RENDERER & MINI-MAP PREVIEWS
// =========================================================================

import { game } from './state.js';
import {
    TILE_WALL,
    TILE_CRATE,
    TILE_LAVA,
    TILE_CRUSHER,
    TILE_RARE_CRATE,
    MAP_DEFINITIONS,
    MAP_IDS,
    POWERUP_TYPES,
    CARDINAL_DIRS,
    generateMapLayout
} from './config.js';

let canvas = null;
let ctx = null;
export let tileSize = 48;
export let canvasDpr = 1;

function ensureCanvas() {
    if (!canvas) {
        canvas = document.getElementById('gameCanvas');
        if (canvas) {
            ctx = canvas.getContext('2d');
        }
    }
}

export function resizeCanvas() {
    ensureCanvas();
    if (!canvas || !ctx) return;

    const maxW = Math.min(window.innerWidth - 20, game.isBig ? 980 : 880);
    const maxH = window.innerHeight - 255;
    const tsW = Math.floor(maxW / game.cols);
    const tsH = Math.floor(maxH / game.rows);
    tileSize = Math.max(18, Math.min(tsW, tsH, 58));

    const logicalW = game.cols * tileSize;
    const logicalH = game.rows * tileSize;
    canvasDpr = Math.min(window.devicePixelRatio || 1, 2.5);

    canvas.width = Math.floor(logicalW * canvasDpr);
    canvas.height = Math.floor(logicalH * canvasDpr);
    canvas.style.width = `${logicalW}px`;
    canvas.style.height = `${logicalH}px`;
}

export function drawMiniMapPreview(canvasEl, mapId) {
    const c2 = canvasEl.getContext('2d');
    const w = canvasEl.width;
    const h = canvasEl.height;
    c2.clearRect(0, 0, w, h);

    if (mapId === 'random') {
        const grad = c2.createLinearGradient(0, 0, w, h);
        grad.addColorStop(0, '#0f172a');
        grad.addColorStop(0.5, '#1e1b4b');
        grad.addColorStop(1, '#064e3b');
        c2.fillStyle = grad;
        c2.fillRect(0, 0, w, h);
        c2.font = 'bold 24px Orbitron, sans-serif';
        c2.fillStyle = '#00f3ff';
        c2.textAlign = 'center';
        c2.textBaseline = 'middle';
        c2.fillText('?', w / 2, h / 2 + 1);
        return;
    }

    const def = MAP_DEFINITIONS[mapId];
    const layout = generateMapLayout(mapId, 133742);
    const { grid, warpPads, cols, rows } = layout;
    const cellW = w / cols;
    const cellH = h / rows;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const t = grid[r][c];
            if (t === TILE_WALL) {
                c2.fillStyle = def.palette.wallTop;
            } else if (t === TILE_CRATE) {
                c2.fillStyle = def.palette.crateTop;
            } else if (t === TILE_LAVA) {
                c2.fillStyle = mapId === 'bio' ? '#84cc16' : '#f97316';
            } else {
                c2.fillStyle = (r + c) % 2 === 0 ? def.palette.floorA : def.palette.floorB;
            }
            c2.fillRect(c * cellW, r * cellH, cellW + 0.5, cellH + 0.5);
        }
    }

    // Draw Warp Pads on preview
    for (const wp of warpPads) {
        c2.fillStyle = wp.color;
        c2.beginPath();
        c2.arc((wp.c + 0.5) * cellW, (wp.r + 0.5) * cellH, cellW * 0.55, 0, Math.PI * 2);
        c2.fill();
    }
}

export function renderMapSelector(containerId, descTextId, selectedId, onSelect, isDisabled = false) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const descEl = document.getElementById(descTextId);
    const choices = [...MAP_IDS, 'random'];

    if (descEl) {
        descEl.textContent = selectedId === 'random'
            ? 'Randomly deploys one of the 8 arenas (5 Classic + 3 Big) every round!'
            : (MAP_DEFINITIONS[selectedId]?.desc || '');
    }

    container.innerHTML = choices.map(id => {
        const isSel = id === selectedId;
        const meta = id === 'random'
            ? { name: 'Random Arena', tag: 'MYSTERY', isBig: false }
            : MAP_DEFINITIONS[id];
        const tagClass = meta.isBig
            ? 'bg-amber-500/90 text-slate-950 border-amber-200'
            : 'bg-slate-950/85 text-cyan-300 border-cyan-500/30';
        return `
            <button type="button" data-map-id="${id}" class="map-card ${isSel ? 'selected' : ''} ${isDisabled ? 'disabled-card' : ''} rounded-xl p-2 text-left flex flex-col gap-1.5">
                <div class="w-full aspect-[15/12] rounded-lg overflow-hidden bg-slate-950 border border-slate-800 relative">
                    <canvas width="132" height="104" class="w-full h-full block mini-map-canvas" data-preview-map="${id}"></canvas>
                    <span class="absolute top-1 right-1 text-[9px] font-arcade font-bold px-1.5 py-0.5 rounded border ${tagClass}">${meta.tag}</span>
                </div>
                <div class="font-arcade text-[11px] font-bold ${isSel ? 'text-cyan-300' : 'text-slate-200'} truncate">${meta.name}</div>
            </button>
        `;
    }).join('');

    container.querySelectorAll('.mini-map-canvas').forEach(cv => {
        drawMiniMapPreview(cv, cv.dataset.previewMap);
    });

    if (!isDisabled) {
        container.querySelectorAll('.map-card').forEach(btn => {
            btn.addEventListener('click', () => {
                onSelect(btn.dataset.mapId);
            });
        });
    }
}

export function spawnExplosionParticles(x, y, color, count = 18) {
    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.6 + Math.random() * 5.2;
        game.particles.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed,
            color: Math.random() < 0.35 ? '#fef08a' : color,
            size: 2.2 + Math.random() * 3.6,
            life: 0.3 + Math.random() * 0.35
        });
    }
}

export function spawnCrateDebris(x, y) {
    const pal = (MAP_DEFINITIONS[game.activeMapId] || MAP_DEFINITIONS.foundry).palette;
    for (let i = 0; i < 8; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 1.8 + Math.random() * 3.8;
        game.debris.push({
            x, y,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 2.2,
            rot: Math.random() * Math.PI,
            vrot: (Math.random() - 0.5) * 14,
            size: 4 + Math.random() * 4.5,
            color: i % 2 === 0 ? pal.crateTop : pal.crateBorder,
            life: 0.45 + Math.random() * 0.25
        });
    }
    spawnExplosionParticles(x, y, pal.crateBorder, 10);
}

export function spawnWarpBurst(x, y, color) {
    for (let i = 0; i < 20; i++) {
        const angle = (i / 20) * Math.PI * 2;
        game.particles.push({
            x, y,
            vx: Math.cos(angle) * 3.8,
            vy: Math.sin(angle) * 3.8,
            color,
            size: 3,
            life: 0.36
        });
    }
}

export function spawnRareCrateSpawnFx(c, r) {
    const x = c + 0.5;
    const y = r + 0.5;
    spawnWarpBurst(x, y, '#facc15');
    spawnExplosionParticles(x, y, '#f472b6', 22);
}

export function addFloatingText(x, y, text, color) {
    game.floatingTexts.push({ x, y, text, color, life: 1.25 });
}

export function renderArena(now) {
    ensureCanvas();
    if (!canvas || !ctx) return;

    const ts = tileSize;
    const tSec = now * 0.001;
    const mapDef = MAP_DEFINITIONS[game.activeMapId] || MAP_DEFINITIONS.foundry;
    const pal = mapDef.palette;

    ctx.setTransform(canvasDpr, 0, 0, canvasDpr, 0, 0);
    ctx.clearRect(0, 0, game.cols * ts, game.rows * ts);

    // Micro Screen-Shake on blasts & crusher impacts
    ctx.save();
    if (game.screenShake > 0.01) {
        const mag = game.screenShake * 11;
        ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    // Pre-blast pulsing danger warning tiles (bombs < 0.82s fuse OR armed Detonator C4 cross preview)
    const dangerWarningSet = new Set();
    const c4PreviewSet = new Set();
    for (const b of game.bombs) {
        const isImminent = Number.isFinite(b.timer) && b.timer < 0.82;
        if (!isImminent && !b.isDetonator) continue;
        const targetSet = b.isDetonator ? c4PreviewSet : dangerWarningSet;
        targetSet.add(`${b.c},${b.r}`);
        for (const [dc, dr] of CARDINAL_DIRS) {
            for (let s = 1; s <= b.radius; s++) {
                const tc = b.c + dc * s, tr = b.r + dr * s;
                if (tr < 0 || tr >= game.rows || tc < 0 || tc >= game.cols) break;
                const tl = game.grid[tr]?.[tc];
                if (tl === TILE_WALL || tl === TILE_CRUSHER) break;
                targetSet.add(`${tc},${tr}`);
                if (tl === TILE_CRATE || tl === TILE_RARE_CRATE) break;
            }
        }
    }

    // 1. FLOOR LAYER + LAVA/ACID TRENCHES + MAP-SPECIFIC SURFACE DETAIL
    for (let r = 0; r < game.rows; r++) {
        for (let c = 0; c < game.cols; c++) {
            const px = c * ts;
            const py = r * ts;
            const tile = game.grid[r]?.[c] ?? 0;

            if (tile === TILE_LAVA) {
                const isBioAcid = game.activeMapId === 'bio';
                const wave = Math.sin(tSec * 3.5 + c * 0.9 + r * 0.7);
                const grad = ctx.createLinearGradient(px, py, px + ts, py + ts);
                if (isBioAcid) {
                    grad.addColorStop(0, '#365314');
                    grad.addColorStop(0.5, wave > 0 ? '#65a30d' : '#4d7c0f');
                    grad.addColorStop(1, '#84cc16');
                } else {
                    grad.addColorStop(0, '#9a3412');
                    grad.addColorStop(0.5, wave > 0 ? '#ea580c' : '#dc2626');
                    grad.addColorStop(1, '#f97316');
                }
                ctx.fillStyle = grad;
                ctx.fillRect(px, py, ts, ts);

                ctx.strokeStyle = isBioAcid
                    ? `rgba(217, 249, 157, ${0.45 + 0.35 * Math.abs(wave)})`
                    : `rgba(254, 240, 138, ${0.45 + 0.35 * Math.abs(wave)})`;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(px + ts * 0.15, py + ts * (0.5 + wave * 0.2));
                ctx.quadraticCurveTo(px + ts * 0.5, py + ts * (0.5 - wave * 0.25), px + ts * 0.85, py + ts * (0.5 + wave * 0.15));
                ctx.stroke();

                ctx.strokeStyle = 'rgba(0,0,0,0.55)';
                ctx.lineWidth = 2.5;
                ctx.strokeRect(px + 1, py + 1, ts - 2, ts - 2);
                continue;
            }

            // Checkerboard metallic floor
            ctx.fillStyle = (r + c) % 2 === 0 ? pal.floorA : pal.floorB;
            ctx.fillRect(px, py, ts, ts);

            ctx.strokeStyle = 'rgba(255,255,255,0.035)';
            ctx.lineWidth = 1;
            ctx.strokeRect(px + 0.5, py + 0.5, ts - 1, ts - 1);

            // Map-Specific Floor Flair
            if ((game.activeMapId === 'circuit' || game.activeMapId === 'orbital') && (r % 2 === 1 || c % 2 === 1)) {
                const accentCol = game.activeMapId === 'orbital' ? '168, 85, 247' : '0, 243, 255';
                ctx.strokeStyle = `rgba(${accentCol}, ${0.07 + 0.04 * Math.sin(tSec * 3 + c + r)})`;
                ctx.lineWidth = 1.4;
                ctx.beginPath();
                ctx.moveTo(px, py + ts * 0.5);
                ctx.lineTo(px + ts, py + ts * 0.5);
                ctx.stroke();
            } else if (game.activeMapId === 'cryo' && (r + c) % 3 === 0) {
                ctx.fillStyle = 'rgba(186, 230, 253, 0.055)';
                ctx.beginPath();
                ctx.moveTo(px + 4, py + ts - 4);
                ctx.lineTo(px + ts - 4, py + 4);
                ctx.lineTo(px + ts - 4, py + 12);
                ctx.lineTo(px + 12, py + ts - 4);
                ctx.fill();
            } else if (game.activeMapId === 'solar' && (r + c) % 4 === 0) {
                ctx.strokeStyle = 'rgba(250, 204, 21, 0.08)';
                ctx.strokeRect(px + 5, py + 5, ts - 10, ts - 10);
            } else if (game.activeMapId === 'foundry' && c === 7 && r === 6) {
                ctx.fillStyle = `rgba(249, 115, 22, ${0.18 + 0.1 * Math.sin(tSec * 4)})`;
                ctx.fillRect(px + 4, py + 4, ts - 8, ts - 8);
            }

            // Armed Detonator C4 faint magenta targeting line
            if (c4PreviewSet.has(`${c},${r}`)) {
                const c4Alpha = 0.11 + 0.07 * Math.sin(tSec * 8);
                ctx.fillStyle = `rgba(232, 121, 249, ${c4Alpha})`;
                ctx.fillRect(px + 1, py + 1, ts - 2, ts - 2);
            }

            // Pre-blast crimson danger warning overlay
            if (dangerWarningSet.has(`${c},${r}`)) {
                const warnAlpha = 0.16 + 0.14 * Math.sin(tSec * 24);
                ctx.fillStyle = `rgba(239, 68, 68, ${warnAlpha})`;
                ctx.fillRect(px + 1, py + 1, ts - 2, ts - 2);
            }
        }
    }

    // 2. FADING FLOOR SCORCH MARKS
    for (const sc of game.scorchMarks) {
        const cx = (sc.c + 0.5) * ts;
        const cy = (sc.r + 0.5) * ts;
        ctx.save();
        ctx.globalAlpha = Math.max(0, sc.alpha * 0.65);
        const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, ts * 0.48);
        grad.addColorStop(0, '#020617');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, ts * 0.48, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // 3. ANIMATED WARP PADS (Mecha Vault, Orbital Citadel, Solar Sanctum)
    for (const wp of game.warpPads) {
        const cx = (wp.c + 0.5) * ts;
        const cy = (wp.r + 0.5) * ts;
        ctx.save();
        ctx.shadowColor = wp.color;
        ctx.shadowBlur = 14;
        ctx.strokeStyle = wp.color;
        ctx.lineWidth = 2.4;
        ctx.beginPath();
        ctx.arc(cx, cy, ts * 0.36, 0, Math.PI * 2);
        ctx.stroke();

        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(cx, cy, ts * 0.24, tSec * 3.2, tSec * 3.2 + Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = wp.color;
        ctx.globalAlpha = 0.22 + 0.14 * Math.sin(tSec * 5);
        ctx.beginPath();
        ctx.arc(cx, cy, ts * 0.32, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // 4. SUDDEN DEATH INCOMING CRUSHER TARGET WARNINGS
    for (const cw of game.crusherWarnings) {
        const px = cw.c * ts;
        const py = cw.r * ts;
        const prog = 1 - Math.max(0, cw.timer / cw.maxTimer);
        ctx.save();
        ctx.fillStyle = `rgba(239, 68, 68, ${0.22 + prog * 0.45})`;
        ctx.fillRect(px + 2, py + 2, ts - 4, ts - 4);
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 2.5;
        ctx.strokeRect(px + 3, py + 3, ts - 6, ts - 6);
        ctx.beginPath();
        ctx.moveTo(px + 6, py + 6);
        ctx.lineTo(px + ts - 6, py + ts - 6);
        ctx.moveTo(px + ts - 6, py + 6);
        ctx.lineTo(px + 6, py + ts - 6);
        ctx.stroke();
        ctx.restore();
    }

    // 5. 3D-EXTRUDED WALLS, CRATES, SHINING RARE VAULT BLOCKS & CRUSHERS
    const faceH = Math.max(5, Math.floor(ts * 0.24));
    for (let r = 0; r < game.rows; r++) {
        for (let c = 0; c < game.cols; c++) {
            const tile = game.grid[r]?.[c];
            if (tile !== TILE_WALL && tile !== TILE_CRATE && tile !== TILE_CRUSHER && tile !== TILE_RARE_CRATE) continue;
            const px = c * ts;
            const py = r * ts;

            // Cast drop shadow onto floor below & right
            ctx.fillStyle = 'rgba(0, 0, 0, 0.38)';
            ctx.fillRect(px + 4, py + 6, ts - 2, ts - 2);

            if (tile === TILE_WALL) {
                ctx.fillStyle = pal.wallFace;
                ctx.beginPath();
                ctx.roundRect(px + 1, py + 2, ts - 2, ts - 2, 5);
                ctx.fill();

                const topGrad = ctx.createLinearGradient(px, py, px, py + ts - faceH);
                topGrad.addColorStop(0, pal.wallHighlight);
                topGrad.addColorStop(1, pal.wallTop);
                ctx.fillStyle = topGrad;
                ctx.beginPath();
                ctx.roundRect(px + 1.5, py + 1, ts - 3, ts - faceH, 5);
                ctx.fill();

                ctx.strokeStyle = 'rgba(255,255,255,0.16)';
                ctx.lineWidth = 1;
                ctx.strokeRect(px + 4, py + 3.5, ts - 8, ts - faceH - 5);

                ctx.fillStyle = pal.wallGlow;
                ctx.globalAlpha = 0.65;
                ctx.beginPath();
                ctx.arc(px + ts * 0.5, py + (ts - faceH) * 0.5 + 1, ts * 0.1, 0, Math.PI * 2);
                ctx.fill();
                ctx.globalAlpha = 1;
            } else if (tile === TILE_CRATE) {
                ctx.fillStyle = pal.crateFace;
                ctx.beginPath();
                ctx.roundRect(px + 2, py + 3, ts - 4, ts - 4, 6);
                ctx.fill();

                ctx.fillStyle = pal.crateTop;
                ctx.beginPath();
                ctx.roundRect(px + 2.5, py + 2, ts - 5, ts - faceH - 1, 5);
                ctx.fill();

                ctx.strokeStyle = pal.crateBorder;
                ctx.lineWidth = 1.6;
                ctx.strokeRect(px + 4.5, py + 4, ts - 9, ts - faceH - 5);

                ctx.beginPath();
                ctx.moveTo(px + 5.5, py + 5);
                ctx.lineTo(px + ts - 5.5, py + ts - faceH - 2);
                ctx.moveTo(px + ts - 5.5, py + 5);
                ctx.lineTo(px + 5.5, py + ts - faceH - 2);
                ctx.stroke();
            } else if (tile === TILE_RARE_CRATE) {
                // SHINING PRISMATIC GOLDEN RARE VAULT BLOCK!
                const shine = 0.5 + 0.5 * Math.sin(tSec * 6.5 + c + r);
                ctx.save();
                ctx.shadowColor = '#facc15';
                ctx.shadowBlur = 14 + shine * 12;

                // Front vertical gold-violet face
                ctx.fillStyle = '#854d0e';
                ctx.beginPath();
                ctx.roundRect(px + 1.5, py + 2.5, ts - 3, ts - 3.5, 6);
                ctx.fill();

                // Shimmering top face gradient
                const rareGrad = ctx.createLinearGradient(px, py, px + ts, py + ts - faceH);
                rareGrad.addColorStop(0, '#fef08a');
                rareGrad.addColorStop(0.45, '#facc15');
                rareGrad.addColorStop(1, '#f472b6');
                ctx.fillStyle = rareGrad;
                ctx.beginPath();
                ctx.roundRect(px + 2, py + 1.5, ts - 4, ts - faceH, 6);
                ctx.fill();

                // White crystal rim
                ctx.strokeStyle = `rgba(255, 255, 255, ${0.65 + shine * 0.35})`;
                ctx.lineWidth = 2;
                ctx.strokeRect(px + 4, py + 3.5, ts - 8, ts - faceH - 4);

                // Rotating star sparkle inside block
                ctx.shadowBlur = 0;
                const scx = px + ts * 0.5;
                const scy = py + (ts - faceH) * 0.5 + 1;
                const starR = ts * (0.20 + shine * 0.06);
                ctx.fillStyle = '#ffffff';
                ctx.beginPath();
                for (let k = 0; k < 8; k++) {
                    const ang = (k * Math.PI) / 4 + tSec * 2.2;
                    const rr = k % 2 === 0 ? starR : starR * 0.42;
                    const sx = scx + Math.cos(ang) * rr;
                    const sy = scy + Math.sin(ang) * rr;
                    if (k === 0) ctx.moveTo(sx, sy);
                    else ctx.lineTo(sx, sy);
                }
                ctx.closePath();
                ctx.fill();
                ctx.restore();
            } else if (tile === TILE_CRUSHER) {
                ctx.fillStyle = '#450a0a';
                ctx.beginPath();
                ctx.roundRect(px + 1, py + 2, ts - 2, ts - 2, 4);
                ctx.fill();

                ctx.fillStyle = '#334155';
                ctx.beginPath();
                ctx.roundRect(px + 1.5, py + 1, ts - 3, ts - faceH, 4);
                ctx.fill();

                ctx.fillStyle = '#ef4444';
                ctx.beginPath();
                ctx.moveTo(px + ts * 0.5, py + 5);
                ctx.lineTo(px + ts - 7, py + (ts - faceH) * 0.5 + 1);
                ctx.lineTo(px + ts * 0.5, py + ts - faceH - 3);
                ctx.lineTo(px + 7, py + (ts - faceH) * 0.5 + 1);
                ctx.closePath();
                ctx.fill();
            }
        }
    }

    // 6. POWER-UPS, VIRUS GLITCH & RARE DROP PICKUPS
    for (const p of game.powerups) {
        const info = POWERUP_TYPES[p.type] || POWERUP_TYPES.BOMB;
        const cx = (p.c + 0.5) * ts;
        const cy = (p.r + 0.5) * ts + Math.sin(p.bobTimer) * (ts * 0.08);
        const radius = ts * (p.isRare ? 0.39 : 0.34);

        ctx.save();
        if (p.isRare) {
            // Rotating golden outer halo for Rare Drops
            ctx.strokeStyle = '#fef08a';
            ctx.lineWidth = 2;
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.arc(cx, cy, radius * 1.24, tSec * 3, tSec * 3 + Math.PI * 2);
            ctx.stroke();
            ctx.setLineDash([]);
        }
        ctx.shadowColor = p.isRare ? '#facc15' : info.color;
        ctx.shadowBlur = p.isRare ? 18 : 14;
        ctx.fillStyle = p.isRare ? '#1e1b4b' : '#090f1d';
        ctx.strokeStyle = p.isRare ? '#facc15' : info.color;
        ctx.lineWidth = p.isRare ? 3 : 2.4;
        ctx.beginPath();
        ctx.arc(cx, cy, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        ctx.shadowBlur = 0;
        ctx.font = `${Math.floor(ts * (p.isRare ? 0.48 : 0.44))}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(info.icon, cx, cy + 1);
        ctx.restore();
    }

    // 7. HIGH-IMPACT PLASMA BOMBS & DISTINCT VIOLET DETONATOR C4 BOMBS
    for (const b of game.bombs) {
        const cx = (b.c + 0.5) * ts;
        const cy = (b.r + 0.5) * ts;

        if (b.isDetonator) {
            // Distinct Neon Purple / Magenta Remote Detonator C4 Bomb!
            const pulse = 1 + Math.sin(tSec * 7.5) * 0.07;
            const rad = ts * 0.36 * pulse;
            ctx.save();
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.beginPath();
            ctx.ellipse(cx, cy + ts * 0.28, rad * 0.95, rad * 0.35, 0, 0, Math.PI * 2);
            ctx.fill();

            const grad = ctx.createRadialGradient(cx - rad * 0.3, cy - rad * 0.3, 2, cx, cy, rad);
            grad.addColorStop(0, '#f0abfc');
            grad.addColorStop(0.45, '#a21caf');
            grad.addColorStop(1, '#3b0764');
            ctx.fillStyle = grad;
            ctx.shadowColor = '#e879f9';
            ctx.shadowBlur = 14;
            ctx.beginPath();
            ctx.arc(cx, cy, rad, 0, Math.PI * 2);
            ctx.fill();

            // Metallic C4 collar + blinking red detonator LED
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#f5d0fe';
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.arc(cx, cy, rad * 0.58, 0, Math.PI * 2);
            ctx.stroke();

            const ledOn = Math.floor(tSec * 7) % 2 === 0;
            ctx.fillStyle = ledOn ? '#ff0055' : '#fef08a';
            ctx.beginPath();
            ctx.arc(cx, cy, rad * 0.24, 0, Math.PI * 2);
            ctx.fill();

            // Remote Antenna Stalk
            ctx.strokeStyle = '#e879f9';
            ctx.lineWidth = 2.4;
            ctx.beginPath();
            ctx.moveTo(cx, cy - rad * 0.8);
            ctx.lineTo(cx, cy - rad * 1.25);
            ctx.stroke();
            ctx.fillStyle = ledOn ? '#ff0055' : '#e879f9';
            ctx.beginPath();
            ctx.arc(cx, cy - rad * 1.28, 3.2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
            continue;
        }

        const urgencyRatio = 1 - Math.max(0, b.timer / b.maxTimer);
        const pulseFreq = 10 + urgencyRatio * 24;
        const pulse = 1 + Math.sin(tSec * pulseFreq) * (0.08 + urgencyRatio * 0.09);
        const rad = ts * 0.35 * pulse;

        ctx.save();
        ctx.fillStyle = 'rgba(0,0,0,0.48)';
        ctx.beginPath();
        ctx.ellipse(cx, cy + ts * 0.28, rad * 0.92, rad * 0.34, 0, 0, Math.PI * 2);
        ctx.fill();

        const grad = ctx.createRadialGradient(cx - rad * 0.32, cy - rad * 0.32, 2, cx, cy, rad);
        grad.addColorStop(0, '#94a3b8');
        grad.addColorStop(0.45, '#1e293b');
        grad.addColorStop(1, '#020617');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, rad, 0, Math.PI * 2);
        ctx.fill();

        const coreColor = b.timer < 0.65 ? (Math.floor(tSec * 20) % 2 === 0 ? '#ff0044' : '#fef08a')
            : (b.timer < 1.3 ? '#f59e0b' : '#00f3ff');
        ctx.shadowColor = coreColor;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = coreColor;
        ctx.lineWidth = 2.6;
        ctx.beginPath();
        ctx.arc(cx, cy, rad * 0.52, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = coreColor;
        ctx.beginPath();
        ctx.arc(cx, cy, rad * 0.2, 0, Math.PI * 2);
        ctx.fill();

        ctx.shadowBlur = 0;
        ctx.strokeStyle = '#cbd5e1';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.moveTo(cx + rad * 0.25, cy - rad * 0.78);
        ctx.quadraticCurveTo(cx + rad * 0.55, cy - rad * 1.1, cx + rad * 0.75, cy - rad * 0.85);
        ctx.stroke();

        ctx.fillStyle = Math.random() < 0.5 ? '#fde047' : '#fb923c';
        ctx.beginPath();
        ctx.arc(cx + rad * 0.75, cy - rad * 0.85, 3 + Math.random() * 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // 8. MULTI-LAYERED PLASMA EXPLOSIONS
    for (const exp of game.explosions) {
        const px = exp.c * ts;
        const py = exp.r * ts;
        const lifeRatio = Math.max(0, exp.timer / exp.maxTimer);
        const scale = 0.65 + Math.sin(lifeRatio * Math.PI) * 0.35;

        ctx.save();
        ctx.globalAlpha = Math.min(1, lifeRatio * 1.6);

        // Outer fiery plasma bloom
        ctx.shadowColor = '#f97316';
        ctx.shadowBlur = 16;
        ctx.fillStyle = '#ea580c';
        const outerPad = ts * (1 - scale) * 0.32;
        ctx.beginPath();
        ctx.roundRect(px + outerPad, py + outerPad, ts - outerPad * 2, ts - outerPad * 2, ts * 0.26);
        ctx.fill();

        // Mid golden-amber plasma
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#fbbf24';
        const midPad = ts * 0.16;
        ctx.beginPath();
        ctx.roundRect(px + midPad, py + midPad, ts - midPad * 2, ts - midPad * 2, ts * 0.2);
        ctx.fill();

        // Hot white core
        ctx.fillStyle = '#ffffff';
        const corePad = ts * 0.3;
        ctx.beginPath();
        ctx.roundRect(px + corePad, py + corePad, ts - corePad * 2, ts - corePad * 2, ts * 0.15);
        ctx.fill();
        ctx.restore();
    }

    // 9. DETAILED ANIMATED ROBOTS (Y-sorted for natural depth overlap)
    const sortedRobots = [...game.robots].sort((a, b) => a.y - b.y);
    for (const robot of sortedRobots) {
        if (!robot.alive) continue;
        drawDetailedRobot(robot, ts, tSec);
    }

    // 9.5 SNIPER LASER PROJECTILES & KNIFE SLASH ARCS
    for (const pr of game.projectiles) {
        const px = pr.x * ts;
        const py = pr.y * ts;
        ctx.save();
        ctx.shadowColor = '#38bdf8';
        ctx.shadowBlur = 14;
        ctx.strokeStyle = '#e0f2fe';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(px - pr.dx * ts * 0.65, py - pr.dy * ts * 0.65);
        ctx.lineTo(px + pr.dx * ts * 0.25, py + pr.dy * ts * 0.25);
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(px, py, 3.8, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    for (const ks of game.knifeSlashes) {
        const ratio = Math.max(0, ks.timer / ks.maxTimer);
        const cx = ks.x * ts;
        const cy = ks.y * ts;
        ctx.save();
        ctx.globalAlpha = ratio;
        ctx.strokeStyle = '#fb7185';
        ctx.shadowColor = '#f43f5e';
        ctx.shadowBlur = 14;
        ctx.lineWidth = 5 * ratio + 1.5;
        ctx.beginPath();
        ctx.arc(cx, cy, ts * 0.52, -Math.PI * 0.75, Math.PI * 0.55);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - ts * 0.35, cy - ts * 0.35);
        ctx.lineTo(cx + ts * 0.35, cy + ts * 0.35);
        ctx.stroke();
        ctx.restore();
    }

    // 10. FLYING CRATE DEBRIS, SPARK PARTICLES & FLOATING COMBAT TEXT
    for (const d of game.debris) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, d.life * 2);
        ctx.translate(d.x * ts, d.y * ts);
        ctx.rotate(d.rot);
        ctx.fillStyle = d.color;
        ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size * 0.75);
        ctx.restore();
    }

    for (const pt of game.particles) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, pt.life * 1.8);
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(pt.x * ts, pt.y * ts, pt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    for (const ft of game.floatingTexts) {
        ctx.save();
        ctx.globalAlpha = Math.min(1, ft.life * 1.2);
        ctx.font = `900 ${Math.max(10, Math.floor(ts * 0.25))}px Orbitron, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fillText(ft.text, ft.x * ts + 1.5, ft.y * ts + 1.5);
        ctx.fillStyle = ft.color;
        ctx.fillText(ft.text, ft.x * ts, ft.y * ts);
        ctx.restore();
    }

    ctx.restore();
}

export function drawDetailedRobot(robot, ts, tSec) {
    ensureCanvas();
    if (!ctx) return;

    let cx = robot.x * ts;
    let cy = robot.y * ts;
    const bob = robot.moving ? Math.abs(Math.sin(robot.walkAnim)) * (ts * 0.08) : Math.sin(tSec * 3.5 + robot.slot) * (ts * 0.02);

    // Virus glitch visual jitter
    if (robot.virusEffect) {
        cx += (Math.random() - 0.5) * 3;
        cy += (Math.random() - 0.5) * 2;
    }

    ctx.save();

    if (robot.invulnTimer > 0 && Math.floor(robot.invulnTimer * 14) % 2 === 0) {
        ctx.globalAlpha = 0.55;
    }

    // Ground Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.48)';
    ctx.beginPath();
    ctx.ellipse(cx, cy + ts * 0.35, ts * 0.34, ts * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();

    // Articulated Robotic Legs / Boots
    const legSwing = robot.moving ? Math.sin(robot.walkAnim) * (ts * 0.09) : 0;
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(cx - ts * 0.25, cy + ts * 0.13 + legSwing, ts * 0.17, ts * 0.21, 4);
    ctx.roundRect(cx + ts * 0.08, cy + ts * 0.13 - legSwing, ts * 0.17, ts * 0.21, 4);
    ctx.fill();
    ctx.stroke();

    // Shoulder Pads
    ctx.fillStyle = robot.darkColor;
    ctx.beginPath();
    ctx.roundRect(cx - ts * 0.34, cy - ts * 0.13 - bob, ts * 0.13, ts * 0.24, 5);
    ctx.roundRect(cx + ts * 0.21, cy - ts * 0.13 - bob, ts * 0.13, ts * 0.24, 5);
    ctx.fill();

    // Armored Torso Chassis with metallic gradient
    const torsoGrad = ctx.createLinearGradient(cx - ts * 0.24, cy - ts * 0.15, cx + ts * 0.24, cy + ts * 0.2);
    torsoGrad.addColorStop(0, robot.color);
    torsoGrad.addColorStop(0.6, robot.midColor);
    torsoGrad.addColorStop(1, robot.darkColor);
    ctx.fillStyle = torsoGrad;
    ctx.beginPath();
    ctx.roundRect(cx - ts * 0.25, cy - ts * 0.14 - bob, ts * 0.50, ts * 0.32, 7);
    ctx.fill();
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 1.6;
    ctx.stroke();

    // Glowing Chest Power Core
    ctx.save();
    ctx.shadowColor = robot.visorColor;
    ctx.shadowBlur = 8;
    ctx.fillStyle = robot.visorColor;
    ctx.beginPath();
    ctx.arc(cx, cy + ts * 0.02 - bob, ts * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // Rounded Armored Helmet Head
    const headGrad = ctx.createLinearGradient(cx, cy - ts * 0.46 - bob, cx, cy - ts * 0.08 - bob);
    headGrad.addColorStop(0, '#ffffff55');
    headGrad.addColorStop(0.25, robot.color);
    headGrad.addColorStop(1, robot.darkColor);
    ctx.fillStyle = robot.color;
    ctx.beginPath();
    ctx.roundRect(cx - ts * 0.28, cy - ts * 0.44 - bob, ts * 0.56, ts * 0.35, 9);
    ctx.fill();
    ctx.fillStyle = headGrad;
    ctx.fill();
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Dark Glass Visor + Directional Glowing Eyes
    ctx.fillStyle = '#060a12';
    ctx.beginPath();
    ctx.roundRect(cx - ts * 0.22, cy - ts * 0.36 - bob, ts * 0.44, ts * 0.18, 5);
    ctx.fill();

    const eyeColor = robot.virusEffect ? '#e879f9' : robot.visorColor;
    const eyeShiftX = robot.dir === 'left' ? -ts * 0.065 : (robot.dir === 'right' ? ts * 0.065 : 0);
    const eyeShiftY = robot.dir === 'up' ? -ts * 0.03 : (robot.dir === 'down' ? ts * 0.02 : 0);

    ctx.save();
    ctx.shadowColor = eyeColor;
    ctx.shadowBlur = 7;
    ctx.fillStyle = eyeColor;
    ctx.beginPath();
    ctx.roundRect(cx - ts * 0.14 + eyeShiftX, cy - ts * 0.30 + eyeShiftY - bob, ts * 0.10, ts * 0.065, 2.5);
    ctx.roundRect(cx + ts * 0.04 + eyeShiftX, cy - ts * 0.30 + eyeShiftY - bob, ts * 0.10, ts * 0.065, 2.5);
    ctx.fill();
    ctx.restore();

    // Antenna Stalk + Pulsing Beacon
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy - ts * 0.44 - bob);
    ctx.lineTo(cx, cy - ts * 0.56 - bob);
    ctx.stroke();

    ctx.fillStyle = robot.color;
    ctx.beginPath();
    ctx.arc(cx, cy - ts * 0.58 - bob, 3.6, 0, Math.PI * 2);
    ctx.fill();

    // Translucent Pulsing Hexagonal Energy Shield Dome
    if (robot.hasShield) {
        const sRad = ts * (0.47 + Math.sin(tSec * 7) * 0.03);
        ctx.save();
        ctx.translate(cx, cy - ts * 0.09);
        ctx.strokeStyle = '#22d3ee';
        ctx.fillStyle = 'rgba(34, 211, 238, 0.14)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
            const ang = (i * Math.PI) / 3 + tSec * 0.8;
            const hx = Math.cos(ang) * sRad;
            const hy = Math.sin(ang) * sRad;
            if (i === 0) ctx.moveTo(hx, hy);
            else ctx.lineTo(hx, hy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    // Virus Glitch Crackling Aura
    if (robot.virusEffect) {
        ctx.strokeStyle = '#d946ef';
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(cx, cy - ts * 0.08, ts * 0.45, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
    }

    // Equipped Rare Weapon Visuals (Sniper Laser Sight / Glowing Knife / C4 Remote Badge)
    if (robot.equippedSlot === 'rare' && robot.rareItem) {
        if (robot.rareItem === 'SNIPER') {
            const dv = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }[robot.dir] || [0, 1];
            // Draw subtle laser aim beam to nearest wall/crate
            let endX = robot.x, endY = robot.y;
            for (let step = 0.4; step < Math.max(game.cols, game.rows); step += 0.25) {
                const tx = robot.x + dv[0] * step;
                const ty = robot.y + dv[1] * step;
                const tc = Math.floor(tx), tr = Math.floor(ty);
                if (tr < 0 || tr >= game.rows || tc < 0 || tc >= game.cols) break;
                const tl = game.grid[tr]?.[tc];
                if (tl === TILE_WALL || tl === TILE_CRUSHER || tl === TILE_CRATE || tl === TILE_RARE_CRATE) break;
                endX = tx; endY = ty;
            }
            ctx.save();
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.55)';
            ctx.setLineDash([5, 5]);
            ctx.lineWidth = 1.6;
            ctx.beginPath();
            ctx.moveTo(cx, cy - ts * 0.06);
            ctx.lineTo(endX * ts, endY * ts);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
        }

        // Floating mini rare weapon icon above robot antenna
        const rareMeta = POWERUP_TYPES[robot.rareItem];
        if (rareMeta) {
            ctx.save();
            ctx.font = `${Math.max(12, Math.floor(ts * 0.34))}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(rareMeta.icon, cx + ts * 0.32, cy - ts * 0.42 - bob);
            ctx.restore();
        }
    }

    ctx.restore();
}

