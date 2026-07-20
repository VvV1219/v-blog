---
title: Go 后端基础复习笔记
description: 从 Go 语法、HTTP 与权限，到 MySQL、Redis、一致性和测试的后端基础复习笔记
date: 2026-07-20 00:00
category: 学习笔记
tags:
  - Go
  - 后端
  - MySQL
  - Redis
  - 学习笔记
aside: true
comment: true
---

# Go 后端基础复习笔记

## 1. 使用说明与快速复习地图

### 如何使用

- 忘记语法时，先看第 3 节的 Go 核心。
- 看不懂接口时，按第 4、5 节追踪 Route → Middleware → Handler → Service → Repo。
- 涉及数据修改时，重点检查第 6、7 节的事务、幂等和缓存一致性。
- 写测试时，看第 8 节的最小模板。
- 排障或审查代码时，使用第 9 节的阶段定位与检查清单。

### 快速复习地图

| 主题 | 核心问题 |
| --- | --- |
| 环境与配置 | 程序从哪里启动，监听哪里，依赖是否真的可连通？ |
| Go 语法 | 这是类型还是值？变量在哪个作用域？函数何时执行？ |
| HTTP 与权限 | 请求经过哪些中间件？失败是 HTTP 状态码还是 CMS 业务码？ |
| 分层 | 协议、业务规则、数据访问分别由谁负责？ |
| MySQL | 修改范围是什么？操作是否在同一事务？是否已经提交？ |
| Redis | 缓存是否可重建？旧值如何失效？失败后如何恢复？ |
| 测试 | got 和 want 是否安全比较？测试是否定向且不触碰外部环境？ |
| 排障与审查 | 失败发生在编译、启动还是请求阶段？权限、并发和一致性风险在哪里？ |

---

## 2. 环境、配置与连通性

### Go 版本与程序入口

```bash
go version
```

这条命令显示当前电脑实际使用的 Go 版本。`go.mod` 中的：

```go
go 1.24.2
```

表示 module 声明使用的 Go 语言版本。学习阶段先确认本机版本不低于项目要求，最终兼容性仍以构建和测试为准。

程序入口决定从哪个 `main` package 启动，例如 `./cmd/server`。`.env` 文件存在只说明配置文件在磁盘上，不代表程序已经读取配置、完成初始化或开始监听。

### 变量名、变量值与端口

```text
HTTP_ADDR=:8088
REDIS_ADDR=127.0.0.1:6379
```

| 配置 | 变量名 | 完整变量值 | 主机 | 端口 |
| --- | --- | --- | --- | --- |
| `HTTP_ADDR=:8088` | `HTTP_ADDR` | `:8088` | 未指定 | `8088` |
| `REDIS_ADDR=127.0.0.1:6379` | `REDIS_ADDR` | `127.0.0.1:6379` | `127.0.0.1` | `6379` |

- `HTTP_ADDR` 通常告诉当前服务监听哪个地址。
- `*_BASE_URL` 通常告诉当前服务向哪个外部 HTTP 服务发请求。
- 变量名不是端口；端口只是变量值的一部分。

### 最小连通性检查

```bash
docker ps
```

只显示正在运行的容器。结果为空不能证明 MySQL、Redis 没运行，因为它们也可能直接运行在本机。

```bash
mysql -uroot -h 127.0.0.1 -P 3306 -e "SELECT 1;"
```

成功返回 `1`，说明客户端完成了 MySQL 连接、认证和最小查询；它不能证明业务库、表结构和数据已经准备好。

```bash
redis-cli -h 127.0.0.1 -p 6379 ping
```

返回 `PONG`，说明 Redis 可连接且能响应命令；它不能证明应用使用的 Redis DB、Key 或权限配置完全正确。

---

## 3. Go 语言核心

### 3.1 package、import 与基本语法

每个 Go 文件都属于一个 package：

```go
package validation
```

`import` 导入包路径，不直接导入某个函数：

```go
import "errors"

return errors.New("name is required")
```

`errors` 是包名，`New` 是包中的函数。Go 区分大小写，应写 `errors.New`。

Go 的 `if` 必须使用花括号。当前分支已经 `return` 时，通常不需要 `else`：

```go
if input.Name == "" {
    return errors.New("name is required")
}

return nil
```

字符串使用双引号；单引号表示 rune：

```go
name := "apple"
letter := 'a'
```

### 3.2 类型、值与零值

类型描述数据的形状，值是某次实际使用的数据：

```go
API      // 类型
API{}    // API 值
&API{}   // 指向新 API 值的指针
*API     // 指针类型
```

常见类型：

| 类别 | 类型示例 | 值示例 |
| --- | --- | --- |
| 布尔 | `bool` | `true`、`false` |
| 字符串 | `string` | `"apple"`、`""` |
| 整数 | `int`、`int64`、`uint64` | `0`、`7` |
| 浮点数 | `float32`、`float64` | `3.14` |
| struct | `ItemInput` | `ItemInput{Name: "apple"}` |
| slice | `[]string` | `[]string{"fruit"}` |
| array | `[3]int` | `[3]int{1, 2, 3}` |
| map | `map[string]int` | `map[string]int{"a": 1}` |
| pointer | `*API` | `&API{}`、`nil` |
| function | `func(int) error` | 函数名、匿名函数 |
| channel | `chan int` | `make(chan int)` |

