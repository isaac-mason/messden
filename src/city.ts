import { TSL, type TslNode } from 'spark-radix';
import * as THREE from 'three';
import { MeshBasicNodeMaterial, RenderTarget, type WebGPURenderer } from 'three/webgpu';
import catjamUrl from '../assets/ads/catjam.png?url';
import { type Ads, initAds, updateAds } from './ads';
import { type CatVideo, initCatVideo, renderCatVideo } from './cat';
import { type Frost, initFrost, renderFrost, resizeFrost } from './frost';
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
    uv,
    vec2,
    vec3,
} = TSL;

const STREET = -70;
export const CITY_SCALE = 0.75;

const STREETS = {
    avenueEvery: 4,
    crossEvery: 5,
    road: 9,
    pavement: 3.5,
    lampEvery: 22,
    cars: 1600,
    carSpeed: [9, 17],
    walkers: 2000,
    roads: 8,
    span: 1400,
    // How far behind the window a lane starts, and how far a car strays from its even spacing (metres).
    behind: 150,
    jitter: 10,
};
const SHOPS = { height: 5.6, bay: 5, shuttered: 0.3 };
const TOWERS = { cell: 24, near: 55, far: 820, spread: 1.4, skip: 0.18, width: [9, 20], height: [18, 140], tallFar: 1.8 };
const SINK = 0.05;
const TIERS = { chance: 0.55, from: 60, shrink: [0.55, 0.8], height: [0.15, 0.35], spire: 0.22, clutter: 3 };
const WINDOWS = { width: 1.7, height: 3.4, lit: [0.2, 0.7], flicker: 0.03 };
const FACADE = { uplight: vec3(0.5, 0.16, 0.2), uplightFade: 70, skylight: vec3(0.05, 0.05, 0.11), occlusion: 1.6 };
const EDGES = { chance: 0.08, width: 0.25, brightness: 2 };
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
const BOARDS = {
    cat: { x: -27.6, y: 1.4, z: 110, width: 18.2, height: 23.4 },
    catjam: { x: 8.8, y: 1.4, z: 95, width: 15.6, height: 15.6 },
    worldLabs: { x: -40, y: 82, z: 280, width: 60, height: 7 },
    noodles: { x: 25.6, y: 37.8, z: 100, width: 11.7, height: 9.1 },
    catCafe: { x: -18, y: -8, z: 80, width: 26, height: 4.2 },
    dumplings: { x: 98.4, y: 6.6, z: 140, width: 20.8, height: 7.8 },
    big: { x: -104.6, y: 11.8, z: 170, width: 39, height: 22.1 },
    lofi: { x: 56.4, y: 24.8, z: 150, width: 31.2, height: 17.6 },
    tall: { x: -153.6, y: 32.6, z: 170, width: 18.2, height: 22.1 },
    centre: { x: -8, y: 35.2, z: 120, width: 26, height: 14.6 },
    lowRight: { x: 126.4, y: -6.4, z: 200, width: 31.2, height: 17.6 },
    high: { x: -55.6, y: 79.4, z: 240, width: 31.2, height: 20.8 },
    nearRight: { x: 42.4, y: -1.2, z: 115, width: 19.5, height: 13 },
    upperMiddle: { x: 84.4, y: 66.4, z: 230, width: 33.8, height: 19 },
    lowLeft: { x: -66, y: -10, z: 120, width: 18.2, height: 12.1 },
    farRight: { x: 154.4, y: 43, z: 220, width: 28.6, height: 16.1 },
    upperLeft: { x: -83.6, y: 58.6, z: 180, width: 26, height: 14.7 },
};
// The player's spawn (player.ts SPAWN) in the city's frame: towers stay under its sightlines to the boards.
const START_EYE = { x: 1.32, y: 0, z: -6.74 };
const CAP_MARGIN = 4;
const SIGNS_TEXT = {
    worldLabs: { text: '★ THE WORLD LABS ★ NOW IN 3D ★ ', colour: '#ff4fc8', marquee: { repeats: 2, speed: 0.06 } },
    catCafe: { text: '🐈 CAT CAFÉ · MORE CATS THAN CHAIRS · ', colour: '#40e8ff', marquee: { repeats: 2, speed: -0.05 } },
    noodles: { text: '🍜\nFRESH NOODLES\n24/7', colour: '#ffd23f', blink: 0.8 },
    dumplings: { text: '🥟 DUMPLINGS ARE\nA HUG YOU CAN EAT', colour: '#9dff5a', blink: 0 },
};
const CATJAM = { columns: 13, frames: 158, fps: 25 };
const TRAFFIC = { cars: 360, lanes: 9, length: 1400, speed: [18, 45], trail: 3.5, depth: [160, 600] };
const TRAINS = { lines: 3, cars: 9, carLength: 18, length: 2200, speed: [28, 40] };
const BLIMPS = { count: 2, size: [46, 13], speed: 3 };
const MEGA = { count: 7, depth: [1350, 1900], height: [380, 900], width: [120, 260] };
const CLOUDS = { height: 135, scale: 0.0035, drift: 6 };
const SEARCHLIGHTS = { count: 3, sweep: 0.32, colour: vec3(0.6, 0.75, 1) };
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
const FOG = {
    colour: vec3(0.17, 0.05, 0.17),
    low: vec3(0.36, 0.1, 0.14),
    high: vec3(0.07, 0.04, 0.13),
    density: 0.0042,
    falloff: 1.5,
    lowHeight: 35,
    lowExtra: 1.6,
    highFrom: 60,
};

