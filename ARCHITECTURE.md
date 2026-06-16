# 任务管理后端系统 - 架构设计说明

## 目录
1. [项目结构](#项目结构)
2. [核心功能实现原理](#核心功能实现原理)
3. [子任务与父任务完成状态联动](#1-子任务与父任务完成状态联动)
4. [重复任务生成机制](#2-重复任务生成机制)
5. [到期提醒触发机制](#3-到期提醒触发机制)
6. [多条件组合筛选查询优化](#4-多条件组合筛选查询优化)
7. [拖拽排序 - LexoRank 算法](#5-拖拽排序---lexorank-算法)
8. [API 接口文档](#api-接口文档)
9. [快速开始](#快速开始)

---

## 项目结构

```
.
├── src/
│   ├── app.js                 # 应用入口
│   ├── config/
│   │   └── database.js        # 数据库连接配置
│   ├── models/
│   │   ├── Task.js            # 任务数据模型
│   │   └── ReminderLog.js     # 提醒记录模型
│   ├── services/
│   │   ├── taskService.js     # 任务业务逻辑（核心）
│   │   ├── recurrenceService.js # 重复任务服务
│   │   └── reminderService.js # 提醒服务
│   ├── controllers/
│   │   └── taskController.js  # HTTP 控制器
│   ├── routes/
│   │   └── tasks.js           # 路由定义
│   ├── jobs/
│   │   └── scheduler.js       # 定时任务调度器
│   └── utils/
│       └── lexoRank.js        # LexoRank 排序算法
├── package.json
└── .env.example
```

---

## 核心功能实现原理

### 1. 子任务与父任务完成状态联动

#### 设计思路

采用**双向联动**策略：

**父任务 → 子任务（自上而下）**
- 当父任务标记为完成时，**递归完成所有子任务**
- 当父任务取消完成时，**递归取消所有子任务的完成状态**

**子任务 → 父任务（自下而上）**
- 当所有子任务都完成时，**父任务自动标记为完成**
- 当任一子任务未完成时，若父任务已完成则**回退为进行中**
- 逐层向上传递，直到根任务

#### 核心代码位置

- 主逻辑：[taskService.js](file:///d:/trae-bz/TraeProjects/8100/src/services/taskService.js)
  - `completeAllSubtasks()` - 递归完成所有子任务 (L168-L177)
  - `uncompleteAllSubtasks()` - 递归取消完成 (L179-L188)
  - `checkParentAutoComplete()` - 检查父任务是否自动完成 (L198-L223)
  - `updateParentSubtaskCount()` - 更新子任务计数 (L190-L196)

#### 数据模型设计

```javascript
// Task 模型中的关键字段
parentTask: ObjectId,       // 父任务ID，null表示根任务
subtaskCount: Number,       // 子任务总数（冗余字段，避免每次count查询）
completedSubtaskCount: Number, // 已完成子任务数
```

**为什么用冗余计数字段？**
- 避免每次判断都要 `countDocuments` 查询
- 列表页展示进度时直接读取，性能更好
- 写操作时顺带更新，写多读少场景下性价比高

#### 联动流程图

```
用户点击"完成"父任务
        ↓
父任务状态 → completed
        ↓
递归遍历所有子任务
  ├─ 子任务状态 → completed
  └─ 递归子子任务...
        ↓
更新父任务 completedSubtaskCount
        ↓
（向上传递）检查祖父任务是否全部完成
```

```
用户点击"完成"子任务
        ↓
子任务状态 → completed
        ↓
更新父任务 completedSubtaskCount + 1
        ↓
检查：completedSubtaskCount === subtaskCount?
        ├─ 是 → 父任务状态 → completed
        │       ↓
        │       递归向上检查
        └─ 否 → 若父任务为completed → 改为 in_progress
                ↓
                递归向上检查
```

---

### 2. 重复任务生成机制

#### 设计思路

采用**任务完成时生成下一次**的策略，而不是提前批量生成：

- **触发时机**：当重复任务被标记为完成时，立即生成下一次任务
- **兜底机制**：定时任务每小时扫描一次，处理漏网之鱼
- **原始任务追踪**：通过 `originalTaskId` 追踪同一系列的重复任务

#### 支持的重复模式

| 模式 | 说明 | 示例 |
|------|------|------|
| daily | 每隔N天 | 每3天 |
| weekly | 每周指定星期 | 每周一、三、五 |
| monthly | 每月同一天 | 每月15号 |
| yearly | 每年同一天 | 每年1月1日 |

#### 核心代码位置

- 主逻辑：[recurrenceService.js](file:///d:/trae-bz/TraeProjects/8100/src/services/recurrenceService.js)
  - `calculateNextDueDate()` - 计算下一次截止日期 (L5-L59)
  - `generateNextTask()` - 生成下一个任务 (L76-L118)
  - `processCompletedTasks()` - 批量处理已完成的重复任务 (L120-L141)

#### 重复任务数据结构

```javascript
recurrence: {
  enabled: Boolean,           // 是否启用重复
  pattern: String,            // 重复模式: daily/weekly/monthly/yearly
  interval: Number,           // 间隔数
  weekdays: Number[],         // 周重复时指定星期几 (0-6)
  endDate: Date,              // 结束日期（可选）
  occurrences: Number,        // 总次数（可选）
  completedOccurrences: Number, // 已完成次数
  originalTaskId: ObjectId,   // 原始任务ID，用于追踪同一系列
}
```

#### 生成策略对比

| 策略 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **完成时生成**（本项目采用） | 1. 只在需要时生成，节省存储<br>2. 可以继承上次任务的修改<br>3. 逻辑简单 | 1. 无法提前查看未来任务<br>2. 需要兜底扫描 | 大多数待办应用 |
| 提前批量生成 | 1. 可以在日历上看到所有任务<br>2. 可以单独修改未来某次 | 1. 占用大量存储空间<br>2. 修改原规则时要同步更新所有未来任务 | 日历类应用 |

#### 为什么选择"完成时生成"

1. **存储效率**：一个每天重复的任务，执行一年只产生365条记录，而提前生成一年就是365条，看似相同 —— 但如果用户中途取消了呢？提前生成的就全浪费了。
2. **灵活性**：用户修改了本次任务的标题/描述，下次生成时可以继承这些修改。
3. **简单性**：不需要处理"修改规则后如何处理已生成的未来任务"这类复杂问题。

---

### 3. 到期提醒触发机制

#### 设计思路

采用**定时扫描 + 状态标记**的方式：

- **扫描频率**：每5分钟扫描一次（可配置）
- **扫描范围**：查找 `reminder.enabled = true` 且 `reminder.reminded = false` 且 `remindAt <= now` 的任务
- **幂等保证**：发送后标记 `reminded = true`，并写入 `ReminderLog` 表，防止重复发送

#### 核心代码位置

- 主逻辑：[reminderService.js](file:///d:/trae-bz/TraeProjects/8100/src/services/reminderService.js)
  - `processDueReminders()` - 处理到期提醒 (L32-L74)
  - 定时调度：[scheduler.js](file:///d:/trae-bz/TraeProjects/8100/src/jobs/scheduler.js) (L14-L24)

#### 数据结构

```javascript
// Task 中的提醒字段
reminder: {
  enabled: Boolean,   // 是否启用提醒
  remindAt: Date,     // 提醒时间
  reminded: Boolean,  // 是否已提醒（防止重复）
}

// ReminderLog 表 - 提醒历史记录
{
  taskId: ObjectId,   // 任务ID
  remindAt: Date,     // 计划提醒时间
  sentAt: Date,       // 实际发送时间
  channel: String,    // 发送渠道: email/push/sms/system
  message: String,    // 提醒内容
}
```

#### 索引优化

```javascript
// 复合索引，快速查询需要发送的提醒
taskSchema.index({
  'reminder.enabled': 1,
  'reminder.remindAt': 1,
  'reminder.reminded': 1,
});
```

**为什么用复合索引而不是单索引？**
- 查询条件是三个字段的组合：`enabled=true AND reminded=false AND remindAt<=now`
- 复合索引可以直接定位到需要发送的提醒，无需回表过滤
- 索引顺序：低基数字段在前（enabled、reminded 都是布尔值），时间范围在后

#### 提醒的几种触发时机

```
┌─────────────────────────────────────────────────────┐
│  方式 1: 定时扫描（主要）                            │
│  Cron: */5 * * * * （每5分钟）                       │
│  扫描所有到期且未发送的提醒                           │
│  优点: 可靠、容错性强                                │
│  缺点: 有最多5分钟延迟                               │
├─────────────────────────────────────────────────────┤
│  方式 2: 任务更新时即时检查（补充）                    │
│  用户设置提醒时间 → 如果时间已过 → 立即发送            │
│  优点: 即时性好                                      │
│  缺点: 只覆盖主动操作的场景                          │
├─────────────────────────────────────────────────────┤
│  方式 3: 每日早间摘要（增强体验）                     │
│  Cron: 0 8 * * * （每天早上8点）                    │
│  发送"今日待办"汇总                                  │
│  优点: 用户体验好，一目了然                          │
│  缺点: 不是实时提醒                                  │
└─────────────────────────────────────────────────────┘
```

---

### 4. 多条件组合筛选查询优化

#### 设计思路

采用 **MongoDB 复合索引 + 聚合管道** 的方式实现高效的多条件筛选。

#### 支持的筛选维度

| 维度 | 说明 |
|------|------|
| 状态 | pending / in_progress / completed / cancelled |
| 优先级 | low / medium / high / urgent |
| 标签 | 支持多标签 AND 匹配 |
| 截止日期 | 范围查询（起止日期） |
| 搜索 | 标题/描述模糊搜索 |
| 父任务 | 按父任务筛选（查看某任务的子任务） |

#### 支持的排序方式

| 排序字段 | 说明 |
|----------|------|
| sortRank | 自定义排序（默认） |
| dueDate | 截止日期 |
| priority | 优先级 |
| createdAt | 创建时间 |
| completedAt | 完成时间 |

#### 核心代码位置

- 主逻辑：[taskService.js](file:///d:/trae-bz/TraeProjects/8100/src/services/taskService.js)
  - `getTasks()` - 多条件查询 (L71-L123)

#### 索引设计

```javascript
// 1. 基础查询索引 - 按状态+截止日期查询
taskSchema.index({ userId: 1, status: 1, dueDate: 1 });

// 2. 优先级查询索引
taskSchema.index({ userId: 1, priority: 1 });

// 3. 自定义排序索引
taskSchema.index({ parentTask: 1, sortRank: 1 });

// 4. 标签索引（多值索引）
taskSchema.index({ tags: 1 });

// 5. 提醒查询索引
taskSchema.index({ 'reminder.enabled': 1, 'reminder.remindAt': 1, 'reminder.reminded': 1 });
```

#### 索引设计原则

1. **等值字段在前，范围字段在后**
   - `{ userId: 1, status: 1, dueDate: 1 }`
   - userId 和 status 是等值匹配，dueDate 是范围匹配

2. **排序字段尽量包含在索引中**
   - 这样可以利用索引的有序性，避免内存排序

3. **覆盖索引优先**
   - 如果查询的字段都在索引中，就不需要回表读取文档

#### 查询示例分析

```javascript
// 查询：用户A的所有高优先级、未完成、带"工作"标签、本周截止的任务
db.tasks.find({
  userId: 'A',
  status: 'pending',
  priority: 'high',
  tags: { $all: ['工作'] },
  dueDate: { $gte: startOfWeek, $lte: endOfWeek }
}).sort({ dueDate: 1 })
```

**执行过程：**
1. 先用 `{ userId, status, dueDate }` 索引定位到候选集
2. 再用内存过滤 `priority` 和 `tags` 条件
3. 由于 dueDate 在索引中，排序可以直接利用索引顺序

**为什么不建更多的组合索引？**
- 索引不是越多越好，每个索引都会增加写入开销
- 5个维度的全组合需要 2^5 = 32 个索引，不现实
- 策略是：**核心查询用专门索引，其他查询用基础索引 + 内存过滤**

#### 标签查询的特殊处理

```javascript
// 查询同时包含多个标签的任务
filter.tags = { $all: ['工作', '紧急', '项目A'] };
```

- `$all` 操作符：数组字段必须包含所有指定元素
- 利用单字段多值索引 `{ tags: 1 }`
- MongoDB 会用索引找到包含第一个标签的文档，再逐一检查其他标签

---

### 5. 拖拽排序 - LexoRank 算法

#### 为什么不用整数排序字段？

**传统方案的问题：**
```
任务A: sort = 1
任务B: sort = 2
任务C: sort = 3
任务D: sort = 4

把 D 拖到 A 和 B 之间：
任务A: sort = 1  （不变）
任务D: sort = 2  （更新）
任务B: sort = 3  （更新）← 也要改！
任务C: sort = 4  （更新）← 也要改！

插入一个，后面全部要 +1 → O(n) 次更新
```

#### LexoRank 核心思想

用**字符串**代替整数作为排序值，利用字符串的字典序：

```
任务A: "i0000000"
任务B: "i0000001"  
任务C: "i0000002"

把任务 X 插到 A 和 B 之间：
新排名 = rankBetween("i0000000", "i0000001") 
       = "i0000000.5"  ← 用小数的思路，但用字符串实现

结果：
任务A: "i0000000"  （不变）
任务X: "i0000000u" ← 新增，只改这一个！
任务B: "i0000001"  （不变）
任务C: "i0000002"  （不变）

只需要更新1条记录 → O(1) 次更新
```

#### 核心代码位置

- 算法实现：[lexoRank.js](file:///d:/trae-bz/TraeProjects/8100/src/utils/lexoRank.js)
- 业务集成：[taskService.js](file:///d:/trae-bz/TraeProjects/8100/src/services/taskService.js)
  - `moveTask()` - 拖拽移动任务 (L244-L296)

#### 算法细节

**1. 基础 36 进制**
- 使用 0-9 + a-z 共 36 个字符
- 相当于 36 进制的数字
- 字符越多，可插入的"间隙"越多

**2. 排名格式**
```
{bucket}|{rank_string}

例如：0|i0000000
     ↑  ↑
     │  └─ 8位36进制字符串
     └──── 桶编号（0/1/2）
```

**3. 桶（Bucket）的作用**
- 3个桶：0、1、2
- 大量插入时可以整批数据移到另一个桶
- 相当于给整体排序"重新编号"的缓冲

**4. 插入算法**
```
插入到 prev 和 next 之间：
1. 取 prev 和 next 的排名字符串
2. 按位比较，找到第一个不同的位置
3. 取两个字符的中间值
4. 如果相邻，就在后面追加字符

示例：
prev = "abc"
next = "abd"
     → "abcn" （在 c 和 d 之间，追加 n）

prev = "a"
next = "b"
     → "n" （a 和 b 的中间）
```

**5. 重平衡（Rebalance）**
- 当排名字符串变得太长时（比如超过20个字符）
- 重新给所有任务分配均匀的排名
- 这是一个 O(n) 操作，但很少发生

#### LexoRank 的优势

| 特性 | 整数排序 | LexoRank |
|------|----------|----------|
| 插入复杂度 | O(n) | O(1)（平均） |
| 存储大小 | 4/8字节 | ~10-20字节 |
| 并发友好 | 差（容易冲突） | 好（碰撞概率极低） |
| 实现复杂度 | 简单 | 中等 |
| 适用场景 | 数据量小 | 数据量大、拖拽频繁 |

#### 为什么选择 LexoRank 而不是其他方案？

| 方案 | 优点 | 缺点 |
|------|------|------|
| **LexoRank**（本项目采用） | 1. O(1) 插入<br>2. 并发友好<br>3. Jira 等大厂在用 | 1. 实现稍复杂<br>2. 需要重平衡 |
| 整数排序 | 简单直观 | 1. 插入需要更新大批记录<br>2. 并发写入容易冲突 |
| 双链表 | 插入O(1) | 1. 范围查询需要遍历<br>2. 分页困难 |
| 分数排序（1, 2, 3...） | 简单 | 插入成本高 |

---

## API 接口文档

### 基础信息
- Base URL: `http://localhost:3000/api/tasks`
- 用户标识: 通过请求头 `x-user-id` 传递（默认 `default`）

### 任务 CRUD

#### 创建任务
```
POST /api/tasks
Content-Type: application/json

{
  "title": "完成项目设计文档",
  "description": "详细设计后端架构",
  "priority": "high",
  "dueDate": "2024-12-31T23:59:59.000Z",
  "tags": ["工作", "项目A"],
  "parentTask": null,
  "reminder": {
    "enabled": true,
    "remindAt": "2024-12-30T09:00:00.000Z"
  },
  "recurrence": {
    "enabled": false
  }
}
```

#### 获取任务列表
```
GET /api/tasks?status=pending&priority=high&tags=工作,紧急&sortBy=dueDate&sortOrder=asc

参数说明：
- status: pending / in_progress / completed / cancelled
- priority: low / medium / high / urgent
- tags: 标签，多个用逗号分隔（AND 关系）
- dueDateFrom: 截止日期起始
- dueDateTo: 截止日期结束
- search: 搜索关键词
- sortBy: sortRank / dueDate / priority / createdAt
- sortOrder: asc / desc
- page: 页码（默认1）
- limit: 每页数量（默认50）
- parentTask: 父任务ID（null 表示根任务）
```

#### 获取单个任务（含子任务）
```
GET /api/tasks/:id?depth=3
```

#### 更新任务
```
PUT /api/tasks/:id
```

#### 删除任务
```
DELETE /api/tasks/:id
（会递归删除所有子任务）
```

### 子任务操作

#### 创建子任务
```
POST /api/tasks
{
  "title": "子任务标题",
  "parentTask": "父任务ID"
}
```

#### 移动任务（拖拽排序）
```
POST /api/tasks/:id/move
{
  "prevTaskId": "前一个任务ID（可以为null）",
  "nextTaskId": "后一个任务ID（可以为null）"
}
```

### 状态切换

#### 标记完成
```
POST /api/tasks/:id/complete
（如果是重复任务，会自动生成下一次）
```

### 提醒相关

#### 设置提醒
```
POST /api/tasks/:id/reminder
{
  "remindAt": "2024-12-31T09:00:00.000Z"
}
```

#### 取消提醒
```
DELETE /api/tasks/:id/reminder
```

#### 查看提醒历史
```
GET /api/tasks/:id/reminders
```

### 其他

#### 获取所有标签及使用次数
```
GET /api/tasks/tags
```

#### 获取今日任务
```
GET /api/tasks/today
```

#### 获取逾期任务
```
GET /api/tasks/overdue
```

#### 获取统计数据
```
GET /api/tasks/stats
返回：总任务数、已完成、待处理、逾期数、今日数、完成率
```

#### 重复任务预览
```
POST /api/tasks/recurrence/preview
{
  "dueDate": "2024-01-01T10:00:00.000Z",
  "recurrence": {
    "enabled": true,
    "pattern": "weekly",
    "interval": 1,
    "weekdays": [1, 3, 5]
  }
}
返回接下来5次的日期
```

---

## 快速开始

### 前置要求
- Node.js >= 16
- MongoDB >= 4.4

### 安装与运行

```bash
# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，设置 MongoDB 连接地址

# 3. 启动服务
npm run dev
```

### 验证服务

```bash
# 健康检查
curl http://localhost:3000/health

# 创建任务
curl -X POST http://localhost:3000/api/tasks \
  -H "Content-Type: application/json" \
  -d '{"title":"测试任务","priority":"high"}'

# 获取任务列表
curl http://localhost:3000/api/tasks
```

### 环境变量说明

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 3000 | 服务端口 |
| MONGODB_URI | mongodb://localhost:27017/taskmanager | MongoDB 连接地址 |
| NODE_ENV | development | 运行环境 |
| REMINDER_CRON | 0 * * * * | 提醒扫描 cron 表达式 |
| ENABLE_SCHEDULER | true | 是否启用定时任务 |

---

## 总结

本项目实现了一个功能完整的任务管理后端，核心亮点：

1. **父子任务双向联动** - 自上而下递归完成，自下而上自动检查
2. **LexoRank 拖拽排序** - O(1) 插入复杂度，支持无限次插入
3. **智能重复任务** - 完成时生成，支持多种重复模式
4. **可靠提醒机制** - 定时扫描 + 状态标记，保证不重复不遗漏
5. **多条件高效筛选** - 精心设计的复合索引，平衡查询性能和写入开销

每个设计决策都考虑了实际使用场景和性能权衡，适合作为生产环境的基础架构。
