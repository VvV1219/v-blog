---
title: Redis 基础命令学习笔记
description: Redis 基础命令学习笔记
date: 2026-07-16 00:00
category: 学习笔记
tags:
  - Redis
  - 数据库
  - 学习笔记
aside: true
comment: true
---

# Redis 基础命令学习笔记

## 内容导航

本文内容分为三部分：

1. 第 1～8 节：key 与常用数据类型。
2. 第 9～10 节：高频易错点与命令速查。
3. 第 11～15 节：SCAN、事务、Pipeline、发布订阅与 Stream。

笔记中的 Redis 命令默认在 `redis-cli` 中执行。命令里请使用英文半角符号。

## 1. Redis 的基本思维

Redis 可以看作一个速度很快的键值数据库：

```text
key（键） → value（值）
```

例如：

```text
SET user:1001:name "小明"
```

`user:1001:name` 整体才是一个 key。可以按业务习惯理解为：

```text
user : 1001 : name
对象    ID     属性
```

冒号只是命名分隔符，Redis 不知道哪个部分是表名、ID 或字段名。

建议采用清楚的 key 命名：

```text
user:1001
product:2001
article:2001:likes
game:ranking
```

key 区分大小写，下面是两个不同的 key：

```text
user:1001:name
user:1001:Name
```

## 2. Key 的通用命令

### 判断、查询类型和删除

```text
EXISTS user:1001:name
TYPE user:1001:name
DEL user:1001:name
```

返回值说明：

- `EXISTS` 返回 `1`：key 存在。
- `EXISTS` 返回 `0`：key 不存在。
- `DEL` 返回删除成功的 key 数量。
- `TYPE` 返回 `string`、`hash`、`list`、`set`、`zset` 或 `none`。

`DEL` 删除整个 key，而不是只删除某个字段或成员。

## 3. String：普通字符串

String 可以保存文字、数字、JSON 等内容。

### 保存与读取

```text
SET product:1001:name "苹果手机"
GET product:1001:name
```

如果 key 不存在，`GET` 返回 `(nil)`。

再次执行 `SET` 会覆盖原来的值：

```text
SET product:1001:name "新款苹果手机"
```

### 设置过期时间

先保存，再设置 60 秒过期：

```text
SET verify:code 9527
EXPIRE verify:code 60
```

更常用的一次完成写法：

```text
SET verify:phone:13800138000 9527 EX 300
```

`EX 300` 表示 300 秒后过期。

查询剩余时间：

```text
TTL verify:phone:13800138000
```

`TTL` 的特殊返回值：

```text
正数    剩余秒数
-1      key 存在，但没有过期时间
-2      key 不存在或已经过期
```

### 不存在时才保存：NX

```text
SET lock:order:1001 "request-001" EX 30 NX
```

含义：只有 key 不存在时才保存，并在 30 秒后过期。

```text
返回 OK      保存成功
返回 (nil)   key 已存在，没有覆盖
```

记忆：`NX = Not Exists`。

### 数字增减

```text
SET product:1001:stock 100
DECR product:1001:stock
DECRBY product:1001:stock 5
INCR product:1001:stock
INCRBY product:1001:stock 10
GET product:1001:stock
```

```text
INCR          加 1
INCRBY 10     加 10
DECR          减 1
DECRBY 5      减 5
```

这些命令是独立命令，不能写在同一条 `SET` 后面。

### 批量保存和读取

```text
MSET app:name "商城系统" app:version "1.0" app:status "running"
MGET app:name app:version app:status
```

同时查询一个不存在的 key：

```text
MGET app:name app:author
```

不存在的位置返回 `(nil)`。

`MSET` 和 `MGET` 只用于 String，不用于 Hash、List、Set 或 ZSet。

## 4. Hash：保存对象的多个字段

Hash 适合保存用户、商品等对象。

```text
HSET product:2001 name "苹果手机" price 5999 stock 100
```

结构可以理解为：

```text
product:2001
├── name  = 苹果手机
├── price = 5999
└── stock = 100
```

### 查询和修改字段

```text
HGET product:2001 name
HGETALL product:2001
HSET product:2001 price 5699
```

`HSET` 既能新增字段，也能修改已有字段。

读取 Hash 字段要使用 Hash 命令，例如 `HGET` 或 `HGETALL`；普通 `GET` 只能读取 String。

### 修改数字字段

