import { expect } from "chai";
import { ethers } from "hardhat";
import { ReputationScore, AgentRegistry, DealRecord } from "../typechain-types";

describe("ReputationScore", function () {
  let registry: AgentRegistry;
  let reputation: ReputationScore;
  let dealRecord: DealRecord;
  let owner: any;
  let agentA: any;
  let other: any;

  const DID_A = "did:hivagora:agent_rep_a";
  const MIN_STAKE = ethers.parseEther("0.01");

  beforeEach(async function () {
    [owner, agentA, other] = await ethers.getSigners();

    const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
    registry = await AgentRegistry.deploy();

    const ReputationScore = await ethers.getContractFactory("ReputationScore");
    reputation = await ReputationScore.deploy(await registry.getAddress());

    const DealRecord = await ethers.getContractFactory("DealRecord");
    dealRecord = await DealRecord.deploy(await reputation.getAddress());

    await registry.setReputationContract(await reputation.getAddress());
    await reputation.setDealRecordContract(await dealRecord.getAddress());
  });

  describe("getScore", function () {
    it("returns 0 for unregistered agent", async function () {
      expect(await reputation.getScore("did:hivagora:nobody")).to.equal(0);
    });

    it("reflects score after increase", async function () {
      await reputation.increaseScore(DID_A, 50);
      expect(await reputation.getScore(DID_A)).to.equal(50);
    });
  });

  describe("increaseScore", function () {
    it("owner can increase score", async function () {
      await reputation.increaseScore(DID_A, 100);
      expect(await reputation.getScore(DID_A)).to.equal(100);
    });

    it("dealRecord contract can increase score", async function () {
      const dealAddr = await dealRecord.getAddress();
      await ethers.provider.send("hardhat_setBalance", [dealAddr, "0x" + ethers.parseEther("1").toString(16)]);
      const dealSigner = await ethers.getImpersonatedSigner(dealAddr);
      await reputation.connect(dealSigner).increaseScore(DID_A, 20);
      expect(await reputation.getScore(DID_A)).to.equal(20);
    });

    it("emits ScoreUpdated event", async function () {
      await expect(reputation.increaseScore(DID_A, 30))
        .to.emit(reputation, "ScoreUpdated")
        .withArgs(DID_A, 30);
    });

    it("reverts if called by unauthorized address", async function () {
      await expect(reputation.connect(other).increaseScore(DID_A, 10)).to.be.revertedWith("Not authorized");
    });

    it("accumulates score correctly", async function () {
      await reputation.increaseScore(DID_A, 10);
      await reputation.increaseScore(DID_A, 25);
      expect(await reputation.getScore(DID_A)).to.equal(35);
    });
  });

  describe("decreaseScore", function () {
    it("decreases score below starting point for unregistered agent (no revert)", async function () {
      await reputation.decreaseScore(DID_A, 5);
      expect(await reputation.getScore(DID_A)).to.equal(-5);
    });

    it("emits ScoreUpdated event", async function () {
      await reputation.increaseScore(DID_A, 50);
      await expect(reputation.decreaseScore(DID_A, 10))
        .to.emit(reputation, "ScoreUpdated")
        .withArgs(DID_A, 40);
    });

    it("reverts if called by unauthorized address", async function () {
      await expect(reputation.connect(other).decreaseScore(DID_A, 5)).to.be.revertedWith("Not authorized");
    });
  });

  describe("auto-blacklist on score <= 0", function () {
    it("deactivates registered agent when score drops to 0", async function () {
      await registry.connect(agentA).registerAgent(DID_A, ["travel"], "http://a.local", { value: MIN_STAKE });
      expect(await registry.isAgentActive(DID_A)).to.equal(true);

      await reputation.decreaseScore(DID_A, 1);

      expect(await registry.isAgentActive(DID_A)).to.equal(false);
    });

    it("emits AgentBlacklisted when score drops to 0", async function () {
      await registry.connect(agentA).registerAgent(DID_A, ["travel"], "http://a.local", { value: MIN_STAKE });
      await expect(reputation.decreaseScore(DID_A, 1))
        .to.emit(reputation, "AgentBlacklisted")
        .withArgs(DID_A);
    });

    it("records negative score for unregistered agent without reverting", async function () {
      await reputation.decreaseScore(DID_A, 10);
      expect(await reputation.getScore(DID_A)).to.equal(-10);
    });

    it("does not emit AgentBlacklisted when agent is not registered", async function () {
      const tx = await reputation.decreaseScore(DID_A, 5);
      const receipt = await tx.wait();
      const blacklistedTopic = reputation.interface.getEvent("AgentBlacklisted")!.topicHash;
      const found = receipt?.logs.find((l) => l.topics[0] === blacklistedTopic);
      expect(found).to.be.undefined;
    });

    it("agent stays inactive after score is later increased", async function () {
      await registry.connect(agentA).registerAgent(DID_A, ["travel"], "http://a.local", { value: MIN_STAKE });
      await reputation.decreaseScore(DID_A, 5); // triggers blacklist
      await reputation.increaseScore(DID_A, 100); // score recovers but agent stays deactivated
      expect(await registry.isAgentActive(DID_A)).to.equal(false);
    });
  });

  describe("setDealRecordContract", function () {
    it("can only be set by owner", async function () {
      await expect(
        reputation.connect(other).setDealRecordContract(other.address)
      ).to.be.reverted;
    });
  });
});
