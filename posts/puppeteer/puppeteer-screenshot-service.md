---
title: Puppeteer 高并发截图服务 · 从「能跑」到「可观测」的 18 关
date: 2026-06-17
tags: [Node.js, Puppeteer, 高并发, 后端, 学习笔记]
description: 边做边学一个 Puppeteer 截图服务，逐关加上浏览器池、超时、熔断、去重、缓存、可观测性，沉淀出一套「依赖外部资源的高并发服务」通用骨架。
---

> 一个边做边学的 Puppeteer 截图服务笔记，功能上是给前端调用的截图接口。
> 起点：收一个 URL，返回网页截图。之后一关一关加上并发处理、可靠性、可观测性。
> 记录方式：每关先记**可迁移的思维**，再记**不做会出什么事**，最后记关键代码和坑。代码记不住没关系，记住「不做会炸」，代码能推出来。

---

## 演进主线

这是个边做边学的项目，按知识点逐关迭代。功能上就是给前端调用的截图服务；下面的演进线是这么搭起来的——每关先想清楚「不做会出什么问题」，再决定怎么加：

```text
能跑                → 第 1 步：基础截图
  ↓ 太慢 / 会炸
省资源、别崩         → 第 2~6 步：复用浏览器、校验、错误收口、浏览器池、优雅关闭
  ↓ 流量一大就雪崩
扛得住并发           → 第 7~10 步：排队超时、动态伸缩、健康检查、页面池
  ↓ 一个坏网站能拖死整个服务
出事能自愈           → 第 11~13 步：去重、熔断、缓存
  ↓ 线上出问题查不到
查得到、看得见       → 第 14~17 步：资源拦截、结构化日志、请求追踪、Prometheus 监控
  ↓ 非 HTTP 调用方复用不了
可扩展、能复用       → 第 18 步：分层架构
```

关键认知：**这套骨架几乎与「截图」无关。** 把「浏览器」换成「数据库连接」「第三方 API」，池化、排队、超时、熔断、去重、缓存、优雅关闭、追踪 ID 这一整套，是所有「依赖外部资源的高并发服务」的通用模板。

---

## 阶段一 · 地基：从「能跑」到「别炸、别崩」

### 1. 基础截图

**思维**：贵的东西要复用；复用一个**异步资源**时，要缓存的是**那个正在进行的任务（Promise）**，不是任务的结果。

**做什么**：收一个 url，用 puppeteer 打开网页、截图、返回 base64。

```js
app.post("/screenshot", async (req, res) => {
  const { url } = req.body;
  const browser = await getBrowser();      // 复用浏览器，而不是每次 launch
  const page = await browser.newPage();
  await page.goto(url);
  const base64 = await page.screenshot({ encoding: "base64" });
  res.json({ screenshot: `data:image/png;base64,${base64}` });
});
```

开一个 Chrome 要 1~2 秒。每个请求都 `puppeteer.launch()`，10 个并发就开 10 个 Chrome，内存炸还慢。所以浏览器要存起来复用。

**缓存 Promise，而不是 await 完的 browser**：

```js
let browserPromise = null;
const getBrowser = () => {
  if (!browserPromise) browserPromise = puppeteer.launch(); // 缓存的是 Promise
  return browserPromise;
};
```

缓存 await 完的 browser 时，两个请求**同时**第一次进来，启动还没完、缓存还是空，于是各启动一个 Chrome。缓存 Promise 则两个请求拿到**同一个正在进行的启动任务**，只开一次。

> 这个「缓存进行中的任务」模式，第 11 步请求去重会再次出现。

---

### 2. 参数校验中间件

**思维**：把「放行/拦截」的判断从业务逻辑里拆成独立关卡；报错对用户友好（一次性报全）。

中间件本质是插在路由前的函数，是个「安检口」。调 `next()` 放行，调 `next(err)` 跳错误处理，**啥都不调请求就卡死**（常见 bug）。

```js
const validate = (req, res, next) => {
  const errors = [];
  if (!req.body.url) errors.push("url 必填");
  if (req.body.width && isNaN(req.body.width)) errors.push("width 必须是数字");
  if (errors.length) return res.status(400).json({ errors }); // 一次性返回所有错
  next();
};
app.post("/screenshot", validate, handler); // 安检通过才进 handler
```

累积错误一起返回：「验一个报一个」会让用户改一次提交一次、再被告知下一个错，体验差。

**坑：`Number.isNaN` vs `isNaN`**

```js
Number.isNaN("abc") // false ← 只认 NaN 这个值本身，"abc" 是字符串不是 NaN
isNaN("abc")        // true  ← 先把 "abc" 转成数字（→ NaN）再判断
```

校验用户传来的字符串得用 `isNaN()`。用错了校验形同虚设。

---

### 3. 统一错误处理

**思维**：同类处理要收敛到一处。错误散落在各 handler，有的返回 500、有的 400、格式还不一样，前端没法统一处理。

原生 `Error` 没有 HTTP 状态码，自定义错误类加一个：

```js
class AppError extends Error {
  constructor(message, statusCode = 500) {
    super(message);
    this.statusCode = statusCode;
  }
}
class ScreenshotError extends AppError { /* 截图专用 */ }
```

**错误中间件必须是四个参数**——Express 靠**参数个数**识别错误处理器，少一个就被当成普通中间件：

```js
app.use((err, req, res, next) => {
  res.status(err.statusCode || 500).json({ error: err.message });
});
```

且**必须挂在所有路由之后**：中间件从上往下执行，错误处理器在最后才兜得住前面所有 `next(err)`。

```text
请求 → 校验中间件 → 业务 handler ──(出错 next(err))──→ 错误中间件 → 返回
```

---

### 4. 浏览器池（借 / 还 / 排队）· 核心

**思维**（本项目最核心的认知）：**没资源时不立刻失败，而是把「我承诺给你」这件事挂起——把 `resolve` 函数存进队列，等资源回来再调它。**

单例只有一个浏览器，多个并发会抢同一个、互相覆盖页面。池子让每个请求有自己的浏览器。

类比：图书馆借书。书架上有几本（idle），来人借走、看完还回来；没书了就在登记本上排队（waiters），有人还书就按顺序通知下一个。

**把 `resolve` 存起来给别人调** ⭐

```js
// 没浏览器 → 返回一个挂起的 Promise，把 resolve 存起来
return new Promise((resolve, reject) => {
  this.waiters.push({ resolve, reject });
});

// 别处有浏览器还回来 → 取出排队者，调他的 resolve，他就拿到浏览器了
const entry = this.waiters.shift();
entry.resolve(browser);
```

