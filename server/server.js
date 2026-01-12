import 'dotenv/config';
import { Server } from 'socket.io';
import CANNON from 'cannon-es';
import http from 'http';
import express from 'express';
import cors from 'cors';
import { Sequelize } from 'sequelize';
import bcrypt from 'bcrypt';

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
    console.log(`[Request] ${req.method} ${req.url}`);
    next();
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

const sequelize = new Sequelize(
    process.env.DB_NAME || 'hero_rivals',
    process.env.DB_USER || 'hero_user',
    process.env.DB_PASSWORD || 'hero_password',
    {
        host: process.env.DB_HOST || '127.0.0.1',
        dialect: 'mysql',
        logging: false
    }
);

// --- USER MODEL ---
const User = sequelize.define('users', {
    id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
    username: { type: Sequelize.STRING, allowNull: false, unique: true },
    password_hash: { type: Sequelize.STRING, allowNull: false },
    salt: { type: Sequelize.STRING, allowNull: false }
}, {
    timestamps: true,
    updatedAt: false,
    underscored: true
});

const connectWithRetry = () => {
    sequelize.authenticate()
        .then(() => {
            console.log('[Database] Connection has been established successfully.');
            User.sync({ alter: true });
        })
        .catch(err => {
            console.error('[Database] Unable to connect to the database (retrying in 5s)...');
            setTimeout(connectWithRetry, 5000);
        });
};
connectWithRetry();

// --- AUTH ROUTERS ---
app.post('/api/register', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const user = await User.create({
            username,
            password_hash: hashedPassword,
            salt: salt
        });

        res.json({ success: true, userId: user.id });
    } catch (err) {
        console.error("Register Error:", err);
        res.status(500).json({ error: 'Server Error: ' + err.message });
    }
});

app.post('/api/login', async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'Missing fields' });

        const user = await User.findOne({ where: { username } });
        if (!user) return res.status(401).json({ error: 'Invalid credentials' });

        const match = await bcrypt.compare(password, user.password_hash);
        if (!match) return res.status(401).json({ error: 'Invalid credentials' });

        res.json({ success: true, userId: user.id, username: user.username });
    } catch (err) {
        console.error("Login Error", err);
        res.status(500).json({ error: 'Server error' });
    }
});

// --- PHYSICS WORLD SETUP ---
const world = new CANNON.World();
world.gravity.set(0, -30, 0); // Reduced gravity

// Physics Materials
const groundMaterial = new CANNON.Material('ground');
const playerMaterial = new CANNON.Material('player');
const wallMat = new CANNON.Material('wall');

const physicsContactMaterial = new CANNON.ContactMaterial(groundMaterial, playerMaterial, {
    friction: 0.0,
    restitution: 0.0
});
world.addContactMaterial(physicsContactMaterial);

const wallContact = new CANNON.ContactMaterial(playerMaterial, wallMat, {
    friction: 0.0,
    restitution: 0.0
});
world.addContactMaterial(wallContact);

// Helper
function createBody(shape, x, y, z, mass = 0, rotX = 0, rotY = 0, rotZ = 0) {
    const body = new CANNON.Body({
        mass: mass,
        material: wallMat,
        collisionFilterGroup: 1,
        collisionFilterMask: 2
    });
    body.addShape(shape);
    body.position.set(x, y, z);
    if (rotX !== 0 || rotY !== 0 || rotZ !== 0) {
        body.quaternion.setFromEuler(rotX, rotY, rotZ);
    }
    world.addBody(body);
    return body;
}

const groundBody = new CANNON.Body({
    type: CANNON.Body.STATIC,
    shape: new CANNON.Plane(),
    material: groundMaterial,
    collisionFilterGroup: 1,
    collisionFilterMask: 2
});
groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
world.addBody(groundBody);

// BEDROCK (Safety net)
const bedrock = new CANNON.Body({
    mass: 0,
    position: new CANNON.Vec3(0, -5, 0),
    shape: new CANNON.Box(new CANNON.Vec3(100, 1, 100)),
    material: wallMat
});
world.addBody(bedrock);

