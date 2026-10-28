import { TSL, type TslNode } from 'spark-radix';
import * as THREE from 'three';
import { MeshBasicNodeMaterial, RenderTarget, type WebGPURenderer } from 'three/webgpu';
import catjamUrl from '../assets/ads/catjam.png?url';
import { type CatVideo, initCatVideo, renderCatVideo } from './cat';
import { glassSheet, OUT } from './window-panes';

const {
    abs,
    attribute,
    cameraPosition,
    cos,
    exp,
    float,
    floor,
    fract,
    fwidth,
    hash,
    instanceIndex,
    max,
    min,
    mix,
    mx_noise_float,
    normalWorld,
    positionLocal,
    positionWorld,
    positionWorldDirection,
    pow,
    select,
    sin,
    smoothstep,
    step,
    texture,
    time,
    uniform,
    uv,
    vec2,
    vec3,
} = TSL;

// The city outside: real geometry, drawn each frame from the player's camera into a target the glass shows.
// The den is high up a tower, so the streets are well below the window.
// Everything's placed in the window's own frame: x along the wall, z out of it, y up from the window's middle.

const STREET = -70;
// Half the screen's resolution: the glass blurs it anyway.
export const CITY_SCALE = 0.5;

const TOWERS = { cell: 24, near: 32, far: 820, spread: 1.4, skip: 0.18, width: [9, 20], height: [18, 140], tallFar: 1.8 };
const SINK = 0.05;
const TIERS = { chance: 0.55, from: 60, shrink: [0.55, 0.8], height: [0.15, 0.35], spire: 0.22, clutter: 3 };
const WINDOWS = { width: 2.4, height: 3.6, lit: [0.2, 0.75], flicker: 0.04 };
const EDGES = { chance: 0.22, width: 0.35, brightness: 3.2 };
const BEACONS = { from: 110, size: 1.3, rate: 1.1 };
const NEON = [
    [1, 0.15, 0.7],
    [0.1, 0.95, 1],
    [1, 0.85, 0.2],
    [0.55, 1, 0.3],
    [0.75, 0.3, 1],
];
const SIGNS = { chance: 0.32 };
const ADS = { count: 5, depth: [90, 320] };
// Billboards of their own on masts, each with a clear view of it from the window: the jamming cat video,
// catJAM, and three little silly ones.
const BOARDS = {
    cat: { x: -18, y: 4, z: 110, width: 10, height: 13 },
    catjam: { x: 3, y: 4, z: 100, width: 9, height: 9 },
    worldLabs: { x: -42, y: 36, z: 190, width: 44, height: 5 },
    noodles: { x: -46, y: 8, z: 100, width: 9, height: 7 },
    catCafe: { x: -18, y: -6, z: 80, width: 22, height: 3.6 },
    dumplings: { x: -32, y: 24, z: 150, width: 16, height: 6 },
};
// Where the eye starts, in the city's frame (see player.ts's SPAWN): the boards are placed in view from it, and
// nothing's built between it and them.
const START_EYE = { x: 1.32, z: -6.74 };
// Signs drawn once onto a canvas: emoji, words, a neon glow. Marquees repeat and scroll, at this many repeats per
// board and this speed (boards per second, the sign's way).
const SIGNS_TEXT = {
    worldLabs: { text: '★ THE WORLD LABS ★ NOW IN 3D ★ ', colour: '#ff4fc8', marquee: { repeats: 2, speed: 0.06 } },
    catCafe: { text: '🐈 CAT CAFÉ · MORE CATS THAN CHAIRS · ', colour: '#40e8ff', marquee: { repeats: 2, speed: -0.05 } },
    noodles: { text: '🍜\nFRESH NOODLES\n24/7', colour: '#ffd23f', blink: 0.8 },
    dumplings: { text: '🥟 DUMPLINGS ARE\nA HUG YOU CAN EAT', colour: '#9dff5a', blink: 0 },
};
const CATJAM = { columns: 13, frames: 158, fps: 25 };
const TRAFFIC = { cars: 420, lanes: 9, length: 1400, speed: [18, 45], trail: 9 };
const TRAINS = { lines: 3, cars: 9, carLength: 18, length: 2200, speed: [28, 40] };
const BLIMPS = { count: 2, size: [46, 13], speed: 3 };
const MEGA = { count: 7, depth: [1350, 1900], height: [380, 900], width: [120, 260] };
const CLOUDS = { height: 135, scale: 0.0035, drift: 6 };
const SEARCHLIGHTS = { count: 3, sweep: 0.32, colour: vec3(0.6, 0.75, 1) };
// Rain falling past the window, close enough to see as streaks.
const RAIN = {
    drops: 5000,
    x: 30,
    y: 18,
    z: [1.2, 45],
    speed: 11,
    slant: 0.12,
    length: 0.9,
    colour: vec3(0.6, 0.65, 0.85).mul(0.22),
};
// Distance haze, thicker and warmer low down where the streets glow up through it.
const FOG = { colour: vec3(0.32, 0.09, 0.3), low: vec3(0.55, 0.16, 0.22), density: 0.0042, lowHeight: 35, lowExtra: 1.6 };

export type City = {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    target: RenderTarget;
    texel: ReturnType<typeof uniform>;
    cat: CatVideo;
};

