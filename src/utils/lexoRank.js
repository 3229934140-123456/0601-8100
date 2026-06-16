const BASE_36_CHARS = '0123456789abcdefghijklmnopqrstuvwxyz';
const DEFAULT_BUCKET = 0;
const RANK_LENGTH = 8;

function charToIndex(char) {
  const code = char.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48;
  if (code >= 97 && code <= 122) return code - 97 + 10;
  return -1;
}

function indexToChar(index) {
  return BASE_36_CHARS[index];
}

function generateInitialRank(bucket = DEFAULT_BUCKET) {
  const middle = Math.floor(BASE_36_CHARS.length / 2);
  let rank = indexToChar(middle);
  for (let i = 1; i < RANK_LENGTH; i++) {
    rank += BASE_36_CHARS[0];
  }
  return `${bucket}|${rank}`;
}

function parseRank(rankStr) {
  const [bucket, rank] = rankStr.split('|');
  return { bucket: parseInt(bucket, 10), rank };
}

function compareRanks(rank1, rank2) {
  const p1 = parseRank(rank1);
  const p2 = parseRank(rank2);
  if (p1.bucket !== p2.bucket) return p1.bucket - p2.bucket;
  const minLen = Math.min(p1.rank.length, p2.rank.length);
  for (let i = 0; i < minLen; i++) {
    const diff = charToIndex(p1.rank[i]) - charToIndex(p2.rank[i]);
    if (diff !== 0) return diff;
  }
  return p1.rank.length - p2.rank.length;
}

function rankBetween(prevRank, nextRank, bucket = DEFAULT_BUCKET) {
  if (!prevRank && !nextRank) {
    return generateInitialRank(bucket);
  }
  if (!prevRank) {
    const next = parseRank(nextRank);
    const firstCharIdx = charToIndex(next.rank[0]);
    if (firstCharIdx > 0) {
      const rank = indexToChar(Math.floor(firstCharIdx / 2)) + BASE_36_CHARS[0].repeat(RANK_LENGTH - 1);
      return `${next.bucket}|${rank}`;
    }
    const rank = BASE_36_CHARS[0] + indexToChar(Math.floor(BASE_36_CHARS.length / 2)) + BASE_36_CHARS[0].repeat(RANK_LENGTH - 2);
    return `${next.bucket}|${rank}`;
  }
  if (!nextRank) {
    const prev = parseRank(prevRank);
    const lastCharIdx = charToIndex(prev.rank[prev.rank.length - 1]);
    if (lastCharIdx < BASE_36_CHARS.length - 1) {
      const rank = prev.rank.slice(0, -1) + indexToChar(Math.floor((lastCharIdx + BASE_36_CHARS.length - 1) / 2));
      return `${prev.bucket}|${rank}`;
    }
    const rank = prev.rank + indexToChar(Math.floor(BASE_36_CHARS.length / 2));
    return `${prev.bucket}|${rank}`;
  }

  const prev = parseRank(prevRank);
  const next = parseRank(nextRank);

  if (compareRanks(prevRank, nextRank) >= 0) {
    throw new Error('prevRank must be less than nextRank');
  }

  const maxLen = Math.max(prev.rank.length, next.rank.length);
  const prevPadded = prev.rank.padEnd(maxLen, BASE_36_CHARS[0]);
  const nextPadded = next.rank.padEnd(maxLen, BASE_36_CHARS[0]);

  let carry = 1;
  let midStr = '';
  for (let i = maxLen - 1; i >= 0; i--) {
    const p = charToIndex(prevPadded[i]);
    const n = charToIndex(nextPadded[i]);
    let sum = p + n + carry * BASE_36_CHARS.length;
    carry = Math.floor(sum / 2 / BASE_36_CHARS.length) + (sum % 2 === 1 && i > 0 ? 1 : 0);
    const mid = Math.floor(sum / 2) % BASE_36_CHARS.length;
    midStr = indexToChar(mid) + midStr;
  }

  if (carry > 0) {
    midStr = indexToChar(carry) + midStr;
  }

  const finalRank = midStr.replace(/0+$/, '') || BASE_36_CHARS[0];
  return `${prev.bucket}|${finalRank.padEnd(RANK_LENGTH, BASE_36_CHARS[0])}`;
}

function rebalanceRanks(ranks, bucket = DEFAULT_BUCKET) {
  const sorted = [...ranks].sort(compareRanks);
  const newRanks = [];
  const step = Math.floor(BASE_36_CHARS.length * BASE_36_CHARS.length / (sorted.length + 1));
  
  for (let i = 0; i < sorted.length; i++) {
    const value = (i + 1) * step;
    let rank = '';
    let remaining = value;
    for (let j = 0; j < RANK_LENGTH; j++) {
      rank += indexToChar(remaining % BASE_36_CHARS.length);
      remaining = Math.floor(remaining / BASE_36_CHARS.length);
    }
    newRanks.push(`${bucket}|${rank.split('').reverse().join('')}`);
  }
  
  return newRanks;
}

module.exports = {
  generateInitialRank,
  rankBetween,
  compareRanks,
  parseRank,
  rebalanceRanks,
  BASE_36_CHARS,
};
