import { ethers } from "https://cdnjs.cloudflare.com/ajax/libs/ethers/6.8.1/ethers.min.js";

/* ---------- NETWORK & PAYMENT CONFIG ---------- */
const MONAD_PARAMS = {
  chainId: '0x279f', // 10143
  chainName: 'Monad Testnet',
  nativeCurrency: { name: 'Monad Coin', symbol: 'MON', decimals: 18 },
  rpcUrls: ['https://testnet-rpc.monad.xyz'],
  blockExplorerUrls: ['https://testnet.monadexplorer.com']
};
const CHAIN_ID_DEC = 10143;
const PAY_AMOUNT = "0.15";             // in MON
const TREASURY = "0xD45005C45b8b6cBF642CB480A87e2C9e412B724E";  // <-- replace with your address

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

const ERC20_ABI = [
  "function mint(address to, uint256 amount) public returns (bool)",
  "function transfer(address to, uint256 amount) public returns (bool)",
  "function decimals() view returns (uint8)"
];

/* ---------- UI ELEMENTS ---------- */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const connectPanel = document.getElementById('connect-panel');
const payPanel = document.getElementById('pay-panel');
const gameoverPanel = document.getElementById('gameover-panel');
const connectBtn = document.getElementById('connect-btn');
const payBtn = document.getElementById('pay-btn');
const claimBtn = document.getElementById('claim-btn');
const restartBtn = document.getElementById('restart-btn');
const summaryP = document.getElementById('summary');

/* ---------- WALLET HANDLING ---------- */
let provider, signer, userAddress;

async function ensureMonadNetwork(){
  try{
    // Try to switch
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: MONAD_PARAMS.chainId }]
    });
  }catch(switchErr){
    // If not found, try adding
    if(switchErr.code === 4902){
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [ MONAD_PARAMS ]
      });
    }else{
      throw switchErr;
    }
  }
}

async function connectWallet(){
  if(!window.ethereum){
    alert("Please install MetaMask (or another EVM wallet).");
    return;
  }
  await ensureMonadNetwork();
  provider = new ethers.BrowserProvider(window.ethereum);
  const [addr] = await provider.send("eth_requestAccounts", []);
  userAddress = ethers.getAddress(addr);
  const net = await provider.getNetwork();
  if(Number(net.chainId) !== CHAIN_ID_DEC){
    alert("Failed to switch to Monad Testnet. Try manually via your wallet.");
    throw new Error("Wrong network");
  }
  signer = await provider.getSigner();
  connectPanel.classList.add('hidden');
  payPanel.classList.remove('hidden');
}

async function payToPlay(){
  try{
    const tx = await signer.sendTransaction({
      to: TREASURY,
      value: ethers.parseEther(PAY_AMOUNT)
    });
    await tx.wait();
      // mark as sent so retries only send remaining
overlay.classList.add('hidden');
    initBar();
  initHearts();
    startGame();
  }catch(e){
    console.error(e);
    alert("Transaction failed or was rejected.");
  }
}

/* ---------- GAME ENGINE (same as v5, trimmed) ---------- */
const CELL=32, STEP=50;
const BAR_PX=60; // height of token bar in pixels
let COLS, ROWS;
function resize(){
  canvas.width=Math.floor(window.innerWidth/CELL)*CELL;
  canvas.height=Math.floor((window.innerHeight - BAR_PX)/CELL)*CELL;
  COLS=canvas.width/CELL; ROWS=canvas.height/CELL;
}
window.addEventListener('resize',resize); resize();

const MAX_HEARTS=3;
let hearts=MAX_HEARTS;

const counts = {YAKI:0, CHOG:0, DAK:0, MON:0};
let snake, dir, nextDir, food, specialFood, score, alive=false;

function resetGame(){
  snake=[{x:Math.floor(COLS/2), y:Math.floor(ROWS/2)}];
  dir={x:1,y:0}; nextDir={...dir}; score=0;
  food=null; specialFood=null;
  Object.keys(counts).forEach(k=>counts[k]=0);
  hearts=MAX_HEARTS; initHearts();
}

