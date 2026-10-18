// Matches evmole_etherscan-extension/bridge-origin/chain-explorers.js and
// its chain-rpcs.json entry for Ethereum Sepolia.
const EXPLORERS = {
  1: 'https://etherscan.io/address/',
  56: 'https://bscscan.com/address/',
  8453: 'https://basescan.org/address/',
  143: 'https://monadscan.com/address/',
  43114: 'https://snowscan.xyz/address/',
  42161: 'https://arbiscan.io/address/',
  999: 'https://hyperevmscan.io/address/',
  4663: 'https://robin.etherscan.io/address/',
  11155111: 'https://sepolia.etherscan.io/address/',
  84532: 'https://sepolia.basescan.org/address/',
  57073: 'https://explorer.inkonchain.com/address/',
  196: 'https://www.okx.com/web3/explorer/xlayer/address/',
};

export function getAddressExplorerUrl(chainId, address) {
  const base = EXPLORERS[chainId];
  return base && /^0x[0-9a-f]{40}$/i.test(address || '') ? base + address : '';
}