export type City = {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    target: RenderTarget;
    cat: CatVideo;
    ads: Ads;
    frost: Frost;
};

export function initCity(renderer: WebGPURenderer): City {
    const scene = new THREE.Scene();
    scene.backgroundNode = smogSky();
    const camera = new THREE.PerspectiveCamera(70, 1, 1, 4000);
    const target = new RenderTarget(1, 1, {
        type: THREE.HalfFloatType,
        // Multisampled: the city's edges and window grids crawl as the view sways without it.
        samples: 4,
        depthTexture: new THREE.DepthTexture(1, 1),
    });

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
    const ads = initAds();
    // A render target's rows run down under WebGPU, up under WebGL.
    const flipped = renderer.coordinateSystem === THREE.WebGPUCoordinateSystem;
    scene.add(
        megastructure(place),
        buildings(place, towers),
        beacons(place, towers),
        signs(place, towers),
        holograms(place, towers),
        billboards(place, cat, ads, flipped),
        traffic(place),
        streetTraffic(place),
        streetLamps(place),
        walkers(place),
        trains(place),
        blimps(place),
        street(place),
        clouds(place),
        searchlights(place),
        rain(place),
    );
    return { scene, camera, target, cat, ads, frost: initFrost(target.texture) };
}

export function resizeCity(city: City, width: number, height: number, pixelRatio: number): void {
    const [w, h] = [
        Math.max(1, Math.round(width * pixelRatio * CITY_SCALE)),
        Math.max(1, Math.round(height * pixelRatio * CITY_SCALE)),
    ];
    city.target.setSize(w, h);
    resizeFrost(city.frost, w, h);
}

export function renderCity(city: City, renderer: WebGPURenderer, view: THREE.PerspectiveCamera): void {
    renderCatVideo(city.cat, renderer, performance.now() / 1000);
    updateAds(city.ads, performance.now() / 1000);
    city.camera.position.copy(view.position);
    city.camera.quaternion.copy(view.quaternion);
    city.camera.fov = view.fov;
    city.camera.aspect = view.aspect;
    city.camera.updateProjectionMatrix();
    renderer.setRenderTarget(city.target);
    renderer.render(city.scene, city.camera);
    renderFrost(city.frost, renderer);
}

export function renderCityOnly(city: City, renderer: WebGPURenderer, view: THREE.PerspectiveCamera): void {
    renderCatVideo(city.cat, renderer, performance.now() / 1000);
    updateAds(city.ads, performance.now() / 1000);
    city.camera.position.copy(view.position);
    city.camera.quaternion.copy(view.quaternion);
    city.camera.fov = view.fov;
    city.camera.aspect = view.aspect;
    city.camera.updateProjectionMatrix();
    renderer.render(city.scene, city.camera);
}

/* layout */

type At = (x: number, y: number, z: number) => THREE.Vector3;
type Place = { at: At; facing: THREE.Quaternion; frame: { origin: THREE.Vector3; x: THREE.Vector3; z: THREE.Vector3 } };
type Tower = { x: number; z: number; width: number; depth: number; height: number; seed: number; capped: boolean };
type Block = { x: number; z: number; base: number; width: number; depth: number; height: number; seed: number };

function random(seed: number): number {
    const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
}

