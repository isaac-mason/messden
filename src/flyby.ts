import { TSL, type TslNode } from 'spark-radix';
import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { fogged } from './city';
import { glassSheet, OUT } from './window-panes';

const { abs, float, mix, normalWorld, pow, uniform, vec3 } = TSL;

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

const WINDOW_CENTRE = new THREE.Vector3(...glassSheet().centre);

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
    const lit = (colour: TslNode) => {
        const material = new MeshBasicNodeMaterial();
        material.colorNode = fogged(colour);
        return material;
    };
    const add = (
        geometry: THREE.BufferGeometry,
        material: MeshBasicNodeMaterial,
        at: [number, number, number],
        scale: [number, number, number] = [1, 1, 1],
    ) => {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(...at);
        mesh.scale.set(...scale);
        car.add(mesh);
    };
    // Facing +x: a long tapered body, shaded lighter on top with a rim of the city's glow; a tinted canopy; neon strips
    // along its flanks; the underglow; headlights ahead, a taillight bar behind.
    const shade = normalWorld.y.mul(0.5).add(0.5);
    const body = mix(vec3(0.015, 0.015, 0.022), vec3(0.09, 0.09, 0.12), shade).add(
        vec3(0.3, 0.1, 0.3).mul(pow(float(1).sub(abs(normalWorld.y)), 4).mul(0.2)),
    );
    const hull = new THREE.CapsuleGeometry(0.62, 3.4, 6, 12).rotateZ(Math.PI / 2);
    add(hull, lit(body), [0, 0, 0], [1, 0.62, 1.25]);
    add(
        new THREE.SphereGeometry(0.7, 16, 10),
        lit(vec3(0.05, 0.12, 0.16).add(vec3(0.2, 0.3, 0.35).mul(shade.mul(0.4)))),
        [-0.2, 0.38, 0],
        [1.6, 0.5, 0.85],
    );
    const strip = new THREE.CapsuleGeometry(0.035, 3.6, 2, 6).rotateZ(Math.PI / 2);
    add(strip, lit(bright(trim, 5) as unknown as TslNode), [0, 0.02, 0.79]);
    add(strip, lit(bright(trim, 5) as unknown as TslNode), [0, 0.02, -0.79]);
    add(
        new THREE.CircleGeometry(1, 24).rotateX(Math.PI / 2),
        lit(bright(glow, 4) as unknown as TslNode),
        [0, -0.42, 0],
        [2.2, 1, 0.75],
    );
    add(new THREE.SphereGeometry(0.13, 8, 6), lit(vec3(6, 5.6, 5)), [2.25, 0.02, 0.45]);
    add(new THREE.SphereGeometry(0.13, 8, 6), lit(vec3(6, 5.6, 5)), [2.25, 0.02, -0.45]);
    add(new THREE.CapsuleGeometry(0.06, 1.1, 2, 6).rotateX(Math.PI / 2), lit(vec3(4, 0.3, 0.2)), [-2.3, 0.08, 0]);
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
    const away = flyby.car.position.distanceTo(WINDOW_CENTRE);
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
