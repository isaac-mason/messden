import { TSL, type TslNode } from 'spark-radix';
import * as THREE from 'three';
import { MeshBasicNodeMaterial, type WebGPURenderer } from 'three/webgpu';
import { CITY_SCALE, type City } from './city';
import type { Flyby } from './flyby';
import type { Focus } from './focus';
import { initRain, type Rain, updateRain } from './rain';
import { FRAME, framePieces, glassSheet, OUT, PANES } from './window-panes';

const {
    abs,
    cameraPosition,
    dot,
    float,
    length,
    max,
    min,
    mix,
    normalize,
    normalWorld,
    positionView,
    positionWorld,
    pow,
    screenUV,
    smoothstep,
    texture,
    uniform,
    uv,
    vec2,
    vec3,
} = TSL;

// The city through rained-on, fogged glass: frosted where it's misted, sharp and lensed through the drops, clear
// down the trails the running drops wipe. The drops themselves are simulated in rain.ts.
const FROST = { radius: 5, taps: 12, lift: vec3(0.025, 0.028, 0.035), tint: vec3(0.88, 0.94, 1) };
// City lights brighter than this flicker as they cross pixels: capped before blurring.
const MAX_LIGHT = 1.4;
const CLEAR = { radius: 1.2, tint: vec3(0.9, 0.96, 1) };
// Out-of-focus blur never wider than this, in city texels: the taps get too sparse past it.
const MAX_DEFOCUS = 24;
// How far a drop's lens bends the view, in screen space, and which way: drops flip what's behind them.
const LENS = 0.05;
// Light catching the top of each drop, from the room's lamps.
const GLINT = { from: vec3(-0.35, 0.5, 0.8), sharpness: 24, strength: 0.6, colour: vec3(1, 0.9, 0.8) };
const SHEEN = { colour: vec3(0.5, 0.6, 0.7), amount: 0.18 };

export type Glass = {
    sheet: THREE.Mesh;
    rain: Rain;
    // The splats' depth of field, so the glass blurs with the room.
    focal: ReturnType<typeof uniform>;
    aperture: ReturnType<typeof uniform>;
    focalPixels: ReturnType<typeof uniform>;
};

export function initGlass(scene: THREE.Scene, city: City, renderer: WebGPURenderer, flyby: Flyby): Glass {
    const { centre, along, into, width, height } = glassSheet();
    const rain = initRain(width, height);

    // A render target's rows run down under WebGPU, up under WebGL; the glass's y runs up.
    const webgpu = renderer.coordinateSystem === THREE.WebGPUCoordinateSystem;
    const at = vec2(screenUV.x, webgpu ? screenUV.y : float(1).sub(screenUV.y));
    const toScreen = (v: TslNode) => vec2(v.x, webgpu ? v.y.negate() : v.y);
    const sample = (where: TslNode) => min(texture(city.target.texture, where).rgb, vec3(MAX_LIGHT));

    // Depth of field, as the splats do it: how wide the glass's blur circle is on screen.
    const focal = uniform(2);
    const aperture = uniform(0);
    const focalPixels = uniform(500);
    const depth = positionView.z.negate().max(0.05).toVar();
    const defocusTexels = min(
        abs(depth.sub(focal)).mul(aperture).mul(focalPixels).div(depth).mul(CITY_SCALE),
        MAX_DEFOCUS,
    ).toVar();

    // The water map: slope across and up in red and green, thickness in blue, coverage in alpha.
    const water = texture(rain.water.texture, uv()).toVar();
    const cover = water.a;
    const slope = water.rg.sub(0.5).mul(2).toVar();
    const wiped = texture(rain.wiped.texture, uv()).a;
    const clear = max(cover, wiped.mul(0.85)).toVar();

    // Frost: a fixed spiral of taps; turning it per pixel looked grainy but twinkled as the city moved behind.
    let frostSum: TslNode = vec3(0);
    for (let i = 0; i < FROST.taps; i++) {
        const angle = i * 2.399963;
        const reach = defocusTexels.add(FROST.radius).mul(Math.sqrt((i + 0.5) / FROST.taps));
        frostSum = frostSum.add(sample(at.add(city.texel.mul(vec2(Math.cos(angle), Math.sin(angle)).mul(reach)))));
    }
    const frosted = frostSum.div(FROST.taps).mul(FROST.tint).add(FROST.lift);

    // Through water: bent the other way, as a lens flips what's behind it, and only a little soft.
    const lensed = at.add(toScreen(slope.mul(cover).mul(-LENS)));
    let clearSum: TslNode = vec3(0);
    for (let i = 0; i < 8; i++) {
        const angle = i * 2.399963;
        const reach = defocusTexels.add(CLEAR.radius).mul(Math.sqrt((i + 0.5) / 8));
        clearSum = clearSum.add(sample(lensed.add(city.texel.mul(vec2(Math.cos(angle), Math.sin(angle)).mul(reach)))));
    }
    const sharp = clearSum.div(8).mul(CLEAR.tint);

    // A drop darkens toward its steep rim, and its top catches the room's light.
    const rim = smoothstep(0.55, 0.95, length(slope)).mul(cover);
    const surface = normalize(vec3(slope.mul(0.9), water.b.add(0.15)));
    const glint = pow(max(dot(surface, normalize(GLINT.from)), 0), GLINT.sharpness)
        .mul(cover)
        .mul(GLINT.strength);
    const seen = mix(frosted, sharp.mul(float(1).sub(rim.mul(0.6))), clear).add(GLINT.colour.mul(glint));

    const facing = abs(dot(normalize(cameraPosition.sub(positionWorld)), normalWorld));
    const sheen = pow(float(1).sub(smoothstep(0, 1, facing)), 3).mul(SHEEN.amount);

    // No depth: the frame's posts sit level with the glass, and must draw over it.
    const material = new MeshBasicNodeMaterial({ depthWrite: false });
    material.colorNode = mix(seen, SHEEN.colour, sheen);

    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
    sheet.quaternion.setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(new THREE.Vector3(...along), new THREE.Vector3(0, 1, 0), new THREE.Vector3(...into)),
    );
    sheet.position.set(centre[0], centre[1], centre[2]);
    // Before the splats, so the room in front of it blends over it.
    sheet.renderOrder = -1;
    scene.add(sheet);
    scene.add(cleanFrame(flyby));
    return { sheet, rain, focal, aperture, focalPixels };
}

