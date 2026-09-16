---
title: H5 海报生成：html2canvas 与 Puppeteer 选型笔记
description: 从生成位置、资源就绪、跨域、长图内存到缓存与降级，整理 H5 海报生成的完整链路。
date: 2026-09-16 10:08
category: 前端实战
tags:
  - H5
  - Canvas
  - Puppeteer
  - 学习笔记
aside: true
comment: false
---

# H5 海报生成：html2canvas 与 Puppeteer 选型笔记

> 本文参考 Niuhk 的 [H5 本地生成图片分享方案](https://niuhk.cn/2024/07/26/H5本地生成图片分享方案/)，重新整理为选型和排查笔记。示例使用通用场景，不包含原业务接口；没有把原作者的设备测试结果当成本地实测。

相关笔记：[Puppeteer 截图服务](../puppeteer/puppeteer-screenshot-service.md) · [Lottie 多语言](../animation/lottie-i18n.md) · [内存排查](../javascript/memory-diagnostics.md)

## 1. 核心认识：生成一张图，是一条资源处理链

点击分享并不等于立即截图。一次可靠的处理通常包括：

```text
读取分享数据 → 渲染专用模板 → 等待图片和字体
→ 生成图片 → 校验结果 → 预览 → 下载或交给分享接口
```

每一步都有失败可能。接口慢、字体晚到、图片跨域和原生分享失败，要分别定位，不能全部记录成“截图失败”。

## 2. 问题场景：应该在哪里生成？

| 维度 | html2canvas 本地生成 | Puppeteer 服务端截图 |
| --- | --- | --- |
| 执行位置 | 用户浏览器或 WebView | 服务端 Chromium |
| 适合场景 | 模板简单、图片较小、需要立即预览 | 样式保真要求高、统一字体、集中控制渲染环境 |
| 主要成本 | 用户设备的 CPU、内存与电量 | 服务端资源、网络传输和排队 |
| 主要约束 | CSS 支持、跨域、设备差异 | 并发、超时、目标页面加载、资源隔离 |
| 失败处理 | 降低倍率、分张导出、允许重试 | 有界排队、熔断、缓存、超时反馈 |

html2canvas 通过解析页面再绘制图片，不是浏览器原生截图。它不能保证支持全部 CSS；服务端截图也不代表无限尺寸或必定成功。[html2canvas FAQ](https://html2canvas.hertzen.com/faq)

**不要用“超过几屏就一定服务端”当通用规则。** 应根据实际像素、模板复杂度、最低目标设备和保真要求做选择。固定布局、只含文本和几张图片的海报，也可以直接用 Canvas 绘制，但要自己处理换行、布局与字体。

## 3. 实现要点：资源准备好，才能开始绘制

Vue 的 `nextTick()` 只保证本轮 DOM 更新完成，不代表远程图片和字体加载完毕。建议使用独立海报模板：尺寸稳定，图片不懒加载，内容不依赖页面滚动位置。

下面是浏览器端 TypeScript 示例，需要在已有前端工程安装 `html2canvas`。传入已挂载、有明确尺寸的元素；Vue 中先等待 `nextTick()`。示例等待 `<img>`，CSS 背景图需要另外预加载。

```ts
import html2canvas from 'html2canvas'

export async function createPoster(element: HTMLElement): Promise<Blob> {
  await document.fonts.ready
  await Promise.all(
    Array.from(element.querySelectorAll('img')).map(async (image) => {
      await image.decode()
      if (image.naturalWidth === 0) throw new Error('海报图片加载失败')
    }),
  )

  if (element.offsetWidth === 0 || element.offsetHeight === 0) {
    throw new Error('海报模板没有可绘制尺寸')
  }

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: null,
    logging: false,
  })

  try {
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob)
        else reject(new Error('图片编码失败'))
      }, 'image/png')
    })
  } finally {
    // 图片编码完成后释放本次创建的像素缓冲。
    canvas.width = 0
    canvas.height = 0
  }
}
```

`scale` 决定绘制倍率，`useCORS` 表示尝试使用 CORS 加载，透明背景应使用 `null`。这些配置的具体语义见 [配置文档](https://html2canvas.hertzen.com/configuration)。字体加载流程可参考 [CSS Font Loading API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Font_Loading_API)。

预览时可以用 `URL.createObjectURL(blob)`，关闭预览或替换图片后调用 `URL.revokeObjectURL(url)`。分享接口若只接收 Base64，再在接口边界转换，避免整个链路同时保存多份大字符串。

## 4. 跨域：加时间戳不是通用解决方案

读取图片和导出 Canvas 是两件事。图片能在页面展示，不代表绘制后一定能导出。

排查顺序：检查图片响应的 CORS 头、请求模式、重定向后的最终地址，以及缓存是否返回了不匹配的响应。`crossOrigin = 'anonymous'` 应在设置 `src` 之前完成，服务端也必须允许对应的跨域访问。

`useCORS: true` 不能替服务端添加响应头。`allowTaint: true` 也不能让被污染的画布重新可读。[MDN：跨域图片与 Canvas](https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image)

## 5. 长图：先算像素，再谈清晰度

一张宽 `W`、高 `H`、倍率 `S` 的 RGBA 画布，仅像素缓冲的近似大小是：

```text
W × H × S² × 4 字节

示例：375 × 2000 × 2² × 4 = 12,000,000 字节，约 11.4 MiB
```

这还不包括 DOM 克隆、图片解码、编码结果及临时缓冲。倍率从 2 提到 4，像素缓冲会变为原来的 4 倍。

浏览器、操作系统、设备和版本都会影响可用尺寸。不要把旧文章中的单一数字写成所有 Chrome 或 iOS 的上限。把图片分段绘制，最后再拼成同样大的 Canvas，也没有消除最终画布的限制。

可选策略是降低倍率、改为多张导出、限制内容长度，或使用受控的服务端渲染任务。每种方案都应给出明确的最大输入和失败提示。

## 6. 缓存与重复点击

缓存键至少包含所有影响画面的输入：模板版本、数据版本、语言、主题、图片尺寸和倍率。只按用户 ID 缓存，会在用户更新数据或切换语言后拿到旧海报。

需要区分两件事：

- **进行中去重**：同一组输入正在生成时，后续点击共享同一个 Promise。
- **结果缓存**：生成完成后，在容量和有效期范围内复用 Blob。

失败的 Promise 要从进行中缓存移除，否则后续点击会反复收到同一个失败结果。切换模板或离开页面时，也应清理不再使用的预览 URL。

服务端可以作为明确选择的备用路径，但不要把每次本地失败都自动变成不限量的服务端请求。先限制重试，再评估是否有必要转移执行位置。

## 7. 易错点与学习自检

| 容易误判的情况 | 应该检查什么 |
| --- | --- |
| 内容为空 | 模板是否被 `display: none` 隐藏，数据是否准备好 |
| 字体不一致 | 自定义字体是否加载，目标文字是否有字形，系统字体缩放是否影响模板 |
| 背景缺失 | CORS、CSS 支持、背景图是否就绪 |
| 高清图生成失败 | 实际像素、内存峰值、编码是否返回空结果 |
| 页面越来越卡 | Canvas、预览 URL、大字符串、事件监听是否被持有 |
| 图片生成了但分享失败 | 分享接口接受的格式、大小限制和客户端版本 |

复习时尝试回答：为什么 `nextTick()` 不够？为什么切成多段再拼接仍可能失败？为什么本地生成和服务端截图应该共用数据模型，但不必共用全部执行逻辑？

## 参考资料

- [Niuhk：H5 本地生成图片分享方案](https://niuhk.cn/2024/07/26/H5本地生成图片分享方案/)
- [html2canvas FAQ](https://html2canvas.hertzen.com/faq) · [配置选项](https://html2canvas.hertzen.com/configuration)
- [MDN：Canvas 跨域图片](https://developer.mozilla.org/en-US/docs/Web/HTML/How_to/CORS_enabled_image)
