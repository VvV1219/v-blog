---
title: Go 学习笔记
description: 核心概念、常用写法与易错点
date: 2026-09-02 00:00
category: 学习笔记
tags:
  - 后端
  - Go
  - 学习笔记
aside: true
comment: false
---

# Go 学习笔记

相关笔记：[基础知识](../backend/basic-knowledge-notes.md) · [MySQL](../mysql/mysql-learning-notes.md) · [Go](go-learning-notes.md)

## 复习导航

| 我想复习什么？ | 去哪里看？ | 所属模块 |
| --- | --- | --- |
| Go 程序的两个 main 分别是什么？ | [最小 Go 程序](#go-program) | M2-A1 |

**使用边界：**代码示例不等于实际运行或验收通过；项目代码只作已学语法对照，业务逻辑与未学语法后续再展开。

<a id="go-program"></a>

## 1. Go 语言基础

### 1.1 最小程序：源码、可执行文件与 main

Go 源码是开发者编写的文本；构建把源码及其依赖编译、链接为产物。构建普通可执行程序时，产物是操作系统可以启动的可执行文件；启动后成为进程。

```go
package main

import "fmt"

func main() {
    fmt.Println("开始学习 Go")
    fmt.Println("我的目标是独立开发后端接口")
}
```

- `package main`：声明文件属于入口包。不是所有 Go 文件都必须属于 main 包。
- `func main()`：入口包中的主函数；程序完成初始化后进入它执行主逻辑。
- `import "fmt"`：引入标准库 fmt，不会因此打印内容；普通包提供功能供其他代码调用，不作为独立程序入口。
- `fmt.Println(...)`：输出内容并换行；这里两次调用按顺序输出两行。
- 包名、函数名与文件名是不同概念；入口函数不要求必须写在名为 `main.go` 的文件中。

**易错点：**`package main` 只是声明入口包，不会单独完成构建，也不表示程序已经运行；可执行程序也不一定有图形界面或监听网络端口。

### 1.2 package：根据所属包声明，不根据文件名猜

`package model` 表示当前文件属于 model 包。model 是开发者命名，不是关键字，不会自动赋予数据库操作能力。

本地 cms-api 的真实对照（只读核对，不代表已理解其中业务）：

| 文件 | 包声明 | 观察点 |
| --- | --- | --- |
| `main.go` | `package main` | 第 13 行定义入口函数 main |
| `app/app.go` | `package app` | 提供 New 等功能，由入口代码调用 |
| `model/orderby.go`、`model/paginate.go` | `package model` | 不同文件同属 model 包，提供排序与分页辅助功能 |
| `model/im/ht_virtual_gift.go` | `package im` | 子目录是另一个包，不自动归入父目录的 model 包 |

确定写法：给已有目录加普通 Go 文件，跟随该目录的包声明；新建程序入口用 main；新建功能包按职责命名，通常与目录名一致。同一目录一起参与普通构建的 Go 文件须使用同一包名，测试文件的特殊规则后续再学。

`package app` 声明“我属于哪个包”；入口文件中的 `import "code.hellotalk.com/cms/cms-api/v2/app"` 声明“我要使用哪个包”；`app.New()` 才是调用其中的函数。不要把包声明、导入和函数调用混为一谈。