核心：`resolve` 是个**函数**，可以存进数组、过会儿再调。调它的那一刻，对应的 `await` 才往下走。这个认知打通后，超时、熔断都顺理成章。

**坑：死锁**。借了不还（忘了 release），浏览器只出不进，池子很快被借空，所有请求永远卡在排队 → 服务假死。`release` 必须放在 `finally`，无论成功失败都还。

---

### 5. 优雅关闭

**思维**：进程的生命周期有「终点」，终点前要主动清理外部资源，否则留烂摊子给系统。

直接退出，Chrome 子进程变成**僵尸（孤儿）进程**，残留吃内存，攒多了还会导致下次启动报 `Connection closed`。

```js
const gracefulShutdown = async (signal) => {
  await pool.destroy(); // 先关所有 Chrome
  process.exit(0);      // 0 = 正常退出，非 0 = 异常退出
};
process.on("SIGINT", () => gracefulShutdown("SIGINT"));   // Ctrl+C（开发）
process.on("SIGTERM", () => gracefulShutdown("SIGTERM")); // kill / 部署平台停服务（线上）
```

`SIGKILL`（`kill -9`）是内核强杀，进程**捕获不到**，没法优雅关闭——这也是 `kill -9` 浏览器主进程会留下孤儿子进程的原因。`SIGKILL` 只用于兜底清场。

---

### 6. 让参数生效

**思维**：「拦掉非法的」（校验）和「没传时给个合理默认」（默认值）是两个职责，别混在一起。

```js
const takeScreenshot = async ({ url, width = 1920, height = 1080, type = "png" }) => {
  await page.setViewport({ width, height });
  await page.screenshot({ type });
};
```

**坑：`fullPage: true` 会无视 height**。viewport 的 height 只决定「一屏多高」，`fullPage` 截整个页面（滚到底），设的 height 不影响最终图片高度。想让 height 生效，要么别用 fullPage，要么理解它只控制视口。

---

## 阶段二 · 让池子「扛得住」：从能用到抗压

主题：**流量洪峰来时，服务会怎么死？** 然后一个个堵上。

### 7. 超时 + 队列上限

**思维**：任何「排队」都必须有**上限**和**超时**，否则排队本身会变成新的故障源。

事故（雪崩）：洪峰来了，浏览器全借出去，请求疯狂排队。队列无上限、排队不超时则：① 队列无限增长撑爆内存；② 排第 1000 位的请求轮到它时用户早走了，白占资源。

**① 超时**——排队最多等 N 秒，超了主动失败，并**把自己从队列摘掉**：

```js
const entry = { resolve, reject, timer: null };
entry.timer = setTimeout(() => {
  const index = this.waiters.indexOf(entry);
  if (index !== -1) this.waiters.splice(index, 1); // 摘掉自己
  reject(new Error("获取浏览器超时"));
}, this.acquireTimeout);
this.waiters.push(entry);
```

entry 从第 4 步的 `{resolve, reject}` 升级为 `{resolve, reject, timer}`：resolve 叫醒、reject 通知失败、timer 是超时闹钟（拿到浏览器时记得 clearTimeout）。

**② 队列上限**——超过 maxQueue 直接拒，快速失败让客户端重试/降级：

```js
if (this.waiters.length >= this.maxQueue) {
  throw new Error("等待队列已满，请稍后重试");
}
```

**坑 1：`splice(-1, 1)` 会错删最后一个**。`indexOf` 找不到返回 `-1`，`splice(-1, 1)` 是「删倒数第一个」。必须先判 `index !== -1` 再 splice。

**坑 2：release 时要先 clearTimeout 再 resolve**。浏览器还回来、要分配给排队者时：先关掉他的超时闹钟，再 resolve。顺序反了的话，可能 resolve 完闹钟又触发 reject（一个 Promise 不会真的二次 settle，但逻辑脏）。

---

### 8. 动态伸缩

**思维**：并发计数时，**「正在进行中但还没完成」的数量也得算进去**，否则会超发。

固定大小不好：固定 3 个，半夜没流量也干吃内存；大促又不够全在排队。所以闲时缩到 `min`、忙时扩到 `max`。

三个关键字段：`instances`（总花名册，借出 + 空闲都算）、`idle`（空闲队列，能立刻外借的）、`launching`（**正在启动中**的数量）。

**`launching` 占坑防超发** ⭐：启动一个 Chrome 要 1~2 秒。假设 max=3，现有 2 个、正在启动 1 个。不数 launching 的话，第 3、4 个请求一看「才 2 个没到 max」，又各启动一个 → 实际开了 4 个，超了。

```js
if (this.instances.length + this.launching < this.max) { /* 才能造新的 */ }
```

acquire 三条路：

```text
有空闲 idle      → 直接借（最快，几毫秒）
没空闲但没到 max → 现造一个（慢，1~2秒）
到 max 了        → 排队等还回来（第 7 步）
```

**`_ensureMin` 保底**：体检销毁了坏实例后，池子可能不足 min，调它补齐。后台补、失败不抛（下一轮体检还会再试）。

---

### 9. 健康检查 + 僵尸回收

**思维**：外部资源不会通知你它死了。要**主动定期体检**，且要分清「它声称活着」和「它真能干活」是两回事。

三种事故，对应三道防线：

| 事故 | 表现 | 防线 |
| --- | --- | --- |
| Chrome 自己崩了 | 崩掉的还躺在 idle，借出去就报错 | `_checkIdleHealth` 定期体检空闲实例 |
| 借出去再也不还 | `inUse` 永远 true，攒几个占满 max，服务假死但进程没崩 | `_reclaimStuck` 回收借太久的僵尸 |
| 浏览器「植物人」 | `connected` 还是 true，但任何操作没反应 | `_isHealthy` 主动心跳戳一下 |

**体检定时器每轮四步，顺序不能乱**：

```text
_reclaimStuck    → 先回收僵尸（先腾出 max 的坑位）
_checkIdleHealth → 再体检空闲（清掉崩溃/失联的）
_shrink          → 再缩容（清掉闲太久的）
_ensureMin       → 最后补底（保证至少 min 个）
```

原则：**先清理再补**，否则补了又被清，白忙活。

**僵尸回收要遍历 `instances` 不是 `idle`** ⭐（易错）：僵尸是「借出去不还」的，`inUse = true`，**根本不在 idle 里**。遍历 idle 永远扫不到僵尸。