`byte` 是 `uint8` 的别名，`rune` 是 `int32` 的别名。`error` 是 Go 内置的 interface 类型，`any` 是 `interface{}` 的别名；当前只要求认识这些类型，不把 interface 实践视为已掌握。

变量未显式赋值时会得到零值：

| 类型 | 零值 |
| --- | --- |
| `int`、`int64` | `0` |
| `string` | `""` |
| `bool` | `false` |
| pointer、slice、map、function、interface、channel、error | `nil` |

array 和 struct 本身不能写成 `nil`；struct 的每个字段会取得各自类型的零值。

### 3.3 变量声明、赋值与作用域

```go
var count int       // 声明，零值为 0
var name = "apple"  // 声明并推断类型
count := 7          // 函数内声明并初始化
count = 8           // 修改已有变量
const maxTags = 10  // 常量，不能重新赋值
```

| 写法 | 用途 |
| --- | --- |
| `var` | 零值声明、显式类型或 package 级变量 |
| `:=` | 只能在函数内使用，左侧至少有一个新变量 |
| `=` | 修改已经声明的变量 |
| `const` | 声明不可重新赋值的常量 |

花括号形成代码块。内层可以访问外层变量，外层不能访问内层声明的变量：

```go
gotErr := ""

if err != nil {
    message := err.Error()
    gotErr = message
}
```

内层写 `gotErr := ...` 会创建同名新变量并遮蔽外层变量；要修改外层变量应使用 `=`。

### 3.4 struct、复合字面量、slice 与 map

struct 是由固定字段组成的自定义类型：

```go
type ItemInput struct {
    Name string
    Tags []string
}

input := ItemInput{
    Name: "apple",
    Tags: []string{"fruit"},
}
```

`ItemInput` 是类型，`input` 是具体值。字段访问应写 `input.Tags`，不能写 `ItemInput.Tags`。

struct、array、slice、map 常使用复合字面量 `Type{...}`：

```go
ItemInput{}
[3]int{}
[]string{}
map[string]int{}
```

多行复合字面量的最后一项也要保留逗号。嵌套写法中的 `}}` 分别关闭内层和外层，不是重复字符。基础类型不能写成 `int{}` 或 `string{}`。

`new` 返回指向零值的指针；`make` 只初始化 slice、map 和 channel，并返回类型本身：

```go
api := new(API)
tags := make([]string, 0)
counts := make(map[string]int)
jobs := make(chan int)
```

slice 是可变长度的同类型集合：

```go
tags := []string{"fruit", "food"}

if len(tags) == 0 {
    return errors.New("tags are required")
}

for _, tag := range tags {
    if tag == "" {
        return errors.New("tag cannot be empty")
    }
}
```

`range` 是关键字，不写成 `range(tags)`。`_` 表示丢弃不需要的索引。

map 是键值集合：

```go
scores := map[string]int{
    "Alice": 90,
    "Bob":   80,
}

aliceScore := scores["Alice"]
scores["Bob"] = 85
```

### 3.5 函数、method、receiver 与指针

函数签名按“名字 类型”的顺序阅读：

```go
func (h *Handler) Get(c echo.Context) error
```

| 部分 | 含义 |
| --- | --- |
| `func` | 声明函数或 method |
| `(h *Handler)` | receiver：变量名 `h`，完整类型 `*Handler` |
| `Get` | method 名 |
| `c echo.Context` | 参数名 `c`，类型 `echo.Context` |
| `error` | 返回类型 |

没有 receiver 的是普通 function：

```go
func Save(api *API) {}

Save(api)
```

有 receiver 的是 method：

```go
func (worker *API) Save() {}

box := &API{}
box.Save()
```

`worker` 只是 method 内部使用的名字，调用处可以叫 `box`。receiver 可暂时类比 JavaScript 的 `this`，但 Go 会明确写出名字和类型。

`&` 取得地址，`*API` 表示指向 `API` 的指针类型：

```go
value := API{}
pointer := &value
api := &API{}
```

指针 receiver 被调用时，Go 复制的是指针；复制后的指针仍指向同一个值，因此 method 可以通过它修改该值。

CMS 示例：

```go
func (a *API) RegisterRouter(g *echo.Group) {
    // 注册路由
}
```

它是 `*API` 的 method，参数 `g` 的类型是 `*echo.Group`，没有返回值，可通过 `api.RegisterRouter(group)` 调用。

### 3.6 error、nil 与多返回值

Go 函数可以返回多个值：

```go
func Find(id int64) (Item, error) {
    // ...
}

item, err := Find(7)
```

结果按顺序接收。被调用函数的结果也可直接继续返回：

```go
func (s *Service) Find(id int64) (Item, error) {
    return s.repo.Find(id)
}
```

判断 error：

```go
err := Validate()
if err != nil {
    message := err.Error()
}
```

