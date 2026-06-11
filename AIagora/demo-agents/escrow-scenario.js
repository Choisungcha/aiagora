const { HivagoraAgentSDK } = require('../sdk/src/index');
const { ethers } = require('ethers');

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runEscrowScenario() {
  console.log("🚀 Starting Phase 7: Multi-party Escrow Scenario...");

  const orchestrator = new HivagoraAgentSDK({
    name: "TravelOrchestrator",
    privateKey: ethers.hexlify(ethers.randomBytes(32)),
    hubUrl: "ws://localhost:4000",
    capabilities: ["orchestration"]
  });

  const flight = new HivagoraAgentSDK({
    name: "SkyHighAirlines",
    privateKey: ethers.hexlify(ethers.randomBytes(32)),
    hubUrl: "ws://localhost:4000",
    capabilities: ["flight"]
  });

  const hotel = new HivagoraAgentSDK({
    name: "OceanViewHotel",
    privateKey: ethers.hexlify(ethers.randomBytes(32)),
    hubUrl: "ws://localhost:4000",
    capabilities: ["accommodation"]
  });

  await orchestrator.connect();
  await flight.connect();
  await hotel.connect();

  const bundleParticipants = new Set();
  const dealId = "bundle_osaka_999";

  // --- Flight Agent Logic ---
  flight.on('message', (msg) => {
    if (msg.type === 'broadcast' && msg.content.request === 'osaka_package') {
      console.log("🤖 SkyHighAirlines: Osaka flight request confirmed. Sending proposal.");
      flight.sendDirect(msg.from, 'negotiate', { service: 'Flight', price: '400,000 KRW' });
    }
    if (msg.type === 'propose_bundle' && msg.content.dealId === dealId) {
      console.log("🤖 SkyHighAirlines: Bundle proposal received. Escrow participation confirmed.");
      flight.acceptBundle(msg.from, dealId);
    }
  });

  // --- Hotel Agent Logic ---
  hotel.on('message', (msg) => {
    if (msg.type === 'broadcast' && msg.content.request === 'osaka_package') {
      console.log("🤖 OceanViewHotel: Osaka hotel request confirmed. Sending proposal.");
      hotel.sendDirect(msg.from, 'negotiate', { service: 'Hotel', price: '600,000 KRW' });
    }
    if (msg.type === 'propose_bundle' && msg.content.dealId === dealId) {
      console.log("🤖 OceanViewHotel: Bundle proposal received. Escrow participation confirmed.");
      hotel.acceptBundle(msg.from, dealId);
    }
  });

  // --- Orchestrator Logic ---
  const offers = [];
  orchestrator.on('message', async (msg) => {
    if (msg.type === 'negotiate') {
      console.log(`🤖 TravelOrchestrator: Proposal received (${msg.content.service}: ${msg.content.price})`);
      offers.push({ from: msg.from, ...msg.content });

      if (offers.length === 2) {
        console.log("🤖 TravelOrchestrator: All services matched. Starting multi-party escrow simulation...");
        await sleep(1000);
        orchestrator.proposeBundle(offers.map(o => o.from), { dealId, total: "1,000,000 KRW" });
      }
    }

    if (msg.type === 'join_bundle' && msg.content.dealId === dealId) {
      bundleParticipants.add(msg.from);
      console.log(`🤖 TravelOrchestrator: Participant verified (${msg.from.slice(0, 15)}...). Total: ${bundleParticipants.size}/2`);
      
      if (bundleParticipants.size === 2) {
        console.log("🤖 TravelOrchestrator: All parties agreed! Calling [Escrow.createEscrow] (Simulation)");
        await sleep(1000);
        console.log("🤖 TravelOrchestrator: Funds deposited. Final approval issued.");
        orchestrator.broadcast({ type: 'escrow_finalized', dealId, status: 'Funds Locked' });
      }
    }
  });

  console.log("\n--- Scenario 4: Osaka 3-night Full Package (Escrow) ---");
  orchestrator.broadcast({ request: "osaka_package", budget: "1,500,000 KRW" });

  await sleep(6000);
  console.log("\n✅ Multi-party Escrow scenario completed.");
  process.exit(0);
}

runEscrowScenario().catch(console.error);