function randPos(){ return {x:Math.floor(Math.random()*COLS), y:Math.floor(Math.random()*ROWS)}; }

async function loadImageBlob(url){
  const res=await fetch(url); const blob=await res.blob();
  const img=new Image(); img.src=URL.createObjectURL(blob);
  await new Promise(r=>img.onload=r); return img;
}

async function loadAssets(){
  const imgs=await Promise.all(TOKENS.map(t=>loadImageBlob(t.src).catch(()=>null)));
  imgs.forEach((img,i)=>TOKENS[i].img=img);
}

function spawnFood(){
  const normals=TOKENS.filter(t=>!t.special&&t.img);
  if(!normals.length) return;
  const token=normals[Math.floor(Math.random()*normals.length)];
  let p;
  do{p=randPos();}while(snake.some(s=>s.x===p.x&&s.y===p.y));
  food={...p,token};
}

function spawnSpecial(){
  if(specialFood) return;
  const token=TOKENS.find(t=>t.special&&t.img);
  if(!token) return;
  let p;
  do{p=randPos();}while(snake.some(s=>s.x===p.x&&s.y===p.y));
  specialFood={...p,token};
  setTimeout(()=>{ if(specialFood){ specialFood=null; loseHeart(); } },5000);
}
setInterval(spawnSpecial,20000);

/* ---------- SCORE BAR & FLOATING TEXT ---------- */
function initBar(){
  const bar=document.getElementById('bar');
  bar.innerHTML='';
  TOKENS.forEach(t=>{
    if(t.special) return;
    const itm=document.createElement('div'); itm.className='bar-item';
    const img=new Image(); img.src=t.src; img.width=img.height=32;
    itm.appendChild(img);
    const span=document.createElement('span'); span.id='count-'+t.label; span.textContent='0';
    itm.appendChild(span);
    bar.appendChild(itm);
  });
}

/* ---------- HEARTS UI ---------- */
function initHearts(){
  const heartsDiv=document.getElementById('hearts');
  heartsDiv.innerHTML='';
  document.getElementById('bar').appendChild(heartsDiv);
  for(let i=0;i<MAX_HEARTS;i++){
    const img=new Image();
    img.src='https://docs.monad.xyz/img/monad_logo.png';
    img.className='heart';
    heartsDiv.appendChild(img);
  }
}
function loseHeart(){
  document.body.classList.add('shake'); setTimeout(()=>document.body.classList.remove('shake'),600);
  if(hearts<=0) return;
  --hearts;
  const heartsDiv=document.getElementById('hearts');
  const heartImg=heartsDiv.children[hearts];
  if(heartImg){
    const rect=heartImg.getBoundingClientRect();
    showFloat('-0.05 $MON', rect.left, rect.top);
    heartImg.style.opacity='0';
    setTimeout(()=>heartImg.remove(),4000);
  }
  if(hearts<=0){
    alive=false;
  }
}
function updateBar(label){
  const span=document.getElementById('count-'+label);
  if(span){ span.textContent=counts[label].toString(); }
}
function showFloat(text,px,py){
  const d=document.createElement('div'); d.className='float';
  d.style.left=px+'px'; d.style.top=py+'px'; d.textContent=text;
  if(text.trim().startsWith('-')){d.style.color='red';}
  document.body.appendChild(d);
  requestAnimationFrame(()=>{d.style.transform='translateY(-40px)'; d.style.opacity='0';});
  setTimeout(()=>d.remove(),1000);
}

/* ---------- INPUT ---------- */
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

