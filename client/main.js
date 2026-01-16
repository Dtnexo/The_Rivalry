import * as THREE from 'three';
import { io } from 'socket.io-client';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// Post Processing
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

// Modular Level
// Modular Level
import { NeonCity } from './src/levels/NeonCity.js';
import { createWeaponMesh } from './src/utils/weapons.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js'; // [NEW] Switch to STL

// --- CONFIG ---
const SERVER_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3000' : '');
const TICK_RATE = 30;

// --- STATE ---
const players = {};
let myFunctionId = null;
const projectiles = []; // Store active projectiles
const activeParticles = []; // [NEW] Shared particle system
let globalCamoTexture = null; // [NEW] Cache texture

function getCamoTexture() {
    if (globalCamoTexture) return globalCamoTexture;

    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');

    // Base
    ctx.fillStyle = '#4b5320'; // Army Green
    ctx.fillRect(0, 0, size, size);

    // Random Digital Patches
    const colors = ['#3d3415', '#6b8c42', '#2f3118']; // Brown, Light Green, Darker
    for (let i = 0; i < 400; i++) {
        ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        const w = Math.random() * 20 + 5;
        const h = Math.random() * 20 + 5;
        const x = Math.random() * size;
        const y = Math.random() * size;
        ctx.fillRect(x, y, w, h);
    }

    globalCamoTexture = new THREE.CanvasTexture(canvas);
    globalCamoTexture.magFilter = THREE.NearestFilter;
    return globalCamoTexture;
}

// --- NETWORK SETUP ---
const userId = localStorage.getItem('userId');
const username = localStorage.getItem('username');
const selectedWeapon = localStorage.getItem('selectedWeapon') || 'rifle';

const socket = io(SERVER_URL, {
    auth: { token: userId, username: username },
    query: { weapon: selectedWeapon } // Send local choice
});

// [FIX] Listener at top to catch immediate rejection
socket.on('connect_error_msg', (msg) => {
    alert(msg);
    window.location.href = 'index.html';
});

// --- THREE.JS SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky Blue
scene.fog = new THREE.Fog(0x87CEEB, 20, 100); // Standard Fog (not Exp2) for cleaner visibility

const camera = new THREE.PerspectiveCamera(
    parseInt(localStorage.getItem('userFOV') || '75'),
    window.innerWidth / window.innerHeight,
    0.1,
    1000
);
camera.layers.enable(0);
scene.add(camera); // [FIX] Ensure camera is in scene so its children (FPS Weapon) render

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" }); // [FIX] Sharpness + Perf
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); // [FIX] Sharpness
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // [FIX] Faster Shadows (was PCFSoft)
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.5;
document.body.appendChild(renderer.domElement);

// --- RENDERER SETUP (NO BLOOM) ---
// const composer = new EffectComposer(renderer); 
// composer.addPass(renderScene);
// composer.addPass(bloomPass);
// We will just use renderer.render(scene, camera) directly in animate()

// --- RENDERER SETUP (NO BLOOM) ---
// We will just use renderer.render(scene, camera) directly in animate()

// Shared Projectile Assets (Optimization)
// Shared Projectile Assets (Optimization)
const projectileGeometry = new THREE.CylinderGeometry(0.05, 0.05, 4.0, 6);
projectileGeometry.rotateX(-Math.PI / 2);
const projectileMaterial = new THREE.MeshBasicMaterial({
    color: 0xffff00,
    transparent: true,
    opacity: 0.8,
    side: THREE.DoubleSide,
    depthWrite: false
});
const level = new NeonCity(scene);
level.build();


// --- CONTROLS ---
const controls = new PointerLockControls(camera, document.body);
const blocker = document.getElementById('ui-layer');
const instructions = document.getElementById('controls-hint');
const menu = document.getElementById('settings-menu');

// Menu Controls
document.addEventListener('click', (event) => {
    // Only lock if menu is NOT visible
    if (menu.style.display !== 'block') {
        controls.lock();
    }
});

controls.addEventListener('lock', () => {
    // instructions.style.display = 'none';
    blocker.style.pointerEvents = 'none';
    menu.style.display = 'none'; // Hide Menu on Lock
});

controls.addEventListener('unlock', () => {
    // Show Menu on Unlock (Esc pressed)
    menu.style.display = 'block';
    blocker.style.pointerEvents = 'auto'; // Allow clicking menu
});

// Resume Button
document.getElementById('resume-btn').addEventListener('click', () => {
    controls.lock();
});

// Sliders
let baseSensitivity = 1.0;
let scopeMultiplier = 0.3; // Default

document.getElementById('sens-slider').addEventListener('input', (e) => {
    baseSensitivity = parseFloat(e.target.value);
    controls.pointerSpeed = baseSensitivity;
    document.getElementById('sens-val').innerText = e.target.value;
});

document.getElementById('scope-sens-slider').addEventListener('input', (e) => {
    scopeMultiplier = parseFloat(e.target.value);
    document.getElementById('scope-sens-val').innerText = e.target.value;
});

document.getElementById('bright-slider').addEventListener('input', (e) => {
    renderer.toneMappingExposure = parseFloat(e.target.value);
    document.getElementById('bright-val').innerText = e.target.value;
});

document.getElementById('fov-slider').addEventListener('input', (e) => {
    const fovValue = parseInt(e.target.value);
    localStorage.setItem('userFOV', fovValue);
    camera.fov = fovValue;
    camera.updateProjectionMatrix();
    document.getElementById('fov-val').innerText = fovValue;
});

// Load saved FOV value into slider
const savedFOV = localStorage.getItem('userFOV') || '75';
document.getElementById('fov-slider').value = savedFOV;
document.getElementById('fov-val').innerText = savedFOV;


