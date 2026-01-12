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

// --- CONFIG ---
const SERVER_URL = 'http://localhost:3000';
const TICK_RATE = 60;

// --- STATE ---
const players = {};
let myFunctionId = null;

// --- NETWORK SETUP ---
const userId = localStorage.getItem('userId');
const username = localStorage.getItem('username');
const selectedWeapon = localStorage.getItem('selectedWeapon') || 'rifle';

const socket = io(SERVER_URL, {
    auth: { token: userId, username: username },
    query: { weapon: selectedWeapon } // Send local choice
});

// --- THREE.JS SETUP ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB); // Sky Blue
scene.fog = new THREE.Fog(0x87CEEB, 20, 100); // Standard Fog (not Exp2) for cleaner visibility

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.layers.enable(0);
scene.add(camera); // [FIX] Ensure camera is in scene so its children (FPS Weapon) render

const renderer = new THREE.WebGLRenderer({ antialias: false }); // Antialias false recommended for PostProcessing often
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ReinhardToneMapping;
renderer.toneMappingExposure = 1.5;
document.body.appendChild(renderer.domElement);

// --- RENDERER SETUP (NO BLOOM) ---
// const composer = new EffectComposer(renderer); 
// composer.addPass(renderScene);
// composer.addPass(bloomPass);
// We will just use renderer.render(scene, camera) directly in animate()


// --- LEVEL GENERATION ---
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
    instructions.style.display = 'none';
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
document.getElementById('sens-slider').addEventListener('input', (e) => {
    controls.pointerSpeed = parseFloat(e.target.value);
});

document.getElementById('bright-slider').addEventListener('input', (e) => {
    renderer.toneMappingExposure = parseFloat(e.target.value);
});

document.getElementById('fov-slider').addEventListener('input', (e) => {
    camera.fov = parseInt(e.target.value);
    camera.updateProjectionMatrix();
});


// --- CHARACTER GENERATION (Detailed) ---
function createPlayerMesh(role, weaponType) {
    const group = new THREE.Group();
    group.castShadow = true;

    // --- TEXTURES ---
    function createCamoTexture() {
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

        return new THREE.CanvasTexture(canvas);
    }
    const camoTexture = createCamoTexture();
    camoTexture.magFilter = THREE.NearestFilter; // Pixelated look

    // Common materials
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8 });
    const camoMat = new THREE.MeshStandardMaterial({ map: camoTexture, roughness: 0.9 });
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xffdbac, roughness: 0.5 }); // Skin tone for hands if needed

    // Defaults
    let bodyColor = 0x0088ff;
    let accentColor = 0xffaa00;

    // ... (Keep existing role logic check if needed, but we override for visual style requested)
    // User asked to "add the skin", implying replacement or update. 
    // Let's use Camo for Vanguard (default).

    const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.8 });
    let mainMat = bodyMat;
    if (role === 'vanguard') {
        mainMat = camoMat;
        accentColor = 0xffd700; // Keep gold visor? Or maybe black/dark? Image shows Yellow visor.
    }

    const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.4 });
    const eyeMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.2 });

    // 1. Torso
    let torsoW = 1, torsoH = 1.2, torsoD = 0.6;
    if (role === 'titan') { torsoW = 1.4; torsoD = 0.8; }
    if (role === 'shadow') { torsoW = 0.9; }

    const torso = new THREE.Mesh(new THREE.BoxGeometry(torsoW, torsoH, torsoD), mainMat);
    torso.position.y = 0.6;
    torso.castShadow = true;
    group.add(torso);

    // Chest detail (Vest)
    if (role === 'vanguard') {
        const vest = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.8, 0.7), camoMat); // Slightly bulkier camo vest
        vest.position.set(0, 0, 0);
        torso.add(vest);

        // Yellow plate from image
        const plate = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.5, 0.1), accentMat);
        plate.position.set(0, 0.2, -0.36); // Front
        torso.add(plate);
    }

    // 2. Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.6), mainMat);
    head.position.y = 1.6;
    head.castShadow = true;
    group.add(head);

    // Helmet (New)
    if (role === 'vanguard') {
        const helmetGroup = new THREE.Group();

        // Dome
        const dome = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.7), camoMat);
        dome.position.y = 0.35;
        helmetGroup.add(dome);

        // Brim/Sides
        const brim = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.15, 0.8), camoMat);
        brim.position.y = 0.2;
        helmetGroup.add(brim);

        head.add(helmetGroup);
    }

    // Visor/Eyes
    if (role === 'vanguard') {
        // Image shows a large rectangular yellow/gold visor
        const visor = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.1), accentMat);
        visor.position.set(0, 0, -0.31);
        head.add(visor);
    } else if (role === 'shadow') {
        const hood = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 0.7), bodyMat);
        head.add(hood);
        const eye1 = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.05), eyeMat);
        eye1.position.set(-0.15, 0, -0.36); // Move to -Z (Front)
        head.add(eye1);
        const eye2 = eye1.clone();
        eye2.position.set(0.15, 0, -0.36); // Move to -Z (Front)
        head.add(eye2);
    } else if (role === 'titan') {
        const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.3, 0.7), accentMat);
        jaw.position.set(0, -0.2, 0);
        head.add(jaw);
        const eye = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.1), eyeMat);
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

    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(armW, armH, armD), mainMat);
    leftArm.position.set(0, -0.4, 0); // Offset so pivot is at top
    leftShoulder.add(leftArm);

    // --- RIGHT ARM ---
    const rightShoulder = new THREE.Group();
    rightShoulder.position.set(armOffset, 1.1, 0); // Shoulder Height
    group.add(rightShoulder);

    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(armW, armH, armD), mainMat);
    rightArm.position.set(0, -0.4, 0); // Offset so pivot is at top
    rightShoulder.add(rightArm);

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

    // Weapon Alignment
    // 1. Align with Arm (-Y): Rotate X +90 (Math.PI/2).
    // 2. Fix "Upside Down" (Mag Up): Rotate Z +180 (Math.PI).
    weapon.rotation.set(Math.PI / 2, 0, Math.PI);

    // Position: At the "hand" (bottom of arm mesh)
    weapon.position.set(0, -0.8, 0.2);

    rightArm.add(weapon);

    const legW = 0.36, legH = 1.2, legD = 0.4;
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(legW, legH, legD), darkMat);
    leftLeg.position.set(-(torsoW / 4), -0.6, 0);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(legW, legH, legD), darkMat);
    rightLeg.position.set((torsoW / 4), -0.6, 0);
    group.add(rightLeg);

    scene.add(group);
    return group;
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


