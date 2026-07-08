# OscarUI 方案 v2

OscarUI = Open Source Cross Apple/Android Renderer

## 一、核心理念

传统 Flutter：一套代码，多端运行（性能受桥接/自绘引擎限制）。

本方案：**一套意图，多端生成原生代码**。

> 核心目标：人类和 AI 维护统一的 UI 意图模型（IR），由**确定性编译器**
> 生成 iOS（SwiftUI）和 Android（Jetpack Compose）原生代码。

### 关键原则：随机性隔离

AI 大模型每次生成的东西都不同 —— 这是本方案要解决的第一问题。解法：

```
┌─────────────────────────┐   ┌──────────────────────────────┐
│   AI 参与区（允许随机）    │   │   确定性区（禁止 AI 参与）      │
│                         │   │                              │
│  需求/Figma/自然语言      │──▶│  IR 校验 (JSON Schema)        │
│       ↓                 │   │       ↓                      │
│  生成/修改 UI IR (YAML)  │   │  模板编译器 (纯代码，无 LLM)     │
│                         │   │       ↓                      │
│                         │   │  SwiftUI / Compose 源码       │
└─────────────────────────┘   └──────────────────────────────┘
```

- AI **只能读写 `.ui.yaml`（IR 文件）**，永远不直接写 Swift/Kotlin。
- IR → 原生代码由**普通程序**（模板编译器）完成：同一 IR 输入，输出字节级相同。
- IR 有 JSON Schema，AI 生成后必须通过校验才能进编译，不合法就打回重生成。

这样 AI 的不确定性被压缩到「设计决策」层面，而代码质量、命名、结构、平台惯例
全部由编译器模板固化，两端行为一致由同一份 IR 保证。

---

## 二、系统架构

```
Human Intent / Figma / 自然语言
        │  (AI Agent，受 AGENTS.md + Schema 约束)
        ▼
   UI IR 文件 (.ui.yaml)          ← 唯一的「源码」，进 git
        │  (aic validate：JSON Schema 校验)
        ▼
   确定性编译器 (aic build)
        │
        ├──▶ ios/Generated/*.swift      (SwiftUI 页面 + App 外壳)
        └──▶ android/…/generated/*.kt   (Jetpack Compose)
```

生成目录被视为编译产物：**手改无效**（下次编译覆盖），也不需要 code review —
review 的对象是 IR diff。

---

## 三、UI IR 设计

不描述像素，描述语义。每个 screen 一个文件：

```yaml
screen: Login
title: 登录

state:
  - name: email
    type: string
  - name: password
    type: string

body:
  - type: column
    spacing: normal
    padding: normal
    children:
      - type: text
        role: title          # title/heading/body/caption → 两端各自映射字号
        value: 欢迎回来
      - type: textField
        bind: email          # 双向绑定到 state
        placeholder: 邮箱
        keyboard: email
      - type: textField
        bind: password
        placeholder: 密码
        secure: true
      - type: button
        role: primary        # primary/secondary/ghost
        label: 登录
        action: login        # 只引用 action 名，逻辑另写

actions:
  - name: login
    steps: [validate, call_api, save_token, navigate]
```

设计规则：

1. **语义 token，禁止裸数值**。`spacing: normal` 而非 `padding: 17`。
   token → 数值的映射在 `src/theme/tokens.yaml`，两端共用。
2. **枚举收窄**。组件类型、role、spacing 都是 schema 里的闭集枚举。
   AI 想「发挥」时 schema 会直接拒绝，这就是防漂移的硬约束。
3. **UI 与 Logic 分离**。IR 只声明 `action: login`；action 的实现是
   各端手写的原生代码（或后续用同样思路生成），编译器只生成调用桩。

---

## 四、MVP 组件集（Phase 1 闭集）

| 组件 | iOS 映射 | Android 映射 |
|---|---|---|
| column / row | VStack / HStack | Column / Row |
| text | Text + font(role) | Text + MaterialTheme.typography |
| image | AsyncImage | AsyncImage (Coil) |
| button | Button + role 样式 | Button/OutlinedButton/TextButton |
| textField | TextField/SecureField | OutlinedTextField |
| list | List + ForEach | LazyColumn + items |
| spacer | Spacer | Spacer |

不在此表内的需求 → 先扩展 schema 和编译器模板，再允许 IR 使用。
**组件集的每次扩张都是人工决策，不是 AI 决策。**

---

## 五、Design Token

`src/theme/tokens.yaml` 是唯一的视觉真源：

```yaml
spacing: { tight: 4, normal: 16, loose: 24 }
radius:  { small: 4, normal: 8, large: 16 }
color:
  primary: "#3B82F6"
  background: "#FFFFFF"
  textPrimary: "#111827"
typography:
  title:   { size: 28, weight: bold }
  heading: { size: 20, weight: semibold }
  body:    { size: 16, weight: regular }
  caption: { size: 13, weight: regular }
```

编译器把它编译成两端的 Theme 文件（`Theme.swift` / `Theme.kt`），
IR 里只允许引用 token 名。

---

## 六、AI 修改机制（防漂移闭环）