// --- CHARACTER GENERATION (Detailed) ---
function createPlayerMesh(role, weaponType) {
    const group = new THREE.Group();
    group.castShadow = true;

    // --- CACHING HELPERS ---
    // [NEW] Geometry Cache
    if (!window._boxGeoCache) window._boxGeoCache = {};
    function getBoxGeo(w, h, d) {
        const k = `${w.toFixed(2)}_${h.toFixed(2)}_${d.toFixed(2)}`;
        if (!window._boxGeoCache[k]) window._boxGeoCache[k] = new THREE.BoxGeometry(w, h, d);
        return window._boxGeoCache[k];
    }

    // [NEW] Material Cache
    if (!window._matCache) window._matCache = {};
    function getMat(name, colorVal = null) {
        let k = name;
        if (colorVal !== null) k += `_${colorVal}`;

        if (window._matCache[k]) return window._matCache[k];

        let mat;
        if (name === 'dark') mat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
        else if (name === 'camo') mat = new THREE.MeshStandardMaterial({ map: getCamoTexture(), roughness: 0.9 });
        else if (name === 'skin') mat = new THREE.MeshStandardMaterial({ color: 0xffdbac, roughness: 0.5 });
        else if (name === 'body') mat = new THREE.MeshStandardMaterial({ color: colorVal, roughness: 0.8 });
        else if (name === 'accent') mat = new THREE.MeshStandardMaterial({ color: colorVal, roughness: 0.4 });
        else if (name === 'eye') mat = new THREE.MeshStandardMaterial({ color: colorVal, roughness: 0.2 });

        window._matCache[k] = mat;
        return mat;
    }

    // Common materials (via Cache)
    const darkMat = getMat('dark');
    const camoMat = getMat('camo');
    const skinMat = getMat('skin');

    // Defaults
    let bodyColor = 0x0088ff;
    let accentColor = 0xffaa00;


    // ... (Keep existing role logic check if needed, but we override for visual style requested)
    // User asked to "add the skin", implying replacement or update. 
    // Let's use Camo for Vanguard (default).

    const bodyMat = getMat('body', bodyColor);
    let mainMat = bodyMat;
    if (role === 'vanguard') {
        mainMat = camoMat;
        accentColor = 0xffd700; // Keep gold visor? Or maybe black/dark? Image shows Yellow visor.
    }

    const accentMat = getMat('accent', accentColor);
    const eyeMat = getMat('eye', accentColor);

    // 1. Torso
    let torsoW = 1, torsoH = 1.2, torsoD = 0.6;
    if (role === 'titan') { torsoW = 1.4; torsoD = 0.8; }
    if (role === 'shadow') { torsoW = 0.9; }

    const torso = new THREE.Mesh(getBoxGeo(torsoW, torsoH, torsoD), mainMat);
    torso.position.y = 0.6;
    torso.castShadow = true;
    group.add(torso);

    // Chest detail (Vest)
    if (role === 'vanguard') {
        const vest = new THREE.Mesh(getBoxGeo(1.05, 0.8, 0.7), camoMat); // Slightly bulkier camo vest
        vest.position.set(0, 0, 0);
        torso.add(vest);

        // Yellow plate from image
        const plate = new THREE.Mesh(getBoxGeo(0.6, 0.5, 0.1), accentMat);
        plate.position.set(0, 0.2, -0.36); // Front
        torso.add(plate);
    }

    // 2. Head
    const head = new THREE.Mesh(getBoxGeo(0.6, 0.6, 0.6), mainMat);
    head.name = 'head'; // [FIX] Name required for sync
    head.position.y = 1.6;
    head.castShadow = true;
    group.add(head);

    // Helmet (New)
    if (role === 'vanguard') {
        const helmetGroup = new THREE.Group();

        // Dome
        const dome = new THREE.Mesh(getBoxGeo(0.7, 0.3, 0.7), camoMat);
        dome.position.y = 0.35;
        helmetGroup.add(dome);

        // Brim/Sides
        const brim = new THREE.Mesh(getBoxGeo(0.72, 0.15, 0.8), camoMat);
        brim.position.y = 0.2;
        helmetGroup.add(brim);

        head.add(helmetGroup);
    }

    // Visor/Eyes
    if (role === 'vanguard') {
        // Image shows a large rectangular yellow/gold visor
        const visor = new THREE.Mesh(getBoxGeo(0.5, 0.25, 0.1), accentMat);
        visor.position.set(0, 0, -0.31);
        head.add(visor);
    } else if (role === 'shadow') {
        const hood = new THREE.Mesh(getBoxGeo(0.7, 0.7, 0.7), bodyMat);
        head.add(hood);
        const eye1 = new THREE.Mesh(getBoxGeo(0.1, 0.05, 0.05), eyeMat);
        eye1.position.set(-0.15, 0, -0.36); // Move to -Z (Front)
        head.add(eye1);
        const eye2 = eye1.clone();
        eye2.position.set(0.15, 0, -0.36); // Move to -Z (Front)
        head.add(eye2);
    } else if (role === 'titan') {
        const jaw = new THREE.Mesh(getBoxGeo(0.7, 0.3, 0.7), accentMat);
        jaw.position.set(0, -0.2, 0);
        head.add(jaw);
        const eye = new THREE.Mesh(getBoxGeo(0.4, 0.1, 0.1), eyeMat);
        eye.position.set(0, 0.1, -0.31); // Move to -Z (Front)
        head.add(eye);
    }

    // 3. Limbs (Refactored for Shoulder Pivots)
    const armW = 0.35, armH = 1, armD = 0.35;
    const armOffset = (torsoW / 2 + armW / 2 + 0.05);

    // --- LEFT ARM ---
    const leftShoulder = new THREE.Group();
    leftShoulder.position.set(-armOffset, 1.1, 0); // Shoulder Height
    group.add(leftShoulder);

    const leftArm = new THREE.Mesh(getBoxGeo(armW, armH, armD), mainMat);
    leftArm.position.set(0, -0.4, 0); // Offset so pivot is at top
    leftShoulder.add(leftArm);

    // --- RIGHT ARM ---
    const rightShoulder = new THREE.Group();
    rightShoulder.name = 'rightShoulder'; // [FIX] Name to find it later
    rightShoulder.position.set(armOffset, 1.1, 0); // Shoulder Height
    group.add(rightShoulder);

    const rightArm = new THREE.Mesh(getBoxGeo(armW, armH, armD), mainMat);
    rightArm.name = 'rightArm'; // [FIX] Name it for lookups
    rightArm.position.set(0, -0.4, 0); // Offset so pivot is at top
    rightShoulder.add(rightArm);

    // [FIX] Removed duplicate weapon creation block here.
    // The correct weapon attachment happens below in the "TPV" section.

    // --- AIM POSE (Two-Handed) ---
    // Right Arm (Holding Grip)
    rightShoulder.rotation.x = Math.PI / 2; // Forward
    rightShoulder.rotation.y = -0.2; // Slight inward angle

    // Left Arm (Holding Barrel)
    leftShoulder.rotation.x = Math.PI / 2; // Forward
    leftShoulder.rotation.y = 0.5; // Reach inward to grab barrel

    // --- ATTACH WEAPON (TPV) ---
    // Use the passed weaponType, fallback to 'rifle'
    const type = weaponType || 'rifle';
    const weapon = createWeaponMesh(type);
    weapon.name = 'weapon'; // [FIX] Name for remote origin lookup

    // Weapon Alignment
    // 1. Align with Arm (-Y): Rotate X +90 (Math.PI/2).
    // 2. Fix "Upside Down" (Mag Up): Rotate Z +180 (Math.PI).
    weapon.rotation.set(Math.PI / 2, 0, Math.PI);

    // Position: At the "hand" (bottom of arm mesh)
    weapon.position.set(0, -0.8, 0.2);

    rightArm.add(weapon);

    const legW = 0.36, legH = 1.2, legD = 0.4;

    // Left Leg
    const leftLegGroup = new THREE.Group();
    leftLegGroup.name = 'leftLeg'; // Name for animation
    leftLegGroup.position.set(-(torsoW / 4), 0, 0); // Hip Pivot Point (Body Y=0)
    group.add(leftLegGroup);

    const leftLeg = new THREE.Mesh(getBoxGeo(legW, legH, legD), darkMat);
    leftLeg.position.set(0, -0.6, 0); // Offset geometry so top is at pivot
    leftLegGroup.add(leftLeg);

    // Right Leg
    const rightLegGroup = new THREE.Group();
    rightLegGroup.name = 'rightLeg'; // Name for animation
    rightLegGroup.position.set((torsoW / 4), 0, 0); // Hip Pivot Point (Body Y=0)
    group.add(rightLegGroup);

    const rightLeg = new THREE.Mesh(getBoxGeo(legW, legH, legD), darkMat);
    rightLeg.position.set(0, -0.6, 0); // Offset geometry so top is at pivot
    rightLegGroup.add(rightLeg);

    scene.add(group);
    return group;
}

// [NEW] Visual Effects: Giblets (Body Parts) - Optimized
function createGiblets(pos) {
    const debrisCount = 12;
    const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5); // Chunks
    const material = new THREE.MeshBasicMaterial({ color: 0x880000 }); // Blood red / Dark chunks

    for (let i = 0; i < debrisCount; i++) {
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.copy(pos);

        // Random spread
        mesh.position.x += (Math.random() - 0.5) * 1.5;
        mesh.position.y += (Math.random() - 0.5) * 1.5;
        mesh.position.z += (Math.random() - 0.5) * 1.5;

        // Random velocity
        const velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 10,
            (Math.random() * 5) + 2, // Upward burst
            (Math.random() - 0.5) * 10
        );

        scene.add(mesh);

        // Add to global system
        activeParticles.push({
            mesh: mesh,
            velocity: velocity,
            startTime: Date.now(),
            duration: 2000,
            rotVel: { x: 0.1, z: 0.1 }
        });
    }
}

// --- NAMEPLAT HELPER ---
function createNameplate(text, hp, role) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 256;
    canvas.height = 128; // Higher res for clear text

    // Font Config
    ctx.font = 'bold 32px Rajdhani';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Shadow / Outline
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.roundRect(28, 64 - 24, 200, 48, 10);
    ctx.fill();

    // Name
    ctx.fillStyle = '#ffffff';
    ctx.fillText(text, 128, 64 - 5);

    // Health Bar
    const hpPercent = Math.max(0, Math.min(1, hp / 150)); // Default 150 base
    const barWidth = 160;
    const barHeight = 6;
    const barX = 128 - barWidth / 2;
    const barY = 64 + 10;

    // Bar BG
    ctx.fillStyle = '#333';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    // Bar Fill
    const color = hpPercent > 0.5 ? '#00ff00' : (hpPercent > 0.2 ? '#ffff00' : '#ff0000');
    ctx.fillStyle = color;
    ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);

    const texture = new THREE.CanvasTexture(canvas);
    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(4, 2, 1); // Scale in world units
    sprite.position.y = 2.5; // Above head
    return sprite;
}

