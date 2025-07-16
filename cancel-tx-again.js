require('dotenv').config();
const { ethers } = require("ethers");

const RPC_URL = "https://bbnrpc.mainnet.bharatblockchain.io";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const ADDRESS = "0x22C72F8Ef5ff9dEb53A15F8F4C5cB6bB9615d1a6";

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

  // Get the nonce of the stuck transaction
  const nonce = await provider.getTransactionCount(ADDRESS, "pending");
  console.log("Using nonce:", nonce);

  // Set a much higher gas price to ensure it replaces the stuck tx
  const maxFeePerGas = ethers.parseUnits("100", "gwei");
  const maxPriorityFeePerGas = ethers.parseUnits("10", "gwei");

  // Send 0 ETH to yourself with the same nonce
  const tx = {
    to: ADDRESS,
    value: 0,
    nonce,
    gasLimit: 21000,
    maxFeePerGas,
    maxPriorityFeePerGas,
  };

  const sentTx = await wallet.sendTransaction(tx);
  console.log("Replacement tx sent:", sentTx.hash);
  await sentTx.wait();
  console.log("Replacement tx mined!");
}

main().catch(console.error); 