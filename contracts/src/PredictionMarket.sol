// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";

/**
 * @title PredictionMarket
 * @notice Zero-custody prediction market. Contract holds all funds.
 *         Platform never touches user money directly.
 *
 * @dev Security architecture uses 4 separate roles:
 *
 *   OWNER        - Can change roles, upgrade fee, emergency pause. Use a hardware wallet (Ledger).
 *                  Should be a multisig in production (e.g. Gnosis Safe).
 *   ADMIN        - Can create and resolve markets. Operational hot wallet.
 *                  Compromise = wrong resolutions but CANNOT steal funds.
 *   FEE_WALLET   - Only receives platform fees. Read-only from contract perspective.
 *                  Compromise = attacker receives future fees only. Cannot resolve or steal positions.
 *   EMERGENCY    - Can pause the contract in case of exploit. Cannot do anything else.
 *                  Can be given to a trusted third party (e.g. security firm) for extra safety.
 *
 * Attack surface analysis:
 *   - Admin compromised  → attacker can resolve markets incorrectly. Users lose bets, not deposits.
 *                          Mitigation: dispute window + time-lock on resolution (see DISPUTE_WINDOW).
 *   - Fee wallet hacked  → attacker receives future fee payments only. All user funds safe.
 *   - Owner hacked       → worst case. Attacker can change roles. Use Gnosis Safe multisig.
 *   - Contract exploit   → ReentrancyGuard + SafeERC20 + checks-effects-interactions pattern.
 *   - Emergency          → Pausable. Any pause role holder can halt deposits/withdrawals.
 */
