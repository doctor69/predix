import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const PRIVATE_KEY = process.env.PRIVATE_KEY ?? "0x" + "a".repeat(64);
const POLYGON_RPC = process.env.POLYGON_RPC ?? "https://polygon-rpc.com";
const AMOY_RPC    = process.env.AMOY_RPC    ?? "https://rpc-amoy.polygon.technology";
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY ?? "";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      chainId: 31337,
    },
    polygonAmoy: {
      url:      AMOY_RPC,
      accounts: [PRIVATE_KEY],
      chainId:  80002,
    },
    polygon: {
      url:      POLYGON_RPC,
      accounts: [PRIVATE_KEY],
      chainId:  137,
    },
  },
  etherscan: {
    apiKey: {
      polygon:     POLYGONSCAN_API_KEY,
      polygonAmoy: POLYGONSCAN_API_KEY,
    },
  },
  paths: {
    sources:   "./src",
    tests:     "./test",
    cache:     "./cache",
    artifacts: "./artifacts",
  },
};

export default config;