```js
for (const instance of this.instances.slice()) {   // 总花名册，不是 idle！
  if (instance.inUse && Date.now() - instance.lastUsedAt > this.stuckTimeout) {
    await this._destroyInstance(instance);
  }
}
```

**`_isHealthy` 两道检查**——「被动状态」和「主动探活」的区别：

| 检查 | 方式 | 能查出 | 查不出 |
| --- | --- | --- | --- |
| `browser.connected` | 被动（puppeteer 维护） | 管道断了（崩溃/被杀） | 植物人 |
| `Promise.race` 心跳 | 主动戳一下 | 植物人（卡死答不上话） | —— |

```js
async _isHealthy(instance) {
  if (!instance.browser.connected) return false;  // 第一道：管道通吗
  try {
    await Promise.race([
      instance.browser.version(),                 // 让它报版本号 = 答个话
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("超时")), 3000)), // 3秒答不上 = 死了
    ]);
    return true;
  } catch {
    return false;
  }
}
```

**`Promise.race` 超时套路** ⭐（通用，复用率最高）：给「可能永远不返回的操作」加超时，让它和一个「定时炸弹」赛跑，谁先到算谁。熔断、缓存、任何外部调用都会用。

```js
await Promise.race([
  慢操作(),  // 先完成 → 正常返回
  new Promise((_, reject) => setTimeout(() => reject(new Error("超时")), N)), // 先到 → 抛错
]);
```

**`browser.version()` 为什么返回 Promise**：它要通过 WebSocket 管道发指令给 Chrome 进程、等回信，是异步通信。puppeteer 里凡是「跟 Chrome 通信」的 API（goto/screenshot/newPage）全是 Promise。

---

### 10. 页面池复用

**思维**：不是所有资源都值得同等对待。**稀缺又贵的才值得排队等，便宜的没必要等。**「分级对待」比「全都池化」更重要。

开浏览器贵（1~2 秒）→ 实例池复用浏览器；开页面也有开销（几十毫秒）→ 页面池再复用一层。类比：浏览器是工厂，页面是工厂里的工作台。

**实例的结构**（浏览器 + 随身档案）：

```js
{
  id,           // 编号
  browser,      // Chrome 进程句柄
  inUse,        // 是否借出（僵尸判断靠它）
  lastUsedAt,   // 上次使用时间（缩容/僵尸判断靠它）
  usageCount,   // 累计使用次数
  pagePool,     // 这个浏览器自己攒的可复用页面
}
```

**两层池借还策略对比**（关键差异）：

| | 实例池（浏览器） | 页面池（标签页） |
| --- | --- | --- |
| 借 | 没有→造新的，满了→**排队等** | 没有→直接 newPage，**不等** |
| 还 | 判浏览器还连着吗 | 判实例在吗、池满了吗、能洗干净吗 |

借页面不排队：页面便宜，`newPage()` 很快；只有稀缺的浏览器才值得排队。这是「分级对待」思维的落地。

**acquirePage 用 `while` 不用 `if`** ⭐

```js
async acquirePage(instance) {
  while (instance.pagePool.length) {
    const page = instance.pagePool.pop();
    if (!page.isClosed()) return page;  // 找到能用的就返回
    // 已关闭的坏页面 → 丢弃，继续捞下一个
  }
  return instance.browser.newPage();    // 全是坏的/空的，才新开
}
```

池里可能有多个坏页面 `[坏, 坏, 好]`。`if` 只试一次，捞到第一个坏的就放弃，后面好页面白白浪费；`while` 把池子捞干净再放弃。

**releasePage 要「洗碗」** —— 池化里最重要的安全意识：

```js
async releasePage(instance, page) {
  // 不收的情况：实例已被回收 或 页面池满 → 直接关
  if (!this.instances.includes(instance) ||
      instance.pagePool.length >= this.maxPagesPerBrowser) {
    try { await page.close(); } catch {}
    return;
  }
  // 收：先洗碗（清掉上一单内容），再放回池
  try {
    await page.goto("about:blank", { timeout: 5000 });
    instance.pagePool.push(page);
  } catch {
    try { await page.close(); } catch {}  // 洗不动就扔
  }
}
```

**为什么必须洗碗**：上一单截图留下的 Cookie、localStorage、DOM，不清掉会**泄漏给下一个请求**——A 用户的登录态被 B 用户的截图带出来，是真实的安全事故。复用资源时「清空上一次状态」是池化里极易漏、后果严重的一环。

（所有 `page.close()` 都要 try/catch 包：浏览器可能已死，关不掉就算了，别让「关页面失败」炸掉整个流程。）

---

## 阶段三 · 弹性与可靠性：别让一个坏网站拖死整个服务

前面解决「自己别崩」。这一阶段解决「**依赖的东西崩了，别连累自己**」。

### 11. 请求去重

**思维**：同一时刻的重复工作，只做一次，其余共享结果。关键还是第 1 步那个模式——**存「正在跑的 Promise」，不存结果**。

事故：同一 URL 在 1 秒内来了 100 个请求，老实截 100 次，浏览器全被同一张图占满。

```js
const inFlight = new Map(); // url → Promise<result>

export const takeScreenshot = async ({ url, width = 1920, height = 1080, type = "png" }) => {
  if (inFlight.has(url)) return inFlight.get(url);  // 命中：返回正在跑的 Promise

  // 没命中：把截图逻辑打包成 Promise（立刻创建，还没开始跑）
  const promise = (async () => {
    const instance = await pool.acquire();
    let page;
    try {
      // ...截图逻辑...
      return result;
    } finally {
      if (page) await pool.releasePage(instance, page);
      pool.release(instance);
    }
  })();

  inFlight.set(url, promise); // ← 同步执行！截图还没开始就存进去了
  try {
    return await promise;
  } finally {
    inFlight.delete(url);     // 截完才删，让下次重新截
  }
};
```

**最关键的时序认知** ⭐：`inFlight.set` 必须在第一个 `await` 之前**同步执行**。若先 `await pool.acquire()` 再 set，acquire 等待的几毫秒里请求 2 进来，`has` 还是 false，两个人都漏过去了。**「同步窗口」和「await 之后」是两个世界**——并发代码的核心直觉。

语法点 `(async () => {})()`：外层 `()` 告诉解析器「这是函数定义表达式」，内层 `()` 立刻调用。写成 `async(() => {})` 是错的（会被当成调用一个叫 async 的函数）。