- `err == nil`：没有错误。
- `err != nil`：发生错误。
- `err.Error()`：取得错误文本。
- 不能对 `nil` 调用 `Error()`，否则会 panic。

`error` 用于可预期、可处理的失败；普通参数错误、查询失败应返回 error。panic 会中断正常流程，通常表示代码错误或严重状态；即使 Web 框架能通过恢复中间件转成 `500`，业务代码也应避免不必要的 panic。

### 3.7 控制流、defer 与 JSON tag

`switch` 匹配 `case`，普通分支结束后自动退出，不需要 `break`：

```go
switch level {
case 1:
    return "member"
case 2:
    return "admin"
default:
    return "unknown"
}
```

`defer` 把调用推迟到当前函数结束前，常用于释放资源：

```go
func run() {
    fmt.Println("开始")
    defer fmt.Println("清理")
    fmt.Println("处理")
}
```

输出顺序是“开始、处理、清理”。

JSON tag 指定序列化字段名；`omitempty` 表示零值时省略：

```go
type User struct {
    Name     string `json:"name"`
    Nickname string `json:"nickname,omitempty"`
}
```

当 `Nickname` 为空时，结果只包含 `name`。

### 3.8 声明与执行时机

普通 function 和 method 不会因为出现在文件中就自动执行：

| 代码 | 触发方式 |
| --- | --- |
| 普通 function/method | 必须有人调用 |
| `main` | 程序启动时由 Go 运行时调用 |
| `init` | package 初始化时由 Go 运行时调用 |
| `TestXxx` | 执行 `go test` 时由测试框架调用 |
| HTTP handler | 注册路由后，由匹配请求触发 |
| Cron/consumer hook | 注册后，由调度器或启动流程触发 |

```go
report.GET("/new", a.GetReportNew)
```

这里只是注册 handler，不会立即执行 `GetReportNew`。

---

## 4. HTTP、Echo 与 CMS 权限

### 4.1 请求与响应

请求通常包含 Method、URL、Header、Query 和 Body；响应通常包含 HTTP 状态码、Header 和 Body。

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"status":"ok"}
```

状态行、Header 和 JSON Body 是不同部分。在 Echo 的：

```go
c.JSON(http.StatusOK, data)
```

第一个参数设置 HTTP 状态码，第二个参数序列化为响应 Body，二者不会合并成一个 JSON 对象。

### 4.2 路由拼接与处理链

```go
report.GET("/new", a.GetReportNew)
```

Route 根据 Method 和 URL 找到 handler。多层 Group 前缀要逐层拼接：

```text
/api + /report + /new = /api/report/new
```

因此不能只看 handler 附近的局部路径。

常见处理顺序：

```text
请求 → Route → Middleware → Handler → 响应
```

- Middleware：认证、授权、日志、跨域、错误恢复等公共逻辑。
- Handler：读取并校验协议参数、调用业务逻辑、映射错误、返回响应。
- middleware 某个分支直接 `return` 后，后面的 handler 不执行。

Echo handler 示例：

```go
func (a *API) InspectionMark(c echo.Context) error
```

- `c.Bind(&req)` 把请求数据写入 `req` 指向的值。
- `a.Inspection.Mark(...)` 调用业务方法。
- `WebErrorResponse(...)` 返回错误分支。
- `WebSuccessResponse(c, nil)` 的 `nil` 表示没有额外业务数据，不表示整个响应不存在。

### 4.3 401、403、503 与业务错误码

| 状态码 | 含义 | 记忆方式 |
| --- | --- | --- |
| `401` | 未登录或 token 无效 | 不知道你是谁 |
| `403` | 身份已确认，但没有权限 | 知道你是谁，但不让你做 |
| `500` | 后端执行失败 | 服务内部出错 |
| `503` | 依赖暂时不可用 | 暂时无法完成认证或服务调用 |

鉴权依赖超时、不可达或被取消时，应返回 `503`，不能误判为 token 无效的 `401`。

HelloSoul 与 CMS 的错误响应习惯不同：

- HelloSoul 通常使用真实 HTTP `4xx/5xx`，JSON `code` 也表达错误码。
- CMS 的 `WebErrorResponse` 固定使用 HTTP `200`，业务成功与否主要看 JSON `code`；`message` 只是说明。

### 4.4 JWT、Casbin 与 UserPermission

CMS 权限有三道不同职责的闸门：

```text
JwtMiddleware → CasbinMiddleware → UserPermissionMiddleware → handler
```

- JWT：验证 token，确认当前管理员是谁。
- Casbin：检查用户是否能用当前 HTTP method 访问当前 path。
- UserPermission：接口允许访问后，再检查管理员是否能查看或操作某个具体用户的数据。

Casbin 判断所需信息可以记为：

```text
subject：当前用户
object：接口路径
action：HTTP method
```

`u-7` 是权限系统区分用户与角色的命名约定，数据库用户 ID 仍是 `7`。

在 `UserPermissionMiddleware` 中：

- `claims.UserID` 来自已验证的 JWT，表示当前管理员。
- `X-Uid` 表示本次要查看的目标用户。
- 允许时调用 `next(c)`；拒绝时返回业务码 `1450` 和 `no permission to view`。

请求 Body、Query、Path 和普通 Header 都由客户端控制，不能直接作为当前身份。服务端必须使用 Auth/JWT 验证后的身份，再与目标用户比较：

```go
if currentUserID != targetUserID {
    return echo.NewHTTPError(http.StatusForbidden, "no permission")
}
```

### 4.5 Route Name 与分页契约

```go
system.GET("/get_account_info", a.GetAccountInfo).
    Name = "@系统管理,账号,获取账号信息"
