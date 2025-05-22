import express from 'express';
import dotenv from 'dotenv';
import { ethers } from 'ethers';
import fs from 'fs';

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3000;
const RPC_URL = process.env.RPC_URL || 'https://testnet-rpc.monad.xyz';
const provider = new ethers.JsonRpcProvider(RPC_URL);
const signer = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

const TOKEN_ADDRESSES = JSON.parse(process.env.TOKEN_ADDRESSES || '{}');
const ERC20_ABI = [
  "function decimals() view returns (uint8)",
  "function transfer(address to, uint256 value) returns (bool)"
];

app.use(express.static('public', { extensions:['html'], index:'index.html' }));
app.use(express.json());

// runtime config for front-end
app.get('/config.json', (req,res)=> {
  res.json({
    TREASURY: process.env.TREASURY,
    PAY_AMOUNT: process.env.PAY_AMOUNT
  });
});

// claim endpoint
app.post('/claim', async (req,res)=>{
  try{
    const { address, counts={} } = req.body;
    if(!address || !ethers.isAddress(address)) throw new Error('Invalid address');
    const hashes=[];
    for(const [sym,n] of Object.entries(counts)){
       if(n<=0) continue;
       const tokenAddr = TOKEN_ADDRESSES[sym];
       if(!tokenAddr) continue;
       const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
       const decimals = await token.decimals();
       const amount = ethers.parseUnits((0.01*n).toString(), decimals); // 0.01 per token hit
       const tx = await token.transfer(address, amount);
       const receipt = await tx.wait();
       hashes.push(receipt.hash);
    }
    res.json({ ok:true, hashes });
  }catch(e){
    console.error(e);
    res.status(400).json({ ok:false, error:e.message });
  }
});

app.listen(PORT, ()=> console.log('Server on http://localhost:'+PORT));