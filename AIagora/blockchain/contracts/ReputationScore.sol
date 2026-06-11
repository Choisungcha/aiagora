// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

interface IAgentRegistry {
    function deactivateAgent(string calldata did) external;
    function isAgentActive(string calldata did) external view returns (bool);
}

contract ReputationScore is Ownable {
    mapping(string => int256) private scores;
    IAgentRegistry public registry;
    address public dealRecordContract;

    event ScoreUpdated(string indexed did, int256 newScore);
    event AgentBlacklisted(string indexed did);

    constructor(address _registry) Ownable(msg.sender) {
        registry = IAgentRegistry(_registry);
    }

    modifier onlyAuthorized() {
        require(msg.sender == owner() || msg.sender == dealRecordContract, "Not authorized");
        _;
    }

    function setDealRecordContract(address _dealRecordContract) external onlyOwner {
        dealRecordContract = _dealRecordContract;
    }

    function getScore(string calldata _did) external view returns (int256) {
        return scores[_did];
    }

    function increaseScore(string calldata _did, uint256 _amount) external onlyAuthorized {
        scores[_did] += int256(_amount);
        emit ScoreUpdated(_did, scores[_did]);
    }

    function decreaseScore(string calldata _did, uint256 _amount) external onlyAuthorized {
        scores[_did] -= int256(_amount);
        emit ScoreUpdated(_did, scores[_did]);

        if (scores[_did] <= 0 && registry.isAgentActive(_did)) {
            registry.deactivateAgent(_did);
            emit AgentBlacklisted(_did);
        }
    }
}
