---
title: 基础知识学习笔记
description: 核心概念、常用写法与易错点
date: 2026-09-02 00:00
category: 学习笔记
tags:
  - 后端
  - 基础知识
  - 学习笔记
aside: true
comment: false
---

# 基础知识学习笔记

相关笔记：[基础知识](basic-knowledge-notes.md) · [MySQL](../mysql/mysql-learning-notes.md) · [Go](../go/go-learning-notes.md)

[返回笔记导航](../go/go-backend-basics.md)

## 复习导航

| 我想复习什么？ | 去哪里看？ | 所属模块 |
| --- | --- | --- |
| 程序怎么运行？路径和环境变量是什么？ | [计算机与 Shell](#os-shell) | M1-A1～A2 |
| 管道与重定向怎么写？怎么看退出码？ | [输入输出](#shell-streams)、[退出码](#exit-status) | M1-A3 |
| 请求发给谁？DNS、IP、端口、TCP 有什么关系？ | [网络连接](#network) | M1-B1～B2 |
| HTTP 请求响应怎么看？HTTPS 和登录有什么区别？ | [HTTP 与 Web](#http) | M1-B3 |

**使用边界：**Shell 写文件和网络请求示例会实际执行操作；不要把笔记当脚本重复执行，不向公开服务发送敏感信息。

<a id="os-shell"></a>

## 1. 计算机与 Shell

### 1.1 程序怎样运行

| 概念 | 一句话理解 |
| --- | --- |
| 程序 | 保存在硬盘等持久化存储中的代码和文件 |
| 进程 | 程序的一次运行实例 |
| CPU | 执行程序指令 |
| 内存 | 临时保存运行所需的代码、数据和状态 |
| 操作系统 | 管理硬件资源，为应用创建进程、分配内存、调度 CPU、回收资源 |

```text
点击 Codex
→ 操作系统收到启动请求，从硬盘找到程序文件
→ 创建一个或多个进程
→ 分配内存，安排 CPU 执行程序指令
→ 进程结束后由操作系统回收其资源
```

一个程序可对应一个或多个进程；活动监视器中的进程数，不等于启动程序的次数。

### 1.2 文件、目录与路径

文件保存数据，目录组织文件。绝对路径从 `/` 开始；终端中的相对路径以当前工作目录为起点。

| 写法 | 含义 |
| --- | --- |
| `.` | 当前目录 |
| `..` | 当前目录的父目录 |
| `~` | 当前用户的主目录，例如 `/Users/snoma` |
| `/` | 文件系统的根目录 |
| `/Users/snoma/Documents` | 绝对路径 |
| `Documents` | 相对路径；当前目录是 `/Users/snoma` 时指向上面的目录 |

**易错点：**`~` 不是父目录；改变当前目录，会改变同一个相对路径的实际目标。

### 1.3 终端、Shell 与环境变量

终端负责接收输入、显示结果；Shell 负责解析命令、启动程序。

环境变量是进程可读取的“名称—值”配置，子进程通常继承启动时的环境。`PATH` 保存查找可执行程序时依次搜索的目录。

| 命令 | 用途 |
| --- | --- |
| `pwd` | 查看当前工作目录 |
| `ls` | 列出当前目录内容 |
| `cd ..` / `cd ~` | 切换到父目录 / 用户主目录 |
| `mkdir -p 目录路径` | 创建目录；需要时一并创建上级目录 |
| `printenv PATH` | 查看 PATH 的值 |
| `which node` / `which pnpm` | 查看当前 Shell 找到的命令位置 |

同名程序按 PATH 中的目录顺序查找。

<a id="shell-streams"></a>

### 1.4 标准输入、输出与重定向

| 编号 | 名称 | 用途 |
| --- | --- | --- |
| `0` | stdin（标准输入） | 命令读取的数据 |
| `1` | stdout（标准输出） | 命令的正常结果 |
| `2` | stderr（标准错误） | 命令的错误信息 |

正常结果与错误分开，便于分别处理：结果交给下一条命令，错误写日志。

| 写法 | 数据流向 |
| --- | --- |
| `命令A \| 命令B` | A 的 stdout → B 的 stdin；默认不传递 stderr |
| `命令 > 文件` | stdout → 文件，覆盖原内容 |
| `命令 >> 文件` | stdout → 文件，在末尾追加 |
| `命令 < 文件` | 右侧文件 → 左侧命令的 stdin |
| `命令 2> 文件` | stderr → 文件，覆盖原内容 |

| 命令 | 用途 |
| --- | --- |
| `printf 'hello\n'` | 输出文字，`\n` 表示换行 |
| `cat 文件` | 读取并显示文件内容 |
| `wc -l` | 统计换行符数量；常用来统计文本行数 |
| `head -n 10` | 只显示前 10 行 |

```bash
# 两个换行符，结果为 2；不写文件
printf 'hello\nworld\n' | wc -l

# 覆盖写入练习文件，再从文件读取；结果也为 2
printf 'hello\nworld\n' > practice.txt
wc -l < practice.txt
```

**易错点：**`|` 向右传数据，`<` 从右读数据；`>`、`2>` 都会覆盖原文件内容。

<a id="exit-status"></a>

### 1.5 退出码：成功还是失败

`$?` 保存上一条命令或管道的退出状态：`0` 通常成功，非 `0` 失败。退出码不是输出内容。

管道默认通常取最后一条命令的状态，具体受 Shell 设置影响，不代表其中每条命令都成功。

```bash
# 故意访问不存在的路径，将错误写入练习文件
ls /definitely-not-existing-path 2> error.txt
echo $?
# 上面立即读取 ls 的退出码；本次练习为 1
cat error.txt
```

**`echo $?` 必须紧接目标命令。**如果先执行 `cat`，读到的就是 `cat` 的退出码。重定向错误信息不会改变成败。

### 1.6 环境检查：命令可用不等于服务可用

| 检查 | 能证明什么 |
| --- | --- |
| `go version`、`git --version`、`curl --version` | 当前终端能运行对应工具并取得版本 |
| `which go` | 当前 Shell 找到的 Go 命令位置 |
| `docker --version` | Docker 客户端可用，不代表容器运行环境已启动 |
| `docker context show` | 当前 Docker 连接配置的名称，不验证服务端连通 |
| `kubectl version --client` | 本地 Kubernetes 客户端及内置 Kustomize 版本，不连接集群 |

版本输出是环境盘点，不是项目运行或编程能力验收。Kustomize 用于组织 Kubernetes 配置，具体部署用法留到后续模块；已安装不必现在就深入学习。

<a id="network"></a>

## 2. 网络连接：找到谁，怎样连

### 2.1 客户端与服务端

客户端主动请求；服务端监听、处理请求并返回结果。它们是通信角色，不是固定的软件类别。

在 `cms-web → cms-api` 中，前者是客户端，后者是服务端；当 `cms-api` 调用其他服务时，它又是客户端。

### 2.2 IP、端口与监听

IP 定位设备或网络接口，端口区分其中的网络服务：`IP:端口 → 监听进程`。

| 地址或状态 | 含义 |
| --- | --- |
| `127.0.0.1` / `::1` | IPv4 / IPv6 的本机回环地址，都表示当前电脑自身 |
| `127.0.0.1:8080` | 通过本机 IPv4 回环地址访问端口 8080 上的服务 |
| `*:7000` | 在对应地址族的所有本地地址上监听端口 7000，不是监听多个端口 |
| `LISTEN` | 正在监听，等待客户端连接 |

同一协议、地址与端口冲突时，新服务通常无法监听。`*` 不保证外部一定能访问，还受网络和防火墙影响。

查看本机 TCP 监听情况（macOS，只读）：

```bash
lsof -nP -iTCP -sTCP:LISTEN | head -n 10
```

| 组成 | 含义 |
| --- | --- |
| `lsof` | 查看进程打开的文件和网络连接 |
| `-nP` | IP 不转换成域名，端口不转换成服务名称 |
| `-iTCP` | 只看 TCP 网络项 |
| `-sTCP:LISTEN` | 只看监听状态 |
| `head -n 10` | 只展示前 10 行，包含表头 |

输出重点看：`COMMAND` 进程名、`PID` 进程编号、`NAME` 中的地址和端口。

### 2.3 DNS 与 TCP

```text
域名 → DNS 查询得到 IP → 加上端口 → 建立 TCP 连接 → 服务端进程
```

这里的 DNS 查询将域名解析为一个或多个 IP，不建立连接。TCP 通常由服务端先监听、客户端主动连接。

迁移、扩容、负载均衡或故障切换可能改变解析结果。TTL 表示结果可缓存多久，缓存未更新时可能仍使用旧 IP。

```bash
# 查询域名对应的 IP
nslookup www.hellotalk.com

# 测试到目标端口的 TCP 连接；也可把域名替换为查到的 IP
nc -vz -G 5 example.com 443
```

`nslookup` 的 `Server` / 前面的 `Address` 是 DNS 服务器；答案中的 `Name` / `Address` 才是目标域名和 IP。

`nc` 测试网络连接：`-v` 显示详情，`-z` 只探测、不发业务数据；macOS 的 `-G 5` 设置 5 秒连接超时。域名先解析，IP 可直接测 TCP。

### 2.4 分清失败发生在哪一层

| 现象 | 能判断什么 |
| --- | --- |
| 域名不存在或无法解析 | DNS 阶段失败 |
| `Connection refused` | TCP 连接被主动拒绝，常见原因是目标端口没有监听 |
| 连接超时 | 规定时间内未建立 TCP 连接，原因仍需排查 |
| `nc` 显示 `succeeded` | TCP 能连接；不能据此判断 TLS、HTTP 或业务成功 |

**排查顺序：**连接被拒绝先检查服务是否启动、地址/端口是否正确、端口是否监听，不先改 HTTP 参数。收到 HTTP 500 则已取得 HTTP 响应，优先查对应请求的错误日志、代码和依赖；不等于 TCP 连接失败。

<a id="http"></a>

## 3. HTTP 与 Web

### 3.1 URL：请求的目标

```text
https://api.example.com:8443/users/42?lang=zh&source=web#profile
```

| 部分 | 示例 |
| --- | --- |
| 协议 | `https` |
| 域名 | `api.example.com` |
| 端口 | `8443`；未显式填写时 HTTP 默认 80，HTTPS 默认 443 |
| 路径 | `/users/42` |
| 查询参数 | `lang=zh`、`source=web`，用 `&` 分隔 |
| 片段 | `profile`，通常供客户端使用，不发送给服务端 |

### 3.2 请求与响应：结构和 Header

请求：方法 + 目标 + Header + 可选 Body。响应：状态码 + Header + 可选 Body。HTTP/1.1 示例中，Header 与 Body 以空行分隔：

```http
GET /users/42 HTTP/1.1
Host: api.example.com
Accept: application/json
```

```http
HTTP/1.1 200 OK
Content-Type: application/json

{"id":42,"name":"Tom"}
```

| Header | 出现在哪 | 表达什么 |
| --- | --- | --- |
| `Host` | 请求 | 目标主机 |
| `Content-Type` | 请求或响应 | 这条消息实际发送的 Body 是什么格式 |
| `Accept` | 请求 | 客户端希望收到什么格式 |

`application/json` 表示 JSON，`text/html` 表示 HTML；请求中的 Content-Type 描述发出的数据，不是期望返回的数据。

### 3.3 方法与状态码

| 方法 | 常见语义 |
| --- | --- |
| `GET` | 查询资源 |
| `POST` | 创建资源或执行操作 |
| `PUT` | 用完整数据替换资源 |
| `PATCH` | 局部修改资源 |
| `DELETE` | 删除资源 |

| 状态码 | 含义 |
| --- | --- |
| `200` / `201` / `204` | 成功 / 已创建 / 成功但无 Body |
| `400` | 请求格式、参数等有问题 |
| `401` | 缺少有效认证凭证，例如 Token 无效 |
| `403` | 拒绝访问，常见情形是权限不足，不必然表示已登录 |
| `404` | 目标资源不存在 |
| `500` | 服务端内部错误 |

**易错点：**收到 `500` 是收到了失败响应，不是 TCP 连接失败。方法的实际行为还要看接口实现。

### 3.4 JSON：数据的文本格式

JSON 是文本格式，支持对象、数组、字符串、数字、布尔值、`null`。键和字符串用双引号，不能有注释、尾随逗号或 `undefined`。

```json
{"name":"Tom","active":true}
```

| 写法 | 转换方向 |
| --- | --- |
| `JSON.stringify(value)` | 可序列化的 JavaScript 值 → JSON 文本 |
| `JSON.parse(text)` | 合法 JSON 文本 → JavaScript 值，不一定是对象 |

### 3.5 HTTPS、Cookie 与 Token

HTTPS 可以理解为 HTTP 加 TLS。TLS 提供传输加密、完整性校验和服务端身份验证，不代表业务用户已经登录。

```text
DNS → TCP → TLS → HTTP
```

以上是基于 TCP 的 HTTPS 路径（HTTP/1.1、HTTP/2）。

| 目的 | 常见方式 |
| --- | --- |
| 服务端设置 Cookie | 响应 Header：`Set-Cookie` |
| 浏览器发送 Cookie | 请求 Header：`Cookie` |
| 使用 Bearer Token 认证 | 请求 Header：`Authorization: Bearer TOKEN` |

Cookie 存储并按规则随请求携带数据，不一定是登录凭证；Token 也能通过 Cookie 发送。

### 3.6 curl：发送并观察请求

以下命令会真实发送网络请求，不是只查看本地内容。

```bash
# GET：查看响应 Header 和 Body
curl -i -sS --max-time 10 https://example.com

# POST：向公开回显服务发送虚构 JSON 数据
curl -i -sS --max-time 10 -X POST \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{"name":"Tom","active":true}' \
  https://httpbin.org/anything
```

| 参数 | 作用 |
| --- | --- |
| `-i` | 同时显示响应 Header |
| `-sS` | 隐藏进度，但保留错误信息 |
| `--max-time 10` | 整次操作最多 10 秒 |
| `-X` / `-H` / `-d` | 指定方法 / 添加 Header / 设置 Body |

读结果：状态码 → Header 中的格式 → Body。命令行中的 URL 直接写地址，不写 Markdown 链接。

**易错点：**curl 默认收到 `404`、`500` 仍可能退出 `0`，退出码不等于 HTTP 状态码。HTTPS 返回 `200` 说明传输和 HTTP 请求成功，不替代业务内容校验。

公开服务可能记录公网出口 IP；测试只用虚构数据，不发送真实 Token、密码或个人信息。
