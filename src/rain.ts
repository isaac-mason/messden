import * as THREE from 'three';

// Rain on the window, simulated: drops land and stay, merge when they touch, and once heavy enough slide down,
// stalling and lurching, wiping a trail through the mist, shedding droplets and swallowing what's in their path.
// Each frame they're stamped into a water map (slope and thickness) and the wiped trails into another, for the glass.
// Positions and sizes are in metres on the glass, y up.

// Drops are drawn about twice life size: real ones vanish at the distance you see a window from.
// The wiped trails are soft anyway: a third the resolution, and a third of their upload.
const MAP = { perMetre: 300, wipedPerMetre: 100 };
const RAIN = {
    // Drops landing per square metre per second, and how big.
    hits: 25,
    size: [0.003, 0.01],
    // Now and then a fat one, heavy enough to run straight away.
    big: { chance: 0.25, size: [0.007, 0.012] },
    // A landing drop flattens out this much wider for a blink before settling.
    splash: { spread: 0.7, seconds: 0.12 },
    satellites: [0, 3],
    satelliteSize: [0.15, 0.35],
    satelliteReach: [1.5, 3.5],
    // A safety net: evaporation is what thins them.
    max: 4500,
    // Radius lost per second, so the smallest go first.
    evaporate: 0.00008,
};
const SLIDE = {
    // Past this radius a drop is heavy enough to go.
    heavy: 0.007,
    // Chance per second a heavy drop sets off, more the heavier.
    start: 1.4,
    gravity: 3.5,
    drag: 2.5,
    // Lurches: how often its grip catches, and how hard.
    stall: 2.5,
    wander: 0.007,
    // Droplets left behind, every so far, at this share of its size.
    trailEvery: 0.021,
    trailSize: [0.2, 0.35],
};
// How fast wiped trails mist over again, per second.
const REFOG = 0.12;

type Drop = {
    x: number;
    y: number;
    r: number;
    vy: number;
    moving: boolean;
    age: number;
    travelled: number;
    wander: number;
    gone: boolean;
};

// Runs every frame over a few thousand drops, so nothing in it allocates once warmed up: drops that go are kept for
// reuse, and the merge grid is a flat linked list per cell in typed arrays, refilled in place.
const spare: Drop[] = [];
const shedding: Drop[] = [];

export type Rain = {
    width: number;
    height: number;
    drops: Drop[];
    water: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; texture: THREE.CanvasTexture };
    wiped: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D; texture: THREE.CanvasTexture };
    sprite: HTMLCanvasElement;
    owed: number;
    // Per cell, the first drop in it (an index into drops, or -1); per drop, the next in the same cell.
    grid: { columns: number; rows: number; first: Int32Array; next: Int32Array };
};

export function initRain(width: number, height: number): Rain {
    const surface = (perMetre: number) => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(width * perMetre);
        canvas.height = Math.round(height * perMetre);
        const context = canvas.getContext('2d') as CanvasRenderingContext2D;
        const texture = new THREE.CanvasTexture(canvas);
        texture.colorSpace = THREE.NoColorSpace;
        return { canvas, context, texture };
    };
    const rain: Rain = {
        width,
        height,
        drops: [],
        water: surface(MAP.perMetre),
        wiped: surface(MAP.wipedPerMetre),
        sprite: dropSprite(64),
        owed: 0,
        grid: {
            columns: Math.ceil(width / CELL) + 1,
            rows: Math.ceil(height / CELL) + 1,
            first: new Int32Array((Math.ceil(width / CELL) + 1) * (Math.ceil(height / CELL) + 1)),
            next: new Int32Array(RAIN.max * 2),
        },
    };
    // Start mid-storm rather than on dry glass.
    for (let i = 0; i < 240; i++) updateRain(rain, 0.05);
    return rain;
}

export function updateRain(rain: Rain, dt: number): void {
    land(rain, dt);
    slide(rain, dt);
    merge(rain);
    // Past the cap, the oldest go.
    for (let i = 0; i < rain.drops.length - RAIN.max; i++) rain.drops[i].gone = true;
    if (rain.drops.length > RAIN.max) compact(rain);
    for (const drop of rain.drops) {
        drop.age += dt;
        if (!drop.moving) drop.r -= RAIN.evaporate * dt;
    }
    draw(rain, dt);
}

