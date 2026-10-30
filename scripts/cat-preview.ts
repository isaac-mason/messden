// The billboard cat on its own, for looking at while working on it: /cat-preview.html?t=seconds poses it at a moment.
import { createRenderer } from '@sparkjsdev/radix';
import { CAT_VIDEO, initCatVideo, poseCat } from '../src/cat';

const scale = 2;
const renderer = await createRenderer({ antialias: true });
renderer.setSize(CAT_VIDEO.width * scale, CAT_VIDEO.height * scale);
document.body.appendChild(renderer.domElement);
const video = initCatVideo();
const at = new URLSearchParams(location.search).get('t');
renderer.setAnimationLoop(() => {
    poseCat(video, at ? Number(at) : performance.now() / 1000);
    renderer.render(video.scene, video.camera);
    (window as unknown as { rendered: boolean }).rendered = true;
});
