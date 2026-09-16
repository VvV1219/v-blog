---
title: Node.js 与 Go 接入 Gemini 多模态模型笔记
description: 用服务端示例梳理音频输入、模型配置、超时、结构化结果与成本控制。
date: 2026-09-16 10:01
category: 后端与 AI
tags:
  - Gemini
  - Node.js
  - Go
  - AI
aside: true
comment: false
---

# Node.js 与 Go 接入 Gemini 多模态模型笔记

相关笔记：[Go 学习笔记](../go/go-learning-notes.md) · [Express 入门](../express/express-getting-started.md)

## 1. 先确定输入和输出契约

以语音练习反馈为例，服务端接收音频，再返回转写、反馈和不确定项。不要把模型的语言评价当成客观考试分数，也不要根据声音推断说话人的身份。

```text
客户端上传 → 校验大小与格式 → 服务端调用模型
→ 验证响应 → 保存必要的业务结果 → 返回客户端
```

API Key 只保存在服务端。不要放进 `VITE_` 环境变量、浏览器代码或公开仓库。日志记录请求标识、耗时、模型和错误类型即可，默认不记录完整音频及敏感转写。

## 2. SDK 和接口会变，模型名称应可配置

Google Gen AI SDK 的包名是 Node.js 的 `@google/genai` 和 Go 的 `google.golang.org/genai`。

截至本文整理时，官方文档已经将 Interactions API 作为新的文档入口，并将 Generate Content 文档标记为 Legacy。下面保留 Generate Content 的简短双语言示例，用于演示音频输入与响应处理；新项目应先核对当前官方接口、模型支持和迁移说明，再决定采用哪条路径。

通过 `GEMINI_MODEL` 配置经确认支持音频的模型，避免将旧 preview 名称写死。SDK 版本应锁定在 lockfile 或 go.mod 中，升级时重新验证。

## 3. Node.js：发送一段本地音频

安装 `@google/genai` 后，将下面代码保存为 `audio.mjs`。运行前在服务端环境配置 `GEMINI_API_KEY` 和 `GEMINI_MODEL`，通过 `node audio.mjs ./sample.mp3` 调用。

```js
import { readFile, stat } from 'node:fs/promises';
import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;
const model = process.env.GEMINI_MODEL;
const path = process.argv[2];
if (!apiKey || !model || !path) {
  throw new Error('请配置 API Key、模型名称，并提供 MP3 文件路径');
}
// 这是示例的业务限制，不是服务商的通用上限。
const limit = 5 * 1024 * 1024;
const metadata = await stat(path);
if (!metadata.isFile() || metadata.size === 0 || metadata.size > limit) {
  throw new Error('音频必须是非空文件，且不超过 5 MiB');
}
const audio = await readFile(path);
if (audio.length === 0 || audio.length > limit) throw new Error('音频大小不合法');
const ai = new GoogleGenAI({ apiKey });
const response = await ai.models.generateContent({
  model,
  contents: [
    { text: '请转写这段音频，并列出听不清的片段；不要补造内容。' },
    { inlineData: { mimeType: 'audio/mpeg', data: audio.toString('base64') } },
  ],
});
const text = response.text;
if (!text?.trim()) throw new Error('模型没有返回可用文本，请检查响应状态');
console.log(text);
```

此示例假定文件确实为 MP3。真实上传接口还需验证内容与 MIME 类型是否一致，不能只相信扩展名或请求头。Base64 会增加传输体积；长音频应评估当前接口支持的文件上传方式。

这是一段单次请求脚本，尚未包含请求取消、总时限或自动重试，不能直接作为生产 HTTP 接口。超时配置应按所锁定 SDK 的接口添加，避免只用 `Promise.race` 返回超时却让后台请求继续消耗资源。

## 4. Go：用 Context 约束等待时间

在已有 Go module 中安装 `google.golang.org/genai`，保存为 `main.go`。环境变量与 Node.js 示例相同，通过 `go run . ./sample.mp3` 执行。

```go
package main

import (
    "context"
    "fmt"
    "log"
    "os"
    "time"

    "google.golang.org/genai"
)

func main() {
    apiKey, model := os.Getenv("GEMINI_API_KEY"), os.Getenv("GEMINI_MODEL")
    if apiKey == "" || model == "" || len(os.Args) != 2 {
        log.Fatal("请配置 API Key、模型名称，并提供 MP3 文件路径")
    }
    const limit = 5 * 1024 * 1024
    info, err := os.Stat(os.Args[1])
    if err != nil { log.Fatal(err) }
    if !info.Mode().IsRegular() || info.Size() == 0 || info.Size() > limit {
        log.Fatal("音频必须是非空文件，且不超过 5 MiB")
    }
    audio, err := os.ReadFile(os.Args[1])
    if err != nil { log.Fatal(err) }
    if len(audio) == 0 || len(audio) > limit { log.Fatal("音频大小不合法") }

    ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
    defer cancel()
    client, err := genai.NewClient(ctx, &genai.ClientConfig{
        APIKey: apiKey, Backend: genai.BackendGeminiAPI,
    })
    if err != nil { log.Fatal(err) }
    parts := []*genai.Part{
        genai.NewPartFromText("请转写这段音频，并列出听不清的片段；不要补造内容。"),
        {InlineData: &genai.Blob{MIMEType: "audio/mpeg", Data: audio}},
    }
    contents := []*genai.Content{genai.NewContentFromParts(parts, genai.RoleUser)}
    result, err := client.Models.GenerateContent(ctx, model, contents, nil)
    if err != nil { log.Fatal(err) }
    if result == nil || result.Text() == "" { log.Fatal("模型未返回可用文本") }
    fmt.Println(result.Text())
}
```

45 秒只是示例预算。HTTP 服务应从入站请求的 Context 派生超时，使客户端断开时能够传递取消信号。取消等待不代表已发生的模型处理一定不计费。

两段示例未在本文中发起真实的付费模型请求，效果与可用性仍需用自己的模型权限和测试音频验证。

## 5. JSON 输出后仍要做业务校验

如果前端需要稳定展示，可设计这样的业务结果：

```json
{
  "transcript": "示例转写",
  "feedback": ["示例建议"],
  "uncertainSegments": ["00:03—00:05"]
}
```

使用当前接口支持的结构化输出配置，约束字段类型。接收后仍要检查必填项、字符串长度、数组数量和允许值，并处理空响应、拒答、截断等情况。提示词中的“只返回 JSON”不能替代解析和验证。

不要直接把模型输出拼进 HTML。若允许 Markdown，需使用明确的渲染和过滤策略。

## 6. 延迟和成本一起测

| 维度 | 建议记录 |
| --- | --- |
| 输入 | 音频时长、格式、字节数 |
| 模型 | 名称、版本、生成参数 |
| 时延 | 上传、模型等待、总耗时，分别统计 P50 / P95 |
| 结果 | 成功、超时、限流、空响应、结构不合格 |
| 成本 | 请求量、用量字段、失败重试次数 |

遇到限流或可恢复错误，可采用带随机抖动的有限重试，同时限制总时间和次数。错误的密钥、格式或模型名称不应盲目重试。每次重试都可能再次产生费用。

比较 Node.js 与 Go 时，保持模型、输入、地域和并发一致。单次请求的快慢通常不足以证明语言导致差异。
