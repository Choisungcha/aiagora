const { HivagoraAgentSDK } = require('../sdk/src/index');
const { ethers } = require('ethers');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runScenarios() {
  console.log("🚀 Hivagora Demo Scenarios Starting...");

  // --- Scenario 1: Travel ---
  const travelAgent = new HivagoraAgentSDK({
    name: "TravelPlanner",
    privateKey: ethers.hexlify(ethers.randomBytes(32)),
    hubUrl: "ws://localhost:4000",
    capabilities: ["travel"]
  });

  const hotelAgent = new HivagoraAgentSDK({
    name: "LuxuryHotel",
    privateKey: ethers.hexlify(ethers.randomBytes(32)),
    hubUrl: "ws://localhost:4000",
    capabilities: ["accommodation"]
  });

  await travelAgent.connect();
  await hotelAgent.connect();

  hotelAgent.on('message', async (msg) => {
    if (msg.type === 'broadcast' && msg.content.goal && msg.content.goal.toLowerCase().includes('tokyo')) {
      console.log(`🤖 LuxuryHotel: Tokyo accommodation request detected!`);
      hotelAgent.sendDirect(msg.from, 'negotiate', { 
        price: '300,000 KRW', 
        details: 'Ginza 5-star hotel, 1 night' 
      });
    }
  });

  travelAgent.on('message', async (msg) => {
    if (msg.type === 'negotiate') {
      console.log(`🤖 TravelPlanner: Proposal received! Price: ${msg.content.price}`);
      await sleep(1000);
      travelAgent.sendDirect(msg.from, 'accept', { dealId: 'deal_tokyo_001' });
    }
    if (msg.type === 'accept') {
       console.log(`🤖 LuxuryHotel: Deal successfully closed! Deal ID: ${msg.content.dealId}`);
    }
  });

  console.log("\n--- Scenario 1: Tokyo 3-night travel, budget 1M KRW ---");
  travelAgent.broadcast({ goal: "Tokyo 3-night travel, looking for 1M KRW accommodation" });

  await sleep(3000);

  // --- Scenario 2: Second-hand Shopping ---
  const buyerAgent = new HivagoraAgentSDK({
    name: "iPhoneBuyer",
    privateKey: ethers.hexlify(ethers.randomBytes(32)),
    hubUrl: "ws://localhost:4000",
    capabilities: ["shopping"]
  });

  const sellerAgent = new HivagoraAgentSDK({
    name: "GadgetSeller",
    privateKey: ethers.hexlify(ethers.randomBytes(32)),
    hubUrl: "ws://localhost:4000",
    capabilities: ["sale"]
  });

  await buyerAgent.connect();
  await sellerAgent.connect();

  sellerAgent.on('message', (msg) => {
    if (msg.type === 'broadcast' && msg.content.item === 'iPhone15') {
       console.log(`🤖 GadgetSeller: iPhone15 match found! Sending proposal.`);
       sellerAgent.sendDirect(msg.from, 'negotiate', { price: '480,000 KRW', condition: 'Mint' });
    }
  });

  buyerAgent.on('message', (msg) => {
    if (msg.type === 'negotiate') {
      console.log(`🤖 iPhoneBuyer: Price check (${msg.content.price}). Within budget. Accepting!`);
      buyerAgent.sendDirect(msg.from, 'accept', { dealId: 'iphone_15_deal' });
    }
  });

  console.log("\n--- Scenario 2: iPhone15 under 500k KRW second-hand deal ---");
  buyerAgent.broadcast({ item: "iPhone15", maxPrice: "500,000 KRW" });

  await sleep(3000);

  // --- Scenario 3: Food Delivery ---
  const foodieAgent = new HivagoraAgentSDK({
    name: "HungryAI",
    privateKey: ethers.hexlify(ethers.randomBytes(32)),
    hubUrl: "ws://localhost:4000",
    capabilities: ["food"]
  });

  const pizzaAgent = new HivagoraAgentSDK({
    name: "PizzaMaster",
    privateKey: ethers.hexlify(ethers.randomBytes(32)),
    hubUrl: "ws://localhost:4000",
    capabilities: ["restaurant"]
  });

  await foodieAgent.connect();
  await pizzaAgent.connect();

  pizzaAgent.on('message', (msg) => {
    if (msg.type === 'broadcast' && msg.content.craving === 'Pizza') {
       console.log(`🤖 PizzaMaster: Pizza order request detected!`);
       pizzaAgent.sendDirect(msg.from, 'negotiate', { menu: 'Pepperoni Pizza', eta: '20 mins' });
    }
  });

  foodieAgent.on('message', (msg) => {
    if (msg.type === 'negotiate') {
      console.log(`🤖 HungryAI: Arrival in ${msg.content.eta}? Perfect!`);
      foodieAgent.sendDirect(msg.from, 'accept', { dealId: 'pizza_deal_777' });
    }
  });

  console.log("\n--- Scenario 3: Tonight's solo dinner, Pizza recommendation ---");
  foodieAgent.broadcast({ craving: "Pizza", budget: "20,000 KRW" });

  await sleep(3000);
  console.log("\n✅ All scenarios completed.");
  process.exit(0);
}

runScenarios().catch(console.error);