// --- MAP GEOMETRY ---
const platformShape = new CANNON.Box(new CANNON.Vec3(6, 1, 6));
createBody(platformShape, 0, 1, 0);

const objShape = new CANNON.Box(new CANNON.Vec3(1, 1, 1));
createBody(objShape, 0, 3, 0);

const rampLen = Math.sqrt(8 * 8 + 2 * 2);
const rampShape = new CANNON.Box(new CANNON.Vec3(3, 0.25, rampLen / 2));
const angle = Math.atan(2 / 8);
createBody(rampShape, 0, 1, -10, 0, -angle, 0, 0);
createBody(rampShape, 0, 1, 10, 0, angle, 0, 0);
createBody(rampShape, 10, 1, 0, 0, 0, 0, angle);
createBody(rampShape, -10, 1, 0, 0, 0, 0, -angle);

const obstacleShape = new CANNON.Box(new CANNON.Vec3(2, 2, 2));
createBody(obstacleShape, -15, 2, -15);
createBody(obstacleShape, 15, 2, -15);
createBody(obstacleShape, -15, 2, 15);
createBody(obstacleShape, 15, 2, 15);

const containerShape = new CANNON.Box(new CANNON.Vec3(1.5, 1.5, 3));
createBody(containerShape, -20, 1.5, 0, 0, 0, 0.5, 0);
createBody(containerShape, 20, 1.5, 0, 0, 0, -0.5, 0);

const wallNS = new CANNON.Box(new CANNON.Vec3(40, 50, 0.5));
createBody(wallNS, 0, 50, -40);
createBody(wallNS, 0, 50, 40);
const wallEW = new CANNON.Box(new CANNON.Vec3(0.5, 50, 40));
createBody(wallEW, -40, 50, 0);
createBody(wallEW, 40, 50, 0);

const sideWall = new CANNON.Box(new CANNON.Vec3(0.5, 2, 10));
createBody(sideWall, -30, 2, 0);
createBody(sideWall, 30, 2, 0);

createBody(containerShape, -15, 1.5, 25, 0, 0, 0.3, 0);
createBody(containerShape, 15, 1.5, 25, 0, 0, -0.2, 0);
createBody(containerShape, -15, 1.5, -25, 0, 0, -0.4, 0);
createBody(containerShape, 15, 1.5, -25, 0, 0, 0.1, 0);

// Cartons
const crateShape = new CANNON.Box(new CANNON.Vec3(0.5, 0.5, 0.5));
createBody(crateShape, 5, 0.5, 5, 10);
createBody(crateShape, 5, 0.5, 6);
createBody(crateShape, 5, 1.5, 5.5);
createBody(crateShape, -8, 0.5, 2);
createBody(crateShape, -9, 0.5, 2.5);
createBody(crateShape, 0, 0.5, -8);
createBody(crateShape, 1, 0.5, -8);
createBody(crateShape, 0.5, 1.5, -8);


// --- GAME STATE ---
const players = {};
const TICK_RATE = 60;
const HERO_STATS = {
    vanguard: { hp: 150, speed: 12, radius: 1 },
    shadow: { hp: 100, speed: 14, radius: 0.8 },
    titan: { hp: 250, speed: 10, radius: 1.5 },
};

const WEAPON_STATS = {
    rifle: { damage: 18, fireRate: 100, range: 60, falloff: 0.4, ammo: 30, reload: 2000 },
    sniper: { damage: 85, fireRate: 1200, range: 200, falloff: 0.95, ammo: 5, reload: 3000 },
    shotgun: { damage: 9, fireRate: 800, range: 20, count: 6, spread: 0.3, ammo: 8, reload: 2500 }
};

function createPlayerBody(role, x, z) {
    const stats = HERO_STATS[role] || HERO_STATS.vanguard;
    const body = new CANNON.Body({
        mass: 70,
        position: new CANNON.Vec3(x, 10, z), // Spawn Higher
        shape: new CANNON.Sphere(stats.radius),
        material: playerMaterial,
        fixedRotation: true,
        collisionFilterGroup: 2,
        collisionFilterMask: 1 | 2,
        linearDamping: 0.0
    });
    world.addBody(body);
    return body;
}

