
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";

// ===== ZAPIS =====

function readNumber(key, fallback) {
  try {
    const value = Number(localStorage.getItem(key));
    return Number.isFinite(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

function readArray(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return Array.isArray(value) ? value : fallback;
  } catch {
    return fallback;
  }
}

let coins = readNumber("spmCoins", 0);
let bestWave = readNumber("spmBest", 0);
let owned = readArray("spmOwned", ["blue"]);
let skin = localStorage.getItem("spmSkin") || "blue";
let damageLevel = readNumber("spmDamage", 0);

const products = [
  { id: "blue", name: "Niebieska broń", price: 0, color: 0x168cff },
  { id: "red", name: "Czerwona broń", price: 100, color: 0xff3344 },
  { id: "gold", name: "Złota broń", price: 250, color: 0xffcc22 },
  { id: "purple", name: "Fioletowa broń", price: 400, color: 0xaa55ff },
  { id: "damage", name: "Ulepszenie obrażeń", price: 300 }
];

function save() {
  localStorage.setItem("spmCoins", coins);
  localStorage.setItem("spmBest", bestWave);
  localStorage.setItem("spmOwned", JSON.stringify(owned));
  localStorage.setItem("spmSkin", skin);
  localStorage.setItem("spmDamage", damageLevel);
}

function updateCoins() {
  $("coins").textContent = coins;
  $("menuCoins").textContent = coins;
  $("shopCoins").textContent = coins;
  save();
}

// ===== ELEMENTY STRONY =====

const $ = id => document.getElementById(id);

const screens = ["menu", "maps", "shop", "pause", "gameOver"];

function hideScreens() {
  screens.forEach(id => $(id).classList.add("hidden"));
}

function showMenu() {
  stopGame();
  hideScreens();
  $("menu").classList.remove("hidden");
  $("hud").classList.add("hidden");
  $("bestWave").textContent = bestWave;
  updateCoins();
}

function showMessage(text) {
  $("message").textContent = text;
  clearTimeout(messageTimer);

  messageTimer = setTimeout(() => {
    $("message").textContent = "";
  }, 2300);
}

function showShop() {
  hideScreens();
  $("shop").classList.remove("hidden");
  renderShop();
}

function renderShop() {
  const container = $("shopItems");
  container.innerHTML = "";

  products.forEach(item => {
    const div = document.createElement("div");
    div.className = "shopItem";

    const title = document.createElement("h3");
    title.textContent = item.name;

    const description = document.createElement("p");

    const button = document.createElement("button");

    const bought = owned.includes(item.id);

    if (bought) {
      description.textContent = item.id === "damage"
        ? "Poziom ulepszenia: " + damageLevel
        : "Posiadasz tę skórkę";

      button.textContent = item.id === "damage" ? "KUP KOLEJNE" : "WYBIERZ";
    } else {
      description.textContent = "Cena: " + item.price + " 🪙";
      button.textContent = "KUP";
    }

    button.addEventListener("click", () => {
      if (item.id !== "damage" && owned.includes(item.id)) {
        skin = item.id;
        save();
        renderShop();
        return;
      }

      if (coins < item.price) {
        alert("Masz za mało monet!");
        return;
      }

      coins -= item.price;

      if (item.id === "damage") {
        damageLevel++;
      } else {
        owned.push(item.id);
        skin = item.id;
      }

      save();
      updateCoins();
      renderShop();
    });

    div.append(title, description, button);
    container.appendChild(div);
  });
}

// ===== GRA =====

let scene = null;
let camera = null;
let renderer = null;
let gun = null;

let enemies = [];
let obstacles = [];

let playing = false;
let paused = false;

let wave = 1;
let hp = 100;
let ammo = 30;
let maxAmmo = 30;

let yaw = 0;
let pitch = 0;

let moveX = 0;
let moveY = 0;

let selectedMap = "warehouse";

let lastShot = 0;
let lastFrame = 0;
let jumpTime = 0;
let waveTimer = null;
let messageTimer = null;
let reloadTimer = null;

const player = new THREE.Vector3(0, 0, 0);

const keys = {};

const raycaster = new THREE.Raycaster();
raycaster.far = 60;

const center = new THREE.Vector2(0, 0);

const isTouch = navigator.maxTouchPoints > 0;

// ===== MAPY =====

const mapSettings = {
  warehouse: {
    background: 0x8193a3,
    floor: 0x68717c,
    wall: 0x465568,
    obstacle: 0x92734e
  },
  city: {
    background: 0x9aa9b9,
    floor: 0x555e69,
    wall: 0x46516a,
    obstacle: 0x747e8b
  },
  desert: {
    background: 0xd7ad75,
    floor: 0xc49a58,
    wall: 0x9e7749,
    obstacle: 0xb18a5a
  },
  base: {
    background: 0x687b70,
    floor: 0x485b50,
    wall: 0x34493d,
    obstacle: 0x536b58
  }
};

function addBox(x, y, z, sx, sy, sz, color) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sx, sy, sz),
    new THREE.MeshStandardMaterial({ color })
  );

  mesh.position.set(x, y, z);
  scene.add(mesh);
  obstacles.push(mesh);
  return mesh;
}