// Function to update existing nameplate (optimized to avoid recreating texture every frame if possible, 
// but for simplicity we will just redraw if HP changes dramatically or just simple redraw)
// Actually, creating a new canvas texture every frame is bad for GC. 
// Better: Return the canvas context/texture with the sprite to update it.
function updateNameplate(sprite, text, hp, maxHp) {
    const canvas = sprite.material.map.image;
    const ctx = canvas.getContext('2d');

    // Clear
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // BG
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.beginPath();
    ctx.roundRect(28, 64 - 24, 200, 48, 10); // Use simple rect if roundRect fails in some envs
    ctx.fill();

    // Name
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 36px Arial'; // Fallback
    ctx.textAlign = 'center';
    ctx.fillText(text, 128, 58);

    // HP Bar
    const hpPercent = Math.max(0, Math.min(1, hp / maxHp));
    const barWidth = 160;
    const barHeight = 8;
    const barX = 128 - barWidth / 2;
    const barY = 75;

    ctx.fillStyle = '#555';
    ctx.fillRect(barX, barY, barWidth, barHeight);

    ctx.fillStyle = hpPercent > 0.5 ? '#00ff00' : '#ff0000';
    ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);

    sprite.material.map.needsUpdate = true;
}

// ... Network Code ...
// Socket init moved to top


socket.on('connect', () => {
    console.log('Connected to server!');
    document.getElementById('connection-status').innerText = 'Connected: ' + socket.id;
    myFunctionId = socket.id;
});

socket.on('reload_start', (data) => {
    if (data.id === myFunctionId) {
        document.getElementById('ammo-count').style.color = 'red';
        document.getElementById('ammo-count').innerText = 'RELOADING...';

        // [FIX] Block Aiming
        amIReloading = true;

        // Local Animation
        const fpsWeapon = camera.getObjectByName('fpsWeapon');
        if (fpsWeapon) {
            fpsWeapon.rotation.x = Math.PI / 2; // Point down
            // fpsWeapon.position.y -= 0.2; // Lower gun (Optional, sometimes distracting if too much)
        }
    } else {
        // [FIX] Remote Animation
        if (players[data.id] && players[data.id].mesh) {
            // [NEW] Sync Pitch (Aim Up/Down)
            const p = players[data.id];
            const pData = data; // Assuming data contains rx
            if (p.mesh) {
                const shoulder = p.mesh.getObjectByName('rightShoulder');
                if (shoulder) {
                    // Base alignment is PI/2 (Forward).
                    // rx is Negative for Up, Positive for Down.
                    // We want Up to rotate towards PI (Back/Up), Down towards 0 (Down/Forward?? No wait)
                    // Arm Default (0) is DOWN (-Y).
                    // PI/2 is Forward (-Z).
                    // PI is Up (+Y).
                    // So Up requires INCREASING angle.
                    // rx is neg. So PI/2 - rx.
                    shoulder.rotation.x = Math.PI / 2 - (pData.rx || 0);
                }
                const head = p.mesh.getObjectByName('head');
                if (head) {
                    // Head Default (0) looks Forward (-Z).
                    // Positive Rot X looks UP.
                    // rx is neg for Up. So -rx.
                    head.rotation.x = -(pData.rx || 0);
                }
            }
            const shoulder = players[data.id].mesh.getObjectByName('rightShoulder');
            if (shoulder) {
                // Point arm down to reload
                // Default: rotation.x = Math.PI / 2 (Forward)
                // New: rotation.x = Math.PI (Down/Back) or just Math.PI/2 + 1.0
                shoulder.rotation.x = Math.PI / 2 + 1.0;
            }
        }
    }
});

socket.on('reload_end', (data) => {
    if (data.id === myFunctionId) {
        document.getElementById('ammo-count').style.color = '#00ffff';
        document.getElementById('ammo-count').innerText = data.ammo;

        // Local Restore
        amIReloading = false; // [FIX] Release aim block

        const fpsWeapon = camera.getObjectByName('fpsWeapon');
        if (fpsWeapon) {
            fpsWeapon.rotation.x = 0;
            // fpsWeapon.position.y += 0.2;
        }
    } else {
        // [FIX] Remote Restore
        if (players[data.id] && players[data.id].mesh) {
            const shoulder = players[data.id].mesh.getObjectByName('rightShoulder');
            if (shoulder) {
                shoulder.rotation.x = Math.PI / 2; // Restore to forward
            }
        }
    }
});

// [NEW] Death Handler
socket.on('death', (data) => {
    // 1. Visual Explosion
    createGiblets(new THREE.Vector3(data.x, data.y, data.z));

    // [FIX] Hide Player Immediately
    if (players[data.id]) {
        if (players[data.id].mesh) players[data.id].mesh.visible = false;
        if (players[data.id].nameplate) players[data.id].nameplate.visible = false;
        // [NEW] Set expiry to enforce hiding for 3s (prevents flicker)
        players[data.id].deathExpires = Date.now() + 3000;
    }
    // 2. Local Player UI
    if (data.id === myFunctionId) {
        // [new] Move Camera to Spawn View
        if (data.nextSpawn) {
            camera.position.set(data.nextSpawn.x, 15, data.nextSpawn.z + 10);
            camera.lookAt(data.nextSpawn.x, 0, data.nextSpawn.z);
        }

        const deathScreen = document.createElement('div');
        deathScreen.id = 'death-screen';
        Object.assign(deathScreen.style, {
            position: 'absolute', top: '0', left: '0', width: '100%', height: '100%',
            backgroundColor: 'rgba(50, 0, 0, 0.6)', color: 'white',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            fontFamily: "'Orbitron', sans-serif", textShadow: '0 0 20px black', zIndex: '2000'
        });

        // Killer Info
        const killerText = data.killerName ? `ELIMINATED BY <span style="color:#ff3333">${data.killerName}</span>` : 'ELIMINATED';
        const weaponText = data.killerWeapon ? `WEAPON: ${data.killerWeapon.toUpperCase()}` : '';

        deathScreen.innerHTML = `
            <div style="font-size: 4rem; font-weight: 900; margin-bottom: 20px">${killerText}</div>
            <div style="font-size: 1.5rem; color: #ccc; margin-bottom: 40px">${weaponText}</div>
            <div id="respawn-timer" style="font-size: 3rem; color: #ff00ff">RESPAWN IN 3.00</div>
            <div style="font-size: 1.2rem; color: #888; margin-top: 20px">DEPLOYING...</div>
        `;

        document.body.appendChild(deathScreen);

        // Countdown Timer
        let timeLeft = 3.00;
        const timerEl = document.getElementById('respawn-timer');
        const interval = setInterval(() => {
            timeLeft -= 0.05;
            if (timeLeft < 0) timeLeft = 0;
            if (timerEl) timerEl.innerText = `RESPAWN IN ${timeLeft.toFixed(2)}`;
        }, 50);

        // Remove after 3s
        setTimeout(() => {
            clearInterval(interval);
            if (deathScreen) deathScreen.remove();
        }, 3000);
    }
});