function land(rain: Rain, dt: number) {
    rain.owed += RAIN.hits * rain.width * rain.height * dt;
    for (; rain.owed >= 1; rain.owed--) {
        const x = Math.random() * rain.width;
        const y = Math.random() * rain.height;
        const r =
            Math.random() < RAIN.big.chance
                ? THREE.MathUtils.randFloat(RAIN.big.size[0], RAIN.big.size[1])
                : THREE.MathUtils.lerp(RAIN.size[0], RAIN.size[1], Math.random() ** 2);
        rain.drops.push(newDrop(x, y, r));
        const satellites = THREE.MathUtils.randInt(RAIN.satellites[0], RAIN.satellites[1]);
        for (let i = 0; i < satellites; i++) {
            const angle = Math.random() * Math.PI * 2;
            const reach = r * THREE.MathUtils.randFloat(RAIN.satelliteReach[0], RAIN.satelliteReach[1]);
            const size = r * THREE.MathUtils.randFloat(RAIN.satelliteSize[0], RAIN.satelliteSize[1]);
            rain.drops.push(newDrop(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach, size));
        }
    }
}

function newDrop(x: number, y: number, r: number): Drop {
    const drop = spare.pop() ?? { x: 0, y: 0, r: 0, vy: 0, moving: false, age: 0, travelled: 0, wander: 0, gone: false };
    drop.x = x;
    drop.y = y;
    drop.r = r;
    drop.vy = 0;
    drop.moving = false;
    drop.age = 0;
    drop.travelled = 0;
    drop.wander = Math.random() * 100;
    drop.gone = false;
    return drop;
}

// Keeps the drops still here, in order, in place; the rest go to the spares.
function compact(rain: Rain) {
    const drops = rain.drops;
    let kept = 0;
    for (let i = 0; i < drops.length; i++) {
        const drop = drops[i];
        if (drop.gone) spare.push(drop);
        else drops[kept++] = drop;
    }
    drops.length = kept;
}

function slide(rain: Rain, dt: number) {
    shedding.length = 0;
    for (const drop of rain.drops) {
        if (!drop.moving) {
            if (drop.r > SLIDE.heavy && Math.random() < SLIDE.start * (drop.r / SLIDE.heavy) * dt) drop.moving = true;
            continue;
        }
        // Gravity against a grip that catches now and then: it lurches, slows, goes again.
        const grip = Math.sin(drop.age * SLIDE.stall * Math.PI * 2 + drop.wander) > 0.6 ? 6 : 1;
        drop.vy += (SLIDE.gravity * (drop.r / SLIDE.heavy) - drop.vy * SLIDE.drag * grip) * dt;
        const step = Math.max(0, drop.vy) * dt;
        drop.y -= step;
        drop.x += Math.sin(drop.age * 3 + drop.wander) * SLIDE.wander * step * 20;
        drop.travelled += step;
        while (drop.travelled > SLIDE.trailEvery) {
            drop.travelled -= SLIDE.trailEvery;
            const size = drop.r * THREE.MathUtils.randFloat(SLIDE.trailSize[0], SLIDE.trailSize[1]);
            shedding.push(newDrop(drop.x + (Math.random() - 0.5) * drop.r * 0.5, drop.y + drop.r * 1.2, size));
            // What it leaves, it loses: water's only ever moved, never made.
            drop.r = Math.sqrt(Math.max(drop.r * drop.r - size * size, 0));
        }
        if (drop.r < SLIDE.heavy * 0.6) drop.moving = false;
    }
    for (const drop of rain.drops) if (drop.y < -drop.r * 3 || drop.r < 0.0008) drop.gone = true;
    compact(rain);
    for (const drop of shedding) rain.drops.push(drop);
}

// Touching drops become one, keeping their area; a moving drop swallows what it runs into.
const CELL = RAIN.big.size[1] * 2.5;

