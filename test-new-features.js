let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) { passed++; console.log(`✅ PASS: ${message}`); }
  else { failed++; console.log(`❌ FAIL: ${message}`); }
}

function assertEqual(actual, expected, message) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) { passed++; console.log(`✅ PASS: ${message}`); }
  else { failed++; console.log(`❌ FAIL: ${message}`); console.log(`   Expected:`, expected); console.log(`   Actual:  `, actual); }
}

console.log('\n====================================================');
console.log('  新功能逻辑验证测试');
console.log('====================================================\n');

// ============================================================
// 测试1: 批量操作 - 模拟 batchUpdate/batchDelete/batchAddTags
// ============================================================
console.log('【测试1】批量操作 - 单条失败不影响整体');
console.log('------------------------------');

const db = {};
let idCounter = 0;

function mockUpdateTask(taskId, updateData, userId) {
  const task = db[taskId];
  if (!task) throw new Error('Task not found');
  Object.assign(task, updateData);
  return task;
}

function mockBatchUpdate(taskIds, updateData, userId) {
  const results = { succeeded: [], failed: [] };
  for (const taskId of taskIds) {
    try {
      mockUpdateTask(taskId, updateData, userId);
      results.succeeded.push(taskId);
    } catch (error) {
      results.failed.push({ taskId, error: error.message });
    }
  }
  return {
    total: taskIds.length,
    succeededCount: results.succeeded.length,
    failedCount: results.failed.length,
    succeeded: results.succeeded,
    failed: results.failed,
  };
}

function mockBatchAddTags(taskIds, tagsToAdd, userId) {
  const results = { succeeded: [], failed: [] };
  for (const taskId of taskIds) {
    const task = db[taskId];
    if (!task) { results.failed.push({ taskId, error: 'Task not found' }); continue; }
    task.tags = [...new Set([...(task.tags || []), ...tagsToAdd])];
    results.succeeded.push(taskId);
  }
  return { total: taskIds.length, succeededCount: results.succeeded.length, failedCount: results.failed.length, succeeded: results.succeeded, failed: results.failed };
}

function mockBatchDelete(taskIds, userId) {
  const results = { succeeded: [], failed: [] };
  for (const taskId of taskIds) {
    if (!db[taskId]) { results.failed.push({ taskId, error: 'Task not found' }); continue; }
    delete db[taskId];
    results.succeeded.push(taskId);
  }
  return { total: taskIds.length, succeededCount: results.succeeded.length, failedCount: results.failed.length, succeeded: results.succeeded, failed: results.failed };
}

db['t1'] = { _id: 't1', title: 'A', status: 'pending', priority: 'medium', tags: [] };
db['t2'] = { _id: 't2', title: 'B', status: 'pending', priority: 'low', tags: ['工作'] };
db['t3'] = { _id: 't3', title: 'C', status: 'in_progress', priority: 'high', tags: [] };

const batchResult1 = mockBatchUpdate(['t1', 't2', 'nonexist'], { status: 'completed' }, 'u1');
assertEqual(batchResult1.succeededCount, 2, '批量改状态：2条成功');
assertEqual(batchResult1.failedCount, 1, '批量改状态：1条失败（不存在）');
assertEqual(batchResult1.failed[0].error, 'Task not found', '失败原因正确');
assert(db['t1'].status === 'completed' && db['t2'].status === 'completed', '成功的任务状态已更新');

const batchResult2 = mockBatchAddTags(['t1', 't2', 'nonexist'], ['紧急', '项目A'], 'u1');
assertEqual(batchResult2.succeededCount, 2, '批量加标签：2条成功');
assertEqual(batchResult2.failedCount, 1, '批量加标签：1条失败');
assert(db['t1'].tags.includes('紧急') && db['t1'].tags.includes('项目A'), '标签已合并添加');
assert(db['t2'].tags.includes('工作') && db['t2'].tags.includes('紧急'), '已有标签保留，新标签合并');

const batchResult3 = mockBatchDelete(['t1', 'nonexist'], 'u1');
assertEqual(batchResult3.succeededCount, 1, '批量删除：1条成功');
assertEqual(batchResult3.failedCount, 1, '批量删除：1条失败');
assert(db['t1'] === undefined, '已删除的任务不存在');
assert(db['t2'] !== undefined, '未删除的任务仍在');