socket.on('connect_error', (error) => {
    console.error('Connection Error:', error);
    document.getElementById('connection-status').innerText = 'Connection Failed: ' + error.message;
});

socket.on('connect', () => {
    console.log('Connected to server!');
    document.getElementById('connection-status').innerText = 'Connected: ' + socket.id;
    myFunctionId = socket.id;
});

socket.on('reload_start', (data) => {
    // Play reload sound or animation if we had them
    if (data.id === myFunctionId) {
        document.getElementById('ammo-count').style.color = 'red';
        document.getElementById('ammo-count').innerText = 'RELOADING...';
    }
});

socket.on('reload_end', (data) => {
    if (data.id === myFunctionId) {
        document.getElementById('ammo-count').style.color = '#00ffff';
        // Actual ammo update happens in update loop or next snapshot, but we can set it here too
        document.getElementById('ammo-count').innerText = data.ammo;
    }
});

socket.on('shoot', (data) => {
    let startPos = new THREE.Vector3(data.start.x, data.start.y, data.start.z);

    // [FIX] Realistic Tracers: Originate from Gun Muzzle
    if (data.id === myFunctionId) {
        const fpsWeapon = camera.getObjectByName('fpsWeapon');
        if (fpsWeapon) {
            const type = localStorage.getItem('selectedWeapon') || 'rifle';
            let zOffset = 0.6; // Rifle
            if (type === 'sniper') zOffset = 1.2;
            if (type === 'shotgun') zOffset = 0.7;

            // Gun model points +Z, but is rotated 180 to face World -Z.
            // So we take local (0, 0.05, zOffset) and transform to World.
            // Added slight Y offset (0.05) for barrel height.
            const muzzleLocal = new THREE.Vector3(0, 0.05, zOffset);
            startPos = muzzleLocal.applyMatrix4(fpsWeapon.matrixWorld);
        }
    } else {
        // Remote Player: Try to find weapon or use Head/Chest
        if (players[data.id] && players[data.id].mesh) {
            // Ideally: find weapon child in mesh.
            // Simpler: Just use data.start (Head/Camera) but offset slightly right/down?
            // Using data.start is 'correct' for hitscan origin, visual mismatch is minor for enemies.
        }
    }

    // 1. Tracers
    createTracer(startPos, data.end);

    // 2. Play Sound (Optional future)

    // 3. Floating Damage Number
    if (data.hitId && data.damage > 0) {
        createDamageNumber(data.end, data.damage, data.isCrit);
    }
});

