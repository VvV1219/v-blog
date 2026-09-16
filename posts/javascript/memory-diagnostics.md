---
title: V8、Node.js 与浏览器内存排查笔记
description: 从对象可达性到堆快照，区分垃圾回收、内存泄漏、缓存增长和浏览器子进程占用。
date: 2026-09-16 10:05
category: 性能与稳定性
tags:
  - JavaScript
  - V8
  - Node.js
  - 内存
  - 学习笔记
aside: true
comment: false
---

# V8、Node.js 与浏览器内存排查笔记

相关笔记：[Puppeteer 截图服务](../puppeteer/puppeteer-screenshot-service.md) · [H5 性能优化](../performance/h5-performance.md) · [海报生成](../h5/poster-generation.md)

## 1. 核心认识：没有业务用途，不等于可以回收

垃圾回收关心对象是否仍可从运行环境的根对象到达。全局集合、闭包、监听器等仍然持有对象时，即使业务已经不再使用它，也可能无法释放。

例如页面已经离开，但全局数组还保留着页面实例；或者弹窗 DOM 已移除，但监听函数闭包仍引用它。查泄漏时需要找到**谁还在持有它**。

V8 使用分代思想处理不同生命周期的对象，并结合复制、标记、整理、增量与并发等策略。具体实现随版本演进，不能把“所有 GC 都完整暂停应用一秒”当作固定事实。[V8：Orinoco 垃圾回收介绍](https://v8.dev/blog/trash-talk)

## 2. 问题场景：服务跑久了，内存不断增加

先区分几种现象：

| 现象 | 可能含义 | 需要补充的证据 |
| --- | --- | --- |
| 内存上下波动，低点稳定 | 分配与回收循环 | 相同负载下是否长期稳定 |
| 回收后低点逐步升高 | 持续保留对象或缓存增长 | 对象数量、保留路径、缓存容量 |
| 短时峰值很高，之后下降 | 大批量处理或临时缓冲 | 单请求输入大小、并发数量 |
| JS 堆稳定，但 RSS 上升 | 原生内存、外部缓冲、分配器等 | external、Buffer、系统进程指标 |
| Node 稳定，整台机器仍涨 | 其他进程或浏览器子进程 | 进程树、容器总内存 |

单张截图不能证明泄漏。先固定请求量和输入，观察多轮处理后的趋势，再选择工具。

## 3. 实现要点：把几个内存指标分清

下面保存为 `memory.mjs`，使用 Node.js 运行。它只输出当前进程的指标，不代表机器总内存。

```js
import process from 'node:process'
import v8 from 'node:v8'

const toMiB = (bytes) => Number((bytes / 1024 / 1024).toFixed(2))
const usage = process.memoryUsage()

console.table({
  rssMiB: toMiB(usage.rss),
  heapUsedMiB: toMiB(usage.heapUsed),
  heapTotalMiB: toMiB(usage.heapTotal),
  externalMiB: toMiB(usage.external),
  arrayBuffersMiB: toMiB(usage.arrayBuffers),
  heapLimitMiB: toMiB(v8.getHeapStatistics().heap_size_limit),
})
```

`heapUsed` 是 V8 堆的已用部分，`heapTotal` 是已分配的堆容量，`rss` 是当前进程驻留内存。`arrayBuffers` 包含在 `external` 统计中，不能把这些字段全部相加当成总量。[Node.js process.memoryUsage](https://nodejs.org/api/process.html#processmemoryusage)

使用 `v8.getHeapStatistics()` 查询当前进程的堆限制，比背诵一个历史默认值可靠。即使允许扩大 V8 堆，也不意味着容器有足够内存容纳堆外资源和浏览器进程。[Node.js V8 API](https://nodejs.org/api/v8.html#v8getheapstatistics)

## 4. 浏览器排查：做一轮可以重复的实验

以“打开并关闭海报弹窗”为例：

1. 刷新页面，等待初始化完成，记录基准快照。
2. 重复打开、生成、关闭弹窗若干次。
3. 等待异步任务结束，在相近条件下获取第二份快照。
4. 比较对象数量与保留大小，查找没有回落的对象。
5. 沿保留路径定位持有者，再修改代码并重复相同实验。

重点看 DOM、图片数据、数组、Map、监听器和闭包。对象自身很小，也可能通过引用关系保留一大片数据；因此需要结合保留路径分析，而不是只按浅大小排序。[Chrome 内存问题排查](https://developer.chrome.com/docs/devtools/memory-problems)

## 5. 生命周期清理，比“手动触发 GC”更重要

下面用 `AbortController` 管理监听器，用返回函数集中释放资源：

```js
function mountPreview(button, blob) {
  const controller = new AbortController()
  const url = URL.createObjectURL(blob)

  button.addEventListener('click', () => {
    // 示例只展示地址；实际业务在这里更新预览元素。
    console.log(url)
  }, { signal: controller.signal })

  const timer = setInterval(() => {
    // 示例定时任务，组件卸载时必须一并停止。
  }, 1000)

  return () => {
    controller.abort()
    clearInterval(timer)
    URL.revokeObjectURL(url)
  }
}
```

Vue 组件可以在卸载钩子里调用返回的清理函数。缓存则需要容量、有效期和淘汰规则；简单改成 `WeakMap` 并不能替代缓存设计，尤其当键是字符串、还需要枚举或统计时。

## 6. Puppeteer 场景：Node 与 Chrome 是两个观察范围

截图服务同时持有业务对象、图片结果和 Chrome 进程。Node 的 `process.memoryUsage()` 不包含所有 Chromium 子进程。

因此要同时观察请求并发、浏览器和页面数量、图片字节数、Node 内存以及进程树总内存。页面数量不受限时，单个页面没有泄漏也可能把机器耗尽。

`page.goto('about:blank')` 只完成页面导航，不能据此断言 Cookie 和所有站点存储已清空。需要跨请求隔离时，应设计独立浏览器上下文及其销毁流程。[Puppeteer BrowserContext](https://pptr.dev/api/puppeteer.browsercontext)

实例轮换可以作为兜底，但要先停止分配新任务，再等在途任务完成或超时，最后关闭。轮换策略不能代替对根因的定位。

## 7. 堆快照的使用边界

Node 堆快照会暂停主线程，并可能额外占用大量内存。应在有余量、允许受影响的实例上操作；快照还可能包含运行中的业务数据，不应当普通日志公开上传。[Node.js：使用堆快照](https://nodejs.org/learn/diagnostics/memory/using-heap-snapshot)

记录复现输入、版本、处理次数与采样时机，比只保存一个文件更有用。修复后还需要确认趋势变稳，且吞吐和延迟没有出现不可接受的退化。

## 8. 易错点与学习自检

- **RSS 不下降就一定泄漏？**不一定，分配器和系统回收行为也会影响曲线。
- **变量设为 null 就一定释放？**不一定，别处可能还有引用。
- **GC 自动工作就不用清理？**监听器、缓存和外部资源仍需要生命周期设计。
- **加大堆就解决 OOM？**可能只是延后失败，也可能挤压其他进程。

自检：海报生成后 `heapUsed` 下降而机器内存仍高，你会检查哪些资源？缓存没有上限和真正无法释放的泄漏，有什么共同风险、又有什么不同？
