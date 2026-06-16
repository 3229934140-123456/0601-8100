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

function calculateNextDueDate(currentDueDate, recurrence) {
  if (!recurrence.enabled || !recurrence.pattern || !currentDueDate) {
    return null;
  }

  const next = new Date(currentDueDate);
  const { pattern, interval = 1, weekdays = [] } = recurrence;

  switch (pattern) {
    case 'daily':
      next.setDate(next.getDate() + interval);
      break;

    case 'weekly':
      if (weekdays.length > 0) {
        const sortedWeekdays = [...weekdays].sort((a, b) => a - b);
        const currentDay = next.getDay();

        let found = false;
        for (const day of sortedWeekdays) {
          if (day > currentDay) {
            next.setDate(next.getDate() + (day - currentDay));
            found = true;
            break;
          }
        }

        if (!found) {
          const daysToAdd = (7 - currentDay + sortedWeekdays[0]) % 7 || 7;
          next.setDate(next.getDate() + daysToAdd + (interval - 1) * 7);
        }
      } else {
        next.setDate(next.getDate() + 7 * interval);
      }
      break;

    case 'monthly':
      next.setMonth(next.getMonth() + interval);
      break;

    case 'yearly':
      next.setFullYear(next.getFullYear() + interval);
      break;

    default:
      return null;
  }

  return next;
}

function shouldGenerateNext(task) {
  if (!task.recurrence.enabled) return false;
  if (task.status !== 'completed') return false;
  if (!task.dueDate) return false;

  if (task.recurrence.endDate) {
    const nextDate = calculateNextDueDate(task.dueDate, task.recurrence);
    if (nextDate && nextDate > task.recurrence.endDate) {
      return false;
    }
  }

  if (task.recurrence.occurrences !== null && task.recurrence.occurrences !== undefined) {
    if ((task.recurrence.completedOccurrences || 0) >= task.recurrence.occurrences) {
      return false;
    }
  }

  return true;
}

