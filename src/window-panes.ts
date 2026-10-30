// The window's three panes, found with scripts/look.ts: a bottom corner, the edges along and up from it, and how far
// either side of the glass to cut (the capture's glass is a fuzzy layer, and nothing it saw outside is worth keeping).
export type Pane = { corner: number[]; across: number[]; up: number[]; front: number; back: number };

export const SILL = { height: 0.25, front: 0.15 };

export const OUT = [-0.285, 0, -0.959];
export const MARGIN = 0.08;
export const EDGE = { reach: 0.22, front: 0.5, back: 1.5, blueness: 0.08, minBlue: 0.18, paleLight: 0.3, glare: 0.5 };

export const WALL = { origin: [-5.812, 0, -5.385], along: [0.959, 0, -0.285], from: -1.5, to: 5.5, beyond: 0.3 };

export const PANES: Pane[] = [
    { corner: [-5.812, 1.143, -5.385], across: [0.605, 0, -0.18], up: [0, 2.562, 0], front: 0.4, back: 1.5 },
    { corner: [-4.924, 0.894, -5.649], across: [2.04, 0, -0.606], up: [0, 2.822, 0], front: 0.4, back: 1.5 },
    { corner: [-2.608, 1.125, -6.336], across: [0.746, 0, -0.221], up: [0, 2.571, 0], front: 0.4, back: 1.5 },
];

export function insidePane(pane: Pane, point: number[]): boolean {
    const d = [0, 1, 2].map((k) => point[k] - pane.corner[k]);
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const width = Math.hypot(...pane.across);
    const height = Math.hypot(...pane.up);
    const s = dot(d, pane.across) / width;
    const t = dot(d, pane.up) / height;
    if (s < -MARGIN || s > width + MARGIN || t < -MARGIN || t > height + MARGIN) return false;
    const out = dot(d, OUT);
    const front = t < SILL.height ? SILL.front : pane.front;
    return out <= pane.back && out >= -front;
}

export function blueness([r, g, b]: number[]): number {
    return b - Math.max(r, g * 0.6);
}

export function nearPane(pane: Pane, point: number[]): boolean {
    const d = [0, 1, 2].map((k) => point[k] - pane.corner[k]);
    const dot = (a: number[], b: number[]) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const width = Math.hypot(...pane.across);
    const height = Math.hypot(...pane.up);
    const s = dot(d, pane.across) / width;
    const t = dot(d, pane.up) / height;
    const away = dot(d, OUT);
    return (
        s > -EDGE.reach &&
        s < width + EDGE.reach &&
        t > -EDGE.reach &&
        t < height + EDGE.reach &&
        away < EDGE.back &&
        away > -EDGE.front
    );
}

export function beyondWall(point: number[]): boolean {
    const d = [0, 1, 2].map((k) => point[k] - WALL.origin[k]);
    const s = d[0] * WALL.along[0] + d[2] * WALL.along[2];
    const away = d[0] * OUT[0] + d[2] * OUT[2];
    return s > WALL.from && s < WALL.to && away > WALL.beyond;
}

export function cutsSplat(point: number[], colour: number[]): boolean {
    if (beyondWall(point) || PANES.some((pane) => insidePane(pane, point))) return true;
    return isGlassColour(colour) && PANES.some((pane) => nearPane(pane, point));
}

export function isGlassColour(colour: number[]): boolean {
    const [r, g, b] = colour;
    const light = (r + g + b) / 3;
    return (
        (blueness(colour) > EDGE.blueness && b > EDGE.minBlue) ||
        (light > EDGE.paleLight && b >= r) ||
        Math.min(r, g, b) > EDGE.glare
    );
}

export const SHEET = { overlap: 0.12, overlapBelow: 0.2 };

export function glassSheet() {
    const into = [-OUT[0], -OUT[1], -OUT[2]];
    const along = [into[2], 0, -into[0]];
    const origin = PANES[0].corner;
    let [left, right, bottom, top] = [Infinity, -Infinity, Infinity, -Infinity];
    for (const pane of PANES) {
        for (const point of [pane.corner, pane.corner.map((v, k) => v + pane.across[k])]) {
            const s = (point[0] - origin[0]) * along[0] + (point[2] - origin[2]) * along[2];
            left = Math.min(left, s);
            right = Math.max(right, s);
        }
        bottom = Math.min(bottom, pane.corner[1]);
        top = Math.max(top, pane.corner[1] + pane.up[1]);
    }
    left -= SHEET.overlap;
    right += SHEET.overlap;
    bottom -= SHEET.overlapBelow;
    top += SHEET.overlap;
    const middle = (left + right) / 2;
    const centre = [origin[0] + along[0] * middle, (bottom + top) / 2, origin[2] + along[2] * middle];
    return { centre, along, into, width: right - left, height: top - bottom };
}

export const FRAME = { overlap: 0.1, outer: 0.14, depth: 0.12, sill: 0.1, head: 0.14 };

export type FramePiece = { from: number; to: number; bottom: number; top: number };

export function framePieces(): FramePiece[] {
    const origin = PANES[0].corner;
    const along = [-OUT[2], 0, OUT[0]];
    const spans = PANES.map((pane) => {
        const start = (pane.corner[0] - origin[0]) * along[0] + (pane.corner[2] - origin[2]) * along[2];
        return { start, end: start + Math.hypot(...pane.across), bottom: pane.corner[1], top: pane.corner[1] + pane.up[1] };
    });
    const top = Math.min(...spans.map((s) => s.top));
    const bottom = Math.min(...spans.map((s) => s.bottom));
    const { overlap, outer, sill, head } = FRAME;
    const first = spans[0];
    const last = spans[spans.length - 1];
    const pieces: FramePiece[] = [
        { from: first.start - outer, to: first.start + overlap, bottom: bottom - sill, top: top + head },
        { from: last.end - overlap, to: last.end + outer, bottom: bottom - sill, top: top + head },
        { from: first.start - outer, to: last.end + outer, bottom: top - overlap, top: top + head },
    ];
    for (let i = 0; i < spans.length - 1; i++) {
        pieces.push({ from: spans[i].end - overlap, to: spans[i + 1].start + overlap, bottom: bottom - sill, top: top + head });
    }
    for (const span of spans) {
        pieces.push({ from: span.start - overlap, to: span.end + overlap, bottom: bottom - sill, top: span.bottom + overlap });
    }
    return pieces;
}