function createMap() {
  const settings = mapSettings[selectedMap];

  scene.background = new THREE.Color(settings.background);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(100, 100),
    new THREE.MeshStandardMaterial({
      color: settings.floor,
      roughness: 1
    })
  );

  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.1;
  scene.add(floor);

  // Ściany areny
  addBox(0, 3, -50, 100, 6, 1, settings.wall);
  addBox(0, 3, 50, 100, 6, 1, settings.wall);
  addBox(-50, 3, 0, 1, 6, 100, settings.wall);
  addBox(50, 3, 0, 1, 6, 100, settings.wall);

  // Przeszkody na mapie
  const positions = [
    [-12, -12], [12, -12],
    [-12, 12], [12, 12],
    [0, -23], [0, 23],
    [-24, 0], [24, 0],
    [-25, -25], [25, 25],
    [-25, 25], [25, -25],
    [-5, 30], [5, -30]
  ];

  positions.forEach((pos, i) => {
    const width = i % 3 === 0 ? 7 : 4;
    const height = i % 2 === 0 ? 4 : 2.5;

    addBox(
      pos[0], height / 2, pos[1],
      width, height, 4,
      settings.obstacle
    );
  });
}

// ===== ŚWIATŁO =====

function createLights() {
  const ambient = new THREE.HemisphereLight(
    0xffffff, 0x444455, 2
  );

  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 2);
  sun.position.set(10, 20, 10);
  scene.add(sun);
}

// ===== BROŃ =====

function createGun() {
  const product = products.find(p => p.id === skin);
  const color = product?.color || 0x168cff;

  gun = new THREE.Group();

  const material = new THREE.MeshStandardMaterial({
    color,
    metalness: 0.5,
    roughness: 0.35
  });

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.18, 0.65),
    material
  );

  body.position.set(0.34, -0.3, -0.65);
  gun.add(body);

  const barrel = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.09, 0.4),
    new THREE.MeshStandardMaterial({ color: 0x222222 })
  );

  barrel.position.set(0.34, -0.25, -1.12);
  gun.add(barrel);

  camera.add(gun);
}

// ===== PRZECIWNICY =====

function createEnemy(isBoss = false) {
  const group = new THREE.Group();

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: isBoss ? 0x8d35d6 : 0xd74747
  });

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(
      isBoss ? 1.5 : 0.85,
      isBoss ? 2.2 : 1.4,
      isBoss ? 1.2 : 0.7
    ),
    bodyMaterial
  );

  body.position.y = isBoss ? 1.1 : 0.7;
  group.add(body);

  const head = new THREE.Mesh(
    new THREE.SphereGeometry(isBoss ? 0.48 : 0.32, 12, 12),
    new THREE.MeshStandardMaterial({ color: 0xffc49c })
  );

  head.position.y = isBoss ? 2.5 : 1.65;
  group.add(head);

  const angle = Math.random() * Math.PI * 2;
  const distance = 18 + Math.random() * 15;

  group.position.set(
    player.x + Math.cos(angle) * distance,
    0,
    player.z + Math.sin(angle) * distance
  );

  scene.add(group);

  const enemy = {
    group,
    body,
    hp: isBoss ? 12 + wave * 3 : 2 + Math.floor(wave / 4),
    speed: isBoss ? 1.6 : 2 + Math.min(wave * 0.06, 2),
    boss: isBoss,
    attackTime: 0
  };

  body.userData.enemy = enemy;
  enemies.push(enemy);
}

