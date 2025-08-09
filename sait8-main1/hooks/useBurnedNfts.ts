import { useEffect, useState } from 'react';
import {
  useAccount,
  usePublicClient,
  useWriteContract,
  useWaitForTransactionReceipt,
} from 'wagmi';
import { Abi, parseAbi, decodeEventLog, formatEther, Address } from 'viem';
import { GAME_CONTRACT_ADDRESS } from '../config/wagmi';
import { toast } from 'sonner';
import { useClaimBlocking } from './useClaimBlocking';

// CONFIGURATION AND CORRECT ABI
// Proxy contract address of the game from central wagmi.ts configuration
// (config/wagmi.ts → GAME_CONTRACT_ADDRESS)

// Use parseAbi from viem for better safety and auto-typing
const GameContractABI = parseAbi([
  'event NFTBurned(address indexed player, uint256 indexed tokenId, uint256 amountToClaim, uint256 waitHours)',
  'function burnRecords(uint256 tokenId) view returns (address owner, uint256 totalAmount, uint256 claimAvailableTime, uint256 graveyardReleaseTime, bool claimed, uint8 waitPeriod)',
  'function burnSplits(uint8 waitPeriod) view returns (uint16 playerBps, uint16 poolBps, uint16 burnBps)',
  'function claimBurnRewards(uint256 tokenId)',
  'function nftContract() view returns (address)',
]);

// Typing for data we'll store in state
export interface BurnedNftInfo {
  tokenId: string;
  record: {
    owner: Address;
    totalAmount: bigint;
    claimAvailableTime: bigint;
    graveyardReleaseTime: bigint;
    claimed: boolean;
    waitPeriod: number;
  };
  split: {
    playerBps: number;
    poolBps: number;
    burnBps: number;
  } | null;
  playerShare: bigint;
  isReadyToClaim: boolean;
}

/**
 * Hook for getting user's burned NFTs list and their data.
 * Uses viem getLogs for efficiency.
 */