export function initCity(renderer: WebGPURenderer): City {
    const scene = new THREE.Scene();
    scene.backgroundNode = smogSky();
    const camera = new THREE.PerspectiveCamera(70, 1, 1, 4000);
    const target = new RenderTarget(1, 1, { type: THREE.HalfFloatType });

    const { centre, along } = glassSheet();
    const frame = { origin: new THREE.Vector3(...centre), x: new THREE.Vector3(...along), z: new THREE.Vector3(...OUT) };
    const at: At = (x, y, z) =>
        frame.origin
            .clone()
            .addScaledVector(frame.x, x)
            .addScaledVector(frame.z, z)
            .setY(frame.origin.y + y);
    const facing = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(frame.x, new THREE.Vector3(0, 1, 0), frame.z.clone().negate()),
    );
    const place: Place = { at, facing, frame };

    const towers = layout();
    const cat = initCatVideo();
    // A render target's rows run down under WebGPU, up under WebGL.
    const flipped = renderer.coordinateSystem === THREE.WebGPUCoordinateSystem;
    scene.add(
        megastructure(place),
        buildings(place, towers),
        beacons(place, towers),
        signs(place, towers),
        ads(place, towers),
        billboards(place, cat, flipped),
        traffic(place),
        trains(place),
        blimps(place),
        street(place),
        clouds(place),
        searchlights(place),
        rain(place),
    );
    return { scene, camera, target, texel: uniform(new THREE.Vector2(1, 1)), cat };
}

export function resizeCity(city: City, width: number, height: number, pixelRatio: number): void {
    const [w, h] = [
        Math.max(1, Math.round(width * pixelRatio * CITY_SCALE)),
        Math.max(1, Math.round(height * pixelRatio * CITY_SCALE)),
    ];
    city.target.setSize(w, h);
    (city.texel.value as THREE.Vector2).set(1 / w, 1 / h);
}

export function renderCity(city: City, renderer: WebGPURenderer, view: THREE.PerspectiveCamera): void {
    renderCatVideo(city.cat, renderer, performance.now() / 1000);
    city.camera.position.copy(view.position);
    city.camera.quaternion.copy(view.quaternion);
    city.camera.fov = view.fov;
    city.camera.aspect = view.aspect;
    city.camera.updateProjectionMatrix();
    renderer.setRenderTarget(city.target);
    renderer.render(city.scene, city.camera);
    renderer.setRenderTarget(null);
}

/* layout */

type At = (x: number, y: number, z: number) => THREE.Vector3;
type Place = { at: At; facing: THREE.Quaternion; frame: { origin: THREE.Vector3; x: THREE.Vector3; z: THREE.Vector3 } };
type Tower = { x: number; z: number; width: number; depth: number; height: number; seed: number };
// One box of a tower: its footprint's middle, its size, and how high its base sits.
type Block = { x: number; z: number; base: number; width: number; depth: number; height: number; seed: number };

function random(seed: number): number {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
}

function layout(): Tower[] {
    const towers: Tower[] = [];
    let seed = 1;
    for (let z = TOWERS.near; z < TOWERS.far; z += TOWERS.cell) {
        const reach = z * TOWERS.spread + 60;
        for (let x = -reach; x < reach; x += TOWERS.cell) {
            seed++;
            if (random(seed) < TOWERS.skip) continue;
            // Nothing between the window and a billboard.
            const blocking = Object.values(BOARDS).some((b) => {
                const reach = (z - START_EYE.z) / (b.z - START_EYE.z);
                const onLine = START_EYE.x + (b.x - START_EYE.x) * reach;
                return z < b.z + 15 && Math.abs(x - onLine) < (b.width / 2) * reach + TOWERS.width[1];
            });
            if (blocking) continue;
            const width = THREE.MathUtils.lerp(TOWERS.width[0], TOWERS.width[1], random(seed * 3.1));
            const depth = THREE.MathUtils.lerp(TOWERS.width[0], TOWERS.width[1], random(seed * 5.7));
            // Mostly mid-rise, a few very tall, the far ones taller so the skyline rises away.
            const tall = random(seed * 7.3) ** 2.4;
            const height =
                THREE.MathUtils.lerp(TOWERS.height[0], TOWERS.height[1], tall) * (1 + (z / TOWERS.far) * (TOWERS.tallFar - 1));
            const jitter = (TOWERS.cell - width) * (random(seed * 9.9) - 0.5);
            towers.push({ x: x + jitter, z: z + (random(seed * 2.3) - 0.5) * 6, width, depth, height, seed: random(seed * 1.9) });
        }
    }
    return towers;
}

// A tower's boxes: its shaft, setback tiers stepping in toward the top, perhaps a spire, and roof clutter.
function blocksOf(tower: Tower): Block[] {
    const blocks: Block[] = [];
    const r = (k: number) => random(tower.seed * 1000 + k);
    let [width, depth, base] = [tower.width, tower.depth, 0];
    let height = tower.height;
    const tiered = tower.height > TIERS.from && r(1) < TIERS.chance;
    if (tiered) height = tower.height * 0.65;
    blocks.push({ x: tower.x, z: tower.z, base, width, depth, height, seed: tower.seed });
    // Each box above sinks a little into the one below, so no two faces share a plane and fight.
    base += height - SINK;
    if (tiered) {
        for (let tier = 0; tier < 2; tier++) {
            const shrink = THREE.MathUtils.lerp(TIERS.shrink[0], TIERS.shrink[1], r(2 + tier));
            width *= shrink;
            depth *= shrink;
            const rise = tower.height * THREE.MathUtils.lerp(TIERS.height[0], TIERS.height[1], r(4 + tier));
            blocks.push({ x: tower.x, z: tower.z, base, width, depth, height: rise, seed: tower.seed });
            base += rise - SINK;
        }
    }
    if (r(6) < TIERS.spire) {
        const spire = 12 + r(7) * 35;
        blocks.push({ x: tower.x, z: tower.z, base, width: 1.4, depth: 1.4, height: spire, seed: tower.seed });
    }
    for (let i = 0; i < Math.floor(r(8) * (TIERS.clutter + 1)); i++) {
        const size = 2 + r(10 + i) * 4;
        blocks.push({
            x: tower.x + (r(20 + i) - 0.5) * (width - size),
            z: tower.z + (r(30 + i) - 0.5) * (depth - size),
            base,
            width: size,
            depth: size,
            height: 1.5 + r(40 + i) * 4,
            seed: tower.seed,
        });
    }
    return blocks;
}

