// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IReputationScore {
    function increaseScore(string calldata did, uint256 amount) external;
}

contract DealRecord is Ownable {
    struct Deal {
        string dealId;
        string agentA;
        string agentB;
        string dealHash;
        uint256 timestamp;
    }

    mapping(string => Deal) private deals;
    IReputationScore public reputation;

    event DealRecorded(string indexed dealId, string agentA, string agentB, string dealHash);

    constructor(address _reputation) Ownable(msg.sender) {
        reputation = IReputationScore(_reputation);
    }

    function recordDeal(
        string calldata _dealId,
        string calldata _agentA,
        string calldata _agentB,
        string calldata _dealHash
    ) external onlyOwner {
        deals[_dealId] = Deal({
            dealId: _dealId,
            agentA: _agentA,
            agentB: _agentB,
            dealHash: _dealHash,
            timestamp: block.timestamp
        });

        // Increase score for both agents upon successful deal record
        reputation.increaseScore(_agentA, 10);
        reputation.increaseScore(_agentB, 10);

        emit DealRecorded(_dealId, _agentA, _agentB, _dealHash);
    }

    function getDeal(string calldata _dealId) external view returns (Deal memory) {
        return deals[_dealId];
    }
}
