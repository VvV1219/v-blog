---
title: 前端转全栈：后端学习笔记
description: 已学后端知识复习手册：核心概念、常用写法与易错点
date: 2026-09-02 00:00
category: 学习笔记
tags:
  - 后端
  - SQL
  - Go
  - 学习笔记
aside: true
comment: false
---

# 后端学习笔记

## 复习导航

| 我想复习什么？ | 去哪里看？ | 所属模块 |
| --- | --- | --- |
| 程序怎么运行？路径和环境变量是什么？ | [计算机与 Shell](#os-shell) | M1-A1～A2 |
| 管道与重定向怎么写？怎么看退出码？ | [输入输出](#shell-streams)、[退出码](#exit-status) | M1-A3 |
| 请求发给谁？DNS、IP、端口、TCP 有什么关系？ | [网络连接](#network) | M1-B1～B2 |
| HTTP 请求响应怎么看？HTTPS 和登录有什么区别？ | [HTTP 与 Web](#http) | M1-B3 |
| 怎么连接 MySQL、选库、建表和查看结构？ | [MySQL 操作](#mysql-client)、[表结构](#table-structure) | M1-C1～C2 |
| 怎么过滤、排序、分页、统计？ | [SELECT 查询](#sql-select)、[聚合统计](#sql-aggregate) | M1-C1 |
| 怎么安全增删改？外键怎么写？ | [数据写入](#sql-write)、[表关系](#table-relations) | M1-C2 |
| cms-api 的 SQL 放在哪？ | [项目对照](#cms-api) | 提前认识，M3 深入 |

**使用边界：**写文件、建表、增删改示例会改变数据，不要把笔记当脚本重复执行。数据库写操作仅限本地练习库。未学的 JOIN、事务和索引原理暂不展开。

<a id="os-shell"></a>

## 1. 计算机与 Shell

### 1.1 程序怎样运行

| 概念 | 一句话理解 |
| --- | --- |
| 程序 | 保存在硬盘等持久化存储中的代码和文件 |
| 进程 | 程序的一次运行实例 |
| CPU | 执行程序指令 |
| 内存 | 临时保存运行所需的代码、数据和状态 |
| 操作系统 | 管理硬件资源，为应用创建进程、分配内存、调度 CPU、回收资源 |

```text
点击 Codex
→ 操作系统收到启动请求，从硬盘找到程序文件
→ 创建一个或多个进程
→ 分配内存，安排 CPU 执行程序指令
→ 进程结束后由操作系统回收其资源
```

一个程序可对应一个或多个进程；活动监视器中的进程数，不等于启动程序的次数。

### 1.2 文件、目录与路径

文件保存数据，目录组织文件。绝对路径从 `/` 开始；终端中的相对路径以当前工作目录为起点。

| 写法 | 含义 |
| --- | --- |
| `.` | 当前目录 |
| `..` | 当前目录的父目录 |
| `~` | 当前用户的主目录，例如 `/Users/snoma` |
| `/` | 文件系统的根目录 |
| `/Users/snoma/Documents` | 绝对路径 |
| `Documents` | 相对路径；当前目录是 `/Users/snoma` 时指向上面的目录 |

**易错点：**`~` 不是父目录；改变当前目录，会改变同一个相对路径的实际目标。

### 1.3 终端、Shell 与环境变量

终端负责接收输入、显示结果；Shell 负责解析命令、启动程序。

环境变量是进程可读取的“名称—值”配置，子进程通常继承启动时的环境。`PATH` 保存查找可执行程序时依次搜索的目录。

| 命令 | 用途 |
| --- | --- |
| `pwd` | 查看当前工作目录 |
| `ls` | 列出当前目录内容 |
| `cd ..` / `cd ~` | 切换到父目录 / 用户主目录 |
| `mkdir -p 目录路径` | 创建目录；需要时一并创建上级目录 |
| `printenv PATH` | 查看 PATH 的值 |
| `which node` / `which pnpm` | 查看当前 Shell 找到的命令位置 |

同名程序按 PATH 中的目录顺序查找。

<a id="shell-streams"></a>

### 1.4 标准输入、输出与重定向

| 编号 | 名称 | 用途 |
| --- | --- | --- |
| `0` | stdin（标准输入） | 命令读取的数据 |
| `1` | stdout（标准输出） | 命令的正常结果 |
| `2` | stderr（标准错误） | 命令的错误信息 |

正常结果与错误分开，便于分别处理：结果交给下一条命令，错误写日志。

| 写法 | 数据流向 |
| --- | --- |
| `命令A \| 命令B` | A 的 stdout → B 的 stdin；默认不传递 stderr |
| `命令 > 文件` | stdout → 文件，覆盖原内容 |
| `命令 >> 文件` | stdout → 文件，在末尾追加 |
| `命令 < 文件` | 右侧文件 → 左侧命令的 stdin |
| `命令 2> 文件` | stderr → 文件，覆盖原内容 |

| 命令 | 用途 |
| --- | --- |
| `printf 'hello\n'` | 输出文字，`\n` 表示换行 |
| `cat 文件` | 读取并显示文件内容 |
| `wc -l` | 统计换行符数量；常用来统计文本行数 |
| `head -n 10` | 只显示前 10 行 |

```bash
# 两个换行符，结果为 2；不写文件
printf 'hello\nworld\n' | wc -l

# 覆盖写入练习文件，再从文件读取；结果也为 2
printf 'hello\nworld\n' > practice.txt
wc -l < practice.txt
```

**易错点：**`|` 向右传数据，`<` 从右读数据；`>`、`2>` 都会覆盖原文件内容。

<a id="exit-status"></a>

### 1.5 退出码：成功还是失败

`$?` 保存上一条命令或管道的退出状态：`0` 通常成功，非 `0` 失败。退出码不是输出内容。

管道默认通常取最后一条命令的状态，具体受 Shell 设置影响，不代表其中每条命令都成功。

```bash
# 故意访问不存在的路径，将错误写入练习文件
ls /definitely-not-existing-path 2> error.txt
echo $?
# 上面立即读取 ls 的退出码；本次练习为 1
cat error.txt
```

**`echo $?` 必须紧接目标命令。**如果先执行 `cat`，读到的就是 `cat` 的退出码。重定向错误信息不会改变成败。

<a id="network"></a>

## 2. 网络连接：找到谁，怎样连

### 2.1 客户端与服务端

客户端主动请求；服务端监听、处理请求并返回结果。它们是通信角色，不是固定的软件类别。

在 `cms-web → cms-api` 中，前者是客户端，后者是服务端；当 `cms-api` 调用其他服务时，它又是客户端。

### 2.2 IP、端口与监听

IP 定位设备或网络接口，端口区分其中的网络服务：`IP:端口 → 监听进程`。

| 地址或状态 | 含义 |
| --- | --- |
| `127.0.0.1` / `::1` | IPv4 / IPv6 的本机回环地址，都表示当前电脑自身 |
| `127.0.0.1:8080` | 通过本机 IPv4 回环地址访问端口 8080 上的服务 |
| `*:7000` | 在对应地址族的所有本地地址上监听端口 7000，不是监听多个端口 |
| `LISTEN` | 正在监听，等待客户端连接 |

同一协议、地址与端口冲突时，新服务通常无法监听。`*` 不保证外部一定能访问，还受网络和防火墙影响。

查看本机 TCP 监听情况（macOS，只读）：

```bash
lsof -nP -iTCP -sTCP:LISTEN | head -n 10
```

| 组成 | 含义 |
| --- | --- |
| `lsof` | 查看进程打开的文件和网络连接 |
| `-nP` | IP 不转换成域名，端口不转换成服务名称 |
| `-iTCP` | 只看 TCP 网络项 |
| `-sTCP:LISTEN` | 只看监听状态 |
| `head -n 10` | 只展示前 10 行，包含表头 |

输出重点看：`COMMAND` 进程名、`PID` 进程编号、`NAME` 中的地址和端口。

### 2.3 DNS 与 TCP

```text
域名 → DNS 查询得到 IP → 加上端口 → 建立 TCP 连接 → 服务端进程
```

这里的 DNS 查询将域名解析为一个或多个 IP，不建立连接。TCP 通常由服务端先监听、客户端主动连接。

迁移、扩容、负载均衡或故障切换可能改变解析结果。TTL 表示结果可缓存多久，缓存未更新时可能仍使用旧 IP。

```bash
# 查询域名对应的 IP
nslookup www.hellotalk.com

# 测试到目标端口的 TCP 连接；也可把域名替换为查到的 IP
nc -vz -G 5 example.com 443
```

`nslookup` 的 `Server` / 前面的 `Address` 是 DNS 服务器；答案中的 `Name` / `Address` 才是目标域名和 IP。

`nc` 测试网络连接：`-v` 显示详情，`-z` 只探测、不发业务数据；macOS 的 `-G 5` 设置 5 秒连接超时。域名先解析，IP 可直接测 TCP。

### 2.4 分清失败发生在哪一层

| 现象 | 能判断什么 |
| --- | --- |
| 域名不存在或无法解析 | DNS 阶段失败 |
| `Connection refused` | TCP 连接被主动拒绝，常见原因是目标端口没有监听 |
| 连接超时 | 规定时间内未建立 TCP 连接，原因仍需排查 |
| `nc` 显示 `succeeded` | TCP 能连接；不能据此判断 TLS、HTTP 或业务成功 |

<a id="http"></a>

## 3. HTTP 与 Web

### 3.1 URL：请求的目标

```text
https://api.example.com:8443/users/42?lang=zh&source=web#profile
```

| 部分 | 示例 |
| --- | --- |
| 协议 | `https` |
| 域名 | `api.example.com` |
| 端口 | `8443`；未显式填写时 HTTP 默认 80，HTTPS 默认 443 |
| 路径 | `/users/42` |
| 查询参数 | `lang=zh`、`source=web`，用 `&` 分隔 |
| 片段 | `profile`，通常供客户端使用，不发送给服务端 |

### 3.2 请求与响应：结构和 Header

请求：方法 + 目标 + Header + 可选 Body。响应：状态码 + Header + 可选 Body。HTTP/1.1 示例中，Header 与 Body 以空行分隔：

```http
GET /users/42 HTTP/1.1
Host: api.example.com
Accept: application/json
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"id":42,"name":"Tom"}
```

| Header | 出现在哪 | 表达什么 |
| --- | --- | --- |
| `Host` | 请求 | 目标主机 |
| `Content-Type` | 请求或响应 | 这条消息实际发送的 Body 是什么格式 |
| `Accept` | 请求 | 客户端希望收到什么格式 |

`application/json` 表示 JSON，`text/html` 表示 HTML；请求中的 Content-Type 描述发出的数据，不是期望返回的数据。

### 3.3 方法与状态码

| 方法 | 常见语义 |
| --- | --- |
| `GET` | 查询资源 |
| `POST` | 创建资源或执行操作 |
| `PUT` | 用完整数据替换资源 |
| `PATCH` | 局部修改资源 |
| `DELETE` | 删除资源 |

| 状态码 | 含义 |
| --- | --- |
| `200` / `201` / `204` | 成功 / 已创建 / 成功但无 Body |
| `400` | 请求格式、参数等有问题 |
| `401` | 缺少有效认证凭证，例如 Token 无效 |
| `403` | 拒绝访问，常见情形是权限不足，不必然表示已登录 |
| `404` | 目标资源不存在 |
| `500` | 服务端内部错误 |

**易错点：**收到 `500` 是收到了失败响应，不是 TCP 连接失败。方法的实际行为还要看接口实现。

### 3.4 JSON：数据的文本格式

JSON 是文本格式，支持对象、数组、字符串、数字、布尔值、`null`。键和字符串用双引号，不能有注释、尾随逗号或 `undefined`。

```json
{"name":"Tom","active":true}
```

| 写法 | 转换方向 |
| --- | --- |
| `JSON.stringify(value)` | 可序列化的 JavaScript 值 → JSON 文本 |
| `JSON.parse(text)` | 合法 JSON 文本 → JavaScript 值，不一定是对象 |

### 3.5 HTTPS、Cookie 与 Token

HTTPS 可以理解为 HTTP 加 TLS。TLS 提供传输加密、完整性校验和服务端身份验证，不代表业务用户已经登录。

```text
DNS → TCP → TLS → HTTP
```

以上是基于 TCP 的 HTTPS 路径（HTTP/1.1、HTTP/2）。

| 目的 | 常见方式 |
| --- | --- |
| 服务端设置 Cookie | 响应 Header：`Set-Cookie` |
| 浏览器发送 Cookie | 请求 Header：`Cookie` |
| 使用 Bearer Token 认证 | 请求 Header：`Authorization: Bearer TOKEN` |

Cookie 存储并按规则随请求携带数据，不一定是登录凭证；Token 也能通过 Cookie 发送。

### 3.6 curl：发送并观察请求

以下命令会真实发送网络请求，不是只查看本地内容。

```bash
# GET：查看响应 Header 和 Body
curl -i -sS --max-time 10 https://example.com

# POST：向公开回显服务发送虚构 JSON 数据
curl -i -sS --max-time 10 -X POST \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{"name":"Tom","active":true}' \
  https://httpbin.org/anything
```

| 参数 | 作用 |
| --- | --- |
| `-i` | 同时显示响应 Header |
| `-sS` | 隐藏进度，但保留错误信息 |
| `--max-time 10` | 整次操作最多 10 秒 |
| `-X` / `-H` / `-d` | 指定方法 / 添加 Header / 设置 Body |

读结果：状态码 → Header 中的格式 → Body。命令行中的 URL 直接写地址，不写 Markdown 链接。

**易错点：**curl 默认收到 `404`、`500` 仍可能退出 `0`，退出码不等于 HTTP 状态码。HTTPS 返回 `200` 说明传输和 HTTP 请求成功，不替代业务内容校验。

公开服务可能记录公网出口 IP；测试只用虚构数据，不发送真实 Token、密码或个人信息。

<a id="sql"></a>

## 4. 数据库与 SQL

复习顺序：**概念 → 连接选库 → 建表 → 查询 → 写入 → 表关系**。使用 MySQL 写法，字段以本章表定义为准。

### 4.1 数据库、表、主键与 NULL

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

### 4.2 连接 MySQL、选库与看结果

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

### 4.3 创建数据库和表

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

<a id="sql-select"></a>

### 4.4 SELECT：过滤、排序与分页

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

### 4.5 聚合统计与别名

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

### 4.6 INSERT、UPDATE 与 DELETE

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

### 4.7 外键与一对多

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

<a id="cms-api"></a>

### 4.8 项目对照：cms-api 的 SQL 在哪里

这部分仅提前认识，Go、GORM、goqu 在后续模块学习，不算已掌握。

`cms-api` 没有统一 SQL 文件夹，查询随业务出现在 `service/`、`crontab/` 等目录的 Go 文件中。

| 写法 | 作用 |
| --- | --- |
| GORM | 用 `Model`、`Where`、`Select`、`Find` 等方法生成并执行 SQL |
| goqu | 用 Go 代码组装查询，再通过 `ToSQL()` 生成 SQL |
| GORM 的 [Raw 查询](https://gorm.io/docs/sql_builder.html#Raw-SQL) | 提供原始 SQL，配合 `Scan()` 等调用执行，不是单独调用 `Raw()` 就执行 |

`TableName()` 指定表名，`?` 占位符将参数与 SQL 结构分开传递。`cmsutil/mysql.go` 负责连接，不集中存放业务查询；用 ORM 仍需理解 SQL。