function topOf(tower: Tower): number {
    const blocks = blocksOf(tower);
    return Math.max(...blocks.map((b) => b.base + b.height));
}

/* the towers */

function buildings({ at, facing }: Place, towers: Tower[]) {
    const blocks = towers.flatMap(blocksOf);
    const geometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const seeds = new Float32Array(blocks.length);
    const sizes = new Float32Array(blocks.length * 3);
    const material = new MeshBasicNodeMaterial();
    const mesh = new THREE.InstancedMesh(geometry, material, blocks.length);
    const matrix = new THREE.Matrix4();
    blocks.forEach((block, i) => {
        matrix.compose(
            at(block.x, STREET + block.base, block.z),
            facing,
            new THREE.Vector3(block.width, block.height, block.depth),
        );
        mesh.setMatrixAt(i, matrix);
        seeds[i] = block.seed;
        sizes.set([block.width, block.height, block.depth], i * 3);
    });
    geometry.setAttribute('towerSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    geometry.setAttribute('blockSize', new THREE.InstancedBufferAttribute(sizes, 3));

    const seed = attribute('towerSeed', 'float').mul(97.3);
    const size = attribute('blockSize', 'vec3');
    const side = abs(normalWorld.y).lessThan(0.5);

    // Windows, in metres across each face and up: a grid, horizontal bands, or vertical strips, by tower.
    const across = positionWorld.x.mul(normalWorld.z).sub(positionWorld.z.mul(normalWorld.x));
    const grid = vec2(across.div(WINDOWS.width), positionWorld.y.div(WINDOWS.height));
    const cell = floor(grid);
    const inside = fract(grid);
    const style = hash(seed.add(4.2));
    const paneX = smoothstep(0.12, 0.2, inside.x).mul(smoothstep(0.88, 0.8, inside.x));
    const paneY = smoothstep(0.18, 0.28, inside.y).mul(smoothstep(0.85, 0.75, inside.y));
    const pane = select(style.lessThan(0.6), paneX.mul(paneY), select(style.lessThan(0.82), paneY, paneX));
    // Bands light whole floors, strips whole columns; some floors are simply dark.
    const unit = select(style.lessThan(0.6), cell, select(style.lessThan(0.82), vec2(0, cell.y), vec2(cell.x, 0)));
    const roll = hash(unit.x.mul(13.7).add(unit.y.mul(71.3)).add(seed.mul(101)));
    const darkFloor = step(hash(cell.y.mul(5.1).add(seed)), 0.12);
    const occupancy = mix(WINDOWS.lit[0], WINDOWS.lit[1], hash(seed));
    const flickering = hash(roll.mul(999)).lessThan(WINDOWS.flicker);
    const on = step(roll, occupancy)
        .mul(float(1).sub(darkFloor))
        .mul(select(flickering, step(0, sin(time.mul(hash(roll).mul(9).add(2)).add(roll.mul(40)))), float(1)));
    const tone = hash(roll.mul(31.7));
    const neon = mix(vec3(1, 0.2, 0.75), vec3(0.2, 0.95, 1), hash(seed.mul(3)));
    const light = select(tone.lessThan(0.08), neon, mix(vec3(1, 0.68, 0.38), vec3(0.55, 0.78, 1), step(0.62, tone))).mul(
        mix(0.6, 2.2, hash(roll.mul(5.1))),
    );
    const wall = mix(vec3(0.012, 0.012, 0.02), vec3(0.03, 0.025, 0.045), hash(seed.mul(1.7)));
    // Once a window's about a pixel, its pattern only shimmers: show its average glow instead.
    const tiny = smoothstep(0.35, 0.9, max(fwidth(grid.x), fwidth(grid.y)));
    const lit = mix(wall, light, mix(pane.mul(on), occupancy.mul(0.35), tiny));

    // Neon strips up the corners and round the top of some towers: the outlined skyline.
    // The box's own vertex, before instancing: positionLocal already has each block's placement and scale in it.
    const local = attribute('position', 'vec3').mul(size).toVar();
    const fromSideX = size.x.mul(0.5).sub(abs(local.x));
    const fromSideZ = size.z.mul(0.5).sub(abs(local.z));
    const fromTop = size.y.sub(local.y);
    // Never thinner than about a pixel, and dimmer as they would be: a strip far off is a faint steady line, not one
    // flickering on and off as the view sways.
    const strip = (distance: TslNode) => {
        const pixel = fwidth(distance);
        const width = max(float(EDGES.width), pixel);
        return smoothstep(width.add(pixel.mul(0.5)), width.sub(pixel.mul(0.5)), distance).mul(float(EDGES.width).div(width));
    };
    const corner = strip(max(fromSideX, fromSideZ));
    const rim = strip(fromTop).mul(strip(min(fromSideX, fromSideZ)));
    const outlined = step(hash(seed.add(9.1)), EDGES.chance).mul(max(corner, rim));
    const edgeColour = neonPick(hash(seed.add(11.3))).mul(EDGES.brightness);

    material.colorNode = fogged(mix(select(side, lit, wall.mul(0.6)), edgeColour, outlined));
    return mesh;
}

// Red lights blinking on the tallest tops, out of step with each other.
function beacons({ at, facing }: Place, towers: Tower[]) {
    const tall = towers.filter((t) => topOf(t) > BEACONS.from);
    const mesh = new THREE.InstancedMesh(
        new THREE.BoxGeometry(BEACONS.size, BEACONS.size, BEACONS.size),
        new MeshBasicNodeMaterial(),
        tall.length,
    );
    const matrix = new THREE.Matrix4();
    tall.forEach((tower, i) => {
        matrix.compose(at(tower.x, STREET + topOf(tower) + BEACONS.size / 2, tower.z), facing, new THREE.Vector3(1, 1, 1));
        mesh.setMatrixAt(i, matrix);
    });
    const phase = hash(float(instanceIndex).mul(3.3)).mul(6.28);
    const blink = pow(max(sin(time.mul(BEACONS.rate * Math.PI * 2).add(phase)), 0), 6);
    (mesh.material as MeshBasicNodeMaterial).colorNode = fogged(vec3(1, 0.05, 0.03).mul(blink.mul(6).add(0.15)));
    return mesh;
}

/* signs and ads */

function neonPick(pick: TslNode): TslNode {
    let colour: TslNode = vec3(...NEON[0]);
    for (let i = 1; i < NEON.length; i++) colour = select(pick.greaterThan(i / NEON.length), vec3(...NEON[i]), colour);
    return colour;
}

function signs({ at, facing }: Place, towers: Tower[]) {
    const chosen = towers.filter((tower, i) => random(i * 17.3) < SIGNS.chance && tower.z < 520);
    const material = new MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    const geometry = new THREE.PlaneGeometry(1, 1);
    const mesh = new THREE.InstancedMesh(geometry, material, chosen.length);
    const matrix = new THREE.Matrix4();
    const colours = new Float32Array(chosen.length * 3);
    chosen.forEach((tower, i) => {
        const vertical = random(i * 4.1) < 0.6;
        const big = random(i * 8.7) < 0.15;
        const [w, h] = big
            ? [tower.width * 0.85, tower.width * 0.5]
            : vertical
              ? [2.2, 9 + random(i) * 10]
              : [9 + random(i) * 6, 2.4];
        const y = STREET + Math.min(tower.height - h, 12 + random(i * 2.9) * (tower.height - 12));
        const x = tower.x + (random(i * 6.1) - 0.5) * (tower.width - w);
        // On the face toward the window, just proud of it.
        matrix.compose(at(x, y + h / 2, tower.z - tower.depth / 2 - 0.4), facing, new THREE.Vector3(w, h, 1));
        mesh.setMatrixAt(i, matrix);
        colours.set(NEON[Math.floor(random(i * 3.3) * NEON.length)], i * 3);
    });
    geometry.setAttribute('signColour', new THREE.InstancedBufferAttribute(colours, 3));

    const colour = attribute('signColour', 'vec3');
    const seed = float(instanceIndex).mul(3.7);
    const st = uv();
    // Blocky glyphs in rows, a bright border, and now and then a stutter.
    const glyph = step(
        0.45,
        hash(
            floor(st.mul(vec2(6, 14)))
                .dot(vec2(1, 37))
                .add(seed.mul(11)),
        ),
    );
    const border = max(step(st.x, 0.06).add(step(0.94, st.x)), step(st.y, 0.04).add(step(0.96, st.y)));
    const stutter = step(0.985, hash(floor(time.mul(8)).add(seed.mul(17))));
    const scan = sin(st.y.mul(40).add(time.mul(3).add(seed)))
        .mul(0.15)
        .add(0.85);
    const glow = max(glyph.mul(0.85), border)
        .mul(scan)
        .mul(float(1).sub(stutter.mul(0.9)));
    material.colorNode = fogged(colour.mul(glow.mul(2.4).add(0.12)));
    return mesh;
}

// A few huge animated billboards: falling glyph columns, pulsing rings, or diagonal colour wipes.
function ads({ at, facing }: Place, towers: Tower[]) {
    const candidates = towers
        .filter((t) => t.z > ADS.depth[0] && t.z < ADS.depth[1] && Math.abs(t.x) < t.z * 0.7 && t.height > 50)
        .sort((a, b) => random(a.seed * 77) - random(b.seed * 77))
        .slice(0, ADS.count);
    const material = new MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    const geometry = new THREE.PlaneGeometry(1, 1);
    const mesh = new THREE.InstancedMesh(geometry, material, candidates.length);
    const matrix = new THREE.Matrix4();
    candidates.forEach((tower, i) => {
        const w = tower.width * 0.92;
        const h = Math.min(tower.height * 0.45, w * 1.6);
        const y = STREET + tower.height * 0.35 + h / 2;
        matrix.compose(at(tower.x, y, tower.z - tower.depth / 2 - 0.6), facing, new THREE.Vector3(w, h, 1));
        mesh.setMatrixAt(i, matrix);
    });

    const seed = float(instanceIndex);
    const kind = floor(hash(seed.mul(5.5)).mul(3));
    const st = uv();
    const a = neonPick(hash(seed.mul(1.3)));
    const b = neonPick(hash(seed.mul(2.9)));

    // Glyph rain: columns of blocky characters falling at their own speeds, bright at the head.
    const column = floor(st.x.mul(16));
    const fall = st.y.add(time.mul(mix(0.15, 0.45, hash(column.add(seed.mul(9))))));
    const row = floor(fall.mul(28));
    const head = fract(fall.mul(0.6).add(hash(column)));
    const glyphs = step(
        0.4,
        hash(
            row
                .mul(3.1)
                .add(column.mul(17))
                .add(floor(time.mul(6))),
        ),
    )
        .mul(pow(head, 3))
        .mul(step(0.15, fract(st.x.mul(16))));
    // Rings: pulsing out from the middle.
    const radius = vec2(st.x.sub(0.5), st.y.sub(0.5).mul(1.6)).length();
    const rings = pow(
        sin(radius.mul(28).sub(time.mul(3)))
            .mul(0.5)
            .add(0.5),
        4,
    ).mul(smoothstep(0.6, 0.1, radius));
    // Wipes: diagonal colour bands sliding across.
    const wipe = fract(st.x.add(st.y).mul(1.5).sub(time.mul(0.25)));
    const pattern = select(kind.lessThan(1), glyphs, select(kind.lessThan(2), rings, smoothstep(0.4, 0.5, wipe)));
    const colour = mix(a, b, select(kind.lessThan(2), st.y, wipe));
    const scan = sin(st.y.mul(160)).mul(0.1).add(0.9);
    const flicker = float(1).sub(step(0.992, hash(floor(time.mul(20)).add(seed.mul(13)))).mul(0.6));
    material.colorNode = fogged(colour.mul(pattern.mul(3).add(0.08)).mul(scan).mul(flicker));
    return mesh;
}

/* moving things */

// Cars as light trails: brightest at the front, fading back along their length.
function traffic({ at, frame }: Place) {
    const geometry = new THREE.BoxGeometry(TRAFFIC.trail, 0.45, 0.8);
    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.InstancedMesh(geometry, material, TRAFFIC.cars);
    const identity = new THREE.Matrix4();
    for (let i = 0; i < TRAFFIC.cars; i++) mesh.setMatrixAt(i, identity);
    mesh.frustumCulled = false;

    const seed = float(instanceIndex);
    const laneSeed = floor(hash(seed.mul(1.3)).mul(TRAFFIC.lanes)).mul(9.17);
    const height = mix(-20, 70, hash(laneSeed));
    const depth = mix(45, 420, hash(laneSeed.add(3)));
    const forward = step(0.5, hash(seed.mul(2.9)));
    const direction = forward.mul(2).sub(1);
    const speed = mix(TRAFFIC.speed[0], TRAFFIC.speed[1], hash(seed.mul(4.4)));
    const along = fract(hash(seed.mul(6.6)).add(time.mul(speed).mul(direction).div(TRAFFIC.length)))
        .sub(0.5)
        .mul(TRAFFIC.length);
    const placed = vec3(...at(0, 0, 0).toArray())
        .add(vec3(...frame.x.toArray()).mul(along))
        .add(vec3(...frame.z.toArray()).mul(depth))
        .add(vec3(0, height, 0));
    // The box runs along x: flip it so its front leads.
    const oriented = vec3(positionLocal.x.mul(direction), positionLocal.y, positionLocal.z);
    material.positionNode = vec3(...frame.x.toArray())
        .mul(oriented.x)
        .add(vec3(0, oriented.y, 0))
        .add(vec3(...frame.z.toArray()).mul(oriented.z))
        .add(placed);
    const front = positionLocal.x.mul(direction).div(TRAFFIC.trail).add(0.5);
    const head = select(forward.greaterThan(0.5), vec3(1, 0.95, 0.85), vec3(1, 0.12, 0.08));
    material.colorNode = head.mul(pow(front, 2.5).mul(3)).mul(exp(positionWorld.sub(cameraPosition).length().mul(-FOG.density)));
    return mesh;
}

// Elevated trains: chains of lit carriages on their tracks, crossing the middle distance.
function trains({ at, frame, facing }: Place) {
    const group = new THREE.Group();
    const lines = Array.from({ length: TRAINS.lines }, (_, i) => ({
        height: THREE.MathUtils.lerp(-35, 15, random(i * 4.1)),
        depth: THREE.MathUtils.lerp(70, 240, random(i * 6.3)),
        velocity: THREE.MathUtils.lerp(TRAINS.speed[0], TRAINS.speed[1], random(i * 2.2)) * (random(i * 8.8) < 0.5 ? -1 : 1),
        phase: random(i * 1.7),
    }));

    const count = TRAINS.lines * TRAINS.cars;
    const geometry = new THREE.BoxGeometry(TRAINS.carLength, 3.6, 3.4);
    // Per carriage: its line's height, depth, velocity and phase, and which carriage it is.
    const line = new Float32Array(count * 4);
    const place = new Float32Array(count);
    for (let i = 0; i < count; i++) {
        const l = lines[Math.floor(i / TRAINS.cars)];
        line.set([l.height, l.depth, l.velocity, l.phase], i * 4);
        place[i] = i % TRAINS.cars;
    }
    geometry.setAttribute('trainLine', new THREE.InstancedBufferAttribute(line, 4));
    geometry.setAttribute('trainCar', new THREE.InstancedBufferAttribute(place, 1));
    const material = new MeshBasicNodeMaterial();
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    const identity = new THREE.Matrix4();
    for (let i = 0; i < count; i++) mesh.setMatrixAt(i, identity);
    mesh.frustumCulled = false;

    const params = attribute('trainLine', 'vec4');
    const car = attribute('trainCar', 'float');
    const direction = select(params.z.lessThan(0), float(-1), float(1));
    const along = fract(params.w.add(time.mul(params.z).div(TRAINS.length)))
        .sub(0.5)
        .mul(TRAINS.length)
        .sub(car.mul(TRAINS.carLength + 1).mul(direction));
    const x = vec3(...frame.x.toArray());
    const z = vec3(...frame.z.toArray());
    material.positionNode = x
        .mul(positionLocal.x.add(along))
        .add(vec3(0, positionLocal.y.add(params.x), 0))
        .add(z.mul(positionLocal.z.add(params.y)))
        .add(vec3(...at(0, 0, 0).toArray()));
    // A band of lit windows along each side, the roof and ends dark.
    const band = step(-0.2, positionLocal.y)
        .mul(step(positionLocal.y, 1.1))
        .mul(step(0.5, fract(positionLocal.x.div(2.2))));
    const sideFace = abs(normalWorld.y).lessThan(0.5);
    material.colorNode = fogged(mix(vec3(0.02, 0.02, 0.03), vec3(0.95, 0.85, 0.65).mul(1.8), select(sideFace, band, float(0))));
    group.add(mesh);

    // The tracks: long dark beams under each line, with a row of small lamps.
    const beamMaterial = new MeshBasicNodeMaterial();
    const lamp = step(0.97, fract(positionWorld.x.add(positionWorld.z).div(12)));
    beamMaterial.colorNode = fogged(mix(vec3(0.015, 0.012, 0.02), vec3(1, 0.6, 0.3).mul(2), lamp));
    for (const l of lines) {
        const beam = new THREE.Mesh(new THREE.BoxGeometry(TRAINS.length, 1.2, 3), beamMaterial);
        beam.position.copy(at(0, l.height - 2.6, l.depth));
        beam.quaternion.copy(facing);
        group.add(beam);
    }
    return group;
}

function blimps({ at, facing }: Place) {
    const group = new THREE.Group();
    for (let i = 0; i < BLIMPS.count; i++) {
        const body = new MeshBasicNodeMaterial();
        body.colorNode = fogged(vec3(0.03, 0.03, 0.045));
        const hull = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12), body);
        hull.scale.set(BLIMPS.size[0] / 2, BLIMPS.size[1] / 2, BLIMPS.size[1] / 2);
        const banner = new MeshBasicNodeMaterial({ side: THREE.DoubleSide });
        const st = uv();
        const scroll = fract(st.x.mul(3).sub(time.mul(0.12 + i * 0.05)));
        const letters = step(
            0.5,
            hash(
                floor(scroll.mul(18))
                    .add(floor(st.y.mul(3)).mul(7))
                    .add(i * 31),
            ),
        );
        banner.colorNode = fogged(vec3(...NEON[(i * 2 + 1) % NEON.length]).mul(letters.mul(2.6).add(0.15)));
        const board = new THREE.Mesh(new THREE.PlaneGeometry(BLIMPS.size[0] * 0.6, BLIMPS.size[1] * 0.45), banner);
        board.position.set(0, 0, BLIMPS.size[1] / 2 + 0.3);
        // Drifting slowly along the wall, far out: along the blimp's own x, which faces along the wall.
        const drift = fract(time.mul(BLIMPS.speed / 1600).add(i * 0.37))
            .sub(0.5)
            .mul(1600);
        body.positionNode = positionLocal.add(vec3(drift.div(hull.scale.x), 0, 0));
        banner.positionNode = positionLocal.add(vec3(drift, 0, 0));
        const blimp = new THREE.Group();
        blimp.add(hull, board);
        blimp.position.copy(at(0, 40 + i * 35, 260 + i * 180));
        blimp.quaternion.copy(facing);
        group.add(blimp);
    }
    return group;
}

