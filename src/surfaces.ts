import * as THREE from 'three';

export type Surface = 'hard' | 'wool';

export const DEFAULT_SURFACE: Surface = 'hard';

export const VOLUMES: {
    name: string;
    surface: Surface;
    centre: [number, number, number];
    size: [number, number, number];
    yaw: number;
}[] = [{ name: 'bed', surface: 'wool', centre: [-4.53, 0.5, -3.84], size: [2.94, 1, 2.71], yaw: 0.289 }];

// Each volume's turn, worked out once: the lookup runs every frame and shouldn't allocate.
const TURNS = VOLUMES.map((volume) => ({ cos: Math.cos(volume.yaw), sin: Math.sin(volume.yaw) }));

export function surfaceAt(feet: ArrayLike<number>): Surface {
    for (let i = 0; i < VOLUMES.length; i++) {
        const { centre, size, surface } = VOLUMES[i];
        const { cos, sin } = TURNS[i];
        const dx = feet[0] - centre[0];
        const dz = feet[2] - centre[2];
        const x = dx * cos - dz * sin;
        const z = dx * sin + dz * cos;
        if (Math.abs(x) <= size[0] / 2 && Math.abs(feet[1] - centre[1]) <= size[1] / 2 && Math.abs(z) <= size[2] / 2)
            return surface;
    }
    return DEFAULT_SURFACE;
}

export function surfaceVolumes(): THREE.Group {
    const colours: Record<Surface, number> = { hard: 0x9fb3ff, wool: 0xff8fd0 };
    const group = new THREE.Group();
    for (const volume of VOLUMES) {
        const box = new THREE.LineSegments(
            new THREE.EdgesGeometry(new THREE.BoxGeometry(...volume.size)),
            new THREE.LineBasicMaterial({ color: colours[volume.surface] }),
        );
        box.position.set(...volume.centre);
        box.rotation.y = volume.yaw;
        group.add(box);
    }
    group.visible = false;
    return group;
}