---

### 12. 熔断器

**思维**：重试不是无脑的。依赖明显挂了，最聪明的做法是**暂时别打扰它**，快速失败，给它和自己都留口气。本质是个状态机。

事故：截图依赖外部网站，网站挂了每次都等 20 秒超时才失败。100 个并发全卡着等 → 池子占满 → 服务被一个坏网站拖死。

类比：家里的电闸。插座短路自动跳闸，整栋楼不会因一个插座烧掉。

**三状态状态机**：

```text
closed（正常）
  ↓ 失败次数 >= 阈值
open（断开）→ 请求来了直接抛错，不访问下游
  ↓ 等 RECOVER_MS 后
half-open（试探）→ 放一个请求进去
  ↓ 成功              ↓ 失败
closed（恢复）        open（重新断开，重置计时）
```

核心三数据 + 滑动窗口：

```js
const breaker = {
  state: "closed",   // closed / open / half-open
  results: [],       // 滑动窗口：最近 N 次结果（true=成功 false=失败）
  openedAt: null,    // 断开时间戳，判断恢复期是否到了
};

const record = (success) => {
  breaker.results.push(success);
  if (breaker.results.length > WINDOW) breaker.results.shift(); // 踢掉最旧的
};
```

**结果处理对照表**：

| 情况 | 动作 |
| --- | --- |
| 截图成功 + half-open | record(true) + 切回 closed |
| 截图成功 + closed | record(true)（继续观察） |
| 截图失败 + half-open | record(false) + 切回 open，重置 openedAt |
| 截图失败 + closed，失败数 >= 阈值 | record(false) + 切到 open，记录 openedAt |

**完整实现（第 11 步去重 + 第 12 步熔断器）**：

```js
export const takeScreenshot = async ({ url, width = 1920, height = 1080, type = "png" }) => {
  // 熔断检查（在去重之前，越早拦截越好，open 状态根本不必进 inFlight）
  if (breaker.state === "open") {
    if (Date.now() - breaker.openedAt < RECOVER_MS) {
      throw new Error("熔断器断开，请稍后重试"); // 快速失败
    }
    breaker.state = "half-open"; // 恢复期到了，放一个进去试探
  }

  // 去重（第 11 步）
  if (inFlight.has(url)) return inFlight.get(url);

  const promise = (async () => {
    try {
      const result = await _doScreenshot({ url, width, height, type });
      record(true);
      if (breaker.state === "half-open") breaker.state = "closed"; // 试探成功，恢复
      return result;
    } catch (err) {
      record(false);
      if (
        breaker.state === "half-open" ||
        (breaker.state === "closed" && failCount() >= THRESHOLD)
      ) {
        breaker.state = "open";
        breaker.openedAt = Date.now(); // 记跳闸时间
      }
      throw err;
    }
  })();

  inFlight.set(url, promise);
  try {
    return await promise;
  } finally {
    inFlight.delete(url);
  }
};
```

**half-open 为什么只有 1 个请求真正在跑** ⭐：第 1 个请求进入截图流程时同时写了 `inFlight`，第 2、3 个虽也被 half-open 放行，但 `inFlight` 里已有这个 url → 直接共享第 1 个的 Promise。**第 11 步的去重顺手帮第 12 步控制了试探并发，不用额外加锁。** 两个独立功能自然咬合。

**坑（两个都阴险）**：

- `"closed"` 少写成 `"close"`，后续所有 `=== "closed"` 全失配，熔断器像没写一样，极难查。
- closed/open 命名反直觉（电路术语）：`closed` 闭合=电路通=请求可过=**正常**；`open` 断开=电路断=请求过不去=**跳闸**。口诀：open 是「开路」，路断了。

---

### 13. LRU 缓存

**思维**：任何「存起来」的东西都要回答「存多少、满了踢谁」。光有过期时间（TTL）不够，还要容量上限和淘汰规则。

只用 TTL Map 的问题：没有容量上限，10 万个不同 URL 全缓存 = 几十 GB 内存，进程 OOM。LRU 加两个约束：容量上限（`maxSize`）、淘汰最久没被读过的（Least Recently Used）。

**用 Map 模拟 LRU**（Map 天然按插入顺序排列，最旧的在最前、最新的在最后）：

```js
// 读时移到末尾（标记为「最近使用」）
map.delete(key); map.set(key, entry);

// 满了踢最旧的（Map 第一个就是最旧的）
const oldestKey = map.keys().next().value;
map.delete(oldestKey);
```

`map.keys().next().value`：`map.keys()` 返回迭代器（不是数组），`.next()` 取第一个，格式是 `{ value: key, done: false }`，`.value` 拿到 key 本身。比展开成数组省内存。

**去重 vs 缓存——分工明确，缺一不可**：

| | 去重（第 11 步） | 缓存（第 13 步） |
| --- | --- | --- |
| 解决什么 | **同一时刻**并发的重复请求 | **不同时刻**的重复请求 |
| 结果存多久 | 截图跑完就删 | 存到 TTL 到期或被淘汰 |
| Map 里存什么 | 正在跑的 **Promise** | 截完的**结果** |

缓存挡不住「第一次截图还在跑时」的并发洪峰——那是去重的活。

---

## 阶段四 · 可观测性：线上出事，得查得到

代码再稳，线上总会出事。这一阶段让「出事时不抓瞎」。

### 14. 资源拦截

**思维**：很多库都有「接管控制权」的开关，打开后要对每件事显式表态（放行/中止/伪造），漏一个就卡住。

`page.setRequestInterception(true)` 把 puppeteer 从**自动模式**切到**审批模式**。打开后每个网络请求发出前都暂停，等调以下之一：

- `req.continue()` — 放行
- `req.abort()` — 中止（浏览器收到网络错误，非关键资源通常静默跳过）
- `req.respond({...})` — 伪造假响应

**不调任何一个，请求永远挂着。**

**拦什么**——不影响截图外观的拦掉省带宽：

| 资源类型 | 影响截图外观？ | 是否拦截 |
| --- | --- | --- |
| CSS 样式表 | ✅ 影响 | ❌ 不拦 |
| 图片 | ✅ 影响 | ❌ 不拦（一般） |
| 字体文件 | ⚠️ 影响（回退系统字体） | 看需求 |
| 视频 / 音频 | ❌ 不影响 | ✅ 拦 |
| 广告脚本 | ❌ 不影响视觉 | ✅ 拦 |
| 统计埋点 | ❌ 不影响视觉 | ✅ 拦 |

