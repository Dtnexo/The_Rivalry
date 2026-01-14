import * as THREE from 'three';

export class NeonCity {
    constructor(scene) {
        this.scene = scene;
    }

    build() {
        this.createLighting();
        this.createEnvironment();
        this.createGround();
    }

    createLighting() {
        // Daylight / Realistic
        const ambient = new THREE.AmbientLight(0xffffff, 0.6);
        this.scene.add(ambient);

        // Sun
        const sunLight = new THREE.DirectionalLight(0xffffee, 1.2);
        sunLight.position.set(50, 100, 50);
        sunLight.castShadow = true;

        // High quality shadows (Optimized)
        sunLight.shadow.mapSize.width = 2048;
        sunLight.shadow.mapSize.height = 2048;
        sunLight.shadow.camera.near = 0.5;
        sunLight.shadow.camera.far = 500;
        sunLight.shadow.camera.left = -100;
        sunLight.shadow.camera.right = 100;
        sunLight.shadow.camera.top = 100;
        sunLight.shadow.camera.bottom = -100;
        this.scene.add(sunLight);
    }

    createEnvironment() {
        // --- MATERIALS ---
        const concreteMat = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.9, metalness: 0.1 });
        const wallMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.2, metalness: 0.1 });
        const orangeContainer = new THREE.MeshStandardMaterial({ color: 0xe65100, roughness: 0.6, metalness: 0.3 });
        const blueContainer = new THREE.MeshStandardMaterial({ color: 0x01579b, roughness: 0.6, metalness: 0.3 });

        // Helper
        const createMesh = (w, h, d, x, y, z, mat, rotX = 0, rotY = 0, rotZ = 0) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
            mesh.position.set(x, y, z);
            mesh.rotation.set(rotX, rotY, rotZ);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            this.scene.add(mesh);
            return mesh;
        };

        // --- MAP GEOMETRY ---
        // 1. Central Platform
        createMesh(12, 2, 12, 0, 1, 0, concreteMat);

        // 2. Ramps
        const rampLen = Math.sqrt(8 * 8 + 2 * 2);
        const w = 6, h = 0.5;
        const ang = Math.atan(2 / 8);

        createMesh(w, h, rampLen, 0, 0.70, -10, concreteMat, -ang, 0, 0); // N
        createMesh(w, h, rampLen, 0, 0.70, 10, concreteMat, ang, 0, 0);  // S
        createMesh(rampLen, h, w, 10, 0.85, 0, concreteMat, 0, 0, ang);  // E
        createMesh(rampLen, h, w, -10, 0.85, 0, concreteMat, 0, 0, -ang); // W

        // 3. Obstacles
        createMesh(4, 4, 4, -15, 2, -15, wallMat);
        createMesh(4, 4, 4, 15, 2, -15, wallMat);
        createMesh(4, 4, 4, -15, 2, 15, wallMat);
        createMesh(4, 4, 4, 15, 2, 15, wallMat);

        // 4. Containers
        createMesh(3, 3, 6, -20, 1.5, 0, orangeContainer, 0, 0.5, 0);
        createMesh(3, 3, 6, 20, 1.5, 0, blueContainer, 0, -0.5, 0);

        // Extra Containers
        createMesh(3, 3, 6, -15, 1.5, 25, orangeContainer, 0, 0.3, 0);
        createMesh(3, 3, 6, 15, 1.5, 25, blueContainer, 0, -0.2, 0);
        createMesh(3, 3, 6, -15, 1.5, -25, blueContainer, 0, -0.4, 0);
        createMesh(3, 3, 6, 15, 1.5, -25, orangeContainer, 0, 0.1, 0);

        // 5. Perimeter Walls
        createMesh(80, 4, 1, 0, 2, -40, wallMat);
        createMesh(80, 4, 1, 0, 2, 40, wallMat);
        createMesh(1, 4, 80, -40, 2, 0, wallMat);
        createMesh(1, 4, 80, 40, 2, 0, wallMat);

        // Side Cover
        createMesh(1, 4, 20, -30, 2, 0, wallMat);
        createMesh(1, 4, 20, 30, 2, 0, wallMat);

        // [REMOVED] Wooden Crates

        // Background City
        const glassMat = new THREE.MeshStandardMaterial({ color: 0xaaccff, roughness: 0.0, metalness: 0.9, transparent: true, opacity: 0.8 });
        const bldgMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.2 });

        for (let i = 0; i < 30; i++) {
            const angle = (i / 30) * Math.PI * 2;
            const dist = 60 + Math.random() * 40;
            const bw = 10 + Math.random() * 15;
            const bh = 40 + Math.random() * 80;
            const mat = Math.random() > 0.3 ? bldgMat : glassMat;
            createMesh(bw, bh, bw, Math.cos(angle) * dist, bh / 2 - 10, Math.sin(angle) * dist, mat);
        }
    }

    createGround() {
        // Dark Asphalt
        const geometry = new THREE.PlaneGeometry(200, 200);
        const material = new THREE.MeshStandardMaterial({
            color: 0x1a1a1a,
            roughness: 0.9,
            metalness: 0.1
        });
        const ground = new THREE.Mesh(geometry, material);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);
    }

    // [REMOVED] createCrateTexture
}