// --- VISUAL FX ---
function createTracer(start, end) {
    const points = [];
    points.push(new THREE.Vector3(start.x, start.y, start.z));
    points.push(new THREE.Vector3(end.x, end.y, end.z));

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
        color: 0xffff00,
        transparent: true,
        opacity: 0.8,
        linewidth: 2 // Note: WebGL line width is often always 1
    });

    // Better: Use a thin Mesh (cylinder) for thicker beam
    // But Line is fast. Let's try TubeGeometry or just MeshLine if available?
    // For now simple Line is OK, maybe Bloom makes it glow.
    const line = new THREE.Line(geometry, material);
    scene.add(line);

    // Fade out
    let op = 1;
    const fade = setInterval(() => {
        op -= 0.1;
        material.opacity = op;
        if (op <= 0) {
            clearInterval(fade);
            scene.remove(line);
            geometry.dispose();
            material.dispose();
        }
    }, 16); // 60 FPS
}

function createDamageNumber(pos, dmg, isCrit) {
    const div = document.createElement('div');
    div.innerText = dmg;
    div.style.position = 'absolute';
    div.style.color = isCrit ? '#ff3333' : '#ffffff';
    div.style.fontWeight = 'bold';
    div.style.fontSize = isCrit ? '2rem' : '1.2rem';
    div.style.textShadow = isCrit ? '0 0 10px #ff0000' : '0 0 5px #000';
    div.style.pointerEvents = 'none';
    div.style.userSelect = 'none';
    div.style.fontFamily = "'Orbitron', sans-serif";

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
                id: pData.id
            };
        }

        const p = players[pData.id];
        p.mesh.position.set(pData.x, pData.y, pData.z);
        if (pData.ry !== undefined) {
            p.mesh.rotation.y = pData.ry;
        }

        // Update Nameplate Logic
        updateNameplate(p.nameplate, pData.username || 'Agent', pData.hp, 150); // Hardcoded maxHp for now

        if (pData.id === myFunctionId) {
            p.mesh.visible = false; // FPS Mode: Hide self
            camera.position.set(pData.x, pData.y + 1.6, pData.z);

            // Update HUD (Health & Ammo)
            const healthPercent = (p.hp / 150) * 100;
            const healthEl = document.getElementById('health-fill');
            if (healthEl) healthEl.style.width = healthPercent + '%';

            const ammoEl = document.getElementById('ammo-count');
            if (ammoEl) {
                if (p.ammo !== undefined) ammoEl.innerText = p.ammo;
                if (!p.isReloading) ammoEl.style.color = '#00ffff';
            }

        } else {
            p.mesh.visible = true;
        }
    });



});

// --- INPUT ---
const keys = { w: false, a: false, s: false, d: false, ' ': false, mouseLeft: false, mouseLeftProcessed: false, r: false };
window.addEventListener('keydown', (e) => {
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = true;
});
window.addEventListener('keyup', (e) => {
    if (keys.hasOwnProperty(e.key.toLowerCase())) keys[e.key.toLowerCase()] = false;
});

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

        // Semi-Auto Logic
        // Send shoot=true only if mouse is held AND we haven't processed this shot yet
        // Actually, easiest way is: send shoot=true, then immediately set a flag that we shot.
        // Wait, server ticks independent of client frames.
        // Better: client sends shoot=true continuously, SERVER handles fire rate.
        // BUT user wants "Not Auto". So client sends shoot=true ONLY ONCE per click.

        let shouldShoot = false;
        if (keys.mouseLeft && !keys.mouseLeftProcessed) {
            shouldShoot = true;
            keys.mouseLeftProcessed = true; // Mark as processed until release
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
    }
}, 1000 / 30);

// --- FPS WEAPON SETUP ---
function attachFPSWeapon() {
    // Remove old if exists
    const old = camera.getObjectByName('fpsWeapon');
    if (old) camera.remove(old);

    const selectedWeapon = localStorage.getItem('selectedWeapon') || 'rifle';
    const weapon = createWeaponMesh(selectedWeapon);
    weapon.name = 'fpsWeapon';

    // Position for FPS view (Right hand side, slightly forward)
    // [FIX] Moved UP and CLOSER clearly into view
    weapon.position.set(0.35, -0.25, -0.6);
    weapon.rotation.set(0, Math.PI, 0); // Face straight forward (-Z)

    // Scale
    weapon.scale.set(1, 1, 1); // Normal size

    camera.add(weapon);
}
attachFPSWeapon();

// --- INPUT LISTENERS ---
window.addEventListener('mousedown', (e) => {
    if (controls.isLocked && e.button === 0) {
        keys.mouseLeft = true;
    }
});
window.addEventListener('mouseup', (e) => {
    if (e.button === 0) {
        keys.mouseLeft = false;
        keys.mouseLeftProcessed = false; // Reset trigger
    }
});

// --- ANIMATION / RENDER ---
function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});
