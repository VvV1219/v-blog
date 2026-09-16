---
title: Lottie 多语言动画：文本、字体与交互笔记
description: 从设计交付约定到动态文字、字体等待、片段播放和资源清理，整理可维护的多语言动画流程。
date: 2026-09-16 10:06
category: 前端实战
tags:
  - Lottie
  - 动画
  - 国际化
  - Vue
  - 学习笔记
aside: true
comment: false
---

# Lottie 多语言动画：文本、字体与交互笔记

相关笔记：[H5 海报生成](../h5/poster-generation.md) · [Vue 组件库](../engineering/vue-component-library.md)

## 1. 核心认识：动画文件也需要稳定接口

视觉效果正确只是交付的一部分。前端还需要知道：哪些文案能替换、哪个片段代表选中、字体从哪里加载、资源升级后这些约定是否仍成立。

如果代码依赖“第三个 SVG 的第五个 g 元素”，设计师插入一个图层就可能让交互失效。相比记录 DOM 下标，更稳妥的是定义资源契约，并用独立 HTML 控件承接交互。

## 2. 问题场景：中文能放下，其他语言溢出了

多语言问题不只是替换字符串。相同语义的文本长度可能不同，字体可能缺字，某些文字还需要复杂排版和不同阅读方向。

交付前约定以下内容：

| 项目 | 建议约定 |
| --- | --- |
| 可替换内容 | 使用唯一占位符，例如 `${resultTitle}` |
| 字体 | 明确字体家族、字重、可用字形及字体使用权限 |
| 文本容器 | 最大宽度、最大行数、最小字号、溢出兜底 |
| 时间轴 | 命名片段或记录起止帧，注明资源版本 |
| 动态内容范围 | 哪些文字属于动画，哪些适合 HTML 覆盖层 |

Glyphs 导出方式会影响文字更新。如果使用导出的字形，替换后的文字必须有对应字形；不能假设任意语言都能直接替换。[lottie-web 文本更新说明](https://github.com/airbnb/lottie-web/wiki/TextLayer.updateDocumentData)

## 3. 实现要点：加载前处理数据，比渲染后猜节点更容易验证

对于少量、静态 source text 的占位符，可以在 `loadAnimation()` 前处理一份独立 JSON。下面是通用教学函数：递归遍历普通 Lottie JSON，替换文本关键帧中的整段占位符。

```ts
export function localizeAnimation(
  source: unknown,
  messages: Record<string, string>,
): unknown {
  // Lottie JSON 是普通数据，复制后避免不同动画实例互相污染。
  const copy = JSON.parse(JSON.stringify(source))

  function visit(node: unknown): void {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!node || typeof node !== 'object') return

    const record = node as Record<string, unknown>
    if (record.ty === 5) {
      const text = record.t as { d?: { k?: { s?: { t?: string } }[] } } | undefined
      for (const frame of text?.d?.k ?? []) {
        const placeholder = frame.s?.t
        if (placeholder && Object.hasOwn(messages, placeholder)) {
          frame.s!.t = messages[placeholder]
        }
      }
    }
    Object.values(record).forEach(visit)
  }

  visit(copy)
  return copy
}
```

例如传入 `{ '${resultTitle}': '探索者' }`，只替换完整匹配的占位符。实际资源应锁定导出格式，并检查预合成图层和多个文本关键帧。

**适用边界：**这不是适配所有 Lottie 格式的通用转换器。表达式驱动文本、特殊导出结构和运行中更新需要单独处理。JSON 结构变化时，应让资源校验失败，而不是静默显示旧文案。

如果文本不需要随动画变形，用 HTML 文本覆盖层通常更容易处理换行、阅读方向和无障碍信息。

## 4. 字体必须等到，缺字也必须发现

页面声明了 `@font-face`，不代表目标字体已经加载。对于还没插入 DOM 的动画文字，可以先用 `document.fonts.load()` 显式请求指定字体，再创建动画。

```ts
const faces = await document.fonts.load('600 24px "PosterFont"', translatedTitle)
if (faces.length === 0) {
  throw new Error('动画字体未配置或未匹配')
}
await document.fonts.ready
```

这里的 `PosterFont` 必须对应页面已有的 `@font-face` 定义。字体加载成功也不保证包含所有目标字形，还要用实际语种检查缺字与回退。[CSS Font Loading API](https://developer.mozilla.org/en-US/docs/Web/API/CSS_Font_Loading_API)

处理溢出时，按“允许换行 → 调整排版 → 有下限地缩小字号 → 使用备用布局”决策。不要无限缩小直到文字看不清，也不要为所有语言写同一个固定字号差值。

## 5. 播放与交互分开管理

在浏览器组件挂载后导入 `lottie-web`，使用容器元素创建实例；不要在服务端渲染阶段访问 `document`。

```ts
import lottie from 'lottie-web'

// container、animationData、button 由调用方准备。
const animation = lottie.loadAnimation({
  container,
  renderer: 'svg',
  loop: false,
  autoplay: false,
  animationData,
})

function selectAnswer() {
  animation.playSegments([30, 60], true)
}

button.addEventListener('click', selectAnswer)

function dispose() {
  button.removeEventListener('click', selectAnswer)
  animation.destroy()
}
```

这段是集成片段，帧号属于示例资源约定，不能用于任意动画。按钮应在动画准备好后启用；Vue 中在卸载时执行 `dispose()`。播放器方法与事件见 [lottie-web 文档](https://github.com/airbnb/lottie-web)。

独立按钮还可以提供键盘操作和明确标签。设置事件捕获不能修复任意遮挡：不在事件传播路径上的元素，不会因为使用捕获阶段而收到事件。

## 6. 切换语言时防止旧任务覆盖新状态

假设用户先切到英语，再马上切到日语。英语资源加载较慢，可能在日语之后返回，最后把界面覆盖回英语。

解决思路是为每轮加载分配递增版本号：异步任务结束后，仅当版本号仍是最新时安装动画。旧任务返回的数据丢弃，旧实例及时销毁。取消网络请求可以节约资源，但版本校验仍然有价值。

对于减少动态效果的系统偏好，可以改为展示关键静态帧，同时保留题目和答案文本。动画不应成为理解业务内容的唯一入口。

## 7. 易错点与学习自检

- 改共享 JSON：多个实例相互影响。应先复制，再替换。
- 只测试一种语言：至少覆盖长文本、缺字、换行与右到左布局。
- 依赖渲染节点下标：资源改版后容易失效。
- 每次渲染都重复监听：一次点击可能触发多次回调。
- 只隐藏容器不销毁实例：页面切换后仍可能继续占用资源。

自检：为何文字已替换却仍显示乱码？何时应该放弃动画内文字，改用 HTML？如何证明切换十次语言后只剩一个有效实例？
