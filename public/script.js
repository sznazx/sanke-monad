/* ===========================================================
   Monad Snake – Secure Front-End  (no secrets in this file)
   =========================================================== */

import { ethers } from 'https://cdnjs.cloudflare.com/ajax/libs/ethers/6.8.1/ethers.min.js';

/* ---------- Network ---------- */
const MONAD_PARAMS = {
  chainId:'0x279f',  // 10143
  chainName:'Monad Testnet',
  nativeCurrency:{ name:'Monad Coin', symbol:'MON', decimals:18 },
  rpcUrls:['https://testnet-rpc.monad.xyz'],
  blockExplorerUrls:['https://testnet.monadexplorer.com']
};
const CHAIN_ID_DEC = 10143;

/* ---------- Runtime-patched by /config.json ---------- */
let TREASURY   = '0xD45005C45b8b6cBF642CB480A87e2C9e412B724E';
let PAY_AMOUNT = '0.15';

/* ---------- Tokens ---------- */
const TOKENS = [
  { src:'https://imagedelivery.net/tWwhAahBw7afBzFUrX5mYQ/6679b698-a845-412b-504b-23463a3e1900/public',
    label:'YAKI', inc:1,    text:'+1 $YAKI',  address:'0xfe140e1dCe99Be9F4F15d657CD9b7BF622270C50', img:null },
  { src:'https://imagedelivery.net/tWwhAahBw7afBzFUrX5mYQ/5d1206c2-042c-4edc-9f8b-dcef2e9e8f00/public',
    label:'CHOG', inc:1,    text:'+1 $CHOG',  address:'0xE0590015A873bF326bd645c3E1266d4db41C4E6B', img:null },
  { src:'https://imagedelivery.net/tWwhAahBw7afBzFUrX5mYQ/27759359-9374-4995-341c-b2636a432800/public',
    label:'DAK',  inc:0.01, text:'+0.01 $DAK', address:'0x0F0BDEbF0F83cD1EE3974779Bcb7315f9808c714', img:null },
  { src:'https://docs.monad.xyz/img/monad_logo.png',
    label:'MON',  inc:0.01, text:'',          address:null, special:true, img:null }
];

/* preload token images */
TOKENS.forEach(t=>{ t.img = new Image(); t.img.src = t.src; });

/* ---------- UI Elements ---------- */
const canvas        = document.getElementById('game');
const ctx           = canvas.getContext('2d');
const overlay       = document.getElementById('overlay');
const connectPanel  = document.getElementById('connect-panel');
const payPanel      = document.getElementById('pay-panel');
const gameoverPanel = document.getElementById('gameover-panel');
const restartBtn    = document.getElementById('restart-btn');   // Play Again
const claimBtn      = document.getElementById('claim-btn');
const heartsDiv     = document.getElementById('hearts');

/* ---------- Game Constants ---------- */
const CELL = 32;
const STEP = 50;            // ms per movement
const MAX_HEARTS = 3;

/* ---------- State ---------- */
let snake, dir, nextDir, rows, cols;
let food, foodToken;
let special, specialTimer;
let alive, hearts;

const counts = Object.fromEntries(TOKENS.map(t=>[t.label,0]));

/* ===========================================================
   Init sequence
   =========================================================== */
loadConfig().then(init);

async function loadConfig(){
  try{
    const cfg = await (await fetch('/config.json')).json();
    if(cfg.TREASURY)   TREASURY   = cfg.TREASURY;
    if(cfg.PAY_AMOUNT) PAY_AMOUNT = cfg.PAY_AMOUNT.toString();
  }catch{ console.warn('No config.json (using defaults)'); }
}

function init(){
  resize();
  window.addEventListener('resize', resize);

  initBar();
  initHearts();

  if(window.ethereum){
    overlay.classList.remove('hidden');
    connectPanel.classList.remove('hidden');
  }else{
    alert('MetaMask / Monad wallet required.');
  }
}

/* ===========================================================
   Wallet connect & pay
   =========================================================== */