export const useBurnedNfts = () => {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient();

  const [burnedNfts, setBurnedNfts] = useState<BurnedNftInfo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isConnected || !address || !publicClient) {
      setIsLoading(false);
      setBurnedNfts([]);
      return;
    }

    // [SECURITY/PERFORMANCE FIX] Check for cached data to prevent DoS on RPC fallback
    const cacheKey = `burnedNfts-${address}`;
    const cachedData = localStorage.getItem(cacheKey);

    const abortController = new AbortController();

    const fetchBurnedNfts = async () => {
      setIsLoading(true);
      setError(null);
      try {
        if (cachedData) {
          const { data, timestamp } = JSON.parse(cachedData);
          // Use cache if it's less than 2 minutes old for faster loading
          if (Date.now() - timestamp < 2 * 60 * 1000) {
            // Convert strings back to BigInt
            const deserializedData = data.map((nft: any) => ({
              ...nft,
              record: {
                ...nft.record,
                totalAmount: BigInt(nft.record.totalAmount),
                claimAvailableTime: BigInt(nft.record.claimAvailableTime),
                graveyardReleaseTime: BigInt(nft.record.graveyardReleaseTime),
              },
              playerShare: BigInt(nft.playerShare),
            }));
            setBurnedNfts(deserializedData);
            setIsLoading(false);
            return;
          }
        }
        // current network timestamp, default to local time; will update later
        let chainNow = Math.floor(Date.now() / 1000);

        // Try to get last block time immediately
        try {
          const latestBlock0 = await publicClient.getBlock();
          chainNow = Number(latestBlock0.timestamp);
        } catch (_e) {
          /* ignore – fallback to local time */
        }

        // ------------------------------------------------------------
        // 1) Fast path — Subgraph (instantly returns events)
        // ------------------------------------------------------------
        let tokenIds: string[] = [];
        try {
          const sgQuery = `query($player: Bytes!) { player(id:$player){ burnEvents(first:1000){ tokenId } } }`;

          const sgRes = await fetch('/api/subgraph', {
            signal: abortController.signal,
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              query: sgQuery,
              variables: { player: address.toLowerCase() },
            }),
          });
          if (sgRes.ok) {
            const sgJson = await sgRes.json();
            tokenIds = (sgJson.data?.player?.burnEvents || []).map((ev: any) =>
              ev.tokenId.toString()
            );
          }
        } catch (sgErr) {
          }

        // ------------------------------------------------------------
        // 2) Fast fallback — getLogs with smaller range
        // ------------------------------------------------------------
        if (tokenIds.length === 0) {
          const latestBlock = await publicClient.getBlock();
          chainNow = Number(latestBlock.timestamp);
          // Use smaller range for faster loading
          const FROM_BLOCK = latestBlock.number - 100000n; // Last 100k blocks only

          try {
            const allLogs = await publicClient.getLogs({
              address: GAME_CONTRACT_ADDRESS,
              event: {
                type: 'event',
                name: 'NFTBurned',
                inputs: [
                  { type: 'address', name: 'player', indexed: true },
                  { type: 'uint256', name: 'tokenId', indexed: true },
                  { type: 'uint256', name: 'amountToClaim' },
                  { type: 'uint256', name: 'waitHours' },
                ],
              },
              args: { player: address },
              fromBlock: FROM_BLOCK,
              toBlock: latestBlock.number,
            });

          tokenIds = allLogs.map((log: any) =>
            (
              decodeEventLog({ abi: GameContractABI, ...log }).args as any
            ).tokenId.toString()
          );
          } catch (logErr) {
            tokenIds = [];
          }
        }

        const uniqueIds = [...new Set(tokenIds)].reverse();

        const nftsInfo: BurnedNftInfo[] = [];

        // Cache for split-parameters (by waitPeriod) – to avoid hitting contract multiple times
        const splitCache = new Map<
          number,
          { playerBps: number; poolBps: number; burnBps: number }
        >();

        // Use multicall for faster data fetching
        const supportsMulticall = !!publicClient.chain?.contracts?.multicall3?.address;
        const CHUNK = supportsMulticall ? 32 : 16; // Larger chunks with multicall

        for (let i = 0; i < uniqueIds.length; i += CHUNK) {
          const slice = uniqueIds.slice(i, i + CHUNK);

          if (supportsMulticall) {
            // Fast path with multicall
            const contracts = slice.map(tokenId => ({
              address: GAME_CONTRACT_ADDRESS,
              abi: GameContractABI,
              functionName: 'burnRecords' as const,
              args: [BigInt(tokenId)] as const,
            }));

            try {
              const mcResults = await publicClient.multicall({
                contracts,
                allowFailure: true,
              });

                               const chunkResults = mcResults.map((result, index) => {
                   if (result.status !== 'success' || !result.result) return null;

                   const [
                     owner,
                     totalAmount,
                     claimAvailableTime,
                     graveyardReleaseTime,
                     claimed,
                     waitPeriod,
                   ] = result.result as any;

                   if (owner.toLowerCase() !== address.toLowerCase()) return null;

                   // Get split either from cache or from contract
                   let split = splitCache.get(Number(waitPeriod));
                   if (!split) {
                     // We'll fetch splits separately to avoid complex multicall
                     return { tokenId: slice[index], waitPeriod, needsSplit: true };
                   }

                   const playerShare =
                     (totalAmount * BigInt(split.playerBps)) / 10000n;

                   return {
                     tokenId: slice[index],
                     record: {
                       owner,
                       totalAmount,
                       claimAvailableTime,
                       graveyardReleaseTime,
                       claimed,
                       waitPeriod,
                     },
                     split,
                     playerShare,
                     isReadyToClaim:
                       !claimed && claimAvailableTime <= BigInt(chainNow),
                   };
                 }).filter(Boolean);

              // Fetch missing splits
              const missingSplits = chunkResults
                .filter(r => r && 'needsSplit' in r)
                .map(r => r!.waitPeriod);
              
              if (missingSplits.length > 0) {
                const uniqueWaitPeriods = [...new Set(missingSplits)];
                const splitContracts = uniqueWaitPeriods.map(wp => ({
                  address: GAME_CONTRACT_ADDRESS,
                  abi: GameContractABI,
                  functionName: 'burnSplits' as const,
                  args: [wp] as const,
                }));

                const splitResults = await publicClient.multicall({
                  contracts: splitContracts,
                  allowFailure: true,
                });

                splitResults.forEach((result, index) => {
                  if (result.status === 'success' && result.result) {
                    const [playerBps, poolBps, burnBps] = result.result as [number, number, number];
                    splitCache.set(uniqueWaitPeriods[index], { playerBps, poolBps, burnBps });
                  }
                });

                                 // Now process the results that needed splits
                 chunkResults.forEach((result, index) => {
                   if (result && 'needsSplit' in result) {
                     const split = splitCache.get(result.waitPeriod);
                     if (split && result.tokenId) {
                       const mcResult = mcResults[index];
                       if (mcResult && mcResult.result) {
                         const record = (mcResult.result as any);
                         if (record && record[1]) {
                         const playerShare = (record[1] * BigInt(split.playerBps)) / 10000n;
                       
                         const finalResult: BurnedNftInfo = {
                           tokenId: result.tokenId,
                           record: {
                             owner: record[0],
                             totalAmount: record[1],
                             claimAvailableTime: record[2],
                             graveyardReleaseTime: record[3],
                             claimed: record[4],
                             waitPeriod: record[5],
                           },
                           split,
                           playerShare,
                           isReadyToClaim: !record[4] && record[2] <= BigInt(chainNow),
                         };
                       
                         nftsInfo.push(finalResult);
                       }
                     }
                   }
                   } else if (result && !('needsSplit' in result) && result.tokenId) {
                     nftsInfo.push(result as BurnedNftInfo);
                   }
                 });
                             } else {
                 chunkResults.forEach(r => {
                   if (r && !('needsSplit' in r) && r.tokenId) {
                     nftsInfo.push(r as BurnedNftInfo);
                   }
                 });
               }
            } catch (mcErr) {
              // Fallback to individual calls
          const chunkResults = await Promise.all(
            slice.map(async tokenId => {
              try {
                const recordResult: any = await publicClient.readContract({
                  address: GAME_CONTRACT_ADDRESS,
                  abi: GameContractABI,
                  functionName: 'burnRecords',
                  args: [BigInt(tokenId)],
                });

                const [
                  owner,
                  totalAmount,
                  claimAvailableTime,
                  graveyardReleaseTime,
                  claimed,
                  waitPeriod,
                ] = recordResult;

                if (owner.toLowerCase() !== address.toLowerCase()) return null;

                let split = splitCache.get(Number(waitPeriod));
                if (!split) {
                  const splitResult = (await publicClient.readContract({
                    address: GAME_CONTRACT_ADDRESS,
                    abi: GameContractABI,
                    functionName: 'burnSplits',
                    args: [waitPeriod],
                  })) as [number, number, number];

                  const [playerBps, poolBps, burnBps] = splitResult;
                  split = { playerBps, poolBps, burnBps };
                  splitCache.set(Number(waitPeriod), split);
                }

                const playerShare =
                  (totalAmount * BigInt(split.playerBps)) / 10000n;

                    return {
                  tokenId,
                  record: {
                    owner,
                    totalAmount,
                    claimAvailableTime,
                    graveyardReleaseTime,
                    claimed,
                    waitPeriod,
                  },
                  split,
                  playerShare,
                  isReadyToClaim:
                    !claimed && claimAvailableTime <= BigInt(chainNow),
                };
                  } catch (err) {
                    return null;
                  }
                })
              );

              chunkResults.forEach(r => {
                if (r) nftsInfo.push(r);
              });
            }
          } else {
            // Fallback for networks without multicall
            const chunkResults = await Promise.all(
              slice.map(async tokenId => {
                try {
                  const recordResult: any = await publicClient.readContract({
                    address: GAME_CONTRACT_ADDRESS,
                    abi: GameContractABI,
                    functionName: 'burnRecords',
                    args: [BigInt(tokenId)],
                  });

                  const [
                    owner,
                    totalAmount,
                    claimAvailableTime,
                    graveyardReleaseTime,
                    claimed,
                    waitPeriod,
                  ] = recordResult;

                  if (owner.toLowerCase() !== address.toLowerCase()) return null;

                  let split = splitCache.get(Number(waitPeriod));
                  if (!split) {
                    const splitResult = (await publicClient.readContract({
                      address: GAME_CONTRACT_ADDRESS,
                      abi: GameContractABI,
                      functionName: 'burnSplits',
                      args: [waitPeriod],
                    })) as [number, number, number];

                    const [playerBps, poolBps, burnBps] = splitResult;
                    split = { playerBps, poolBps, burnBps };
                    splitCache.set(Number(waitPeriod), split);
                  }

                  const playerShare =
                    (totalAmount * BigInt(split.playerBps)) / 10000n;

                  return {
                    tokenId,
                    record: {
                      owner,
                      totalAmount,
                      claimAvailableTime,
                      graveyardReleaseTime,
                      claimed,
                      waitPeriod,
                    },
                    split,
                    playerShare,
                    isReadyToClaim:
                      !claimed && claimAvailableTime <= BigInt(chainNow),
                  };
              } catch (err) {
                return null;
              }
            })
          );

          chunkResults.forEach(r => {
            if (r) nftsInfo.push(r);
          });
          }
        }

        nftsInfo.sort(
          (a, b) => (b.isReadyToClaim ? 1 : 0) - (a.isReadyToClaim ? 1 : 0)
        );
        setBurnedNfts(nftsInfo);

        // Cache the new data with a timestamp
        // Convert BigInt to strings for JSON serialization
        const serializableData = nftsInfo.map(nft => ({
          ...nft,
          record: {
            ...nft.record,
            totalAmount: nft.record.totalAmount.toString(),
            claimAvailableTime: nft.record.claimAvailableTime.toString(),
            graveyardReleaseTime: nft.record.graveyardReleaseTime.toString(),
          },
          playerShare: nft.playerShare.toString(),
        }));

        localStorage.setItem(
          cacheKey,
          JSON.stringify({
            data: serializableData,
            timestamp: Date.now(),
          })
        );
      } catch (e) {
        // Don't show error toast for network issues, just set error state
        setError('Failed to load burn history. Please refresh the page.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchBurnedNfts();
    return () => abortController.abort();
  }, [address, isConnected, publicClient]);

  return { burnedNfts, isLoading, error };
};

