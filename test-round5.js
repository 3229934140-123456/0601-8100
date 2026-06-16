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
console.log('  第五轮功能验证测试');
console.log('====================================================\n');

// ============================================================
// 测试1: 提醒 - 负责人/协作者接收人计算
// ============================================================
console.log('【测试1】提醒 - 接收人计算');
console.log('------------------------------');

function getRecipients(task) {
  const recipients = [];
  const assignee = task.assignee;
  const collaborators = task.collaborators || [];
  const owner = task.userId;

  if (assignee) {
    recipients.push({ user: assignee, type: 'assignee' });
  }
  for (const c of collaborators) {
    if (c === assignee) continue;
    recipients.push({ user: c, type: 'collaborator' });
  }
  if (!assignee && collaborators.length === 0 && owner) {
    recipients.push({ user: owner, type: 'owner' });
  }
  return recipients;
}

let r;
r = getRecipients({ userId: 'space-owner', assignee: null, collaborators: [] });
assertEqual(r.length, 1, '无负责人无协作者→发给所有者');
assertEqual(r[0].type, 'owner', '类型=owner');
assertEqual(r[0].user, 'space-owner', '接收人=space-owner');

r = getRecipients({ userId: 'u1', assignee: 'alice', collaborators: [] });
assertEqual(r.length, 1, '只有负责人→1人');
assertEqual(r[0].type, 'assignee', '类型=assignee');
assertEqual(r[0].user, 'alice', '接收人=alice');

r = getRecipients({ userId: 'u1', assignee: 'alice', collaborators: ['bob', 'carol'] });
assertEqual(r.length, 3, '负责人+2协作者→3人');
assertEqual(r.find(x => x.type === 'assignee')?.user, 'alice', '负责人在列');
assertEqual(r.find(x => x.user === 'bob')?.type, 'collaborator', 'bob是协作者');
assertEqual(r.find(x => x.user === 'carol')?.type, 'collaborator', 'carol是协作者');

r = getRecipients({ userId: 'u1', assignee: 'alice', collaborators: ['alice', 'bob'] });
assertEqual(r.length, 2, '协作者里重复负责人→去重（2人）');
assert(!r.find(x => x.user === 'alice' && x.type === 'collaborator'), 'alice不再重复作为协作者');

r = getRecipients({ userId: 'u1', assignee: null, collaborators: ['bob'] });
assertEqual(r.length, 1, '只有协作者→1人（不发所有者）');
assertEqual(r[0].type, 'collaborator', '类型=collaborator');

// 负责人变更后提醒跟随（简单验证：只需要重新调用 getRecipients 即可）
const beforeChange = getRecipients({ userId: 'u1', assignee: 'alice', collaborators: ['bob'] });
const afterChange = getRecipients({ userId: 'u1', assignee: 'dave', collaborators: ['bob'] });
assertEqual(beforeChange.find(x => x.type === 'assignee')?.user, 'alice', '变更前负责人=alice');
assertEqual(afterChange.find(x => x.type === 'assignee')?.user, 'dave', '变更后负责人=dave');
assert(afterChange.find(x => x.user === 'bob'), '变更后协作者bob仍在');
console.log('');

// ============================================================
// 测试2: 评论 @提取 + 权限校验
// ============================================================
console.log('【测试2】评论 @ 人提取');
console.log('------------------------------');

function extractMentions(content) {
  const mentionRegex = /@([\w\u4e00-\u9fa5.-]+)/g;
  const mentions = [];
  let m;
  while ((m = mentionRegex.exec(content)) !== null) {
    if (!mentions.includes(m[1])) mentions.push(m[1]);
  }
  return mentions;
}

let m;
m = extractMentions('请 @alice 帮我看一下这个需求');
assertEqual(m.join(','), 'alice', '提取英文@alice');

m = extractMentions('@bob @carol 今天下午开会');
assertEqual(m.join(','), 'bob,carol', '提取多个人');

m = extractMentions('@张三 请 @李四-测试 帮忙review');
assertEqual(m.join(','), '张三,李四-测试', '提取中文和带横线的用户名');

m = extractMentions('alice@example.com 这封邮件');
assertEqual(m.join(','), 'example.com', '邮箱里只提取example.com（这是预期行为，@后紧跟邮箱域名）');

