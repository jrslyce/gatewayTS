import type { PollUpdate } from "./types";

export function toPollUpdate(
  pollId: string,
  results: number[],
  isFinal = false
): PollUpdate {
  const normalizedResults = results.map((value) => Math.max(0, Math.trunc(value || 0)));
  const count = normalizedResults.reduce((sum, value) => sum + value, 0);
  let winner = 0;
  let winningVoteCount = normalizedResults[0] ?? 0;

  normalizedResults.forEach((value, index) => {
    if (value > winningVoteCount) {
      winner = index;
      winningVoteCount = value;
    }
  });

  const weighted = normalizedResults.reduce((sum, value, index) => sum + value * index, 0);

  return {
    pollId,
    winner,
    winningVoteCount,
    results: normalizedResults,
    count,
    mean: count === 0 ? 0 : weighted / count,
    isFinal
  };
}