/* the backdrop */

// Vast dark silhouettes far behind it all, a few lights high up: the scale of the place.
function megastructure({ at, facing }: Place) {
    const geometry = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const material = new MeshBasicNodeMaterial();
    const mesh = new THREE.InstancedMesh(geometry, material, MEGA.count);
    const matrix = new THREE.Matrix4();
    for (let i = 0; i < MEGA.count; i++) {
        const z = THREE.MathUtils.lerp(MEGA.depth[0], MEGA.depth[1], random(i * 3.7));
        const x = (random(i * 5.1) - 0.5) * z * 1.6;
        const w = THREE.MathUtils.lerp(MEGA.width[0], MEGA.width[1], random(i * 7.7));
        const h = THREE.MathUtils.lerp(MEGA.height[0], MEGA.height[1], random(i * 9.3));
        matrix.compose(at(x, STREET, z), facing, new THREE.Vector3(w, h, w));
        mesh.setMatrixAt(i, matrix);
    }
    const cell = floor(vec2(positionWorld.x.add(positionWorld.z).div(9), positionWorld.y.div(14)));
    const lights = step(0.985, hash(cell.x.mul(7.7).add(cell.y.mul(31.1))));
    // Only lightly fogged, so it stands dark against the glowing haze.
    const distance = positionWorld.sub(cameraPosition).length();
    const haze = float(1).sub(exp(distance.mul(-0.0007)));
    material.colorNode = mix(mix(vec3(0.008, 0.006, 0.015), vec3(1, 0.7, 0.45).mul(1.5), lights), FOG.colour, haze.mul(0.75));
    return mesh;
}

