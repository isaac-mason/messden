import * as THREE from 'three';

type Draw = (context: CanvasRenderingContext2D, seconds: number, width: number, height: number) => void;

// An ad, drawn at its own size and frame rate: screens of a different shape letterbox it.
type Ad = { draw: Draw; width: number; height: number; fps: number; poster?: boolean };

export type Screen = {
    texture: THREE.CanvasTexture;
    context: CanvasRenderingContext2D;
    ads: Ad[];
    each: number;
    offset: number;
    drawnAt: number;
    clear: boolean;
};

export type Ads = Record<
    'big' | 'centre' | 'lowRight' | 'upperMiddle' | 'farRight' | 'upperLeft' | 'high' | 'nearRight' | 'lowLeft' | 'tall' | 'lofi',
    Screen
>;

// At most this many screens redrawn and uploaded in one frame, so they never all land together as a hitch.
const DRAWS_PER_FRAME = 2;
const STATIC = 0.25;

const FONT = '"Paper Mono", ui-monospace, monospace';
const SANS = '"Helvetica Neue", Arial, sans-serif';

const wide = (draw: Draw, fps = 12): Ad => ({ draw, width: 320, height: 180, fps, poster: true });
const box = (draw: Draw, fps = 10): Ad => ({ draw, width: 300, height: 200, fps, poster: true });
const tall = (draw: Draw, fps = 10): Ad => ({ draw, width: 300, height: 360, fps, poster: true });

export function initAds(): Ads {
    return {
        big: screen(320, 180, 15, [{ draw: dvd(), width: 480, height: 270, fps: 24 }, wide(ramen), wide(pizza)]),
        centre: screen(320, 180, 11, [wide(dumplings), wide(boba), wide(sushi)]),
        lowRight: screen(320, 180, 13, [wide(latte), wide(cupNoodles), wide(hotcakes)]),
        upperMiddle: screen(320, 180, 9, [wide(takoyaki), wide(hotPot), wide(donut)]),
        farRight: screen(320, 180, 14, [{ ...wide(update, 8), poster: false }, wide(tacos), wide(yakitori)]),
        upperLeft: screen(320, 180, 12, [wide(scoops), wide(matcha), wide(curry)]),
        high: screen(300, 200, 16, [box(fortune), box(onigiri), box(bao)]),
        nearRight: screen(300, 200, 10, [box(breakfast), box(popcorn), box(bread)]),
        lowLeft: screen(300, 200, 12, [box(shavedIce), box(bento), box(dango)]),
        tall: screen(300, 364, 17, [{ ...tall(captcha, 12), poster: false }, tall(softServe), tall(vending)]),
        lofi: screen(320, 180, Number.POSITIVE_INFINITY, [{ ...wide(lofiOverlay, 4), poster: false }], true),
    };
}

export function updateAds(ads: Ads, seconds: number): void {
    let draws = 0;
    const due = Object.values(ads)
        .filter((screen) => seconds - screen.drawnAt >= 1 / current(screen, seconds).ad.fps)
        .sort((a, b) => a.drawnAt - b.drawnAt);
    for (const screen of due) {
        if (draws++ >= DRAWS_PER_FRAME) break;
        screen.drawnAt = seconds;
        const { ad, since } = current(screen, seconds);
        const { context } = screen;
        const { width, height } = context.canvas;
        context.setTransform(1, 0, 0, 1, 0, 0);
        if (screen.clear) context.clearRect(0, 0, width, height);
        else {
            context.fillStyle = '#000';
            context.fillRect(0, 0, width, height);
        }
        if (screen.ads.length > 1 && since < STATIC) noise(context, width, height);
        else {
            const scale = Math.min(width / ad.width, height / ad.height);
            context.setTransform(scale, 0, 0, scale, (width - ad.width * scale) / 2, (height - ad.height * scale) / 2);
            context.save();
            context.beginPath();
            context.rect(0, 0, ad.width, ad.height);
            context.clip();
            adWidth = ad.width;
            ad.draw(context, since, ad.width, ad.height);
            if (ad.poster) finish(context, ad.width, ad.height);
            context.restore();
        }
        screen.texture.needsUpdate = true;
    }
}

function current(screen: Screen, seconds: number) {
    const turn = (seconds + screen.offset) / screen.each;
    const index = Number.isFinite(turn) ? Math.floor(turn) % screen.ads.length : 0;
    const since = Number.isFinite(turn) ? (turn - Math.floor(turn)) * screen.each : seconds;
    return { ad: screen.ads[index], since };
}

function screen(width: number, height: number, each: number, ads: Ad[], clear = false): Screen {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d') as CanvasRenderingContext2D;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return { texture, context, ads, each, offset: Math.random() * each * ads.length, drawnAt: -1, clear };
}

function noise(context: CanvasRenderingContext2D, width: number, height: number) {
    for (let y = 0; y < height; y += 6) {
        for (let x = 0; x < width; x += 8) {
            const v = Math.floor(Math.random() * 200);
            context.fillStyle = `rgb(${v}, ${v}, ${v})`;
            context.fillRect(x, y, 8, 6);
        }
    }
}

function label(
    context: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    font: string,
    colour: string,
    align: CanvasTextAlign = 'center',
) {
    context.font = font;
    context.fillStyle = colour;
    context.textAlign = align;
    context.textBaseline = 'middle';
    context.fillText(text, x, y);
}

function backdrop(context: CanvasRenderingContext2D, width: number, height: number, top: string, bottom: string) {
    const fill = context.createLinearGradient(0, 0, 0, height);
    fill.addColorStop(0, top);
    fill.addColorStop(1, bottom);
    context.fillStyle = fill;
    context.fillRect(0, 0, width, height);
}

/* the DVD logo */