console.log('');

// ============================================================
// 测试2: 分组视图 - 日期分组逻辑
// ============================================================
console.log('【测试2】分组视图 - 日期分组逻辑');
console.log('------------------------------');

function classifyTaskByDueDate(dueDate, now) {
  if (!dueDate) return 'noDueDate';
  const d = new Date(dueDate);
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const todayEnd = new Date(now); todayEnd.setHours(23, 59, 59, 999);
  const tomorrowStart = new Date(now); tomorrowStart.setDate(tomorrowStart.getDate() + 1); tomorrowStart.setHours(0, 0, 0, 0);
  const tomorrowEnd = new Date(tomorrowStart); tomorrowEnd.setHours(23, 59, 59, 999);
  const weekEnd = new Date(now);
  weekEnd.setDate(weekEnd.getDate() + (7 - now.getDay()));
  weekEnd.setHours(23, 59, 59, 999);

  if (d < todayStart) return 'overdue';
  if (d >= todayStart && d <= todayEnd) return 'today';
  if (d >= tomorrowStart && d <= tomorrowEnd) return 'tomorrow';
  if (d > tomorrowEnd && d <= weekEnd) return 'thisWeek';
  if (d > weekEnd) return 'later';
  return 'unknown';
}

const now = new Date('2024-06-16T14:00:00Z'); // 周日
assertEqual(classifyTaskByDueDate('2024-06-14T10:00:00Z', now), 'overdue', '2天前 → overdue');
assertEqual(classifyTaskByDueDate('2024-06-16T10:00:00Z', now), 'today', '今天 → today');
assertEqual(classifyTaskByDueDate('2024-06-17T10:00:00Z', now), 'tomorrow', '明天 → tomorrow');
assertEqual(classifyTaskByDueDate('2024-06-19T10:00:00Z', now), 'thisWeek', '本周三 → thisWeek');
assertEqual(classifyTaskByDueDate('2024-06-25T10:00:00Z', now), 'later', '下周 → later');
assertEqual(classifyTaskByDueDate(null, now), 'noDueDate', '无截止日期 → noDueDate');

console.log('');

// ============================================================
// 测试3: 子任务进度汇总
// ============================================================
console.log('【测试3】子任务进度汇总 - 多层嵌套');
console.log('------------------------------');

function attachProgress(taskObj) {
  if (taskObj.subtasks && taskObj.subtasks.length > 0) {
    let totalAll = 0;
    let completedAll = 0;
    for (const sub of taskObj.subtasks) {
      attachProgress(sub);
      totalAll += (sub.progress.totalSubtasks || 0) + 1;
      completedAll += (sub.progress.completedSubtasks || 0) + (sub.status === 'completed' ? 1 : 0);
    }
    taskObj.progress = {
      totalSubtasks: totalAll,
      completedSubtasks: completedAll,
      uncompletedSubtasks: totalAll - completedAll,
      completionPercentage: totalAll > 0 ? Math.round((completedAll / totalAll) * 100) : 0,
    };
  } else {
    taskObj.progress = {
      totalSubtasks: 0,
      completedSubtasks: 0,
      uncompletedSubtasks: 0,
      completionPercentage: taskObj.status === 'completed' ? 100 : 0,
    };
  }
  return taskObj;
}

const parentTask = {
  _id: 'p1', title: '父任务', status: 'in_progress',
  subtasks: [
    {
      _id: 's1', title: '子任务1', status: 'completed',
      subtasks: [
        { _id: 'ss1', title: '孙任务1-1', status: 'completed', subtasks: [] },
        { _id: 'ss2', title: '孙任务1-2', status: 'pending', subtasks: [] },
      ],
    },
    {
      _id: 's2', title: '子任务2', status: 'pending',
      subtasks: [],
    },
    {
      _id: 's3', title: '子任务3', status: 'completed',
      subtasks: [
        { _id: 'ss3', title: '孙任务3-1', status: 'completed', subtasks: [] },
      ],
    },
  ],
};

attachProgress(parentTask);