document.getElementById('connect-btn').onclick = async ()=>{
  await switchToMonad();
  connectPanel.classList.add('hidden');
  payPanel.classList.remove('hidden');
};

document.getElementById('pay-btn').onclick = payToPlay;

async function payToPlay(){
  try{
    const [addr] = await window.ethereum.request({method:'eth_requestAccounts'});
    await switchToMonad();

    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer   = await provider.getSigner();
    const tx       = await signer.sendTransaction({
      to: TREASURY,
      value: ethers.parseUnits(PAY_AMOUNT,18)
    });
    await tx.wait();

    overlay.classList.add('hidden');
    payPanel.classList.add('hidden');
    startGame();
  }catch(e){
    console.error(e);
    alert('Transaction failed or rejected.');
  }
}

async function switchToMonad(){
  const cid = await window.ethereum.request({method:'eth_chainId'});
  if(parseInt(cid,16)!==CHAIN_ID_DEC){
    try{
      await window.ethereum.request({method:'wallet_switchEthereumChain',
                                     params:[{chainId:MONAD_PARAMS.chainId}]});
    }catch(err){
      await window.ethereum.request({method:'wallet_addEthereumChain',
                                     params:[MONAD_PARAMS]});
    }
  }
}

/* ===========================================================
   Game start / loop
   =========================================================== */
function startGame(){
  rows   = Math.floor((window.innerHeight-60)/CELL);    // 60px bar
  cols   = Math.floor(window.innerWidth/CELL);
  snake  = [{x:Math.floor(cols/2), y:Math.floor(rows/2)}];
  dir    = {x:1,y:0};
  nextDir= {...dir};
  hearts = MAX_HEARTS;
  alive  = true;
  counts['YAKI']=counts['CHOG']=counts['DAK']=counts['MON']=0;

  spawnFood();
  spawnSpecial();
  setTimeout(loop, STEP);
}

function loop(){
  if(!alive) return gameOver();
  moveSnake();
  draw();
  setTimeout(loop, STEP);
}

/* ---------- snake mechanics ---------- */
function moveSnake(){
  dir = nextDir;
  const head = {x:(snake[0].x+dir.x+cols)%cols,
                y:(snake[0].y+dir.y+rows)%rows};

  if(snake.some(s=>s.x===head.x && s.y===head.y)){ alive=false; return; }
  snake.unshift(head);

  // eat food
  if(head.x===food.x && head.y===food.y){
    counts[foodToken.label]+=1;
    updateBar(foodToken.label);
    if(foodToken.text) showFloat(foodToken.text, head.x*CELL, head.y*CELL);
    spawnFood();
  }else snake.pop();

  // eat special
  if(special && head.x===special.x && head.y===special.y){
    counts['MON']+=1;
    updateBar('MON');
    special=null;
  }
}

/* ---------- food / special ---------- */
function spawnFood(){
  const basicTokens = TOKENS.filter(t=>!t.special);
  foodToken = basicTokens[Math.floor(Math.random()*basicTokens.length)];
  food = randCell();
}

function spawnSpecial(){
  special = {...randCell()};
  if(specialTimer) clearTimeout(specialTimer);
  specialTimer = setTimeout(()=>{
     special = null;
     loseHeart();
     spawnSpecial();
  }, 5000);
}

function randCell(){
  return { x:Math.floor(Math.random()*cols), y:Math.floor(Math.random()*rows) };
}

/* ---------- hearts ---------- */
function initHearts(){
  heartsDiv.innerHTML='';
  for(let i=0;i<MAX_HEARTS;i++){
    const img=new Image();
    img.src='https://docs.monad.xyz/img/monad_logo.png';
    img.className='heart';
    heartsDiv.appendChild(img);
  }
}

function loseHeart(){
  if(--hearts<0) hearts=0;
  const img=heartsDiv.children[hearts];
  if(img){
    const r=img.getBoundingClientRect();
    showFloat('-0.05 $MON', r.left, r.top,'red');
    img.style.opacity='0';
    setTimeout(()=>img.remove(),4000);
  }
  document.body.classList.add('shake');
  setTimeout(()=>document.body.classList.remove('shake'),600);
  if(hearts===0) alive=false;
}

