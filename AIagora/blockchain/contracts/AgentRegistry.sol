// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

contract AgentRegistry is Ownable {
    struct Agent {
        string did;
        string[] capabilities;
        string endpoint;
        uint256 stake;
        bool isActive;
        address owner;
    }

    mapping(string => Agent) private agents;
    mapping(address => string) private addressToDid;
    address public reputationContract;

    event AgentRegistered(string indexed did, address indexed owner, string endpoint);
    event AgentDeactivated(string indexed did);

    constructor() Ownable(msg.sender) {}

    modifier onlyReputation() {
        require(msg.sender == reputationContract, "Only reputation contract can call this");
        _;
    }

    function setReputationContract(address _reputationContract) external onlyOwner {
        reputationContract = _reputationContract;
    }

    function registerAgent(
        string memory _did,
        string[] memory _capabilities,
        string memory _endpoint
    ) external payable {
        require(bytes(agents[_did].did).length == 0, "Agent already registered");
        require(msg.value >= 0.01 ether, "Minimum stake required");

        agents[_did] = Agent({
            did: _did,
            capabilities: _capabilities,
            endpoint: _endpoint,
            stake: msg.value,
            isActive: true,
            owner: msg.sender
        });
        addressToDid[msg.sender] = _did;

        emit AgentRegistered(_did, msg.sender, _endpoint);
    }

    function deactivateAgent(string memory _did) external onlyReputation {
        require(agents[_did].isActive, "Agent already inactive");
        agents[_did].isActive = false;
        emit AgentDeactivated(_did);
    }

    function getAgent(string memory _did) external view returns (
        string memory did,
        string[] memory capabilities,
        string memory endpoint,
        uint256 stake,
        bool isActive,
        address owner
    ) {
        Agent storage agent = agents[_did];
        return (agent.did, agent.capabilities, agent.endpoint, agent.stake, agent.isActive, agent.owner);
    }

    function isAgentActive(string memory _did) external view returns (bool) {
        return agents[_did].isActive;
    }
}