```text
HINCRBY product:2001 stock -5
HINCRBY product:2001 stock 10
```

Redis 没有 `HDECRBY`。Hash 做减法时，给 `HINCRBY` 传负数。

小数可以使用：

```text
HINCRBYFLOAT product:2001 price -10.5
```

### 判断、删除和统计字段

```text
HEXISTS product:2001 name
HDEL product:2001 price
HLEN product:2001
```

Redis 没有 `HREM`。Hash 删除字段使用 `HDEL`。

## 5. List：有顺序、允许重复

List 可以从左边或右边添加、取出数据。

```text
左边 ← [A] [B] [C] → 右边
```

### 添加元素

```text
RPUSH music:list "歌曲A" "歌曲B"
LPUSH music:list "歌曲C"
```

最终顺序：

```text
歌曲C、歌曲A、歌曲B
```

### 查询元素

```text
LRANGE music:list 0 -1
```

`LRANGE` 必须提供开始和结束位置：

```text
0     第一个元素
-1    最后一个元素
0 -1  查询全部元素
```

### 取出并删除元素

```text
LPOP music:list
RPOP music:list
LLEN music:list
```

```text
LPOP    从左边取出并删除
RPOP    从右边取出并删除
LLEN    查询列表长度
```

删除指定值使用：

```text
LREM music:list 0 "歌曲A"
```

## 6. Set：无序、不重复

Set 适合点赞用户、标签和去重名单。

### 基本操作

```text
SADD article:2001:likes user1 user2 user3
SADD article:2001:likes user1
SISMEMBER article:2001:likes user2
SMEMBERS article:2001:likes
SCARD article:2001:likes
SREM article:2001:likes user3
```

第二次添加 `user1` 返回 `0`，因为 Set 不保存重复成员。

```text
SADD         添加成员
SISMEMBER    判断成员是否存在
SMEMBERS     查询全部成员
SCARD        统计成员数量
SREM         删除成员
```

### 集合运算

```text
SADD product:A:buyers user1 user2 user3
SADD product:B:buyers user2 user3 user4
```

共同成员，即交集：

```text
SINTER product:A:buyers product:B:buyers
```

所有成员合并去重，即并集：

```text
SUNION product:A:buyers product:B:buyers
```

A 有但 B 没有，即差集：

```text
SDIFF product:A:buyers product:B:buyers
```

`SDIFF` 的前后顺序会影响结果。

## 7. ZSet：有分数的有序集合

ZSet 也叫 Sorted Set，适合排行榜。

```text
ZADD game:ranking 90 xiaoming 85 xiaohong 95 xiaoli
```

`ZADD` 的参数顺序是：

```text
ZADD key 分数 成员 分数 成员 ...
```

### Set 与 ZSet 的区别

普通 Set 只保存成员：

```text
{xiaoming, xiaohong, xiaoli}
```

ZSet 保存成员和分数：

```text
xiaoming → 90
xiaohong → 85
xiaoli   → 95
```

如果误用下面的命令：

```text
SADD game:ranking xiaoming 90
```

Redis 会把 `xiaoming` 和 `90` 当作两个普通成员，而不是姓名和分数。

### 查询排行榜

从低分到高分：

```text
ZRANGE game:ranking 0 -1 WITHSCORES
```

从高分到低分：

```text
ZREVRANGE game:ranking 0 -1 WITHSCORES
```

注意是 `WITHSCORES`，最后有字母 `S`。

查询前三名：

```text
ZREVRANGE game:ranking 0 2 WITHSCORES
```

```text
0 到 0    第一名
0 到 1    前两名
0 到 2    前三名
0 到 9    前十名
```

### 修改和查询分数

```text
ZINCRBY game:ranking 20 xiaohong
ZINCRBY game:ranking -5 xiaoming
ZSCORE game:ranking xiaohong
```

### 查询排名

```text
ZREVRANK game:ranking xiaohong
ZRANK game:ranking xiaohong
```

```text
ZREVRANK    按高分到低分计算排名
ZRANK       按低分到高分计算排名
```

Redis 的排名从 `0` 开始：

```text
返回 0 → 第一名
返回 1 → 第二名
返回 2 → 第三名
```

程序展示名次时，通常使用 `Redis 返回值 + 1`。

### 删除和统计成员

```text
ZREM game:ranking xiaoming
ZCARD game:ranking
```

`ZREM` 删除成员时，对应分数也会一起删除。