const isAvenue = (column: number) => column % STREETS.avenueEvery === 0;
const isCrossStreet = (row: number) => row % STREETS.crossEvery === 0;
const avenueXs = (reach: number) => {
    const xs: number[] = [];
    for (let column = -Math.ceil(reach / TOWERS.cell); column <= reach / TOWERS.cell; column++)
        if (isAvenue(column)) xs.push(column * TOWERS.cell);
    return xs;
};
const crossStreetZs = () => {
    const zs: number[] = [];
    for (let row = 0, z = TOWERS.near; z < TOWERS.far; row++, z += TOWERS.cell) if (isCrossStreet(row)) zs.push(z);
    return zs;
};

function layout(): Tower[] {
    const towers: Tower[] = [];
    let seed = 1;
    for (let row = 0, z = TOWERS.near; z < TOWERS.far; row++, z += TOWERS.cell) {
        const reach = Math.ceil((z * TOWERS.spread + 60) / TOWERS.cell);
        for (let column = -reach; column <= reach; column++) {
            const x = column * TOWERS.cell;
            seed++;
            if (isAvenue(column) || isCrossStreet(row)) continue;
            if (random(seed) < TOWERS.skip) continue;
            let cap = Number.POSITIVE_INFINITY;
            for (const b of Object.values(BOARDS)) {
                if (z > b.z + 15) continue;
                const reach = (z - START_EYE.z) / (b.z - START_EYE.z);
                const onLine = START_EYE.x + (b.x - START_EYE.x) * reach;
                if (Math.abs(x - onLine) >= (b.width / 2) * reach + TOWERS.width[1]) continue;
                const bottom = b.y - b.height / 2 - 1;
                for (const side of [z - TOWERS.width[1] / 2, z + TOWERS.width[1] / 2]) {
                    const along = Math.min(1, (side - START_EYE.z) / (b.z - START_EYE.z));
                    cap = Math.min(cap, START_EYE.y + (bottom - START_EYE.y) * along - STREET - CAP_MARGIN);
                }
            }
            if (cap < TOWERS.height[0] / 2) continue;
            const width = THREE.MathUtils.lerp(TOWERS.width[0], TOWERS.width[1], random(seed * 3.1));
            const depth = THREE.MathUtils.lerp(TOWERS.width[0], TOWERS.width[1], random(seed * 5.7));
            const tall = random(seed * 7.3) ** 2.4;
            const height = Math.min(
                cap,
                THREE.MathUtils.lerp(TOWERS.height[0], TOWERS.height[1], tall) * (1 + (z / TOWERS.far) * (TOWERS.tallFar - 1)),
            );
            const jitter = (TOWERS.cell - width) * (random(seed * 9.9) - 0.5);
            towers.push({
                x: x + jitter,
                z: z + (random(seed * 2.3) - 0.5) * 6,
                width,
                depth,
                height,
                seed: random(seed * 1.9),
                capped: cap < Number.POSITIVE_INFINITY,
            });
        }
    }
    return towers;
}

