---
title: MySQL 学习笔记
description: 核心概念、常用写法与易错点
date: 2026-09-02 00:00
category: 学习笔记
tags:
  - 后端
  - MySQL
  - SQL
  - 学习笔记
aside: true
comment: false
---

# MySQL 学习笔记

相关笔记：[基础知识](../backend/basic-knowledge-notes.md) · [MySQL](mysql-learning-notes.md) · [Go](../go/go-learning-notes.md)

[返回笔记导航](../go/go-backend-basics.md)

## 复习导航

| 我想复习什么？ | 去哪里看？ | 所属模块 |
| --- | --- | --- |
| 怎么连接 MySQL、选库、建表和查看结构？ | [MySQL 操作](#mysql-client)、[表结构](#table-structure) | M1-C1～C2 |
| 怎么过滤、排序、分页、统计？ | [SELECT 查询](#sql-select)、[聚合统计](#sql-aggregate) | M1-C1 |
| 怎么安全增删改？外键怎么写？ | [数据写入](#sql-write)、[表关系](#table-relations) | M1-C2 |
| 怎么查询用户及其订单？ | [INNER JOIN 与 LEFT JOIN](#sql-join) | M1-C2 |
| cms-api 的 SQL 放在哪？ | [项目对照](#cms-api) | 提前认识，M3 深入 |

**使用边界：**建库、建表、增删改示例仅供本地练习库备查，不要重复执行或在公司数据库上练习；未学的事务和索引原理暂不展开。

<a id="sql"></a>

## 1. 数据库与 SQL

复习顺序：**概念 → 连接选库 → 建表 → 查询 → 写入 → 表关系**。使用 MySQL 写法，字段以本章表定义为准。

### 1.1 数据库、表、主键与 NULL

MySQL 是数据库管理系统（DBMS），不是某一张表；其他 DBMS 还有 PostgreSQL、SQLite 等。

```text
一个 MySQL 实例（运行中的数据库服务）
└── 多个数据库
    └── 多张表
        ├── 列：属性，如 name、age
        └── 行：一条记录，如某位用户的数据
```

行列交叉处是单元格。后端发送 SQL，由 MySQL 读写表数据、返回结果；SQL 不是 Go 语法。

**主键**标识一行，必须唯一且非 NULL，还应尽量稳定。姓名会重复或变化，不适合作主键。

| 值 | 含义 |
| --- | --- |
| `0` / `false` | 已知数值为零 / 布尔值为假 |
| `''` | 已知字符串为空 |
| `NULL` | 缺失、未知或不适用 |

`NULL` 不等于零或空字符串。用 `IS NULL`、`IS NOT NULL` 判断，不能用 `= NULL`。

<a id="mysql-client"></a>

### 1.2 连接 MySQL、选库与看结果

#### 客户端与服务

命令行 `mysql`、DBX、TablePlus 都是客户端，连接的是 MySQL 服务。更换客户端不需要重新建库或搬数据。

- 同机连接用 `127.0.0.1`；端口由服务监听配置决定，MySQL 通常为 3306。客户端填端口不会启动服务。
- 连接名称只是标签，不是数据库名；层级是“连接 → 数据库 → 表”，显示数量可能受权限与过滤影响。
- API 域名不等于数据库地址；公司配置须确认数据库类型、环境、主机、端口、账号、库名和 TLS/隧道要求。
- 图形界面适合浏览结构、少量数据、筛选和联调核对；SQL 编辑器适合 JOIN、统计和可复用查询；命令行适合终端排查与脚本。
- 表格编辑保存可能真正修改数据。公司数据写入仍需审批，不能绕过业务校验；教学写入只用本地练习库。

#### 命令行连接与结果

在终端连接本地 MySQL：

```bash
mysql -h 127.0.0.1 -P 3306 -u root
```

`mysql` 是客户端；`-h` 主机、`-P`（大写）端口、`-u` 数据库用户。增加 `-e "SELECT VERSION();"` 可查询版本后退出。

进入 `mysql>` 后输入 SQL，不是 Shell 命令：

```sql
USE backend_learning_m1_20260904;
SELECT DATABASE();
```

`USE` 选默认数据库；`SELECT DATABASE()` 查看当前选择，未选库时返回 `NULL`。

| 输出 | 怎么理解 |
| --- | --- |
| `mysql>` / `->` | 等待新语句 / 当前语句未结束，等待后续输入 |
| `Query OK` | 该语句执行成功 |
| `0 rows affected` | 建空表时正常，不代表建表失败 |
| `Rows matched` / `Changed` | UPDATE 匹配行数 / 实际改变行数 |
| `Empty set` | 查询未返回任何行，不是语法错误 |
| `ERROR 4031` | 连接闲置超时；若自动重连成功，先重新确认当前数据库 |

`information_schema` 保存表结构等元数据，不是业务数据。只读示例：

```sql
SELECT TABLE_NAME, TABLE_TYPE
FROM information_schema.tables
WHERE TABLE_SCHEMA = 'information_schema'
ORDER BY TABLE_NAME ASC
LIMIT 5;
```

<a id="table-structure"></a>

### 1.3 创建数据库和表

以下是已有环境的定义备查，不要重复建库、建表。

```sql
CREATE DATABASE backend_learning_m1_20260904
CHARACTER SET utf8mb4;
```

建库不会自动切换，仍需 `USE`。字符集 `utf8mb4` 支持中文、Emoji 等。

```sql
CREATE TABLE users (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    age INT NULL,
    city VARCHAR(100) NOT NULL
);
```

列定义的结构是“列名 + 数据类型 + 约束或属性”：

| 写法 | 含义 |
| --- | --- |
| `INT` / `BIGINT` | 整数 / 范围更大的整数 |
| `VARCHAR(100)` | 可变长度字符串，最多 100 个字符 |
| `DECIMAL(10, 2)` | 精确小数：总共最多 10 位，其中小数 2 位、整数最多 8 位 |
| `AUTO_INCREMENT` | 自动生成递增编号，不应假设编号连续无缺口 |
| `PRIMARY KEY` | 主键：唯一且非 NULL |
| `NOT NULL` / `NULL` | 不允许 / 允许 NULL；NOT NULL 不禁止 `0` 或空字符串 |

以下命令只读检查结构，不会重建表：

```sql
DESCRIBE users;
SHOW CREATE TABLE users;
```

`DESCRIBE` 看列信息概要；`SHOW CREATE TABLE` 看完整定义，包含主键、外键。

#### 表选项：ENGINE 与 COMMENT

存储引擎是 MySQL 内部负责具体数据存取的组件，不是独立数据库。不同引擎支持的事务、锁、外键等能力不同。

```sql
-- 建表语句右括号之后的表选项，不是独立语句
ENGINE=InnoDB COMMENT='装扮套装配置表'
```

- `ENGINE=InnoDB`：这张表使用 InnoDB，支持事务、行级锁和外键；不是为整个实例统一改引擎。
- `COMMENT`：表的用途说明，不是表名或数据记录。
- 不写 ENGINE 时采用适用的默认引擎；显式写出可以说明设计意图，减少对环境默认配置的依赖。SHOW CREATE TABLE 展示实际定义，出现 ENGINE 不代表创建者一定手写了它。
- 其他引擎先认识：MyISAM 不支持事务/外键；MEMORY 表的数据放在内存，服务重启后数据丢失；CSV 用 CSV 文件存储；ARCHIVE 用于压缩归档；NDB 用于 MySQL NDB Cluster。可用引擎依版本和安装配置而异，不需要现在逐个实践。

参考：[引擎设置](https://dev.mysql.com/doc/refman/8.4/en/storage-engine-setting.html)、[其他存储引擎](https://dev.mysql.com/doc/refman/8.4/en/storage-engines.html)。现在只做认知补充，事务、锁与引擎内部机制在 M3 深入；不要为了练习修改现有业务表的引擎。

<a id="sql-select"></a>

### 1.4 SELECT：过滤、排序与分页

按目的记子句：

| 子句 | 回答什么 |
| --- | --- |
| `SELECT` | 返回哪些列或计算结果？`*` 表示全部列 |
| `FROM` | 查询哪张表？ |
| `WHERE` | 保留哪些行？ |
| `ORDER BY` | 按什么顺序？`ASC` 升序，`DESC` 降序 |
| `LIMIT` / `OFFSET` | 最多返回多少行 / 先跳过多少行？ |

```sql
-- 查询深圳成年用户的指定列，按 id 升序，每页 10 条的第 3 页
SELECT id, name, age
FROM users
WHERE age >= 18 AND city = '深圳'
ORDER BY id ASC
LIMIT 10 OFFSET 20;
```

这是**书写顺序**，不是内部执行顺序。`OFFSET = (页码 - 1) × 每页条数`。分页应按唯一的 `id` 等稳定排序。

常用条件放在 `WHERE` 后：

| 写法 | 含义 |
| --- | --- |
| `=`, `<>` 或 `!=` | 等于、不等于 |
| `>`, `<`, `>=`, `<=` | 大于、小于、大于等于、小于等于 |
| `age >= 18 AND city = '深圳'` | 同时满足两个条件 |
| `name = 'Tom' OR name = 'Amy'` | 至少满足一个条件 |
| `NOT (city = '深圳')` | 对条件取反 |
| `name IN ('Tom', 'Amy')` | 匹配候选值中的任意一个 |
| `name LIKE 'T%'` | 匹配以 T 开头的姓名；`%` 匹配任意长度字符，`_` 匹配单个字符 |
| `age IS NULL` / `age IS NOT NULL` | 年龄为空 / 不为空 |

**易错点：**`WHERE` 筛选行，`SELECT` 选择列。字符串用单引号，数字和 `NULL` 不加引号；`AND`、`OR` 混用加括号；`user` 与 `users` 不是同一张表。

<a id="sql-aggregate"></a>

### 1.5 聚合统计与别名

聚合函数汇总多行，本节在 `SELECT` 中使用；`AS` 分别为表达式取别名。

| 函数 | 作用 |
| --- | --- |
| `COUNT(*)` | 统计所有行 |
| `COUNT(age)` | 统计 age 不为 NULL 的行 |
| `SUM(amount)` | 金额求和，不是统计订单数量 |
| `AVG(age)` | 平均年龄，忽略 NULL |
| `MIN(age)` / `MAX(age)` | 最小 / 最大非 NULL 年龄 |

```sql
SELECT COUNT(*) AS total_users,
       COUNT(age) AS known_age_users,
       AVG(age) AS average_age,
       MIN(age) AS min_age,
       MAX(age) AS max_age
FROM users;

SELECT SUM(amount) AS total_amount
FROM orders;
```

主键非空，所以 `COUNT(id)` 与 `COUNT(*)` 结果相同。多个表达式用逗号分隔；统计前筛选行，仍用 `WHERE`。

**示例边界：**本地 `orders` 只有 `id`、`user_id`、`amount`；旧纸面题假设的 `status` 列不存在，不能直接写 `WHERE status = 'paid'`。

<a id="sql-write"></a>

### 1.6 INSERT、UPDATE 与 DELETE

`INSERT` 新增行，`UPDATE` 修改行，`DELETE FROM` 删除整行。以下为历史示例，勿重复操作。

**新增：列和值按位置一一对应。**单行只写一组括号，多行用逗号连接：

```sql
INSERT INTO users (name, age, city)
VALUES
    ('Jack', 30, '广州'),
    ('Lucy', NULL, '杭州');
```

先确认目标表及列名；列和值按位置对应。每行一组括号，多行之间用逗号分隔，所有行外不要再包一层括号，最后用分号结束。

自增主键通常省略。重复执行会新增行，不是覆盖旧记录；插入后用 `SELECT` 核对数据，按编号排序写 `ORDER BY id ASC`。

**修改：先查范围与旧值 → 修改 → 同条件复查。**

```sql
SELECT id, name, city FROM users WHERE id = 1;

UPDATE users
SET city = '上海'
WHERE id = 1;

SELECT id, name, city FROM users WHERE id = 1;
```

**删除：先查完整旧数据并保留 → 删除 → 同条件复查。**

```sql
SELECT * FROM users WHERE id = 3;

DELETE FROM users
WHERE id = 3;

SELECT * FROM users WHERE id = 3;
```

**易错点：**删除不能漏 `FROM`；`UPDATE`、`DELETE` 不带 `WHERE` 会针对全表。前后查询须用相同 `WHERE`。保留旧数据是恢复依据，不等于可以自动撤销。

<a id="table-relations"></a>

### 1.7 外键与一对多

主键标识本表的行，外键引用关联表中的行：

```text
users.id（用户主键） ← orders.user_id（订单所属用户）
                        orders.id（订单自己的主键）
```

一个用户有多笔订单，叫一对多。多个订单的 `user_id` 可以相同，订单 `id` 不能相同；外键本身不要求唯一，也可另加唯一约束。

```sql
CREATE TABLE orders (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT NOT NULL,
    amount DECIMAL(10, 2) NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id)
);
```

外键引用的整数列需与目标列类型、大小及符号属性匹配；本例均为 `BIGINT`。上面是结构备查，不要重复建表。

外键语法分成两部分：

- `FOREIGN KEY (user_id)`：本表哪一列作为外键。
- `REFERENCES users(id)`：引用哪张表的哪一列。

`NOT NULL` 不是外键，只禁止 NULL；命名 `user_id` 也不会检查引用。正常启用外键约束后，才会拒绝引用不存在的用户。

**易错点：**列定义与外键约束用逗号分隔，换行不能代替逗号。写 `users(id)`，不写 `(users.id)`；最后一项不加逗号，以 `);` 收尾。外键约束也可放在列定义之间。

```sql
SHOW CREATE TABLE orders;
```

输出中 `CONSTRAINT orders_ibfk_1 FOREIGN KEY ...` 是外键约束；`KEY user_id (user_id)` 是自动生成的索引，不是主键。格式不必与手写 SQL 逐字一致。

<a id="sql-join"></a>

### 1.8 INNER JOIN 与 LEFT JOIN：查询关联数据

`INNER JOIN` 只返回满足 `ON` 匹配条件的行组合，不会创建新表。

```sql
SELECT users.name, orders.id AS order_id, orders.amount
FROM users
INNER JOIN orders
ON users.id = orders.user_id
ORDER BY order_id ASC;
```

- `表名.列名`：明确列来自哪张表；用户与订单通过 `users.id = orders.user_id` 关联。
- `AS order_id`：给返回列起别名，放在 `SELECT` 中；同一查询的 `ORDER BY` 可使用它，不会给原表新增列。
- 一个用户匹配两笔订单，就返回两行；没有匹配订单的用户，不出现在结果中。

**易错点：**订单自己的 `id` 不是所属用户编号；不要用 `users.id = orders.id` 关联。

#### LEFT JOIN：没有匹配也保留左表行

适用于“展示所有用户及其订单，没有订单的用户也展示”。

```sql
-- users 是左表，orders 是右表
SELECT users.name, orders.id AS order_id, orders.amount
FROM users
LEFT JOIN orders
ON users.id = orders.user_id
ORDER BY users.id ASC, orders.id ASC;
```

多列排序先比较第一列，相同时再比较第二列。`ASC` 升序，`DESC` 降序。

左右由查询中的位置决定，与主外键或建表顺序无关。没有额外过滤时：

- 匹配到几条右表记录，就返回几行；不会自动合成数组。
- 没有匹配，也保留左表行，右表对应列补 `NULL`；INNER JOIN 则不保留。
- 此处 `NULL` 表示没有匹配数据，不等于金额为 0。它由查询结果补出，即使右表列定义为 `NOT NULL` 也能出现；不会插入或修改记录。

计数示例：假设 Amy 有 3 笔订单，Jack、Lucy 都没有订单，从用户表左连接订单表得到 `3 + 1 + 1 = 5` 行。

#### ON 与 WHERE

`ON` 决定左右表怎样匹配；`WHERE` 继续筛选连接结果，只保留条件为真的行。LEFT JOIN 保留左表行，不代表后续 WHERE 不能过滤它们。

在上面的查询中，`ON` 后、`ORDER BY` 前添加 `WHERE orders.amount >= 100`：99.90 不满足条件，199.00 满足；无订单行的金额为 NULL，与数字比较的结果为未知，不能通过筛选。因此只剩金额 199.00 的订单。

<a id="cms-api"></a>

### 1.9 项目对照：cms-api 的 SQL 在哪里

这部分仅提前认识，Go、GORM、goqu 在后续模块学习，不算已掌握。

`cms-api` 没有统一 SQL 文件夹，查询随业务出现在 `service/`、`crontab/` 等目录的 Go 文件中。

| 写法 | 作用 |
| --- | --- |
| GORM | 用 `Model`、`Where`、`Select`、`Find` 等方法生成并执行 SQL |
| goqu | 用 Go 代码组装查询，再通过 `ToSQL()` 生成 SQL |
| GORM 的 [Raw 查询](https://gorm.io/docs/sql_builder.html#Raw-SQL) | 提供原始 SQL，配合 `Scan()` 等调用执行，不是单独调用 `Raw()` 就执行 |

`TableName()` 指定表名，`?` 占位符将参数与 SQL 结构分开传递。`cmsutil/mysql.go` 负责连接，不集中存放业务查询；用 ORM 仍需理解 SQL。