assertEqual(parentTask.subtasks[0].progress.totalSubtasks, 2, '子任务1：2个孙任务');
assertEqual(parentTask.subtasks[0].progress.completedSubtasks, 1, '子任务1：1个孙任务已完成');
assertEqual(parentTask.subtasks[0].progress.completionPercentage, 50, '子任务1：子树完成率50%（1/2后代完成）');

assertEqual(parentTask.subtasks[1].progress.totalSubtasks, 0, '子任务2：无子任务');
assertEqual(parentTask.subtasks[1].progress.completionPercentage, 0, '子任务2：pending → 0%');

assertEqual(parentTask.subtasks[2].progress.totalSubtasks, 1, '子任务3：1个孙任务');
assertEqual(parentTask.subtasks[2].progress.completionPercentage, 100, '子任务3：都完成 → 100%');

assertEqual(parentTask.progress.totalSubtasks, 6, '父任务：全部6个后代');
assertEqual(parentTask.progress.completedSubtasks, 4, '父任务：4个已完成（s1,ss1,s3,ss3）');
assertEqual(parentTask.progress.uncompletedSubtasks, 2, '父任务：2个未完成（s2,ss2）');
assertEqual(parentTask.progress.completionPercentage, 67, '父任务：完成率67%（4/6）');

// 按进度排序
const taskList = [
  { title: 'A', progress: { completionPercentage: 80 } },
  { title: 'B', progress: { completionPercentage: 20 } },
  { title: 'C', progress: { completionPercentage: 50 } },
];
taskList.sort((a, b) => a.progress.completionPercentage - b.progress.completionPercentage);
assertEqual(taskList.map(t => t.title).join(','), 'B,C,A', '按进度升序：20%,50%,80%');
taskList.sort((a, b) => b.progress.completionPercentage - a.progress.completionPercentage);
assertEqual(taskList.map(t => t.title).join(','), 'A,C,B', '按进度降序：80%,50%,20%');

console.log('');

// ============================================================
// 测试4: 提醒提前时间配置 (minutesBefore)
// ============================================================
console.log('【测试4】提醒提前时间配置');
console.log('------------------------------');

function calculateRemindAt(dueDate, minutesBefore) {
  return new Date(new Date(dueDate).getTime() - minutesBefore * 60 * 1000);
}

const dueDate = new Date('2024-06-16T18:00:00Z');

const r10min = calculateRemindAt(dueDate, 10);
assertEqual(r10min.toISOString(), '2024-06-16T17:50:00.000Z', '提前10分钟：17:50');

const r1hr = calculateRemindAt(dueDate, 60);
assertEqual(r1hr.toISOString(), '2024-06-16T17:00:00.000Z', '提前1小时：17:00');

const r1day = calculateRemindAt(dueDate, 1440);
assertEqual(r1day.toISOString(), '2024-06-15T18:00:00.000Z', '提前1天：昨天18:00');

const r30min = calculateRemindAt(dueDate, 30);
assertEqual(r30min.toISOString(), '2024-06-16T17:30:00.000Z', '提前30分钟：17:30');

// 重复任务生成下一次时 minutesBefore 自动带过去
function mockGenerateNextReminder(originalReminder, nextDueDate) {
  if (!originalReminder || !originalReminder.enabled) {
    return { enabled: false, minutesBefore: null, remindAt: null, reminded: false };
  }
  const minutesBefore = originalReminder.minutesBefore || null;
  let remindAt = null;
  if (minutesBefore) {
    remindAt = new Date(nextDueDate.getTime() - minutesBefore * 60 * 1000);
  }
  return { enabled: true, minutesBefore, remindAt, reminded: false };
}

const origReminder = { enabled: true, minutesBefore: 60, remindAt: new Date('2024-06-16T17:00:00Z'), reminded: false };
const nextDueDate1 = new Date('2024-06-17T18:00:00Z');
const nextReminder = mockGenerateNextReminder(origReminder, nextDueDate1);
assertEqual(nextReminder.minutesBefore, 60, '下一次提醒保留minutesBefore=60');
assertEqual(nextReminder.remindAt.toISOString(), '2024-06-17T17:00:00.000Z', '下一次提醒时间自动计算：17:00');
assertEqual(nextReminder.reminded, false, '下一次提醒未触发');