function street({ at, facing }: Place) {
    const material = new MeshBasicNodeMaterial();
    const grid = fract(positionWorld.xz.div(24));
    const lamps = step(0.94, grid.x).add(step(0.94, grid.y)).min(1);
    material.colorNode = fogged(mix(vec3(0.01, 0.008, 0.015), vec3(1, 0.55, 0.25).mul(0.8), lamps.mul(0.6)));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), material);
    ground.position.copy(at(0, STREET, 0));
    ground.quaternion.copy(facing);
    return ground;
}

// A low deck of cloud over the city, lit from beneath by its glow, with the searchlights' spots on it.
function clouds({ at, facing }: Place) {
    const material = new MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    const p = positionWorld.xz.mul(CLOUDS.scale).add(vec2(time.mul(CLOUDS.drift * CLOUDS.scale), 0));
    const billow = mx_noise_float(vec3(p, time.mul(0.01)))
        .mul(0.6)
        .add(mx_noise_float(vec3(p.mul(2.7), 3.1)).mul(0.3))
        .mul(0.5)
        .add(0.5);
    let spots: TslNode = float(0);
    for (let i = 0; i < SEARCHLIGHTS.count; i++) {
        const hit = searchlightHit(i, at);
        spots = spots.add(smoothstep(28, 0, positionWorld.xz.sub(hit).length()));
    }
    const lit = FOG.colour.mul(mix(0.6, 1.9, billow)).add(SEARCHLIGHTS.colour.mul(spots.mul(0.7)));
    const distance = positionWorld.sub(cameraPosition).length();
    material.colorNode = mix(lit, FOG.colour, float(1).sub(exp(distance.mul(-0.0011))));
    const deck = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(Math.PI / 2), material);
    deck.position.copy(at(0, CLOUDS.height, 0));
    deck.quaternion.copy(facing);
    return deck;
}