const frustum = new THREE.Frustum();
const viewProjection = new THREE.Matrix4();

// Only worth drawing the city when the window's on screen.
export function glassInView(glass: Glass, camera: THREE.Camera): boolean {
    camera.updateMatrixWorld();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    frustum.setFromProjectionMatrix(viewProjection, camera.coordinateSystem);
    return frustum.intersectsObject(glass.sheet);
}

export function updateGlass(
    glass: Glass,
    focus: Focus,
    camera: THREE.PerspectiveCamera,
    renderer: WebGPURenderer,
    dt: number,
): void {
    updateRain(glass.rain, dt);
    glass.focal.value = focus.distance;
    glass.aperture.value = focus.aperture;
    const height = renderer.domElement.height;
    glass.focalPixels.value = height / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
}

// Solid boxes over the capture's ragged frame, from just behind the glass to FRAME.depth into the room: clean lines,
// and the ragged splats behind their faces hidden by depth.
function cleanFrame(flyby: Flyby): THREE.Group {
    const frame = new THREE.Group();
    const material = new MeshBasicNodeMaterial();
    // The room-side faces never see the car: only its bounce off the room reaches them.
    const bounce = (flyby.light.colour as unknown as TslNode).mul(flyby.light.bounce as unknown as TslNode);
    material.colorNode = vec3(0.012, 0.007, 0.005).mul(vec3(1).add(bounce.mul(12)));
    const along = new THREE.Vector3(-OUT[2], 0, OUT[0]);
    const into = new THREE.Vector3(...OUT).negate();
    const origin = new THREE.Vector3(...(PANES[0].corner as [number, number, number]));
    const behind = 0.04;
    const depth = FRAME.depth + behind;
    const rotation = new THREE.Quaternion().setFromRotationMatrix(
        new THREE.Matrix4().makeBasis(along, new THREE.Vector3(0, 1, 0), into),
    );
    for (const piece of framePieces()) {
        const box = new THREE.Mesh(new THREE.BoxGeometry(piece.to - piece.from, piece.top - piece.bottom, depth), material);
        box.quaternion.copy(rotation);
        box.position
            .copy(origin)
            .addScaledVector(along, (piece.from + piece.to) / 2)
            .addScaledVector(into, depth / 2 - behind)
            .setY((piece.bottom + piece.top) / 2);
        frame.add(box);
    }
    return frame;
}
