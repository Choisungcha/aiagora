import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentRegistry, ReputationScore, DealRecord } from "../typechain-types";

describe("Hivagora System", function () {
  let registry: AgentRegistry;
  let reputation: ReputationScore;
  let dealRecord: DealRecord;
  let owner: any;
  let agentA: any;
  let agentB: any;

  const DID_A = "did:hivagora:agent_a";
  const DID_B = "did:hivagora:agent_b";

  beforeEach(async function () {
    [owner, agentA, agentB] = await ethers.getSigners();

    const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
    registry = await AgentRegistry.deploy();

    const ReputationScore = await ethers.getContractFactory("ReputationScore");
    reputation = await ReputationScore.deploy(await registry.getAddress());

    const DealRecord = await ethers.getContractFactory("DealRecord");
    dealRecord = await DealRecord.deploy(await reputation.getAddress());

    await registry.setReputationContract(await reputation.getAddress());
    await reputation.setDealRecordContract(await dealRecord.getAddress());
  });

  it("Should register an agent with stake", async function () {
    const stake = ethers.parseEther("0.01");
    await registry.connect(agentA).registerAgent(DID_A, ["travel"], "http://agent-a.com", { value: stake });
    
    const agent = await registry.getAgent(DID_A);
    expect(agent.isActive).to.equal(true);
    expect(agent.stake).to.equal(stake);
  });

  it("Should record a deal and increase reputation scores", async function () {
    await dealRecord.recordDeal("deal_1", DID_A, DID_B, "hash_xyz");
    
    expect(await reputation.getScore(DID_A)).to.equal(10);
    expect(await reputation.getScore(DID_B)).to.equal(10);
  });

  it("Should blacklist agent when score drops to 0 or below", async function () {
    await registry.connect(agentA).registerAgent(DID_A, ["travel"], "http://agent-a.com", { value: ethers.parseEther("0.01") });
    
    // Initial score is 0. Decrease it.
    await reputation.decreaseScore(DID_A, 5);
    
    const agent = await registry.getAgent(DID_A);
    expect(agent.isActive).to.equal(false);
  });
});