function spawnWave() {
  const count = Math.min(3 + wave * 2, 40);
  const isBossWave = wave % 5 === 0;

  for (let i = 0; i < count; i++) {
    createEnemy(false);
  }

  if (isBossWave) {
    createEnemy(true);
    showMessage("⚠️ BOSS! FALA " + wave);
  } else if (wave <= 25) {
    showMessage("FALA " + wave + " / 25");
  } else {
    showMessage("TRYB NIESKOŃCZONY! FALA " + wave);
  }

  $("wave").textContent = wave;
}

// ===== STRZELANIE =====

function shoot() {
  if (!playing || paused || ammo <= 0) return;

  const now = performance.now();

  if (now - lastShot < 250) return;

  lastShot = now;
  ammo--;

  $("ammo").textContent = ammo;

  scene.updateMatrixWorld(true);

  raycaster.setFromCamera(center, camera);

  const targets = enemies.map(enemy => enemy.body);
  const hits = raycaster.intersectObjects(targets, false);

  if (hits.length > 0) {
    const enemy = hits[0].object.userData.enemy;

    if (enemy && enemies.includes(enemy)) {
      enemy.hp -= 1 + damageLevel;

      if (enemy.hp <= 0) {
        removeEnemy(enemy);
      }
    }
  }
}

function removeEnemy(enemy) {
  scene.remove(enemy.group);

  enemies = enemies.filter(e => e !== enemy);

  const reward = enemy.boss ? 100 : 10;

  coins += reward;
  updateCoins();

  showMessage("+" + reward + " MONET 🪙");
}

function reload() {
  if (!playing || paused || ammo === maxAmmo) return;

  showMessage("PRZEŁADOWANIE...");

  clearTimeout(reloadTimer);

  reloadTimer = setTimeout(() => {
    if (!playing) return;

    ammo = maxAmmo;
    $("ammo").textContent = ammo;

    showMessage("BROŃ ZAŁADOWANA!");
  }, 1300);
}

// ===== ŻYCIE I FALE =====

function damagePlayer(amount) {
  hp -= amount;

  $("hp").textContent = Math.max(0, hp);

  if (hp <= 0) {
    endGame();
  }
}

function finishWave() {
  if (!playing || enemies.length > 0) return;

  const reward = 20 + wave * 3;

  coins += reward;
  updateCoins();

  showMessage("FALA UKOŃCZONA! +" + reward + " 🪙");

  waveTimer = setTimeout(() => {
    if (!playing) return;

    wave++;
    spawnWave();
  }, 2200);
}

// ===== URUCHAMIANIE GRY =====

function startGame() {
  stopGame();
  hideScreens();

  $("hud").classList.remove("hidden");

  wave = 1;
  hp = 100;
  ammo = maxAmmo;

  yaw = 0;
  pitch = 0;

  moveX = 0;
  moveY = 0;

  player.set(0, 0, 0);

  enemies = [];
  obstacles = [];

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    150
  );

  camera.rotation.order = "YXZ";

  renderer = new THREE.WebGLRenderer({
    antialias: true
  });

  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  $("game").appendChild(renderer.domElement);

  camera.position.set(0, 1.7, 0);
  scene.add(camera);

  createLights();
  createMap();
  createGun();

  $("hp").textContent = hp;
  $("ammo").textContent = ammo;

  playing = true;
  paused = false;
  lastFrame = performance.now();

  spawnWave();

  requestAnimationFrame(animate);
}