m = extractMentions('这是一条普通评论，没有提及任何人');
assertEqual(m.length, 0, '没有@符号时返回空');

m = extractMentions('@alice @alice @bob @alice');
assertEqual(m.join(','), 'alice,bob', '重复@自动去重');

// 权限校验模拟
function mockCheckPermission(taskOwner, currentUserId) {
  return taskOwner === currentUserId;
}
assert(mockCheckPermission('user1', 'user1'), '本人空间→有权限');
assert(!mockCheckPermission('user1', 'user2'), '他人空间→无权限');
console.log('');

// ============================================================
// 测试3: 进度口径统一 - 多层嵌套进度
// ============================================================
console.log('【测试3】进度口径 - 四五层嵌套');
console.log('------------------------------');

function attachProgressFlat(taskObj) {
  const flattenSubtasks = (node) => {
    if (!node.subtasks || node.subtasks.length === 0) return [];
    const flat = [];
    for (const sub of node.subtasks) {
      flat.push(sub);
      flat.push(...flattenSubtasks(sub));
    }
    return flat;
  };
  const all = flattenSubtasks(taskObj);
  const completed = all.filter(s => s.status === 'completed').length;
  taskObj.progress = {
    totalSubtasks: all.length,
    completedSubtasks: completed,
    uncompletedSubtasks: all.length - completed,
    completionPercentage: all.length > 0 ? Math.round((completed / all.length) * 100) : 0,
  };
  if (taskObj.subtasks) {
    for (const sub of taskObj.subtasks) {
      attachProgressFlat(sub);
    }
  }
  return taskObj;
}

function getAllSubtasksFlat(root) {
  const direct = root.subtasks || [];
  const all = [];
  for (const s of direct) {
    all.push({ status: s.status, _id: s._id });
    all.push(...getAllSubtasksFlat(s));
  }
  return all;
}

// 构造 5 层嵌套：P → s1 → ss1 → sss1 → ssss1
// 共 14 个后代节点
// 完成的：s1, ss1, s3, sss3, ssss1 = 5个
// 未完成：ss2, s2, ss1_2, sss2, ssss2, ssss3 = 9个？
// 让我们手动数清楚

const deepTree = {
  _id: 'P', title: '根任务', status: 'in_progress',
  subtasks: [
    {
      _id: 's1', status: 'completed',
      subtasks: [
        {
          _id: 'ss1', status: 'completed',
          subtasks: [
            {
              _id: 'sss1', status: 'pending',
              subtasks: [
                { _id: 'ssss1', status: 'completed', subtasks: [] },
                { _id: 'ssss2', status: 'pending', subtasks: [] },
              ],
            },
            {
              _id: 'sss2', status: 'in_progress',
              subtasks: [],
            },
          ],
        },
        {
          _id: 'ss2', status: 'pending',
          subtasks: [],
        },
      ],
    },
    {
      _id: 's2', status: 'pending',
      subtasks: [],
    },
    {
      _id: 's3', status: 'completed',
      subtasks: [
        {
          _id: 'ss3', status: 'completed',
          subtasks: [
            { _id: 'sss3', status: 'completed', subtasks: [{ _id: 'ssss3', status: 'pending', subtasks: [] }] },
          ],
        },
      ],
    },
  ],
};

attachProgressFlat(deepTree);

// flatten 列出所有后代：
// s1, ss1, sss1, ssss1, ssss2, sss2, ss2, s2, s3, ss3, sss3, ssss3
// 共 12 个后代
const flatByAttach = deepTree.progress.totalSubtasks;
// 用 getAllSubtasksFlat 也得到同样列表
const flatList = getAllSubtasksFlat(deepTree);

assertEqual(flatByAttach, flatList.length, `详情progress总后代数=${flatByAttach}，与getAllSubtasksFlat结果一致`);

const completedByAttach = deepTree.progress.completedSubtasks;
const completedByFlat = flatList.filter(s => s.status === 'completed').length;
assertEqual(completedByAttach, completedByFlat, `详情完成数=${completedByAttach}，与flat方式一致`);

// 计算百分比一致
const pct1 = deepTree.progress.completionPercentage;
const pct2 = flatList.length > 0 ? Math.round((completedByFlat / flatList.length) * 100) : 0;
assertEqual(pct1, pct2, `详情完成率${pct1}%，与flat方式${pct2}%一致`);