// Where searchlight `i`'s beam meets the clouds, as it sweeps.
function searchlightHit(i: number, at: At): TslNode {
    const base = at((i - 1) * 260, STREET, 380 + i * 140);
    const angle = sin(time.mul(0.11 + i * 0.03).add(i * 2.1)).mul(SEARCHLIGHTS.sweep);
    const lean = cos(time.mul(0.07 + i * 0.02).add(i)).mul(SEARCHLIGHTS.sweep * 0.6);
    const rise = CLOUDS.height - STREET;
    return vec2(base.x, base.z).add(vec2(sin(angle), sin(lean)).mul(rise));
}

function searchlights({ at }: Place) {
    const group = new THREE.Group();
    const rise = CLOUDS.height - STREET;
    for (let i = 0; i < SEARCHLIGHTS.count; i++) {
        const material = new MeshBasicNodeMaterial({
            transparent: true,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            side: THREE.DoubleSide,
        });
        const geometry = new THREE.CylinderGeometry(7, 0.8, rise, 16, 1, true).translate(0, rise / 2, 0);
        const beam = new THREE.Mesh(geometry, material);
        const base = at((i - 1) * 260, STREET, 380 + i * 140);
        const angle = sin(time.mul(0.11 + i * 0.03).add(i * 2.1)).mul(SEARCHLIGHTS.sweep);
        const lean = cos(time.mul(0.07 + i * 0.02).add(i)).mul(SEARCHLIGHTS.sweep * 0.6);
        // Tilted by shearing along the height, so the top lands where searchlightHit says.
        const up = positionLocal.y.div(rise);
        material.positionNode = positionLocal.add(vec3(sin(angle), 0, sin(lean)).mul(up.mul(rise)));
        const fade = smoothstep(1, 0.2, up).mul(0.12);
        material.colorNode = SEARCHLIGHTS.colour.mul(fade);
        beam.position.copy(base);
        beam.frustumCulled = false;
        group.add(beam);
    }
    return group;
}

