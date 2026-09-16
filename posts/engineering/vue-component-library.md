---
title: Vue 组件库工程化：开发、打包与发布笔记
description: 用独立的通用组件示例，理解组件契约、工作区依赖、产物入口、类型声明、样式与发布验收。
date: 2026-09-16 10:04
category: 前端工程化
tags:
  - Vue
  - TypeScript
  - 组件库
  - PNPM
  - 学习笔记
aside: true
comment: false
---

# Vue 组件库工程化：开发、打包与发布笔记

> 参考 Niuhk 公开文章[从 0 构建前端 UI 组件库](https://niuhk.cn/2023/01/06/从0构建前端UI组件库/)，按“消费方能否正确安装和使用”重新组织。下文 `@example/ui` 和组件代码均为独立教学示例，不引用公司私有仓库源码或内部发布配置。

相关笔记：[Lottie 多语言](../animation/lottie-i18n.md) · [H5 性能优化](../performance/h5-performance.md)

## 1. 核心认识：组件库交付的是约定和产物

一个组件在源码目录里能运行，只证明开发环境能解析它。组件库还要保证：安装包包含正确文件、导入入口有效、类型可见、样式可加载、依赖不冲突。

```text
组件契约 → 源码与样式 → 本地演示与测试
→ JS / CSS / 类型声明 → 打包安装验证 → 版本发布
```

先想清产物，再组织目录，比先搭复杂脚手架更容易判断每个工具的职责。

## 2. 问题场景：哪些东西值得成为通用组件？

按钮、头像和弹窗可以共享交互与视觉约定；但“领取某活动奖励并埋点”的完整逻辑通常属于业务层。

判断标准不是代码重复了几次，而是多个调用方是否需要同一份稳定契约。业务差异可以通过 props、事件和插槽表达；如果每次需求都新增一串互相影响的布尔参数，应重新考虑边界。

以按钮为例，先定义：禁用时不触发业务点击、加载时防重复操作、默认 `type="button"`，避免放进表单后意外提交。

```vue
<script setup lang="ts">
interface Props {
  disabled?: boolean
  loading?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  disabled: false,
  loading: false,
})

const emit = defineEmits<{
  click: [event: MouseEvent]
}>()

function onClick(event: MouseEvent) {
  if (!props.disabled && !props.loading) emit('click', event)
}
</script>

<template>
  <button
    class="example-button"
    type="button"
    :disabled="disabled || loading"
    :aria-busy="loading"
    @click="onClick"
  >
    <slot />
  </button>
</template>
```

此示例使用 Vue 3.3+ 的具名元组事件类型写法。保存为 `Button.vue` 后可在匹配版本的 Vue 工程使用，样式按下一节单独导出。它展示契约边界，不是一套完整视觉设计系统。

## 3. 工作区：按职责拆包，不是按目录数量拆包

一个学习用的目录可以这样组织：

```text
packages/
  ui/
    src/Button.vue
    src/index.ts
    src/style.css
    package.json
    tsconfig.build.json
playground/             本地消费示例
docs/                   API 与交互文档
```

`src/index.ts` 暴露公开入口：

```ts
export { default as ExampleButton } from './Button.vue'
import './style.css'
```

根目录 `pnpm-workspace.yaml`：

```yaml
packages:
  - packages/*
  - playground
  - docs
```

工作区内部依赖可声明为 `workspace:*`。它明确要求使用本地工作区包，发布时由包管理器转换为正常版本范围。[PNPM Workspace](https://pnpm.io/workspaces)

注意：TypeScript `paths` 主要服务于解析与类型工具。开发时能识别别名，不代表发布后的 JavaScript 会自动改写成可安装的包路径。

## 4. 打包：把三种输出分开检查

| 输出 | 解决什么问题 | 常见遗漏 |
| --- | --- | --- |
| JavaScript | 消费方执行组件逻辑 | 把 Vue 重复打进包、残留内部别名 |
| CSS | 消费方获得预期样式 | 产物未导出，或被错误地当成无副作用文件删除 |
| `.d.ts` | 编辑器提示与类型检查 | 路径不对、声明引用了未发布的源码 |

原文使用 Rollup 与 Gulp 组织打包。也可以使用 Vite library mode；选择工具时要看输出格式、入口数量和团队维护成本，不必为“有组件库”引入所有工具。

若使用 Vite，要显式外置 Vue，并按所用主版本配置对应构建选项。不同版本可能使用 `rollupOptions` 或 `rolldownOptions`，不要把旧配置直接套进新版本。[Vite library mode](https://vite.dev/guide/build.html#library-mode)

Vue 库通常将 `vue` 声明为 `peerDependencies`，由使用方提供运行时；本地开发时仍需安装匹配版本。构建 JS 与生成类型是不同任务，Vue SFC 的类型检查和声明生成可用 `vue-tsc`，具体配置应以实际目录为准。[Vue TypeScript 文档](https://vuejs.org/guide/typescript/overview.html)

## 5. 包入口：声明必须与真实文件一致

下面是一份**假设已经生成相应文件**的发布清单，用于理解入口映射。它不是仅靠复制就能完成构建的脚手架。

```json
{
  "name": "@example/ui",
  "version": "0.1.0",
  "type": "module",
  "files": ["dist"],
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    },
    "./style.css": "./dist/style.css"
  },
  "sideEffects": ["**/*.css"],
  "peerDependencies": {
    "vue": "^3.3.0"
  }
}
```

这个示例仅承诺 ESM。若还要支持 CommonJS，需要实际生成对应产物，并为 JS 和类型解析分别验证，不能只添加一个不存在的 `require` 路径。

`exports` 定义包允许被导入的入口。不要把“使用 import 就一定找 module 字段”当作所有运行环境的规则。[Node.js 包入口与条件导出](https://nodejs.org/api/packages.html#conditional-exports)

消费方显式导入：

```ts
import { ExampleButton } from '@example/ui'
import '@example/ui/style.css'
```

## 6. 测试分两层：组件行为与安装包消费

组件测试关注使用者可观察的行为：插槽内容可见、禁用时不发送点击事件、加载态阻止重复操作、键盘操作符合原生语义。

安装包测试则应在工作区之外准备一个干净 Vue 项目，安装打出的压缩包，而不是直接引用源码或依赖本地软链接。检查导入、样式、类型提示和生产构建。

```bash
# 在已经完成构建的包目录查看将被发布的文件，不上传到注册表。
npm pack --dry-run
```

如果开发环境正常、安装后失败，优先检查：`files` 是否遗漏产物，`exports` 是否指错文件，声明中是否保留内部路径，CSS 是否导出，以及运行时依赖是否被错误地放在开发依赖中。[npm pack](https://docs.npmjs.com/cli/commands/npm-pack)

## 7. 发布流程：可重复构建比手工成功一次更重要

```text
固定依赖安装 → 类型检查 → 行为测试 → 构建
→ 打包检查 → 干净项目消费验证 → 生成版本说明 → 发布
```

发布凭据由 CI 注入；源代码、文档和安装包不应携带它。发布后保留版本、提交和产物之间的对应关系，才能定位“哪个包版本引入了变化”。

文档至少记录 props、事件、插槽、默认值和一个完整使用示例。破坏性的契约变化需要明确迁移说明；版本号不能替代说明。

## 8. 易错点与学习自检

- **组件源码能运行，所以包能发布？**还没验证入口、声明、样式与依赖。
- **拆成多个包就自动按需加载？**还要看模块格式、导出方式、副作用和消费方构建结果。
- **用了 TypeScript 就自带声明产物？**类型检查与声明输出需要单独配置。
- **单测通过就不需要消费验证？**单测可能绕过真正的安装路径。

自检：为什么要把 Vue 外置？如何证明用户能从安装包获得类型？如果按钮的 `loading` 行为改变，哪些文档和测试需要同步？

## 参考资料

- [Niuhk：从 0 构建前端 UI 组件库](https://niuhk.cn/2023/01/06/从0构建前端UI组件库/)
- [PNPM 工作区](https://pnpm.io/workspaces) · [Vite 库模式](https://vite.dev/guide/build.html#library-mode)
- [Vue 与 TypeScript](https://vuejs.org/guide/typescript/overview.html) · [Node.js 包入口](https://nodejs.org/api/packages.html#conditional-exports)