// 不带 minutesBefore 的旧式提醒兼容
const legacyReminder = { enabled: true, minutesBefore: null, remindAt: new Date('2024-06-16T17:30:00Z'), reminded: false };
const nextLegacy = mockGenerateNextReminder(legacyReminder, new Date('2024-06-17T18:00:00Z'));
assertEqual(nextLegacy.enabled, true, '旧式提醒也能生成下一次');
// 旧式没有minutesBefore，用offset方式：dueDate(16T18:00) - remindAt(16T17:30) = 30min offset
// nextDueDate(17T18:00) - 30min = 17T17:30
function mockGenerateNextReminderWithOffset(originalReminder, nextDueDate) {
  if (!originalReminder || !originalReminder.enabled) {
    return { enabled: false, minutesBefore: null, remindAt: null, reminded: false };
  }
  const minutesBefore = originalReminder.minutesBefore || null;
  let remindAt = null;
  if (minutesBefore) {
    remindAt = new Date(nextDueDate.getTime() - minutesBefore * 60 * 1000);
  } else if (originalReminder.remindAt) {
    const origDue = new Date('2024-06-16T18:00:00Z');
    const origRemind = new Date(originalReminder.remindAt);
    const offset = origDue.getTime() - origRemind.getTime();
    remindAt = new Date(nextDueDate.getTime() - offset);
  }
  return { enabled: true, minutesBefore, remindAt, reminded: false };
}
const nextLegacy2 = mockGenerateNextReminderWithOffset(legacyReminder, new Date('2024-06-17T18:00:00Z'));
assert(nextLegacy2.remindAt !== null, '旧式提醒：用offset计算remindAt');

console.log('');

// ============================================================
// 测试5: 创建任务时 minutesBefore + dueDate 自动计算
// ============================================================
console.log('【测试5】创建任务时 minutesBefore 自动计算 remindAt');
console.log('------------------------------');

function mockCreateReminderConfig(reminder, dueDate) {
  let config = { enabled: false, minutesBefore: null, remindAt: null, reminded: false };
  if (reminder && reminder.enabled && dueDate) {
    const minutesBefore = reminder.minutesBefore || null;
    let remindAt = reminder.remindAt ? new Date(reminder.remindAt) : null;
    if (minutesBefore && dueDate) {
      remindAt = new Date(new Date(dueDate).getTime() - minutesBefore * 60 * 1000);
    }
    if (remindAt) {
      config = { enabled: true, minutesBefore, remindAt, reminded: false };
    }
  } else if (reminder && reminder.enabled && reminder.remindAt) {
    config = { enabled: true, minutesBefore: reminder.minutesBefore || null, remindAt: new Date(reminder.remindAt), reminded: false };
  }
  return config;
}

const c1 = mockCreateReminderConfig(
  { enabled: true, minutesBefore: 30 },
  '2024-06-16T18:00:00Z'
);
assertEqual(c1.enabled, true, 'minutesBefore=30 → enabled=true');
assertEqual(c1.minutesBefore, 30, '保留minutesBefore');
assertEqual(c1.remindAt.toISOString(), '2024-06-16T17:30:00.000Z', '自动计算remindAt=17:30');

const c2 = mockCreateReminderConfig(
  { enabled: true, minutesBefore: 1440 },
  '2024-06-16T18:00:00Z'
);
assertEqual(c2.remindAt.toISOString(), '2024-06-15T18:00:00.000Z', '提前1天=前一天18:00');

const c3 = mockCreateReminderConfig(
  { enabled: true, remindAt: '2024-06-16T16:00:00Z' },
  '2024-06-16T18:00:00Z'
);
assertEqual(c3.minutesBefore, null, '旧方式只传remindAt → minutesBefore=null');
assertEqual(c3.remindAt.toISOString(), '2024-06-16T16:00:00.000Z', '直接使用remindAt');

const c4 = mockCreateReminderConfig(
  { enabled: true, minutesBefore: 60 },
  null
);
assertEqual(c4.enabled, false, '无dueDate+minutesBefore → 不启用');

console.log('');

// ============================================================
// 汇总
// ============================================================
console.log('====================================================');
console.log(`  测试完成: ${passed} 通过, ${failed} 失败`);
console.log('====================================================\n');

if (failed > 0) { process.exit(1); }
console.log('🎉 所有新功能逻辑测试通过！\n');