socket.on('shoot', (data) => {
    let startPos = new THREE.Vector3(data.start.x, data.start.y, data.start.z);

    if (data.id === myFunctionId) {
        const fpsWeapon = camera.getObjectByName('fpsWeapon');
        if (fpsWeapon) {
            camera.updateMatrixWorld(true);

            // Determine type based on slot
            let type = localStorage.getItem('selectedWeapon') || 'rifle';
            if (currentSlot === 1) type = 'knife';

            let zOffset = 0.6;
            if (type === 'sniper') zOffset = 1.25;
            if (type === 'shotgun') zOffset = 0.75;
            if (type === 'knife') zOffset = 0.3; // Short range

            const muzzleLocal = new THREE.Vector3(0, 0.05, zOffset);
            startPos = muzzleLocal.applyMatrix4(fpsWeapon.matrixWorld);
        }
    } else {
        // [FIX] Remote Player Origin
        if (players[data.id] && players[data.id].mesh) {
            const remoteWeapon = players[data.id].mesh.getObjectByName('weapon');
            if (remoteWeapon) {
                const zOffsetRemote = 1.0;
                const muzzleLocalRemote = new THREE.Vector3(0, zOffsetRemote, 0);
                startPos = muzzleLocalRemote.applyMatrix4(remoteWeapon.matrixWorld);
            } else {
                startPos.y -= 0.3;
            }
        }
    }

    // Muzzle Flash
    if (!isNaN(startPos.x)) {
        createMuzzleFlash(startPos);

        // Bullet & Damage
        const end = new THREE.Vector3(data.end.x, data.end.y, data.end.z);
        // [FIX] Only show damage numbers if WE dealt the damage
        const damageToShow = (data.id === myFunctionId) ? data.damage : 0;
        createBulletProjectile(startPos, end, data.hitId, damageToShow, data.zone);

        // [NEW] Damage Direction Indicator for Victim
        if (data.hitId === myFunctionId) {
            // Calculate direction to shooter
            // Shooter pos: startPos (approx)
            // My Pos: camera.position
            createDamageIndicator(startPos);
        }
    }
});

// --- VISUAL FX ---
function createBulletProjectile(start, end, hitId, damage, zone) {
    // Tracer Geometry: Use Shared Assets
    const length = 4.0;

    // Use clone if we need to scale? No, fixed size is fine. 
    // Actually, we can just use the shared ones.
    const bullet = new THREE.Mesh(projectileGeometry, projectileMaterial);

    // Position: Offset by half length so tail starts at muzzle
    const direction = new THREE.Vector3().subVectors(end, start).normalize();
    const spawnPos = start.clone().add(direction.clone().multiplyScalar(length / 2));

    bullet.position.copy(spawnPos);
    bullet.lookAt(end);

    scene.add(bullet);

    // Calculate velocity
    const speed = 300; // Fast bullets
    const distance = start.distanceTo(end);

    projectiles.push({
        mesh: bullet,
        direction: direction,
        speed: speed,
        distance: distance,
        traveled: 0,
        onComplete: () => {
            if (hitId && damage > 0) {
                createDamageNumber(end, damage, zone);
            }
        }
    });
}

function createMuzzleFlash(pos) {
    // Simple point light flash
    const light = new THREE.PointLight(0xffff00, 2, 3);
    light.position.copy(pos);
    scene.add(light);

    // Optional: Sprite for visual flare
    // const spriteMaterial = new THREE.SpriteMaterial({ color: 0xffff00 });
    // const sprite = new THREE.Sprite(spriteMaterial);
    // sprite.position.copy(pos);
    // sprite.scale.set(0.5, 0.5, 0.5);
    // scene.add(sprite);

    // Remove quickly
    setTimeout(() => {
        scene.remove(light);
        // scene.remove(sprite);
    }, 50);
}

function createDamageNumber(pos, dmg, zone) {
    const div = document.createElement('div');
    div.innerText = dmg;
    div.style.position = 'absolute';

    // [FIX] Colors: Head(Red), Body(Yellow), Legs(White)
    let color = '#ffffff'; // Default White (Legs)
    let size = '1.2rem';

    if (zone === 'head') {
        color = '#ff3333'; // Red
        size = '2rem';
    } else if (zone === 'body') {
        color = '#ffff00'; // Yellow
        size = '1.5rem';
    }

    div.style.color = color;
    div.style.fontWeight = 'bold';
    div.style.fontSize = size;
    div.style.textShadow = zone === 'head' ? '0 0 10px #ff0000' : '0 0 5px #000';
    div.style.pointerEvents = 'none';
    div.style.userSelect = 'none';
    div.style.fontFamily = "'Orbitron', sans-serif";
    div.style.zIndex = '2000'; // On top of everything

    // Project 3D pos to 2D screen
    const vec = new THREE.Vector3(pos.x, pos.y + 0.5, pos.z);
    vec.project(camera);

    const x = (vec.x * .5 + .5) * window.innerWidth;
    const y = (-(vec.y * .5) + .5) * window.innerHeight;

    div.style.left = `${x}px`;
    div.style.top = `${y}px`;

    document.body.appendChild(div);

    // Animate
    let opacity = 1;
    let up = 0;
    const anim = setInterval(() => {
        opacity -= 0.02;
        up += 1;
        div.style.opacity = opacity;
        div.style.top = `${y - up}px`;

        if (opacity <= 0) {
            clearInterval(anim);
            div.remove();
        }
    }, 16);
}

// [DEBUG] Test Helper
window.addEventListener('keydown', (e) => {
    if (e.key === 'p') {
        console.log('Testing Damage Indicator from P key');
        // Fake source 10 units to the right
        const rightSource = camera.position.clone().add(new THREE.Vector3(10, 0, 0));
        createDamageIndicator(rightSource);
    }
});

// [NEW] Damage Indicator Logic
function createDamageIndicator(sourcePos) {
    console.log('createDamageIndicator called with source:', sourcePos);
    const container = document.getElementById('damage-indicator-container');
    if (!container) {
        console.error('Damage Indicator Container not found!');
        return;
    }

    // 1. Get Camera Direction (Forward)
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    camDir.y = 0; // Flatten to XZ plane
    camDir.normalize();

    // 2. Get Vector to Source
    const toSource = new THREE.Vector3().subVectors(sourcePos, camera.position);
    toSource.y = 0; // Flatten
    toSource.normalize();

    // 3. Calculate Angle
    // Robust Method: Convert both to angles relative to North (-Z)
    const camAngle = Math.atan2(camDir.x, camDir.z);
    const sourceAngle = Math.atan2(toSource.x, toSource.z);

    // Relative Angle for CSS Rotation
    // We want the indicator to point TOWARDS the source.
    // CSS 0deg = Up (12 o'clock).
    // If Source is Forward (-Z), Cam Forward (-Z). Delta = 0.
    // If Source is Right (+X), Cam Forward (-Z).
    // camAngle = 180 (or -180). sourceAngle = 90.
    // We want CSS +90 (Right).
    // (180 - 90) = 90. Correct.
    // Let's verify Left (-X).
    // sourceAngle = -90.
    // (180 - (-90)) = 270 = -90. Correct (Left).
    // Let's verify Back (+Z). Source (0, 1). Angle 0.
    // (180 - 0) = 180. Back. Correct.

    const correctDeg = (camAngle - sourceAngle) * (180 / Math.PI);
    console.log(`Damage Math: CamAngle=${camAngle}, SourceAngle=${sourceAngle}, Deg=${correctDeg}`);

    const el = document.createElement('div');
    el.className = 'damage-indicator';
    el.style.setProperty('--angle', `${correctDeg}deg`);

    const arc = document.createElement('div');
    arc.className = 'damage-arc';
    el.appendChild(arc);

    container.appendChild(el);

    // Auto remove handled by CSS animation + timeout
    setTimeout(() => {
        el.remove();
    }, 1500);
}

