import { expect } from "chai";
import { ethers } from "hardhat";
import { DealRecord, ReputationScore, AgentRegistry } from "../typechain-types";

describe("DealRecord", function () {
  let registry: AgentRegistry;
  let reputation: ReputationScore;
  let dealRecord: DealRecord;
  let owner: any;
  let other: any;

  const DID_A = "did:hivagora:agent_a";
  const DID_B = "did:hivagora:agent_b";

  beforeEach(async function () {
    [owner, other] = await ethers.getSigners();

    const AgentRegistry = await ethers.getContractFactory("AgentRegistry");
    registry = await AgentRegistry.deploy();

    const ReputationScore = await ethers.getContractFactory("ReputationScore");
    reputation = await ReputationScore.deploy(await registry.getAddress());

    const DealRecord = await ethers.getContractFactory("DealRecord");
    dealRecord = await DealRecord.deploy(await reputation.getAddress());

    await registry.setReputationContract(await reputation.getAddress());
    await reputation.setDealRecordContract(await dealRecord.getAddress());
  });

  describe("recordDeal", function () {
    it("records a deal and stores it on-chain", async function () {
      await dealRecord.recordDeal("deal_1", DID_A, DID_B, "0xabc123");
      const deal = await dealRecord.getDeal("deal_1");
      expect(deal.dealId).to.equal("deal_1");
      expect(deal.agentA).to.equal(DID_A);
      expect(deal.agentB).to.equal(DID_B);
      expect(deal.dealHash).to.equal("0xabc123");
      expect(deal.timestamp).to.be.gt(0);
    });

    it("emits DealRecorded event", async function () {
      await expect(dealRecord.recordDeal("deal_2", DID_A, DID_B, "0xdef456"))
        .to.emit(dealRecord, "DealRecorded")
        .withArgs("deal_2", DID_A, DID_B, "0xdef456");
    });

    it("increases reputation score for both agents by 10 each", async function () {
      await dealRecord.recordDeal("deal_3", DID_A, DID_B, "0x111");
      expect(await reputation.getScore(DID_A)).to.equal(10);
      expect(await reputation.getScore(DID_B)).to.equal(10);
    });

    it("accumulates scores across multiple deals", async function () {
      await dealRecord.recordDeal("deal_4", DID_A, DID_B, "0xaaa");
      await dealRecord.recordDeal("deal_5", DID_A, DID_B, "0xbbb");
      expect(await reputation.getScore(DID_A)).to.equal(20);
      expect(await reputation.getScore(DID_B)).to.equal(20);
    });

    it("reverts if called by non-owner", async function () {
      await expect(
        dealRecord.connect(other).recordDeal("deal_6", DID_A, DID_B, "0xccc")
      ).to.be.reverted;
    });

    it("stores deal as immutable — timestamp is set at block time", async function () {
      const tx = await dealRecord.recordDeal("deal_7", DID_A, DID_B, "0xddd");
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt!.blockNumber);
      const deal = await dealRecord.getDeal("deal_7");
      expect(deal.timestamp).to.equal(block!.timestamp);
    });
  });

  describe("getDeal", function () {
    it("returns empty struct for unknown dealId", async function () {
      const deal = await dealRecord.getDeal("nonexistent");
      expect(deal.dealId).to.equal("");
      expect(deal.agentA).to.equal("");
    });
  });
});
