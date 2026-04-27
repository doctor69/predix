// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title PredictionMarket (Predix)
 * @notice Zero-custody binary prediction market on Polygon using USDC.
 *
 * Roles:
 *   owner     — Highest privilege. Can override resolutions during dispute window,
 *               pause/unpause the contract. Use a hardware wallet or Gnosis Safe in prod.
 *   admin     — Creates and resolves markets. Hot wallet OK.
 *               Compromise = wrong resolutions only; CANNOT steal funds.
 *   feeWallet — Receives platform fees only. No admin power.
 *
 * Security properties:
 *   - Zero custody: contract holds all USDC, moved only to winners / feeWallet.
 *   - Admin and owner CANNOT place bets (no insider trading).
 *   - 2-hour dispute window before payouts unlock.
 *   - ReentrancyGuard on all state-changing + transfer functions.
 *   - SafeERC20 for all token operations.
 *   - Fee permanently hardcoded at 2% (200 bps). Immutable.
 */
contract PredictionMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─────────────────────────────────────────────────────────
    // ROLES
    // ─────────────────────────────────────────────────────────

    address public owner;
    address public admin;
    address public feeWallet;

    // ─────────────────────────────────────────────────────────
    // CONSTANTS
    // ─────────────────────────────────────────────────────────

    IERC20  public immutable USDC;

    uint256 public constant DISPUTE_WINDOW = 2 hours;
    uint256 public constant MIN_BET        = 1_000_000;         // 1 USDC  (6 decimals)
    uint256 public constant MAX_BET        = 100_000_000_000;   // 100,000 USDC
    uint256 public constant FEE_BPS        = 200;               // 2% permanent, immutable

    // ─────────────────────────────────────────────────────────
    // PAUSABLE STATE
    // ─────────────────────────────────────────────────────────

    bool public paused;

    // ─────────────────────────────────────────────────────────
    // FEE CONFIG
    // ─────────────────────────────────────────────────────────

    /// @notice Fee permanently hardcoded at 2% (200 bps). Cannot be changed.
    uint256 public constant feePercent = FEE_BPS;

    // ─────────────────────────────────────────────────────────
    // MARKETS
    // ─────────────────────────────────────────────────────────

    uint256 public marketCount;

    // Outcome constants
    uint8 public constant OUTCOME_UNRESOLVED = 0;
    uint8 public constant OUTCOME_YES        = 1;
    uint8 public constant OUTCOME_NO         = 2;
    uint8 public constant OUTCOME_CANCELLED  = 3;

    struct Market {
        string  question;
        string  category;
        string  imageUrl;
        string  resolutionSource;
        uint256 createdAt;
        uint256 closingTime;
        uint256 resolutionTime;
        uint256 resolvedAt;
        uint256 finalizedAt;
        uint256 yesPool;
        uint256 noPool;
        uint256 feesCollected;
        uint8   outcome;     // 0=UNRESOLVED, 1=YES, 2=NO, 3=CANCELLED
        bool    disputed;
    }

    mapping(uint256 => Market) private _markets;

    // marketId => user => YES amount
    mapping(uint256 => mapping(address => uint256)) private _yesPositions;
    // marketId => user => NO amount
    mapping(uint256 => mapping(address => uint256)) private _noPositions;
    // marketId => user => claimed
    mapping(uint256 => mapping(address => bool))    private _hasClaimed;

    // ─────────────────────────────────────────────────────────
    // EVENTS
    // ─────────────────────────────────────────────────────────

    event MarketCreated(
        uint256 indexed marketId,
        string  question,
        string  category,
        uint256 closingTime,
        uint256 resolutionTime
    );
    event BetPlaced(
        uint256 indexed marketId,
        address indexed user,
        bool    isYes,
        uint256 amount
    );
    event MarketResolved(
        uint256 indexed marketId,
        uint8   outcome,
        uint256 resolvedAt,
        uint256 finalizedAt
    );
    event MarketDisputed(uint256 indexed marketId, address indexed disputer);
    event WinningsClaimed(uint256 indexed marketId, address indexed user, uint256 amount);
    event MarketCancelled(uint256 indexed marketId);
    event FeeCollected(uint256 indexed marketId, uint256 amount, address feeWallet);

    // ─────────────────────────────────────────────────────────
    // MODIFIERS
    // ─────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin || msg.sender == owner, "Not admin");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Contract is paused");
        _;
    }

    modifier marketExists(uint256 marketId) {
        require(marketId < marketCount, "Market does not exist");
        _;
    }

    // ─────────────────────────────────────────────────────────
    // CONSTRUCTOR
    // ─────────────────────────────────────────────────────────

    /**
     * @param _admin     Hot wallet that creates / resolves markets.
     * @param _feeWallet Address that receives platform fees.
     * @param _usdc      USDC contract address on Polygon.
     *
     * Fee is permanently hardcoded at 2% (200 bps) — not configurable.
     */
    constructor(
        address _admin,
        address _feeWallet,
        address _usdc
    ) {
        require(_admin     != address(0), "Invalid admin");
        require(_feeWallet != address(0), "Invalid feeWallet");
        require(_usdc      != address(0), "Invalid USDC address");

        owner     = msg.sender;
        admin     = _admin;
        feeWallet = _feeWallet;
        USDC      = IERC20(_usdc);
    }

    // ─────────────────────────────────────────────────────────
    // ADMIN — MARKET MANAGEMENT
    // ─────────────────────────────────────────────────────────

    /**
     * @notice Create a new binary prediction market.
     * @return marketId The ID of the newly created market (0-indexed).
     */
    function createMarket(
        string calldata question,
        string calldata category,
        string calldata imageUrl,
        string calldata resolutionSource,
        uint256 closingTime,
        uint256 resolutionTime
    ) external onlyAdmin returns (uint256) {
        require(bytes(question).length > 0,         "Question required");
        require(bytes(resolutionSource).length > 0, "Resolution source required");
        require(closingTime > block.timestamp,       "Closing time must be in future");
        require(resolutionTime >= closingTime,       "Resolution time must be >= closing time");

        uint256 marketId = marketCount++;

        _markets[marketId] = Market({
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
            outcome:          OUTCOME_UNRESOLVED,
            disputed:         false
        });

        emit MarketCreated(marketId, question, category, closingTime, resolutionTime);
        return marketId;
    }

    /**
     * @notice Resolve a market after resolutionTime.
     *         Takes feePercent bps from the LOSING pool and sends to feeWallet.
     *         Starts a 2-hour dispute window before payouts unlock (finalizedAt).
     */
    function resolveMarket(uint256 marketId, bool isYes)
        external
        onlyAdmin
        nonReentrant
        marketExists(marketId)
    {
        Market storage m = _markets[marketId];
        require(m.outcome == OUTCOME_UNRESOLVED,     "Already resolved");
        require(block.timestamp >= m.resolutionTime, "Too early to resolve");

        m.outcome     = isYes ? OUTCOME_YES : OUTCOME_NO;
        m.resolvedAt  = block.timestamp;
        m.finalizedAt = block.timestamp + DISPUTE_WINDOW;

        // Fee taken from the losing pool only
        uint256 losingPool = isYes ? m.noPool : m.yesPool;
        uint256 fee        = (losingPool * feePercent) / 10_000;
        m.feesCollected    = fee;

        if (fee > 0) {
            USDC.safeTransfer(feeWallet, fee);
            emit FeeCollected(marketId, fee, feeWallet);
        }

        emit MarketResolved(marketId, m.outcome, m.resolvedAt, m.finalizedAt);
    }

    /**
     * @notice Cancel a market. All bettors may claim full refunds. No fees taken.
     */
    function cancelMarket(uint256 marketId)
        external
        onlyAdmin
        marketExists(marketId)
    {
        Market storage m = _markets[marketId];
        require(m.outcome == OUTCOME_UNRESOLVED, "Already resolved");

        m.outcome = OUTCOME_CANCELLED;
        emit MarketCancelled(marketId);
    }

    // ─────────────────────────────────────────────────────────
    // OWNER — DISPUTE OVERRIDE + EMERGENCY
    // ─────────────────────────────────────────────────────────

    /**
     * @notice Override an incorrect resolution during the dispute window.
     *         Requires a dispute to have been filed first.
     *         Re-calculates the fee for the new losing pool and trues-up any
     *         difference against the feeWallet.
     */
    function overrideResolution(uint256 marketId, bool isYes)
        external
        onlyOwner
        nonReentrant
        marketExists(marketId)
    {
        Market storage m = _markets[marketId];
        require(m.outcome != OUTCOME_UNRESOLVED, "Not resolved yet");
        require(m.outcome != OUTCOME_CANCELLED,  "Market cancelled");
        require(m.disputed,                      "No dispute filed");
        require(block.timestamp < m.finalizedAt, "Dispute window closed");

        uint8 newOutcome = isYes ? OUTCOME_YES : OUTCOME_NO;

        // Recalculate fee for the new losing pool
        uint256 newLosingPool = isYes ? m.noPool : m.yesPool;
        uint256 newFee        = (newLosingPool * feePercent) / 10_000;
        uint256 oldFee        = m.feesCollected;

        m.outcome  = newOutcome;
        m.disputed = false;

        if (newFee > oldFee) {
            // New losing pool is larger — send the extra to feeWallet
            m.feesCollected = newFee;
            USDC.safeTransfer(feeWallet, newFee - oldFee);
            emit FeeCollected(marketId, newFee - oldFee, feeWallet);
        } else {
            // Keep feesCollected = oldFee so payout math never exceeds contract balance.
            // The surplus (oldFee - newFee) is effectively a bonus distributed to winners.
            m.feesCollected = oldFee;
        }

        emit MarketResolved(marketId, newOutcome, block.timestamp, m.finalizedAt);
    }

    /// @notice Pause placeBet and claimWinnings.
    function emergencyPause() external onlyOwner {
        paused = true;
    }

    /// @notice Unpause the contract.
    function emergencyUnpause() external onlyOwner {
        paused = false;
    }

    // ─────────────────────────────────────────────────────────
    // USER — BETTING
    // ─────────────────────────────────────────────────────────

    /**
     * @notice Place a bet on YES or NO.
     *         Admin and owner are explicitly blocked to prevent insider trading.
     * @param marketId  Market to bet on.
     * @param isYes     true = YES, false = NO.
     * @param amount    USDC amount (6 decimals). Min 1 USDC, max 100,000 USDC.
     */
    function placeBet(uint256 marketId, bool isYes, uint256 amount)
        external
        nonReentrant
        whenNotPaused
        marketExists(marketId)
    {
        require(msg.sender != owner && msg.sender != admin, "Admin/owner cannot bet");
        require(amount >= MIN_BET, "Below minimum bet (1 USDC)");
        require(amount <= MAX_BET, "Above maximum bet (100,000 USDC)");

        Market storage m = _markets[marketId];
        require(m.outcome == OUTCOME_UNRESOLVED,  "Market already resolved");
        require(block.timestamp < m.closingTime,  "Market closed for betting");

        USDC.safeTransferFrom(msg.sender, address(this), amount);

        if (isYes) {
            _yesPositions[marketId][msg.sender] += amount;
            m.yesPool += amount;
        } else {
            _noPositions[marketId][msg.sender] += amount;
            m.noPool += amount;
        }

        emit BetPlaced(marketId, msg.sender, isYes, amount);
    }

    // ─────────────────────────────────────────────────────────
    // USER — DISPUTE
    // ─────────────────────────────────────────────────────────

    /**
     * @notice File a dispute during the 2-hour dispute window.
     *         Caller must have a position in the market (skin in the game).
     */
    function disputeResolution(uint256 marketId) external marketExists(marketId) {
        Market storage m = _markets[marketId];
        require(m.outcome != OUTCOME_UNRESOLVED, "Not resolved yet");
        require(m.outcome != OUTCOME_CANCELLED,  "Market was cancelled");
        require(block.timestamp < m.finalizedAt, "Dispute window closed");
        require(!m.disputed,                     "Already disputed");
        require(
            _yesPositions[marketId][msg.sender] > 0 ||
            _noPositions[marketId][msg.sender]  > 0,
            "No position in this market"
        );

        m.disputed = true;
        emit MarketDisputed(marketId, msg.sender);
    }

    // ─────────────────────────────────────────────────────────
    // USER — CLAIM WINNINGS
    // ─────────────────────────────────────────────────────────

    /**
     * @notice Claim winnings after the dispute window passes.
     *         Full refund (no fee) if the market was CANCELLED.
     */
    function claimWinnings(uint256 marketId)
        external
        nonReentrant
        whenNotPaused
        marketExists(marketId)
    {
        require(!_hasClaimed[marketId][msg.sender], "Already claimed");

        Market storage m = _markets[marketId];

        // CANCELLED — full refund, no dispute window required
        if (m.outcome == OUTCOME_CANCELLED) {
            _hasClaimed[marketId][msg.sender] = true;
            uint256 refund = _yesPositions[marketId][msg.sender] +
                             _noPositions[marketId][msg.sender];
            require(refund > 0, "Nothing to refund");
            USDC.safeTransfer(msg.sender, refund);
            emit WinningsClaimed(marketId, msg.sender, refund);
            return;
        }

        require(m.outcome != OUTCOME_UNRESOLVED,  "Market not resolved");
        require(block.timestamp >= m.finalizedAt, "Dispute window still open");

        _hasClaimed[marketId][msg.sender] = true;

        uint256 payout = _calculatePayout(marketId, msg.sender);
        require(payout > 0, "No winnings to claim");

        USDC.safeTransfer(msg.sender, payout);
        emit WinningsClaimed(marketId, msg.sender, payout);
    }

    // ─────────────────────────────────────────────────────────
    // INTERNAL — PAYOUT MATH
    // ─────────────────────────────────────────────────────────

    /**
     * @dev Proportional payout formula (fee from losing pool):
     *
     *   loserPool     = pool of the losing side
     *   fee           = loserPool * feePercent / 10000  (stored in feesCollected)
     *   loserAfterFee = loserPool - feesCollected
     *   winnerPool    = pool of the winning side
     *
     *   payout = userPosition + (userPosition / winnerPool) * loserAfterFee
     *
     * Example: 600 YES, 400 NO, 2% fee, YES wins
     *   loserPool     = 400
     *   fee           = 400 * 200 / 10000 = 8 USDC
     *   loserAfterFee = 392 USDC
     *   user bet all 600 YES (100% of YES pool):
     *   payout = 600 + (600/600) * 392 = 992 USDC
     */
    function _calculatePayout(uint256 marketId, address user)
        internal
        view
        returns (uint256)
    {
        Market storage m = _markets[marketId];

        uint256 userPosition;
        uint256 winnerPool;

        if (m.outcome == OUTCOME_YES) {
            userPosition = _yesPositions[marketId][user];
            winnerPool   = m.yesPool;
        } else if (m.outcome == OUTCOME_NO) {
            userPosition = _noPositions[marketId][user];
            winnerPool   = m.noPool;
        } else {
            return 0;
        }

        if (userPosition == 0 || winnerPool == 0) return 0;

        uint256 loserPool     = (m.outcome == OUTCOME_YES) ? m.noPool : m.yesPool;
        uint256 loserAfterFee = loserPool - m.feesCollected;

        uint256 loserShare = (userPosition * loserAfterFee) / winnerPool;
        return userPosition + loserShare;
    }

    // ─────────────────────────────────────────────────────────
    // VIEWS
    // ─────────────────────────────────────────────────────────

    /// @notice Returns the full Market struct for a given marketId.
    function getMarket(uint256 marketId)
        external
        view
        marketExists(marketId)
        returns (Market memory)
    {
        return _markets[marketId];
    }

    /// @notice Returns a user's positions and claim status for a market.
    function getUserPositions(uint256 marketId, address user)
        external
        view
        returns (uint256 yesAmount, uint256 noAmount, bool claimed)
    {
        return (
            _yesPositions[marketId][user],
            _noPositions[marketId][user],
            _hasClaimed[marketId][user]
        );
    }

    /**
     * @notice Returns current implied odds as percentages (0-100).
     *         Returns 50/50 when no bets have been placed.
     */
    function getMarketOdds(uint256 marketId)
        external
        view
        marketExists(marketId)
        returns (uint256 yesPercent, uint256 noPercent)
    {
        Market storage m = _markets[marketId];
        uint256 total = m.yesPool + m.noPool;
        if (total == 0) return (50, 50);
        yesPercent = (m.yesPool * 100) / total;
        noPercent  = 100 - yesPercent;
    }

    /// @notice Returns the expected payout for a user on a given market.
    function getPayout(uint256 marketId, address user)
        external
        view
        returns (uint256)
    {
        if (marketId >= marketCount) return 0;
        return _calculatePayout(marketId, user);
    }
}