function blocksOf(tower: Tower): Block[] {
    const blocks: Block[] = [];
    const r = (k: number) => random(tower.seed * 1000 + k);
    let [width, depth, base] = [tower.width, tower.depth, 0];
    let height = tower.height;
    const tiered = !tower.capped && tower.height > TIERS.from && r(1) < TIERS.chance;
    if (tiered) height = tower.height * 0.65;
    blocks.push({ x: tower.x, z: tower.z, base, width, depth, height, seed: tower.seed });
    // Sunk into the box below so no two faces share a plane and z-fight.
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
    if (!tower.capped && r(6) < TIERS.spire) {
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

function buildings({ at, facing, frame }: Place, towers: Tower[]) {
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
    // positionLocal already includes the instance transform.
    const local = attribute('position', 'vec3').mul(size).toVar();
    const fromSideX = size.x.mul(0.5).sub(abs(local.x));
    const fromSideZ = size.z.mul(0.5).sub(abs(local.z));
    const fromTop = size.y.sub(local.y);

    const across = positionWorld.x.mul(normalWorld.z).sub(positionWorld.z.mul(normalWorld.x));
    const grid = vec2(across.div(WINDOWS.width), positionWorld.y.div(WINDOWS.height));
    const cell = floor(grid);
    const inside = fract(grid);
    const pane = smoothstep(0.06, 0.1, inside.x)
        .mul(smoothstep(0.94, 0.9, inside.x))
        .mul(smoothstep(0.16, 0.2, inside.y))
        .mul(smoothstep(0.9, 0.86, inside.y));
    const offices = hash(seed.add(4.2)).lessThan(0.35);
    const run = floor(cell.x.div(4));
    const unit = select(offices, vec2(run, cell.y), cell);
    const roll = hash(unit.x.mul(13.7).add(unit.y.mul(71.3)).add(seed.mul(101)));
    const darkFloor = step(hash(cell.y.mul(5.1).add(seed)), 0.1);
    const occupancy = mix(WINDOWS.lit[0], WINDOWS.lit[1], hash(seed)).mul(select(offices, float(0.6), float(1)));
    const flickering = hash(roll.mul(999)).lessThan(WINDOWS.flicker);
    const on = step(roll, occupancy)
        .mul(float(1).sub(darkFloor))
        .mul(select(flickering, step(0, sin(time.mul(hash(roll).mul(9).add(2)).add(roll.mul(40)))), float(1)));
    const tone = hash(roll.mul(31.7));
    const warm = mix(vec3(1, 0.62, 0.32), vec3(1, 0.78, 0.5), hash(roll.mul(7.7)));
    const cool = vec3(0.75, 0.97, 0.92);
    const neon = mix(vec3(1, 0.2, 0.75), vec3(0.2, 0.95, 1), hash(seed.mul(3)));
    const tint = select(offices, cool, select(tone.lessThan(0.07), neon, select(tone.lessThan(0.15), vec3(0.35, 0.5, 1), warm)));
    const ceiling = mix(0.45, 1, smoothstep(0.2, 0.85, inside.y));
    const blinds = select(hash(roll.mul(3.3)).lessThan(0.3), sin(inside.y.mul(60)).mul(0.25).add(0.75), float(1));
    const curtain = select(hash(roll.mul(5.9)).lessThan(0.2), smoothstep(0.45, 0.55, inside.x).mul(0.8).add(0.2), float(1));
    const brightness = select(offices, mix(1.1, 1.8, hash(roll.mul(5.1))), mix(0.7, 2, hash(roll.mul(5.1))));
    const light = tint.mul(brightness).mul(ceiling).mul(blinds).mul(curtain);
    const glass = mix(vec3(0.03, 0.02, 0.06), FOG.colour.mul(0.35), smoothstep(-0.2, 0.6, inside.y));

    const material3 = hash(seed.mul(1.7));
    const base = select(
        material3.lessThan(0.4),
        vec3(0.03, 0.032, 0.04),
        select(material3.lessThan(0.75), vec3(0.04, 0.03, 0.028), vec3(0.025, 0.03, 0.045)),
    );
    const height = positionWorld.y.sub(cameraPosition.y.add(STREET));
    const uplight = FACADE.uplight.mul(exp(height.div(-FACADE.uplightFade)));
    const corner = smoothstep(0, FACADE.occlusion, min(fromSideX, fromSideZ)).mul(0.45).add(0.55);
    const panels = mx_noise_float(vec3(across.mul(0.35), positionWorld.y.mul(0.35), seed))
        .mul(0.25)
        .add(1);
    const streaks = mx_noise_float(vec3(across.mul(2.5), positionWorld.y.mul(0.06), seed))
        .mul(0.5)
        .add(0.5);
    const wall = base
        .mul(panels)
        .add(uplight.mul(0.35))
        .add(FACADE.skylight.mul(0.4))
        .add(FOG.colour.mul(pow(streaks, 6).mul(0.25)))
        .mul(corner);
    const slab = smoothstep(0.08, 0.04, inside.y).mul(0.6);
    const windows = mix(glass, light, on);
    const facade = mix(wall, windows, pane.mul(float(1).sub(slab)));
    // Once a window's about a pixel, its pattern only shimmers: show its average glow instead.
    const tiny = smoothstep(0.35, 0.9, max(fwidth(grid.x), fwidth(grid.y)));
    const lit = mix(facade, mix(wall, light, occupancy.mul(0.4)), tiny);
    const roof = base.mul(0.8).add(FACADE.skylight.mul(0.6));

    const strip = (distance: TslNode) => {
        const pixel = fwidth(distance);
        const width = max(float(EDGES.width), pixel);
        return smoothstep(width.add(pixel.mul(0.5)), width.sub(pixel.mul(0.5)), distance).mul(float(EDGES.width).div(width));
    };
    const edge = strip(max(fromSideX, fromSideZ));
    // Corners only, on few towers: outlining every edge made them read as wireframes.
    const outlined = step(hash(seed.add(9.1)), EDGES.chance)
        .mul(edge)
        .mul(smoothstep(0, 6, fromTop));
    const edgeColour = neonPick(hash(seed.add(11.3))).mul(EDGES.brightness);

    const aboveStreet = positionWorld.y.sub(frame.origin.y + STREET);
    const bay = floor(across.div(SHOPS.bay));
    const inBay = fract(across.div(SHOPS.bay));
    const open = step(SHOPS.shuttered, hash(bay.mul(3.3).add(seed.mul(5.1))));
    const glassPane = smoothstep(0.06, 0.1, inBay)
        .mul(smoothstep(0.94, 0.9, inBay))
        .mul(step(0.4, aboveStreet))
        .mul(step(aboveStreet, 4.2));
    const shopLight = mix(vec3(1, 0.78, 0.5), neonPick(hash(bay.add(seed))), step(0.6, hash(bay.mul(7.7).add(seed)))).mul(1.6);
    const shutter = vec3(0.05, 0.045, 0.05).mul(
        step(0.5, fract(aboveStreet.mul(4)))
            .mul(0.4)
            .add(0.8),
    );
    const shopfront = mix(vec3(0.02, 0.018, 0.022), mix(shutter, shopLight, open), glassPane);
    const sign = step(4.6, aboveStreet)
        .mul(step(aboveStreet, 5.3))
        .mul(step(0.35, hash(bay.mul(1.3).add(seed.mul(2.2)))));
    const shops = mix(shopfront, neonPick(hash(bay.mul(9.1).add(seed))).mul(2.4), sign);
    const atStreet = step(aboveStreet, SHOPS.height).mul(select(side, float(1), float(0)));
    const withShops = mix(mix(select(side, lit, roof), edgeColour, outlined), shops, atStreet);

    material.colorNode = fogged(withShops);
    return mesh;
}

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
        matrix.compose(at(x, y + h / 2, tower.z - tower.depth / 2 - 0.4), facing, new THREE.Vector3(w, h, 1));
        mesh.setMatrixAt(i, matrix);
        colours.set(NEON[Math.floor(random(i * 3.3) * NEON.length)], i * 3);
    });
    geometry.setAttribute('signColour', new THREE.InstancedBufferAttribute(colours, 3));

    const colour = attribute('signColour', 'vec3');
    const seed = float(instanceIndex).mul(3.7);
    const st = uv();
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