AI 改 UI 的完整流程（写进项目 AGENTS.md，对 AI 是强制约束）：

1. 读现有 `.ui.yaml`（不是读生成的 Swift/Kotlin）
2. 做**最小 diff 修改**（禁止重写整个文件 —— diff 小 = 漂移小）
3. 跑 `aic validate` —— schema 不过就修 IR，不许绕过
4. 跑 `aic build` —— 重新生成两端代码
5. 人 review 的是 IR 的 diff（几行 YAML），不是几百行原生代码

「让首页更高级」这类模糊需求，AI 的动作被限制为：调整 role、spacing、
层级结构 —— 全在枚举内挑选，不可能产出编译不了的东西。

---

## 七、逻辑系统

Phase 1：编译器为每个 screen 生成 Action 协议/接口，实现手写原生：

```swift
// 生成的（勿改）
protocol LoginActions { func login() }
// 手写的（不会被覆盖）
class LoginActionsImpl: LoginActions { func login() { … } }
```

```kotlin
interface LoginActions { fun login() }
class LoginActionsImpl : LoginActions { override fun login() { … } }
```

业务逻辑天然是原生的，性能无损；AI 也可以帮写这部分，
但它属于普通 native 开发，不在 IR 管辖内。

当前实现把可编辑 action 实现放在 `src/native/ios/*.swift` 与
`src/native/android/*.kt`。这些文件首次缺失时由 CLI 脚手架创建，之后不会覆盖；
`.aic/ios` 和 `.aic/android` 宿主工程会在每次开发运行时复制它们。

---

## 八、运行模式

- **Compile Mode（Phase 1 唯一模式）**：IR → 原生源码 → Xcode/Gradle 正常构建。
  性能 = 手写原生，因为它就是原生。
- **Runtime Mode（Phase 3，可选）**：App 内置 IR 解释器，服务器下发 IR 实现热更新。
  注意 iOS 审核政策风险，且性能不如编译模式，仅用于运营位等低频场景。

### 开发时 CLI

本项目的日常开发入口应该是 `aic` CLI，而不是 Xcode / Android Studio GUI：

```
npm run validate      # 校验 IR
npm run build         # 生成原生源码和宿主外壳
npm run doctor:ios    # 检查 iOS 构建/模拟器工具链
npm run dev:ios       # 目标：生成 → 构建 → 启动模拟器 → 安装运行
npm run doctor:android # 检查 Android SDK/JDK/模拟器工具链
npm run dev:android    # 目标：生成 → Gradle 构建 → 启动模拟器 → 安装运行
```

注意：iOS 仍然必须依赖 Apple 官方 toolchain（`xcodebuild`、`xcrun simctl`、
iOS Simulator runtime）。区别是这些工具由 CLI 调用，开发者和 AI 不需要打开
Xcode GUI。后续完整闭环应由 `aic dev ios` 生成 Xcode-compatible 宿主工程，
再自动完成 build/install/launch。

Android 同样不依赖 Android Studio GUI。CLI 生成 `.aic/android` Gradle/Compose
宿主工程，使用 Android SDK command-line tools、JDK 17、Gradle、`adb` 和
`emulator` 完成 build/install/launch。

---

## 九、目录结构

```
oscarui/
├── OscarUI_方案.md
├── AGENTS.md                  # AI 行为约束（强制）
├── src/                       # App 源码与意图
│   ├── app.config.yaml        # App 标识、权限、链接和平台配置源码
│   ├── theme/
│   │   └── tokens.yaml
│   ├── screens/
│   │   └── login.ui.yaml      # 页面 IR
│   ├── components/
│   │   └── projectCard.ui.yaml # 可复用组件 IR
│   └── native/
│       ├── ios/               # 手写 iOS Action 实现，不会被生成覆盖
│       └── android/           # 手写 Android Action 实现，不会被生成覆盖
├── schema/
│   └── ui-ir.schema.json     # IR 的 JSON Schema（硬约束）
├── compiler/                  # 确定性编译器（Node.js，无 LLM）
│   ├── aic.mjs               # CLI: validate / build
│   ├── swiftui.mjs           # IR → SwiftUI 模板
│   ├── ios-shell.mjs         # SwiftUI App 外壳模板
│   ├── ios-host.mjs          # .aic/ios Xcode-compatible 宿主工程
│   ├── android-host.mjs      # .aic/android Gradle/Compose 宿主工程
│   └── compose.mjs           # IR → Compose 模板
└── generated/                 # 编译产物（勿手改）
    ├── ios/                  # Theme.swift / App.swift / *View.swift
    └── android/
```

---

## 十、路线图

阶段进度单独维护在 [`ROADMAP.md`](ROADMAP.md)，避免 README、方案文档和实现进度多处同步。

---

## 十一、核心壁垒

1. **IR Schema 设计**：语义足够表达真实 App，枚举足够窄以约束 AI
2. **确定性编译器**：模板质量决定生成代码是否像资深工程师手写
3. **闭环工具链**：validate → build → 截图对比，让 AI 可以自我纠错

## 十二、定位

不是 AI Flutter，而是 **OscarUI**：
让 AI 理解 UI（写 IR），让编译器保证确定性（写代码）。