**坑：页面复用时必须清掉 handler**，否则下次借到同一页面会叠加 handler、行为异常：

```js
page.off('request', blockHandler);      // 注意 puppeteer 25 用 off，见第 18 步
await page.setRequestInterception(false);
```

> 又是「复用资源前清空上次状态」——和第 10 步洗碗是同一个意识。

---

### 15. 结构化日志

**思维**：日志是给**机器**查的，不只给人看。`console.log("截图失败", err)` 是纯文本，没法被 ELK/Loki 解析查询，要输出 JSON。

```js
// src/logger/index.js（5 行搞定）
import pino from "pino";
export const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
```

用法规则：**字段对象在前，消息字符串在后**：

```js
logger.info({ port }, '服务已启动')   // ✅
logger.info('服务已启动', { port })   // ❌ 第二个参数会被忽略
```

级别用数字存方便过滤（trace 10 / debug 20 / info 30 / warn 40 / error 50），用 `LOG_LEVEL` 环境变量控制输出级别：

```bash
LOG_LEVEL=debug node server.js   # 输出所有级别
LOG_LEVEL=warn node server.js    # 只输出 warn 和 error
```

---

### 16. 请求追踪 ID

**思维**：并发系统里，日志必须能**串成一条请求链**。「上下文透传」不该靠手动逐层传参——`AsyncLocalStorage` 能隐式携带。

事故：并发日志里看到一条 `截图失败`，不知道是哪个请求的，没法查。

解法：每个请求生成唯一 `reqId`，该请求的所有日志自动带上它。

```js
// 中间件：每个请求开一个「上下文储物柜」，放入 reqId
export const requestId = (req, res, next) => {
  const reqId = randomUUID();
  res.setHeader("X-Request-Id", reqId);   // 响应头也带上，方便前端对账
  requestContext.run({ reqId }, next);     // 把后续整条链都包进这个上下文
};

// logger 用 pino 的 mixin 钩子，每条日志打印前自动注入 reqId
export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  mixin() {
    const ctx = requestContext.getStore();
    return ctx ? { reqId: ctx.reqId } : {};
  },
});
```

`AsyncLocalStorage` 三个动作：`new` 建储物柜（全局一个）、`.run(data, fn)` 开一格放数据并在里面跑、`.getStore()` 从当前请求的格子取数据（不同请求各取各的，互不干扰）。`mixin()` 是 pino 内置钩子，每次 `logger.xxx()` 前都调它，返回字段自动合并进日志。

---

### 17. Prometheus 监控

**思维**：日志和指标解决的是两个不同的问题。日志是「发生过什么」的流水账；指标是「现在是什么状态」的快照。只有日志，你能看到每次截图的结果，但没法回答「现在并发多少」「池子还剩几个」「p99 耗时是多少」——那些是状态，不是事件。

事故场景：服务跑了两天，用户反映截图变慢。你翻日志，只有一堆「截图成功」「截图失败」，根本看不出是池子满了、还是下游网站变慢、还是队列积压。

**日志 vs 指标的本质区别**：

| | 日志 | Prometheus 指标 |
| --- | --- | --- |
| 记录什么 | 发生过的事件 | 当前状态快照 |
| 能问「现在」吗 | ❌ | ✅ |
| 存的是 | 文本流 | 数字时间序列 |

**Prometheus 拉取模型**：不是你主动推，是 Prometheus 每隔 N 秒来你的 `/metrics` 端点拉一次。你只需维护当前值，Prometheus 自己算趋势、画图。

**四种指标类型**——每种解决不同的问题：

| 类型 | 语义 | 典型用途 |
| --- | --- | --- |
| Counter | 只增不减的计数 | 总请求数、总失败次数 |
| Gauge | 可升可降的当前值 | 当前队列长度、池子空闲数 |
| Histogram | 耗时按区间分桶 | 请求耗时分布、p95/p99 延迟 |
| Summary | 分位数（少用） | 类似 Histogram |

**我们暴露的 5 个指标**：

```text
screenshot_requests_total{status="success"|"error"}  ← Counter
screenshot_duration_seconds                          ← Histogram
browser_pool_instances                               ← Gauge（总实例数）
browser_pool_idle                                    ← Gauge（空闲数）
browser_pool_queue                                   ← Gauge（排队数）
```

**Gauge 用 collect 回调而不是手动 set** ⭐：池子状态在变化，手动 set 追不上。collect 钩子在 `/metrics` 被拉时才调用，保证每次拉到的都是实时值：

```js
new Gauge({
  name: "browser_pool_idle",
  collect() {
    const pool = getPool();
    this.set(pool ? pool.idle.length : 0);  // 拉时读，不是写时存，永远最新
  },
});
```

**`startTimer()` + `endTimer()` 模式**：Histogram 不是你算时间存进去，而是 `startTimer()` 记住开始时刻，截图跑完 `endTimer()` 自动算差值存入分桶：

```js
const endTimer = durationHistogram.startTimer(); // 记住开始时刻
// ... 截图逻辑 ...
endTimer(); // 自动算出经过多少秒，存入对应分桶
```

成功和失败都要调 `endTimer()`，否则失败请求的耗时从 p99 里蒸发，数据失真。

**验证**：`curl http://localhost:3000/metrics` 能看到所有指标的当前值。

**这关的可迁移认知**：任何「需要知道当前状态」的问题——池子利用率、队列积压、失败率趋势——都不该靠翻日志。「可观测性 = 日志（发生了什么）+ 指标（现在是什么）+ 链路追踪（怎么走的）」三条腿，缺一条就瞎了一块。

---

## 阶段五 · 架构：让它「可扩展」

### 18. 分层架构

**思维**：单文件混了 HTTP、业务决策、执行细节，表面是「都在一起方便」，实际是「任何非 HTTP 的调用方都复用不了」。分层的本质是**切断调用方对传输层的依赖**。

事故场景：需要加「定时任务」每天凌晨截图存档，没有 HTTP 请求，没有 `req`/`res`。发现截图逻辑和 `req.body` / `res.json` 深度耦合——复用不了，只能重写一份。

**三层的边界铁律**：

| 层 | 文件 | 知道什么 | 不知道什么 |
| --- | --- | --- | --- |
| 路由层 routes | `routes/screenshot.js` | req / res / HTTP | 缓存、浏览器、熔断 |
| 业务层 services | `services/screenshotService.js` | 缓存、去重、熔断 | req / res / puppeteer |
| 执行层 executor | `executor/screenshotExecutor.js` | puppeteer、浏览器池 | 缓存、熔断、HTTP |

