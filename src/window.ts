import {
    type AnySplatObject,
    type GpuArrays,
    GpuSplats,
    SplatCollection,
    SplatGenerator,
    type SplatNode,
    TSL,
    type TslNode,
} from 'spark-radix';
import type { Flyby } from './flyby';
import { EDGE, MARGIN, OUT, PANES, SILL, WALL } from './window-panes';

const { abs, dot, float, If, max, min, mix, normalize, smoothstep, sRGBTransferEOTF, sRGBTransferOETF, vec3 } = TSL;

// Share of the car's light added outright, on top of what each surface reflects.
const GLOW = 0.015;
// How big the car's glow is as a light, in metres: the window's shadow edges soften by it with distance.
const PENUMBRA = 0.6;
// Round splats (leaves, fuzz) have no facing: they take this much of the light from any side.
const WRAP = 0.6;

// How squarely a splat faces the light: by its thinnest axis if it's flat, either side, or a soft wrap if it's round.
function facing(splat: SplatNode, toLight: TslNode): TslNode {
    const scales = splat.get('scales').toVar();
    const thinnest = min(scales.x, min(scales.y, scales.z));
    const middle = scales.x
        .add(scales.y)
        .add(scales.z)
        .sub(thinnest)
        .sub(max(scales.x, max(scales.y, scales.z)));
    const flat = thinnest.div(middle.max(1e-6)).oneMinus().sub(0.35).div(0.45).clamp(0, 1);
    return mix(float(WRAP), abs(dot(GpuSplats.normalOf(splat), toLight)), flat);
}

// The den's splats, less the window's, lit by any car passing close outside, through the panes only.
export function cutWindow(arrays: GpuArrays, flyby: Flyby): AnySplatObject {
    const stored = SplatGenerator.fromSplats();
    const out = vec3(...OUT);

    // Unrolled over the panes rather than looped: a TSL Loop here has silently broken meshes before.
    // 1 where a splat is the window's to cut: in a pane's slab, or near one and glass-coloured (see window-panes.ts).
    const inWindow = (centre: TslNode, rgb: TslNode): TslNode => {
        const [r, g, b] = [rgb.x, rgb.y, rgb.z];
        const glass = b
            .sub(max(r, g.mul(0.6)))
            .greaterThan(EDGE.blueness)
            .and(b.greaterThan(EDGE.minBlue))
            .or(r.add(g).add(b).div(3).greaterThan(EDGE.paleLight).and(b.greaterThanEqual(r)))
            .or(min(r, min(g, b)).greaterThan(EDGE.glare));
        const fromWall = centre.sub(vec3(...WALL.origin)).toVar();
        const alongWall = fromWall.dot(vec3(...WALL.along));
        const beyond = alongWall
            .greaterThan(WALL.from)
            .and(alongWall.lessThan(WALL.to))
            .and(fromWall.dot(out).greaterThan(WALL.beyond));
        let inside: TslNode = beyond.select(float(1), float(0));
        for (const pane of PANES) {
            const width = Math.hypot(...pane.across);
            const height = Math.hypot(...pane.up);
            const d = centre.sub(vec3(...pane.corner)).toVar();
            const s = d.dot(vec3(...pane.across.map((v) => v / width))).toVar();
            const t = d.dot(vec3(...pane.up.map((v) => v / height))).toVar();
            const away = d.dot(out).toVar();
            const front = t.lessThan(SILL.height).select(float(SILL.front), float(pane.front));
            const hit = s
                .greaterThan(-MARGIN)
                .and(s.lessThan(width + MARGIN))
                .and(t.greaterThan(-MARGIN))
                .and(t.lessThan(height + MARGIN))
                .and(away.lessThan(pane.back))
                .and(away.greaterThan(front.negate()));
            const near = s
                .greaterThan(-EDGE.reach)
                .and(s.lessThan(width + EDGE.reach))
                .and(t.greaterThan(-EDGE.reach))
                .and(t.lessThan(height + EDGE.reach))
                .and(away.lessThan(EDGE.back))
                .and(away.greaterThan(-EDGE.front))
                .and(glass);
            inside = inside.max(hit.or(near).select(float(1), float(0)));
        }
        return inside;
    };

    const lightFrom = flyby.light.position as unknown as TslNode;
    const lightColour = flyby.light.colour as unknown as TslNode;
    const lightBrightness = flyby.light.brightness as unknown as TslNode;
    const lightBounce = flyby.light.bounce as unknown as TslNode;

    return SplatCollection.object({
        count: arrays.count,
        data: { splats: arrays },
        generator: {
            generateSplat(index: TslNode) {
                const splat = stored.generateSplat?.(index).toVar() as SplatNode;
                If(inWindow(splat.get('center'), splat.get('rgb')).greaterThan(0), () => {
                    splat.get('opacity').assign(0);
                });
                If(lightBrightness.greaterThan(0), () => {
                    const centre = splat.get('center');
                    const toCar = lightFrom.sub(centre);
                    const reaching = lightBrightness
                        .div(toCar.dot(toCar).max(4))
                        .mul(throughGlass(lightFrom, centre))
                        .mul(facing(splat, normalize(toCar)));
                    // Light off a surface takes its colour: lift the splat's own colour, in linear light, plus a
                    // little of the light's own so the den's near-black corners still catch the neon.
                    const albedo = sRGBTransferEOTF(max(splat.get('rgb'), vec3(0)));
                    const lit = albedo
                        .mul(vec3(1).add(lightColour.mul(reaching.add(lightBounce))))
                        .add(lightColour.mul(reaching).mul(GLOW));
                    splat.get('rgb').assign(sRGBTransferOETF(min(lit, vec3(1))));
                });
                return splat;
            },
            bind(data: { splats: GpuArrays }) {
                stored.bind?.(data);
            },
        },
    });
}

// How much of the line from the car to a point passes through glass: 1 through a pane, 0 through wall or frame.
export function throughGlass(from: TslNode, to: TslNode): TslNode {
    const out = vec3(...OUT);
    let through: TslNode = float(0);
    for (const pane of PANES) {
        const width = Math.hypot(...pane.across);
        const height = Math.hypot(...pane.up);
        const corner = vec3(...pane.corner);
        const ray = to.sub(from).toVar();
        const along = corner.sub(from).dot(out).div(ray.dot(out));
        const hit = from.add(ray.mul(along)).sub(corner).toVar();
        const s = hit.dot(vec3(...pane.across.map((v) => v / width)));
        const t = hit.dot(vec3(...pane.up.map((v) => v / height)));
        // Softer the further the light carries past the glass, against how far the car is from it.
        const soft = float(1).sub(along).div(along.max(0.05)).mul(PENUMBRA).clamp(0.01, 0.35).toVar();
        // `soft` is a node: its arithmetic has to be too.
        through = through.max(
            smoothstep(soft.negate(), soft, s)
                .mul(smoothstep(soft.add(width), soft.negate().add(width), s))
                .mul(smoothstep(soft.negate(), soft, t))
                .mul(smoothstep(soft.add(height), soft.negate().add(height), t)),
        );
    }
    return through;
}
