// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract Escrow is Ownable, ReentrancyGuard {
    struct EscrowDeal {
        string dealId;
        address buyer;
        address[] sellers;
        uint256[] amounts;
        uint256 totalAmount;
        bool isCompleted;
        bool isRefunded;
    }

    mapping(string => EscrowDeal) private deals;

    event EscrowCreated(string indexed dealId, address buyer, uint256 totalAmount);
    event EscrowApproved(string indexed dealId);
    event EscrowRefunded(string indexed dealId);

    constructor() Ownable(msg.sender) {}

    function createEscrow(
        string memory _dealId,
        address[] memory _sellers,
        uint256[] memory _amounts
    ) external payable {
        require(bytes(_dealId).length > 0, "Invalid deal ID");
        require(deals[_dealId].buyer == address(0), "Deal already exists");
        require(_sellers.length == _amounts.length, "Mismatched sellers and amounts");
        require(_sellers.length > 0, "No sellers provided");

        uint256 expectedTotal = 0;
        for (uint256 i = 0; i < _amounts.length; i++) {
            expectedTotal += _amounts[i];
        }
        require(msg.value == expectedTotal, "Incorrect ETH amount sent");

        deals[_dealId] = EscrowDeal({
            dealId: _dealId,
            buyer: msg.sender,
            sellers: _sellers,
            amounts: _amounts,
            totalAmount: expectedTotal,
            isCompleted: false,
            isRefunded: false
        });

        emit EscrowCreated(_dealId, msg.sender, expectedTotal);
    }

    function approveEscrow(string memory _dealId) external nonReentrant {
        EscrowDeal storage deal = deals[_dealId];
        require(msg.sender == deal.buyer, "Only buyer can approve");
        require(!deal.isCompleted, "Deal already completed");
        require(!deal.isRefunded, "Deal already refunded");

        deal.isCompleted = true;

        for (uint256 i = 0; i < deal.sellers.length; i++) {
            (bool success, ) = deal.sellers[i].call{value: deal.amounts[i]}("");
            require(success, "Transfer to seller failed");
        }

        emit EscrowApproved(_dealId);
    }

    function refundEscrow(string memory _dealId) external nonReentrant {
        EscrowDeal storage deal = deals[_dealId];
        require(msg.sender == deal.buyer, "Only buyer can request refund");
        require(!deal.isCompleted, "Cannot refund completed deal");
        require(!deal.isRefunded, "Already refunded");

        deal.isRefunded = true;
        (bool success, ) = deal.buyer.call{value: deal.totalAmount}("");
        require(success, "Refund failed");

        emit EscrowRefunded(_dealId);
    }

    function getDeal(string memory _dealId) external view returns (
        address buyer,
        address[] memory sellers,
        uint256[] memory amounts,
        uint256 totalAmount,
        bool isCompleted,
        bool isRefunded
    ) {
        EscrowDeal storage deal = deals[_dealId];
        return (deal.buyer, deal.sellers, deal.amounts, deal.totalAmount, deal.isCompleted, deal.isRefunded);
    }
}