function dvd(): Draw {
    const logo = { width: 132, height: 66 };
    const state = { x: 40, y: 30, vx: 61, vy: 43, hue: 200, last: 0, cornerAt: -10 };
    const confetti = Array.from({ length: 60 }, () => ({
        x: Math.random(),
        speed: 40 + Math.random() * 120,
        hue: Math.random() * 360,
        wobble: Math.random() * 6,
    }));
    return (context, seconds, width, height) => {
        const dt = Math.max(0, Math.min(0.1, seconds - state.last));
        state.last = seconds;
        state.x += state.vx * dt;
        state.y += state.vy * dt;
        let walls = 0;
        if (state.x < 0 || state.x > width - logo.width) {
            state.vx = -state.vx;
            state.x = Math.min(Math.max(state.x, 0), width - logo.width);
            walls++;
        }
        if (state.y < 0 || state.y > height - logo.height) {
            state.vy = -state.vy;
            state.y = Math.min(Math.max(state.y, 0), height - logo.height);
            walls++;
        }
        if (walls) state.hue = (state.hue + 70 + Math.random() * 140) % 360;
        // Close enough to both walls at once counts: it has to happen now and then.
        const nearX = Math.min(state.x, width - logo.width - state.x) < 6;
        const nearY = Math.min(state.y, height - logo.height - state.y) < 6;
        if (walls && nearX && nearY && seconds - state.cornerAt > 4) state.cornerAt = seconds;

        context.fillStyle = '#000';
        context.fillRect(0, 0, width, height);
        const colour = `hsl(${state.hue}, 100%, 60%)`;
        context.fillStyle = colour;
        context.font = `italic 900 54px ${SANS}`;
        context.textAlign = 'center';
        context.textBaseline = 'alphabetic';
        context.fillText('DVD', state.x + logo.width / 2, state.y + 44);
        context.beginPath();
        context.ellipse(state.x + logo.width / 2, state.y + 55, logo.width * 0.42, 10, 0, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#000';
        context.font = `bold 11px ${SANS}`;
        context.fillText('V I D E O', state.x + logo.width / 2, state.y + 59);

        const since = seconds - state.cornerAt;
        if (since < 3.5) {
            for (const bit of confetti) {
                context.fillStyle = `hsl(${bit.hue}, 100%, 60%)`;
                const y = (since * bit.speed) % height;
                context.fillRect(bit.x * width + Math.sin(since * bit.wobble) * 8, y, 6, 9);
            }
            context.fillStyle = `hsl(${(seconds * 400) % 360}, 100%, 65%)`;
            context.font = `900 46px ${SANS}`;
            context.textBaseline = 'middle';
            context.fillText('CORNER!!', width / 2, height / 2);
        }
    };
}

/* select all dumplings */

const DUMPLING_TILES = [1, 6, 7, 10, 14];
// A curled-up cat, which is not a dumpling.
const CAT_TILE = 3;
function captcha(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    const loop = seconds % 9;
    context.fillStyle = '#fff';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#1a73e8';
    context.fillRect(8, 8, width - 16, 74);
    context.fillStyle = '#fff';
    context.textAlign = 'left';
    context.textBaseline = 'top';
    context.font = `15px ${SANS}`;
    context.fillText('Select all squares with', 20, 18);
    context.font = `bold 26px ${SANS}`;
    context.fillText('dumplings', 20, 40);

    const grid = { x: 8, y: 88, size: (width - 16) / 4 };
    for (let i = 0; i < 16; i++) {
        const gx = grid.x + (i % 4) * grid.size;
        const gy = grid.y + Math.floor(i / 4) * grid.size;
        context.fillStyle = (i + Math.floor(i / 4)) % 2 ? '#e9d3a8' : '#dcc08c';
        context.fillRect(gx + 1, gy + 1, grid.size - 2, grid.size - 2);
        const cx = gx + grid.size / 2;
        const cy = gy + grid.size / 2 + 4;
        if (DUMPLING_TILES.includes(i)) {
            context.fillStyle = '#fbf3e4';
            context.beginPath();
            context.ellipse(cx, cy, 24, 16, 0, Math.PI, 0);
            context.lineTo(cx + 24, cy + 4);
            context.lineTo(cx - 24, cy + 4);
            context.fill();
            context.strokeStyle = '#d9c6a6';
            context.lineWidth = 2;
            for (let pleat = -2; pleat <= 2; pleat++) {
                context.beginPath();
                context.moveTo(cx + pleat * 7, cy - 15);
                context.lineTo(cx + pleat * 6, cy - 6);
                context.stroke();
            }
        } else if (i === CAT_TILE) {
            context.fillStyle = '#fbf3e4';
            context.beginPath();
            context.ellipse(cx, cy, 24, 15, 0, 0, Math.PI * 2);
            context.fill();
            context.beginPath();
            context.moveTo(cx + 10, cy - 10);
            context.lineTo(cx + 14, cy - 22);
            context.lineTo(cx + 19, cy - 9);
            context.fill();
            context.strokeStyle = '#333';
            context.lineWidth = 1.5;
            context.beginPath();
            context.arc(cx + 8, cy - 2, 3, 0, Math.PI);
            context.stroke();
        }
        const order = [...DUMPLING_TILES, CAT_TILE].indexOf(i);
        if (order >= 0 && loop > 1 + order * 0.9) {
            context.fillStyle = 'rgba(26, 115, 232, 0.35)';
            context.fillRect(gx + 1, gy + 1, grid.size - 2, grid.size - 2);
            context.fillStyle = '#1a73e8';
            context.beginPath();
            context.arc(gx + 14, gy + 14, 10, 0, Math.PI * 2);
            context.fill();
            context.strokeStyle = '#fff';
            context.lineWidth = 3;
            context.beginPath();
            context.moveTo(gx + 9, gy + 14);
            context.lineTo(gx + 13, gy + 18);
            context.lineTo(gx + 20, gy + 10);
            context.stroke();
        }
    }
    if (loop > 7) {
        context.fillStyle = '#d93025';
        context.font = `bold 15px ${SANS}`;
        context.textAlign = 'center';
        context.fillText('Please try again.', width / 2, height - 22);
    }
}

/* lo-fi beats to veg to */

function lofiOverlay(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    context.clearRect(0, 0, width, height);
    const shade = context.createLinearGradient(0, height * 0.55, 0, height);
    shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0.75)');
    context.fillStyle = shade;
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#fff';
    context.textAlign = 'left';
    context.textBaseline = 'alphabetic';
    context.font = `500 17px ${FONT}`;
    context.fillText('lo-fi beats to veg to', 14, height - 18);
    const live = Math.floor(seconds * 2) % 2 === 0;
    context.fillStyle = live ? '#ff2244' : '#a01428';
    context.beginPath();
    context.roundRect(12, 12, 52, 20, 4);
    context.fill();
    context.fillStyle = '#fff';
    context.font = `bold 12px ${SANS}`;
    context.fillText('● LIVE', 17, 27);
    context.font = `12px ${SANS}`;
    context.fillText(`${(24061 + Math.floor(Math.sin(seconds * 0.3) * 40)).toLocaleString()} watching`, 72, 27);
}