function holograms({ at, facing }: Place, towers: Tower[]) {
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
    const radius = vec2(st.x.sub(0.5), st.y.sub(0.5).mul(1.6)).length();
    const rings = pow(
        sin(radius.mul(28).sub(time.mul(3)))
            .mul(0.5)
            .add(0.5),
        4,
    ).mul(smoothstep(0.6, 0.1, radius));
    const wipe = fract(st.x.add(st.y).mul(1.5).sub(time.mul(0.25)));
    const pattern = select(kind.lessThan(1), glyphs, select(kind.lessThan(2), rings, smoothstep(0.4, 0.5, wipe)));
    const colour = mix(a, b, select(kind.lessThan(2), st.y, wipe));
    const scan = sin(st.y.mul(160)).mul(0.1).add(0.9);
    const flicker = float(1).sub(step(0.992, hash(floor(time.mul(20)).add(seed.mul(13)))).mul(0.6));
    material.colorNode = fogged(colour.mul(pattern.mul(3).add(0.08)).mul(scan).mul(flicker));
    return mesh;
}

/* moving things */

function traffic({ at, frame }: Place) {
    const geometry = new THREE.BoxGeometry(TRAFFIC.trail, 0.22, 0.5);
    const material = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    const mesh = new THREE.InstancedMesh(geometry, material, TRAFFIC.cars);
    const identity = new THREE.Matrix4();
    for (let i = 0; i < TRAFFIC.cars; i++) mesh.setMatrixAt(i, identity);
    mesh.frustumCulled = false;

    const seed = float(instanceIndex);
    const laneSeed = floor(hash(seed.mul(1.3)).mul(TRAFFIC.lanes)).mul(9.17);
    const height = mix(-30, 60, hash(laneSeed));
    const depth = mix(TRAFFIC.depth[0], TRAFFIC.depth[1], hash(laneSeed.add(3)));
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
    const oriented = vec3(positionLocal.x.mul(direction), positionLocal.y, positionLocal.z);
    material.positionNode = vec3(...frame.x.toArray())
        .mul(oriented.x)
        .add(vec3(0, oriented.y, 0))
        .add(vec3(...frame.z.toArray()).mul(oriented.z))
        .add(placed);
    const front = positionLocal.x.mul(direction).div(TRAFFIC.trail).add(0.5);
    const head = select(forward.greaterThan(0.5), vec3(1, 0.95, 0.85), vec3(1, 0.12, 0.08));
    material.colorNode = head.mul(pow(front, 3).mul(0.85)).mul(exp(positionWorld.sub(cameraPosition).length().mul(-FOG.density)));
    return mesh;
}

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
    const band = step(-0.2, positionLocal.y)
        .mul(step(positionLocal.y, 1.1))
        .mul(step(0.5, fract(positionLocal.x.div(2.2))));
    const sideFace = abs(normalWorld.y).lessThan(0.5);
    material.colorNode = fogged(mix(vec3(0.02, 0.02, 0.03), vec3(0.95, 0.85, 0.65).mul(1.8), select(sideFace, band, float(0))));
    group.add(mesh);

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
    const distance = positionWorld.sub(cameraPosition).length();
    const haze = float(1).sub(exp(distance.mul(-0.0007)));
    material.colorNode = mix(mix(vec3(0.008, 0.006, 0.015), vec3(1, 0.7, 0.45).mul(1.5), lights), FOG.colour, haze.mul(0.75));
    return mesh;
}