## 8. 删除命令对照

| 命令 | 数据类型 | 删除内容 |
|---|---|---|
| `SREM` | Set | 一个或多个成员 |
| `ZREM` | ZSet | 成员及其分数 |
| `HDEL` | Hash | 字段及其值 |
| `LREM` | List | 匹配的列表元素 |
| `DEL` | 任意类型 | 整个 key |

当 Hash、List、Set 或 ZSet 的最后一个内容被删除后，整个 key 也会消失。

## 9. 高频易错点

### 一条命令必须写完整

错误：

```text
LRANGE task:list
ZRANGE game:ranking
```

正确：

```text
LRANGE task:list 0 -1
ZRANGE game:ranking 0 -1
```

### 不同数据类型使用不同命令

```text
String    SET / GET
Hash      HSET / HGET
List      LPUSH / RPUSH / LRANGE
Set       SADD / SMEMBERS
ZSet      ZADD / ZRANGE / ZREVRANGE
```

对错误类型执行命令，通常会得到 `WRONGTYPE` 错误。

### 排行榜要使用 ZADD

```text
# 错误：普通 Set 不认识分数
SADD game:ranking xiaoming 90

# 正确：分数在成员前面
ZADD game:ranking 90 xiaoming
```

### 减少 Hash 数字字段

错误：

```text
HDECRBY product:2001 stock 5
```

正确：

```text
HINCRBY product:2001 stock -5
```

## 10. 一页速查表

```text
通用
EXISTS key                      判断 key 是否存在
TYPE key                        查询数据类型
DEL key                         删除整个 key
EXPIRE key 秒数                 设置过期时间
TTL key                         查询剩余时间
SCAN 0 MATCH 模式 COUNT 数量    分批查找 key
MULTI                           开始事务并暂存后续命令
EXEC                            执行事务队列中的命令
DISCARD                         清空并取消事务队列
WATCH key [key ...]             监视 key，提交前被修改则取消事务
UNWATCH                         取消当前连接监视的所有 key

String
SET key value                   保存
GET key                         查询
SET key value EX 300            保存并设置过期时间
SET key value EX 30 NX          不存在时才保存
INCR / DECR key                 加 1 / 减 1
INCRBY / DECRBY key 数量        增加 / 减少指定数量
MSET key value ...              批量保存
MGET key ...                    批量查询

Hash
HSET key field value ...        保存字段
HGET key field                  查询字段
HGETALL key                     查询全部字段
HINCRBY key field 数量          修改数字字段
HEXISTS key field               判断字段是否存在
HDEL key field                  删除字段
HLEN key                        统计字段数量

List
LPUSH / RPUSH key value         左侧 / 右侧加入
LPOP / RPOP key                 左侧 / 右侧取出并删除
LRANGE key 0 -1                 查询全部
LLEN key                        查询长度
LREM key count value            删除指定值

Set
SADD key member ...             添加成员
SMEMBERS key                    查询全部成员
SISMEMBER key member            判断成员是否存在
SCARD key                       统计成员数量
SREM key member                 删除成员
SINTER key1 key2                交集
SUNION key1 key2                并集
SDIFF key1 key2                 差集

ZSet
ZADD key score member           添加成员和分数
ZRANGE key 0 -1                 从低到高查询
ZREVRANGE key 0 -1              从高到低查询
ZINCRBY key amount member       修改分数
ZSCORE key member               查询分数
ZREVRANK key member             查询从高到低的排名
ZREM key member                 删除成员
ZCARD key                       统计成员数量

发布订阅
SUBSCRIBE channel               订阅频道
PUBLISH channel message         向频道发布消息

Stream
XADD key * field value ...      添加消息并自动生成消息 ID
XRANGE key - + [COUNT n]        查看消息，可限制返回数量
XREAD COUNT n STREAMS key ID    读取指定 ID 之后的消息
XREAD BLOCK ms STREAMS key $    等待新消息
XGROUP CREATE key group 0 MKSTREAM  创建消费组并从头消费
XREADGROUP GROUP group consumer STREAMS key >  组内消费者读取新消息
XACK key group ID [ID ...]       确认消息已经处理完成
XPENDING key group               查看消费组的待确认消息概况
```

## 11. SCAN：安全地分批查找 key

开发和排查问题时，有时需要寻找一批符合规则的 key。

例如，查找所有用户相关的 key：