/* updating */

function update(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    context.fillStyle = '#0a4aa8';
    context.fillRect(0, 0, width, height);
    const cx = width / 2;
    const cy = 52;
    context.fillStyle = '#fff';
    for (let i = 0; i < 5; i++) {
        const angle = seconds * 3.2 - i * 0.32 - Math.sin(seconds * 3.2 - i * 0.32) * 0.6;
        context.globalAlpha = 1 - i * 0.15;
        context.beginPath();
        context.arc(cx + Math.cos(angle) * 18, cy + Math.sin(angle) * 18, 2.6, 0, Math.PI * 2);
        context.fill();
    }
    context.globalAlpha = 1;
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = `16px ${SANS}`;
    const step = 3 + Math.floor(seconds / 6);
    context.fillText(`Installing update ${step} of 847`, cx, 100);
    context.font = `12px ${SANS}`;
    context.fillText("Don't turn off your city.", cx, 126);
    context.fillText('This will take a while.', cx, 144);
}

/* food */

const WARM = '#fff1d6';
let adWidth = 320;

function steam(context: CanvasRenderingContext2D, seconds: number, x: number, y: number, spread = 26, rise = 50) {
    context.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    context.lineWidth = 3;
    context.lineCap = 'round';
    for (let i = -1; i <= 1; i++) {
        const phase = (seconds * 0.8 + i * 0.33 + 1) % 1;
        context.globalAlpha = Math.sin(phase * Math.PI);
        context.beginPath();
        for (let k = 0; k <= 8; k++) {
            const up = (k / 8) * rise;
            const px = x + i * (spread / 2) + Math.sin(k * 0.9 + seconds * 3 + i) * 5;
            const py = y - up - phase * 14;
            if (k) context.lineTo(px, py);
            else context.moveTo(px, py);
        }
        context.stroke();
    }
    context.globalAlpha = 1;
}

const FACES = {
    serif: (size: number) => `italic 700 ${size}px Didot, "Bodoni 72", Georgia, serif`,
    script: (size: number) => `700 ${Math.round(size * 1.25)}px "Snell Roundhand", "Brush Script MT", cursive`,
    slab: (size: number) => `800 ${size}px Rockwell, "American Typewriter", serif`,
    rounded: (size: number) => `${size}px "Arial Rounded MT Bold", "Nunito", sans-serif`,
    condensed: (size: number) => `800 ${size}px "Avenir Next Condensed", "Arial Narrow", sans-serif`,
    typewriter: (size: number) => `700 ${size}px "American Typewriter", "Courier New", monospace`,
};
type Face = keyof typeof FACES;

function sign(
    context: CanvasRenderingContext2D,
    title: string,
    line: string,
    x: number,
    y: number,
    colour = WARM,
    align: CanvasTextAlign = 'left',
    face: Face = 'slab',
) {
    const room = align === 'left' ? adWidth - x - 14 : adWidth - 40;
    const shown = face === 'script' ? title.toLowerCase().replace(/(^|\s|\n)\S/g, (c) => c.toUpperCase()) : title;
    const lines = shown.split('\n');
    context.font = FACES[face](26);
    const widest = Math.max(...lines.map((text) => context.measureText(text).width));
    const size = Math.min(26, Math.floor((26 * room) / widest));
    const step = size * (face === 'script' ? 1.15 : 1.02);
    const top = y - ((lines.length - 1) * step) / 2;
    for (const [i, text] of lines.entries()) label(context, text, x, top + i * step, FACES[face](size), colour, align);
    const below = top + (lines.length - 1) * step + size * 0.7 + 8;
    context.fillStyle = colour;
    context.globalAlpha = 0.6;
    context.fillRect(align === 'left' ? x : x - 14, below, 28, 1.5);
    context.globalAlpha = 0.85;
    context.letterSpacing = '1.5px';
    context.font = `600 10px ${SANS}`;
    const fit = Math.min(10, Math.floor((10 * room) / context.measureText(line.toUpperCase()).width));
    label(context, line.toUpperCase(), x, below + 12, `600 ${fit}px ${SANS}`, colour, align);
    context.letterSpacing = '0px';
    context.globalAlpha = 1;
}

function pattern(context: CanvasRenderingContext2D, width: number, height: number, kind: 'dots' | 'rays' | 'stripes' | 'grid') {
    context.save();
    context.globalCompositeOperation = 'soft-light';
    context.fillStyle = 'rgba(255, 255, 255, 0.55)';
    context.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    if (kind === 'dots') {
        for (let y = 8; y < height; y += 16)
            for (let x = (y / 16) % 2 ? 8 : 16; x < width; x += 16) disc(context, x, y, 2.2, 2.2, context.fillStyle as string);
    } else if (kind === 'rays') {
        for (let i = 0; i < 24; i += 2) {
            context.beginPath();
            context.moveTo(width * 0.3, height * 0.55);
            context.arc(width * 0.3, height * 0.55, width * 1.5, (i / 24) * Math.PI * 2, ((i + 1) / 24) * Math.PI * 2);
            context.fill();
        }
    } else if (kind === 'stripes') {
        context.lineWidth = 10;
        for (let x = -height; x < width; x += 28) {
            context.beginPath();
            context.moveTo(x, height);
            context.lineTo(x + height, 0);
            context.stroke();
        }
    } else {
        context.lineWidth = 1;
        context.beginPath();
        for (let x = 0; x < width; x += 20) {
            context.moveTo(x, 0);
            context.lineTo(x, height);
        }
        for (let y = 0; y < height; y += 20) {
            context.moveTo(0, y);
            context.lineTo(width, y);
        }
        context.stroke();
    }
    context.restore();
}