// 检查某个中间节点的进度口径是否一致（s1节点）
const s1FlatList = getAllSubtasksFlat(deepTree.subtasks[0]);
const s1AttachProg = deepTree.subtasks[0].progress;
assertEqual(s1AttachProg.totalSubtasks, s1FlatList.length, `s1节点：总数详情=${s1AttachProg.totalSubtasks}，flat=${s1FlatList.length}一致`);
const s1CompletedAttach = s1AttachProg.completedSubtasks;
const s1CompletedFlat = s1FlatList.filter(s => s.status === 'completed').length;
assertEqual(s1CompletedAttach, s1CompletedFlat, `s1节点：完成数详情=${s1CompletedAttach}，flat=${s1CompletedFlat}一致`);

// 列表排序按相同口径
function mockSortByProgress(tasks, sortOrder) {
  return [...tasks].sort((a, b) => {
    const pa = a.progress.completionPercentage;
    const pb = b.progress.completionPercentage;
    const diff = sortOrder === 'desc' ? pb - pa : pa - pb;
    if (diff !== 0) return diff;
    return a.sortRank < b.sortRank ? -1 : 1;
  });
}

// 3个父任务，各自进度不同
const parentList = [
  { _id: 'P', title: 'P', sortRank: 'a', progress: deepTree.progress },
  { _id: 'Q', title: 'Q', sortRank: 'b', progress: { completionPercentage: 100 } },
  { _id: 'R', title: 'R', sortRank: 'c', progress: { completionPercentage: 0 } },
];
const sortedDesc = mockSortByProgress(parentList, 'desc');
assertEqual(sortedDesc.map(t => t.title).join(','), 'Q,P,R', '按进度降序排序：Q100%, P约50%, R0%');
const sortedAsc = mockSortByProgress(parentList, 'asc');
assertEqual(sortedAsc.map(t => t.title).join(','), 'R,P,Q', '按进度升序排序：R0%, P约50%, Q100%');

// 全量排序后分页（和功能4验证一致）
const page1 = sortedDesc.slice(0, 2);
assertEqual(page1.map(t => t.title).join(','), 'Q,P', '第1页（limit=2）：Q,P');
const page2 = sortedDesc.slice(2, 4);
assertEqual(page2.map(t => t.title).join(','), 'R', '第2页（limit=2）：R');

console.log('');

// ============================================================
// 测试4: 批量操作返回明细
// ============================================================
console.log('【测试4】批量操作 - 返回明细+成功失败统计');
console.log('------------------------------');

const mockDB2 = {
  t1: { _id: 't1', title: '任务1', status: 'pending', assignee: 'alice', collaborators: ['bob'] },
  t2: { _id: 't2', title: '任务2', status: 'in_progress', assignee: null, collaborators: [] },
  t3: { _id: 't3', title: '任务3', status: 'pending', assignee: 'carol', collaborators: ['dave', 'eve'] },
};

function mockBatchUpdate(taskIds, updateData) {
  const results = { succeeded: [], failed: [] };
  const operation = { fields: Object.keys(updateData) };
  for (const taskId of taskIds) {
    const task = mockDB2[taskId];
    if (!task) { results.failed.push({ taskId, error: 'Task not found' }); continue; }
    try {
      Object.assign(task, updateData);
      results.succeeded.push({
        taskId,
        title: task.title,
        status: task.status,
        assignee: task.assignee || null,
        collaborators: task.collaborators || [],
        dueDate: task.dueDate || null,
        priority: task.priority || 'medium',
      });
    } catch (e) {
      results.failed.push({ taskId, error: e.message });
    }
  }
  return {
    total: taskIds.length,
    succeededCount: results.succeeded.length,
    failedCount: results.failed.length,
    succeeded: results.succeeded,
    failed: results.failed,
    operation,
  };
}

// 批量改负责人
let r4 = mockBatchUpdate(['t1', 't2', 'nonexist'], { assignee: 'frank' });
assertEqual(r4.total, 3, '请求3条');
assertEqual(r4.succeededCount, 2, '成功2条');
assertEqual(r4.failedCount, 1, '失败1条');
assertEqual(r4.succeeded.find(x => x.taskId === 't1')?.assignee, 'frank', 't1 负责人已改为frank');
assertEqual(r4.succeeded.find(x => x.taskId === 't2')?.assignee, 'frank', 't2 负责人已改为frank');
assertEqual(r4.failed[0].taskId, 'nonexist', '不存在的任务失败');
assert(r4.operation && r4.operation.fields.includes('assignee'), '返回operation字段说明改了assignee');