socket.on('snapshot', (snapshot) => {
    const serverPIds = snapshot.players.map(p => p.id);

    // Remove disconnected
    for (const id in players) {
        if (!serverPIds.includes(id)) {
            scene.remove(players[id].mesh);
            delete players[id];
        }
    }

    // Update
    snapshot.players.forEach(pData => {
        if (!players[pData.id]) {
            // Pass pData.weapon from server
            const mesh = createPlayerMesh(pData.role, pData.weapon);
            // Create Nameplate
            const maxHp = 150; // TODO: Get from role stats
            const nameplate = createNameplate(pData.username || 'Agent', pData.hp, pData.role);
            mesh.add(nameplate);

            players[pData.id] = {
                mesh: mesh,
                nameplate: nameplate,
                id: pData.id,
                // [NEW] Interpolation Targets
                targetPos: new THREE.Vector3(pData.x, pData.y, pData.z),
                targetRot: pData.ry, // Body Y
                targetHeadRot: 0 // Head Pitch
            };
        }

        const p = players[pData.id];

        // [NEW] Walking Animation Logic
        // Calculate speed based on target delta, not raw snap
        const dx = pData.x - p.targetPos.x;
        const dz = pData.z - p.targetPos.z;
        const isMoving = (dx * dx + dz * dz) > 0.001;

        if (isMoving) {
            p.walkPhase = (p.walkPhase || 0) + 0.6;
            const angle = Math.sin(p.walkPhase) * 0.5;

            const leftLeg = p.mesh.getObjectByName('leftLeg');
            const rightLeg = p.mesh.getObjectByName('rightLeg');
            if (leftLeg) leftLeg.rotation.x = angle;
            if (rightLeg) rightLeg.rotation.x = -angle;
        } else {
            const leftLeg = p.mesh.getObjectByName('leftLeg');
            const rightLeg = p.mesh.getObjectByName('rightLeg');
            if (leftLeg) leftLeg.rotation.x = 0;
            if (rightLeg) rightLeg.rotation.x = 0;
        }

        // [FIX] Interpolation: Update Targets ONLY (Don't set mesh pos directly)
        p.targetPos.set(pData.x, pData.y, pData.z);
        if (pData.ry !== undefined) p.targetRot = pData.ry;
        if (pData.rx !== undefined) p.targetHeadRot = pData.rx;

        // Sync other states immediately
        p.ammo = pData.ammo;
        p.isReloading = (pData.ammo === 0 && !pData.isReloading) ? false : pData.isReloading;


        // [NEW] Sync Weapon Change
        // p.weapon is our local cache of what they had. pData.weapon is from server.
        if (p.weapon !== pData.weapon) {
            console.log(`[Sync] Player ${pData.username} switched to ${pData.weapon}`);
            p.weapon = pData.weapon;

            // Re-equip visual
            // Currently weapons are 'simple box' attached to body or complex mesh?
            // players[id].mesh structure:
            // Group -> [Head, Body, Legs, Arms...]
            // Weapon is usually attached to Right Arm or Body?
            // [FIX] Recursive Removal of ALL old weapons
            // Sometimes duplicates occur if 'rightArm' vs 'rightShoulder' confusion happens
            let oldWeapon = p.mesh.getObjectByName('weapon');
            while (oldWeapon) {
                oldWeapon.parent.remove(oldWeapon);
                oldWeapon = p.mesh.getObjectByName('weapon');
            }

            // Create new
            let newWeaponMesh;
            let isStlKnife = false;

            if (pData.weapon === 'knife' && cachedKnifeGeometry) {
                // Use Cached STL
                const knifeMat = new THREE.MeshStandardMaterial({
                    color: 0x333333,
                    roughness: 0.4,
                    metalness: 0.8,
                    side: THREE.DoubleSide
                });
                newWeaponMesh = new THREE.Mesh(cachedKnifeGeometry, knifeMat);
                isStlKnife = true;
                console.log('[Sync] Spawning Remote Knife (STL)');
            } else {
                // Fallback / Standard
                newWeaponMesh = createWeaponMesh(pData.weapon);

                // Trigger Load if needed
                if (pData.weapon === 'knife' && !cachedKnifeGeometry) {
                    console.log('[Sync] Triggering Knife Load for Remote...');
                    const loader = new STLLoader();
                    loader.load('/model/Knife/Knife.stl', (geo) => {
                        geo.center();
                        cachedKnifeGeometry = geo;
                        console.log('[Sync] Knife Loaded via Remote trigger.');
                        // Just let next update cycle fix it or leave placeholder for now
                    });
                }
            }

            newWeaponMesh.name = 'weapon';

            // Attach to Right Arm (Hand)
            let parent = p.mesh.getObjectByName('rightArm');
            if (parent) {
                newWeaponMesh.position.set(0, -0.8, 0); // Hand
            } else {
                parent = p.mesh.getObjectByName('rightShoulder');
                if (parent) {
                    newWeaponMesh.position.set(0, -0.8, 0.5);
                } else {
                    parent = p.mesh;
                    newWeaponMesh.position.set(0.4, 0.8, 0.4);
                }
            }

            // Scale & Rotation Adjustment
            if (isStlKnife) {
                // STL Scale
                newWeaponMesh.scale.set(0.12, 0.12, 0.12);
                // [FIX] Rotate X -90 to point "Up" (Sky)
                // Assuming Parent System: Z=Down, Y=Forward, X=Right (based on Rifle alignment)
                // Knife Native: Y=Up (Blade)
                // Goal: Blade to -Z (Up relative to ground?)
                newWeaponMesh.rotation.set(-Math.PI / 2, 6.1, 0);
            } else if (pData.weapon === 'knife') {
                // Procedural Fallback
                newWeaponMesh.scale.set(0.12, 0.12, 0.12);
                newWeaponMesh.rotation.set(-Math.PI / 2, 0, 0); // Match STL
            } else {
                // Guns
                newWeaponMesh.scale.set(1, 1, 1);
                newWeaponMesh.rotation.set(Math.PI / 2, 0, Math.PI); // Keep Rifle Aiming Forward
            }

            if (parent) parent.add(newWeaponMesh);
        }

        // Update Nameplate Logic

        // Update Nameplate Logic
        updateNameplate(p.nameplate, pData.username || 'Agent', pData.hp, 150);

        // [FIX] Handle Death Visibility
        const isDeadClient = p.deathExpires && Date.now() < p.deathExpires;
        const isDead = pData.isDead || isDeadClient;

        if (isDead) {
            p.mesh.visible = false;
            p.nameplate.visible = false;
            // Ensure scale is 0 just in case
            p.mesh.scale.set(0, 0, 0);
        } else {
            p.mesh.scale.set(1, 1, 1);
            p.mesh.visible = (pData.id !== myFunctionId); // Visible if not me
            p.nameplate.visible = (pData.id !== myFunctionId);
        }

        if (pData.id === myFunctionId) {
            // My Logic
            if (!pData.isDead) { // Only update camera if alive
                // [FIX] Update Target only
                if (isFirstSpawn) {
                    camera.position.set(pData.x, pData.y + 1.6, pData.z);
                    targetCamPos.set(pData.x, pData.y + 1.6, pData.z);
                    isFirstSpawn = false;
                } else {
                    targetCamPos.set(pData.x, pData.y + 1.6, pData.z);
                }
            }

            // Update HUD (Health & Ammo)
            const healthPercent = (pData.hp / 100) * 100;
            const healthEl = document.getElementById('health-fill');
            if (healthEl) healthEl.style.width = healthPercent + '%';

            const ammoEl = document.getElementById('ammo-count');
            if (ammoEl) {
                // Check for change to animate
                const currentVal = parseInt(ammoEl.innerText);
                // [FIX] Use p.ammo (now synced) instead of undefined check failure
                if (p.ammo < currentVal) {
                    // Trigger Pulse
                    ammoEl.classList.remove('ammo-pulse');
                    void ammoEl.offsetWidth;
                    ammoEl.classList.add('ammo-pulse');
                }

                ammoEl.innerText = p.ammo;

                // Reload Styling
                if (p.ammo === 0) {
                    ammoEl.style.color = 'red';
                } else {
                    ammoEl.style.color = '#00ffff';
                }
            }

        } else {
            // [NEW] Sync Aim Pitch (rx) for Remote Players is handled in LERP loop now
        }
    });



});