// A printed poster's finish: a soft vignette and a double inset frame that reads on light and dark alike.
function finish(context: CanvasRenderingContext2D, width: number, height: number) {
    const shade = context.createRadialGradient(
        width / 2,
        height / 2,
        Math.min(width, height) * 0.35,
        width / 2,
        height / 2,
        Math.max(width, height) * 0.7,
    );
    shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    shade.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
    context.fillStyle = shade;
    context.fillRect(0, 0, width, height);
    context.lineWidth = 1.5;
    context.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    context.beginPath();
    context.roundRect(7, 7, width - 14, height - 14, 6);
    context.stroke();
    context.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    context.beginPath();
    context.roundRect(8.5, 8.5, width - 17, height - 17, 5);
    context.stroke();
}

function disc(context: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, colour: string) {
    context.fillStyle = colour;
    context.beginPath();
    context.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
    context.fill();
}

function bowl(context: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string, inside: string) {
    disc(context, x, y, r, r * 0.3, inside);
    context.fillStyle = colour;
    context.beginPath();
    context.ellipse(x, y, r, r * 0.85, 0, 0, Math.PI);
    context.fill();
}

function ramen(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    backdrop(context, width, height, '#5a0f12', '#2a0608');
    pattern(context, width, height, 'rays');
    for (let i = 0; i < 5; i++) {
        context.fillStyle = i % 2 ? '#1c2b4a' : '#22355a';
        context.fillRect(i * 64, 0, 62, 28 + Math.sin(seconds * 2 + i) * 2);
    }
    bowl(context, 96, 110, 62, '#e8e1d4', '#c9822f');
    disc(context, 74, 106, 12, 7, '#fff8e6');
    disc(context, 74, 106, 6, 4, '#ffb21a');
    context.fillStyle = '#123a1c';
    context.fillRect(108, 92, 22, 14);
    const lift = (Math.sin(seconds * 1.6) + 1) * 18;
    context.strokeStyle = '#f5d78a';
    context.lineWidth = 2;
    for (let i = 0; i < 4; i++) {
        context.beginPath();
        context.moveTo(92 + i * 4, 106);
        context.quadraticCurveTo(100 + i * 4, 90 - lift, 104 + i * 3, 70 - lift);
        context.stroke();
    }
    context.strokeStyle = '#8b5a2b';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(96, 66 - lift);
    context.lineTo(150, 30 - lift);
    context.moveTo(108, 70 - lift);
    context.lineTo(158, 40 - lift);
    context.stroke();
    steam(context, seconds, 96, 86);
    sign(context, "AUNTIE MEI'S\nRAMEN", 'open till 4am', 182, 82, WARM, 'left', 'serif');
}

function pizza(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    context.fillStyle = '#1d0f08';
    context.fillRect(0, 0, width, height);
    pattern(context, width, height, 'stripes');
    disc(context, 90, 100, 70, 70, '#d9902f');
    disc(context, 90, 100, 60, 60, '#f3c34a');
    for (const [x, y] of [
        [70, 80],
        [110, 76],
        [60, 118],
        [100, 124],
        [124, 104],
    ])
        disc(context, x, y, 8, 8, '#b8321f');
    const pull = (Math.sin(seconds * 1.4) + 1) * 22;
    context.fillStyle = '#1d0f08';
    context.beginPath();
    context.moveTo(90, 100);
    context.arc(90, 100, 72, -0.45, 0.25);
    context.fill();
    context.save();
    context.translate(pull, -pull * 0.3);
    context.fillStyle = '#f3c34a';
    context.beginPath();
    context.moveTo(94, 100);
    context.arc(94, 100, 60, -0.45, 0.25);
    context.fill();
    disc(context, 136, 96, 8, 8, '#b8321f');
    context.restore();
    context.strokeStyle = '#fbe08a';
    context.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
        context.beginPath();
        context.moveTo(150, 88 + i * 8);
        context.quadraticCurveTo(150 + pull / 2, 100 + i * 8 + pull / 4, 152 + pull, 86 + i * 8 - pull * 0.3);
        context.stroke();
    }
    sign(context, "BIG SAL'S\nSLICE\nSHACK", 'hot at 2am', 200, 80, WARM, 'left', 'slab');
}

function dumplings(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    backdrop(context, width, height, '#3b2412', '#1d1108');
    pattern(context, width, height, 'dots');
    const t = seconds % 6;
    const open = Math.min(1, Math.max(0, (t - 1.5) * 2)) * (t < 5 ? 1 : Math.max(0, 1 - (t - 5) * 2));
    disc(context, 100, 128, 74, 22, '#a36b2c');
    context.fillStyle = '#c48a42';
    context.fillRect(26, 108, 148, 20);
    disc(context, 100, 108, 74, 22, '#e7cf9d');
    for (const [x, y] of [
        [74, 104],
        [104, 100],
        [130, 108],
        [92, 116],
    ]) {
        disc(context, x, y, 16, 10, '#fbf3e4');
        disc(context, x, y - 5, 10, 5, '#ffffff');
    }
    if (open > 0.3) steam(context, seconds, 100, 94, 60, 60);
    context.save();
    context.translate(100 + open * 60, 96 - open * 50);
    context.rotate(open * 0.5);
    disc(context, 0, 0, 76, 24, '#c48a42');
    disc(context, 0, -4, 66, 18, '#d8a35a');
    context.restore();
    sign(context, "GRANDMA\nLU'S\nDUMPLINGS", 'folded by hand', 196, 70, WARM, 'left', 'serif');
}

function boba(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    backdrop(context, width, height, '#ffd1dc', '#ffb3c6');
    pattern(context, width, height, 'dots');
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.moveTo(60, 50);
    context.lineTo(140, 50);
    context.lineTo(130, 168);
    context.lineTo(70, 168);
    context.fill();
    context.fillStyle = 'rgba(255, 255, 255, 0.35)';
    context.fillRect(64, 50, 72, 6);
    const sip = Math.max(0, Math.sin(seconds * 2));
    for (let i = 0; i < 14; i++) {
        const x = 76 + (i % 5) * 12 + Math.sin(seconds * 2 + i) * 2;
        const y = 158 - Math.floor(i / 5) * 10 - (i === 7 ? sip * 70 : 0);
        disc(context, x, y, 5, 5, '#3a1f12');
    }
    context.fillStyle = '#ff5c8a';
    context.fillRect(104, 18, 10, 140);
    sign(context, "JESSIE'S\nBUBBLE TEA\nPALACE", 'brown sugar forever', 170, 74, '#5a1f32', 'left', 'rounded');
}