/**
 * Hook for calling claimBurnRewards function
 */
export const useClaimReward = (tokenId: string, onSuccess?: () => void) => {
  const { address } = useAccount();
  const { blockClaimSection } = useClaimBlocking();
  const {
    writeContractAsync,
    data: txHash,
    isPending,
    error,
  } = useWriteContract();

  const {
    isLoading: isTxLoading,
    isSuccess: isTxSuccess,
    error: txError,
  } = useWaitForTransactionReceipt({
    hash: txHash,
    confirmations: 2, // Wait for 2 confirmations for reliability
  });

  const claim = async () => {
    try {
      toast.loading('Sending transaction...', { id: `claim-${tokenId}` });
      await writeContractAsync({
        address: GAME_CONTRACT_ADDRESS,
        abi: GameContractABI,
        functionName: 'claimBurnRewards',
        args: [BigInt(tokenId)],
      });
    } catch (e: unknown) {
      const errorMessage = e instanceof Error ? e.message : 'Transaction failed';
      toast.error(errorMessage, {
        id: `claim-${tokenId}`,
      });
      // Don't block NFT if transaction fails
    }
  };

  // Update toasts based on transaction status and trigger cache refresh
  useEffect(() => {
    if (isTxLoading) {
      toast.loading('Transaction in progress...', { id: `claim-${tokenId}` });
    }
    if (isTxSuccess && txHash && address) {
      toast.success('Reward claimed successfully!', {
        id: `claim-${tokenId}`,
        duration: 5000,
      });
      
      // Block the entire claim section for 4 minutes after successful transaction
      blockClaimSection();
      
      // Clear cache immediately after successful claim
      if (typeof window !== 'undefined' && address) {
        const cacheKey = `crazycube:burnedNfts:${address}`;
        localStorage.removeItem(cacheKey);
        
        // Also clear claimable rewards cache to force refresh
        const claimableCacheKey = `crazycube:claimable:${address}`;
        localStorage.removeItem(claimableCacheKey);
      }
      
      // Call success callback to trigger refresh
      if (onSuccess) {
        onSuccess();
      }
    }
    if (txError) {
      toast.error(txError.message || 'Transaction error', {
        id: `claim-${tokenId}`,
      });
      // Don't block NFT if transaction fails
    }
  }, [isTxLoading, isTxSuccess, txError, tokenId, onSuccess, address, txHash, blockClaimSection]);

  return {
    claim,
    isClaiming: isPending || isTxLoading,
    isSuccess: isTxSuccess,
    error: error || txError,
    txHash,
  };
};