```

- Route Name 描述接口在权限列表中的分类和名称。
- 扫描器只收集 Name 以 `@` 开头的路由，形成 path、method、description 权限元数据。
- 权限页面用这份元数据分配接口；运行时再由 Casbin 检查。
- 漏写 Route Name 时，路由仍可能注册，但权限页面通常找不到它；这不等于自动绕过 Casbin。
- Route Name 常用格式是 `@一级分类,二级分类,操作名称`。

列表筛选和分页通常放在 query string：

```text
/cms_api/system/configs?keyword=login&page=2&page_size=20
```

成功响应应同时包含：

- `items`：当前页数据。
- `total`：符合筛选条件的总记录数。

分页要规定边界，例如 `page >= 1`、`1 <= page_size <= 100`，避免无界查询。审计日志可以记录操作者、path、筛选条件、结果和耗时，但不能记录可能含密码、Token 或密钥的完整配置值。

### 4.6 GetRoles 返回码实例

分析陌生 Echo 接口时：先找路由注册和完整 Group 前缀，再找全局/分组/路由中间件，最后进入 handler 列出所有 `return`，并区分 HTTP 状态码与 JSON 业务码。

真实 `GET /cms_api/system/get_roles` 的结果：

| 情况 | 返回结果 | Handler 是否执行 |
| --- | --- | --- |
| CLI 过旧 | HTTP `426` | 否 |
| JWT 缺失或无效 | HTTP `401` | 否 |
| Casbin 拒绝 | HTTP `403` | 否 |
| Bind/Validate 失败 | HTTP `200` + JSON code `400` | 是 |
| DB 失败 | HTTP `200` + JSON code `600` | 是 |
| 成功 | HTTP `200` + JSON code `0` | 是 |

成功时 `result` 包含 `items` 和 `total`。

---

## 5. 分层与业务调用链

### 5.1 Handler、Service、Repo

```text
HTTP 请求 → handler → service → repo → 数据库
HTTP 响应 ← handler ← service ← repo
```

| 层 | 主要职责 |
| --- | --- |
| Handler | 协议输入输出：Bind、Validate、HTTP 状态与响应格式 |
| Service | 业务规则、流程顺序、跨 repo 或外部依赖编排 |
| Repo | SQL/GORM、数据库行与 model 的转换 |

需要被 HTTP、WebSocket 等不同入口复用的业务规则应放在 service，避免多个 handler 各写一套后逐渐不一致。

### 5.2 HelloSoul 发起邀请

```text
POST /hellosoul/api/invitations
→ ECDHBody → Auth
→ TeamHandler.SendInvite
→ TeamService.SendInvitation
→ TeamService.checkPairAvailableForLocation
→ TeamRepo.PairLocationOccupancies
→ SELECT exploration_member
```

`PairLocationOccupancies` 只查询两名用户在指定地点各自属于哪个 `pair_key`；是否允许邀请由 service 判断。

业务错误由 service 产生，协议表现由 handler 决定：

- `ErrTeamSelfInvite` → HTTP `400 Bad Request`。
- `ErrUserLocationBusy` → HTTP `409 Conflict`。

成功时 service 还会编排通知：对方在线且空闲时发送 WebSocket `invitation.received`；离线时通过平台 RPC 发送 IM 邀请卡片。service 返回邀请链接、ID 和过期时间，handler 再转换成 HTTP 响应。

### 5.3 CMS 分层实例

CMS 是演进式代码库，分层并不完全一致：

- `GetAccountInfo` 在 `api/system/account.go` 的 handler 中直接用 GORM 查询并组装响应。
- `DeleteAccount` 的 handler 负责 Bind/Validate、调用 service 和响应；复杂回收由 `CmsAccountService.AccountRecycling` 编排。
- `AccountRecycling` 涉及多个 MySQL、Redis/缓存、NSQ 和下游通知，放在 service 更便于复用与维护。

阅读时应依据相似实现和复杂度判断边界，不因看到旧 handler 直连 DB 就一次性重构全项目。

---

## 6. SQL、MySQL 与 GORM

### 6.1 SELECT、JOIN、WHERE 与 UPDATE

```sql
SELECT name
FROM users
WHERE id = 7;
```

`SELECT` 读取数据，不修改数据。可继续排序和限制条数：

```sql
SELECT *
FROM orders
WHERE status = 'paid'
ORDER BY created_at DESC
LIMIT 10;
```

常见顺序：`SELECT → FROM → JOIN ... ON → WHERE → ORDER BY → LIMIT`。

`JOIN ... ON ...` 根据关联条件组合两张表：

```sql
SELECT orders.id, users.name, orders.amount
FROM orders
JOIN users ON orders.user_id = users.id
WHERE orders.status = 'paid';
```

不同表有同名字段时，使用 `表名.字段名` 明确来源。

`UPDATE` 修改已有数据：

```sql
UPDATE users
SET status = 0
WHERE id = 7;
```

无 `WHERE` 的风险：

| SQL | 影响 |
| --- | --- |
| `SELECT` | 读取所有行，不修改数据，但可能造成大量读取 |
| `UPDATE` | 修改所有行，可能造成大范围数据破坏 |

修改前应使用完全相同的 `WHERE` 先查询并确认范围：

```sql
SELECT * FROM users WHERE id = 7;
UPDATE users SET status = 0 WHERE id = 7;
```

安全顺序是“同条件 SELECT → 确认目标行 → UPDATE”。两者仍是两条独立 SQL。

### 6.2 唯一约束与联合主键

`UNIQUE` 限制一列或一组非空业务值不能重复。联合主键限制字段组合不能重复，单个字段仍可分别重复：

```sql
PRIMARY KEY (pair_key, location_id)
```

已有 `("1_2", 10)` 时，再插入相同组合会失败，插入 `("1_2", 11)` 可以成功。

HelloSoul：

- `exploration` 使用 `(pair_key, location_id)`，防止同一对用户重复创建同一地点的探索。
- `exploration_member` 使用 `(location_id, user_id)`，防止同一用户在同一地点同时属于不同探索组合。即使更换 `pair_key`，相同 `(location_id, user_id)` 仍会冲突。

### 6.3 事务、COMMIT 与 ROLLBACK

事务把一组数据库操作作为一个工作单元：

```sql
START TRANSACTION;