function cityXZ({ frame }: Place, p: TslNode): TslNode {
    const from = p.sub(vec3(...frame.origin.toArray()));
    return vec2(from.dot(vec3(...frame.x.toArray())), from.dot(vec3(...frame.z.toArray())));
}

function roads(at: TslNode) {
    const avenueSpacing = TOWERS.cell * STREETS.avenueEvery;
    const crossSpacing = TOWERS.cell * STREETS.crossEvery;
    const acrossAvenue = abs(at.x.sub(floor(at.x.div(avenueSpacing).add(0.5)).mul(avenueSpacing)));
    const alongZ = at.y.sub(TOWERS.near);
    const acrossCross = abs(alongZ.sub(floor(alongZ.div(crossSpacing).add(0.5)).mul(crossSpacing)));
    return { acrossAvenue, acrossCross };
}

function street(place: Place) {
    const material = new MeshBasicNodeMaterial();
    const at = cityXZ(place, positionWorld).toVar();
    const { acrossAvenue, acrossCross } = roads(at);
    const half = STREETS.road / 2;
    const onRoad = max(step(acrossAvenue, half), step(acrossCross, half));
    const onPavement = max(step(acrossAvenue, half + STREETS.pavement), step(acrossCross, half + STREETS.pavement)).mul(
        float(1).sub(onRoad),
    );
    const avenueLine = step(acrossAvenue, 0.15)
        .mul(step(0.5, fract(at.y.div(6))))
        .mul(step(half, acrossCross));
    const crossLine = step(acrossCross, 0.15)
        .mul(step(0.5, fract(at.x.div(6))))
        .mul(step(half, acrossAvenue));
    const zebra = step(acrossAvenue, half)
        .mul(step(acrossCross, half + 3))
        .mul(step(half, acrossCross))
        .mul(step(0.5, fract(at.x.div(1.2))));
    const markings = max(max(avenueLine, crossLine), zebra);

    const puddles = smoothstep(0.1, 0.5, mx_noise_float(vec3(positionWorld.xz.mul(0.03), 0)));
    const asphalt = mix(vec3(0.012, 0.01, 0.016), FOG.low.mul(0.45), puddles.mul(0.6));
    const pavement = vec3(0.03, 0.026, 0.032);
    const lampPhase = abs(fract(max(at.x, at.y).div(STREETS.lampEvery)).sub(0.5));
    const pool = smoothstep(0.25, 0, lampPhase).mul(
        smoothstep(half + STREETS.pavement + 2, half - 1, min(acrossAvenue, acrossCross)),
    );
    const ground = mix(mix(vec3(0.008, 0.007, 0.01), asphalt, onRoad), pavement, onPavement);
    const lit = ground.add(vec3(0.9, 0.85, 0.7).mul(markings.mul(0.12))).add(vec3(1, 0.6, 0.3).mul(pool.mul(0.28)));
    material.colorNode = fogged(lit);
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000).rotateX(-Math.PI / 2), material);
    plane.position.copy(place.at(0, STREET, 0));
    plane.quaternion.copy(place.facing);
    return plane;
}

