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
console.log('  第四轮功能验证测试');
console.log('====================================================\n');

// ============================================================
// 测试1: 分组视图 - 各分组尊重 status 等筛选条件
// ============================================================
console.log('【测试1】分组视图 - 各分组尊重筛选条件');
console.log('------------------------------');

function buildGroupFilters(query = {}) {
  const { status, priority, tags, search, assignee, collaborator, participant } = query;
  const baseFilter = {};
  if (status) baseFilter.status = status;
  if (priority) baseFilter.priority = priority;
  if (assignee) baseFilter.assignee = assignee;
  if (collaborator) baseFilter.collaborators = collaborator;
  if (participant) {
    baseFilter.$or = [
      { assignee: participant },
      { collaborators: participant },
    ];
  }
  if (search) {
    const searchOr = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } },
    ];
    if (baseFilter.$or) {
      baseFilter.$and = [{ $or: baseFilter.$or }, { $or: searchOr }];
      delete baseFilter.$or;
    } else {
      baseFilter.$or = searchOr;
    }
  }

  const todayStart = new Date('2024-06-16T00:00:00Z');
  const now = new Date('2024-06-16T14:00:00Z');

  const overdueFilter = { ...baseFilter, dueDate: { $lt: todayStart } };
  if (!status) {
    overdueFilter.status = { $nin: ['completed', 'cancelled'] };
  }
  return { baseFilter, overdueFilter };
}

let r;
r = buildGroupFilters({});
assert(r.overdueFilter.status && r.overdueFilter.status.$nin.includes('completed'), '不传status时，overdue默认排除completed/cancelled');
assertEqual(r.baseFilter.status, undefined, '不传status时，baseFilter无status');

r = buildGroupFilters({ status: 'completed' });
assertEqual(r.overdueFilter.status, 'completed', '传status=completed时，overdue也必须只查completed，不能排除');
assert(!r.overdueFilter.status.$nin, '传status时，overdue不能有$nin排除条件');

r = buildGroupFilters({ status: 'pending', priority: 'high' });
assertEqual(r.overdueFilter.status, 'pending', '传status=pending时，overdue=pending');
assertEqual(r.overdueFilter.priority, 'high', '传priority=high时，overdue也带priority');

r = buildGroupFilters({ assignee: 'user1' });
assertEqual(r.overdueFilter.assignee, 'user1', 'assignee筛选也带入overdue');

r = buildGroupFilters({ collaborator: 'dev2' });
assertEqual(r.overdueFilter.collaborators, 'dev2', 'collaborator筛选也带入overdue');

r = buildGroupFilters({ participant: 'alice' });
assert(r.overdueFilter.$or && r.overdueFilter.$or.length === 2, 'participant筛选带入$or条件到overdue');

r = buildGroupFilters({ participant: 'alice', search: '报告' });
assert(r.overdueFilter.$and, 'participant+search 组合时使用$and');
assert(r.overdueFilter.$or === undefined, 'participant+search 组合时不保留顶层$or');

console.log('');

// ============================================================
// 测试2: 进度排序 - 全量排序再分页
// ============================================================
console.log('【测试2】进度排序 - 全量排序再分页');
console.log('------------------------------');