UPDATE users
SET status = 0
WHERE id = 7;

COMMIT;
```

- `COMMIT`：保存事务中的全部修改。
- `ROLLBACK`：撤销当前事务中尚未提交的修改。
- 单条 SQL 执行成功不等于永久保存；后续 `ROLLBACK` 仍可撤销。
- 一旦事务成功 `COMMIT`，普通 `ROLLBACK` 不能撤销已提交结果。

### 6.4 参数化查询

```go
db.Where("id = ?", adminID).First(&admin)
```

`"id = ?"` 是查询模板，`adminID` 作为参数单独绑定。不要把用户输入直接拼进 SQL，否则输入可能改变查询结构并形成 SQL 注入。

### 6.5 GORM、原生 SQL 与数据库客户端

MySQL 和 Redis 都是独立运行的服务，Go 程序必须通过网络协议与它们通信。

- GORM 面向关系型数据库；`Model/Where/First/Updates/Create` 等调用由 GORM 生成 SQL。
- `Raw/Exec` 允许开发者写参数化原生 SQL，再由 GORM管理连接、事务和结果映射。
- 不使用 GORM 时，可通过标准库 `database/sql` 配合 MySQL driver 建立连接并执行 SQL。
- Redis 不使用 GORM；CMS 使用 go-redis。`redis-cli` 面向人工终端，go-redis 面向后端程序。

选择原则：普通 CRUD 优先使用表达清晰的 GORM；复杂多表 JOIN、聚合统计或需要精确控制 SQL 时，可使用参数化原生 SQL。原生 SQL 不天然更快，性能取决于扫描行数、JOIN、返回量等实际行为。同一 GORM 事务的 `tx` 中可以混用 `Create/Save` 与 `Raw/Exec`。

GORM 方向记忆：

```go
db.Where("id = ?", adminID).First(&admin)

db.Model(&cmsmodel.Admin{}).
    Where("id = ?", adminID).
    Updates(data)
```

```text
First：数据库 → Go 变量
Updates：Go 数据 → 数据库
```

`Find(&admins)` 读取多条记录，`Create(&admin)` 新增记录；动作名和承载数据的变量要分清。

### 6.6 database/sql 的 JOIN 与参数顺序

HelloSoul `TeamRepo.ByUserAndLocation` 使用原生 `database/sql`：

```sql
FROM exploration_member tem
INNER JOIN exploration te
    ON te.pair_key = tem.pair_key
   AND te.location_id = tem.location_id
WHERE tem.location_id = ?
  AND tem.user_id = ?