function stopGame() {
  playing = false;
  paused = false;

  clearTimeout(waveTimer);
  clearTimeout(messageTimer);
  clearTimeout(reloadTimer);

  if (renderer) {
    renderer.dispose();
    renderer.domElement.remove();
    renderer = null;
  }

  scene = null;
  camera = null;
  gun = null;

  enemies = [];
  obstacles = [];
}

// ===== KONIEC GRY =====

function endGame() {
  if (!playing) return;

  playing = false;

  bestWave = Math.max(bestWave, wave);
  save();

  $("finalWave").textContent = wave;
  $("bestWave").textContent = bestWave;

  $("hud").classList.add("hidden");
  $("gameOver").classList.remove("hidden");
}

// ===== PAUZA =====

function pauseGame() {
  if (!playing) return;

  playing = false;
  paused = true;

  $("pause").classList.remove("hidden");
}

function resumeGame() {
  if (!paused) return;

  paused = false;
  playing = true;
  lastFrame = performance.now();

  $("pause").classList.add("hidden");

  requestAnimationFrame(animate);
}

// ===== STEROWANIE =====

window.addEventListener("keydown", e => {
  keys[e.code] = true;

  if (e.code === "Space") {
    e.preventDefault();
    jump();
  }

  if (e.code === "KeyR") reload();
});

window.addEventListener("keyup", e => {
  keys[e.code] = false;
});

function jump() {
  if (playing && !paused && jumpTime <= 0) {
    jumpTime = 0.65;
  }
}

// Komputer: obracanie kamerą myszką
document.addEventListener("mousemove", e => {
  if (!playing || paused || !renderer) return;

  if (document.pointerLockElement === renderer.domElement) {
    yaw -= e.movementX * 0.003;
    pitch -= e.movementY * 0.003;

    pitch = THREE.MathUtils.clamp(pitch, -1.3, 1.3);
  }
});

function setupDesktop() {
  const canvas = $("game");

  canvas.addEventListener("click", () => {
    if (!playing || isTouch || !renderer) return;

    renderer.domElement.requestPointerLock?.();
  });

  document.addEventListener("mousedown", e => {
    if (e.button === 0 && playing && !isTouch) {
      shoot();
    }
  });
}

// Telefon: przesuwanie palcem po ekranie gry
let lookPointer = null;
let previousTouch = { x: 0, y: 0 };

function setupTouchLook() {
  $("game").addEventListener("pointerdown", e => {
    if (!playing || !isTouch) return;

    lookPointer = e.pointerId;

    previousTouch = {
      x: e.clientX,
      y: e.clientY
    };
  });

  $("game").addEventListener("pointermove", e => {
    if (e.pointerId !== lookPointer) return;

    const dx = e.clientX - previousTouch.x;
    const dy = e.clientY - previousTouch.y;

    yaw -= dx * 0.005;
    pitch -= dy * 0.005;

    pitch = THREE.MathUtils.clamp(pitch, -1.3, 1.3);

    previousTouch = {
      x: e.clientX,
      y: e.clientY
    };
  });

  function releaseLook(e) {
    if (e.pointerId === lookPointer) {
      lookPointer = null;
    }
  }

  $("game").addEventListener("pointerup", releaseLook);
  $("game").addEventListener("pointercancel", releaseLook);
}

// Joystick
const joystick = $("joystick");
const stick = $("stick");

joystick.addEventListener("pointerdown", e => {
  joystick.setPointerCapture(e.pointerId);
  updateJoystick(e);
});

joystick.addEventListener("pointermove", e => {
  if (e.buttons) updateJoystick(e);
});

function updateJoystick(e) {
  const rect = joystick.getBoundingClientRect();

  let x = e.clientX - rect.left - rect.width / 2;
  let y = e.clientY - rect.top - rect.height / 2;

  const max = 38;
  const length = Math.hypot(x, y);

  if (length > max) {
    x = x / length * max;
    y = y / length * max;
  }

  stick.style.left = (33 + x) + "px";
  stick.style.top = (33 + y) + "px";

  moveX = x / max;
  moveY = -y / max;
}

function resetJoystick() {
  moveX = 0;
  moveY = 0;

  stick.style.left = "33px";
  stick.style.top = "33px";
}

