import { TSL } from 'spark-radix';
import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { glassSheet, OUT } from './window-panes';

const { uniform, vec3 } = TSL;

// Every few seconds a neon car streaks past close outside, its underglow lighting the room through the window.
const FLYBY = {
    gap: [2, 5],
    first: 2,
    distance: [5, 10],
    // Two lanes, as seen looking out: a high one heading left, a low one heading right (along the wall is to the right).
    lanes: [
        { height: 1.5, direction: -1 },
        { height: -0.6, direction: 1 },
    ],
    laneJitter: 0.4,
    speed: [22, 34],
    reach: 70,
    // Light at a splat is colour × brightness / distance², through the panes only.
    brightness: 130,
    // A faint fill of the car's colour over the whole room, as its light spills off what it hits; strongest close by.
    bounce: 0.06,
    // Each car wears two: one on its strips and light bar, the other underneath, lighting the room.
    neon: [
        [1, 0.08, 0.55],
        [0.05, 0.9, 1],
        [0.55, 1, 0.1],
        [0.55, 0.15, 1],
        [1, 0.45, 0.08],
    ],
};

export type Flyby = {
    car: THREE.Group;
    /** The underglow, as the room sees it: where, what colour, how bright (0 when no car is near). */
    light: {
        position: ReturnType<typeof uniform>;
        colour: ReturnType<typeof uniform>;
        brightness: ReturnType<typeof uniform>;
        bounce: ReturnType<typeof uniform>;
    };
    glow: ReturnType<typeof uniform>;
    trim: ReturnType<typeof uniform>;
    pass: { from: THREE.Vector3; direction: THREE.Vector3; speed: number; elapsed: number } | null;
    wait: number;
};

export function initFlyby(): Flyby {
    const glow = uniform(new THREE.Vector3(1, 0.15, 0.7));
    const trim = uniform(new THREE.Vector3(0.05, 0.9, 1));
    const bright = (colour: ReturnType<typeof uniform>, amount: number) =>
        (colour as unknown as { mul(n: number): ReturnType<typeof uniform> }).mul(amount);
    const car = new THREE.Group();
    const part = (
        size: [number, number, number],
        colour: THREE.Vector3 | ReturnType<typeof uniform>,
        at: [number, number, number],
    ) => {
        const material = new MeshBasicNodeMaterial();
        material.colorNode = colour instanceof THREE.Vector3 ? vec3(colour.x, colour.y, colour.z) : colour;
        const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
        mesh.position.set(...at);
        car.add(mesh);
    };
    // Facing +x: body, cabin, neon strips down each side and a light bar on the roof, the underglow, headlights ahead,
    // taillights behind.
    part([4.6, 0.9, 2], new THREE.Vector3(0.02, 0.02, 0.03), [0, 0, 0]);
    part([2.2, 0.6, 1.7], new THREE.Vector3(0.05, 0.08, 0.12), [-0.3, 0.7, 0]);
    part([4.4, 0.06, 0.04], bright(trim, 6), [0, 0.15, 1.01]);
    part([4.4, 0.06, 0.04], bright(trim, 6), [0, 0.15, -1.01]);
    part([1.6, 0.05, 0.08], bright(trim, 6), [-0.3, 1.02, 0]);
    part([4.2, 0.12, 1.8], bright(glow, 5), [0, -0.5, 0]);
    part([0.15, 0.25, 0.45], new THREE.Vector3(6, 5.6, 5), [2.32, 0.1, 0.6]);
    part([0.15, 0.25, 0.45], new THREE.Vector3(6, 5.6, 5), [2.32, 0.1, -0.6]);
    part([0.12, 0.2, 1.6], new THREE.Vector3(4, 0.3, 0.2), [-2.32, 0.15, 0]);
    car.visible = false;

    return {
        car,
        light: { position: uniform(new THREE.Vector3()), colour: glow, brightness: uniform(0), bounce: uniform(0) },
        glow,
        trim,
        pass: null,
        wait: FLYBY.first,
    };
}

export function updateFlyby(flyby: Flyby, dt: number): void {
    if (!flyby.pass) {
        flyby.wait -= dt;
        if (flyby.wait > 0) return;
        startPass(flyby);
    }
    const pass = flyby.pass as NonNullable<Flyby['pass']>;
    pass.elapsed += dt;
    const travelled = pass.elapsed * pass.speed;
    if (travelled > FLYBY.reach * 2) {
        flyby.pass = null;
        flyby.car.visible = false;
        flyby.light.brightness.value = 0;
        flyby.light.bounce.value = 0;
        flyby.wait = THREE.MathUtils.randFloat(FLYBY.gap[0], FLYBY.gap[1]);
        return;
    }
    flyby.car.position.copy(pass.from).addScaledVector(pass.direction, travelled);
    (flyby.light.position.value as THREE.Vector3).copy(flyby.car.position).y -= 0.6;
    flyby.light.brightness.value = FLYBY.brightness;
    const { centre } = glassSheet();
    const away = flyby.car.position.distanceTo(new THREE.Vector3(...centre));
    flyby.light.bounce.value = FLYBY.bounce * Math.min(1, 36 / (away * away));
}

function startPass(flyby: Flyby) {
    const { centre, along } = glassSheet();
    const wall = new THREE.Vector3(...along);
    const lane = FLYBY.lanes[Math.floor(Math.random() * FLYBY.lanes.length)];
    const sign = lane.direction;
    const direction = wall.clone().multiplyScalar(sign);
    const from = new THREE.Vector3(...centre)
        .addScaledVector(new THREE.Vector3(...OUT), THREE.MathUtils.randFloat(FLYBY.distance[0], FLYBY.distance[1]))
        .addScaledVector(direction, -FLYBY.reach);
    from.y += lane.height + THREE.MathUtils.randFloatSpread(FLYBY.laneJitter * 2);
    flyby.pass = { from, direction, speed: THREE.MathUtils.randFloat(FLYBY.speed[0], FLYBY.speed[1]), elapsed: 0 };
    const first = Math.floor(Math.random() * FLYBY.neon.length);
    const second = (first + 1 + Math.floor(Math.random() * (FLYBY.neon.length - 1))) % FLYBY.neon.length;
    (flyby.glow.value as THREE.Vector3).fromArray(FLYBY.neon[first]);
    (flyby.trim.value as THREE.Vector3).fromArray(FLYBY.neon[second]);
    flyby.car.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), direction);
    flyby.car.visible = true;
}