// --- DEATH / KILL FEED ---
socket.on('death', (data) => {
    // data: { id, victimName, killerName, killerWeapon, ... }
    const killFeed = document.getElementById('kill-feed');
    const eliminationMsgs = document.getElementById('elimination-messages');

    // Fallback for victimName
    const victimName = data.victimName || players[data.id]?.username || 'Player';

    // Weapon icons
    // Weapon icons
    const weaponIcons = {
        'rifle': '/assets/icons/rifle.png',
        'sniper': '/assets/icons/sniper.png',
        'shotgun': '/assets/icons/shotgun.png'
    };
    const weaponCurrent = weaponIcons[data.killerWeapon] || weaponIcons['rifle']; // Fallback

    // Add entry to kill feed (visible to everyone)
    const entry = document.createElement('div');
    entry.className = 'kill-entry';
    entry.innerHTML = `
        <span class="killer">${data.killerName}</span>
        <img src="${weaponCurrent}" class="weapon-icon" />
        <span class="victim">${victimName}</span>
    `;
    killFeed.insertBefore(entry, killFeed.firstChild);

    // Remove after 5 seconds
    setTimeout(() => {
        if (entry.parentElement) entry.remove();
    }, 5000);

    // Keep only last 5 entries
    while (killFeed.children.length > 5) {
        killFeed.removeChild(killFeed.lastChild);
    }

    // Personal elimination message (only for killer)
    if (data.killerName === username) {
        const msg = document.createElement('div');
        msg.className = 'elimination-msg';
        msg.textContent = `You eliminated ${victimName}`;
        eliminationMsgs.appendChild(msg);

        // Remove after 3 seconds
        setTimeout(() => {
            if (msg.parentElement) msg.remove();
        }, 3000);

        // Keep only last 3 messages
        while (eliminationMsgs.children.length > 3) {
            eliminationMsgs.removeChild(eliminationMsgs.firstChild);
        }
    }
});

// --- LEADERBOARD ---
socket.on('leaderboard_update', (data) => {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;

    list.innerHTML = data.map((p, i) => `
        <div class="leaderboard-entry">
            <span>${i + 1}. ${p.username}</span>
            <span>${p.kills}</span>
        </div>
    `).join('');
});

// --- INPUT ---
const keys = { w: false, a: false, s: false, d: false, ' ': false, mouseLeft: false, mouseLeftProcessed: false, mouseRight: false, r: false };
window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false;
});

// Button Listeners
window.addEventListener('mousedown', (e) => {
    if (controls.isLocked) {
        if (e.button === 0) keys.mouseLeft = true;
        if (e.button === 2) keys.mouseRight = true;
    }
});
window.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
        keys.mouseLeft = false;
        keys.mouseLeftProcessed = false; // Reset lock
    }
    if (e.button === 2) keys.mouseRight = false;
});

// [NEW] Weapon Switching Input
window.addEventListener('keydown', (e) => {
    if (!controls.isLocked) return;

    // Slot 1: Knife
    if (e.key === '1') {
        if (currentSlot !== 1) {
            currentSlot = 1;
            showInventoryNotification('KNIFE');
            attachFPSWeapon();
            socket.emit('switch_weapon', 'knife');
        }
    }
    // Slot 2: Primary
    else if (e.key === '2') {
        if (currentSlot !== 2) {
            currentSlot = 2;
            const primary = localStorage.getItem('selectedWeapon') || 'rifle';
            showInventoryNotification(primary.toUpperCase());
            attachFPSWeapon();
            socket.emit('switch_weapon', primary);
        }
    }
});

function showInventoryNotification(text) {
    let el = document.getElementById('inv-notify');
    if (!el) {
        el = document.createElement('div');
        el.id = 'inv-notify';
        Object.assign(el.style, {
            position: 'absolute', bottom: '100px', right: '20px',
            color: '#00ffff', fontFamily: "'Orbitron', sans-serif", fontSize: '24px',
            textShadow: '0 0 10px #00ffff', opacity: '0', transition: 'opacity 0.5s'
        });
        document.body.appendChild(el);
    }
    el.innerText = text;
    el.style.opacity = '1';

    // Fade out
    setTimeout(() => {
        el.style.opacity = '0';
    }, 1500);
}

setInterval(() => {
    if (!myFunctionId) return;

    if (controls.isLocked === true) {
        const cameraDir = new THREE.Vector3();
        camera.getWorldDirection(cameraDir);
        const forward = new THREE.Vector2(cameraDir.x, cameraDir.z).normalize();
        const right = new THREE.Vector2(-forward.y, forward.x);

        let moveX = 0;
        let moveZ = 0;
        if (keys.w) { moveX += forward.x; moveZ += forward.y; }
        if (keys.s) { moveX -= forward.x; moveZ -= forward.y; }
        if (keys.d) { moveX += right.x; moveZ += right.y; }
        if (keys.a) { moveX -= right.x; moveZ -= right.y; }

        const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
        if (len > 0) {
            moveX /= len;
            moveZ /= len;
        }

        // Camera Direction for shooting
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);

        let shouldShoot = false;
        if (keys.mouseLeft) {
            shouldShoot = true;
            // keys.mouseLeftProcessed = true; // [FIX] Removed for Auto Fire
        }

        // --- SNIPER LOGIC (Inaccuracy + Scop Sensitivity) ---
        const weaponName = (currentSlot === 1) ? 'knife' : (localStorage.getItem('selectedWeapon') || 'rifle');

        // [FIX] Block aiming if reloading OR if holding Knife
        const isAiming = keys.mouseRight && !amIReloading && weaponName !== 'knife';

        // 1. Sensitivity
        if (isAiming) {
            controls.pointerSpeed = baseSensitivity * scopeMultiplier;
        } else {
            controls.pointerSpeed = baseSensitivity;
        }

        // 2. Inaccuracy (No-Scope)
        // If shooting, Sniper, and NOT aiming -> Add Jitter
        if (shouldShoot && weaponName === 'sniper' && !isAiming) {
            // Add severe random jitter to camDir
            const jitter = 0.3; // 30% deviation (Heavy)
            camDir.x += (Math.random() - 0.5) * jitter;
            camDir.y += (Math.random() - 0.5) * jitter;
            camDir.z += (Math.random() - 0.5) * jitter;
            camDir.normalize();
        }

        // [NEW] KNIFE INPUT LOGIC
        if (currentSlot === 1) {
            shouldShoot = false; // Never "shoot" via standard input event

            const now = Date.now();
            if (keys.mouseLeft && (now - lastMeleeTime > 500)) {
                performMeleeAttack('light');
                keys.mouseLeftProcessed = true; // Prevent spam?
            } else if (keys.mouseRight && (now - lastMeleeTime > 1200)) {
                performMeleeAttack('heavy');
            }
        }

        const inputKey = {
            moveDir: { x: moveX, y: moveZ },
            jump: keys[' '],
            shoot: shouldShoot,
            reload: keys.r,
            viewDir: { x: camDir.x, y: camDir.y, z: camDir.z }
        };
        socket.emit('input', inputKey);

        // Reset Reload trigger
        keys.r = false;

        // --- SNIPER SCOPE VISUALS ---
        // Client-side visual only
        const scopeEl = document.getElementById('sniper-scope');
        const crosshairEl = document.getElementById('crosshair');
        const fpsWeapon = camera.getObjectByName('fpsWeapon');

        // Smooth Zoom
        const baseFOV = parseInt(localStorage.getItem('userFOV') || '75');
        let targetFov = baseFOV;

        if (isAiming) {
            targetFov = 20; // Zoomed
            // Only show scope overlay for sniper
            if (weaponName === 'sniper') {
                scopeEl.style.display = 'block';
                crosshairEl.style.display = 'none';
            } else {
                scopeEl.style.display = 'none';
                crosshairEl.style.display = 'block';
            }
            if (fpsWeapon) fpsWeapon.visible = false;
        } else {
            scopeEl.style.display = 'none';
            crosshairEl.style.display = 'block';
            if (fpsWeapon) fpsWeapon.visible = true;
        }

        // [FIX] Update Globals for Animation Loop
        isAimingGlobal = isAiming;
        targetFovGlobal = isAiming ? 20 : parseInt(localStorage.getItem('userFOV') || '75');

        // Lerp FOV moved to animate() for smoothness
    }
}, 1000 / 30);

// [FIX] Global Aim State for Animation Loop
let isAimingGlobal = false;
let targetFovGlobal = 75; // Default
let amIReloading = false; // [NEW] Track reload state
let targetCamPos = new THREE.Vector3(); // [NEW] Local Interpolation Target
let isFirstSpawn = true; // [NEW] Snap on first spawn

// [NEW] KNIFE SYSTEMS
let lastMeleeTime = 0;
let isAttacking = false;

