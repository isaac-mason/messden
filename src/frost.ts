import { TSL, type TslNode } from 'spark-radix';
import * as THREE from 'three';
import { NodeMaterial, QuadMesh, RenderTarget, type WebGPURenderer } from 'three/webgpu';

const { min, texture, uniform, uv, vec2, vec3, vec4 } = TSL;

// A dual-Kawase blur of the city into a light and a heavy frost.

// Past white, light blurs into halos that read as bloom.
const MAX_LIGHT = 1;

type Pass = { quad: QuadMesh; target: RenderTarget; texel: TslNode & { value: THREE.Vector2 }; from: number; to: number };

export type Frost = {
    light: RenderTarget;
    heavy: RenderTarget;
    passes: Pass[];
};

export function initFrost(source: THREE.Texture): Frost {
    const passes: Pass[] = [];
    const pass = (input: THREE.Texture, from: number, to: number, shade: (input: THREE.Texture, texel: TslNode) => TslNode) => {
        const texel = uniform(new THREE.Vector2()) as TslNode & { value: THREE.Vector2 };
        const material = new NodeMaterial();
        material.fragmentNode = vec4(shade(input, texel), 1);
        const target = new RenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
        passes.push({ quad: new QuadMesh(material), target, texel, from, to });
        return target.texture;
    };

    const down = (input: THREE.Texture, texel: TslNode) => {
        const at = uv();
        const half = texel.mul(0.5);
        const take = (offset: TslNode) => min(texture(input, at.add(offset)).rgb, vec3(MAX_LIGHT));
        return take(vec2(0))
            .mul(4)
            .add(take(half))
            .add(take(half.negate()))
            .add(take(vec2(half.x, half.y.negate())))
            .add(take(vec2(half.x.negate(), half.y)))
            .div(8);
    };
    const up = (input: THREE.Texture, texel: TslNode) => {
        const at = uv();
        const half = texel.mul(0.5);
        const take = (x: number, y: number) => texture(input, at.add(half.mul(vec2(x, y)))).rgb;
        return take(-2, 0)
            .add(take(2, 0))
            .add(take(0, -2))
            .add(take(0, 2))
            .add(take(-1, -1).add(take(1, -1)).add(take(-1, 1)).add(take(1, 1)).mul(2))
            .div(12);
    };

    const half = pass(source, 1, 1 / 2, down);
    const quarter = pass(half, 1 / 2, 1 / 4, down);
    pass(quarter, 1 / 4, 1 / 2, up);
    const light = passes[passes.length - 1].target;
    const eighth = pass(quarter, 1 / 4, 1 / 8, down);
    const sixteenth = pass(eighth, 1 / 8, 1 / 16, down);
    const upEighth = pass(sixteenth, 1 / 16, 1 / 8, up);
    const upQuarter = pass(upEighth, 1 / 8, 1 / 4, up);
    pass(upQuarter, 1 / 4, 1 / 2, up);
    const heavy = passes[passes.length - 1].target;
    return { light, heavy, passes };
}

export function resizeFrost(frost: Frost, width: number, height: number): void {
    const size = (scale: number, of: number) => Math.max(1, Math.round(of * scale));
    for (const pass of frost.passes) {
        pass.target.setSize(size(pass.to, width), size(pass.to, height));
        pass.texel.value.set(1 / size(pass.from, width), 1 / size(pass.from, height));
    }
}

export function renderFrost(frost: Frost, renderer: WebGPURenderer): void {
    for (const pass of frost.passes) {
        renderer.setRenderTarget(pass.target);
        pass.quad.render(renderer);
    }
    renderer.setRenderTarget(null);
}