/* ===========================================================
   Drawing
   =========================================================== */
function draw(){
  ctx.fillStyle='#000';
  ctx.fillRect(0,0,canvas.width,canvas.height);

  // snake
  ctx.fillStyle='#0f0';
  snake.forEach(s=>ctx.fillRect(s.x*CELL, s.y*CELL, CELL, CELL));

  // food
  ctx.drawImage(foodToken.img, food.x*CELL, food.y*CELL, CELL, CELL);

  // special
  if(special){
    const monImg = TOKENS.find(t=>t.special).img;
    ctx.drawImage(monImg, special.x*CELL, special.y*CELL, CELL, CELL);
  }
}

/* ===========================================================
   UI bar
   =========================================================== */
function initBar(){
  const bar = document.getElementById('bar');
  bar.innerHTML='';
  TOKENS.filter(t=>!t.special).forEach(t=>{
    bar.append(`${t.label}: `);
    const span=document.createElement('span');
    span.id='count-'+t.label;
    span.textContent='0';
    bar.appendChild(span);
    bar.append('   ');
  });
  const monSpan = document.createElement('span');
  monSpan.id='count-MON'; monSpan.textContent='0';
  bar.append('MON: '); bar.appendChild(monSpan);
  bar.appendChild(heartsDiv);  // hearts at end (margin-left via CSS)
}

function updateBar(label){
  if(label){
    const span=document.getElementById('count-'+label);
    if(span) span.textContent=counts[label].toString();
  }else{
    for(const k in counts){
      const span=document.getElementById('count-'+k);
      if(span) span.textContent=counts[k].toString();
    }
  }
}

/* ---------- floating text ---------- */
function showFloat(txt,x,y,color='#fff'){
  if(!txt) return;
  const d=document.createElement('div');
  d.className='float';
  d.textContent=txt;
  d.style.left=x+'px'; d.style.top=y+'px'; d.style.color=color;
  document.body.appendChild(d);
  requestAnimationFrame(()=>{ d.style.transform='translateY(-40px)'; d.style.opacity='0'; });
  setTimeout(()=>d.remove(),1000);
}

/* ===========================================================
   Claim tokens
   =========================================================== */
claimBtn.onclick = claimTokens;

async function claimTokens(){
  claimBtn.disabled=true;
  try{
    const [address] = await window.ethereum.request({method:'eth_requestAccounts'});
    const res = await fetch('/claim', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ address, counts })
    });
    const j = await res.json();
    if(!j.ok) throw new Error(j.error||'claim failed');
    Object.keys(counts).forEach(k=>counts[k]=0);
    updateBar();
    alert('Rewards sent!\\n'+j.hashes.join('\\n'));
  }catch(e){ alert(e.message||'Claim failed'); }
  claimBtn.disabled=false;
}

/* ===========================================================
   Game over & Play Again
   =========================================================== */
function gameOver(){
  overlay.classList.remove('hidden');
  gameoverPanel.classList.remove('hidden');
}
restartBtn.onclick = ()=>location.reload();

/* ===========================================================
   Input
   =========================================================== */
window.addEventListener('keydown',e=>{
  switch(e.key){
    case 'ArrowUp':
    case 'w': if(dir.y===0) nextDir={x:0,y:-1}; break;
    case 'ArrowDown':
    case 's': if(dir.y===0) nextDir={x:0,y:1}; break;
    case 'ArrowLeft':
    case 'a': if(dir.x===0) nextDir={x:-1,y:0}; break;
    case 'ArrowRight':
    case 'd': if(dir.x===0) nextDir={x:1,y:0}; break;
  }
});

/* ===========================================================
   Canvas resize
   =========================================================== */
function resize(){
  canvas.width  = window.innerWidth;
  canvas.height = window.innerHeight - 60;  // leave bar
}
