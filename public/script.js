/* ------------------------------------------------------------------ */
/*  MONAD SNAKE – full client script (May 2025 secure edition)        */
/* ------------------------------------------------------------------ */

import { ethers } from "https://cdnjs.cloudflare.com/ajax/libs/ethers/6.8.1/ethers.min.js";

/* ---------- NETWORK & PAYMENT CONFIG ---------- */
const MONAD_PARAMS = {
  chainId: '0x279f',                 // 10143
  chainName: 'Monad Testnet',
  nativeCurrency: { name: 'Monad Coin', symbol: 'MON', decimals: 18 },
  rpcUrls: ['https://testnet-rpc.monad.xyz'],
  blockExplorerUrls: ['https://testnet.monadexplorer.com']
};
const CHAIN_ID_DEC = 10143;

let PAY_AMOUNT = "0.15";             // ↓ overridden at runtime
let TREASURY   = "0xD45005C45b8b6cBF642CB480A87e2C9e412B724E";

/* ---------- TOKEN CONFIG ---------- */
const TOKENS = [
  { src:'https://imagedelivery.net/tWwhAahBw7afBzFUrX5mYQ/6679b698-a845-412b-504b-23463a3e1900/public',
    label:'YAKI', inc:1, text:'+1 $YAKI', address:'0xfe140e1dCe99Be9F4F15d657CD9b7BF622270C50', img:null },
  { src:'https://imagedelivery.net/tWwhAahBw7afBzFUrX5mYQ/5d1206c2-042c-4edc-9f8b-dcef2e9e8f00/public',
    label:'CHOG', inc:1, text:'+1 $CHOG', address:'0xE0590015A873bF326bd645c3E1266d4db41C4E6B', img:null },
  { src:'https://imagedelivery.net/tWwhAahBw7afBzFUrX5mYQ/27759359-9374-4995-341c-b2636a432800/public',
    label:'DAK',  inc: 0.01, text:'+0.01 $DAK',  address:'0x0F0BDEbF0F83cD1EE3974779Bcb7315f9808c714', img:null },
  { src:'https://docs.monad.xyz/img/monad_logo.png', label:'MON', inc:0.01, text:'',address:null,img:null,special:true }
];

/* ---------- RUNTIME CONFIG (/.env via server) ---------- */
fetch('/config.json')
  .then(r=>r.ok?r.json():{})
  .then(c=>{
    if(c.PAY_AMOUNT) PAY_AMOUNT = c.PAY_AMOUNT.toString();
    if(c.TREASURY)   TREASURY   = c.TREASURY;
  })
  .catch(()=>{});

/* ---------- UI ELEMENTS ---------- */
const canvas        = document.getElementById('game');
const ctx           = canvas.getContext('2d');
const overlay       = document.getElementById('overlay');
const connectPanel  = document.getElementById('connect-panel');
const payPanel      = document.getElementById('pay-panel');
const gameoverPanel = document.getElementById('gameover-panel');
const connectBtn    = document.getElementById('connect-btn');
const payBtn        = document.getElementById('pay-btn');
const claimBtn      = document.getElementById('claim-btn');
const restartBtn    = document.getElementById('restart-btn');

/* ---------- GLOBAL STATE ---------- */
let provider, signer, playerAddr;
let alive  = false;
const counts = { DAK:0, CHOG:0, MON:0 };

const CELL = 32, STEP = 50;          // 50 ms per tick
let ROWS, COLS, snake, dir, nextDir, food, specialTimer;
const MAX_HEARTS = 3;
let hearts = MAX_HEARTS;

/* ---------- INIT ---------- */
function resize(){
  COLS = Math.floor(window.innerWidth  / CELL);
  ROWS = Math.floor((window.innerHeight-60) / CELL);   // 60 px bar
  canvas.width  = COLS * CELL;
  canvas.height = ROWS * CELL;
}
window.addEventListener('resize', resize);
resize();

initBar();
initHearts();
draw();                       // blank screen

/* ---------- WALLET FLOW ---------- */
connectBtn.onclick = async ()=>{
  try{
    if(!window.ethereum) throw new Error("Install Metamask");
    await window.ethereum.request({ method:'wallet_addEthereumChain', params:[MONAD_PARAMS] });
    await window.ethereum.request({ method:'wallet_switchEthereumChain', params:[{chainId: MONAD_PARAMS.chainId}] });

    provider   = new ethers.BrowserProvider(window.ethereum);
    signer     = await provider.getSigner();
    playerAddr = await signer.getAddress();

    connectPanel.classList.add('hidden');
    payPanel.classList.remove('hidden');
  }catch(e){
    alert(e.message || "Wallet error");
  }
};

payBtn.onclick = payToPlay;

async function payToPlay(){
  payBtn.disabled = true;
  try{
    const tx = await signer.sendTransaction({
      to: TREASURY,
      value: ethers.parseUnits(PAY_AMOUNT, 18)
    });
    await tx.wait();

    overlay.classList.add('hidden');
    payPanel.classList.add('hidden');
    alive = true;
    startGame();
  }catch(e){
    console.error(e);
    alert("Transaction failed or was rejected.");
    payBtn.disabled = false;
  }
}

/* ---------- CLAIM FLOW ---------- */
claimBtn.onclick = claimTokens;

async function claimTokens(){
  claimBtn.disabled = true;
  try{
    const res = await fetch('/claim', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ address: playerAddr, counts })
    });
    const j = await res.json();
    if(!j.ok) throw new Error(j.error || 'claim failed');

    // zero the bar
    Object.keys(counts).forEach(k=>counts[k]=0);
    updateBar();
    alert('Rewards sent!\n'+j.hashes.join('\n'));
  }catch(e){
    alert(e.message||'claim failed');
  }
  claimBtn.disabled = false;
}