function performMeleeAttack(type) {
    lastMeleeTime = Date.now();

    // 1. Local Animation
    animateKnifeSwing(type);

    // 2. Network Event
    socket.emit('melee_attack', { type: type });
}

function animateKnifeSwing(type) {
    const fpsWeapon = camera.getObjectByName('fpsWeapon');
    if (!fpsWeapon) return;

    // Reset logic could be complex, simple procedural animation:
    // We can use a global 'swingPhase' in animate(), or a one-off TWEEN-like interaction
    // Let's use a simple CSS-based class or modify rotation via a temporary object we check in animate()

    // Actually, let's inject a "swing" object into the weapon for the animate loop to pick up
    fpsWeapon.userData.swinging = true;
    fpsWeapon.userData.swingStart = Date.now();
    fpsWeapon.userData.swingType = type; // 'light' or 'heavy'
}

// Handle Remote Melee Actions (Visuals/Sound)
socket.on('melee_action', (data) => {
    // data: { attackerId, type, hitId, damage }
    if (data.attackerId === myFunctionId) {
        // I hit someone
        if (data.hitId) {
            // Show Hitmarker?
            // Already handled by createBulletProjectile logic usually, but we can reuse createDamageNumber
            // Need position of victim.
            const victim = players[data.hitId];
            if (victim && victim.mesh) {
                createDamageNumber(victim.mesh.position, data.damage, 'body');
            }
        }
    } else {
        // Someone else attacked
        const attacker = players[data.attackerId];
        if (attacker && attacker.mesh) {
            // Play remote swing animation?
            // Simple: Rotate their arm temporarily
            playRemoteSwing(attacker.mesh, data.type);
        }
    }
});

function playRemoteSwing(mesh, type) {
    const rightArm = mesh.getObjectByName('rightArm'); // The simplified player mesh might not have 'rightArm', it has 'rightShoulder'
    const rotObj = mesh.getObjectByName('rightShoulder') || mesh;

    // Simple visual cue: Flash color or rotate
    const originalRot = rotObj.rotation.x;

    // Quick down swing
    let duration = type === 'heavy' ? 500 : 250;

    // We can't blocking anim here. Just set a flag or run a quick interval.
    // Interval for simplicity
    let t = 0;
    const interval = setInterval(() => {
        t += 20;
        const progress = t / duration;
        if (progress >= 1) {
            rotObj.rotation.x = originalRot; // Reset (roughly)
            clearInterval(interval);
            return;
        }

        // Swing logic: Up then Down
        const phase = Math.sin(progress * Math.PI); // 0 -> 1 -> 0
        rotObj.rotation.x = originalRot + (phase * 1.5);

    }, 20);
}

// --- FPS WEAPON SETUP ---
let currentWeaponType = localStorage.getItem('selectedWeapon') || 'rifle';
// Track slots: 1 = Knife, 2 = Primary
let currentSlot = 2; // Default to primary
// [NEW] Geometry Cache
let cachedKnifeGeometry = null;

function attachFPSWeapon() {
    // Remove old if exists
    const old = camera.getObjectByName('fpsWeapon');
    if (old) camera.remove(old);

    // Determine weapon based on slot
    let weaponToSpawn = currentWeaponType;
    if (currentSlot === 1) {
        weaponToSpawn = 'knife';
    }

    if (weaponToSpawn === 'knife') {

        // Helper to build the rig once geometry is ready
        const buildRig = (geometry) => {
            // ... The existing rig building code ...
            // We need to extract this logic to reuse it or just duplicate simple parts? 
            // Ideally, refactor, but for 'Replace', I will inline or use a helper if possible.
            // Since I can't easily refactor into a helper function outside without changing more code, 
            // I will modify the flow to handle both Cached and Async paths.
        };

        // Actually, let's keep it simple:
        // If cached, run logic immediately.
        // If not, show loader.
        const buildKnifeRig = (geometry) => {
            if (currentSlot !== 1) return;
            // geometry.center(); // Assumed already centered if cached? No, safe to call again or clone.
            // basic centering might shift if called multiple times? 
            // Better to clone geometry?
            // geometry = geometry.clone(); 

            // Main FPS Rig Group
            const rigGroup = new THREE.Group();
            rigGroup.name = 'fpsWeapon';

            // Materials
            const sleeveMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a });
            const skinMat = new THREE.MeshStandardMaterial({ color: 0xffccaa });
            const knifeMat = new THREE.MeshStandardMaterial({
                color: 0x333333,
                roughness: 0.4,
                metalness: 0.8,
                side: THREE.DoubleSide
            });

            // Geometry Helpers
            const armGeo = new THREE.BoxGeometry(0.15, 0.15, 0.6);
            const handGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);

            // --- RIGHT ARM ---
            const rightArmGroup = new THREE.Group();
            const rArmMesh = new THREE.Mesh(armGeo, sleeveMat);
            rArmMesh.position.set(0, 0, 0.2);
            const rHandMesh = new THREE.Mesh(handGeo, skinMat);
            rHandMesh.position.set(0, 0, -0.15);

            const knifeMesh = new THREE.Mesh(geometry, knifeMat);
            knifeMesh.scale.set(0.06, 0.06, 0.06);
            knifeMesh.rotation.set(0, -Math.PI / 11, 0);
            knifeMesh.position.set(-0.08, 0.25, -0.2);

            rightArmGroup.add(rArmMesh);
            rightArmGroup.add(rHandMesh);
            rightArmGroup.add(knifeMesh);
            rightArmGroup.position.set(0.5, -0.5, -0.6);
            rightArmGroup.rotation.set(0, 0.1, 0);

            // --- LEFT ARM ---
            const leftArmGroup = new THREE.Group();
            const lArmMesh = new THREE.Mesh(armGeo, sleeveMat);
            lArmMesh.position.set(0, 0, 0.2);
            const lHandMesh = new THREE.Mesh(handGeo, skinMat);
            lHandMesh.position.set(0, 0, -0.15);

            leftArmGroup.add(lArmMesh);
            leftArmGroup.add(lHandMesh);
            leftArmGroup.position.set(-0.5, -0.5, -0.6);
            leftArmGroup.rotation.set(0, -0.1, 0);

            rigGroup.add(rightArmGroup);
            rigGroup.add(leftArmGroup);
            rigGroup.rotation.set(0, 0, 0);

            camera.add(rigGroup);
        };

        if (cachedKnifeGeometry) {
            // Instant Load
            buildKnifeRig(cachedKnifeGeometry);
        } else {
            // First Time Load
            // Placeholder
            const loadingGeo = new THREE.BoxGeometry(0.1, 0.1, 0.5);
            const loadingMat = new THREE.MeshBasicMaterial({ color: 0xffff00, wireframe: true });
            const loadingMesh = new THREE.Mesh(loadingGeo, loadingMat);
            loadingMesh.position.set(0.35, -0.25, -0.6);
            loadingMesh.name = 'fpsWeapon';
            camera.add(loadingMesh);

            const loader = new STLLoader();
            loader.load('/model/Knife/Knife.stl', (geometry) => {
                // Remove Placeholder
                const placeholder = camera.getObjectByName('fpsWeapon');
                if (placeholder) camera.remove(placeholder);

                console.log('[Knife] Cached Geometry.');
                geometry.center();
                cachedKnifeGeometry = geometry; // Cache it!

                buildKnifeRig(geometry);
            }, undefined, (err) => {
                console.error('Error loading knife STL:', err);
                // Fallback
                const geometry = new THREE.BoxGeometry(0.1, 0.1, 0.5);
                const material = new THREE.MeshBasicMaterial({ color: 0xff0000 });
                const fallbackMesh = new THREE.Mesh(geometry, material);
                fallbackMesh.position.set(0.5, -0.5, -0.6);
                fallbackMesh.name = 'fpsWeapon';
                camera.add(fallbackMesh);
            });
        }
        return;
    }

    const weapon = createWeaponMesh(weaponToSpawn);
    weapon.name = 'fpsWeapon';

    // Position for FPS view (Right hand side, slightly forward)
    // [FIX] Moved UP and CLOSER clearly into view
    weapon.position.set(0.35, -0.25, -0.6);
    weapon.rotation.set(0, Math.PI, 0); // Face straight forward (-Z)

    // Specific tweaks for Knife
    if (weaponToSpawn === 'knife') {
        weapon.position.set(0.35, -0.3, -0.4); // Closer
        weapon.rotation.set(0, Math.PI, Math.PI / 2); // Rotated to look like held knife? 
        // Actually, let's keep it simple first.
        // Blade forward.
        weapon.rotation.set(0, Math.PI, 0);
    }

    // Scale
    weapon.scale.set(1, 1, 1); // Normal size

    camera.add(weapon);
}
attachFPSWeapon();