function sushi(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    context.fillStyle = '#10232b';
    context.fillRect(0, 0, width, height);
    sign(context, "KENJI'S SPINNING SUSHI", 'round and round', width / 2, 34, WARM, 'center', 'condensed');
    context.fillStyle = '#5c6770';
    context.fillRect(0, 118, width, 34);
    const fish = ['#ff7a59', '#ff4d4d', '#ffd166', '#f4a3b4'];
    for (let i = 0; i < 6; i++) {
        const x = ((i * 70 + seconds * 40) % (width + 70)) - 35;
        disc(context, x, 128, 28, 9, i % 2 ? '#d14b4b' : '#3a7bd5');
        disc(context, x, 124, 18, 6, '#fbf8f0');
        disc(context, x, 118, 18, 6, fish[i % fish.length]);
    }
}

function latte(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    backdrop(context, width, height, '#2b1a12', '#1a0f0a');
    const t = Math.min(1, (seconds % 7) / 4);
    disc(context, 90, 96, 70, 70, '#f1e6d6');
    disc(context, 90, 96, 56, 56, '#8a5a35');
    context.fillStyle = '#f6ead8';
    context.beginPath();
    const size = 30 * t;
    context.moveTo(90, 96 + size);
    context.bezierCurveTo(90 - size * 1.6, 96, 90 - size * 0.6, 96 - size * 1.2, 90, 96 - size * 0.4);
    context.bezierCurveTo(90 + size * 0.6, 96 - size * 1.2, 90 + size * 1.6, 96, 90, 96 + size);
    context.fill();
    steam(context, seconds, 90, 40, 30, 30);
    sign(context, 'NIGHT OWL\nCOFFEE CO.', 'open late, like you', 184, 80, WARM, 'left', 'typewriter');
}