```text
KEYS user:*
```

`KEYS` 会一次遍历整个数据库。key 数量很多时，它可能长时间占用 Redis，影响其他请求。因此不要在生产环境随意使用 `KEYS`。

更安全的方式是使用 `SCAN` 分批扫描：

```text
SCAN 0 MATCH user:* COUNT 100
```

参数含义：

```text
0             第一次扫描使用的游标
MATCH user:*  只返回符合 user:* 的 key
COUNT 100     建议本次扫描约 100 个元素
```

### MATCH 与通配符

`MATCH` 表示“只返回符合某个模式的 key”。它只是筛选结果，不会修改或删除数据。

如果熟悉 SQL，可以暂时把它类比成只针对 key 名称的 `WHERE ... LIKE`：

```text
SCAN 0 MATCH user:* COUNT 100
```

大致类似：

```sql
WHERE key LIKE 'user:%'
```

但这只是帮助理解的类比。SQL 的 `WHERE` 可以判断字段、数字范围和多种逻辑条件；Redis 的 `MATCH` 只按 key 名称的模式筛选。SQL `LIKE` 常用 `%` 表示任意内容，而 Redis 模式使用 `*`。

在下面的模式中：

```text
user:*
```

可以拆成：

```text
user    普通文字，必须完全匹配
:       普通冒号，用于分隔 key 的名称层级
*       通配符，可以匹配任意数量的字符
```

因此，`user:*` 表示匹配所有以 `user:` 开头的 key，例如：

```text
user:1001
user:1002:name
user:online:list
```

它不会匹配下面这些 key：

```text
product:1001
admin:user:1001
```

常见模式：

```text
*             匹配所有 key
product:*     匹配以 product: 开头的 key
*:name        匹配以 :name 结尾的 key
user:*:name   匹配 user: 开头、:name 结尾的 key
```

冒号没有特殊匹配能力。它只是开发者常用的 key 命名分隔符。真正有通配含义的是 `*`。

返回结果通常包含两部分：

```text
1. 下一次扫描使用的游标
2. 本次找到的 key
```

假设第一次返回的游标是 `42`，下一次继续：

```text
SCAN 42 MATCH user:* COUNT 100
```

继续使用 Redis 返回的新游标，直到返回游标 `0`。游标重新变成 `0`，表示这一轮扫描完成。

`COUNT 100` 是数量建议，不保证每次正好返回 100 个 key。某次返回空列表也不代表扫描结束，是否结束只看游标是否回到 `0`。

扫描期间如果数据正在变化，结果可能重复。程序批量处理时应考虑去重，并避免假设扫描结果是某一时刻的完整快照。

记忆：

```text
KEYS    一次查完，生产环境有阻塞风险
SCAN    分批查找，生产环境更合适
```

## 12. Redis 事务基础

Redis 事务可以把多条命令先放入队列，再按顺序一起执行。

它不是一块独立的运行空间，也不会复制一份独立数据。`MULTI` 之后、`EXEC` 之前，当前客户端只是把命令排队；其他客户端仍然可以正常读写 Redis。

只有执行 `EXEC` 时，Redis 才会连续执行事务队列中的命令。在这段执行期间，其他客户端的命令不会插入队列中间。

```text
客户端 A：MULTI，开始排队
客户端 A：SET key1 value1，进入队列
客户端 B：此时仍然可以正常执行自己的命令
客户端 A：EXEC，连续执行 A 的事务队列
```

因此，Redis 事务的核心是“命令排队并连续执行”，不是“创建隔离的数据空间”。

```text
MULTI
SET order:1001:status "paid"
SET order:1001:amount 599
EXEC
```

执行过程：

```text
MULTI    开始事务
SET      进入队列，通常返回 QUEUED
SET      进入队列，通常返回 QUEUED
EXEC     按顺序执行队列里的命令
```

`QUEUED` 表示命令已经排队，并不表示命令已经执行。只有执行 `EXEC` 后，队列中的命令才会真正运行。

命令示例应使用英文半角引号 `"`。中文弯引号 `“”` 不是 Redis 命令中的引号分隔符，可能被作为值的一部分保存。没有空格的值也可以不加引号。

在 `EXEC` 执行这批命令期间，其他客户端的命令不会插入它们中间。

核心命令：

```text
MULTI    开始排队
EXEC     执行队列
```

### DISCARD：取消事务

