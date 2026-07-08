# OscarUI

[English](README.md) | 简体中文

OscarUI 是一个 UI 编译器原型：用一份 UI 意图描述文件生成 iOS SwiftUI 和 Android Jetpack Compose 原生界面。
这个名字可以解释为 Open Source Cross Apple/Android Renderer。

核心思路是把 AI 的不确定性限制在 `screens/*.ui.yaml` 这类 IR 文件里，再由确定性编译器生成两端原生代码。同一份 IR 输入，应产生可重复、可验证的原生输出。

## 快速开始

安装依赖：

```sh
npm install
```

校验 IR：

```sh
npm run validate
```

生成两端代码：

```sh
npm run build
```

运行轻量测试：

```sh
npm test
```

生成给下一轮 AI 修改使用的确定性反馈：

```sh
npm run author:loop
```

生成并保存两端截图：

```sh
npm run snapshots
```

截图会保存到 `.aic/snapshots/`。

比较已保存截图的基础元数据：

```sh
npm run snapshots:diff
```

## 日常工作流

改 UI 时，优先编辑：

- `screens/*.ui.yaml`: 页面结构和 UI 意图
- `components/*.ui.yaml`: 可复用组件 UI 意图
- `theme/tokens.yaml`: spacing、radius、color、typography、size 等设计 token
- `schema/ui-ir.schema.json`: 允许使用的 IR 能力
- `compiler/*.mjs`: IR 到 SwiftUI / Compose 的确定性模板

不要手改：

- `generated/ios/*.swift`
- `generated/android/*.kt`
- `.aic/ios/`
- `.aic/android/`

这些都是生成产物，下次构建会被覆盖。

推荐改动循环：

```sh
npm run validate
npm run build
npm run snapshots
```

如果只想确认本机工具链：

```sh
npm run doctor:ios
npm run doctor:android
```

如果只想看宿主工程和命令计划，不启动模拟器：

```sh
npm run dry-run:ios
npm run dry-run:android
```

如果要真实构建、安装并启动 App：

```sh
npm run dev:ios
npm run dev:android
```

把受限 Figma JSON 导入为草稿 screen：

```sh
npm run figma:import -- path/to/figma.json screens/imported.ui.yaml
```

校验插件 manifest：

```sh
npm run plugins:validate
```

## UI IR 示例

当前登录页在 `screens/login.ui.yaml`：

```yaml
screen: Login
title: Login

layout:
  safeArea: true
  contentPosition: top
  contentWidth: compact

state:
  - name: email
    type: string
  - name: password
    type: string

body:
  - type: column
    spacing: normal
    padding: normal
    align: center
    children:
      - type: text
        role: title
        value: Welcome back
      - type: text
        role: caption
        value: Sign in to continue
        color: textSecondary
      - type: textField
        bind: email
        placeholder: Email
        keyboard: email
      - type: textField
        bind: password
        placeholder: Password
        secure: true
      - type: button
        role: primary
        label: Sign in
        action: login
      - type: button
        role: ghost
        label: Forgot password?
        action: forgotPassword

actions:
  - name: login
    steps: [validate, call_api, save_token, navigate]
  - name: forgotPassword
    steps: [navigate]
```

IR 里应引用 token 名，比如 `spacing: normal`、`contentWidth: compact`，不要写裸数值。

## native 目录

`native/` 用来放手写原生 action 实现。

例如 IR 里声明了：

```yaml
action: login
```

编译器会生成：

- iOS: `LoginActions`
- Android: `LoginActions`

实际业务逻辑写在：

- `native/ios/LoginActionsImpl.swift`
- `native/android/LoginActionsImpl.kt`

这里适合写登录、跳转、API 请求、保存 token、接入第三方 SDK 等平台原生逻辑。不要在 `native/` 里手写页面 UI；页面结构仍然由 `screens/*.ui.yaml` 管。

## 目录说明

```text
oscarui/
├── screens/                 # UI IR，页面源码
├── components/              # 可复用组件 IR
├── schema/                  # IR schema，限制可用 UI 能力
├── theme/                   # 设计 token
├── compiler/                # 确定性编译器和 CLI
├── native/                  # 手写原生 action 实现
├── plugins/                 # 可选的确定性流水线扩展
├── generated/               # 生成的 SwiftUI / Compose 代码
└── .aic/                    # 本地宿主工程、构建缓存和截图
```

## 项目进度

阶段进度单独维护在 [`ROADMAP.md`](ROADMAP.md)，README 只保留项目介绍和日常使用说明。
