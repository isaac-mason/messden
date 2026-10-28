import { createRenderer, GpuArrays, loadSplats, SplatCollection, SplatRenderer } from 'spark-radix';
import * as THREE from 'three';
import sceneUrl from '../assets/scene.spz?url';
import colliderUrl from '../assets/scene-collider.glb?url';
import { initCity, renderCity, resizeCity } from './city';
import { initDebug, updateDebug } from './debug';
import { initDust, updateDust } from './dust';
import { initFlyby, updateFlyby } from './flyby';
import { initFocus, updateFocus } from './focus';
import { initFootsteps, unlockFootsteps, updateFootsteps } from './footsteps';
import { glassInView, initGlass, updateGlass } from './glass';
import { initInput, updateInput } from './input';
import { finishLoader, initLoader, setLoaderProgress, setLoaderStage } from './loader';
import { initPhysics, loadCollider, updatePhysics } from './physics';
import { applyPlayerCamera, initPlayer, updatePlayer, zoomAmount } from './player';
import { surfaceAt } from './surfaces';
import { initTitle, renderTitle, updateTitle } from './title';
import { cutWindow } from './window';
import './style.css';

const MAX_DT = 1 / 30;
const MAX_PIXEL_RATIO = 1.5;

async function init() {
    const loader = initLoader();
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.05, 200);

    const renderer = await createRenderer({ antialias: false });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, MAX_PIXEL_RATIO));
    renderer.setSize(window.innerWidth, window.innerHeight);
    (document.querySelector<HTMLDivElement>('#app') ?? document.body).appendChild(renderer.domElement);

    const physics = initPhysics();
    const [data] = await Promise.all([
        loadSplats(sceneUrl, { onProgress: (fraction, stage) => setLoaderStage(loader, fraction, stage) }),
        loadCollider(physics, colliderUrl),
    ]);
    const flyby = initFlyby();
    const world = cutWindow(GpuArrays.fromData(renderer, data), flyby);
    const dust = initDust(flyby);
    console.log(`messden: ${dust.count.toLocaleString()} dust motes`);

    const splats = new SplatRenderer({ renderer, collection: new SplatCollection([world, dust.object]) });
    splats.raycast = () => {};
    scene.add(splats);
    const city = initCity(renderer);
    city.scene.add(flyby.car);
    resizeCity(city, window.innerWidth, window.innerHeight, renderer.getPixelRatio());
    const glass = initGlass(scene, city, renderer, flyby);

    const player = initPlayer(physics);
    const focus = initFocus(splats);
    const footsteps = initFootsteps();
    const debug = initDebug(scene, physics, player);
    const vignette = document.getElementById('vignette') as HTMLDivElement;
    const input = initInput(renderer.domElement, () => unlockFootsteps(footsteps));
    applyPlayerCamera(player, camera);
    const title = await initTitle(scene, camera, physics);
    setLoaderProgress(loader, 0.95);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        resizeCity(city, window.innerWidth, window.innerHeight, renderer.getPixelRatio());
    });

    return {
        scene,
        camera,
        renderer,
        splats,
        city,
        flyby,
        glass,
        dust,
        physics,
        player,
        focus,
        footsteps,
        input,
        debug,
        vignette,
        title,
        loader,
    };
}

type State = Awaited<ReturnType<typeof init>>;

function update(state: State, dt: number) {
    updateInput(state.input);
    if (state.title.entered) updatePlayer(state.player, state.physics, state.input, dt);
    updatePhysics(state.physics, dt);
    updateFootsteps(state.footsteps, state.player.stepped, state.player.landed, surfaceAt(state.player.controller.position));
    applyPlayerCamera(state.player, state.camera);
    updateTitle(state.title, state.input.active, state.camera, dt);
    updateFocus(state.focus, state.physics, state.camera, state.splats, dt, !state.title.entered);
    updateDust(state.dust, state.camera, dt);
    updateFlyby(state.flyby, dt);

    // the WebGL2 backend's CPU sort only runs when asked, and the dust never stops
    if (state.splats.sortMode === 'cpu') state.splats.requestSort();

    document.body.classList.toggle('active', state.input.active);
    state.vignette.style.opacity = zoomAmount(state.player).toFixed(3);
    updateDebug(state.debug, state.player, state.focus, state.splats, dt);
    renderTitle();
    updateGlass(state.glass, state.focus, state.camera, state.renderer, dt);
    if (glassInView(state.glass, state.camera)) renderCity(state.city, state.renderer, state.camera);
    state.renderer.render(state.scene, state.camera);
}

async function start() {
    const state = await init();
    applyPlayerCamera(state.player, state.camera);
    state.splats.prepare(state.camera);
    renderTitle();
    await state.renderer.compileAsync(state.city.cat.scene, state.city.cat.camera);
    await state.renderer.compileAsync(state.city.scene, state.city.camera);
    renderCity(state.city, state.renderer, state.camera);
    await state.renderer.compileAsync(state.scene, state.camera);
    finishLoader(state.loader);

    let last = performance.now();
    state.renderer.setAnimationLoop(() => {
        const now = performance.now();
        update(state, Math.min((now - last) / 1000, MAX_DT));
        last = now;
    });
}

start();
