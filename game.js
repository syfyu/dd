// 遊戲畫布使用固定的邏輯尺寸，CSS 只負責依螢幕寬度等比例縮放。
const canvas = document.querySelector('#game-canvas');
const context = canvas.getContext('2d');

const WIDTH = canvas.width;
const HEIGHT = canvas.height;
const GROUND_Y = 244;
const PLAYER_X = 90;
const PLAYER_WIDTH = 34;
const PLAYER_HEIGHT = 42;
const GRAVITY = 1900;
const JUMP_VELOCITY = -690;
const INITIAL_SPEED = 330;
const JETPACK_DURATION = 2.8;
const JETPACK_FLIGHT_Y = GROUND_Y - PLAYER_HEIGHT - 92;
const MAX_PETS = 3;
const HIGH_SCORE_KEY = 'little-runner-high-score';

const player = {
  x: PLAYER_X,
  y: GROUND_Y - PLAYER_HEIGHT,
  width: PLAYER_WIDTH,
  height: PLAYER_HEIGHT,
  velocityY: 0,
};

let obstacles = [];
let jetpackPickup = null;
let petPickup = null;
let pets = [];
let petSpawnTimer = 0;
let nextPetSpawnIn = 4;
let jetpackTimeRemaining = 0;
let jetpackSpawnTimer = 0;
let nextJetpackSpawnIn = 5;
let score = 0;
let highScore = loadHighScore();
let elapsedTime = 0;
let spawnTimer = 0;
let nextSpawnIn = 1.25;
let gameOver = false;
let lastFrameTime = 0;
let groundOffset = 0;