function compareRanks(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

function mockProgressSortAndSlice(allTasksWithProgress, sortOrder, page, limit) {
  const sorted = [...allTasksWithProgress].sort((a, b) => {
    const pa = a.progress.completionPercentage;
    const pb = b.progress.completionPercentage;
    const diff = sortOrder === 'desc' ? pb - pa : pa - pb;
    if (diff !== 0) return diff;
    return compareRanks(a.sortRank, b.sortRank);
  });
  const skip = (page - 1) * limit;
  return sorted.slice(skip, skip + limit);
}

const mockTasks = [
  { _id: 't1', title: 'A', progress: { completionPercentage: 80 }, sortRank: 'a' },
  { _id: 't2', title: 'B', progress: { completionPercentage: 20 }, sortRank: 'b' },
  { _id: 't3', title: 'C', progress: { completionPercentage: 50 }, sortRank: 'c' },
  { _id: 't4', title: 'D', progress: { completionPercentage: 100 }, sortRank: 'd' },
  { _id: 't5', title: 'E', progress: { completionPercentage: 0 }, sortRank: 'e' },
  { _id: 't6', title: 'F', progress: { completionPercentage: 50 }, sortRank: 'f' },
];

let result;

result = mockProgressSortAndSlice(mockTasks, 'desc', 1, 3);
assertEqual(result.map(t => t.title).join(','), 'D,A,C', '第1页降序：100%,80%,50%');
assertEqual(result[2]._id, 't3', '同百分比50%时，sortRank小的c在前');

result = mockProgressSortAndSlice(mockTasks, 'desc', 2, 3);
assertEqual(result.map(t => t.title).join(','), 'F,B,E', '第2页降序：50%,20%,0%');
assertEqual(result[0]._id, 't6', '第2页50%的是F（sortRank f > c）');

result = mockProgressSortAndSlice(mockTasks, 'asc', 1, 4);
assertEqual(result.map(t => t._id).join(','), 't5,t2,t3,t6', '升序：0%,20%,50%(c),50%(f)');

// 边界：只有1页
result = mockProgressSortAndSlice(mockTasks, 'asc', 1, 100);
assertEqual(result.length, 6, 'limit>总数时返回全部');

// 空列表
result = mockProgressSortAndSlice([], 'asc', 1, 10);
assertEqual(result.length, 0, '空列表正常');

console.log('');

// ============================================================
// 测试3: 活动日志 - 字段变更检测逻辑
// ============================================================
console.log('【测试3】活动日志 - 字段变更检测');
console.log('------------------------------');

function detectChanges(oldTask, updateData) {
  const logs = [];
  const oldStatus = oldTask.status;
  const oldPriority = oldTask.priority;
  const oldDueDate = oldTask.dueDate;
  const oldAssignee = oldTask.assignee || null;
  const oldCollabs = [...(oldTask.collaborators || [])];
  const oldTags = [...(oldTask.tags || [])];
  const { status, reminder, tags, ...rest } = updateData;

  if (status !== undefined && status !== oldStatus) {
    if (status === 'completed') logs.push({ action: 'complete', from: oldStatus, to: status });
    else if (oldStatus === 'completed') logs.push({ action: 'uncomplete', from: oldStatus, to: status });
    else logs.push({ action: 'status_change', from: oldStatus, to: status });
  }

  if (tags !== undefined) {
    const newTags = Array.isArray(tags) ? tags : [];
    const added = newTags.filter(t => !oldTags.includes(t));
    const removed = oldTags.filter(t => !newTags.includes(t));
    if (added.length > 0) logs.push({ action: 'tags_add', added });
    if (removed.length > 0) logs.push({ action: 'tags_remove', removed });
  }

  if (rest.priority !== undefined && rest.priority !== oldPriority) {
    logs.push({ action: 'priority_change', from: oldPriority, to: rest.priority });
  }

  if (rest.dueDate !== undefined) {
    const newDue = rest.dueDate;
    if (newDue !== oldDueDate) {
      logs.push({ action: 'due_date_change', from: oldDueDate, to: newDue });
    }
  }

  if (rest.assignee !== undefined && rest.assignee !== oldAssignee) {
    logs.push({ action: 'assignee_change', from: oldAssignee, to: rest.assignee || null });
  }

  if (rest.collaborators !== undefined) {
    const newCollabs = Array.isArray(rest.collaborators) ? rest.collaborators : [];
    const added = newCollabs.filter(c => !oldCollabs.includes(c));
    const removed = oldCollabs.filter(c => !newCollabs.includes(c));
    if (added.length > 0) logs.push({ action: 'collaborators_add', added });
    if (removed.length > 0) logs.push({ action: 'collaborators_remove', removed });
  }

  return logs;
}

let logs;
logs = detectChanges({ status: 'pending', priority: 'medium' }, { status: 'completed' });
assertEqual(logs.length, 1, '只改状态→1条日志');
assertEqual(logs[0].action, 'complete', 'pending→completed → action=complete');
assertEqual(logs[0].from, 'pending', 'from=pending');

logs = detectChanges({ status: 'completed', priority: 'medium' }, { status: 'pending' });
assertEqual(logs[0].action, 'uncomplete', 'completed→pending → action=uncomplete');

logs = detectChanges({ status: 'pending', priority: 'medium' }, { status: 'in_progress' });
assertEqual(logs[0].action, 'status_change', 'pending→in_progress → status_change');

logs = detectChanges({ priority: 'low', tags: ['a', 'b'] }, { tags: ['b', 'c'] });
assertEqual(logs.find(l => l.action === 'tags_add')?.added.join(','), 'c', '加标签c');
assertEqual(logs.find(l => l.action === 'tags_remove')?.removed.join(','), 'a', '删标签a');

logs = detectChanges({ priority: 'medium' }, { priority: 'urgent' });
assertEqual(logs[0].action, 'priority_change', '改优先级');
assertEqual(logs[0].to, 'urgent', '目标urgent');

logs = detectChanges({ dueDate: '2024-06-01T00:00:00Z' }, { dueDate: '2024-06-30T00:00:00Z' });
assertEqual(logs[0].action, 'due_date_change', '改截止日期');

logs = detectChanges({ assignee: 'bob' }, { assignee: 'alice' });
assertEqual(logs[0].action, 'assignee_change', '改负责人');
assertEqual(logs[0].from, 'bob');
assertEqual(logs[0].to, 'alice');

logs = detectChanges({ assignee: 'bob' }, { assignee: null });
assertEqual(logs[0].to, null, '清空负责人→to=null');

logs = detectChanges({ collaborators: ['a', 'b'] }, { collaborators: ['b', 'c', 'd'] });
assertEqual(logs.find(l => l.action === 'collaborators_add')?.added.join(','), 'c,d', '加c,d');
assertEqual(logs.find(l => l.action === 'collaborators_remove')?.removed.join(','), 'a', '删a');

logs = detectChanges(
  { status: 'pending', priority: 'low', tags: ['x'], assignee: 'a', collaborators: ['1'] },
  { status: 'in_progress', priority: 'high', tags: ['y'], assignee: 'b', collaborators: ['2'], dueDate: 'now' }
);
assertEqual(logs.length, 8, '改6个字段→8条日志（tags加减各1、collabs加减各1、status/priority/assignee/dueDate各1）');

// 没改动
logs = detectChanges({ status: 'pending' }, { status: 'pending', priority: 'medium' });
assertEqual(logs.filter(l => l.action === 'status_change').length, 0, '状态没变→不记status_change');

console.log('');

// ============================================================
// 测试4: assignee / collaborator / participant 筛选构造
// ============================================================
console.log('【测试4】assignee/collaborator/participant 筛选构造');
console.log('------------------------------');

function buildListFilter(q) {
  const f = {};
  if (q.assignee) f.assignee = q.assignee;
  if (q.collaborator) f.collaborators = q.collaborator;
  if (q.participant) {
    f.$or = [
      { assignee: q.participant },
      { collaborators: q.participant },
    ];
  }
  if (q.search) {
    const s = [
      { title: { $regex: q.search, $options: 'i' } },
      { description: { $regex: q.search, $options: 'i' } },
    ];
    if (f.$or) {
      f.$and = [{ $or: f.$or }, { $or: s }];
      delete f.$or;
    } else {
      f.$or = s;
    }
  }
  return f;
}

let f;
f = buildListFilter({ assignee: 'alice' });
assertEqual(f.assignee, 'alice', 'assignee=alice 直接匹配');
assertEqual(f.collaborators, undefined, '无collaborator条件');

f = buildListFilter({ collaborator: 'bob' });
assertEqual(f.collaborators, 'bob', 'collaborator=bob 匹配');

f = buildListFilter({ participant: 'carol' });
assert(f.$or && f.$or.length === 2, 'participant 用 $or 匹配assignee或collaborators');
assertEqual(f.$or[0].assignee, 'carol', '条件1: assignee=carol');
assertEqual(f.$or[1].collaborators, 'carol', '条件2: collaborators=carol');

f = buildListFilter({ participant: 'carol', status: 'pending', search: '周报' });
assertEqual(f.status, undefined, '这个测试的buildListFilter没处理status(正常)');
assert(f.$and && f.$and.length === 2, 'participant + search → $and 两个 $or');

console.log('');

// ============================================================
// 测试5: 进度计算全量后代（多层嵌套）
// ============================================================
console.log('【测试5】进度计算 - 全量后代递归');
console.log('------------------------------');

function calculateAllFlat(subtasksFlat) {
  const total = subtasksFlat.length;
  const completed = subtasksFlat.filter(s => s.status === 'completed').length;
  return {
    totalSubtasks: total,
    completedSubtasks: completed,
    uncompletedSubtasks: total - completed,
    completionPercentage: total > 0 ? Math.round((completed / total) * 100) : 0,
  };
}

// 父P → s1(completed,有ss1,ss2) s2(pending) s3(completed,有ss3)
// s1下面: ss1(completed), ss2(pending)
// s3下面: ss3(completed)
// 全部后代: s1,ss1,ss2,s2,s3,ss3 → 6个
// 完成的: s1,ss1,s3,ss3 → 4个
const flatList = [
  { _id: 's1', status: 'completed', parent: 'P' },
  { _id: 'ss1', status: 'completed', parent: 's1' },
  { _id: 'ss2', status: 'pending', parent: 's1' },
  { _id: 's2', status: 'pending', parent: 'P' },
  { _id: 's3', status: 'completed', parent: 'P' },
  { _id: 'ss3', status: 'completed', parent: 's3' },
];

let prog = calculateAllFlat(flatList);
assertEqual(prog.totalSubtasks, 6, '全量6个后代');
assertEqual(prog.completedSubtasks, 4, '4个完成');
assertEqual(prog.uncompletedSubtasks, 2, '2个未完成');
assertEqual(prog.completionPercentage, 67, '完成率67%');

// 没有子任务
prog = calculateAllFlat([]);
assertEqual(prog.completionPercentage, 0, '无后代→0%');

console.log('');

// ============================================================
// 汇总
// ============================================================
console.log('====================================================');
console.log(`  测试完成: ${passed} 通过, ${failed} 失败`);
console.log('====================================================\n');

if (failed > 0) { process.exit(1); }
console.log('🎉 第四轮所有逻辑测试通过！\n');