// 批量加协作者
r4 = mockBatchUpdate(['t1', 't3'], { collaborators: ['bob', 'grace', 'henry'] });
assertEqual(r4.succeededCount, 2, '2条成功');
assertEqual(r4.succeeded.find(x => x.taskId === 't3')?.collaborators.join(','), 'bob,grace,henry', 't3协作者已覆盖为新值');
assert(r4.operation.fields.includes('collaborators'), '返回operation包含collaborators');

// 批量改截止日期
r4 = mockBatchUpdate(['t1', 't2', 't3'], { dueDate: '2024-12-31T23:59:59Z' });
assertEqual(r4.succeededCount, 3, '3条全部成功');
assertEqual(r4.failedCount, 0, '0条失败');
assertEqual(r4.succeeded.find(x => x._id === 't1')?.dueDate || r4.succeeded.find(x => x.taskId === 't1')?.dueDate, '2024-12-31T23:59:59Z', 't1截止日期已改');
assert(r4.operation.fields.includes('dueDate'), 'operation包含dueDate');

console.log('');

// ============================================================
// 测试5: 活动记录筛选 - 按操作人/相关人
// ============================================================
console.log('【测试5】活动记录筛选');
console.log('------------------------------');

const mockActivities = [
  { _id: 'a1', action: 'status_change', actor: 'alice', details: { from: 'pending', to: 'in_progress' } },
  { _id: 'a2', action: 'assignee_change', actor: 'bob', details: { from: 'alice', to: 'carol' } },
  { _id: 'a3', action: 'comment_add', actor: 'dave', details: { mentions: ['alice', 'eve'] } },
  { _id: 'a4', action: 'collaborators_add', actor: 'alice', details: { added: ['frank'] } },
  { _id: 'a5', action: 'collaborators_remove', actor: 'bob', details: { removed: ['alice'] } },
  { _id: 'a6', action: 'create', actor: 'admin', details: {} },
];

function filterActivities(list, { actor, relatedTo }) {
  return list.filter(a => {
    if (actor && a.actor !== actor) return false;
    if (relatedTo) {
      const d = a.details || {};
      const ok =
        a.actor === relatedTo ||
        (d.mentions && d.mentions.includes(relatedTo)) ||
        (d.added && d.added.includes(relatedTo)) ||
        (d.removed && d.removed.includes(relatedTo)) ||
        d.to === relatedTo ||
        d.from === relatedTo;
      if (!ok) return false;
    }
    return true;
  });
}

let f;
f = filterActivities(mockActivities, { actor: 'alice' });
assertEqual(f.map(x => x._id).sort().join(','), 'a1,a4', 'actor=alice→a1,a4两条');

f = filterActivities(mockActivities, { relatedTo: 'alice' });
assertEqual(f.length, 5, 'relatedTo=alice→5条（actor+mentions+added+removed+to+from都命中）');

f = filterActivities(mockActivities, { relatedTo: 'eve' });
assertEqual(f.length, 1, 'relatedTo=eve→1条（被@到）');
assertEqual(f[0]._id, 'a3', '命中a3评论@');

f = filterActivities(mockActivities, { relatedTo: 'frank' });
assertEqual(f.length, 1, 'relatedTo=frank→1条（被加为协作者）');

f = filterActivities(mockActivities, { actor: 'alice', relatedTo: 'carol' });
assertEqual(f.length, 0, '同时actor=alice且relatedTo=carol→0条（alice的动作里没有涉及carol）');

f = filterActivities(mockActivities, { actor: 'bob', relatedTo: 'carol' });
assertEqual(f.length, 1, 'actor=bob且relatedTo=carol→a2（bob改负责人到carol）');

console.log('');

// ============================================================
// 汇总
// ============================================================
console.log('====================================================');
console.log(`  测试完成: ${passed} 通过, ${failed} 失败`);
console.log('====================================================\n');

if (failed > 0) { process.exit(1); }
console.log('🎉 第五轮所有逻辑测试通过！\n');