如果命令已经进入队列，但不想执行，可以使用 `DISCARD`：

```text
MULTI
SET order:1001:status "cancelled"
SET order:1001:amount 0
DISCARD
```

`DISCARD` 会清空当前事务队列并退出事务。上面的两条 `SET` 不会执行。

```text
EXEC       执行队列
DISCARD    放弃队列
```

### 执行时出错不会自动回滚

先创建一个不能执行数字加法的值：

```text
SET counter "hello"
```

然后执行事务：

```text
MULTI
INCR counter
SET user:1001:name "小明"
EXEC
```

`INCR counter` 会因为值不是数字而失败，但后面的 `SET` 仍然可以成功。Redis 不会因为一条命令失败，就自动撤销同一事务中已经成功的其他命令。

因此，Redis 事务的“连续执行”不等于 MySQL 那种“失败后自动回滚”。应用程序仍然需要检查 `EXEC` 返回的每条命令结果。

### 入队时出错会阻止事务提交

如果命令本身的格式不完整，Redis 会在入队时立即报错：

```text
MULTI
SET user:1001:name
SET user:1001:age 18
EXEC
```

第一条 `SET` 缺少 value，因此不会返回 `QUEUED`，而是立即报参数错误。虽然第二条命令可能显示 `QUEUED`，执行 `EXEC` 时仍会得到 `EXECABORT`，整个事务不会执行。

两类错误的区别：

```text
入队时发现格式错误    整个事务不执行
EXEC 时发现类型错误   错误命令失败，其他命令继续执行
```

### WATCH：提交前检查数据有没有变化

`WATCH` 用来监视一个或多个 key。它必须写在 `MULTI` 之前：

```text
WATCH product:1001:stock
GET product:1001:stock
MULTI
DECR product:1001:stock
EXEC
```

如果被监视的库存从 `WATCH` 开始到 `EXEC` 之前被其他客户端修改，`EXEC` 将取消这次事务，不执行队列中的命令。

如果库存没有被修改，`EXEC` 就会正常执行 `DECR`。

`WATCH` 类似给数据加上“提交前变更检查”，但它不会锁住 key，其他客户端仍然可以修改它。这种做法叫乐观锁。

如果 `EXEC` 因监视的 key 被修改而取消，应用程序通常重新执行整个流程：再次 `WATCH`、读取最新值、计算并提交。不能直接重复旧事务，因为旧数据已经过期。

如果监视后决定不再执行事务，可以取消监视：

```text
UNWATCH
```

`EXEC` 和 `DISCARD` 也会结束当前事务，并清除当前连接的监视状态。

## 13. Pipeline 基础

正常发送多条命令时，客户端通常要反复等待：

```text
发送命令 1 → 等待结果 1
发送命令 2 → 等待结果 2
发送命令 3 → 等待结果 3
```

Pipeline 会先把多条命令集中发送，再集中接收结果：

```text
集中发送命令 1、2、3 → 集中接收结果 1、2、3
```

它主要减少客户端与 Redis 之间的网络往返次数，因此适合批量写入或批量读取。

Pipeline 通常由 Go、Java、JavaScript 等语言的 Redis 客户端提供。Redis 没有一个叫 `PIPELINE` 的命令。

Pipeline 不是事务。它只优化传输效率，不保证这批命令连续执行，也不提供失败回滚。

Pipeline 返回的结果与命令顺序一一对应。例如依次发送 `SET`、`GET`、`INCR`，程序也按这个顺序读取三个结果。

如果其中一条命令执行失败，其他命令仍可能成功。程序需要分别检查每条命令的结果。

不要一次向 Pipeline 塞入无限多的命令。批量数据很大时应分批发送，避免客户端和 Redis 占用过多内存。

### Go 项目中的批量缓存示例

下面使用 `go-redis/v9`，把多件商品集中写入 Redis：

```go
package cache

import (
    "context"
    "fmt"

    "github.com/redis/go-redis/v9"
)

type Product struct {
    ID    int
    Name  string
    Stock int
}

func CacheProducts(ctx context.Context, rdb *redis.Client, products []Product) error {
    _, err := rdb.Pipelined(ctx, func(pipe redis.Pipeliner) error {
        for _, product := range products {
            key := fmt.Sprintf("product:%d", product.ID)

            pipe.HSet(ctx, key,
                "name", product.Name,
                "stock", product.Stock,
            )
        }

        return nil
    })

    return err
}
```

