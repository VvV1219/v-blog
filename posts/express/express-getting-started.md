---
title: Express 学习笔记
date: 2026-06-11
tags: [Node.js, Express, 笔记]
---

> 代码扒自 [Express 官方示例库](https://github.com/expressjs/express/tree/master/examples)（66k★）。

## 心智模型

**一条流水线**：请求一头进、一头出，中间排着一串「工位」（中间件）。我的接口只是末端一个工位。

```
请求 → [工位1] → [工位2] → … → [接口] → 响应
```

## 中间件 = 工位

`app.use(xxx)` = 加工位，**写前面的先跑**，顺序就是逻辑。

```js
app.use(express.json());   // 解析 JSON body → req.body
```

四种来源（看到任何 `app.use` 都能归类）：

- **内置** `express.json()` / `express.static()`
- **第三方** `morgan` / `cookie-parser` / `cors`（npm 装的）
- **应用级** 自己写、`app.use(fn)` 全局生效
- **路由级** 自己写、只挂某条路由（如下面的门卫）

⚠️ **没装 `express.json()`，`req.body` 就是空的**。收 JSON 装 json，收表单装 urlencoded。**收什么装什么。**

## next()

中间件签名永远 `(req, res, next)`。

- `next()` → 放行去下一站。
- **不调 next 又不响应 → 请求卡死**。

## 门卫模式（超常用）

满足条件放行，不满足当场拦：

```js
function restrict(req, res, next) {
  if (req.session.user) next();        // 通过 → 放行
  else res.redirect('/login');         // 不通过 → 当场响应，结束
}
app.get('/restricted', restrict, handler);  // 路由能串多个工位
```

登录校验、参数校验、权限检查全是这套路。**我 MVP 的「没传 url 返回 400」就是它。**

## 路由

- `app.get/post/put/delete(路径, 处理函数)`，路径 `:id` 用 `req.params.id` 取。
- **从上往下、先到先得** → 具体路由放前面，通配 `:id` / 404 兜底放后面。顺序错逻辑就错。

## 错误处理

- `next()` 放行 / `next(err)` 报错 → **跳过普通工位直奔错误工位**。
- 错误中间件靠**4 个参数** `(err, req, res, next)` 被认出，放**最后**。
- **404 不是错误**，是没人匹配 → 兜底 `app.use` 放所有路由后面。
- ⚠️ **`async` 接口的错 Express 4 接不住，自己 `try/catch`**；资源（浏览器）在 `finally` 关。

## req / res 速查

- 读：`req.body`（先装解析工位）、`req.params.id`、`req.query`
- 发（**只能发一次**）：`res.send()` / `res.json()` / `res.status(404).json()`
- ⚠️ 发两次 → `Cannot set headers...`。一进一出，出一次。

## 工程化（项目变大才用）

- **`express.Router()`** = 小号 app，按业务拆文件：`router.get(...)` + `module.exports = router`，主文件 `app.use('/users', router)` 挂回去加前缀。
- **`app.set(k, v)`** 设配置；**`process.env.XXX`** 读环境变量（端口/密钥别写死），`NODE_ENV` 区分开发/生产。

## 对照我的 MVP（每步用到啥）

| 步骤 | Express 知识点 |
| --- | --- |
| 1 空壳 | `express()`、`app.use(express.json())`、`app.listen` |
| 2 占位 | `app.post`、`res.json` |
| 3 守门 | `req.body`、`res.status(400).json()`（门卫模式） |
| 4 截图 | `req.body.url` 拿值、`res.status(200).json()` 返回 |
| 5 错误 | `try/catch`（JS 的活）+ `res.status(500).json()`、`finally` 关浏览器 |

> 第 0 层 MVP 就这些，不需要更多 Express 知识。

## 环境准备（截图 MVP 用）

截图接口靠 Puppeteer 驱动浏览器，跑之前要装两样：

```bash
pnpm add puppeteer                       # 装库（当前 puppeteer 25.1.0）
npx puppeteer browsers install chrome    # 单独下 Chromium
```

⚠️ **只装库不下浏览器，`puppeteer.launch()` 会报「找不到浏览器」**。新版默认不再自带 Chromium，得手动 `browsers install` 一次。

## 自检

先盖住答案，能说清再往下看。

**1. `app.use` 顺序为什么重要、中间件四种来源**
请求从上往下穿过工位，写前面的先跑——解析、鉴权这类要放在用到它们的接口之前。来源：内置（`express.json`/`static`）、第三方（`morgan`/`cors`）、应用级（`app.use(fn)` 全局）、路由级（只挂某条路由）。

**2. `req.body` 为什么空、怎么不空**
没装解析工位时 Express 不碰 body，`req.body` 就是 `undefined`/空。收 JSON 装 `express.json()`、收表单装 `express.urlencoded()`——收什么装什么。

**3. `next()` vs `next(err)`**
`next()` 放行去下一个普通工位；`next(err)` 带参数 → 跳过所有普通工位，直奔 4 参数的错误工位。

**4. 门卫怎么放行/拦截**
条件满足调 `next()` 放行；不满足当场 `res.redirect`/`res.status().json()` 响应并结束，不调 `next`。

**5. 路由为什么具体在前、通配在后**
匹配是从上往下先到先得。`:id`、404 兜底这类通配如果放前面会先吃掉请求，具体路由就再也轮不到。

**6. 错误中间件为什么 4 参数、放最后**
Express 靠参数个数（`(err, req, res, next)` 四个）认出它是错误工位；放最后才能兜住前面所有工位 `next(err)` 抛过来的错。

**7. async 错误为什么要自己 try/catch、`finally` 关浏览器**
Express 4 接不住 `async` 函数里 reject 的 Promise，不 `try/catch` 就直接挂、请求卡死。浏览器等资源无论成败都得释放，所以放 `finally`。

**8. `express.Router()` 干嘛的**
一个「小号 app」，按业务把路由拆到独立文件（`router.get(...)` + `module.exports = router`），主文件 `app.use('/users', router)` 挂回去并统一加前缀。
