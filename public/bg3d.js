// Cartoon backdrop: a toon-shaded rooftop AC unit with googly eyes, ink outlines and drifting clouds.
// three.js loads from a CDN; if it fails the page still works on the flat sky colour.
// api.boost(v)    spins the fans up briefly
// api.shot(name)  camera: 'lobby' | 'play' | 'reveal' | 'final'
// api.react(kind) unit mood: 'happy' | 'sad' | 'party'
export function startBackground(canvas, opts = {}) {
  const api = {
    _boost: 0, _shot: 'lobby',
    boost(v) { api._boost = Math.max(api._boost, v); },
    shot(n) { api._shot = n; api._onShot?.(n); },
    react(k) { api._onReact?.(k); },
  };
  import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js')
    .then((THREE) => run(THREE, canvas, api, opts))
    .catch((e) => console.warn('3D backdrop disabled:', e));
  return api;
}

const INK = 0x1d1b3a;

function run(THREE, canvas, api, { phone = false } = {}) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const gsap = window.gsap && !reduce ? window.gsap : null;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, phone ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  const cam = new THREE.PerspectiveCamera(phone ? 50 : 36, 1, 0.1, 120);

  // 3-step toon ramp
  const ramp = new THREE.DataTexture(new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]), 3, 1, THREE.RGBAFormat);
  ramp.minFilter = ramp.magFilter = THREE.NearestFilter;
  ramp.needsUpdate = true;
  const toon = (color) => new THREE.MeshToonMaterial({ color, gradientMap: ramp });
  const inkMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
  // inverted-hull outline: a slightly bigger black back-face copy
  const ink = (mesh, s = 1.06) => {
    const o = new THREE.Mesh(mesh.geometry, inkMat);
    o.scale.setScalar(s);
    mesh.add(o);
    return mesh;
  };
  const box = (w, h, d, color, s) => ink(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), toon(color)), s);

  scene.add(new THREE.HemisphereLight(0xffffff, 0x8fb8de, 1.4));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(5, 10, 7);
  scene.add(sun);

  // Rooftop slab
  const roof = box(18, 0.4, 11, 0xffd88a, 1.01);
  roof.position.y = -0.2;
  scene.add(roof);
  for (const [x, z] of [[-6, -3.5], [6.5, 3], [-5, 3.8]]) {
    const vent = ink(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.6, 16), toon(0xb8c2d6)));
    vent.position.set(x, 0.3, z);
    scene.add(vent);
  }

  // The unit (a group so it can squash, bounce and shake)
  const unit = new THREE.Group();
  scene.add(unit);
  const body = new THREE.Group(); // pivot at the base for squash & stretch
  unit.add(body);
  const W = 4.2, H = 2.4, D = 2.6;
  for (const z of [-0.9, 0.9]) {
    const foot = box(W + 0.4, 0.25, 0.35, 0x5a5f7a);
    foot.position.set(0, 0.125, z);
    unit.add(foot);
  }
  const cab = box(W, H, D, 0xeef4ff, 1.03);
  cab.position.y = 0.25 + H / 2;
  body.add(cab);
  const top = 0.25 + H;
  // blue side panels + grille stripes
  for (const sx of [-1, 1]) {
    const side = box(0.06, H - 0.3, D - 0.3, 0x2f7de1, 1.02);
    side.position.set(sx * (W / 2 + 0.03), 0.25 + H / 2, 0);
    body.add(side);
  }
  for (let i = 0; i < 6; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(W - 0.6, 0.07, 0.04), toon(0xb9cbe6));
    stripe.position.set(0, 0.55 + i * 0.13, D / 2 + 0.02);
    body.add(stripe);
  }

  // Small kawaii dot eyes: soft dark ovals with two sparkles, no whites, no staring
  const eyes = [];
  for (const x of [-0.75, 0.75]) {
    const eye = new THREE.Group();
    eye.position.set(x, 0.25 + H * 0.6, D / 2 + 0.03);
    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.17, 20, 14), new THREE.MeshBasicMaterial({ color: INK }));
    dot.scale.set(1, 1.25, 0.3);
    const big = new THREE.Mesh(new THREE.CircleGeometry(0.06, 14), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    big.position.set(0.05, 0.08, 0.06);
    const small = new THREE.Mesh(new THREE.CircleGeometry(0.03, 10), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    small.position.set(-0.05, -0.06, 0.06);
    eye.add(dot, big, small);
    body.add(eye);
    eyes.push({ eye });
  }
  // Smile (half torus) — flips to a frown when sad
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 8, 24, Math.PI), new THREE.MeshBasicMaterial({ color: INK }));
  mouth.position.set(0, 0.25 + H * 0.36, D / 2 + 0.04);
  mouth.rotation.z = Math.PI; // smile
  body.add(mouth);
  const blush = [];
  for (const x of [-1.55, 1.55]) {
    const b = new THREE.Mesh(new THREE.CircleGeometry(0.22, 20), new THREE.MeshBasicMaterial({ color: 0xff8fb1 }));
    b.position.set(x, 0.25 + H * 0.45, D / 2 + 0.02);
    body.add(b);
    blush.push(b);
  }

  // Fans on top
  const bladeShape = new THREE.Shape();
  bladeShape.moveTo(-0.1, 0.1);
  bladeShape.quadraticCurveTo(-0.38, 0.5, -0.05, 0.72);
  bladeShape.quadraticCurveTo(0.3, 0.5, 0.12, 0.1);
  const bladeGeo = new THREE.ExtrudeGeometry(bladeShape, { depth: 0.05, bevelEnabled: false });
  const fans = [];
  for (const [x, c] of [[-1.0, 0xffd23f], [1.0, 0xff5fa2]]) {
    const ring = ink(new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.12, 12, 40), toon(0x2f7de1)), 1.1);
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, top + 0.12, 0);
    body.add(ring);
    const rotor = new THREE.Group();
    rotor.position.set(x, top + 0.14, 0);
    rotor.add(ink(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.16, 20), toon(0x5a5f7a))));
    const blades = new THREE.Group();
    blades.rotation.x = -Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Group();
      p.rotation.z = (i / 3) * Math.PI * 2;
      p.add(ink(new THREE.Mesh(bladeGeo, toon(c)), 1.08));
      blades.add(p);
    }
    rotor.add(blades);
    body.add(rotor);
    fans.push(rotor);
  }

  // Chunky ducts: cool (blue) right, heat (orange) left
  const duct = (dir, color) => {
    const g = new THREE.Group();
    const run_ = box(2.2, 0.8, 0.9, color);
    run_.position.set(dir * (W / 2 + 1.1), 1.0, -0.4);
    const drop = box(0.9, 1.4, 0.9, color);
    drop.position.set(dir * (W / 2 + 2.6), 0.7, -0.4);
    for (const bx of [0.45, 1.6]) {
      const band = box(0.12, 0.9, 1.0, 0xffffff, 1.02);
      band.position.set(dir * (W / 2 + bx), 1.0, -0.4);
      g.add(band);
    }
    g.add(run_, drop);
    scene.add(g);
  };
  duct(1, 0x4cc3ff);
  duct(-1, 0xff8a4c);

  // Puffy clouds
  const clouds = [];
  const cloudMat = toon(0xffffff);
  const n = phone ? 4 : 7;
  for (let i = 0; i < n; i++) {
    const c = new THREE.Group();
    for (let j = 0; j < 4; j++) {
      const s = ink(new THREE.Mesh(new THREE.SphereGeometry(0.7 + Math.random() * 0.5, 16, 12), cloudMat), 1.06);
      s.position.set(j * 0.9 - 1.3, Math.random() * 0.4, Math.random() * 0.4);
      c.add(s);
    }
    c.position.set(-22 + i * (44 / n) + Math.random() * 2, 7 + Math.random() * 4, -8 - Math.random() * 8);
    c.userData.v = 0.3 + Math.random() * 0.4;
    scene.add(c);
    clouds.push(c);
  }

  // Camera shots
  const SHOTS = phone
    ? { lobby: { r: 15, h: 4, ty: -0.6, sp: 0.15 }, play: { r: 16, h: 7, ty: 1.4, sp: 0.06 }, reveal: { r: 17, h: 3.5, ty: -2.1, sp: 0.2 }, final: { r: 17, h: 3, ty: -2.1, sp: 0.25 } }
    // desktop: look below the unit so its face sits in the top half, above the lobby/final text
    : { lobby: { r: 23, h: 3.8, ty: -2.4, sp: 0.12 }, play: { r: 15, h: 7, ty: 0.9, sp: 0.05 }, reveal: { r: 11, h: 3.5, ty: 1.6, sp: 0.18 }, final: { r: 21, h: 3, ty: -2.4 + 1.9, sp: 0.22 } };
  const camS = { ...SHOTS.lobby };
  // keep the face mostly toward the camera: orbit swings back and forth instead of full circles
  api._onShot = (name) => {
    const t = SHOTS[name] || SHOTS.lobby;
    if (gsap) gsap.to(camS, { ...t, duration: 1.6, ease: 'power2.inOut', overwrite: true });
    else Object.assign(camS, t);
  };
  api._onShot(api._shot);

  // Moods
  let mood = 'happy';
  const setMouth = (happy) => { mouth.rotation.z = happy ? Math.PI : 0; mouth.position.y = 0.25 + H * (happy ? 0.36 : 0.26); blush.forEach((b) => (b.visible = happy)); };
  api._onReact = (k) => {
    mood = k;
    setMouth(k !== 'sad');
    if (!gsap) return;
    gsap.killTweensOf([body.scale, body.position, unit.rotation]);
    body.scale.set(1, 1, 1); body.position.y = 0; unit.rotation.z = 0;
    if (k === 'happy' || k === 'party') {
      const hops = k === 'party' ? 4 : 1;
      gsap.timeline({ repeat: hops - 1 })
        .to(body.scale, { y: 0.8, x: 1.12, z: 1.12, duration: 0.12, ease: 'power2.out' })
        .to(body.scale, { y: 1.18, x: 0.92, z: 0.92, duration: 0.15, ease: 'power2.out' })
        .to(body.position, { y: 1.1, duration: 0.25, ease: 'power2.out' }, '<')
        .to(body.position, { y: 0, duration: 0.3, ease: 'bounce.out' })
        .to(body.scale, { y: 1, x: 1, z: 1, duration: 0.5, ease: 'elastic.out(1.2, 0.4)' }, '<0.15');
    } else if (k === 'sad') {
      // gentle "aww": a slow sag and one small sway, not a shake
      gsap.timeline({ onComplete: () => (unit.rotation.z = 0) })
        .to(unit.rotation, { z: 0.035, duration: 0.35, ease: 'sine.inOut' })
        .to(unit.rotation, { z: -0.035, duration: 0.5, ease: 'sine.inOut' })
        .to(unit.rotation, { z: 0, duration: 0.4, ease: 'sine.out' });
      gsap.to(body.scale, { y: 0.93, duration: 0.5, yoyo: true, repeat: 1, ease: 'sine.inOut' });
      setTimeout(() => { if (mood === 'sad') setMouth(true); }, 2500);
    }
  };

  // Blinking
  const blink = () => {
    if (gsap) eyes.forEach(({ eye }) => gsap.fromTo(eye.scale, { y: 1 }, { y: 0.08, duration: 0.07, yoyo: true, repeat: 1 }));
    setTimeout(blink, 2200 + Math.random() * 3000);
  };
  setTimeout(blink, 1500);

  const resize = () => {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setSize(w, h, false);
    cam.aspect = w / h;
    cam.updateProjectionMatrix();
  };
  window.addEventListener('resize', resize);
  resize();

  let last = performance.now(), t = 0, running = true;
  document.addEventListener('visibilitychange', () => {
    running = !document.hidden;
    if (running) { last = performance.now(); requestAnimationFrame(loop); }
  });
  const look = new THREE.Vector3();
  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    t += dt * (reduce ? 0.2 : 1);
    api._boost *= Math.pow(0.35, dt);
    const fanSpeed = (reduce ? 1.5 : 5) + api._boost * 14;
    for (const f of fans) f.rotation.y -= fanSpeed * dt;
    // idle wobble
    if (!reduce) unit.rotation.y = Math.sin(t * 0.8) * 0.04;
    for (const c of clouds) { c.position.x += c.userData.v * dt; if (c.position.x > 24) c.position.x = -24; }
    // camera sways in an arc in front of the unit
    const ang = Math.sin(t * 0.25) * 0.5; // constant slow sway; shots only change distance/height

    cam.position.set(Math.sin(ang) * camS.r, camS.h, Math.cos(ang) * camS.r);
    look.set(0, camS.ty, 0);
    cam.lookAt(look);
    renderer.render(scene, cam);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
}