function cupNoodles(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    context.fillStyle = '#ffcf33';
    context.fillRect(0, 0, width, height);
    pattern(context, width, height, 'rays');
    context.fillStyle = '#fff';
    context.beginPath();
    context.moveTo(40, 50);
    context.lineTo(130, 50);
    context.lineTo(120, 160);
    context.lineTo(50, 160);
    context.fill();
    context.fillStyle = '#e63946';
    context.fillRect(44, 86, 82, 26);
    label(context, 'NOODLE', 85, 100, `900 15px ${SANS}`, '#fff');
    const left = Math.max(0, 180 - Math.floor((seconds % 9) * 30));
    const ready = left === 0;
    const lid = ready ? 0.9 : 0;
    context.save();
    context.translate(40, 50);
    context.rotate(-lid);
    context.fillStyle = '#d9d9d9';
    context.fillRect(-4, -6, 98, 8);
    context.restore();
    if (ready) steam(context, seconds, 85, 40);
    label(
        context,
        ready ? 'READY!' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`,
        226,
        72,
        `900 40px ${FONT}`,
        '#3a1a00',
    );
    label(context, 'just add hot water', 226, 120, `14px ${SANS}`, '#3a1a00');
}

function hotcakes(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    backdrop(context, width, height, '#5b2a86', '#2d1446');
    pattern(context, width, height, 'dots');
    disc(context, 92, 150, 76, 16, '#f2f2f2');
    for (let i = 0; i < 3; i++) {
        disc(context, 92, 140 - i * 18, 62, 16, '#b8752e');
        disc(context, 92, 134 - i * 18, 62, 16, '#e7a75a');
    }
    const melt = (seconds % 5) / 5;
    context.fillStyle = '#fff1a8';
    context.fillRect(80 - melt * 6, 90 + melt * 4, 24 + melt * 12, 12 - melt * 8);
    context.strokeStyle = '#7a3a12';
    context.lineWidth = 5;
    context.lineCap = 'round';
    for (const x of [48, 120, 140]) {
        context.beginPath();
        context.moveTo(x, 100);
        context.lineTo(x, 100 + melt * 40 + (x % 3) * 6);
        context.stroke();
    }
    sign(context, "DOLLY'S\nHOTCAKE\nHOUSE", 'served all night', 184, 76, WARM, 'left', 'script');
}

function takoyaki(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    backdrop(context, width, height, '#1e1e24', '#0d0d10');
    pattern(context, width, height, 'grid');
    context.fillStyle = '#333';
    context.fillRect(20, 60, 150, 100);
    for (let i = 0; i < 6; i++) {
        const x = 50 + (i % 3) * 45;
        const y = 90 + Math.floor(i / 3) * 42;
        const flip = Math.abs(Math.sin(seconds * 2 + i));
        disc(context, x, y, 18, 18 * (0.4 + flip * 0.6), '#d68b3a');
        disc(context, x, y - 4, 10, 4, '#5a2a12');
        context.fillStyle = '#f4d7a1';
        context.fillRect(x - 6 + Math.sin(seconds * 6 + i) * 2, y - 10, 4, 6);
    }
    sign(context, "TAKO\nTONY'S", 'flipped fresh', 190, 76, WARM, 'left', 'rounded');
}

function hotPot(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    backdrop(context, width, height, '#2a0d0d', '#140606');
    pattern(context, width, height, 'rays');
    disc(context, 96, 100, 74, 60, '#555');
    context.fillStyle = '#c1271b';
    context.beginPath();
    context.ellipse(96, 100, 64, 50, 0, Math.PI / 2, Math.PI * 1.5);
    context.fill();
    context.fillStyle = '#f2e3c6';
    context.beginPath();
    context.ellipse(96, 100, 64, 50, 0, -Math.PI / 2, Math.PI / 2);
    context.fill();
    for (let i = 0; i < 10; i++) {
        const r = ((seconds * 2 + i * 0.37) % 1) * 7;
        const side = i % 2 ? -1 : 1;
        context.strokeStyle = side < 0 ? '#ff7a59' : '#fff';
        context.lineWidth = 1.5;
        context.beginPath();
        context.arc(96 + side * (16 + ((i * 13) % 34)), 80 + ((i * 17) % 44), r, 0, Math.PI * 2);
        context.stroke();
    }
    steam(context, seconds, 96, 50, 60, 40);
    sign(context, "BUBBLING\nBOB'S\nHOT POT", 'spicy · not spicy', 184, 76, WARM, 'left', 'slab');
}

function donut(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    backdrop(context, width, height, '#7de2d1', '#3fb8af');
    pattern(context, width, height, 'dots');
    context.save();
    context.translate(92, 92);
    context.rotate(seconds * 0.6);
    disc(context, 0, 0, 58, 58, '#d9954a');
    disc(context, 0, 0, 52, 52, '#ff7eb6');
    for (let i = 0; i < 18; i++) {
        const angle = i * 2.1;
        const r = 30 + (i % 3) * 7;
        context.fillStyle = ['#fff', '#ffe066', '#5ad1ff', '#7cff8a'][i % 4];
        context.save();
        context.rotate(angle);
        context.fillRect(r, -1.5, 8, 3);
        context.restore();
    }
    disc(context, 0, 0, 18, 18, '#56c9bd');
    context.restore();
    sign(context, "DONNA'S\nDONUT DEN", 'fresh at midnight', 180, 76, '#123b38', 'left', 'script');
}

function tacos(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    backdrop(context, width, height, '#ff8c2b', '#d9480f');
    pattern(context, width, height, 'stripes');
    for (let i = 0; i < 2; i++) {
        const x = 70 + i * 70;
        const bob = Math.sin(seconds * 3 + i * 1.5) * 5;
        context.fillStyle = '#f4c95d';
        context.beginPath();
        context.ellipse(x, 120 + bob, 40, 40, 0, Math.PI, 0);
        context.fill();
        for (const [dx, colour] of [
            [-20, '#4caf50'],
            [0, '#c0392b'],
            [18, '#fff3b0'],
        ] as const)
            disc(context, x + dx, 92 + bob, 12, 8, colour);
    }
    sign(context, 'TACO\nTERESA', 'every day is tuesday', 186, 76, '#3a1200', 'left', 'slab');
}

function yakitori(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    context.fillStyle = '#120a06';
    context.fillRect(0, 0, width, height);
    for (let i = 0; i < 12; i++) {
        const glow = 0.5 + 0.5 * Math.sin(seconds * 5 + i * 1.7);
        disc(context, 20 + i * 14, 150, 8, 5, `rgba(255, ${80 + glow * 80}, 20, ${0.6 + glow * 0.4})`);
    }
    context.fillStyle = '#444';
    for (let i = 0; i < 6; i++) context.fillRect(10, 128 + i * 2, 170, 1);
    for (let s = 0; s < 3; s++) {
        const y = 60 + s * 26;
        context.fillStyle = '#c9a36b';
        context.fillRect(16, y + 6, 160, 3);
        for (let k = 0; k < 4; k++) disc(context, 40 + k * 32, y + 7, 13, 10, s === 1 ? '#8c3b1c' : '#b5651d');
    }
    steam(context, seconds, 96, 52, 80, 40);
    sign(context, "SMOKY\nSAM'S\nSKEWERS", 'smoke included', 196, 76, WARM, 'left', 'condensed');
}

function scoops(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    backdrop(context, width, height, '#fff4e6', '#ffd8a8');
    pattern(context, width, height, 'dots');
    context.fillStyle = '#d9954a';
    context.beginPath();
    context.moveTo(66, 110);
    context.lineTo(126, 110);
    context.lineTo(96, 174);
    context.fill();
    const t = seconds % 6;
    const colours = ['#ff8fab', '#a0e7a0', '#8d5524'];
    for (let i = 0; i < 3; i++) {
        const land = 1 + i * 1.2;
        if (t < land) break;
        const drop = Math.max(0, 1 - (t - land) * 4);
        const squash = Math.sin(Math.min(1, (t - land) * 6) * Math.PI) * 0.15;
        context.save();
        context.translate(96, 100 - i * 28 - drop * 80);
        context.scale(1 + squash, 1 - squash);
        disc(context, 0, 0, 30, 24, colours[i]);
        context.restore();
    }
    sign(context, "UNCLE PIP'S\nSCOOPS", 'three scoops, no rules', 172, 76, '#7a3e00', 'left', 'rounded');
}

function matcha(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    backdrop(context, width, height, '#e9f5db', '#cfe1b9');
    pattern(context, width, height, 'grid');
    disc(context, 96, 100, 66, 66, '#2b2b2b');
    disc(context, 96, 100, 56, 56, '#6a994e');
    for (let i = 0; i < 30; i++) {
        disc(context, 96 + ((i * 37) % 80) - 40, 100 + ((i * 53) % 70) - 35, 3, 3, 'rgba(220, 240, 190, 0.6)');
    }
    const sweep = Math.sin(seconds * 9) * 26;
    context.strokeStyle = '#d4b483';
    context.lineWidth = 3;
    for (let i = -3; i <= 3; i++) {
        context.beginPath();
        context.moveTo(96 + sweep + i * 3, 70);
        context.lineTo(96 + sweep + i * 5, 110);
        context.stroke();
    }
    context.fillStyle = '#a47148';
    context.fillRect(90 + sweep, 20, 12, 50);
    sign(context, 'MOSSY\nMATCHA BAR', 'whisked to order', 184, 76, '#2d4a22', 'left', 'serif');
}

function curry(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    backdrop(context, width, height, '#3d2200', '#1f1100');
    pattern(context, width, height, 'rays');
    disc(context, 96, 108, 80, 36, '#f2f2f2');
    context.fillStyle = '#fffaf0';
    context.beginPath();
    context.ellipse(96, 104, 64, 28, 0, Math.PI / 2, Math.PI * 1.5);
    context.fill();
    context.fillStyle = '#b5651d';
    context.beginPath();
    context.ellipse(96, 104, 64, 28, 0, -Math.PI / 2, Math.PI / 2);
    context.fill();
    for (const [x, y] of [
        [118, 98],
        [138, 110],
        [112, 116],
    ])
        disc(context, x, y, 7, 5, '#e67e22');
    steam(context, seconds, 110, 80, 30, 40);
    const level = 1 + (Math.floor(seconds * 1.5) % 10);
    sign(context, 'CURRY\nKING KAZ', 'spice level', 196, 62, WARM, 'left', 'condensed');
    label(context, '🌶'.repeat(Math.min(5, Math.ceil(level / 2))), 196, 124, `20px ${SANS}`, '#fff', 'left');
    label(context, `${level}/10`, 196, 152, `bold 14px ${FONT}`, '#ffb703', 'left');
}

function fortune(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    backdrop(context, width, height, '#8b1e1e', '#4a0d0d');
    pattern(context, width, height, 'rays');
    const t = seconds % 7;
    const crack = Math.min(1, Math.max(0, (t - 1.5) * 2));
    for (const side of [-1, 1]) {
        context.save();
        context.translate(width / 2 + side * crack * 28, 74);
        context.rotate(side * crack * 0.3);
        context.fillStyle = '#e9b65c';
        context.beginPath();
        context.ellipse(side * 18, 0, 34, 24, 0, side < 0 ? Math.PI / 2 : -Math.PI / 2, side < 0 ? Math.PI * 1.5 : Math.PI / 2);
        context.fill();
        context.restore();
    }
    if (crack >= 1) {
        const out = Math.min(1, (t - 2) * 1.5);
        context.fillStyle = '#fffdf5';
        context.fillRect(width / 2 - 110 * out, 116, 220 * out, 30);
        if (out >= 1) label(context, 'you will want noodles soon', width / 2, 131, `14px ${SANS}`, '#8b1e1e');
    }
    label(context, "LUCKY LIN'S FORTUNES", width / 2, 178, `900 16px ${SANS}`, WARM);
}

function onigiri(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    backdrop(context, width, height, '#c7e9f1', '#9bd3e0');
    pattern(context, width, height, 'dots');
    const bob = Math.sin(seconds * 2.5) * 4;
    context.fillStyle = '#fff';
    context.beginPath();
    context.moveTo(80, 36 + bob);
    context.quadraticCurveTo(140, 130 + bob, 120, 150 + bob);
    context.lineTo(40, 150 + bob);
    context.quadraticCurveTo(20, 130 + bob, 80, 36 + bob);
    context.fill();
    context.fillStyle = '#1b2d1b';
    context.fillRect(54, 116 + bob, 52, 34);
    const blink = seconds % 3 < 0.15;
    for (const x of [66, 94]) disc(context, x, 92 + bob, 4, blink ? 1 : 5, '#222');
    disc(context, 58, 102 + bob, 6, 3, '#ffb3c1');
    disc(context, 102, 102 + bob, 6, 3, '#ffb3c1');
    sign(context, 'MOMO\nMART', 'rice balls · 24h', 156, 72, '#123b4a', 'left', 'rounded');
}

function bao(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    backdrop(context, width, height, '#ffe5ec', '#ffc2d1');
    pattern(context, width, height, 'dots');
    const squish = Math.abs(Math.sin(seconds * 3)) * 0.12;
    context.save();
    context.translate(84, 130);
    context.scale(1 + squish, 1 - squish);
    disc(context, 0, -36, 56, 44, '#fffaf2');
    context.restore();
    disc(context, 70, 96, 3, 3, '#222');
    disc(context, 98, 96, 3, 3, '#222');
    context.strokeStyle = '#222';
    context.lineWidth = 2;
    context.beginPath();
    context.arc(84, 100, 5, 0.2, Math.PI - 0.2);
    context.stroke();
    steam(context, seconds, 84, 76, 30, 30);
    sign(context, 'BAO\nWOW', 'soft & fluffy', 166, 76, '#7a1f3d', 'left', 'rounded');
}

function breakfast(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    context.fillStyle = '#2c2c34';
    context.fillRect(0, 0, width, height);
    pattern(context, width, height, 'grid');
    disc(context, 90, 100, 72, 72, '#1a1a1a');
    context.fillStyle = '#1a1a1a';
    context.fillRect(150, 94, 80, 12);
    const spread = Math.min(1, (seconds % 8) / 2);
    disc(context, 90, 100, 20 + spread * 30, 18 + spread * 26, '#fffdf7');
    disc(context, 94, 96, 16, 14, '#ffb703');
    for (let i = 0; i < 8; i++) {
        const angle = i * 0.8 + seconds * 4;
        const r = 52 + Math.sin(seconds * 9 + i) * 4;
        disc(context, 90 + Math.cos(angle) * r, 100 + Math.sin(angle) * r * 0.9, 1.5, 1.5, 'rgba(255, 255, 255, 0.7)');
    }
    sign(context, "EGGY\nPEGGY'S", 'breakfast all night', 172, 50, WARM, 'left', 'script');
}

function popcorn(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    backdrop(context, width, height, '#1b1446', '#0c0826');
    pattern(context, width, height, 'rays');
    context.fillStyle = '#fff';
    context.beginPath();
    context.moveTo(50, 80);
    context.lineTo(130, 80);
    context.lineTo(118, 180);
    context.lineTo(62, 180);
    context.fill();
    context.fillStyle = '#e63946';
    for (let i = 0; i < 4; i++) context.fillRect(58 + i * 18, 80, 9, 100);
    for (let i = 0; i < 9; i++) disc(context, 58 + (i % 5) * 16, 74 - Math.floor(i / 5) * 12, 9, 8, '#fff6d6');
    for (let i = 0; i < 6; i++) {
        const t = (seconds * 0.9 + i * 0.17) % 1;
        const x = 90 + (i - 2.5) * 14 * t * 3;
        const y = 70 - Math.sin(t * Math.PI) * 60;
        disc(context, x, y, 7, 6, '#fff6d6');
    }
    sign(context, "POPPIN'\nPETE'S", 'midnight movies', 160, 76, WARM, 'left', 'slab');
}

function bread(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    backdrop(context, width, height, '#f6e7cb', '#e8c99b');
    pattern(context, width, height, 'stripes');
    const rise = 0.8 + Math.min(1, (seconds % 8) / 4) * 0.2;
    context.save();
    context.translate(88, 150);
    context.scale(1, rise);
    context.fillStyle = '#b5651d';
    context.beginPath();
    context.ellipse(0, -40, 66, 46, 0, Math.PI, 0);
    context.lineTo(66, 0);
    context.lineTo(-66, 0);
    context.fill();
    context.strokeStyle = '#e7b16a';
    context.lineWidth = 4;
    for (const x of [-30, 0, 30]) {
        context.beginPath();
        context.moveTo(x - 10, -66);
        context.lineTo(x + 10, -50);
        context.stroke();
    }
    context.restore();
    steam(context, seconds, 88, 80, 40, 40);
    sign(context, 'BAKER\nBRUNO', 'baked at 5am', 164, 72, '#5a2d0c', 'left', 'serif');
}

function shavedIce(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    backdrop(context, width, height, '#bde0fe', '#a2d2ff');
    pattern(context, width, height, 'dots');
    context.fillStyle = '#7b8cde';
    context.fillRect(54, 150, 76, 14);
    const colours = ['#ff4d6d', '#ffd166', '#06d6a0'];
    const pour = (seconds % 6) / 2;
    context.fillStyle = '#f8fbff';
    context.beginPath();
    context.ellipse(92, 150, 46, 70, 0, Math.PI, 0);
    context.fill();
    for (let i = 0; i < 3; i++) {
        const amount = Math.min(1, Math.max(0, pour - i * 0.6));
        if (!amount) continue;
        context.fillStyle = colours[i];
        context.globalAlpha = 0.85;
        context.beginPath();
        context.ellipse(66 + i * 26, 92, 14, 30 * amount, 0, 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
    }
    sign(context, "SNOWY\nSUE'S\nSHAVED ICE", 'three syrups', 160, 72, '#1d3557', 'left', 'rounded');
}

function bento(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    context.fillStyle = '#2b2d42';
    context.fillRect(0, 0, width, height);
    pattern(context, width, height, 'grid');
    context.fillStyle = '#9d0208';
    context.fillRect(20, 40, 128, 120);
    context.fillStyle = '#111';
    context.fillRect(26, 46, 116, 108);
    disc(context, 54, 100, 24, 46, '#fffaf0');
    disc(context, 54, 96, 6, 6, '#d00000');
    context.fillStyle = '#ffd60a';
    context.fillRect(86, 52, 50, 24);
    const wiggle = Math.sin(seconds * 5) * 0.2;
    context.save();
    context.translate(112, 104);
    context.rotate(wiggle);
    disc(context, 0, 0, 14, 10, '#e85d04');
    for (let i = 0; i < 5; i++) context.fillRect(-12 + i * 6, 6, 3, 10);
    context.restore();
    disc(context, 112, 138, 14, 10, '#2d6a4f');
    sign(context, 'BENTO\nBEN', 'packed tonight', 166, 72, WARM, 'left', 'condensed');
}

function dango(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    backdrop(context, width, height, '#fdf0d5', '#f7d9a8');
    pattern(context, width, height, 'stripes');
    context.save();
    context.translate(80, 100);
    context.rotate(-0.5 + Math.sin(seconds * 1.5) * 0.08);
    context.fillStyle = '#c9a36b';
    context.fillRect(-4, -80, 8, 160);
    for (const [y, colour] of [
        [-42, '#ffafcc'],
        [0, '#fffaf0'],
        [42, '#a7c957'],
    ] as const)
        disc(context, 0, y + Math.sin(seconds * 3 + y) * 2, 22, 21, colour);
    context.restore();
    sign(context, 'MISS\nDANGO', 'sweet & chewy', 156, 72, '#6b3e26', 'left', 'script');
}

function softServe(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    backdrop(context, width, height, '#ffcad4', '#f4acb7');
    pattern(context, width, height, 'dots');
    label(context, "SWIRLY SHIRLEY'S", width / 2, 36, `900 28px ${SANS}`, '#5a1f32');
    context.fillStyle = '#d9954a';
    context.beginPath();
    context.moveTo(110, 220);
    context.lineTo(190, 220);
    context.lineTo(150, 320);
    context.fill();
    const t = Math.min(1, (seconds % 7) / 4);
    for (let i = 0; i < 6; i++) {
        if (i / 6 > t) break;
        const w = 46 - i * 7;
        disc(context, 150 + (i % 2 ? 4 : -4), 208 - i * 16, w, 14, i % 2 ? '#a7c957' : '#fffaf0');
    }
    label(context, 'vanilla · matcha · twist', width / 2, 344, `15px ${SANS}`, '#5a1f32');
}

function vending(context: CanvasRenderingContext2D, seconds: number, width: number, height: number) {
    context.fillStyle = '#0d1b2a';
    context.fillRect(0, 0, width, height);
    context.fillStyle = '#e0e1dd';
    context.beginPath();
    context.roundRect(40, 20, 220, 320, 10);
    context.fill();
    context.fillStyle = '#1b263b';
    context.fillRect(54, 34, 192, 200);
    const colours = ['#e63946', '#f4a261', '#2a9d8f', '#e9c46a', '#457b9d'];
    const t = seconds % 5;
    for (let row = 0; row < 3; row++) {
        for (let col = 0; col < 5; col++) {
            if (row === 1 && col === 2 && t > 1) continue;
            context.fillStyle = colours[(row + col) % 5];
            context.fillRect(64 + col * 36, 46 + row * 62, 22, 44);
            context.fillStyle = row === 0 ? '#ff4d4d' : '#4da3ff';
            context.fillRect(64 + col * 36, 94 + row * 62, 22, 6);
        }
    }
    context.fillStyle = '#111';
    context.fillRect(70, 260, 160, 50);
    if (t > 1) {
        const fall = Math.min(1, (t - 1) * 2);
        context.fillStyle = colours[3];
        context.fillRect(140, 108 + fall * 160, 22, 44 * (1 - fall * 0.5));
    }
    label(context, "VENDY'S", width / 2, 247, `900 16px ${SANS}`, '#1b263b');
    if (t > 1.6) label(context, 'clunk.', 150, 290, `bold 14px ${SANS}`, '#fff');
}