function streetTraffic({ at, frame }: Place) {
    const geometry = new THREE.BoxGeometry(4.2, 0.6, 1.8);
    const material = new MeshBasicNodeMaterial();
    const mesh = new THREE.InstancedMesh(geometry, material, STREETS.cars);
    const identity = new THREE.Matrix4();
    for (let i = 0; i < STREETS.cars; i++) mesh.setMatrixAt(i, identity);
    mesh.frustumCulled = false;

    // Lanes, each at one speed with its cars in their own spaced slots: nothing can catch up and overlap. Each lane
    // runs from behind the den's tower out into the haze, so the wrap from one end to the other is never seen.
    const lanes = STREETS.roads * 4;
    const perLane = Math.floor(STREETS.cars / lanes);
    const span = STREETS.span;
    const index = float(instanceIndex);
    const laneIndex = floor(index.div(perLane));
    const slot = index.sub(laneIndex.mul(perLane));
    const avenueSpacing = TOWERS.cell * STREETS.avenueEvery;
    const crossSpacing = TOWERS.cell * STREETS.crossEvery;
    const onAvenue = laneIndex.mod(2);
    const direction = floor(laneIndex.div(2)).mod(2).mul(2).sub(1);
    const road = floor(laneIndex.div(4)).sub(STREETS.roads / 2);
    const lane = direction.mul(2.2);
    const speed = mix(STREETS.carSpeed[0], STREETS.carSpeed[1], hash(laneIndex.mul(4.7)));
    const jitter = hash(index.mul(5.3))
        .sub(0.5)
        .mul(STREETS.jitter / span);
    const travel = fract(
        slot
            .div(perLane)
            .add(jitter)
            .add(hash(laneIndex.mul(2.9)))
            .add(time.mul(speed).mul(direction).div(span)),
    ).mul(span);
    const avenueAt = vec2(road.mul(avenueSpacing).add(lane), travel.sub(STREETS.behind));
    const crossAt = vec2(
        travel.sub(span / 2),
        road
            .add(STREETS.roads / 2)
            .mul(crossSpacing)
            .add(TOWERS.near)
            .add(lane),
    );
    const where = mix(crossAt, avenueAt, onAvenue);
    const x = vec3(...frame.x.toArray());
    const z = vec3(...frame.z.toArray());
    const heading = mix(x, z, onAvenue).mul(direction);
    const sideways = mix(z, x, onAvenue);
    material.positionNode = heading
        .mul(positionLocal.x)
        .add(vec3(0, positionLocal.y.add(0.6), 0))
        .add(sideways.mul(positionLocal.z))
        .add(x.mul(where.x))
        .add(z.mul(where.y))
        .add(vec3(...at(0, STREET, 0).toArray()));
    // positionLocal already includes the instance transform.
    const front = attribute('position', 'vec3').x.div(4.2).add(0.5);
    const lights = mix(vec3(1, 0.1, 0.06).mul(4), vec3(1, 0.95, 0.85).mul(5), step(0.5, front));
    const body = vec3(0.02, 0.02, 0.025);
    const end = step(0.42, abs(front.sub(0.5)));
    material.colorNode = fogged(mix(body, lights, end));
    return mesh;
}

function streetLamps({ at, facing }: Place) {
    const spots: THREE.Vector3[] = [];
    const offset = STREETS.road / 2 + STREETS.pavement * 0.6;
    for (const x of avenueXs(700)) {
        for (let z = TOWERS.near; z < 620; z += STREETS.lampEvery)
            for (const side of [-1, 1]) spots.push(at(x + side * offset, STREET + 7, z));
    }
    for (const z of crossStreetZs()) {
        if (z > 620) continue;
        for (let x = -500; x < 500; x += STREETS.lampEvery)
            for (const side of [-1, 1]) spots.push(at(x, STREET + 7, z + side * offset));
    }
    const material = new MeshBasicNodeMaterial();
    material.colorNode = fogged(vec3(1, 0.72, 0.42).mul(3));
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.9, 0.35, 0.9), material, spots.length);
    const matrix = new THREE.Matrix4();
    for (const [i, spot] of spots.entries()) mesh.setMatrixAt(i, matrix.compose(spot, facing, new THREE.Vector3(1, 1, 1)));
    return mesh;
}