// --- INPUT LISTENERS ---
window.addEventListener('keydown', (e) => {
    // Weapon Switching
    if (e.key === '1') {
        if (currentSlot !== 1) {
            currentSlot = 1;
            attachFPSWeapon();
            socket.emit('switch_weapon', 'knife'); // [NEW] Notify Server
        }
    }
    if (e.key === '2') {
        if (currentSlot !== 2) {
            currentSlot = 2;
            currentWeaponType = localStorage.getItem('selectedWeapon') || 'rifle'; // Refresh in case changed
            attachFPSWeapon();
            socket.emit('switch_weapon', currentWeaponType); // [NEW] Notify Server
        }
    }
});
window.addEventListener('mousedown', (e) => {
    if (controls.isLocked) {
        if (e.button === 0) keys.mouseLeft = true;
        if (e.button === 2) keys.mouseRight = true;
    }
});
window.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
        keys.mouseLeft = false;
        keys.mouseLeftProcessed = false;
    }
    if (e.button === 2) {
        keys.mouseRight = false;
    }
});

// --- ANIMATION / RENDER ---
const clock = new THREE.Clock();
function animate() {
    requestAnimationFrame(animate);
    const dt = clock.getDelta();

    // Update Projectiles
    for (let i = projectiles.length - 1; i >= 0; i--) {
        const p = projectiles[i];
        const moveDist = p.speed * dt;
        p.mesh.position.addScaledVector(p.direction, moveDist);
        p.traveled += moveDist;

        if (p.traveled >= p.distance) {
            // Hit target
            scene.remove(p.mesh);
            // DO NOT dispose shared geometry/material
            projectiles.splice(i, 1);
            if (p.onComplete) p.onComplete();
        }
    }

    // [NEW] Update Particles (Giblets)
    for (let i = activeParticles.length - 1; i >= 0; i--) {
        const p = activeParticles[i];
        const now = Date.now();
        if (now - p.startTime > p.duration) {
            scene.remove(p.mesh);
            activeParticles.splice(i, 1);
            continue;
        }

        // Physics
        p.velocity.y -= 9.8 * dt; // Gravity
        p.mesh.position.addScaledVector(p.velocity, dt);
        p.mesh.rotation.x += p.rotVel.x;
        p.mesh.rotation.z += p.rotVel.z;
    }

    // [NEW] ANIMATE KNIFE SWING
    const fpsWeapon = camera.getObjectByName('fpsWeapon');
    if (fpsWeapon && fpsWeapon.userData.swinging) {
        const now = Date.now();
        const start = fpsWeapon.userData.swingStart;
        const type = fpsWeapon.userData.swingType;
        const duration = type === 'heavy' ? 400 : 150; // Heavy is slower

        const progress = Math.min(1, (now - start) / duration);

        // Anim Curves
        // Light: Quick rotation Z/X
        // Heavy: Big thrust forward + X rotation

        if (type === 'light') {
            const phase = Math.sin(progress * Math.PI); // 0 -> 1 -> 0
            // Rotation Swing
            // Original: 0, 0, 0 (roughly, relative to internal)
            // Swing: Rotate X down, Z sideways
            fpsWeapon.rotation.x = 0 + (phase * 0.5);
            fpsWeapon.rotation.y = 0 + (phase * 0.5);
            fpsWeapon.position.z = -0.6 - (phase * 0.2); // Thrust a bit? Wait, original pos is specific.
            // Better to rely on relative rotation if possible.
            // But we modified the Group's transform in attach(). 
            // attach() set: rigGroup.position.set(0,0,0) (No, added to camera directly?)
            // attach() set: handGroup.position.set(0.4, -0.4, -0.5); etc.
            // Actually, `fpsWeapon` IS that group.
            // Default Pos (Logic): (0.5, -0.5, -0.6) inside the knife block? 
            // Wait, attachFPSWeapon() sets rigGroup as fpsWeapon.
            // rigGroup doesn't have a set position?
            // Yes: rigGroup.add(rightArm)... NO.
            // rigGroup was 'camera.add(rigGroup)'.
            // rigGroup contains rightArmGroup.
            // rightArmGroup.position.set(0.5, -0.5, -0.6);

            // If we rotate `fpsWeapon` (rigGroup), it rotates around camera origin (0,0,0).
            // This acts like a "View Bob".
            fpsWeapon.rotation.x = phase * 0.2;
            fpsWeapon.rotation.z = -phase * 0.1;
        } else {
            // Heavy Stab
            const phase = Math.sin(progress * Math.PI);
            // Big lunge forward
            // Careful, z is negative forward.
            // fpsWeapon.position is (0,0,0) relative to camera initially? 
            // We never set fpsWeapon.position in the NEW stl block!
            // We set children positions.
            // So fpsWeapon is at 0,0,0. Perfect.

            fpsWeapon.position.z = -phase * 0.5; // Lunge 0.5 units forward
            fpsWeapon.rotation.x = phase * 0.1;
        }

        if (progress >= 1) {
            fpsWeapon.userData.swinging = false;
            // Reset transforms
            fpsWeapon.rotation.set(0, 0, 0);
            fpsWeapon.position.set(0, 0, 0);
        }
    }

    renderer.render(scene, camera);

    // [FIX] Smooth FOV Interpolation (60fps+)
    if (Math.abs(camera.fov - targetFovGlobal) > 0.1) {
        // Use time-independent lerp if possible, or simple smooth factor
        // A factor of 0.1 at 60fps is approx 0.2 at 30fps. 
        // We want fast snap for sniper.
        const lerpFactor = isAimingGlobal ? 0.25 : 0.15;

        camera.fov += (targetFovGlobal - camera.fov) * lerpFactor;
        camera.updateProjectionMatrix();
    }

    // [NEW] Interpolate Remote Players
    const lerpSpeed = 10.0 * dt; // Adjust smoothness (10 is snappy but smooth)
    for (const id in players) {
        if (id === myFunctionId) continue; // Skip self (snapped)

        const p = players[id];
        if (p.mesh && p.targetPos) {
            // Position Lerp
            p.mesh.position.lerp(p.targetPos, lerpSpeed);

            // Rotation Y (Body) Lerp (Shortest path?)
            // Simple Lerp for now (Quaternion is better but Euler ok for Y)
            // Fix wrap-around issue manually if needed, but for now simple approach:
            if (p.targetRot !== undefined) {
                // Basic lerp on float angle
                p.mesh.rotation.y += (p.targetRot - p.mesh.rotation.y) * lerpSpeed;
            }

            // Head Pitch Lerp
            if (p.targetHeadRot !== undefined) {
                const shoulder = p.mesh.getObjectByName('rightShoulder');
                if (shoulder) {
                    const targetX = (Math.PI / 2) - p.targetHeadRot;
                    shoulder.rotation.x += (targetX - shoulder.rotation.x) * lerpSpeed;
                }
                const head = p.mesh.getObjectByName('head');
                if (head) {
                    const targetHeadX = -p.targetHeadRot;
                    head.rotation.x += (targetHeadX - head.rotation.x) * lerpSpeed;
                }
            }
        }
    }

    // [NEW] Local Camera Interpolation
    if (targetCamPos.lengthSq() > 0) {
        // Distance check to prevent huge lerps on respawn if missed
        if (camera.position.distanceTo(targetCamPos) > 5.0) {
            camera.position.copy(targetCamPos); // Snap if too far
        } else {
            camera.position.lerp(targetCamPos, 15.0 * dt);
        }
    }
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
