import type { Surface } from './surfaces';

// assets/sounds/<surface>/*.ogg: every clip a surface's steps choose from.
const CLIP_URLS = import.meta.glob<string>('../assets/sounds/*/*.ogg', { eager: true, query: '?url', import: 'default' });

const FOOTSTEPS = {
    minGapSeconds: 0.25,
    volume: [0.16, 0.26],
    detuneCents: 140,
    // Feet don't sound the same: one a touch lower, each a little off to its side.
    footCents: 45,
    footPan: 0.12,
    muffle: [1000, 1900],
    landing: { volume: 0.34, cents: -300, muffle: 800 },
};
// How each surface sounds, over the defaults: wool is soft, low and muffled.
const SURFACES: Record<Surface, { volume: number; cents: number; muffle: number }> = {
    hard: { volume: 1, cents: 0, muffle: 1 },
    wool: { volume: 1.15, cents: -150, muffle: 0.8 },
};

export type Footsteps = {
    context: AudioContext | null;
    clips: Partial<Record<Surface, AudioBuffer[]>>;
    last: number;
    lastAt: number;
    foot: number;
};

export function initFootsteps(): Footsteps {
    return { context: null, clips: {}, last: -1, lastAt: -1, foot: 1 };
}

/** Browsers only allow audio after a user gesture. */
export async function unlockFootsteps(footsteps: Footsteps): Promise<void> {
    if (footsteps.context) return;
    const context = new AudioContext();
    footsteps.context = context;
    for (const [path, url] of Object.entries(CLIP_URLS)) {
        const surface = path.split('/').at(-2) as Surface;
        const clip = await context.decodeAudioData(await (await fetch(url)).arrayBuffer());
        footsteps.clips[surface] = [...(footsteps.clips[surface] ?? []), clip];
    }
}

export function updateFootsteps(footsteps: Footsteps, stepped: boolean, landed: boolean, surface: Surface): void {
    const { context } = footsteps;
    const clips = footsteps.clips[surface] ?? footsteps.clips.hard ?? [];
    const sound = SURFACES[surface];
    if (!stepped || !context || clips.length === 0) return;
    if (context.currentTime - footsteps.lastAt < FOOTSTEPS.minGapSeconds) return;
    footsteps.lastAt = context.currentTime;

    // Never the same clip twice running.
    footsteps.last = (footsteps.last + 1 + Math.floor(Math.random() * Math.max(clips.length - 1, 1))) % clips.length;
    footsteps.foot = -footsteps.foot;
    const source = context.createBufferSource();
    source.buffer = clips[footsteps.last];
    source.detune.value = landed
        ? FOOTSTEPS.landing.cents
        : between(-FOOTSTEPS.detuneCents, FOOTSTEPS.detuneCents) + footsteps.foot * FOOTSTEPS.footCents + sound.cents;
    const muffle = context.createBiquadFilter();
    muffle.type = 'lowpass';
    muffle.frequency.value =
        (landed ? FOOTSTEPS.landing.muffle : between(FOOTSTEPS.muffle[0], FOOTSTEPS.muffle[1])) * sound.muffle;
    const gain = context.createGain();
    gain.gain.value = (landed ? FOOTSTEPS.landing.volume : between(FOOTSTEPS.volume[0], FOOTSTEPS.volume[1])) * sound.volume;
    const pan = context.createStereoPanner();
    pan.pan.value = landed ? 0 : footsteps.foot * FOOTSTEPS.footPan;
    source.connect(muffle).connect(gain).connect(pan).connect(context.destination);
    source.start();
}

function between(min: number, max: number): number {
    return min + Math.random() * (max - min);
}