function rain({ at, frame }: Place) {
    const geometry = new THREE.BoxGeometry(0.012, RAIN.length, 0.012);
    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.InstancedMesh(geometry, material, RAIN.drops);
    const identity = new THREE.Matrix4();
    for (let i = 0; i < RAIN.drops; i++) mesh.setMatrixAt(i, identity);
    mesh.frustumCulled = false;

    const seed = float(instanceIndex);
    const height = RAIN.y * 2;
    const fall = fract(hash(seed.mul(3.3)).sub(time.mul(RAIN.speed / height)));
    const y = fall.mul(height).sub(RAIN.y);
    const x = hash(seed.mul(1.1))
        .sub(0.5)
        .mul(RAIN.x * 2)
        .add(y.mul(RAIN.slant));
    const z = mix(RAIN.z[0], RAIN.z[1], hash(seed.mul(2.2)).pow(1.6));
    const placed = vec3(...at(0, 0, 0).toArray())
        .add(vec3(...frame.x.toArray()).mul(x))
        .add(vec3(...frame.z.toArray()).mul(z))
        .add(vec3(0, y, 0));
    // Leaning with the wind, like the streaks.
    const lean = vec3(...frame.x.toArray()).mul(positionLocal.y.mul(RAIN.slant));
    material.positionNode = positionLocal.add(lean).add(placed);
    // Added light, so it fades to nothing in the haze rather than to the haze's colour.
    material.colorNode = RAIN.colour.mul(
        exp(
            positionWorld
                .sub(cameraPosition)
                .length()
                .mul(-FOG.density * 3),
        ),
    );
    return mesh;
}

/* air */

// Distance haze over everything, thicker and warmer near the streets, so the city melts into its own glow.
function fogged(colour: TslNode): TslNode {
    const distance = positionWorld.sub(cameraPosition).length();
    const low = exp(positionWorld.y.sub(cameraPosition.y.add(STREET)).div(-FOG.lowHeight)).min(1);
    const amount = float(1).sub(exp(distance.mul(-FOG.density).mul(low.mul(FOG.lowExtra).add(1))));
    return mix(colour, mix(FOG.colour, FOG.low, low), amount);
}

function smogSky(): TslNode {
    const y = positionWorldDirection.y;
    const glow = pow(smoothstep(0.4, -0.05, y), 1.4);
    return mix(vec3(0.02, 0.015, 0.05), FOG.colour.mul(1.1), glow);
}