回调函数中的 `HSET` 会先进入 Pipeline。回调结束后，`Pipelined` 会自动集中发送命令并等待结果。

代码中的名称关系：

```go
import "github.com/redis/go-redis/v9" // redis 是导入的包名

rdb := redis.NewClient(...)          // rdb 是 Redis 客户端对象
rdb.Pipelined(...)                   // Pipelined 是客户端对象的方法
```

回调参数中的 `redis.Pipeliner` 则是 go-redis 包导出的接口类型：

```go
func(pipe redis.Pipeliner) error
```

因此，`Pipelined` 来自 go-redis 客户端库，但调用形式是 `rdb.Pipelined(...)`，不是 `redis.Pipelined(...)`。

适合使用 Pipeline 的常见场景包括批量写缓存、批量读取不同 key、批量更新计数和批量设置过期时间。有关联、必须保证连续执行的命令不能只依赖 Pipeline，应考虑事务或 Lua 脚本。

## 14. 发布订阅基础

Redis 发布订阅可以理解为广播频道：

```text
发布者 → 频道 → 所有正在订阅该频道的订阅者
```

先在客户端 A 订阅订单频道：

```text
SUBSCRIBE order:events
```

客户端 A 会保持等待，接收这个频道后续发布的消息。

再在客户端 B 发布消息：

```text
PUBLISH order:events "order:1001:paid"
```

客户端 A 会收到 `order:1001:paid`。如果多个客户端都订阅了 `order:events`，它们都会收到这条消息。

`order:events` 是频道名，不是普通的 Redis key。它不能使用 `GET` 读取，也不会因为 `PUBLISH` 而出现在 `SCAN` 结果中。

发布命令的正确拼写是 `PUBLISH`，不是 `PUBILSH`。

`PUBLISH` 返回收到该消息的订阅者数量。如果没有客户端正在订阅，可能返回 `0`。

发布订阅不会保存历史消息。订阅者离线期间发布的消息会直接丢失，重新上线后不能补收。因此，它适合在线广播、即时通知和缓存失效通知，不适合必须可靠处理的订单、支付等任务。需要保存和确认消费的消息，可以考虑 Redis Stream。

## 15. Stream 消息流基础

Redis Stream 可以理解为一条会保存记录的消息流水。它与发布订阅的关键区别是：Stream 会保存消息，程序可以稍后读取。消息会保留多久，取决于删除或裁剪策略，不应默认它会永久保存。

添加一条订单消息：

```text
XADD order:stream * order_id 1001 status paid
```

各部分含义：

```text
XADD           添加消息
order:stream   Stream 的 key
*              让 Redis 自动生成消息 ID
order_id 1001  消息字段和值
status paid    消息字段和值
```

Redis 会返回类似 `1750000000000-0` 的消息 ID。这个 ID 用来标识消息，也反映消息在 Stream 中的先后顺序。

查看全部消息：

```text
XRANGE order:stream - +
```

其中 `-` 表示最早的消息，`+` 表示最晚的消息。

`order:stream` 是真正的 Redis key，类型是 `stream`。可以执行 `TYPE order:stream` 查看类型，也可以使用 `DEL order:stream` 删除整个消息流。

### XREAD：从某个位置继续读取

从头开始读取最多 10 条消息：

```text
XREAD COUNT 10 STREAMS task:stream 0-0
```

各部分含义：

```text
COUNT 10      最多返回 10 条
STREAMS       后面开始填写 Stream key 和起始 ID
task:stream   Stream 的 key
0-0           读取 ID 大于 0-0 的消息，也就是从头读取
```

如果上次读到的消息 ID 是 `1750000000000-0`，下次可以继续读取它后面的消息：

```text
XREAD COUNT 10 STREAMS task:stream 1750000000000-0
```

`XREAD` 只读取消息，不会把消息从 Stream 中删除。普通 `XREAD` 也不会自动记录应用程序的处理位置，程序需要自己保存最后处理的消息 ID。

如果只是查看 Stream 最前面的 5 条历史消息，可以使用：

```text
XRANGE task:stream - + COUNT 5
```

`XRANGE` 后必须先写开始 ID 和结束 ID，再写可选的 `COUNT`。`XRANGE task:stream COUNT 5` 缺少范围，因此语法不完整。

如果使用 `XREAD` 从头读取最多 5 条，则写成：

