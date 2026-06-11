import { expect } from "chai";
import { ethers } from "hardhat";
import { AgentRegistry, ReputationScore } from "../typechain-types";

describe("AgentRegistry", function () {
  let registry: AgentRegistry;
  let reputation: ReputationScore;
  let owner: any;
  let agentA: any;
  let agentB: any;

  const DID_A = "did:hivagora:agent_a";
  const DID_B = "did:hivagora:agent_b";
  const MIN_STAKE = ethers.parseEther("0.01");

  beforeEach(async function () {
    [owner, agentA, agentB] = await ethers.getSigners();

    const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
    registry = await AgentRegistry.deploy();

    const ReputationScore = await ethers.getContractFactory("ReputationScore");
    reputation = await ReputationScore.deploy(await registry.getAddress());

    await registry.setReputationContract(await reputation.getAddress());
  });

  describe("registerAgent", function () {
    it("registers an agent with minimum stake", async function () {
      await registry.connect(agentA).registerAgent(
        DID_A, ["travel", "hotel"], "http://agent-a.local", { value: MIN_STAKE }
      );
      const agent = await registry.getAgent(DID_A);
      expect(agent.isActive).to.equal(true);
      expect(agent.did).to.equal(DID_A);
      expect(agent.stake).to.equal(MIN_STAKE);
      expect(agent.owner).to.equal(agentA.address);
    });

    it("accepts stake above minimum", async function () {
      const higherStake = ethers.parseEther("0.05");
      await registry.connect(agentA).registerAgent(
        DID_A, ["shopping"], "http://agent-a.local", { value: higherStake }
      );
      const agent = await registry.getAgent(DID_A);
      expect(agent.stake).to.equal(higherStake);
    });

    it("emits AgentRegistered event", async function () {
      await expect(
        registry.connect(agentA).registerAgent(DID_A, ["travel"], "http://agent-a.local", { value: MIN_STAKE })
      )
        .to.emit(registry, "AgentRegistered")
        .withArgs(DID_A, agentA.address, "http://agent-a.local");
    });

    it("reverts if stake is below minimum", async function () {
      const lowStake = ethers.parseEther("0.005");
      await expect(
        registry.connect(agentA).registerAgent(DID_A, [], "http://x.local", { value: lowStake })
      ).to.be.revertedWith("Minimum stake required");
    });

    it("reverts on duplicate DID", async function () {
      await registry.connect(agentA).registerAgent(DID_A, ["travel"], "http://a.local", { value: MIN_STAKE });
      await expect(
        registry.connect(agentB).registerAgent(DID_A, ["shopping"], "http://b.local", { value: MIN_STAKE })
      ).to.be.revertedWith("Agent already registered");
    });
  });

  describe("isAgentActive", function () {
    it("returns true for active agent", async function () {
      await registry.connect(agentA).registerAgent(DID_A, ["travel"], "http://a.local", { value: MIN_STAKE });
      expect(await registry.isAgentActive(DID_A)).to.equal(true);
    });

    it("returns false for unregistered DID", async function () {
      expect(await registry.isAgentActive("did:hivagora:nobody")).to.equal(false);
    });
  });

  describe("deactivateAgent", function () {
    it("reverts if caller is not reputation contract", async function () {
      await registry.connect(agentA).registerAgent(DID_A, ["travel"], "http://a.local", { value: MIN_STAKE });
      await expect(registry.connect(owner).deactivateAgent(DID_A)).to.be.revertedWith(
        "Only reputation contract can call this"
      );
    });

    it("deactivates agent when called by reputation contract", async function () {
      await registry.connect(agentA).registerAgent(DID_A, ["travel"], "http://a.local", { value: MIN_STAKE });

      const repAddr = await reputation.getAddress();
      await ethers.provider.send("hardhat_setBalance", [repAddr, "0x" + ethers.parseEther("1").toString(16)]);
      const repSigner = await ethers.getImpersonatedSigner(repAddr);

      await registry.connect(repSigner).deactivateAgent(DID_A);
      expect(await registry.isAgentActive(DID_A)).to.equal(false);
    });

    it("emits AgentDeactivated event", async function () {
      await registry.connect(agentA).registerAgent(DID_A, ["travel"], "http://a.local", { value: MIN_STAKE });

      const repAddr = await reputation.getAddress();
      await ethers.provider.send("hardhat_setBalance", [repAddr, "0x" + ethers.parseEther("1").toString(16)]);
      const repSigner = await ethers.getImpersonatedSigner(repAddr);

      await expect(registry.connect(repSigner).deactivateAgent(DID_A))
        .to.emit(registry, "AgentDeactivated")
        .withArgs(DID_A);
    });

    it("reverts if agent is already inactive", async function () {
      await registry.connect(agentA).registerAgent(DID_A, ["travel"], "http://a.local", { value: MIN_STAKE });

      const repAddr = await reputation.getAddress();
      await ethers.provider.send("hardhat_setBalance", [repAddr, "0x" + ethers.parseEther("1").toString(16)]);
      const repSigner = await ethers.getImpersonatedSigner(repAddr);

      await registry.connect(repSigner).deactivateAgent(DID_A);
      await expect(registry.connect(repSigner).deactivateAgent(DID_A)).to.be.revertedWith("Agent already inactive");
    });
  });

  describe("setReputationContract", function () {
    it("can only be set by owner", async function () {
      await expect(
        registry.connect(agentA).setReputationContract(agentA.address)
      ).to.be.reverted;
    });
  });
});