function merge(rain: Rain) {
    const { drops } = rain;
    const { columns, rows, first } = rain.grid;
    if (rain.grid.next.length < drops.length) rain.grid.next = new Int32Array(drops.length * 2);
    const next = rain.grid.next;
    first.fill(-1);
    for (let i = 0; i < drops.length; i++) {
        const column = Math.min(Math.max(Math.floor(drops[i].x / CELL), 0), columns - 1);
        const row = Math.min(Math.max(Math.floor(drops[i].y / CELL), 0), rows - 1);
        const cell = row * columns + column;
        next[i] = first[cell];
        first[cell] = i;
    }
    let merged = false;
    for (const drop of drops) {
        // Still drops only meet what lands on them or runs into them: start from those.
        if (drop.gone || (!drop.moving && drop.age > 0.05)) continue;
        const column = Math.floor(drop.x / CELL);
        const row = Math.floor(drop.y / CELL);
        // Once it's been swallowed itself, it has nothing left to give.
        neighbours: for (let r = row - 1; r <= row + 1; r++) {
            if (r < 0 || r >= rows) continue;
            for (let c = column - 1; c <= column + 1; c++) {
                if (c < 0 || c >= columns) continue;
                for (let j = first[r * columns + c]; j !== -1; j = next[j]) {
                    if (drop.gone) break neighbours;
                    const other = drops[j];
                    if (other === drop || other.gone) continue;
                    const reach = (drop.r + other.r) * 0.8;
                    if ((drop.x - other.x) ** 2 + (drop.y - other.y) ** 2 > reach * reach) continue;
                    const keeps = drop.r >= other.r || drop.moving;
                    const big = keeps ? drop : other;
                    const small = keeps ? other : drop;
                    big.r = Math.sqrt(big.r * big.r + small.r * small.r);
                    big.moving = big.moving || small.moving;
                    small.gone = true;
                    merged = true;
                }
            }
        }
    }
    if (merged) compact(rain);
}

function draw(rain: Rain, dt: number) {
    const { water, wiped, sprite } = rain;
    const scale = MAP.perMetre;
    const h = water.canvas.height;
    water.context.clearRect(0, 0, water.canvas.width, h);
    // Trails mist over again; moving drops wipe them clear.
    wiped.context.globalCompositeOperation = 'destination-out';
    wiped.context.fillStyle = `rgba(0, 0, 0, ${Math.min(1, REFOG * dt)})`;
    wiped.context.fillRect(0, 0, wiped.canvas.width, wiped.canvas.height);
    wiped.context.globalCompositeOperation = 'source-over';
    wiped.context.fillStyle = 'white';
    for (const drop of rain.drops) {
        const splash = Math.max(0, 1 - drop.age / RAIN.splash.seconds);
        const r = drop.r * (1 + RAIN.splash.spread * splash) * scale;
        const x = drop.x * scale;
        const y = h - drop.y * scale;
        // A little taller than wide when sliding, heavier at the bottom.
        const tall = drop.moving ? 1.25 : 1;
        water.context.drawImage(sprite, x - r, y - r * tall, r * 2, r * 2 * tall);
        if (drop.moving) {
            wiped.context.beginPath();
            const k = MAP.wipedPerMetre / MAP.perMetre;
            wiped.context.ellipse(x * k, (y - r * 0.3) * k, r * 0.8 * k, r * 1.2 * k, 0, 0, Math.PI * 2);
            wiped.context.fill();
        }
    }
    water.texture.needsUpdate = true;
    wiped.texture.needsUpdate = true;
}

// One drop, as the glass reads it: red and green its slope across and up (0.5 flat), blue its thickness, alpha its
// coverage with a soft edge.
function dropSprite(size: number): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;
    const image = context.createImageData(size, size);
    for (let py = 0; py < size; py++) {
        for (let px = 0; px < size; px++) {
            const nx = ((px + 0.5) / size) * 2 - 1;
            const ny = -(((py + 0.5) / size) * 2 - 1);
            const d = Math.hypot(nx, ny);
            const o = (py * size + px) * 4;
            const coverage = THREE.MathUtils.smoothstep(1, 0.86, d);
            if (coverage <= 0) continue;
            image.data[o] = Math.round((0.5 + nx * 0.5) * 255);
            image.data[o + 1] = Math.round((0.5 + ny * 0.5) * 255);
            image.data[o + 2] = Math.round(Math.sqrt(Math.max(0, 1 - d * d)) * 255);
            image.data[o + 3] = Math.round(coverage * 255);
        }
    }
    context.putImageData(image, 0, 0);
    return canvas;
}