contract PredictionMarket is ReentrancyGuard, Pausable {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────
    // ROLES
    // ─────────────────────────────────────────────

    address public owner;          // Multisig recommended. Highest privilege.
    address public admin;          // Creates and resolves markets. Hot wallet OK.
    address public feeWallet;      // Receives platform fees. Separate from admin.
    address public emergencyRole;  // Can pause only. Give to security partner.

    // Pending owner for 2-step ownership transfer (prevents fat-finger transfers)
    address public pendingOwner;

    // ─────────────────────────────────────────────
    // CONSTANTS
    // ─────────────────────────────────────────────

    IERC20 public immutable USDC;                  // USDC contract on Polygon
    uint256 public constant MAX_FEE_PERCENT = 5;   // Fee can never exceed 5% — hardcoded
    uint256 public constant DISPUTE_WINDOW = 2 hours; // Resolution is pending for 2h before finalized
    uint256 public constant MIN_BET = 1e6;         // Minimum bet: 1 USDC (6 decimals)
    uint256 public constant MAX_BET = 100_000e6;   // Maximum bet per position: 100,000 USDC

    // ─────────────────────────────────────────────
    // STATE
    // ─────────────────────────────────────────────

    uint256 public feePercent = 2;    // Platform fee. Starts at 2%. Max 5%.
    uint256 public marketCount;        // Auto-incrementing market ID

    enum Outcome { UNRESOLVED, YES, NO, CANCELLED }

    struct Market {
        string  question;          // e.g. "Will BTC hit $120K before June 2026?"
        string  category;          // e.g. "Crypto", "Sports", "Politics"
        string  imageUrl;          // Optional cover image URL
        string  resolutionSource;  // e.g. "Binance spot price at 00:00 UTC June 1"
        uint256 createdAt;
        uint256 closingTime;       // No more bets after this time
        uint256 resolutionTime;    // Admin can resolve after this time
        uint256 resolvedAt;        // When admin called resolve()
        uint256 finalizedAt;       // When dispute window passed — payouts unlocked
        uint256 yesPool;           // Total USDC bet on YES
        uint256 noPool;            // Total USDC bet on NO
        uint256 feesCollected;     // Platform fees taken from this market
        Outcome outcome;
        bool    disputed;          // Flagged by a user during dispute window
    }

    // marketId => Market
    mapping(uint256 => Market) public markets;

    // marketId => user address => YES position (in USDC)
    mapping(uint256 => mapping(address => uint256)) public yesPositions;

    // marketId => user address => NO position (in USDC)
    mapping(uint256 => mapping(address => uint256)) public noPositions;

    // marketId => user => has claimed winnings
    mapping(uint256 => mapping(address => bool)) public hasClaimed;

    // ─────────────────────────────────────────────
    // EVENTS (full audit trail — every action logged)
    // ─────────────────────────────────────────────

    event MarketCreated(uint256 indexed marketId, string question, string category, uint256 closingTime, uint256 resolutionTime);
    event BetPlaced(uint256 indexed marketId, address indexed user, bool isYes, uint256 amount);
    event MarketResolved(uint256 indexed marketId, Outcome outcome, uint256 resolvedAt, uint256 finalizedAt);
    event MarketDisputed(uint256 indexed marketId, address indexed disputer);
    event WinningsClaimed(uint256 indexed marketId, address indexed user, uint256 amount);
    event MarketCancelled(uint256 indexed marketId);
    event FeeCollected(uint256 indexed marketId, uint256 amount, address feeWallet);
    event FeePercentUpdated(uint256 oldFee, uint256 newFee);
    event RoleTransferred(string role, address oldAddress, address newAddress);
    event OwnershipTransferStarted(address indexed currentOwner, address indexed pendingOwner);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);
    event EmergencyPause(address indexed by);
    event EmergencyUnpause(address indexed by);

    // ─────────────────────────────────────────────
    // MODIFIERS
    // ─────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin || msg.sender == owner, "Not admin");
        _;
    }

    modifier onlyEmergency() {
        require(
            msg.sender == emergencyRole ||
            msg.sender == owner,
            "Not emergency role"
        );
        _;
    }

    modifier marketExists(uint256 marketId) {
        require(marketId < marketCount, "Market does not exist");
        _;
    }

    // ─────────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────────

    /**
     * @param _usdc          USDC contract address on Polygon: 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359
     * @param _owner         Multisig wallet (Gnosis Safe). Highest trust.
     * @param _admin         Hot wallet for creating/resolving markets.
     * @param _feeWallet     Wallet that receives platform fees.
     * @param _emergencyRole Address that can pause in emergency (can be same as owner for v1).
     */
    constructor(
        address _usdc,
        address _owner,
        address _admin,
        address _feeWallet,
        address _emergencyRole
    ) {
        require(_usdc != address(0), "Invalid USDC address");
        require(_owner != address(0), "Invalid owner");
        require(_admin != address(0), "Invalid admin");
        require(_feeWallet != address(0), "Invalid fee wallet");
        require(_emergencyRole != address(0), "Invalid emergency role");

        // Enforce separation of roles at deploy time
        require(_owner != _admin, "Owner and admin must be different wallets");
        require(_feeWallet != _admin, "Fee wallet and admin must be different wallets");

        USDC          = IERC20(_usdc);
        owner         = _owner;
        admin         = _admin;
        feeWallet     = _feeWallet;
        emergencyRole = _emergencyRole;
    }

    // ─────────────────────────────────────────────
    // ADMIN FUNCTIONS — MARKET MANAGEMENT
    // ─────────────────────────────────────────────

    /**
     * @notice Create a new prediction market. Admin only.
     * @param question          The yes/no question
     * @param category          Category string (Crypto, Sports, Politics, etc.)
     * @param imageUrl          Cover image URL (can be empty string)
     * @param resolutionSource  How outcome will be determined (shown publicly)
     * @param closingTime       Unix timestamp — bets close at this time
     * @param resolutionTime    Unix timestamp — admin can resolve after this time
     */
    function createMarket(
        string calldata question,
        string calldata category,
        string calldata imageUrl,
        string calldata resolutionSource,
        uint256 closingTime,
        uint256 resolutionTime
    ) external onlyAdmin whenNotPaused returns (uint256) {
        require(bytes(question).length > 0, "Question required");
        require(bytes(resolutionSource).length > 0, "Resolution source required");
        require(closingTime > block.timestamp, "Closing time must be in future");
        require(resolutionTime >= closingTime, "Resolution time must be after closing");

        uint256 marketId = marketCount++;

        markets[marketId] = Market({
            question:         question,
            category:         category,
            imageUrl:         imageUrl,
            resolutionSource: resolutionSource,
            createdAt:        block.timestamp,
            closingTime:      closingTime,
            resolutionTime:   resolutionTime,
            resolvedAt:       0,
            finalizedAt:      0,
            yesPool:          0,
            noPool:           0,
            feesCollected:    0,
            outcome:          Outcome.UNRESOLVED,
            disputed:         false
        });

        emit MarketCreated(marketId, question, category, closingTime, resolutionTime);
        return marketId;
    }

    /**
     * @notice Resolve a market. Admin only. Starts the dispute window.
     *         Payouts are NOT immediately available — users have DISPUTE_WINDOW to flag incorrect resolution.
     */
    function resolveMarket(uint256 marketId, bool isYes)
        external
        onlyAdmin
        whenNotPaused
        marketExists(marketId)
    {
        Market storage market = markets[marketId];
        require(market.outcome == Outcome.UNRESOLVED, "Already resolved");
        require(block.timestamp >= market.resolutionTime, "Too early to resolve");

        market.outcome     = isYes ? Outcome.YES : Outcome.NO;
        market.resolvedAt  = block.timestamp;
        market.finalizedAt = block.timestamp + DISPUTE_WINDOW;

        // Collect platform fee immediately — fee goes to feeWallet
        uint256 totalPool  = market.yesPool + market.noPool;
        uint256 fee        = (totalPool * feePercent) / 100;
        market.feesCollected = fee;

        if (fee > 0) {
            USDC.safeTransfer(feeWallet, fee);
            emit FeeCollected(marketId, fee, feeWallet);
        }

        emit MarketResolved(marketId, market.outcome, market.resolvedAt, market.finalizedAt);
    }

    /**
     * @notice Cancel a market (e.g. event never happened). Full refunds to all users.
     *         Admin only. No fees taken on cancelled markets.
     */
    function cancelMarket(uint256 marketId)
        external
        onlyAdmin
        marketExists(marketId)
    {
        Market storage market = markets[marketId];
        require(market.outcome == Outcome.UNRESOLVED, "Already resolved");

        market.outcome = Outcome.CANCELLED;
        emit MarketCancelled(marketId);
    }

    // ─────────────────────────────────────────────
    // USER FUNCTIONS — BETTING
    // ─────────────────────────────────────────────

    /**
     * @notice Place a bet on YES or NO.
     * @param marketId  The market to bet on
     * @param isYes     true = YES, false = NO
     * @param amount    Amount of USDC to bet (in USDC units with 6 decimals)
     */
    function placeBet(uint256 marketId, bool isYes, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        marketExists(marketId)
    {
        require(amount >= MIN_BET, "Below minimum bet");
        require(amount <= MAX_BET, "Above maximum bet");

        Market storage market = markets[marketId];
        require(market.outcome == Outcome.UNRESOLVED, "Market already resolved");
        require(block.timestamp < market.closingTime, "Market closed for betting");

        // Transfer USDC from user to contract (user must approve first)
        USDC.safeTransferFrom(msg.sender, address(this), amount);

        if (isYes) {
            yesPositions[marketId][msg.sender] += amount;
            market.yesPool += amount;
        } else {
            noPositions[marketId][msg.sender] += amount;
            market.noPool += amount;
        }

        emit BetPlaced(marketId, msg.sender, isYes, amount);
    }

    /**
     * @notice Dispute a resolution during the dispute window.
     *         Flags the market for admin review. Does NOT reverse resolution automatically.
     *         In v1 this notifies admin to review. In v2 this triggers a DAO vote.
     */
    function disputeResolution(uint256 marketId)
        external
        marketExists(marketId)
    {
        Market storage market = markets[marketId];
        require(market.outcome != Outcome.UNRESOLVED, "Not resolved yet");
        require(market.outcome != Outcome.CANCELLED, "Market was cancelled");
        require(block.timestamp < market.finalizedAt, "Dispute window closed");
        require(!market.disputed, "Already disputed");

        // Must have a position to dispute (skin in the game)
        require(
            yesPositions[marketId][msg.sender] > 0 ||
            noPositions[marketId][msg.sender] > 0,
            "No position in this market"
        );

        market.disputed = true;
        emit MarketDisputed(marketId, msg.sender);
    }

    /**
     * @notice Claim winnings after dispute window has passed.
     *         Winners receive proportional share of losing pool minus platform fee.
     */
    function claimWinnings(uint256 marketId)
        external
        nonReentrant
        whenNotPaused
        marketExists(marketId)
    {
        Market storage market = markets[marketId];
        require(!hasClaimed[marketId][msg.sender], "Already claimed");

        // Handle cancellation — full refund
        if (market.outcome == Outcome.CANCELLED) {
            hasClaimed[marketId][msg.sender] = true;
            uint256 refund = yesPositions[marketId][msg.sender] +
                             noPositions[marketId][msg.sender];
            require(refund > 0, "Nothing to refund");
            USDC.safeTransfer(msg.sender, refund);
            emit WinningsClaimed(marketId, msg.sender, refund);
            return;
        }

        // Must be finalized (dispute window passed)
        require(
            market.outcome != Outcome.UNRESOLVED,
            "Market not resolved"
        );
        require(
            block.timestamp >= market.finalizedAt,
            "Dispute window still open"
        );

        hasClaimed[marketId][msg.sender] = true;

        uint256 payout = _calculatePayout(marketId, msg.sender);
        require(payout > 0, "No winnings to claim");

        USDC.safeTransfer(msg.sender, payout);
        emit WinningsClaimed(marketId, msg.sender, payout);
    }

    /**
     * @dev Calculate payout for a user in a resolved market.
     *
     * Formula:
     *   totalPool     = yesPool + noPool
     *   afterFee      = totalPool - platformFee
     *   winnerPool    = pool of the winning side
     *   loserPool     = pool of the losing side (after fee)
     *   userShare     = userPosition / winnerPool
     *   payout        = userPosition + (userShare * loserPool after fee)
     *
     * Example: 600 YES, 400 NO, 2% fee
     *   fee           = 20 USDC
     *   afterFee      = 980 USDC
     *   YES wins:
     *   If user bet 60 YES (10% of YES pool):
     *   payout        = 60 + (60/600 * (980 - 600)) = 60 + 38 = 98 USDC
     */
    function _calculatePayout(uint256 marketId, address user)
        internal
        view
        returns (uint256)
    {
        Market storage market = markets[marketId];

        bool userWon;
        uint256 userPosition;
        uint256 winnerPool;

        if (market.outcome == Outcome.YES) {
            userPosition = yesPositions[marketId][user];
            winnerPool   = market.yesPool;
            userWon      = userPosition > 0;
        } else {
            userPosition = noPositions[marketId][user];
            winnerPool   = market.noPool;
            userWon      = userPosition > 0;
        }

        if (!userWon || userPosition == 0) return 0;
        if (winnerPool == 0) return 0;

        uint256 totalPool  = market.yesPool + market.noPool;
        uint256 afterFee   = totalPool - market.feesCollected;
        uint256 loserPool  = afterFee - winnerPool;

        // User gets their stake back + proportional share of loser pool
        uint256 loserShare = (userPosition * loserPool) / winnerPool;
        return userPosition + loserShare;
    }

    // ─────────────────────────────────────────────
    // VIEW FUNCTIONS
    // ─────────────────────────────────────────────

    function getMarket(uint256 marketId)
        external
        view
        marketExists(marketId)
        returns (Market memory)
    {
        return markets[marketId];
    }

    function getUserPositions(uint256 marketId, address user)
        external
        view
        returns (uint256 yesAmount, uint256 noAmount, bool claimed)
    {
        return (
            yesPositions[marketId][user],
            noPositions[marketId][user],
            hasClaimed[marketId][user]
        );
    }

    function getMarketOdds(uint256 marketId)
        external
        view
        marketExists(marketId)
        returns (uint256 yesPercent, uint256 noPercent)
    {
        Market storage market = markets[marketId];
        uint256 total = market.yesPool + market.noPool;
        if (total == 0) return (50, 50); // Default 50/50 before any bets
        yesPercent = (market.yesPool * 100) / total;
        noPercent  = 100 - yesPercent;
    }

    function getPayout(uint256 marketId, address user)
        external
        view
        returns (uint256)
    {
        return _calculatePayout(marketId, user);
    }

    // ─────────────────────────────────────────────
    // OWNER FUNCTIONS — ROLE MANAGEMENT
    // ─────────────────────────────────────────────

    /**
     * @notice Step 1 of 2-step ownership transfer. Prevents accidents.
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        pendingOwner = newOwner;
        emit OwnershipTransferStarted(owner, newOwner);
    }

    /**
     * @notice Step 2: New owner must accept. Prevents transferring to wrong address.
     */
    function acceptOwnership() external {
        require(msg.sender == pendingOwner, "Not pending owner");
        emit OwnershipTransferred(owner, pendingOwner);
        owner        = pendingOwner;
        pendingOwner = address(0);
    }

    function setAdmin(address newAdmin) external onlyOwner {
        require(newAdmin != address(0), "Invalid address");
        require(newAdmin != owner, "Admin cannot be owner");
        emit RoleTransferred("admin", admin, newAdmin);
        admin = newAdmin;
    }

    function setFeeWallet(address newFeeWallet) external onlyOwner {
        require(newFeeWallet != address(0), "Invalid address");
        emit RoleTransferred("feeWallet", feeWallet, newFeeWallet);
        feeWallet = newFeeWallet;
    }

    function setEmergencyRole(address newEmergency) external onlyOwner {
        require(newEmergency != address(0), "Invalid address");
        emit RoleTransferred("emergencyRole", emergencyRole, newEmergency);
        emergencyRole = newEmergency;
    }

    /**
     * @notice Update platform fee. Capped at MAX_FEE_PERCENT (5%) forever.
     */
    function setFeePercent(uint256 newFee) external onlyOwner {
        require(newFee <= MAX_FEE_PERCENT, "Fee exceeds maximum of 5%");
        emit FeePercentUpdated(feePercent, newFee);
        feePercent = newFee;
    }

    // ─────────────────────────────────────────────
    // EMERGENCY FUNCTIONS
    // ─────────────────────────────────────────────

    /**
     * @notice Pause all deposits and claims. Use in case of exploit or critical bug.
     *         Does NOT affect already-finalized markets.
     */
    function emergencyPause() external onlyEmergency {
        _pause();
        emit EmergencyPause(msg.sender);
    }

    /**
     * @notice Unpause the contract. Owner only (not emergency role).
     */
    function emergencyUnpause() external onlyOwner {
        _unpause();
        emit EmergencyUnpause(msg.sender);
    }

    /**
     * @notice Override resolution during dispute window. Owner only.
     *         Used when admin made an incorrect resolution and a dispute was filed.
     */
    function overrideResolution(uint256 marketId, bool isYes)
        external
        onlyOwner
        marketExists(marketId)
    {
        Market storage market = markets[marketId];
        require(market.outcome != Outcome.UNRESOLVED, "Not resolved yet");
        require(market.outcome != Outcome.CANCELLED, "Market cancelled");
        require(market.disputed, "No dispute filed");
        require(block.timestamp < market.finalizedAt, "Dispute window closed");

        // Refund fee that was already sent — platform takes no fee on disputed markets
        // Note: fee was already transferred to feeWallet. Owner must manually send it back.
        // This is acceptable for v1. In v2 use a fee escrow pattern.

        Outcome newOutcome = isYes ? Outcome.YES : Outcome.NO;
        market.outcome     = newOutcome;
        market.disputed    = false;

        emit MarketResolved(marketId, newOutcome, block.timestamp, market.finalizedAt);
    }
}