**分层的回报**：service 层签名是 `({ url, width, height, type })`，纯参数，没有 HTTP 上下文。定时任务、消息队列消费者、其他接口都能直接 import 调用：

```js
import { takeScreenshot } from './src/services/screenshotService.js';
await takeScreenshot({ url: 'https://example.com' });   // 不需要 req/res
```

这才是「复用截图能力」。不是缓存，缓存是截图的副产品，不是复用的机制。

**server.js 退化到纯胶水**：开服务、挂路由、挂中间件、关服务。原来零散在里面的业务逻辑全部清零。

**判断一段代码归哪层的检验问题**：

- 它用到 `req`/`res` 吗 → 是→路由层，否→不该在路由层
- 它知道浏览器怎么借/还吗 → 是→执行层，否→不该在执行层
- 它剩下的是纯业务决策 → 就是业务层

**坑：puppeteer 25 的 `page.off()` vs `page.removeListener()`**

puppeteer 25 的 Page 类不再继承 Node 原生 EventEmitter，`removeListener` 不存在，只有 `off()`：

```js
// ❌ "page.removeListener is not a function"
page.removeListener('request', blockHandler);

// ✅
page.off('request', blockHandler);
```

这类 API 迁移坑没有报警，运行时才炸——升级第三方库后要跑一遍完整链路验证。

---

## 沉淀：反复出现的可迁移模式

真正值钱的不是某一关，而是这些**跨关复用、换个场景照样成立**的东西：

**1. 缓存「进行中的任务（Promise）」，而不是结果。**
第 1 步复用浏览器、第 11 步请求去重。判断标准：多个调用方可能同时触发同一个耗时异步操作时，缓存那个 Promise 让大家共享。

**2. `Promise.race` + 定时炸弹 = 给任何外部调用加超时。**
第 9 步心跳，及一切「可能永不返回」的网络/进程调用。

**3. 同步窗口 vs await 之后，是两个世界。**
第一个 `await` 之前的代码是「原子」的，不会被别的请求插进来；`await` 之后可能被打断。要抢占式登记的东西（如 inFlight.set）必须放在 await 之前。

**4. 复用资源前，先清空上一次的状态。**
第 10 步页面洗碗、第 14 步清 handler。不清就「状态泄漏」，轻则行为异常，重则安全事故。

**5. 凡是「排队/缓存/池子」，都要回答三个问题：上限多少？满了怎么办？超时多久？**
没有上限的队列/缓存，迟早 OOM。

**6. 外部资源不会告诉你它死了——主动探活，且区分「声称活着」和「真能干活」。**
第 9 步的 `connected`（被动）vs 心跳（主动）。

**7. 写「涉及外部资源」的函数时，问四个不信任问题**（网络/进程/文件/数据库/定时器适用，纯计算不适用）：

1. **依赖的东西会死吗** → 加存活判断
2. **资源被挤兑怎么办** → 加上限/闸门
3. **中途炸了留什么烂摊子** → try/catch + finally 兜底
4. **跑一个月后呢** → 有没有泄漏、会不会越积越多

> 这四问是「还没踩过的坑」的替身。熟练后会变成直觉。

---

## 语言 / 平台知识点

- **`_` 前缀**是约定（内部方法，外部别调），非语法强制；真要私有用 `#`（外部调直接报错）。判断：文件外面会 import 它吗？会→公开不加，只内部用→加 `_`。
- **遍历数组时若会在循环里删它自己的元素，先 `.slice()` 复制再遍历**，否则索引错位、跳过元素。
- **`Promise.race`（超时）/ `Promise.all`（全成才成）/ `Promise.allSettled`（全跑完不管成败，关停池子时用，保证每个实例都被关到）**。
- **Node 进程信号**：SIGINT（Ctrl+C）、SIGTERM（kill/停服务）可捕获；SIGKILL（kill -9）内核强杀，捕获不到。
- **Puppeteer 进程模型**：Node 进程 ⇄ WebSocket 管道（DevTools 协议）⇄ Chrome 进程。所以 `goto`/`screenshot`/`newPage` 全是异步；`browser.connected` 就是「这条管道通不通」。
- puppeteer v22 起 `browser.isConnected()` 方法删了，改用 `browser.connected` **属性**（没括号）。

---

## 附：常用排查命令

```bash
# 清掉所有僵尸 Chrome（报 Connection closed 时用）
pkill -9 -f "Chrome for Testing"

# 看谁占用了 3000 端口
lsof -i :3000

# 杀掉占用 3000 端口的进程
kill $(lsof -ti :3000)
```

**反复踩的小坑**：

- 改代码后**必须重启** node（不热重载，改了不重启等于没改）。
- `splice(-1, 1)` 会错删最后一个，`indexOf` 后要判 `!== -1`。
- 一个浏览器 = 多个 Chrome 子进程，用 `ps`/`pgrep` 数进程数判断浏览器数不准。
- 启停攒下的僵尸 Chrome 会导致 `Connection closed`，需 `pkill -9` 清场。

---

## 易错点订正（复习用）

> 把每个容易「想当然」答错的点拆成「错误认知 → 订正」，按演进顺序排列。前文讲过的，这里集中复述、便于复习；只挑反直觉、易混的坑。

### 1. 复用浏览器：缓存 Promise 还是缓存 browser 结果？

**想当然**：缓存启动好的 `browser` 对象，下次直接拿来用。

**实际**：要缓存的是**正在启动的 Promise**，不是启动完的结果。`puppeteer.launch()` 立刻同步返回一个 pending Promise，A 第一个进来**同步**就把它存进缓存（不用等 1~2 秒），B 紧接着查拿到**同一个进行中的 Promise**，共享 A 那次启动，只开一个 Chrome。缓存 browser 结果则要等 `await` 完才有东西存，**这段空窗缓存是空的、会漏**——两个请求各开一个 Chrome。

→ 可迁移模式：**缓存"进行中的任务（Promise）"，填满"结果还没出来"的空窗**。请求去重（`inFlight` Map）是同一套路。

### 2. 池满了，第 4 个请求怎么被唤醒？

**想当然**：第 4 个请求"等 Promise 返回"。

**实际**：精确机制是**把自己的 `resolve` 寄存到等待队列、自己挂起**；别的请求归还实例时，`_dispatch` 取出这个 resolve **替它调用**，它的 `await` 才被唤醒。不是"等返回"，是"把 resolve 交给别人替你调"。