console.log('\n====================================================');
console.log('  任务管理后端 - 修复点验证测试');
console.log('====================================================\n');

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`✅ PASS: ${message}`);
  } else {
    failed++;
    console.log(`❌ FAIL: ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
    console.log(`✅ PASS: ${message}`);
  } else {
    failed++;
    console.log(`❌ FAIL: ${message}`);
    console.log(`   Expected:`, expected);
    console.log(`   Actual:  `, actual);
  }
}

// ============================================================
// 测试1: LexoRank 排序算法
// ============================================================
console.log('【测试1】LexoRank 排序算法');
console.log('------------------------------');

const r1 = generateInitialRank();
const r2 = rankBetween(r1, null);
const r3 = rankBetween(null, r1);
assert(r1 && typeof r1 === 'string', '能生成初始排名: ' + r1);
assert(compareRanks(r1, r2) < 0, `新生成的排名应该大于初始: ${r1} < ${r2}`);
assert(compareRanks(r3, r1) < 0, `新生成的排名应该小于初始: ${r3} < ${r1}`);

const between = rankBetween(r1, r2);
assert(
  compareRanks(r1, between) < 0 && compareRanks(between, r2) < 0,
  `能正确生成中间排名: ${r1} < ${between} < ${r2}`
);

console.log('');

// ============================================================
// 测试2: 重复任务 - daily 模式计算下一次日期
// ============================================================
console.log('【测试2】重复任务 - daily 日期计算');
console.log('------------------------------');

const today = new Date('2024-06-16T10:00:00Z');
const dailyTask = {
  recurrence: { enabled: true, pattern: 'daily', interval: 1 },
  dueDate: today,
};

const nextDaily = calculateNextDueDate(today, dailyTask.recurrence);
assertEqual(
  nextDaily.toISOString().slice(0, 10),
  '2024-06-17',
  'daily模式：次日应该是2024-06-17'
);

const daily2 = calculateNextDueDate(
  today,
  { enabled: true, pattern: 'daily', interval: 3 }
);
assertEqual(
  daily2.toISOString().slice(0, 10),
  '2024-06-19',
  '每3天：跳过3天应该是2024-06-19'
);

console.log('');

// ============================================================
// 测试3: 重复任务 - weekly 模式计算下一次日期
// ============================================================
console.log('【测试3】重复任务 - weekly 日期计算');
console.log('------------------------------');

// 2024-06-16 是星期日 (getDay() = 0)
const sunday = new Date('2024-06-16T10:00:00Z');

// 每周一、三、五
const weeklyTask = {
  recurrence: {
    enabled: true,
    pattern: 'weekly',
    interval: 1,
    weekdays: [1, 3, 5],
  },
};

const nextWeekly1 = calculateNextDueDate(sunday, weeklyTask.recurrence);
assertEqual(
  nextWeekly1.toISOString().slice(0, 10),
  '2024-06-17',
  '周日+每周一三五：下一次应该是周一 2024-06-17'
);

// 从周一（2024-06-17）算下一次
const monday = new Date('2024-06-17T10:00:00Z');
const nextWeekly2 = calculateNextDueDate(monday, weeklyTask.recurrence);
assertEqual(
  nextWeekly2.toISOString().slice(0, 10),
  '2024-06-19',
  '周一+每周一三五：下一次应该是周三 2024-06-19'
);

// 从周五算下一次（应该跳到下周周一）
const friday = new Date('2024-06-21T10:00:00Z');
const nextWeekly3 = calculateNextDueDate(friday, weeklyTask.recurrence);
assertEqual(
  nextWeekly3.toISOString().slice(0, 10),
  '2024-06-24',
  '周五+每周一三五：下一次应该是下周周一 2024-06-24'
);

// 无指定星期的每周重复
const plainWeekly = calculateNextDueDate(
  sunday,
  { enabled: true, pattern: 'weekly', interval: 2, weekdays: [] }
);
assertEqual(
  plainWeekly.toISOString().slice(0, 10),
  '2024-06-30',
  '每2周一次：加14天应该是 2024-06-30'
);

console.log('');

// ============================================================
// 测试4: shouldGenerateNext 判断逻辑
// ============================================================
console.log('【测试4】shouldGenerateNext 判断逻辑');
console.log('------------------------------');

const goodTask = {
  recurrence: { enabled: true, pattern: 'daily', interval: 1 },
  status: 'completed',
  dueDate: new Date(),
};
assert(
  shouldGenerateNext(goodTask) === true,
  '已完成+启用重复+有截止日期 → 应该生成下一次'
);

const notCompleted = { ...goodTask, status: 'pending' };
assert(
  shouldGenerateNext(notCompleted) === false,
  '未完成 → 不应该生成'
);

const disabledRecurrence = {
  ...goodTask,
  recurrence: { ...goodTask.recurrence, enabled: false },
};
assert(
  shouldGenerateNext(disabledRecurrence) === false,
  '重复已禁用 → 不应该生成'
);

const noDueDate = { ...goodTask, dueDate: null };
assert(
  shouldGenerateNext(noDueDate) === false,
  '无截止日期 → 不应该生成'
);

// 超过次数限制
const exceedOccurrences = {
  ...goodTask,
  recurrence: {
    ...goodTask.recurrence,
    occurrences: 5,
    completedOccurrences: 5,
  },
};
assert(
  shouldGenerateNext(exceedOccurrences) === false,
  '已达到最大次数 → 不应该生成'
);

// 超过结束日期
const exceedEndDate = {
  ...goodTask,
  dueDate: new Date('2024-12-31'),
  recurrence: {
    ...goodTask.recurrence,
    endDate: new Date('2024-12-30'),
  },
};
assert(
  shouldGenerateNext(exceedEndDate) === false,
  '下次日期超过endDate → 不应该生成'
);

console.log('');

// ============================================================
// 测试5: 父子任务状态联动逻辑（模拟 checkParentAutoComplete）
// ============================================================
console.log('【测试5】父子任务状态联动（逻辑模拟）');
console.log('------------------------------');

function simulateCheckParentAutoComplete(parentStatus, subtaskStatuses) {
  const allCompleted = subtaskStatuses.every(s => s === 'completed');
  const hasCompleted = subtaskStatuses.some(s => s === 'completed');

  let newStatus = parentStatus;

  if (allCompleted && parentStatus !== 'completed') {
    newStatus = 'completed';
  } else if (!allCompleted && parentStatus === 'completed') {
    newStatus = hasCompleted ? 'in_progress' : 'pending';
  } else if (!allCompleted && hasCompleted && parentStatus === 'pending') {
    newStatus = 'in_progress';
  } else if (!hasCompleted && parentStatus === 'in_progress') {
    newStatus = 'pending';
  }
  return newStatus;
}

// 场景A：唯一子任务完成 → 父任务自动完成
let result = simulateCheckParentAutoComplete('pending', ['completed']);
assertEqual(result, 'completed', '场景A: 唯一子任务完成 → 父任务 → completed');

// 场景B：唯一子任务改回未完成 → 父任务从completed回退到pending
result = simulateCheckParentAutoComplete('completed', ['pending']);
assertEqual(result, 'pending', '场景B: 唯一子任务取消完成 → 父任务从completed → pending');

// 场景C：3个子任务，2完成1未完成 → 父任务从completed回退到in_progress
result = simulateCheckParentAutoComplete('completed', ['completed', 'completed', 'pending']);
assertEqual(result, 'in_progress', '场景C: 部分子任务未完成 → 父任务从completed → in_progress');

// 场景D：3个子任务全部完成 → 父任务从in_progress变成completed
result = simulateCheckParentAutoComplete('in_progress', ['completed', 'completed', 'completed']);
assertEqual(result, 'completed', '场景D: 所有子任务完成 → 父任务从in_progress → completed');

// 场景E：部分子任务完成，父任务是pending → 变成in_progress
result = simulateCheckParentAutoComplete('pending', ['completed', 'pending', 'pending']);
assertEqual(result, 'in_progress', '场景E: 部分完成父pending → 父 → in_progress');

// 场景F：全部未完成，父是in_progress → 变成pending
result = simulateCheckParentAutoComplete('in_progress', ['pending', 'pending']);
assertEqual(result, 'pending', '场景F: 全部未完成父in_progress → 父 → pending');

// 场景G：所有子任务都未完成 且 父是completed → 回退到pending
result = simulateCheckParentAutoComplete('completed', ['pending', 'pending', 'pending']);
assertEqual(result, 'pending', '场景G: 所有子任务未完成+父completed → 父 → pending');

// 场景H：嵌套 - 子任务状态变化逐层向上传递
// 模拟：父1(completed) -> 子A(in_progress) -> 孙A1(completed)孙A2(pending)
// 当孙A2完成时，子A变成completed -> 父1保持completed
result = simulateCheckParentAutoComplete('in_progress', ['completed', 'completed']);
assertEqual(result, 'completed', '场景H1: 子任务(孙)都完成 -> 父(子A) completed');
result = simulateCheckParentAutoComplete('completed', ['completed', 'completed']);
assertEqual(result, 'completed', '场景H2: 所有直接子任务完成 -> 父1保持completed');

console.log('');

// ============================================================
// 测试6: 重复生成防护逻辑（模拟去重检查）
// ============================================================
console.log('【测试6】重复生成防护（同originalTaskId+同dueDate不应重复生成）');
console.log('------------------------------');

const existingTasks = [];
let idCounter = 0;

function mockGenerateNextTask(sourceTask) {
  const nextDueDate = calculateNextDueDate(
    sourceTask.dueDate,
    sourceTask.recurrence
  );
  if (!nextDueDate) return null;

  if (!shouldGenerateNext(sourceTask)) return null;

  const origId = sourceTask.recurrence.originalTaskId || sourceTask._id;
  const taskId = sourceTask._id;

  const dup = existingTasks.find(t =>
    (t.recurrence.originalTaskId === origId || t.recurrence.originalTaskId === taskId)
    && t.dueDate.getTime() === nextDueDate.getTime()
  );

  if (dup) return null;

  const newTask = {
    _id: `task_${idCounter++}`,
    title: sourceTask.title,
    status: 'pending',
    dueDate: nextDueDate,
    recurrence: {
      ...sourceTask.recurrence,
      completedOccurrences: (sourceTask.recurrence.completedOccurrences || 0) + 1,
      originalTaskId: origId,
    },
  };
  existingTasks.push(newTask);
  return newTask;
}

// 初始化一个daily任务并完成
const taskA = {
  _id: 'task_0',
  title: '日报',
  status: 'completed',
  dueDate: new Date('2024-06-16T10:00:00Z'),
  recurrence: {
    enabled: true,
    pattern: 'daily',
    interval: 1,
    completedOccurrences: 0,
  },
};

const initialCount = existingTasks.length;
const nextA1 = mockGenerateNextTask(taskA);
assert(nextA1 !== null, '首次生成：应该成功');
assertEqual(nextA1.dueDate.toISOString().slice(0, 10), '2024-06-17', '首次生成日期正确');
assertEqual(existingTasks.length, initialCount + 1, '任务数量+1');

const nextA2 = mockGenerateNextTask(taskA);
assert(nextA2 === null, '用同一个源任务再次生成：应该返回null（防重复）');
assertEqual(existingTasks.length, initialCount + 1, '任务数量不变');

console.log('  --- 模拟定时补偿扫描连续跑两次 ---');
const beforeScan = existingTasks.length;
const scanRound1 = mockGenerateNextTask(taskA);
const scanRound2 = mockGenerateNextTask(taskA);
const scanRound3 = mockGenerateNextTask(taskA);
const success1 = scanRound1 !== null ? 1 : 0;
const success2 = scanRound2 !== null ? 1 : 0;
const success3 = scanRound3 !== null ? 1 : 0;
assertEqual(
  success1 + success2 + success3,
  0,
  '定时扫描连续跑3次：都不应重复生成（新增0条）'
);
assertEqual(existingTasks.length, beforeScan, '任务数量保持不变');

// 测试weekly场景也能正确去重
existingTasks.length = 0;
idCounter = 0;
const weeklyTaskA = {
  _id: 'task_w1',
  title: '周报',
  status: 'completed',
  dueDate: new Date('2024-06-14T10:00:00Z'), // 周五
  recurrence: {
    enabled: true,
    pattern: 'weekly',
    interval: 1,
    weekdays: [5], // 每周五
    completedOccurrences: 0,
  },
};
const w1 = mockGenerateNextTask(weeklyTaskA);
const w2 = mockGenerateNextTask(weeklyTaskA);
const w3 = mockGenerateNextTask(weeklyTaskA);
assert(w1 !== null, 'weekly首次生成：应该成功');
assertEqual(w1.dueDate.toISOString().slice(0, 10), '2024-06-21', 'weekly下一次日期正确：下周五');
assert(w2 === null && w3 === null, 'weekly多次生成：后续应返回null');
assertEqual(existingTasks.length, 1, 'weekly任务数量保持1条');

console.log('');

// ============================================================
// 测试7: updateTask 与 completeTask 统一行为（模拟）
// ============================================================
console.log('【测试7】complete接口 与 update接口 行为统一（模拟）');
console.log('------------------------------');

const db = {};

function mockUpdateTask(id, updateData) {
  const task = db[id];
  if (!task) throw new Error('not found');

  const oldStatus = task.status;
  const { status, ...rest } = updateData;

  let justCompleted = false;
  if (status !== undefined && status !== oldStatus) {
    task.status = status;
    if (status === 'completed') {
      task.completedAt = new Date();
      justCompleted = true;
    } else if (oldStatus === 'completed') {
      task.completedAt = null;
    }
  }

  Object.assign(task, rest);

  if (justCompleted && task.recurrence && task.recurrence.enabled) {
    const newTask = mockGenerateNextTask(task);
    if (newTask) {
      db[newTask._id] = newTask;
    }
  }

  return { ...task };
}

existingTasks.length = 0;
idCounter = 0;
Object.keys(db).forEach(k => delete db[k]);

// 场景1: 通过 complete 接口（底层走 updateTask status=completed）
db['daily_a'] = {
  _id: 'daily_a',
  title: '每日日报',
  status: 'pending',
  dueDate: new Date('2024-06-16T10:00:00Z'),
  recurrence: { enabled: true, pattern: 'daily', interval: 1 },
};

const result1 = mockUpdateTask('daily_a', { status: 'completed' });
assertEqual(result1.status, 'completed', 'complete接口：任务状态变为completed');
const dbCountAfterComplete = Object.keys(db).length;
assert(dbCountAfterComplete >= 2, `complete接口：DB中应该有原任务+新任务（当前${dbCountAfterComplete}条）`);
const newTask1 = Object.values(db).find(t => t.status === 'pending' && t.recurrence && t._id !== 'daily_a');
assert(newTask1 !== undefined, 'complete接口：应该生成了下一次pending任务');
assertEqual(
  newTask1.dueDate.toISOString().slice(0, 10),
  '2024-06-17',
  'complete接口：下一次日期正确'
);

// 再次调用complete接口（任务已经是completed了，不应再次生成）
existingTasks.length = 0;
const beforeReComplete = Object.keys(db).length;
const result1b = mockUpdateTask('daily_a', { status: 'completed' });
assertEqual(result1b.status, 'completed', '重复调用complete：状态保持completed');
assertEqual(
  Object.keys(db).length,
  beforeReComplete,
  '重复调用complete：不会重复生成下一次（因为oldStatus===completed，justCompleted=false）'
);

// 场景2: 通过 update 接口直接改 status=completed
existingTasks.length = 0;
Object.keys(db).forEach(k => delete db[k]);
db['daily_b'] = {
  _id: 'daily_b',
  title: '每日站会',
  status: 'pending',
  dueDate: new Date('2024-06-20T10:00:00Z'),
  recurrence: { enabled: true, pattern: 'daily', interval: 1 },
};

const result2 = mockUpdateTask('daily_b', { status: 'completed' });
assertEqual(result2.status, 'completed', 'update接口改status：状态变为completed');
const dbCountAfterUpdate = Object.keys(db).length;
assert(dbCountAfterUpdate >= 2, `update接口：DB中应该有原任务+新任务（当前${dbCountAfterUpdate}条）`);
const newTask2 = Object.values(db).find(t => t._id !== 'daily_b');
assert(newTask2 !== undefined, 'update接口：应该生成了下一次任务');
assertEqual(newTask2.status, 'pending', 'update接口：新任务状态是pending');
assertEqual(
  newTask2.dueDate.toISOString().slice(0, 10),
  '2024-06-21',
  'update接口：下一次日期正确'
);

// 场景3: weekly通过update接口完成
existingTasks.length = 0;
Object.keys(db).forEach(k => delete db[k]);
db['weekly_c'] = {
  _id: 'weekly_c',
  title: '每周例会',
  status: 'pending',
  dueDate: new Date('2024-06-17T14:00:00Z'), // 周一
  recurrence: { enabled: true, pattern: 'weekly', interval: 1, weekdays: [1] },
};
const result3 = mockUpdateTask('weekly_c', { status: 'completed' });
assertEqual(result3.status, 'completed', 'weekly+update接口：状态变为completed');
const newTask3 = Object.values(db).find(t => t._id !== 'weekly_c');
assert(newTask3 !== undefined, 'weekly+update接口：应该生成下一次任务');
assertEqual(
  newTask3.dueDate.toISOString().slice(0, 10),
  '2024-06-24',
  'weekly+update接口：下一次日期正确（下周一）'
);

// 验证两个接口行为一致
assertEqual(
  result1.status,
  result2.status,
  '两个接口行为一致：都返回completed状态的任务'
);
assertEqual(
  newTask1.recurrence.pattern,
  newTask2.recurrence.pattern,
  '两个接口行为一致：生成的新任务recurrence配置相同'
);

console.log('');

// ============================================================
// 测试8: 接口不返回400 - toObject兼容逻辑（模拟修复）
// ============================================================
console.log('【测试8】接口返回值兼容：toObject不存在的普通对象也能处理');
console.log('------------------------------');

function mockHandleRecurrenceDataCompatibility(taskRecurrence) {
  const recurrenceData = typeof taskRecurrence.toObject === 'function'
    ? taskRecurrence.toObject()
    : JSON.parse(JSON.stringify(taskRecurrence));
  return recurrenceData;
}

// Mongoose 文档对象（有toObject方法）
const mongooseDocRecurrence = {
  enabled: true,
  pattern: 'daily',
  interval: 1,
  toObject() {
    return { enabled: this.enabled, pattern: this.pattern, interval: this.interval, _mongoose: true };
  },
};
const r1_handled = mockHandleRecurrenceDataCompatibility(mongooseDocRecurrence);
assert(r1_handled._mongoose === true, 'Mongoose文档：调用toObject()成功');

// 普通对象（无toObject，比如经过getTaskWithSubtasks返回的对象）
const plainObjRecurrence = {
  enabled: true,
  pattern: 'weekly',
  interval: 1,
  weekdays: [1, 3, 5],
};
const r2_handled = mockHandleRecurrenceDataCompatibility(plainObjRecurrence);
assertEqual(r2_handled.pattern, 'weekly', '普通对象：JSON序列化成功，不报错');
assert(Array.isArray(r2_handled.weekdays) && r2_handled.weekdays.length === 3, '普通对象：weekdays字段完整保留');

console.log('');

// ============================================================
// 汇总
// ============================================================
console.log('====================================================');
console.log(`  测试完成: ${passed} 通过, ${failed} 失败`);
console.log('====================================================\n');

if (failed > 0) {
  console.log('❌ 有测试失败，请检查修复逻辑\n');
  process.exit(1);
}

console.log('🎉 所有逻辑测试通过！\n');
console.log('💡 下一步：端到端测试（需要 MongoDB）');
console.log('   1. 确保 MongoDB 已启动在 localhost:27017');
console.log('   2. 执行: npm install');
console.log('   3. 执行: npm run dev');
console.log('   4. 用 curl 或 Postman 测试实际 API\n');
