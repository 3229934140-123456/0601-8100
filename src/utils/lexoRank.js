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
    return `${next.bucket}|${rankBetweenStrings('', next.rank)}`;
  }
  if (!nextRank) {
    const prev = parseRank(prevRank);
    return `${prev.bucket}|${rankBetweenStrings(prev.rank, '')}`;
  }

  const prev = parseRank(prevRank);
  const next = parseRank(nextRank);

  if (compareRanks(prevRank, nextRank) >= 0) {
    throw new Error('prevRank must be less than nextRank');
  }

  return `${prev.bucket}|${rankBetweenStrings(prev.rank, next.rank)}`;
}

function rankBetweenStrings(prevStr, nextStr) {
  const BASE = BASE_36_CHARS.length;
  const ZERO_CHAR = BASE_36_CHARS[0];
  const LAST_CHAR = BASE_36_CHARS[BASE - 1];
  const MID_IDX = Math.floor(BASE / 2);
  const MID_CHAR = BASE_36_CHARS[MID_IDX];
  const hasPrev = prevStr.length > 0;
  const hasNext = nextStr.length > 0;
  const maxLen = Math.max(prevStr.length, nextStr.length, RANK_LENGTH);
  const prevPadded = hasPrev ? prevStr.padEnd(maxLen, ZERO_CHAR) : '';
  const nextPadded = hasNext ? nextStr.padEnd(maxLen, LAST_CHAR) : '';

  let result = '';
  let prevFinished = !hasPrev;
  let nextFinished = !hasNext;

  for (let i = 0; i < maxLen; i++) {
    const p = prevFinished ? 0 : charToIndex(prevPadded[i]);
    const n = nextFinished ? BASE - 1 : charToIndex(nextPadded[i]);

    if (p === n) {
      result += indexToChar(p);
      continue;
    }

    const diff = n - p;
    if (diff > 1) {
      result += indexToChar(p + Math.floor(diff / 2));
      break;
    }

    if (diff === 1) {
      if (i === maxLen - 1) {
        result += indexToChar(p);
        result += MID_CHAR;
        break;
      }

      result += indexToChar(p);
      nextFinished = true;
      continue;
    }

    result += indexToChar(Math.max(0, p + MID_IDX));
    break;
  }

  while (result.length < RANK_LENGTH) {
    result += ZERO_CHAR;
  }

  return result;
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
