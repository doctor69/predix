import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { PredictionMarket, MockERC20 } from "../typechain-types";

// ── Helpers ────────────────────────────────────────────────────────────────────

const USDC_DECIMALS  = 6;
const DISPUTE_WINDOW = 2 * 60 * 60; // 2 hours in seconds

function toUSDC(amount: number | string): bigint {
  return ethers.parseUnits(amount.toString(), USDC_DECIMALS);
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("PredictionMarket", function () {
  let pm:          PredictionMarket;
  let usdc:        MockERC20;
  let owner:       SignerWithAddress;
  let admin:       SignerWithAddress;
  let feeWallet:   SignerWithAddress;
  let user1:       SignerWithAddress;
  let user2:       SignerWithAddress;
  let user3:       SignerWithAddress;
  let attacker:    SignerWithAddress;

  // Deploy fresh contracts before each test
  beforeEach(async function () {
    [owner, admin, feeWallet, user1, user2, user3, attacker] =
      await ethers.getSigners();

    // Deploy mock USDC
    const MockERC20Factory = await ethers.getContractFactory("MockERC20");
    usdc = (await MockERC20Factory.deploy("USD Coin", "USDC", USDC_DECIMALS)) as MockERC20;

    // Mint USDC to users
    for (const u of [user1, user2, user3, attacker]) {
      await usdc.mint(u.address, toUSDC(200_000));
    }

    // Deploy PredictionMarket: constructor(admin, feeWallet, usdc)
    const PM = await ethers.getContractFactory("PredictionMarket");
    pm = (await PM.deploy(
      admin.address,
      feeWallet.address,
      await usdc.getAddress(),
    )) as PredictionMarket;

    // Approve contract for each user
    for (const u of [user1, user2, user3, attacker]) {
      await usdc.connect(u).approve(await pm.getAddress(), ethers.MaxUint256);
    }
  });

  // ── Utility: create a fresh market ──────────────────────────────────────────
  async function createMarket(
    closeOffsetSec  = 3_600,
    resolveOffsetSec = 7_200,
  ): Promise<number> {
    const now = await time.latest();
    const tx  = await pm.connect(admin).createMarket(
      "Will BTC hit $120K?",
      "Crypto",
      "https://example.com/btc.png",
      "Binance spot price",
      now + closeOffsetSec,
      now + resolveOffsetSec,
    );
    const receipt = await tx.wait();
    // marketCount was incremented; the new marketId is marketCount - 1
    const count = await pm.marketCount();
    return Number(count) - 1;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 1. DEPLOYMENT
  // ────────────────────────────────────────────────────────────────────────────
  describe("Deployment", function () {
    it("sets owner to deployer", async function () {
      expect(await pm.owner()).to.equal(owner.address);
    });

    it("sets admin correctly", async function () {
      expect(await pm.admin()).to.equal(admin.address);
    });

    it("sets feeWallet correctly", async function () {
      expect(await pm.feeWallet()).to.equal(feeWallet.address);
    });

    it("sets feePercent to 200 bps", async function () {
      expect(await pm.feePercent()).to.equal(200n);
    });

    it("initialises marketCount to 0", async function () {
      expect(await pm.marketCount()).to.equal(0n);
    });

    it("initialises paused to false", async function () {
      expect(await pm.paused()).to.equal(false);
    });

    it("reverts if admin is zero address", async function () {
      const PM = await ethers.getContractFactory("PredictionMarket");
      await expect(
        PM.deploy(ethers.ZeroAddress, feeWallet.address, await usdc.getAddress()),
      ).to.be.revertedWith("Invalid admin");
    });

    it("reverts if feeWallet is zero address", async function () {
      const PM = await ethers.getContractFactory("PredictionMarket");
      await expect(
        PM.deploy(admin.address, ethers.ZeroAddress, await usdc.getAddress()),
      ).to.be.revertedWith("Invalid feeWallet");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 2. CREATE MARKET
  // ────────────────────────────────────────────────────────────────────────────
  describe("createMarket", function () {
    it("admin can create a market", async function () {
      const now = await time.latest();
      await expect(
        pm.connect(admin).createMarket(
          "Will ETH flip BTC?",
          "Crypto",
          "",
          "CoinGecko",
          now + 3_600,
          now + 7_200,
        ),
      )
        .to.emit(pm, "MarketCreated")
        .withArgs(0n, "Will ETH flip BTC?", "Crypto", now + 3_600, now + 7_200);

      expect(await pm.marketCount()).to.equal(1n);
    });

    it("owner can also create a market (onlyAdmin includes owner)", async function () {
      const now = await time.latest();
      await expect(
        pm.connect(owner).createMarket("Q", "C", "", "S", now + 3_600, now + 7_200),
      ).to.emit(pm, "MarketCreated");
    });

    it("non-admin cannot create a market", async function () {
      const now = await time.latest();
      await expect(
        pm.connect(user1).createMarket("Q", "C", "", "S", now + 3_600, now + 7_200),
      ).to.be.revertedWith("Not admin");
    });

    it("reverts if question is empty", async function () {
      const now = await time.latest();
      await expect(
        pm.connect(admin).createMarket("", "C", "", "S", now + 3_600, now + 7_200),
      ).to.be.revertedWith("Question required");
    });

    it("reverts if closingTime is not in the future", async function () {
      const now = await time.latest();
      await expect(
        pm.connect(admin).createMarket("Q", "C", "", "S", now - 1, now + 7_200),
      ).to.be.revertedWith("Closing time must be in future");
    });

    it("reverts if resolutionTime is before closingTime", async function () {
      const now = await time.latest();
      await expect(
        pm.connect(admin).createMarket("Q", "C", "", "S", now + 7_200, now + 3_600),
      ).to.be.revertedWith("Resolution time must be >= closing time");
    });

    it("increments marketCount on each creation", async function () {
      await createMarket();
      await createMarket();
      expect(await pm.marketCount()).to.equal(2n);
    });

    it("stores correct market data", async function () {
      const now = await time.latest();
      await pm.connect(admin).createMarket(
        "Will SOL hit $1000?",
        "Crypto",
        "https://img.example.com",
        "Binance",
        now + 3_600,
        now + 7_200,
      );
      const m = await pm.getMarket(0n);
      expect(m.question).to.equal("Will SOL hit $1000?");
      expect(m.category).to.equal("Crypto");
      expect(m.imageUrl).to.equal("https://img.example.com");
      expect(m.resolutionSource).to.equal("Binance");
      expect(m.outcome).to.equal(0); // UNRESOLVED
      expect(m.disputed).to.equal(false);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 3. PLACE BET
  // ────────────────────────────────────────────────────────────────────────────
  describe("placeBet", function () {
    let marketId: number;

    beforeEach(async function () {
      marketId = await createMarket();
    });

    it("user can bet YES", async function () {
      await expect(pm.connect(user1).placeBet(marketId, true, toUSDC(100)))
        .to.emit(pm, "BetPlaced")
        .withArgs(marketId, user1.address, true, toUSDC(100));

      const [yes] = await pm.getUserPositions(marketId, user1.address);
      expect(yes).to.equal(toUSDC(100));
    });

    it("user can bet NO", async function () {
      await pm.connect(user2).placeBet(marketId, false, toUSDC(50));
      const [, no] = await pm.getUserPositions(marketId, user2.address);
      expect(no).to.equal(toUSDC(50));
    });

    it("USDC is transferred to the contract", async function () {
      const pmAddress = await pm.getAddress();
      await pm.connect(user1).placeBet(marketId, true, toUSDC(100));
      expect(await usdc.balanceOf(pmAddress)).to.equal(toUSDC(100));
    });

    it("admin cannot place a bet", async function () {
      await expect(
        pm.connect(admin).placeBet(marketId, true, toUSDC(100)),
      ).to.be.revertedWith("Admin/owner cannot bet");
    });

    it("owner cannot place a bet", async function () {
      await expect(
        pm.connect(owner).placeBet(marketId, true, toUSDC(100)),
      ).to.be.revertedWith("Admin/owner cannot bet");
    });

    it("reverts below minimum bet (1 USDC)", async function () {
      await expect(
        pm.connect(user1).placeBet(marketId, true, toUSDC("0.5")),
      ).to.be.revertedWith("Below minimum bet (1 USDC)");
    });

    it("reverts above maximum bet (100,000 USDC)", async function () {
      await usdc.mint(user1.address, toUSDC(200_000));
      await expect(
        pm.connect(user1).placeBet(marketId, true, toUSDC(100_001)),
      ).to.be.revertedWith("Above maximum bet (100,000 USDC)");
    });

    it("reverts when market is already resolved", async function () {
      const now = await time.latest();
      await time.increaseTo(now + 7_201);
      await pm.connect(admin).resolveMarket(marketId, true);
      await expect(
        pm.connect(user1).placeBet(marketId, true, toUSDC(100)),
      ).to.be.revertedWith("Market already resolved");
    });

    it("reverts after market closes for betting", async function () {
      const now = await time.latest();
      await time.increaseTo(now + 3_601);
      await expect(
        pm.connect(user1).placeBet(marketId, true, toUSDC(100)),
      ).to.be.revertedWith("Market closed for betting");
    });

    it("reverts when contract is paused", async function () {
      await pm.connect(owner).emergencyPause();
      await expect(
        pm.connect(user1).placeBet(marketId, true, toUSDC(100)),
      ).to.be.revertedWith("Contract is paused");
    });

    it("updates yesPool and noPool", async function () {
      await pm.connect(user1).placeBet(marketId, true,  toUSDC(600));
      await pm.connect(user2).placeBet(marketId, false, toUSDC(400));
      const m = await pm.getMarket(marketId);
      expect(m.yesPool).to.equal(toUSDC(600));
      expect(m.noPool).to.equal(toUSDC(400));
    });

    it("default odds are 50/50 before any bets", async function () {
      const [yPct, nPct] = await pm.getMarketOdds(marketId);
      expect(yPct).to.equal(50n);
      expect(nPct).to.equal(50n);
    });

    it("odds update correctly to 60/40", async function () {
      await pm.connect(user1).placeBet(marketId, true,  toUSDC(600));
      await pm.connect(user2).placeBet(marketId, false, toUSDC(400));
      const [yPct, nPct] = await pm.getMarketOdds(marketId);
      expect(yPct).to.equal(60n);
      expect(nPct).to.equal(40n);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 4. RESOLVE MARKET + FEE
  // ────────────────────────────────────────────────────────────────────────────
  describe("resolveMarket", function () {
    let marketId: number;

    beforeEach(async function () {
      marketId = await createMarket();
      await pm.connect(user1).placeBet(marketId, true,  toUSDC(600));
      await pm.connect(user2).placeBet(marketId, false, toUSDC(400));
      // Advance past resolution time
      const now = await time.latest();
      await time.increaseTo(now + 7_201);
    });

    it("admin can resolve YES", async function () {
      await expect(pm.connect(admin).resolveMarket(marketId, true))
        .to.emit(pm, "MarketResolved");
      const m = await pm.getMarket(marketId);
      expect(m.outcome).to.equal(1); // YES
    });

    it("admin can resolve NO", async function () {
      await pm.connect(admin).resolveMarket(marketId, false);
      const m = await pm.getMarket(marketId);
      expect(m.outcome).to.equal(2); // NO
    });

    it("sets resolvedAt and finalizedAt", async function () {
      const tx = await pm.connect(admin).resolveMarket(marketId, true);
      const block = await ethers.provider.getBlock(tx.blockNumber!);
      const m = await pm.getMarket(marketId);
      expect(m.resolvedAt).to.equal(BigInt(block!.timestamp));
      expect(m.finalizedAt).to.equal(BigInt(block!.timestamp) + BigInt(DISPUTE_WINDOW));
    });

    it("sends 2% fee from losing pool to feeWallet (YES wins → fee on NO pool)", async function () {
      const before = await usdc.balanceOf(feeWallet.address);
      await pm.connect(admin).resolveMarket(marketId, true);
      const after = await usdc.balanceOf(feeWallet.address);
      // 2% of 400 USDC = 8 USDC
      expect(after - before).to.equal(toUSDC(8));
    });

    it("emits FeeCollected event", async function () {
      await expect(pm.connect(admin).resolveMarket(marketId, true))
        .to.emit(pm, "FeeCollected")
        .withArgs(marketId, toUSDC(8), feeWallet.address);
    });

    it("non-admin cannot resolve", async function () {
      await expect(pm.connect(attacker).resolveMarket(marketId, true))
        .to.be.revertedWith("Not admin");
    });

    it("reverts before resolutionTime", async function () {
      const mid2 = await createMarket(3_600, 14_400);
      await expect(pm.connect(admin).resolveMarket(mid2, true))
        .to.be.revertedWith("Too early to resolve");
    });

    it("reverts if market already resolved", async function () {
      await pm.connect(admin).resolveMarket(marketId, true);
      await expect(pm.connect(admin).resolveMarket(marketId, false))
        .to.be.revertedWith("Already resolved");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 5. CLAIM WINNINGS
  // ────────────────────────────────────────────────────────────────────────────
  describe("claimWinnings", function () {
    let marketId: number;

    beforeEach(async function () {
      marketId = await createMarket();
      await pm.connect(user1).placeBet(marketId, true,  toUSDC(600));
      await pm.connect(user2).placeBet(marketId, false, toUSDC(400));
      const now = await time.latest();
      await time.increaseTo(now + 7_201);
      await pm.connect(admin).resolveMarket(marketId, true); // YES wins
    });

    it("winner claims correct proportional payout", async function () {
      await time.increase(DISPUTE_WINDOW + 1);
      const before = await usdc.balanceOf(user1.address);
      await pm.connect(user1).claimWinnings(marketId);
      const after = await usdc.balanceOf(user1.address);
      // user1 bet 600 YES (100% of 600 YES pool)
      // loserPool = 400, fee = 8, loserAfterFee = 392
      // payout = 600 + (600/600)*392 = 992 USDC
      expect(after - before).to.equal(toUSDC(992));
    });

    it("loser gets nothing (no winnings)", async function () {
      await time.increase(DISPUTE_WINDOW + 1);
      await expect(pm.connect(user2).claimWinnings(marketId))
        .to.be.revertedWith("No winnings to claim");
    });

    it("cannot claim before dispute window closes", async function () {
      await expect(pm.connect(user1).claimWinnings(marketId))
        .to.be.revertedWith("Dispute window still open");
    });

    it("cannot claim twice", async function () {
      await time.increase(DISPUTE_WINDOW + 1);
      await pm.connect(user1).claimWinnings(marketId);
      await expect(pm.connect(user1).claimWinnings(marketId))
        .to.be.revertedWith("Already claimed");
    });

    it("emits WinningsClaimed event", async function () {
      await time.increase(DISPUTE_WINDOW + 1);
      await expect(pm.connect(user1).claimWinnings(marketId))
        .to.emit(pm, "WinningsClaimed")
        .withArgs(marketId, user1.address, toUSDC(992));
    });

    it("split YES pool pays proportionally", async function () {
      // Fresh market with two YES bettors of equal size
      const mid2 = await createMarket();
      await pm.connect(user1).placeBet(mid2, true,  toUSDC(300));
      await pm.connect(user3).placeBet(mid2, true,  toUSDC(300));
      await pm.connect(user2).placeBet(mid2, false, toUSDC(400));
      const now = await time.latest();
      await time.increaseTo(now + 7_201);
      await pm.connect(admin).resolveMarket(mid2, true);
      await time.increase(DISPUTE_WINDOW + 1);

      const b1 = await usdc.balanceOf(user1.address);
      await pm.connect(user1).claimWinnings(mid2);
      const a1 = await usdc.balanceOf(user1.address);

      const b3 = await usdc.balanceOf(user3.address);
      await pm.connect(user3).claimWinnings(mid2);
      const a3 = await usdc.balanceOf(user3.address);

      expect(a1 - b1).to.equal(a3 - b3);
    });

    it("getPayout returns expected amount before claim", async function () {
      await time.increase(DISPUTE_WINDOW + 1);
      const payout = await pm.getPayout(marketId, user1.address);
      expect(payout).to.equal(toUSDC(992));
    });

    it("reverts claiming on unresolved market", async function () {
      const mid2 = await createMarket();
      await expect(pm.connect(user1).claimWinnings(mid2))
        .to.be.revertedWith("Market not resolved");
    });

    it("reverts when contract is paused", async function () {
      await time.increase(DISPUTE_WINDOW + 1);
      await pm.connect(owner).emergencyPause();
      await expect(pm.connect(user1).claimWinnings(marketId))
        .to.be.revertedWith("Contract is paused");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 6. CANCEL MARKET (refund)
  // ────────────────────────────────────────────────────────────────────────────
  describe("cancelMarket", function () {
    it("admin can cancel an unresolved market", async function () {
      const marketId = await createMarket();
      await expect(pm.connect(admin).cancelMarket(marketId))
        .to.emit(pm, "MarketCancelled")
        .withArgs(marketId);
      const m = await pm.getMarket(marketId);
      expect(m.outcome).to.equal(3); // CANCELLED
    });

    it("users get full USDC refund on cancelled market", async function () {
      const marketId = await createMarket();
      await pm.connect(user1).placeBet(marketId, true,  toUSDC(100));
      await pm.connect(user2).placeBet(marketId, false, toUSDC(200));
      await pm.connect(admin).cancelMarket(marketId);

      const b1 = await usdc.balanceOf(user1.address);
      await pm.connect(user1).claimWinnings(marketId);
      expect(await usdc.balanceOf(user1.address) - b1).to.equal(toUSDC(100));

      const b2 = await usdc.balanceOf(user2.address);
      await pm.connect(user2).claimWinnings(marketId);
      expect(await usdc.balanceOf(user2.address) - b2).to.equal(toUSDC(200));
    });

    it("no fee is collected on cancelled market", async function () {
      const marketId = await createMarket();
      await pm.connect(user1).placeBet(marketId, true, toUSDC(1_000));
      await pm.connect(admin).cancelMarket(marketId);
      expect(await usdc.balanceOf(feeWallet.address)).to.equal(0n);
    });

    it("cancel refunds both YES and NO positions of the same user", async function () {
      const marketId = await createMarket();
      await pm.connect(user1).placeBet(marketId, true,  toUSDC(100));
      await pm.connect(user1).placeBet(marketId, false, toUSDC(50));
      await pm.connect(admin).cancelMarket(marketId);

      const b = await usdc.balanceOf(user1.address);
      await pm.connect(user1).claimWinnings(marketId);
      expect(await usdc.balanceOf(user1.address) - b).to.equal(toUSDC(150));
    });

    it("non-admin cannot cancel", async function () {
      const marketId = await createMarket();
      await expect(pm.connect(user1).cancelMarket(marketId))
        .to.be.revertedWith("Not admin");
    });

    it("cannot cancel an already-resolved market", async function () {
      const marketId = await createMarket();
      const now = await time.latest();
      await time.increaseTo(now + 7_201);
      await pm.connect(admin).resolveMarket(marketId, true);
      await expect(pm.connect(admin).cancelMarket(marketId))
        .to.be.revertedWith("Already resolved");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 7. DISPUTE RESOLUTION
  // ────────────────────────────────────────────────────────────────────────────
  describe("disputeResolution", function () {
    let marketId: number;

    beforeEach(async function () {
      marketId = await createMarket();
      await pm.connect(user1).placeBet(marketId, true,  toUSDC(600));
      await pm.connect(user2).placeBet(marketId, false, toUSDC(400));
      const now = await time.latest();
      await time.increaseTo(now + 7_201);
      await pm.connect(admin).resolveMarket(marketId, true);
    });

    it("user with position can file a dispute", async function () {
      await expect(pm.connect(user2).disputeResolution(marketId))
        .to.emit(pm, "MarketDisputed")
        .withArgs(marketId, user2.address);
      const m = await pm.getMarket(marketId);
      expect(m.disputed).to.equal(true);
    });

    it("user without position cannot dispute", async function () {
      await expect(pm.connect(user3).disputeResolution(marketId))
        .to.be.revertedWith("No position in this market");
    });

    it("cannot dispute after dispute window closes", async function () {
      await time.increase(DISPUTE_WINDOW + 1);
      await expect(pm.connect(user2).disputeResolution(marketId))
        .to.be.revertedWith("Dispute window closed");
    });

    it("cannot dispute twice", async function () {
      await pm.connect(user2).disputeResolution(marketId);
      await expect(pm.connect(user2).disputeResolution(marketId))
        .to.be.revertedWith("Already disputed");
    });

    it("cannot dispute a cancelled market", async function () {
      const mid2 = await createMarket();
      await pm.connect(admin).cancelMarket(mid2);
      await expect(pm.connect(user1).disputeResolution(mid2))
        .to.be.revertedWith("Market was cancelled");
    });

    it("cannot dispute an unresolved market", async function () {
      const mid2 = await createMarket();
      await expect(pm.connect(user1).disputeResolution(mid2))
        .to.be.revertedWith("Not resolved yet");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 8. OVERRIDE RESOLUTION
  // ────────────────────────────────────────────────────────────────────────────
  describe("overrideResolution", function () {
    let marketId: number;

    beforeEach(async function () {
      marketId = await createMarket();
      await pm.connect(user1).placeBet(marketId, true,  toUSDC(600));
      await pm.connect(user2).placeBet(marketId, false, toUSDC(400));
      const now = await time.latest();
      await time.increaseTo(now + 7_201);
      await pm.connect(admin).resolveMarket(marketId, true); // incorrectly resolved YES
      await pm.connect(user2).disputeResolution(marketId);
    });

    it("owner can override to NO during dispute window", async function () {
      await pm.connect(owner).overrideResolution(marketId, false);
      const m = await pm.getMarket(marketId);
      expect(m.outcome).to.equal(2); // NO
    });

    it("after override, NO winner (user2) can claim", async function () {
      await pm.connect(owner).overrideResolution(marketId, false);
      await time.increase(DISPUTE_WINDOW + 1);
      const before = await usdc.balanceOf(user2.address);
      await pm.connect(user2).claimWinnings(marketId);
      const after = await usdc.balanceOf(user2.address);
      expect(after).to.be.gt(before);
    });

    it("non-owner cannot override", async function () {
      await expect(pm.connect(admin).overrideResolution(marketId, false))
        .to.be.revertedWith("Not owner");
    });

    it("reverts if no dispute has been filed", async function () {
      const mid2 = await createMarket();
      await pm.connect(user1).placeBet(mid2, true, toUSDC(100));
      const now = await time.latest();
      await time.increaseTo(now + 7_201);
      await pm.connect(admin).resolveMarket(mid2, true);
      await expect(pm.connect(owner).overrideResolution(mid2, false))
        .to.be.revertedWith("No dispute filed");
    });

    it("reverts after dispute window closes", async function () {
      await time.increase(DISPUTE_WINDOW + 1);
      await expect(pm.connect(owner).overrideResolution(marketId, false))
        .to.be.revertedWith("Dispute window closed");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 9. EMERGENCY PAUSE
  // ────────────────────────────────────────────────────────────────────────────
  describe("emergencyPause / emergencyUnpause", function () {
    it("owner can pause", async function () {
      await pm.connect(owner).emergencyPause();
      expect(await pm.paused()).to.equal(true);
    });

    it("owner can unpause", async function () {
      await pm.connect(owner).emergencyPause();
      await pm.connect(owner).emergencyUnpause();
      expect(await pm.paused()).to.equal(false);
    });

    it("non-owner cannot pause", async function () {
      await expect(pm.connect(attacker).emergencyPause())
        .to.be.revertedWith("Not owner");
    });

    it("non-owner cannot unpause", async function () {
      await pm.connect(owner).emergencyPause();
      await expect(pm.connect(attacker).emergencyUnpause())
        .to.be.revertedWith("Not owner");
    });

    it("placeBet reverts when paused", async function () {
      const marketId = await createMarket();
      await pm.connect(owner).emergencyPause();
      await expect(pm.connect(user1).placeBet(marketId, true, toUSDC(100)))
        .to.be.revertedWith("Contract is paused");
    });

    it("claimWinnings reverts when paused", async function () {
      const marketId = await createMarket();
      await pm.connect(user1).placeBet(marketId, true, toUSDC(600));
      await pm.connect(user2).placeBet(marketId, false, toUSDC(400));
      const now = await time.latest();
      await time.increaseTo(now + 7_201);
      await pm.connect(admin).resolveMarket(marketId, true);
      await time.increase(DISPUTE_WINDOW + 1);
      await pm.connect(owner).emergencyPause();
      await expect(pm.connect(user1).claimWinnings(marketId))
        .to.be.revertedWith("Contract is paused");
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // 10. VIEW FUNCTIONS
  // ────────────────────────────────────────────────────────────────────────────
  describe("View functions", function () {
    it("getMarket reverts for non-existent market", async function () {
      await expect(pm.getMarket(99n)).to.be.revertedWith("Market does not exist");
    });

    it("getUserPositions returns zeros for no bets", async function () {
      const marketId = await createMarket();
      const [yes, no, claimed] = await pm.getUserPositions(marketId, user1.address);
      expect(yes).to.equal(0n);
      expect(no).to.equal(0n);
      expect(claimed).to.equal(false);
    });

    it("getPayout returns 0 for non-existent market", async function () {
      expect(await pm.getPayout(999n, user1.address)).to.equal(0n);
    });

    it("getUserPositions.claimed becomes true after claimWinnings", async function () {
      const marketId = await createMarket();
      await pm.connect(user1).placeBet(marketId, true, toUSDC(100));
      const now = await time.latest();
      await time.increaseTo(now + 7_201);
      await pm.connect(admin).resolveMarket(marketId, true);
      await time.increase(DISPUTE_WINDOW + 1);
      await pm.connect(user1).claimWinnings(marketId);
      const [, , claimed] = await pm.getUserPositions(marketId, user1.address);
      expect(claimed).to.equal(true);
    });
  });
});