```

- `tem`、`te` 是表别名。
- 两个 `ON` 条件都必须满足。
- `QueryRowContext(ctx, q, locationID, userID)` 按占位符出现顺序绑定参数。
- `QueryRowContext`、`QueryContext`、`Scan` 是识别 `database/sql` 的线索，不是 GORM。

本地只读验证中，1 条 `exploration` 与 2 条 `exploration_member` JOIN 后得到 2 行。共享进度只在 `exploration` 保存一份；因匹配两个成员而展示两次，不代表进度保存了两份。

### 6.7 GetAccountInfo 的主从与 GORM

- master（primary）通常承接写入，是权威数据源；需要立刻读到刚写入的数据时常从 master 读取。
- slave（replica）从 master 复制数据并分担读请求；复制并非绝对同步，可能短暂读到旧数据。

CMS `GetAccountInfo` 中：

- `CmsMasterDb...First(&admin)`：通过 GORM 从 CMS MySQL master 读取管理员数据。
- `ImSlaveDb...First(&userBase)`：通过 GORM 从 IM MySQL slave 读取用户基础数据。

这与 HelloSoul `TeamRepo` 的原生 `database/sql` 写法不同。

---

## 7. Redis、缓存与一致性

### 7.1 Redis 的定位

Redis 是多台后端实例通过网络共享的高速数据服务，可类比为服务端共享的 `Map`，但支持 TTL 等能力。它不同于浏览器 `sessionStorage`：后者只属于某个浏览器标签页。

在已学习的缓存场景中：

- MySQL 是业务真实数据源。
- Redis 是可删除、可重建的高速副本。
- 只改 Redis 不改 MySQL，缓存过期、重启或淘汰后会从数据库回填旧值，修改会看似丢失。

### 7.2 String、Hash、TTL 与 NX

String：

```redis
PING
SET learning:redis:config 20
GET learning:redis:config
SET learning:redis:config 30
```

`PING` 返回 `PONG` 表示服务可连接；同一 key 再次 `SET` 会覆盖旧值。隔离 key 已实际验证从 `20` 覆盖为 `30`。

Hash 在一个 key 下保存多个 `field → value`：

```redis
HSET learning:redis:player:207 name Mina level 3 coins 100
HGET learning:redis:player:207 name
HINCRBY learning:redis:player:207 coins 25
HSET learning:redis:player:207 level 4
HGETALL learning:redis:player:207
```

验证结果：`name=Mina`、`level=4`、`coins=125`。第一次 `HSET` 返回 `3`，因为新增三个字段；覆盖已有 `level` 返回 `0`，表示没有新增字段，不表示写入失败。`HGETALL` 的业务代码不应依赖字段返回顺序。

`HINCRBY` 原子增加整数型字段并返回新值；字段不存在时从 `0` 开始，旧值不是整数时会报错。Hash 的 TTL 作用于整个 key，不能单独给 field 设置 TTL。

删除与过期：

```redis
DEL key
EXISTS key
SET key value EX 60
TTL key
```

- `DEL` 返回实际删除的 key 数；不存在时为 `0`。
- `EXISTS` 返回 `0` 表示 key 不存在。
- `SET ... EX 60` 设置 60 秒过期。
- `TTL` 为正数表示剩余秒数，`-2` 表示 key 不存在。

简单互斥写入：

```redis
SET lock:key owner EX 30 NX
```

`NX` 表示只在 key 不存在时写入。已有锁时命令返回空，旧 value 不变。Redis key 精确匹配，拼写错误会创建另一个 key 并绕过互斥；验证时既要看命令返回值，也要检查是否产生错误 key。

### 7.3 cache-aside

读取：

```text
查 Redis
├─ 命中：直接返回
└─ 未命中：查 MySQL → 回填 Redis → 返回
```

缓存未命中不表示数据库没有业务数据。

写入通常是：

```text
更新 MySQL → 删除 Redis 旧缓存
```

若 MySQL 查询失败，就拿不到可信业务值，请求通常返回错误。若 MySQL 已查到 `400`、但回填 Redis 的 `SET` 失败，仍可返回 MySQL 的 `400`；只是后续请求会再次查询 MySQL。

TTL 能让旧缓存到期消失，但不保证后续 MySQL 查询或 Redis 回填一定成功。

### 7.4 幂等、request_id 与事务边界

“余额增加 10”是非幂等操作：第一次成功但响应丢失时，客户端重试可能把余额从 `100` 变成 `110`，再变成 `120`。

常见幂等方案：同一业务请求携带相同 `request_id`，数据库对它建立 `UNIQUE` 约束。第一次记录编号并执行业务；重试发现编号已存在时，不再重复修改，而是返回第一次结果。

幂等记录与业务修改必须放在同一事务：

```text
INSERT request_id
UPDATE 余额
INSERT pending Outbox
COMMIT
```

任一步失败都 `ROLLBACK`。例如 request_id 插入成功、余额暂时从 `500` 改为 `400`，但 Outbox 插入失败，最终三项都不存在或恢复原值：request_id 不存在、余额为 `500`、Outbox 不存在。

两个实例用同一 `request_id` 并发执行时，都可能开始事务，但唯一约束只允许一个事务成功提交。成功事务扣款一次并插入一条 Outbox；失败事务整体回滚。最终余额 `400`、request_id 记录 `1` 条、Outbox 记录 `1` 条。

### 7.5 Outbox 与消息幂等

Outbox 是约定俗成的名字，也可以使用其他表名；关键是职责。它通常是一张多个业务共用的 MySQL 待办事件表，不是每张业务表各配一张。

业务修改与 `pending` 事件放进同一 MySQL 事务。提交后 worker 反复处理，外部操作成功才标记 `done`，失败则重试。这样进程在发送前后崩溃时，任务不会只存在内存中而永久丢失。

最小字段职责：

| 字段 | 作用 |
| --- | --- |
| `id` | 标识 Outbox 记录 |
| `event_type` | 生产者与 worker 约定的任务类型 |
| `payload` | 执行参数，例如 `popup_id` |
| `status` | `pending/processing/done/failed` 等阶段 |
| `retry_count` | 失败重试次数 |

例如 worker 根据 `event_type=delete_popup_cache` 选择删除缓存逻辑，再从 payload 取得 `popup_id=17`。失败后任务类型和参数不变，只更新 `status`、`retry_count` 和可选的下次重试时间。

消息可能在“外部操作成功、但状态还没标记 done”时被重复处理，因此消费者应尽量幂等：重复删除同一个缓存 key，最终都是“不存在”；重复执行“余额增加 10”则会持续改变余额，不幂等。

MySQL `COMMIT` 后本地事务已结束。随后 Redis、消息或 RPC 失败，不能使用原事务的 `ROLLBACK`；要通过重试、补偿或最终一致性机制恢复。另开事务把余额改回去是新的补偿业务，不是原事务回滚。

### 7.6 CMS Popup 清缓存失败实例

真实链路：

```text
PopupService.UpdatePopup 写 ImMasterDB
→ PopupClearCache
→ cache.ClearCache 发送 Pulsar 清缓存消息
```

handler 使用 `_ = PopupClearCache(...)` 丢弃错误。因此：

- DB 写入失败时分支直接 `return`，后续清缓存不会执行，接口返回业务错误。
- DB 从 `10` 更新为 `20` 后，若 Pulsar 清缓存失败且错误被忽略，MySQL 为 `20`、Redis 仍为 `10`，接口仍返回成功。
- 后续优先读缓存的用户暂时看到 `10`。这证明“接口成功”不等于完整业务效果已生效。

恢复方向：Outbox 的 `pending` 任务负责持续重试，尽快删除旧缓存；TTL 不重试消息，而是在到期后让旧值消失，下一次 cache miss 再从 MySQL 读取 `20` 并回填。两者都是最终一致性手段，但作用不同。

若 MySQL 已正确提交余额 `400` 而 Redis 仍是 `500`，目标是让 Redis 最终变成 `400`，不是把真实数据源 MySQL 改回 `500`。

### 7.7 HelloSoul invitation/exploration 事务与并发

接受邀请时，`TeamRepo.CreateExploration` 在同一个 `WithTx` 中：

```text
INSERT exploration
→ INSERT 两条 exploration_member
→ COMMIT
```

第二次 INSERT 失败会回滚第一次 INSERT，避免留下只有共享进度、没有成员关系的半成品。

`CreateExploration` 成功返回时 MySQL 已 COMMIT；Redis `roomIntimacyReset`、内存邀请状态更新和 WebSocket `invitation.accepted` 都在事务外。它们失败时不能使用原 MySQL `ROLLBACK` 撤销已提交的 exploration。

并发保护分两层：

1. `BeginPendingInvitationAccept` 在进程内互斥锁中把邀请标为 `Accepting=true`。同一实例的第二个并发 Accept 被拒绝，不进入数据库创建。
2. 两个实例的内存相互独立，仍可能同时进入数据库事务。所有实例共享的联合主键/唯一约束提供最终保护。

两个事务都可能执行，但只有一个成功提交；另一个因约束冲突整体回滚。最终保留 1 条 `exploration` 和双方 2 条 `exploration_member`。

---

## 8. Go 测试

### 8.1 文件与入口

```text
validation.go       // 业务代码
validation_test.go  // 测试代码
```

测试文件必须以 `_test.go` 结尾，测试入口是 package 级普通函数：

```go
import "testing"