/* billboards */

type Board = { x: number; y: number; z: number; width: number; height: number };

function billboards(place: Place, cat: CatVideo, flipped: boolean) {
    const group = new THREE.Group();
    const st = uv();

    // The cat video, straight off its target.
    const videoAt = vec2(st.x, flipped ? st.y.oneMinus() : st.y);
    group.add(board(place, BOARDS.cat, texture(cat.target.texture, videoAt).rgb.mul(1.6)));

    // catJAM: the gif's frames, laid out in a sheet, stepped through at its own rate. Its clear background shows
    // the board's dark glow behind.
    const sheet = new THREE.TextureLoader().load(catjamUrl);
    sheet.colorSpace = THREE.SRGBColorSpace;
    const frame = floor(time.mul(CATJAM.fps)).mod(CATJAM.frames);
    const column = frame.mod(CATJAM.columns);
    const row = floor(frame.div(CATJAM.columns));
    const cell = vec2(
        column.add(st.x),
        float(CATJAM.columns - 1)
            .sub(row)
            .add(st.y),
    ).div(CATJAM.columns);
    const jam = texture(sheet, cell);
    const backdrop = mix(vec3(0.25, 0.02, 0.2), vec3(0.04, 0.02, 0.12), st.y);
    group.add(board(place, BOARDS.catjam, mix(backdrop, jam.rgb.mul(1.4), jam.a)));

    for (const name of ['worldLabs', 'catCafe', 'noodles', 'dumplings'] as const) {
        group.add(board(place, BOARDS[name], textSign(BOARDS[name], SIGNS_TEXT[name])));
    }
    return group;
}

// A screen on a mast, facing the window, with a flickering neon border and scanlines over whatever it shows.
function board({ at, facing }: Place, spot: Board, picture: TslNode) {
    const st = uv();
    const aspect = spot.width / spot.height;
    const edge = min(min(st.x, st.x.oneMinus()).mul(aspect), min(st.y, st.y.oneMinus()));
    const border = smoothstep(0.035, 0.02, edge).mul(float(1).sub(step(0.97, hash(floor(time.mul(12)).add(spot.x))).mul(0.7)));
    const scan = sin(st.y.mul(spot.height * 9))
        .mul(0.08)
        .add(0.92);
    const material = new MeshBasicNodeMaterial({ side: THREE.DoubleSide });
    material.colorNode = fogged(mix(picture.mul(scan), vec3(1, 0.85, 0.25).mul(2.2), border));

    const group = new THREE.Group();
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(spot.width, spot.height), material);
    // Local +z faces the window: the backing and mast go behind.
    const backing = new THREE.Mesh(new THREE.BoxGeometry(spot.width + 1, spot.height + 1, 0.8), darkMaterial());
    backing.position.z = -0.5;
    const mastHeight = spot.y - spot.height / 2 - STREET;
    const mast = new THREE.Mesh(new THREE.BoxGeometry(1.4, mastHeight, 1.4), darkMaterial());
    mast.position.set(0, -spot.height / 2 - mastHeight / 2, -0.5);
    group.add(screen, backing, mast);
    group.position.copy(at(spot.x, spot.y, spot.z));
    group.quaternion.copy(facing);
    return group;
}

type SignText = { text: string; colour: string; marquee?: { repeats: number; speed: number }; blink?: number };

// A sign painted onto a canvas: its words (and emoji) in Paper Mono with a neon glow, on dark. Repainted once the
// font's in, since the canvas can't wait for it.
function textSign(spot: Board, sign: SignText): TslNode {
    const canvas = document.createElement('canvas');
    const repeats = sign.marquee?.repeats ?? 1;
    canvas.height = 256;
    canvas.width = Math.round((256 * spot.width) / spot.height / repeats);
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;
    const map = new THREE.CanvasTexture(canvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.wrapS = THREE.RepeatWrapping;
    const paint = () => {
        context.fillStyle = '#0b0610';
        context.fillRect(0, 0, canvas.width, canvas.height);
        const lines = sign.text.split('\n');
        const size = Math.min(canvas.height / (lines.length * 1.25), sign.marquee ? canvas.height * 0.62 : 999);
        context.font = `500 ${size}px "Paper Mono", ui-monospace, monospace`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = sign.colour;
        context.shadowColor = sign.colour;
        // Fit long single lines to the width.
        const widest = Math.max(...lines.map((line) => context.measureText(line).width));
        const squeeze = Math.min(1, (canvas.width * 0.94) / widest);
        context.save();
        context.translate(canvas.width / 2, canvas.height / 2);
        context.scale(squeeze, 1);
        lines.forEach((line, i) => {
            const y = (i - (lines.length - 1) / 2) * size * 1.15;
            for (const blur of [size * 0.5, size * 0.2, 0]) {
                context.shadowBlur = blur;
                context.fillText(line, 0, y);
            }
        });
        context.restore();
        map.needsUpdate = true;
    };
    paint();
    document.fonts?.load('500 64px "Paper Mono"').then(paint);

    const st = uv();
    const scroll = sign.marquee ? time.mul(sign.marquee.speed * repeats) : float(0);
    const lit = texture(map, vec2(st.x.mul(repeats).add(scroll), st.y)).rgb;
    // Some signs blink off now and then, the way a cheap sign does.
    const blink = sign.blink ? float(1).sub(step(sign.blink, fract(time.mul(0.45))).mul(0.85)) : float(1);
    return lit.mul(2.2).mul(blink);
}

function darkMaterial() {
    const material = new MeshBasicNodeMaterial();
    material.colorNode = fogged(vec3(0.012, 0.01, 0.018));
    return material;
}
