import { TSL, type TslNode } from 'spark-radix';
import * as THREE from 'three';
import { MeshBasicNodeMaterial } from 'three/webgpu';
import { fogged } from './city';
import { glassSheet, OUT } from './window-panes';

const { abs, float, mix, normalWorld, pow, smoothstep, uniform, vec3 } = TSL;

const FLYBY = {
    gap: [2, 5],
    first: 2,
    distance: [5, 10],
    lanes: [
        { height: 1.5, direction: -1 },
        { height: -0.6, direction: 1 },
    ],
    laneJitter: 0.4,
    speed: [22, 34],
    reach: 70,
    brightness: 130,
    bounce: 0.06,
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
    const shade = normalWorld.y.mul(0.5).add(0.5);
    const body = mix(vec3(0.015, 0.015, 0.022), vec3(0.09, 0.09, 0.12), shade).add(
        vec3(0.3, 0.1, 0.3).mul(pow(float(1).sub(abs(normalWorld.y)), 4).mul(0.2)),
    );
    // Side profile, extruded, then pinched in plan: a narrow nose, a slightly narrower tail.
    const profile = (points: [number, number][], depth: number, bevel: number) => {
        const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
        const geometry = new THREE.ExtrudeGeometry(shape, {
            depth,
            bevelEnabled: true,
            bevelThickness: bevel,
            bevelSize: bevel,
            bevelSegments: 4,
            curveSegments: 8,
        }).translate(0, 0, -depth / 2);
        const position = geometry.getAttribute('position');
        for (let i = 0; i < position.count; i++) {
            const x = position.getX(i);
            const pinch =
                x > 0 ? 1 - 0.55 * THREE.MathUtils.smoothstep(x, 0.6, 2.5) : 1 - 0.2 * THREE.MathUtils.smoothstep(-x, 1.4, 2.5);
            position.setZ(i, position.getZ(i) * pinch);
        }
        geometry.computeVertexNormals();
        return geometry;
    };
    // A low wedge: sharp nose, long hood, fastback, a lip of a spoiler at the tail.
    const shell = profile(
        [
            [2.45, -0.02],
            [2.25, 0.16],
            [0.9, 0.36],
            [-0.9, 0.4],
            [-1.95, 0.36],
            [-2.4, 0.52],
            [-2.5, 0.42],
            [-2.35, 0.1],
            [-2.15, -0.26],
            [1.7, -0.3],
            [2.3, -0.2],
        ],
        1.5,
        0.2,
    );
    const gloss = smoothstep(0.55, 0.9, normalWorld.y).mul(0.12);
    add(shell, lit(body.add(gloss)), [0, 0, 0]);
    const glass = vec3(0.04, 0.1, 0.14)
        .add(vec3(0.25, 0.4, 0.5).mul(shade.mul(0.35)))
        .add(vec3(0.6, 0.8, 1).mul(smoothstep(0.6, 0.95, normalWorld.y).mul(0.25)));
    add(
        profile(
            [
                [1.05, 0.34],
                [0.3, 0.76],
                [-0.7, 0.8],
                [-1.5, 0.4],
            ],
            1.1,
            0.1,
        ),
        lit(glass),
        [0, 0, 0],
    );
    // Thruster pods under each flank, glowing out the back in the trim's colour.
    const pod = new THREE.CapsuleGeometry(0.2, 1.5, 4, 10).rotateZ(Math.PI / 2);
    const exhaust = new THREE.CircleGeometry(0.17, 16).rotateY(-Math.PI / 2);
    for (const side of [-1, 1]) {
        add(pod, lit(body), [-0.9, -0.32, side * 0.72]);
        add(exhaust, lit(bright(trim, 1.8) as unknown as TslNode), [-1.86, -0.32, side * 0.72]);
        add(new THREE.BoxGeometry(2.6, 0.035, 0.02), lit(bright(trim, 1.6) as unknown as TslNode), [-0.5, -0.12, side * 0.97]);
    }
    add(
        new THREE.CircleGeometry(1, 24).rotateX(Math.PI / 2),
        lit(bright(glow, 1.3) as unknown as TslNode),
        [0, -0.45, 0],
        [2.1, 1, 0.75],
    );
    add(new THREE.BoxGeometry(0.04, 0.05, 1.3), lit(vec3(2.2, 2.1, 1.9)), [2.42, 0.05, 0]);
    add(new THREE.BoxGeometry(0.04, 0.05, 1.6), lit(vec3(1.8, 0.15, 0.1)), [-2.47, 0.3, 0]);
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