func TestValidateItem(t *testing.T) {
    // 测试代码
}
```

`t` 由 `go test` 创建并传入。带 receiver 的 `func (a *API) TestXxx(...)` 不会被自动发现。`go build` 不会把 `_test.go` 编入线上服务二进制。

`go test` 是 Go 工具链命令，不是项目自己定义的命令：

```bash
go help test
```

### 8.2 got、want 与 nil 安全

```text
got  = 实际结果
want = 期望结果
```

error 要先保护 nil，再比较文本：

```go
err := ValidateItem(test.input)

gotErr := ""
if err != nil {
    gotErr = err.Error()
}

if gotErr != test.wantErr {
    t.Errorf("got %q, want %q", gotErr, test.wantErr)
}
```

如果期望值本身是 `error`，也必须先判断 `test.wantErr != nil` 再调用 `Error()`。`wantErr: nil` 表示期望成功，不表示“没有返回值”。

`wantErr` 是测试契约，不是业务输入字段，不能塞进 `ItemInput`。

### 8.3 Errorf 与 Fatalf

```go
t.Errorf("got %q, want %q", got, want)
```

- `%q`：带引号并转义字符串，空字符串显示为 `""`。
- `%s`：直接显示字符串。
- `%d`：十进制整数。
- `%v`：默认格式。
- `%T`：值的类型。

`t.Errorf` 标记失败后继续当前测试；`t.Fatalf` 报告失败后立即停止当前测试。输出出现在终端、IDE 测试面板或 CI 日志，默认不进入线上服务日志。

### 8.4 表驱动测试

```go
tests := []struct {
    name    string
    input   ItemInput
    wantErr string
}{
    {
        name:    "empty name",
        input:   ItemInput{Name: "", Tags: []string{"fruit"}},
        wantErr: "name is required",
    },
    {
        name:    "empty tags",
        input:   ItemInput{Name: "apple", Tags: []string{}},
        wantErr: "tags are required",
    },
    {
        name:    "empty tag",
        input:   ItemInput{Name: "apple", Tags: []string{""}},
        wantErr: "tag cannot be empty",
    },
    {
        name:    "valid input",
        input:   ItemInput{Name: "apple", Tags: []string{"fruit"}},
        wantErr: "",
    },
}