function walkers({ at, frame }: Place) {
    const material = new MeshBasicNodeMaterial();
    const mesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.55, 0.55, 0.12, 8), material, STREETS.walkers);
    const identity = new THREE.Matrix4();
    for (let i = 0; i < STREETS.walkers; i++) mesh.setMatrixAt(i, identity);
    mesh.frustumCulled = false;
    const seed = float(instanceIndex);
    const avenueSpacing = TOWERS.cell * STREETS.avenueEvery;
    const road = floor(hash(seed.mul(1.9)).mul(STREETS.roads)).sub(STREETS.roads / 2);
    const side = step(0.5, hash(seed.mul(2.9)))
        .mul(2)
        .sub(1);
    const kerb = side.mul(STREETS.road / 2 + STREETS.pavement * 0.5).add(hash(seed.mul(6.1)).sub(0.5).mul(2));
    const direction = step(0.5, hash(seed.mul(3.7)))
        .mul(2)
        .sub(1);
    const span = 560;
    const travel = fract(
        hash(seed.mul(4.3)).add(
            time
                .mul(mix(0.8, 1.6, hash(seed.mul(5.9))))
                .mul(direction)
                .div(span),
        ),
    ).mul(span);
    const x = vec3(...frame.x.toArray());
    const z = vec3(...frame.z.toArray());
    material.positionNode = positionLocal
        .add(x.mul(road.mul(avenueSpacing).add(kerb)))
        .add(z.mul(travel.add(TOWERS.near)))
        .add(vec3(...at(0, STREET + 2, 0).toArray()));
    material.colorNode = fogged(neonPick(hash(seed.mul(7.3))).mul(2.4));
    return mesh;
}

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

export function fogged(colour: TslNode): TslNode {
    const distance = positionWorld.sub(cameraPosition).length();
    const height = positionWorld.y.sub(cameraPosition.y.add(STREET));
    const low = exp(height.div(-FOG.lowHeight)).min(1);
    const high = smoothstep(FOG.highFrom, FOG.highFrom * 4, height);
    const thickness = pow(distance.mul(FOG.density), FOG.falloff).mul(low.mul(FOG.lowExtra).add(1));
    const haze = mix(mix(FOG.colour, FOG.low, low), FOG.high, high);
    return mix(colour, haze, float(1).sub(exp(thickness.negate())));
}

function smogSky(): TslNode {
    const y = positionWorldDirection.y;
    const glow = pow(smoothstep(0.4, -0.05, y), 1.4);
    return mix(vec3(0.02, 0.015, 0.05), FOG.colour.mul(1.1), glow);
}

/* billboards */

type Board = { x: number; y: number; z: number; width: number; height: number };

function billboards(place: Place, cat: CatVideo, ads: Ads, flipped: boolean) {
    const group = new THREE.Group();
    const st = uv();

    const videoAt = vec2(st.x, flipped ? st.y.oneMinus() : st.y);
    group.add(board(place, BOARDS.cat, texture(cat.target.texture, videoAt).rgb.mul(1.6)));

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

    for (const name of [
        'big',
        'centre',
        'lowRight',
        'upperMiddle',
        'farRight',
        'upperLeft',
        'high',
        'nearRight',
        'lowLeft',
        'tall',
    ] as const) {
        group.add(board(place, BOARDS[name], texture(ads[name].texture, st).rgb.mul(1.7)));
    }

    const stream = texture(cat.profileTarget.texture, videoAt).rgb.mul(1.5);
    const overlay = texture(ads.lofi.texture, st);
    group.add(board(place, BOARDS.lofi, mix(stream, overlay.rgb.mul(1.8), overlay.a)));
    return group;
}

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

// Repainted once the font loads: the canvas can't wait for it.
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
    const blink = sign.blink ? float(1).sub(step(sign.blink, fract(time.mul(0.45))).mul(0.85)) : float(1);
    return lit.mul(2.2).mul(blink);
}

function darkMaterial() {
    const material = new MeshBasicNodeMaterial();
    material.colorNode = fogged(vec3(0.012, 0.01, 0.018));
    return material;
}