// localStorage 可能因瀏覽器隱私設定而無法使用，因此讀取失敗時仍可正常遊玩。
function loadHighScore() {
  try {
    return Number(window.localStorage.getItem(HIGH_SCORE_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveHighScore() {
  try {
    window.localStorage.setItem(HIGH_SCORE_KEY, String(highScore));
  } catch {
    // 無法儲存時保留本次遊戲中的最高分，不影響遊戲流程。
  }
}

function resetGame() {
  obstacles = [];
  jetpackPickup = null;
  petPickup = null;
  pets = [];
  petSpawnTimer = 0;
  nextPetSpawnIn = 4;
  jetpackTimeRemaining = 0;
  jetpackSpawnTimer = 0;
  nextJetpackSpawnIn = 5;
  score = 0;
  elapsedTime = 0;
  spawnTimer = 0;
  nextSpawnIn = 1.25;
  gameOver = false;
  player.y = GROUND_Y - player.height;
  player.velocityY = 0;
}

// 只有角色確實站在地面上時才接受跳躍，避免空中連跳。
function jump() {
  const isOnGround = player.y >= GROUND_Y - player.height - 0.5;
  if (!gameOver && isOnGround) {
    player.velocityY = JUMP_VELOCITY;
  }
}

function handleKeyDown(event) {
  if (event.code !== 'Space' && event.code !== 'ArrowUp' && event.code !== 'Enter') {
    return;
  }

  event.preventDefault();

  if (gameOver) {
    if (event.code === 'Space' || event.code === 'Enter') {
      resetGame();
      if (event.code === 'Space') jump();
    }
    return;
  }

  if (event.code === 'Space' || event.code === 'ArrowUp') jump();
}

function spawnObstacle() {
  // 偶爾改變仙人掌尺寸，讓障礙外觀不會完全重複。
  const height = Math.random() < 0.35 ? 48 : 37;
  const width = height === 48 ? 25 : 21;
  obstacles.push({
    x: WIDTH + 10,
    y: GROUND_Y - height,
    width,
    height,
  });
  nextSpawnIn = 1.05 + Math.random() * 0.85;
}

function spawnJetpackPickup() {
  jetpackPickup = {
    x: WIDTH + 20,
    y: GROUND_Y - 42,
    width: 26,
    height: 26,
  };
}

function spawnPetPickup() {
  petPickup = {
    x: WIDTH + 20,
    y: GROUND_Y - 30,
    width: 28,
    height: 26,
  };
}

function overlaps(first, second) {
  return (
    first.x < second.x + second.width &&
    first.x + first.width > second.x &&
    first.y < second.y + second.height &&
    first.y + first.height > second.y
  );
}

function endGame() {
  gameOver = true;
  const completedScore = Math.floor(score);
  if (completedScore > highScore) {
    highScore = completedScore;
    saveHighScore();
  }
}

function update(deltaTime) {
  if (gameOver) return;

  elapsedTime += deltaTime;
  score += deltaTime * 10;

  // 速度會緩慢成長，並設上限避免難度無止盡地飆升。
  const speed = Math.min(INITIAL_SPEED + elapsedTime * 5, 620);
  groundOffset = (groundOffset + speed * deltaTime) % 32;

  // 噴氣背包只維持 2.8 秒：先短暫升空再滯空，結束後立即交回一般重力。
  if (jetpackTimeRemaining > 0) {
    jetpackTimeRemaining = Math.max(0, jetpackTimeRemaining - deltaTime);
    if (jetpackTimeRemaining > 0) {
      if (player.y > JETPACK_FLIGHT_Y) {
        player.velocityY = -320;
        player.y = Math.max(JETPACK_FLIGHT_Y, player.y + player.velocityY * deltaTime);
      } else {
        player.y = JETPACK_FLIGHT_Y;
        player.velocityY = 0;
      }
    } else {
      player.velocityY = 0;
    }
  } else {
    player.velocityY += GRAVITY * deltaTime;
    player.y += player.velocityY * deltaTime;
    if (player.y + player.height >= GROUND_Y) {
      player.y = GROUND_Y - player.height;
      player.velocityY = 0;
    }
  }

  spawnTimer += deltaTime;
  if (spawnTimer >= nextSpawnIn) {
    spawnObstacle();
    spawnTimer = 0;
  }

  for (const obstacle of obstacles) obstacle.x -= speed * deltaTime;
  obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.width > 0);

  if (jetpackTimeRemaining <= 0) {
    jetpackSpawnTimer += deltaTime;
    if (!jetpackPickup && jetpackSpawnTimer >= nextJetpackSpawnIn) {
      spawnJetpackPickup();
      jetpackSpawnTimer = 0;
      nextJetpackSpawnIn = 7 + Math.random() * 3;
    }
  }

  // 碰撞箱稍微縮小，視覺上更公平，也避免透明邊緣造成意外判定。
  const playerHitbox = {
    x: player.x + 5,
    y: player.y + 4,
    width: player.width - 10,
    height: player.height - 6,
  };
  if (jetpackPickup) {
    jetpackPickup.x -= speed * deltaTime;
    if (overlaps(playerHitbox, jetpackPickup)) {
      jetpackPickup = null;
      jetpackTimeRemaining = JETPACK_DURATION;
    } else if (jetpackPickup.x + jetpackPickup.width < 0) {
      jetpackPickup = null;
    }
  }

  if (pets.length < MAX_PETS) {
    petSpawnTimer += deltaTime;
    if (!petPickup && petSpawnTimer >= nextPetSpawnIn) {
      spawnPetPickup();
      petSpawnTimer = 0;
      nextPetSpawnIn = 6 + Math.random() * 5;
    }
  }

  if (petPickup) {
    petPickup.x -= speed * deltaTime;
    if (overlaps(playerHitbox, petPickup)) {
      pets.push({ color: ['#e8b34d', '#78a58a', '#dc8464'][pets.length] });
      petPickup = null;
    } else if (petPickup.x + petPickup.width < 0) {
      petPickup = null;
    }
  }

  const collidedObstacleIndex = obstacles.findIndex((obstacle) => overlaps(playerHitbox, obstacle));
  if (collidedObstacleIndex !== -1) {
    if (pets.length > 0) {
      pets.pop();
      obstacles.splice(collidedObstacleIndex, 1);
    } else {
      endGame();
    }
  }
}

function drawBackground() {
  context.clearRect(0, 0, WIDTH, HEIGHT);
  context.fillStyle = '#fffefa';
  context.fillRect(0, 0, WIDTH, HEIGHT);

  // 淡色遠山和小雲只提供視覺層次，不會遮擋角色或障礙物。
  context.fillStyle = '#f1f5ec';
  context.beginPath();
  context.moveTo(0, 208);
  context.lineTo(95, 174);
  context.lineTo(177, 208);
  context.lineTo(278, 165);
  context.lineTo(388, 208);
  context.lineTo(495, 181);
  context.lineTo(600, 208);
  context.lineTo(714, 169);
  context.lineTo(WIDTH, 203);
  context.lineTo(WIDTH, GROUND_Y);
  context.lineTo(0, GROUND_Y);
  context.closePath();
  context.fill();

  context.fillStyle = '#e7eee4';
  for (const cloud of [{ x: 120, y: 69 }, { x: 570, y: 104 }]) {
    context.fillRect(cloud.x, cloud.y, 42, 3);
    context.fillRect(cloud.x + 11, cloud.y - 5, 16, 3);
  }
}

function drawGround() {
  context.strokeStyle = '#64776a';
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(0, GROUND_Y + 1);
  context.lineTo(WIDTH, GROUND_Y + 1);
  context.stroke();

  context.fillStyle = '#bac8b9';
  for (let x = -groundOffset; x < WIDTH; x += 32) {
    context.fillRect(x, GROUND_Y + 12, 12, 2);
  }
}

function drawPlayer() {
  const running = !gameOver && player.y >= GROUND_Y - player.height - 0.5;
  const legSwing = running ? Math.sin(elapsedTime * 18) * 3 : 0;

  context.fillStyle = '#263b31';
  context.fillRect(player.x + 3, player.y + 8, 27, 27);
  context.fillRect(player.x + 17, player.y, 15, 19);
  context.fillStyle = '#fffefa';
  context.fillRect(player.x + 26, player.y + 6, 3, 3);

  context.fillStyle = '#263b31';
  context.fillRect(player.x + 7, player.y + 33, 7, 9 + legSwing);
  context.fillRect(player.x + 21, player.y + 33, 7, 9 - legSwing);
}

function drawObstacle(obstacle) {
  context.fillStyle = '#e36d42';
  context.fillRect(obstacle.x + obstacle.width * 0.32, obstacle.y, obstacle.width * 0.42, obstacle.height);
  context.fillRect(obstacle.x, obstacle.y + obstacle.height * 0.42, obstacle.width * 0.42, 7);
  context.fillRect(obstacle.x, obstacle.y + obstacle.height * 0.25, 7, obstacle.height * 0.24);
  context.fillRect(obstacle.x + obstacle.width * 0.6, obstacle.y + obstacle.height * 0.62, obstacle.width * 0.4, 7);
  context.fillRect(obstacle.x + obstacle.width - 7, obstacle.y + obstacle.height * 0.43, 7, obstacle.height * 0.23);
}

function drawJetpackPickup() {
  if (!jetpackPickup) return;

  const { x, y } = jetpackPickup;
  context.fillStyle = '#e36d42';
  context.fillRect(x + 6, y + 3, 14, 20);
  context.fillRect(x + 2, y + 7, 5, 12);
  context.fillRect(x + 19, y + 7, 5, 12);
  context.fillStyle = '#fffefa';
  context.fillRect(x + 10, y + 7, 6, 4);
  context.fillStyle = '#e8b34d';
  context.fillRect(x + 9, y + 23, 3, 3);
  context.fillRect(x + 15, y + 23, 3, 3);
}

function drawPet(pet, x, y, size = 20) {
  context.fillStyle = pet.color;
  context.fillRect(x + 3, y + 5, size - 6, size - 7);
  context.fillRect(x + 5, y, 5, 8);
  context.fillRect(x + size - 10, y, 5, 8);
  context.fillStyle = '#fffefa';
  context.fillRect(x + 7, y + 7, 2, 2);
  context.fillRect(x + size - 9, y + 7, 2, 2);
  context.fillStyle = '#263b31';
  context.fillRect(x + size / 2 - 1, y + 11, 2, 2);
}

function drawPetPickup() {
  if (!petPickup) return;
  drawPet({ color: '#78a58a' }, petPickup.x, petPickup.y, 26);
}

function drawPetFollowers() {
  pets.forEach((pet, index) => {
    const x = player.x - 25 - index * 23;
    const y = Math.min(player.y + 19, GROUND_Y - 20);
    drawPet(pet, x, y, 20);
  });
}

function drawScore() {
  context.textAlign = 'right';
  context.textBaseline = 'top';
  context.font = '500 13px "DM Mono", monospace';
  context.fillStyle = '#78877d';
  context.fillText(`HI ${String(highScore).padStart(5, '0')}`, WIDTH - 24, 20);
  context.fillStyle = '#263b31';
  context.fillText(`距離 ${String(Math.floor(score)).padStart(5, '0')}`, WIDTH - 24, 42);

  context.textAlign = 'left';
  context.fillStyle = '#557966';
  context.fillText(`寵物 ${pets.length}/${MAX_PETS}`, 24, 22);

  if (jetpackTimeRemaining > 0) {
    context.fillStyle = '#e36d42';
    context.fillText(`噴射 ${jetpackTimeRemaining.toFixed(1)}s`, 24, 42);
    context.fillStyle = '#f1dfd5';
    context.fillRect(24, 62, 92, 4);
    context.fillStyle = '#e36d42';
    context.fillRect(24, 62, 92 * (jetpackTimeRemaining / JETPACK_DURATION), 4);
  }
}

function drawGameOver() {
  context.fillStyle = 'rgb(255 254 250 / 76%)';
  context.fillRect(0, 0, WIDTH, HEIGHT);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#263b31';
  context.font = '800 34px Manrope, sans-serif';
  context.fillText('Game Over', WIDTH / 2, HEIGHT / 2 - 22);
  context.fillStyle = '#68796d';
  context.font = '14px Manrope, sans-serif';
  context.fillText('按 Enter 或空白鍵重新開始', WIDTH / 2, HEIGHT / 2 + 18);
}

function render() {
  drawBackground();
  drawGround();
  for (const obstacle of obstacles) drawObstacle(obstacle);
  drawJetpackPickup();
  drawPetPickup();
  drawPlayer();
  drawPetFollowers();
  drawScore();
  if (gameOver) drawGameOver();
}

function gameLoop(timestamp) {
  // 限制單幀時間，切回分頁時不會因過大的時間差讓角色瞬間穿地。
  const deltaTime = lastFrameTime ? Math.min((timestamp - lastFrameTime) / 1000, 0.05) : 0;
  lastFrameTime = timestamp;
  update(deltaTime);
  render();
  window.requestAnimationFrame(gameLoop);
}

window.addEventListener('keydown', handleKeyDown);
canvas.addEventListener('pointerdown', () => {
  if (gameOver) resetGame();
  else jump();
});

window.requestAnimationFrame(gameLoop);