/* ---------- GAME UPDATE/DRAW ---------- */
function update(){
  dir=nextDir;
  const head={x:(snake[0].x+dir.x+COLS)%COLS, y:(snake[0].y+dir.y+ROWS)%ROWS};
  if(snake.some((s,i)=>i && s.x===head.x && s.y===head.y)){ alive=false; return; }
  snake.unshift(head);
  if(food && head.x===food.x && head.y===food.y){
    counts[food.token.label]+=food.token.inc;
    updateBar(food.token.label);
    if(food.token.text) showFloat(food.token.text, head.x*CELL, head.y*CELL);
    score+=food.token.inc;
    spawnFood();
  }else if(specialFood && head.x===specialFood.x && head.y===specialFood.y){
    counts[specialFood.token.label]+=specialFood.token.inc;
    updateBar(specialFood.token.label);
    if(specialFood.token.text) showFloat(specialFood.token.text, head.x*CELL, head.y*CELL);
    score+=10;
    specialFood=null;
  }else{
    snake.pop();
  }
}
function draw(){
  ctx.fillStyle='#000'; ctx.fillRect(0,0,canvas.width,canvas.height);
  if(food) ctx.drawImage(food.token.img, food.x*CELL, food.y*CELL, CELL, CELL);
  if(specialFood) ctx.drawImage(specialFood.token.img, specialFood.x*CELL, specialFood.y*CELL, CELL, CELL);
  ctx.fillStyle='#0f0'; snake.forEach(s=>ctx.fillRect(s.x*CELL, s.y*CELL, CELL, CELL));
  document.getElementById('score').textContent='Score: '+score.toFixed(0);
}
function gameLoop(ts){
  if(!alive){ onGameOver(); return; }
  if(ts - gameLoop.last > STEP){ update(); gameLoop.last=ts; }
  draw(); requestAnimationFrame(gameLoop);
}
gameLoop.last=0;

function startGame(){
  resetGame();
  spawnFood();
  alive=true;
  requestAnimationFrame(gameLoop);
}

/* ---------- GAME OVER ---------- */
function onGameOver(){
  overlay.classList.remove('hidden');
  connectPanel.classList.add('hidden');
  payPanel.classList.add('hidden');
  gameoverPanel.classList.remove('hidden');
  summaryP.textContent=`YAKI: ${counts.YAKI}, CHOG: ${counts.CHOG}, DAK: ${counts.DAK}`;
}


/* ---------- CLAIM TOKENS FROM GAME WALLET ---------- */
// Replace with the private key of your game wallet (holds token balances & MON for gas)
const GAME_PK = "0x9fc10d83a494011a9911e63dc18e634da61d15cb1cd7cf3b46ae59f0c7006d51";   // <— CHANGE ME

async function claimTokens(){
  if(!GAME_PK || GAME_PK.length !== 66){
    alert("Server not configured: add GAME_PK in script.js");
    return;
  }
  summaryP.textContent = "Preparing claims…";

  try{
    const gameWallet = new ethers.Wallet(GAME_PK, provider);
    let txCount = await provider.getTransactionCount(gameWallet.address);

    for (const t of TOKENS){
      if(!t.address || counts[t.label] === 0) continue;
      const contract = new ethers.Contract(t.address, ERC20_ABI, gameWallet);
      let decimals = 18;
      try { decimals = await contract.decimals(); }catch{}
      const amount = ethers.parseUnits(counts[t.label].toString(), decimals);

      const tx = await contract.transfer(userAddress, amount, { nonce: txCount++ });
      await tx.wait();
      // mark as sent so retries only send remaining
      counts[t.label]=0; updateBar(t.label);
    }
    summaryP.textContent = "Tokens transferred — check wallet!";
  }catch(err){
    console.error(err);
    summaryP.textContent = "Claim failed: "+ err.message;
  }
}


/* ---------- BOOTSTRAP ---------- */
connectBtn.onclick=connectWallet;
payBtn.onclick=payToPlay;
claimBtn.onclick=claimTokens;
restartBtn.onclick=()=>{overlay.classList.remove('hidden'); connectPanel.classList.add('hidden'); payPanel.classList.remove('hidden'); gameoverPanel.classList.add('hidden');};

await loadAssets();
overlay.classList.remove('hidden');
// Hide the score bar
 document.getElementById('score').style.display='none';
