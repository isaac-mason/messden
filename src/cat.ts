import { TSL } from 'spark-radix';
import * as THREE from 'three';
import { MeshStandardNodeMaterial, RenderTarget, type WebGPURenderer } from 'three/webgpu';

const { mix, screenUV, vec3 } = TSL;

// A low-poly calico sitting on the asphalt in big headphones, eyes shut, vibing to an iPod lying beside it: its own
// little scene, filmed into a small portrait target each frame for a billboard in the city to show.

export const CAT_VIDEO = { width: 216, height: 280 };
const BPM = 96;
const COLOURS = {
    // A calico: white, with patches of orange and black.
    fur: 0xf7f1ea,
    orange: 0xf08a3a,
    black: 0x2b2428,
    inner: 0xffa3bf,
    closedEye: 0x2a2026,
    blush: 0xff8fb0,
    whisker: 0x9a95a0,
    nose: 0xff7aa2,
    headphones: 0xf8f6fa,
    ipod: 0xd9dde4,
    screen: 0x5fb0ff,
    ground: 0x7a7a80,
};

export type CatVideo = {
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    target: RenderTarget;
    head: THREE.Group;
    body: THREE.Group;
    tail: THREE.Group;
};

export function initCatVideo(): CatVideo {
    const scene = new THREE.Scene();
    scene.backgroundNode = mix(vec3(0.3, 0.3, 0.33), vec3(0.5, 0.5, 0.53), screenUV.y.oneMinus());
    const camera = new THREE.PerspectiveCamera(34, CAT_VIDEO.width / CAT_VIDEO.height, 0.1, 50);
    // A little to its left and above, the whole cat and the iPod in frame.
    camera.position.set(-1.7, 1.9, 6);
    camera.lookAt(-0.1, 1.15, 0.2);
    const target = new RenderTarget(CAT_VIDEO.width, CAT_VIDEO.height, { type: THREE.HalfFloatType });

    // Faceted on purpose: flat shading, few faces.
    const shape = (
        geometry: THREE.BufferGeometry,
        colour: number,
        at: [number, number, number],
        scale: [number, number, number] = [1, 1, 1],
        glow = 0,
    ) => {
        const material = new MeshStandardNodeMaterial({ color: colour, flatShading: true, roughness: 0.7 });
        if (glow) {
            material.emissive.setHex(colour);
            material.emissiveIntensity = glow;
        }
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(...at);
        mesh.scale.set(...scale);
        return mesh;
    };

    const ground = shape(new THREE.CircleGeometry(8, 9), COLOURS.ground, [0, 0, 0]);
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // Sitting up: an egg of a body, haunches behind, a white chest, two white front paws.
    const body = new THREE.Group();
    body.add(
        shape(new THREE.IcosahedronGeometry(1, 1), COLOURS.fur, [0, 0.82, 0], [0.62, 0.84, 0.58]),
        shape(new THREE.IcosahedronGeometry(0.4, 1), COLOURS.orange, [0.28, 1.05, -0.25], [1, 1.2, 0.8]),
        shape(new THREE.IcosahedronGeometry(0.34, 1), COLOURS.fur, [-0.36, 0.34, -0.08], [0.9, 0.95, 1.2]),
        shape(new THREE.IcosahedronGeometry(0.34, 1), COLOURS.orange, [0.36, 0.34, -0.08], [0.9, 0.95, 1.2]),
        shape(new THREE.IcosahedronGeometry(0.14, 1), COLOURS.fur, [-0.16, 0.1, 0.46], [1, 0.8, 1.3]),
        shape(new THREE.IcosahedronGeometry(0.14, 1), COLOURS.fur, [0.16, 0.1, 0.46], [1, 0.8, 1.3]),
    );
    // The tail, curled round its feet along the ground.
    const tail = new THREE.Group();
    tail.position.set(0.55, 0.12, -0.2);
    // Many overlapping pieces, so it reads as one curl, banded orange and black.
    for (let i = 0; i < 14; i++) {
        const along = i / 13;
        const angle = along * Math.PI * 0.8;
        const colour = Math.floor(i / 3) % 2 ? COLOURS.black : COLOURS.orange;
        const at: [number, number, number] = [Math.cos(angle) * 0.28 - 0.05, 0, Math.sin(angle) * 0.72];
        tail.add(shape(new THREE.IcosahedronGeometry(0.13 - along * 0.05, 1), colour, at));
    }
    body.add(tail);

    // The head pivots at the neck, so it nods.
    const head = new THREE.Group();
    head.position.set(0, 1.62, 0.12);
    // A big head on a small body reads as a kitten.
    head.scale.setScalar(1.25);
    const ear = (side: number, colour: number) => {
        // Up and forward, standing in front of the headphone band rather than hidden under it.
        const outer = shape(new THREE.ConeGeometry(0.26, 0.44, 5), colour, [side * 0.36, 0.7, 0.16]);
        outer.rotation.set(0.25, 0, side * -0.32);
        const inner = shape(new THREE.ConeGeometry(0.15, 0.27, 5), COLOURS.inner, [side * 0.35, 0.67, 0.27]);
        inner.rotation.set(0.25, 0, side * -0.32);
        return [outer, inner];
    };
    head.add(
        shape(new THREE.IcosahedronGeometry(0.62, 1), COLOURS.fur, [0, 0.15, 0], [1.15, 0.98, 0.95]),
        shape(new THREE.IcosahedronGeometry(0.36, 1), COLOURS.orange, [-0.3, 0.32, 0.3], [1, 0.9, 0.55]),
        shape(new THREE.IcosahedronGeometry(0.34, 1), COLOURS.black, [0.34, 0.44, 0.14], [1, 0.8, 0.6]),
        shape(new THREE.IcosahedronGeometry(0.13, 1), COLOURS.fur, [-0.08, -0.08, 0.53], [1, 0.75, 0.75]),
        shape(new THREE.IcosahedronGeometry(0.13, 1), COLOURS.fur, [0.08, -0.08, 0.53], [1, 0.75, 0.75]),
        shape(new THREE.ConeGeometry(0.045, 0.045, 3), COLOURS.nose, [0, 0.0, 0.64], [1, -1, 0.8]),
        ...ear(-1, COLOURS.orange),
        ...ear(1, COLOURS.black),
    );
    // Eyes shut, content: two little downward curves, rosy cheeks, whiskers.
    for (const side of [-1, 1]) {
        const eye = shape(new THREE.TorusGeometry(0.085, 0.018, 4, 10, Math.PI), COLOURS.closedEye, [side * 0.22, 0.17, 0.53]);
        eye.rotation.z = Math.PI;
        head.add(eye);
        head.add(shape(new THREE.IcosahedronGeometry(0.08, 1), COLOURS.blush, [side * 0.36, 0.0, 0.46], [1, 0.6, 0.3], 0.4));
        for (const lift of [-0.1, 0, 0.1]) {
            const whisker = shape(new THREE.CylinderGeometry(0.004, 0.004, 0.38, 3), COLOURS.whisker, [
                side * 0.32,
                -0.07 + lift * 0.4,
                0.55,
            ]);
            whisker.rotation.z = Math.PI / 2 + side * lift * 1.6;
            head.add(whisker);
        }
    }
    // Big white headphones.
    head.add(shape(new THREE.TorusGeometry(0.74, 0.07, 5, 14, Math.PI), COLOURS.headphones, [0, 0.17, 0]));
    for (const side of [-1, 1]) {
        const cup = shape(new THREE.CylinderGeometry(0.24, 0.24, 0.2, 10), COLOURS.headphones, [side * 0.72, 0.1, 0]);
        cup.rotation.z = Math.PI / 2;
        head.add(cup);
    }
    body.add(head);
    scene.add(body);

    // The iPod, lying on the asphalt beside it, its cable running up to the headphones.
    const ipod = new THREE.Group();
    ipod.position.set(-0.55, 0.04, 1.05);
    ipod.rotation.set(-Math.PI / 2, 0, 0.5);
    ipod.add(
        shape(new THREE.BoxGeometry(0.4, 0.64, 0.07), COLOURS.ipod, [0, 0, 0]),
        shape(new THREE.PlaneGeometry(0.3, 0.2), COLOURS.screen, [0, 0.15, 0.036], [1, 1, 1], 1.2),
        shape(new THREE.RingGeometry(0.05, 0.12, 10), 0xffffff, [0, -0.12, 0.037]),
    );
    scene.add(ipod);
    const cable = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-0.5, 0.06, 0.75),
        new THREE.Vector3(-0.55, 0.05, 0.35),
        new THREE.Vector3(-0.75, 0.9, 0.2),
        new THREE.Vector3(-0.75, 1.75, 0.1),
        new THREE.Vector3(-0.78, 2.0, 0.12),
    ]);
    scene.add(shape(new THREE.TubeGeometry(cable, 40, 0.015, 4), COLOURS.headphones, [0, 0, 0]));

    // Overcast daylight, as in the street.
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(-2, 4, 3);
    // A soft fill from the front, and light bouncing up off the asphalt, so no side goes black.
    const fill = new THREE.DirectionalLight(0xfff4ea, 1.1);
    fill.position.set(0.5, 1.2, 5);
    scene.add(sun, fill, new THREE.HemisphereLight(0xe6eaf4, 0x8a8690, 1.6));

    return { scene, camera, target, head, body, tail };
}

// Vibing: a soft nod on each beat, a slow sway, a little rock of the body, the tail's tip twitching.
export function poseCat(video: CatVideo, seconds: number): void {
    const beats = seconds * (BPM / 60);
    const nod = (1 - (beats % 1)) ** 2;
    video.head.rotation.x = 0.16 * nod - 0.05;
    video.head.rotation.z = Math.sin(beats * Math.PI * 0.5) * 0.14;
    video.head.rotation.y = Math.sin(beats * Math.PI * 0.25) * 0.12;
    video.body.rotation.z = Math.sin(beats * Math.PI * 0.5) * 0.03;
    video.tail.rotation.y = Math.sin(seconds * 1.3) * 0.12;
}

export function renderCatVideo(video: CatVideo, renderer: WebGPURenderer, seconds: number): void {
    poseCat(video, seconds);
    renderer.setRenderTarget(video.target);
    renderer.render(video.scene, video.camera);
    renderer.setRenderTarget(null);
}