// --- SPAWN POINTS ---
const SPAWN_POINTS = [
    { x: 0, y: 10, z: 0 },    // Center
    { x: -15, y: 10, z: -10 }, // West/North
    { x: 15, y: 10, z: 10 },   // East/South
    { x: 18, y: 10, z: 0 },    // East Side
    { x: -18, y: 10, z: 0 },   // West Side
    { x: 0, y: 10, z: -18 },   // North Side
    { x: 0, y: 10, z: 18 }     // South Side
];

function getRandomSpawn() {
    return SPAWN_POINTS[Math.floor(Math.random() * SPAWN_POINTS.length)];
}

// Socket Auth
io.use(async (socket, next) => {
    const userId = socket.handshake.auth.token;
    if (userId) {
        try {
            const user = await User.findByPk(userId);
            if (user) {
                socket.userId = userId;
                socket.username = user.username;
                return next();
            }
        } catch (e) {
            console.error("Auth DB Error", e);
        }
    }
    next(new Error('Authentication failed'));
});

io.on('connection', (socket) => {
    const username = socket.username || 'Unknown';
    const weapon = socket.handshake.query.weapon || 'rifle'; // Read weapon from query
    console.log(`[Connect] Player connected: ${socket.id} (${username}) - Weapon: ${weapon}`);

    let role = 'vanguard';
    const spawn = getRandomSpawn(); // Random Spawn
    const body = createPlayerBody(role, spawn.x, spawn.z);

    players[socket.id] = {
        id: socket.id,
        username: username,
        body: body,
        role: role,
        weapon: weapon, // Store weapon
        hp: HERO_STATS[role].hp,
        inputs: { forward: false, backward: false, left: false, right: false, jump: false, shoot: false, reload: false, viewAngle: 0 },
        lastGroundedTime: 0,
        jumpQueuedTime: 0,
        lastJumpTime: 0,
        prevJump: false,

        // Weapon State
        ammo: WEAPON_STATS[weapon] ? WEAPON_STATS[weapon].ammo : 30,
        maxAmmo: WEAPON_STATS[weapon] ? WEAPON_STATS[weapon].ammo : 30,
        isReloading: false,
        reloadEndTime: 0,
        lastShootTime: 0
    };


    socket.emit('welcome', { id: socket.id, role: role, weapon: weapon, x: spawn.x, z: spawn.z });

    socket.on('disconnect', () => {
        if (players[socket.id]) {
            world.removeBody(players[socket.id].body);
            delete players[socket.id];
        }
    });

    socket.on('input', (data) => {
        if (players[socket.id]) players[socket.id].inputs = data;
    });

    socket.on('selectHero', (newRole) => {
        if (players[socket.id] && HERO_STATS[newRole]) {
            players[socket.id].role = newRole;
            players[socket.id].hp = HERO_STATS[newRole].hp;
        }
    });
});

