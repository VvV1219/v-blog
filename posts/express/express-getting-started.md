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

## 自检

- [ ] `app.use` 顺序为什么重要、中间件四种来源
- [ ] `req.body` 为什么空、怎么不空
- [ ] `next()` vs `next(err)`
- [ ] 门卫怎么放行/拦截
- [ ] 路由为什么具体在前、通配在后
- [ ] 错误中间件为什么 4 参数、放最后
- [ ] async 错误为什么要自己 try/catch、`finally` 关浏览器
- [ ] `express.Router()` 干嘛的

> TODO：空文件夹 `npm i express`，拼个门卫 + 错误工位的小服务，curl 看它放行/拦截/报错。**看十遍不如卡一次 bug。**













自己补充的：
环境）：
✅ pnpm add puppeteer —— 装上了 puppeteer 25.1.0
✅ npx puppeteer browsers install chrome —— 下好了 Chromium（不然 launch 时会报找不到浏览器）
