// Security configuration for dApp
export const SECURITY_CONFIG = {
  // Expected chain ID (ApeChain)
  EXPECTED_CHAIN_ID: 33139,
  
  // Contract addresses (real addresses)
  CONTRACTS: {
    GAME_CONTRACT: '0xBb526D657Cc1Ba772469A6EC96AcB2ed9D2A93e5',
    CRAA_TOKEN: '0xBb526D657Cc1Ba772469A6EC96AcB2ed9D2A93e5',
    NFT_CONTRACT: '0xBb526D657Cc1Ba772469A6EC96AcB2ed9D2A93e5',
  },
  
  // RPC endpoints
  RPC_ENDPOINTS: {
    APECHAIN: 'https://rpc.apechain.com',
    ALTERNATIVE: 'https://rpc.apechain.com',
  },
  
  // Security limits
  LIMITS: {
    MAX_APPROVE_AMOUNT: '1000000000000000000000000', // 1M CRAA
    MAX_GAS_LIMIT: 500000,
    MAX_GAS_PRICE: '20000000000', // 20 gwei
  },
  
  // Rate limiting
  RATE_LIMITS: {
    BURN_PER_HOUR: 10,
    APPROVE_PER_HOUR: 5,
    PING_PER_HOUR: 20,
  },
};

// Validation functions
export const validateChainId = (chainId: number): boolean => {
  return chainId === SECURITY_CONFIG.EXPECTED_CHAIN_ID;
};

export const validateContractAddress = (address: string): boolean => {

  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

export const validateAmount = (amount: string): boolean => {
  try {
    const num = parseFloat(amount);
    return !isNaN(num) && num > 0 && num <= parseFloat(SECURITY_CONFIG.LIMITS.MAX_APPROVE_AMOUNT);
  } catch {
    return false;
  }
};

export const validateGasPrice = (gasPrice: string): boolean => {
  try {
    const price = parseFloat(gasPrice);
    const maxPrice = parseFloat(SECURITY_CONFIG.LIMITS.MAX_GAS_PRICE);
    return !isNaN(price) && price > 0 && price <= maxPrice;
  } catch {
    return false;
  }
}; 