function gameLoop() {
    world.step(1 / TICK_RATE);
    const snapshot = { players: [], projectiles: [] };
    const now = Date.now();

    for (const id in players) {
        const p = players[id];
        const stats = HERO_STATS[p.role];
        const inputs = p.inputs;

        // 1. Raycast (Ground Check)
        const start = p.body.position;
        const dist = stats.radius + 1.5;
        const end = new CANNON.Vec3(start.x, start.y - dist, start.z);
        const options = {
            skipBackfaces: true,
            collisionFilterMask: 1
        };
        const result = new CANNON.RaycastResult();
        const hit = world.raycastClosest(start, end, options, result);
        let raycastHit = hit && result.hasHit;

        // 2. Contact Check
        let contactHit = false;
        let groundNormal = new CANNON.Vec3(0, 1, 0);

        if (raycastHit) {
            groundNormal = result.hitNormalWorld;
        } else {
            for (const contact of world.contacts) {
                if (contact.bi === p.body || contact.bj === p.body) {
                    let n = contact.ni;
                    if (contact.bi === p.body) n = n.scale(-1);
                    if (n.y > 0.1) {
                        contactHit = true;
                        groundNormal = n;
                        break;
                    }
                }
            }
        }

        const isGrounded = raycastHit || contactHit;

        // COYOTE TIME
        if (isGrounded) {
            p.lastGroundedTime = now;
        }
        const canJump = isGrounded || (now - p.lastGroundedTime < 250);

        // --- MOVEMENT LOGIC ---
        let desiredV = new CANNON.Vec3(0, p.body.velocity.y, 0);

        if (inputs.moveDir) {
            const inputV = new CANNON.Vec3(inputs.moveDir.x, 0, inputs.moveDir.y).scale(stats.speed);
            const recentlyJumped = (now - p.lastJumpTime < 200);

            if (isGrounded && !recentlyJumped) {
                // Ground Movement
                const n = groundNormal;
                if (n.y < 0.5) {
                    desiredV.x = inputV.x;
                    desiredV.z = inputV.z;
                } else {
                    let tangent = inputV.vsub(n.scale(inputV.dot(n)));
                    if (tangent.lengthSquared() > 0.001) {
                        tangent.normalize();
                        tangent = tangent.scale(stats.speed);
                        desiredV.x = tangent.x;
                        desiredV.y = tangent.y;
                        desiredV.z = tangent.z;
                    }
                }
            } else {
                // Air Movement
                desiredV.x = inputV.x;
                desiredV.z = inputV.z;
            }
        } else {
            desiredV.x = 0;
            desiredV.z = 0;
        }

        p.body.velocity.x = desiredV.x;
        p.body.velocity.z = desiredV.z;

        const recentlyJumped = (now - p.lastJumpTime < 200);
        if (isGrounded && inputs.moveDir && !recentlyJumped) {
            p.body.velocity.y = desiredV.y;
        }

        // Air Physics Fix
        if (!isGrounded) {
            p.body.linearDamping = 0.0;
        } else {
            p.body.linearDamping = 0.01;
        }

        // --- JUMP LOGIC ---
        if (inputs.jump && !p.prevJump) {
            p.jumpQueuedTime = now;
        }

        if (now - p.jumpQueuedTime < 200 && canJump) {
            p.body.velocity.y = 12; // Jump Force
            p.body.position.y += 0.05;
            p.lastGroundedTime = 0;
            p.jumpQueuedTime = 0;
            p.lastJumpTime = now;
        }
        p.prevJump = inputs.jump;

        // --- SHOOTING LOGIC ---
        // --- RELOAD LOGIC ---
        const weaponStats = WEAPON_STATS[p.weapon] || WEAPON_STATS.rifle;

        if (inputs.reload && !p.isReloading && p.ammo < weaponStats.ammo) {
            p.isReloading = true;
            p.reloadEndTime = now + weaponStats.reload;
            io.emit('reload_start', { id: p.id, duration: weaponStats.reload });
        }

        if (p.isReloading) {
            if (now >= p.reloadEndTime) {
                p.isReloading = false;
                p.ammo = weaponStats.ammo;
                io.emit('reload_end', { id: p.id, ammo: p.ammo });
            }
        }

        // --- SHOOTING LOGIC ---
        if (inputs.shoot && !p.isReloading && p.ammo > 0) {
            if (now - p.lastShootTime >= weaponStats.fireRate) {
                p.lastShootTime = now;
                p.ammo--;

                const shootStart = new CANNON.Vec3(p.body.position.x, p.body.position.y + 1.6, p.body.position.z);
                const roleOffset = (p.role === 'titan' ? 0.4 : 0); // Titan shoots lower/higher? Adjusted slightly if needed

                const projectiles = [];
                if (p.weapon === 'shotgun') {
                    // Spread
                    for (let i = 0; i < weaponStats.count; i++) {
                        const spreadX = (Math.random() - 0.5) * weaponStats.spread;
                        const spreadY = (Math.random() - 0.5) * weaponStats.spread;
                        const spreadZ = (Math.random() - 0.5) * weaponStats.spread;
                        projectiles.push(new CANNON.Vec3(inputs.viewDir.x + spreadX, inputs.viewDir.y + spreadY, inputs.viewDir.z + spreadZ).unit());
                    }
                } else {
                    projectiles.push(new CANNON.Vec3(inputs.viewDir.x, inputs.viewDir.y, inputs.viewDir.z));
                }

                projectiles.forEach(dir => {
                    const shootEnd = shootStart.vadd(dir.scale(weaponStats.range)); // Max Range

                    const rayResult = new CANNON.RaycastResult();
                    const rayOptions = {
                        skipBackfaces: true,
                        collisionFilterMask: 1 | 2
                    };

                    const hit = world.raycastClosest(shootStart, shootEnd, rayOptions, rayResult);
                    let hitPoint = shootEnd;
                    let hitId = null;
                    let dmg = 0;

                    if (hit) {
                        hitPoint = rayResult.hitPointWorld;

                        if (rayResult.body && rayResult.body.collisionFilterGroup === 2) {
                            for (const pid in players) {
                                if (players[pid].body === rayResult.body && pid !== p.id) {
                                    hitId = pid;

                                    // DAMAGE FALLOFF
                                    const dist = shootStart.distanceTo(hitPoint);
                                    let falloffMult = 1.0;
                                    // Linear falloff: 100% at 0 distance, 'falloff' value at max range
                                    const t = Math.min(1, dist / weaponStats.range);
                                    falloffMult = 1.0 - t * (1.0 - weaponStats.falloff);

                                    dmg = Math.ceil(weaponStats.damage * falloffMult);

                                    // HEADSHOT (Rough Approximation: Top 20% of bounding box)
                                    // Radius is stored in HERO_STATS
                                    // But hitbox is sphere. Center Y is body.position.y.
                                    // Simple check: hitPoint.y > body.position.y + 0.5?
                                    if (hitPoint.y > players[pid].body.position.y + 0.4) {
                                        dmg *= 1.5;
                                        dmg = Math.floor(dmg);
                                    }

                                    players[pid].hp -= dmg;
                                    if (players[pid].hp <= 0) {
                                        players[pid].hp = HERO_STATS[players[pid].role].hp;
                                        // RESPAWN
                                        const respawn = getRandomSpawn();
                                        players[pid].body.position.set(respawn.x, 10, respawn.z);
                                        players[pid].body.velocity.set(0, 0, 0);
                                        // Reset Ammo too on death?
                                        players[pid].ammo = WEAPON_STATS[players[pid].weapon].ammo;
                                    }
                                    break;
                                }
                            }
                        }
                    }

                    io.emit('shoot', {
                        shooterId: p.id,
                        start: { x: shootStart.x, y: shootStart.y - 0.2, z: shootStart.z },
                        end: { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z },
                        hitId: hitId,
                        damage: dmg,
                        isCrit: (dmg > weaponStats.damage * 1.2) // Simple crit check flag
                    });
                });
            }
        }

        // Boundaries
        if (p.body.position.y < -20) {
            const respawn = getRandomSpawn();
            p.body.position.set(respawn.x, 10, respawn.z);
            p.body.velocity.set(0, 0, 0);
        }

        let ry = 0;
        if (inputs.viewDir) {
            ry = Math.atan2(inputs.viewDir.x, inputs.viewDir.z) - Math.PI;
        }

        snapshot.players.push({
            id: p.id,
            username: p.username,
            x: p.body.position.x,
            y: p.body.position.y,
            z: p.body.position.z,
            ry: ry,
            role: p.role,
            weapon: p.weapon, // Sync Weapon
            ammo: p.ammo, // Sync Ammo
            hp: p.hp
        });
    }

    io.emit('snapshot', snapshot);
}

setInterval(gameLoop, 1000 / TICK_RATE);

const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