```text
acquire()：new Promise((resolve) => waiters.push({ resolve, reject, timer }))  // 寄存 + 挂起
release() → _dispatch()：取出 waiter → clearTimeout(timer) → waiter.resolve(实例)  // 替它唤醒
```

配两道闸：队列长度上限（`maxQueue`，排太多直接拒）、等待超时（`acquireTimeout`，排太久摘队）。⚠️ 摘队 `indexOf` 返回 -1 时 `splice(-1,1)` 会错删最后一个，要先判 `index !== -1`；release 时**先 clearTimeout 再 resolve**。

### 3. 内存泄漏，轮换的是「浏览器实例」还是「页面」？

**想当然**：达到使用次数后把**页面**关掉。

**实际**：两个词都不准。池子两层、两套机制：

| | 浏览器实例层 | 页面层 |
|---|---|---|
| 处理 | **按服役次数轮换**：`usageCount >= maxUses` → 销毁整个浏览器、重建 | **洗干净复用**：`goto about:blank` 清空放回；池满/洗不动才 close |
| 目的 | **治内存泄漏** | **省成本（复用）** |

→ 为什么必须关浏览器而非关页面：泄漏累积在**整个 Chrome 进程**（缓存/JS 堆只涨不降），只关页面、进程还活着，内存照样赖着。**只有销毁整个实例、进程退出，OS 才回收那几百 MB。**

### 4. 优雅关闭只是「关掉浏览器」吗？

**想当然**：优雅关闭 = 退出前把 Chrome 关干净、避免孤儿进程（第 5 步那一半）。

**实际**：那只是**一半**。另一半是**正在处理的请求不能被硬切断**——强杀瞬间有用户截图正截到一半，进程没了，他拿到"连接重置"而不是图。完整做法是**三步排水（drain）**：

```text
① server.close()    先停止接收新请求
② 等存量 in-flight 请求处理完
③ 再 process.exit()
```

→ 完整的优雅关闭 = 销毁浏览器池（防孤儿 Chrome）+ 排水（先停新请求 → 等存量做完 → 再退出）。只做前者，部署重启会切断在途请求。

### 5. 介绍架构 / 一个请求的一生，少说了什么？

**想当然**：路由 → service（去重/缓存/熔断）→ executor（截图）三层。

**实际**：漏了**第四层「资源层/浏览器池」**，以及 service 在真干活前的一排**门卫闸**：

```text
① 路由层   收 req、匹配接口、包装响应/错误（只碰 req/res）
② 业务层   门卫闸：熔断 canExecute → 限流 → 预估必超时提前拒 → Promise.race 包硬超时
           决策：查缓存命中返回 ✋ → 去重搭车 ✋ → 都没拦住才往下
③ 执行层   借实例 → 借页面 → 拦截资源 → goto → 截图 → 还
④ 资源层   浏览器/页面的借还、排队、超时、健康回收、轮换
```

→ 加分句：大部分请求在 ② 业务层就被缓存/去重/熔断挡掉，**根本走不到开浏览器那步**——点出这句抓住了性能要害。

### 6. 怎么判断一段代码归哪一层？

**想当然**：凭感觉分。

**实际**：三个检验问题，分层的本质是**切断"业务/执行"对"传输层 HTTP"的依赖**：

```text
用到 req/res 吗？        → 是 → 路由层
知道浏览器怎么借/还吗？  → 是 → 执行层
剩下的纯业务决策（缓存/去重/熔断） → 业务层
```

→ 回报：业务层签名是纯参数 `{url,width,height,type}`、无 HTTP 上下文，定时任务/消息队列都能直接 `import` 调用——这才是"复用截图能力"；`server.js` 退化成纯胶水。

### 7. 去重为什么用 Map？

**想当然**：因为 Map 有顺序、能直接拿 size。

**实际**：**串台了**。"有顺序/拿 size"是 **LRU 缓存**用 Map 的理由；**去重用 Map 跟顺序、size 无关**，要的只是一张 `url → promise` 的 **O(1) 查找表**（`has`/`get`/`set`/`delete`）。同一个 Map，两处吃它**不同的能力**：LRU 吃"顺序"，去重吃"O(1) 键值查找"。

### 8. 为什么 100 个并发去重不会「各以为自己第一个」？

**想当然**：100 个同时进来，都查到"没人在截"，各截一次。

**实际**：Node 单线程，`await` 是唯一的"暂停点"，**两个 await 之间的代码是不可打断的原子块**。「查 `has` → `set` 登记」之间没有 await → 原子。请求①"查→登记"一气呵成完成后，事件循环才轮到请求②，②查时标志已立 → 搭车。

```text
跑①：查 false → 造 promise → set 登记 → await（暂停，交还控制权）
跑②：查 true（①已登记）→ return 同一 promise，搭车
```

→ **铁律：先登记（set）、再 await**。把 await 塞进 check 和 set 之间，去重立刻失效。这套"原子块 + 让出点"思维，看任何并发代码（防重复提交、加锁、计数器）都通用。

### 9. 多进程下，单线程的去重原子性还成立吗？

**想当然**：去重靠单线程原子性，fork 多进程后就破了、彻底失效。

**实际**：分两层看。fork 出的是 N 个**各自单线程**的进程，所以原子性的保护范围是**"每个进程内部"**：

- **进程内**：单线程原子性成立 → 去重有效。
- **进程间**：N 个 worker **各有各的 `inFlight` Map**（内存不共享）→ 跨进程去重失效，同一 URL 最坏被截 **N 次**。

→ 和缓存碎片化同一个病（都是进程内内存状态），同一个解法：搬到 Redis（`SETNX url` 做分布式锁，截前先占坑）实现跨进程去重。

### 10. LRU 缓存：满了淘汰谁？怎么保证高效？

**想当然**：用 Map、淘汰最前面的。

**实际**：漏了**最关键的「命中时挪到末尾」**——没有它就只是 FIFO，不是 LRU。完整四步：

1. **数据结构**：用 `Map`（保持插入顺序的有序哈希表，增删查 O(1)）。
2. **约定**：开头=最久没用，末尾=最新。满了淘汰开头（`map.keys().next().value` 取、`delete` 删，O(1) 不遍历）。
3. **（灵魂）命中时 `delete` + `set` 挪到末尾** → "刚用过的"被顶到末尾，"最前面的"永远是"最久没碰过的"。
4. **（加分）TTL 过期**：`get` 时算 `age = now - 存入时间`，超 `ttl` 当过期删。LRU 管"位置淘汰"，TTL 管"时间淘汰"，两套并存。