/* ---------- BAR & HEARTS UI ---------- */
function initBar(){
  const bar = document.getElementById('bar');
  TOKENS.forEach(t=>{
    const span = document.createElement('span');
    span.id = 'count-'+t.label;
    span.textContent = '0';
    span.style.color = t.color;
    span.style.marginRight = '16px';
    bar.appendChild(span);
  });
}

function updateBar(label){
  if(label){
    const s = document.getElementById('count-'+label);
    if(s) s.textContent = counts[label].toString();
  }else{
    Object.keys(counts).forEach(l=>{
      const s = document.getElementById('count-'+l);
      if(s) s.textContent = counts[l].toString();
    });
  }
}

/* hearts */
function initHearts(){
  const heartsDiv = document.getElementById('hearts');
  heartsDiv.innerHTML = '';
  for(let i=0;i<MAX_HEARTS;i++){
    const img = new Image();
    img.src = 'https://docs.monad.xyz/img/monad_logo.png';
    img.className = 'heart';
    heartsDiv.appendChild(img);
  }
}

function loseHeart(){
  if(hearts<=0) return;
  document.body.classList.add('shake');
  setTimeout(()=>document.body.classList.remove('shake'),600);

  --hearts;
  const heartsDiv = document.getElementById('hearts');
  const heartImg  = heartsDiv.children[hearts];
  if(heartImg){
    const r = heartImg.getBoundingClientRect();
    showFloat('-0.05 $MON', r.left, r.top);
    heartImg.style.opacity = '0';
    setTimeout(()=>heartImg.remove(),4000);
  }
  if(hearts<=0){
    alive = false;
  }
}

/* ---------- GAME ENGINE ---------- */
function startGame(){
  snake = [{x:Math.floor(COLS/2), y:Math.floor(ROWS/2)}];
  dir = {x:1,y:0};
  nextDir = {...dir};
  spawnFood();
  specialTimer = 0;
  loop();
}

function spawnFood(){
  let x,y;
  do{
    x = Math.floor(Math.random()*COLS);
    y = Math.floor(Math.random()*ROWS);
  }while(snake.some(p=>p.x===x&&p.y===y));
  food = {x,y};
}

function update(){
  if(!alive) return gameOver();

  dir = nextDir;
  const head = {x:(snake[0].x+dir.x+COLS)%COLS, y:(snake[0].y+dir.y+ROWS)%ROWS};

  // collision with self
  if(snake.some(p=>p.x===head.x&&p.y===head.y)){
    alive = false;
    return;
  }

  snake.unshift(head);

  if(head.x===food.x && head.y===food.y){
    const t = TOKENS[Math.floor(Math.random()*TOKENS.length)];
    counts[t.label] += 1;
    updateBar(t.label);
    spawnFood();
  }else{
    snake.pop();
  }

  // special (heart miss mechanic)
  if(++specialTimer >= 400){         // every 20 s (400*50ms)
    specialTimer = 0;
    if(Math.random()<0.5){           // 50% spawn a MON pickup that expires
      const s = {x:food.x, y:food.y, ttl:1000};  // dummy; reuse food spot
      setTimeout(()=>{
        if(s.ttl>0){ loseHeart(); }  // not picked up
      }, 5000);                      // 5 s
    }
  }
}

function draw(){
  ctx.fillStyle = '#000';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // snake
  ctx.fillStyle = '#0f0';
  snake.forEach(p=>ctx.fillRect(p.x*CELL,p.y*CELL,CELL,CELL));

  // food
  ctx.fillStyle = '#ff0';
  ctx.fillRect(food.x*CELL, food.y*CELL, CELL, CELL);
}

function loop(){
  if(!alive) return;
  const t0 = performance.now();
  update();
  draw();
  const dt = performance.now()-t0;
  setTimeout(loop, Math.max(0,STEP-dt));
}

/* ---------- FLOATING TEXT ---------- */
function showFloat(text, px, py){
  const div = document.createElement('div');
  div.className = 'float';
  div.textContent = text;
  div.style.left = px+'px';
  div.style.top  = py+'px';
  if(text.trim().startsWith('-')) div.style.color = 'red';
  document.body.appendChild(div);
  requestAnimationFrame(()=>{div.style.transform='translateY(-40px)'; div.style.opacity='0';});
  setTimeout(()=>div.remove(),1000);
}

/* ---------- INPUT ---------- */
window.addEventListener('keydown', e=>{
  switch(e.key){
    case 'ArrowUp':
    case 'w': if(dir.y===0) nextDir={x:0,y:-1}; break;
    case 'ArrowDown':
    case 's': if(dir.y===0) nextDir={x:0,y: 1}; break;
    case 'ArrowLeft':
    case 'a': if(dir.x===0) nextDir={x:-1,y:0}; break;
    case 'ArrowRight':
    case 'd': if(dir.x===0) nextDir={x: 1,y:0}; break;
    default: break;
  }
});

/* ---------- GAME OVER UI ---------- */
function gameOver(){
  overlay.classList.remove('hidden');
  gameoverPanel.classList.remove('hidden');
}

/* ---------- PLAY AGAIN BUTTON ---------- */
restartBtn.onclick = () => location.reload();

/* ---------- INITIAL PANELS ---------- */
overlay.classList.remove('hidden');
connectPanel.classList.remove('hidden');
payPanel.classList.add('hidden');
gameoverPanel.classList.add('hidden');
