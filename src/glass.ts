import { TSL, type TslNode } from '@sparkjsdev/radix';
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
    perspectiveDepthToViewZ,
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

const FROST = { lift: vec3(0.025, 0.028, 0.035), tint: vec3(0.88, 0.94, 1) };
const DEPTH_FROST = { near: 0.35, from: 3, to: 80 };
const MIST = { close: 0.3, across: 0.65, dropsGone: 0.6, liftMore: 1.6, near: 1.5, far: 6 };
// City light past white is capped before blurring: blurred, it spreads into halos that read as bloom.
const MAX_LIGHT = 1;
const CLEAR = { tint: vec3(0.9, 0.96, 1) };
const MAX_DEFOCUS = 24;
// A drop's lens flips what's behind it.
const LENS = 0.05;
const GLINT = { from: vec3(-0.35, 0.5, 0.8), sharpness: 24, strength: 0.6, colour: vec3(1, 0.9, 0.8) };
const SHEEN = { colour: vec3(0.5, 0.6, 0.7), amount: 0.18 };

export type Glass = {
    sheet: THREE.Mesh;
    rain: Rain;
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

    const focal = uniform(2);
    const aperture = uniform(0);
    const focalPixels = uniform(500);
    const depth = positionView.z.negate().max(0.05).toVar();
    const defocusTexels = min(
        abs(depth.sub(focal)).mul(aperture).mul(focalPixels).div(depth).mul(CITY_SCALE),
        MAX_DEFOCUS,
    ).toVar();

    const water = texture(rain.water.texture, uv()).toVar();
    const cover = water.a;
    const slope = water.rg.sub(0.5).mul(2).toVar();
    const wiped = texture(rain.wiped.texture, uv()).a;
    const clear = max(cover, wiped.mul(0.85)).toVar();

    const plain = (where: TslNode) => min(texture(city.target.texture, where).rgb, vec3(MAX_LIGHT));
    const frostedBy = (where: TslNode, amount: TslNode) =>
        mix(
            mix(plain(where), texture(city.frost.light.texture, where).rgb, smoothstep(0, 0.5, amount)),
            texture(city.frost.heavy.texture, where).rgb,
            smoothstep(0.5, 1, amount),
        );
    const focusBlur = defocusTexels.div(MAX_DEFOCUS);

    const behindDepth = texture(city.target.depthTexture as THREE.DepthTexture, at).r;
    const behind = perspectiveDepthToViewZ(behindDepth, city.camera.near, city.camera.far).negate().sub(depth).max(0);
    const deep = mix(float(DEPTH_FROST.near), float(1), smoothstep(DEPTH_FROST.from, DEPTH_FROST.to, behind));
    const away = smoothstep(MIST.near, MIST.far, cameraPosition.sub(positionWorld).length());
    const amount = max(deep.mul(mix(float(MIST.close), float(MIST.across), away)), focusBlur);
    const lift = FROST.lift.mul(mix(float(1), float(MIST.liftMore), away));
    const frosted = frostedBy(at, amount).mul(FROST.tint).add(lift);

    const lensed = at.add(toScreen(slope.mul(cover).mul(-LENS)));
    const sharp = frostedBy(lensed, focusBlur).mul(CLEAR.tint);

    const rim = smoothstep(0.55, 0.95, length(slope)).mul(cover);
    const surface = normalize(vec3(slope.mul(0.9), water.b.add(0.15)));
    const glint = pow(max(dot(surface, normalize(GLINT.from)), 0), GLINT.sharpness)
        .mul(cover)
        .mul(GLINT.strength);
    const drops = float(1).sub(away.mul(MIST.dropsGone));
    const seen = mix(frosted, sharp.mul(float(1).sub(rim.mul(0.6))), clear.mul(drops)).add(GLINT.colour.mul(glint).mul(drops));

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

function cleanFrame(flyby: Flyby): THREE.Group {
    const frame = new THREE.Group();
    const material = new MeshBasicNodeMaterial();
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
