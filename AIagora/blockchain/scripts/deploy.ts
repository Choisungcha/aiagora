import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);
  console.log("Account balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "MATIC");
  console.log("---");

  // 1. AgentRegistry
  const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
  const registry = await AgentRegistry.deploy();
  await registry.waitForDeployment();
  const registryAddress = await registry.getAddress();
  console.log("AgentRegistry deployed to:", registryAddress);

  // 2. ReputationScore (needs registry address)
  const ReputationScore = await ethers.getContractFactory("ReputationScore");
  const reputation = await ReputationScore.deploy(registryAddress);
  await reputation.waitForDeployment();
  const reputationAddress = await reputation.getAddress();
  console.log("ReputationScore deployed to:", reputationAddress);

  // 3. DealRecord (needs reputation address)
  const DealRecord = await ethers.getContractFactory("DealRecord");
  const dealRecord = await DealRecord.deploy(reputationAddress);
  await dealRecord.waitForDeployment();
  const dealRecordAddress = await dealRecord.getAddress();
  console.log("DealRecord deployed to:", dealRecordAddress);

  // 4. Escrow (standalone)
  const Escrow = await ethers.getContractFactory("Escrow");
  const escrow = await Escrow.deploy();
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log("Escrow deployed to:", escrowAddress);

  // 5. Cross-wire permissions
  console.log("\nConfiguring permissions...");
  const setRepTx = await registry.setReputationContract(reputationAddress);
  await setRepTx.wait();
  console.log("AgentRegistry → ReputationScore linked");

  const setDealTx = await reputation.setDealRecordContract(dealRecordAddress);
  await setDealTx.wait();
  console.log("ReputationScore → DealRecord linked");

  // 6. Write addresses to deployments.json (consumed by backend & api-gateway)
  const network = await ethers.provider.getNetwork();
  const addresses = {
    network: network.name,
    chainId: Number(network.chainId),
    deployedAt: new Date().toISOString(),
    contracts: {
      AgentRegistry: registryAddress,
      ReputationScore: reputationAddress,
      DealRecord: dealRecordAddress,
      Escrow: escrowAddress,
    },
  };

  const outPath = path.join(__dirname, "..", "deployments.json");
  fs.writeFileSync(outPath, JSON.stringify(addresses, null, 2));
  console.log("\nDeployment addresses written to:", outPath);

  console.log("\nAll contracts deployed and configured!");
  console.table(addresses.contracts);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