joystick.addEventListener("pointerup", resetJoystick);
joystick.addEventListener("pointercancel", resetJoystick);

// Przyciski telefonu
$("fireBtn").addEventListener("pointerdown", e => {
  e.preventDefault();
  shoot();
});

$("reloadBtn").addEventListener("pointerdown", e => {
  e.preventDefault();
  reload();
});

$("jumpBtn").addEventListener("pointerdown", e => {
  e.preventDefault();
  jump();
});

// ===== RUCH GRACZA =====

function updateMovement(delta) {
  if (!isTouch) {
    moveX = (keys["KeyD"] ? 1 : 0) - (keys["KeyA"] ? 1 : 0);
    moveY = (keys["KeyW"] ? 1 : 0) - (keys["KeyS"] ? 1 : 0);
  }

  const forward = new THREE.Vector3(
    -Math.sin(yaw), 0, -Math.cos(yaw)
  );

  const right = new THREE.Vector3(
    Math.cos(yaw), 0, -Math.sin(yaw)
  );

  const speed = keys["ShiftLeft"] ? 11 : 8;

  player.addScaledVector(forward, moveY * speed * delta);
  player.addScaledVector(right, moveX * speed * delta);

  player.x = THREE.MathUtils.clamp(player.x, -46, 46);
  player.z = THREE.MathUtils.clamp(player.z, -46, 46);

  if (jumpTime > 0) {
    jumpTime -= delta;
  }

  const jumpHeight = jumpTime > 0
    ? Math.sin((jumpTime / 0.65) * Math.PI) * 1
    : 0;

  camera.position.set(player.x, 1.7 + jumpHeight, player.z);
  camera.rotation.set(pitch, yaw, 0);
}

// ===== RUCH BOTÓW =====

function updateEnemies(delta) {
  enemies.forEach(enemy => {
    const direction = new THREE.Vector3(
      player.x - enemy.group.position.x,
      0,
      player.z - enemy.group.position.z
    );

    const distance = direction.length();

    if (distance > 2.2) {
      direction.normalize();

      enemy.group.position.addScaledVector(
        direction,
        enemy.speed * delta
      );
    }

    enemy.group.lookAt(player.x, 0, player.z);

    if (distance < 2.5) {
      enemy.attackTime -= delta;

      if (enemy.attackTime <= 0) {
        damagePlayer(enemy.boss ? 9 : 4);
        enemy.attackTime = 1;
      }
    }
  });
}

// ===== GŁÓWNA PĘTLA =====

function animate(now) {
  if (!playing || !renderer) return;

  const delta = Math.min((now - lastFrame) / 1000, 0.05);
  lastFrame = now;

  updateMovement(delta);
  updateEnemies(delta);

  if (!playing) return;

  if (enemies.length === 0) {
    finishWave();
  }

  renderer.render(scene, camera);

  requestAnimationFrame(animate);
}

// ===== ZMIANA ROZMIARU =====

window.addEventListener("resize", () => {
  if (!camera || !renderer) return;

  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(window.innerWidth, window.innerHeight);
});

// ===== PRZYCISKI MENU =====

$("playBtn").addEventListener("click", startGame);

$("mapsBtn").addEventListener("click", () => {
  hideScreens();
  $("maps").classList.remove("hidden");
});

$("shopBtn").addEventListener("click", showShop);

document.querySelectorAll("[data-map]").forEach(button => {
  button.addEventListener("click", () => {
    selectedMap = button.dataset.map;
    startGame();
  });
});

document.querySelectorAll(".backBtn").forEach(button => {
  button.addEventListener("click", showMenu);
});

$("pauseBtn").addEventListener("click", pauseGame);
$("resumeBtn").addEventListener("click", resumeGame);
$("pauseMenuBtn").addEventListener("click", showMenu);

$("againBtn").addEventListener("click", startGame);
$("overMenuBtn").addEventListener("click", showMenu);

// ===== START =====

setupDesktop();
setupTouchLook();

updateCoins();

$("bestWave").textContent = bestWave;
$("wave").textContent = wave;
