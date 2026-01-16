import * as THREE from 'three';

export function createWeaponMesh(type) {
    const group = new THREE.Group();

    // Materials
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.7 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.3, metalness: 0.8 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.9 });
    const scopeMat = new THREE.MeshStandardMaterial({ color: 0x000000, roughness: 0.2, metalness: 0.5 });
    const lensMat = new THREE.MeshStandardMaterial({ color: 0x00ffff, roughness: 0.1, metalness: 1.0, emissive: 0x001111 });

    if (type === 'rifle') {
        // --- ASSAULT RIFLE ---
        // Body
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.6), darkMat);
        group.add(body);

        // Barrel
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.4, 8), steelMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = 0.4;
        barrel.position.y = 0.02;
        group.add(barrel);

        // Magazine
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.25, 0.1), darkMat);
        mag.position.set(0, -0.15, 0.1);
        mag.rotation.x = 0.2;
        group.add(mag);

        // Stock
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.3), darkMat);
        stock.position.z = -0.4;
        group.add(stock);

        // Sight
        const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.04), steelMat);
        sight.position.set(0, 0.1, 0.5);
        group.add(sight);

    } else if (type === 'sniper') {
        // --- SNIPER RIFLE ---
        // Body
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.5), darkMat);
        group.add(body);

        // Long Barrel
        const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.025, 1.0, 8), steelMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.z = 0.6;
        barrel.position.y = 0.02;
        group.add(barrel);

        // Muzzle Brake
        const muzzle = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.1), steelMat);
        muzzle.position.z = 1.1;
        muzzle.position.y = 0.02;
        group.add(muzzle);

        // Scope
        const scopeMount = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.05, 0.1), darkMat);
        scopeMount.position.y = 0.08;
        group.add(scopeMount);

        const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.4, 16), scopeMat);
        scope.rotation.x = Math.PI / 2;
        scope.position.y = 0.12;
        group.add(scope);

        const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.01, 16), lensMat);
        lens.rotation.x = Math.PI / 2;
        lens.position.set(0, 0.12, 0.2); // Front of scope
        group.add(lens);

        // Stock
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.4), darkMat);
        stock.position.z = -0.4;
        group.add(stock);

    } else if (type === 'shotgun') {
        // --- SHOTGUN ---
        // Wooden Body
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.15, 0.5), woodMat);
        group.add(body);

        // Double Barrel
        const barrelL = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 8), steelMat);
        barrelL.rotation.x = Math.PI / 2;
        barrelL.position.set(-0.02, 0.05, 0.4);
        group.add(barrelL);

        const barrelR = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 8), steelMat);
        barrelR.rotation.x = Math.PI / 2;
        barrelR.position.set(0.02, 0.05, 0.4);
        group.add(barrelR);

        // Stock
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.4), woodMat);
        stock.position.z = -0.4;
        stock.position.y = -0.05;
        stock.rotation.x = -0.1;
        group.add(stock);

        // Pump Handle
        const pump = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.08, 0.2), darkMat);
        pump.position.set(0, -0.02, 0.3);
        group.add(pump);
    } else if (type === 'knife') {
        // --- KNIFE ---
        // Handle
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.15), darkMat);
        handle.rotation.x = 0;
        // Grip angle? Standard knife held point forward
        group.add(handle);

        // Guard
        const guard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.02, 0.02), steelMat);
        guard.position.z = 0.08;
        group.add(guard);

        // Blade
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.06, 0.25), steelMat);
        blade.position.z = 0.22;
        // Make it sharp (scale y at tip?)
        // Simple shape for now
        group.add(blade);

        // Rotate group to hold like a knife (Forward)
        // Default FPS hold is usually: Arm down, Weapon forward.
        // We might need to adjust rotation in main.js or here.
        // Let's assume standard alignment (-Z forward).
        // Current setup: +Z seems to be forward for components based on other guns?
        // Rifle Barrel z=0.4.
        // So +Z is forward in this local space.
        // But main.js rotates PI to face -Z.

    } else {
        // Fallback cube
        const cube = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), darkMat);
        group.add(cube);
    }

    return group;
}