→ 必须主动说出那句：**"命中时挪到末尾"是 LRU 的灵魂**，漏了它 Map 顺序只是 FIFO。

### 11. 缓存 key 该用什么？（漏一个参数就串图）

**想当然**：缓存用 `url` 当 key 就够了。

**实际**：**cacheKey 必须包含每一个会改变返回结果的输入参数**。只用 url 当 key，截同一 url 的不同尺寸/格式会**命中同一份缓存、返回错图**；再加个「只截某个 CSS 元素（selector）」的功能就更明显——先截 `#header`（存 key=url），再截 `#footer` 命中同一 key、返回了 #header 的图，张冠李戴 🐛。

→ 正确：`cacheKey = url + width + height + type + selector + …`（所有影响结果的参数拼起来）。漏一个就"参数不同却命中同一份缓存"。这是缓存类功能最易翻车的一类 bug。

### 12. 熔断是「全局」还是「按域名」？

**想当然**：网站 A 挂了触发熔断，来截正常的网站 B 不会被拒——熔断会区分是哪个站挂的。

**实际**：最简单的实现是**全局熔断**，只往滑动窗口塞成功/失败、不记 URL。state 一旦 `open`，**任何** URL 都被拒，**B 会被误伤**。

| | 全局熔断 | 按域名熔断（per-host） |
|---|---|---|
| 统计粒度 | 整个服务一个计数器 | `Map<host, 熔断器>`，每域名一个 |
| A 挂了 | B 也被拒（误伤） | 只熔断 A，B 不受影响 |
| 爆炸半径 | 大：一个坏站拖垮全部 | 小：隔离到单域名 |

→ 全局熔断实现简单，但一个站挂了会误伤其他正常站；更稳的做法是**按域名维度熔断**（`Map<host, breaker>`），把爆炸半径隔离到单个站点。

### 13. 为什么要分层超时？一刀切不行吗？

**想当然**：直接设一个"请求 30 秒一刀切"就够。

**实际**：单层分不清卡在哪一步，会把"本该 10 秒放弃的事"硬拖到 30 秒，白占资源。分层 = 每步配符合常理的耐心，哪步异常就在哪步快速放弃。**关键细节：各层超时值必须「由内向外递增」**：

```text
借实例 10s  <  等网络空闲 15s  <  请求总超时 45s
```

→ 为什么？若把"借实例超时"设成 40s、比"请求总超时 30s"还大，请求 30s 就被外层掐了，内层那个 40s 超时**永远等不到、形同虚设**。内层必须先于外层到期才有意义。

### 14. 资源拦截：为什么拦？代价是什么？

**想当然**：拦掉广告/统计/媒体能加快加载、更快到 `networkidle`——只说了好处。

**实际**：本质是**速度 vs 保真度**的取舍，拦得越狠越快，但越可能失真。三类风险：

1. **误伤**：黑名单域名里万一有页面真正要显示的图片/字体，拦掉 → 截图缺图、和用户真实看到的不一样。
2. **内容本身就是被拦类型**：拦了 `media`，但页面主体若是视频/音频播放器，截出来是空白。
3. **黑名单滞后**：域名硬编码，网站换 CDN/广告域名就失效，要长期维护。

→ 所以黑名单要**保守**：只拦确定与画面无关的（广告/统计/埋点），不激进拦可能影响渲染的（图片/字体/关键 JS）。

### 15. 服务变慢，怎么定位瓶颈？

**想当然**：看「排队等待数」高不高来判断根因。

**实际**：**排队是症状，不是病因**——请求变多会让队伍变长，处理变慢（实例占用久）也会让队伍变长，光看排队数分不清是哪种。要用两个独立维度交叉判断：

| 截图耗时（P99） | 请求速率（QPS） | 诊断 | 解法 |
|---|---|---|---|
| 正常 | 暴涨 | 请求变多 | 扩容 / 限流 |
| 飙高 | 平稳 | 处理变慢 | 查目标站慢 / 网络 / 页面太重 |
| 飙高 | 暴涨 | 量大压垮，两者叠加 | 先限流再排查 |

→ 顺序：先看指标（别瞎猜）→ 用「耗时 × 请求量」分清是"慢"还是"多"→ 若是慢，再下钻到哪一层。光盯症状治不了病。

### 16. Prometheus：三种指标怎么选？瞬时值怎么保证最新？

**想当然**：耗时也能用 Gauge 存当前值；排队数手动 `set`。

**实际**：选型看"这个数会不会减"——**只会涨 → Counter（总请求数）；上上下下 → Gauge（当前排队/空闲）；看分布/分位数 → Histogram（耗时 p95/p99）**。耗时不能用 Gauge，一个当前值算不出"99% 请求快于多少秒"。

瞬时值（如排队数）用 **Gauge 的 `collect` 回调，不手动 set**：

```js
new Gauge({
  name: "browser_pool_queue",
  collect() { this.set(getPool()?.waiters.length ?? 0); }  // 拉 /metrics 时才执行，现读现报
});
```

→ 核心：**collect = "拉时读"而非"写时存"**。手动 set 要在所有改动处埋点、漏一处就不准；collect 是懒的，拉取时现读，永远实时。

### 17. 并发日志怎么串成一条请求链？

**想当然**：手动把 reqId 逐层往下传参。

**实际**：用 **`AsyncLocalStorage` + 日志库钩子**让上下文沿异步链「隐式跟随」，省掉逐层传参。每个请求生成唯一 `reqId`，开一个独立"储物柜"，同一异步链上的代码（跨多少 await/函数都行）都能取到自己那份，不同请求互不干扰。

```js
export const requestId = (req, res, next) => {
  const reqId = randomUUID();
  res.setHeader("X-Request-Id", reqId);
  requestContext.run({ reqId }, next);        // 整条链包进上下文
};
const logger = pino({
  mixin() {                                    // 每条日志打印前自动注入
    const ctx = requestContext.getStore();
    return ctx ? { reqId: ctx.reqId } : {};
  },
});
```

→ 手动逐层传要改所有函数签名、侵入强易漏；`AsyncLocalStorage` 三动作：`new` 建储物柜、`.run(data, fn)` 开格放数据并在里面跑、`.getStore()` 取当前格子。