```text
XREAD COUNT 5 STREAMS task:stream 0-0
```

### XREAD BLOCK：等待新消息

等待最多 5 秒，接收命令执行之后新增的消息：

```text
XREAD BLOCK 5000 COUNT 10 STREAMS task:stream $
```

各部分含义：

```text
BLOCK 5000   没有新消息时最多等待 5000 毫秒
COUNT 10     最多返回 10 条
$            只等待命令执行之后新增的消息
```

如果 5 秒内没有新消息，命令返回空结果。`BLOCK 0` 表示一直等待，直到新消息到来。

`$` 通常只适合首次等待新消息。收到消息后，程序应保存最后一条消息的 ID，下一次使用该 ID 继续读取，避免跳过两次读取之间到达的消息。

`BLOCK` 的单位是毫秒，10 秒要写成 `10000`。`COUNT` 和 `BLOCK` 都属于读取选项，必须写在 `STREAMS` 之前：

```text
XREAD COUNT 3 BLOCK 10000 STREAMS task:stream $
```

`XREAD BLOCK 10 STREAMS task:stream $ COUNT 3` 有两个问题：它只等待 10 毫秒，而且 `COUNT 3` 放在了 Stream key 和 ID 之后。

### 消费组：让多个消费者分工处理

消费组可以让多个消费者共同处理同一个 Stream。同一组内的新消息通常会分配给其中一个消费者，而不是让所有消费者都重复处理。

先用餐厅接单来理解：

```text
Stream      = 按顺序放好的订单
消费组      = 负责处理订单的后厨团队
消费者      = 团队中的厨师
一条消息    = 一张订单
```

如果有订单 A、B、C，后厨有厨师 1 和厨师 2，Redis 可以这样分工：

```text
订单 A → 厨师 1
订单 B → 厨师 2
订单 C → 空闲的厨师
```

同一个消费组内，一张新订单通常只分给一名厨师，避免两个人重复做同一份菜。消费组的核心价值就是让多个程序分担工作量。

创建名为 `task-workers` 的消费组，并从已有的最早消息开始消费：

```text
XGROUP CREATE task:stream task-workers 0 MKSTREAM
```

各部分含义：

```text
task:stream    Stream 的 key
task-workers   消费组名称
0              从已有的最早消息开始
MKSTREAM       key 不存在时顺便创建空 Stream
```

让组内名为 `worker-1` 的消费者领取最多 3 条新消息：

```text
XREADGROUP GROUP task-workers worker-1 COUNT 3 BLOCK 10000 STREAMS task:stream >
```

其中 `>` 表示领取还没有分配给该消费组中任何消费者的新消息。Redis 会记录消息分配给了哪个消费者，直到消费者确认处理完成。

### XACK：确认消息处理完成

消费者领取消息后，这条消息会处于“已领取但尚未确认”的状态。业务处理成功后，需要使用消息 ID 进行确认：

```text
XACK message:stream message-workers 1750000000000-0
```

各部分含义：

```text
message:stream       Stream 的 key
message-workers      消费组名称
1750000000000-0      已处理成功的消息 ID
```

可以把 `XACK` 理解为工作人员处理完订单后点击“完成”。如果程序领取消息后崩溃，没有执行 `XACK`，Redis 会保留这条消息的待确认记录，便于后续检查和重新处理。

`XACK` 只表示该消费组已经处理完成，不会从 Stream 中删除原始消息。

Redis 命令末尾不要输入中文句号。下面命令中的消息 ID 不能带 `。`：

```text
XACK message:stream message-workers 1750000000000-1
```

### XPENDING：查看尚未确认的消息

查看 `message-workers` 消费组中还有多少消息已经领取但没有执行 `XACK`：

```text
XPENDING message:stream message-workers
```

可以把它理解为查看团队的“未完成订单概况”。它能帮助开发者发现消费者领取后一直没有确认的消息。

Stream 基础处理流程：

```text
XADD       生产消息
XREADGROUP 消费者领取消息
处理业务
XACK       确认处理完成
XPENDING   排查没有确认的消息
```

## 16. 延伸主题

掌握基础命令后，还可以继续了解以下 Redis 开发与运维主题：

- 缓存穿透、缓存击穿与缓存雪崩
- Redis 与 MySQL 的数据一致性
- 分布式锁
- 大 key 与热 key
- RDB 与 AOF 持久化
- 主从复制、哨兵与集群