for _, test := range tests {
    err := ValidateItem(test.input)

    gotErr := ""
    if err != nil {
        gotErr = err.Error()
    }

    if gotErr != test.wantErr {
        t.Errorf("got %q, want %q", gotErr, test.wantErr)
    }
}
```

`tests` 是全部用例，`test` 是当前用例，`test.input` 才是传给业务函数的输入。空 slice `[]string{}` 与包含空字符串的 slice `[]string{""}` 不同。每个场景最好只验证一个失败原因；测试后面的校验分支时，要先让前面的条件通过。

### 8.5 安全定向命令与 gofmt

```bash
go test ./path/to/package
go test ./path/to/package -run TestValidateItem -v
```

项目测试可能依赖数据库或外部服务，应优先运行已确认安全的定向纯函数测试。

`gofmt` 统一 Go 代码的缩进和排版；先保证语法正确，再用它整理格式。

---

## 9. 排障与代码审查速查

### 9.1 按阶段定位故障

```text
编译 → 启动 → 监听端口 → 收到请求 → 处理请求
```

| 阶段 | 表现 | 常见原因 |
| --- | --- | --- |
| 编译失败 | 无法生成可运行程序 | 语法或类型错误 |
| 启动失败 | 监听前退出 | 配置错误、依赖初始化失败 |
| 请求阶段失败 | 服务已监听，收到请求后出错 | middleware、handler 或依赖调用失败 |

先确认失败属于哪个阶段，再读对应日志和调用链，不要把“容器没运行”“端口没监听”“接口返回错误”混为一类。

### 9.2 常见误区

| 误区 | 正确认识 |
| --- | --- |
| `*API` 和 `API` 一样 | 前者是指针类型，后者是值类型 |
| receiver 名必须和调用变量名一致 | receiver 名只在 method 内部有效 |
| `:=` 可以修改所有变量 | 它会声明变量，内层同名变量可能遮蔽外层；修改已有变量用 `=` |
| 类型名就是具体值 | `API` 是类型，`API{}` 才是值 |
| 注册 handler 会立即执行 | 只有匹配请求到达后才执行 |
| `401` 和 `403` 都是没权限 | `401` 是身份问题，`403` 是身份明确后的授权问题 |
| CMS HTTP `200` 就代表业务成功 | 还要检查 JSON `code` |
| SQL 执行成功就永久保存 | 事务仍可能回滚，只有 COMMIT 才正式提交 |
| COMMIT 后还能用原事务 ROLLBACK | 原事务已经结束，只能重试外部步骤或执行新的补偿 |
| HSET 返回 `0` 就是失败 | 可能只是覆盖已有字段，没有新增字段 |
| 缓存 miss 就是业务数据不存在 | 仍要查询真实数据源 MySQL |
| 接口返回成功就代表缓存已刷新 | Popup 实例中清缓存错误被忽略，旧值仍可能存在 |

### 9.3 安全审查清单

阅读或修改后端代码时，至少检查：

- 路由：完整 path 是否包含所有 Group 前缀？Method 是否正确？
- 权限：JWT、Casbin、UserPermission 各负责哪一步？Route Name 是否可被权限页面扫描？
- 身份：是否错误信任了客户端传来的 user ID？
- 参数：Bind/Validate 是否覆盖空值、边界和分页限制？
- 响应：HTTP 状态码与 CMS JSON 业务码是否区分？
- 分层：协议转换、业务规则、数据访问是否放在合适位置？
- SQL：是否参数化？`UPDATE` 是否有正确 `WHERE`？修改前是否确认影响范围？
- 事务：必须一起成功的操作是否同事务？哪些外部操作在 COMMIT 之后？
- 幂等：重试或多实例并发是否会重复执行非幂等业务？是否有 request_id 和数据库约束？
- 缓存：MySQL 是否为真实数据源？删除缓存失败后是否有重试或 TTL 兜底？
- 错误：是否丢弃了关键 error？nil 是否被安全判断？
- 测试：是否覆盖成功、失败和边界？命令是否定向且不会连接危险环境？
- 日志：是否避免记录密码、Token、密钥或完整敏感配置？

这份清单用于复习和审查，不替代真实构建、测试、运行证据或 reviewer 确认。
