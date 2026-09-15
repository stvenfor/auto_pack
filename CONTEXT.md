# Auto Pack

本地打包与分发流水线：为 Flutter 应用产出可安装包，并可选上传蒲公英；可用 Console（Electron 桌面壳）或 CLI 操作。

## Language

**App Root**:
被打包的 Flutter 工程根目录。必须通过环境变量或 `auto_pack/.env` 的 `APP_ROOT` 配置（无仓库内默认路径）。
_Avoid_: 工程路径、源码目录、workspace（除非特指 Cursor 工作区）

**Artifact**:
一次平台构建产出的安装包副本，落在 `auto_pack/artifacts/`，命名为 `{platform}-{mode}.{ext}`（如 `android-debug.apk`、`ios-release.ipa`、`harmony-debug.hap`、`harmony-release.app`）。旧名 `app-debug.apk` 不再作为规范路径。上传蒲公英成功后会删除对应安装包；`last-upload.json` / 二维码页保留。
_Avoid_: 测试包、体验包（除非特指蒲公英分发物）

**Platform**:
打包目标端：`android` / `ios` / `harmony`（App Root 目录分别为 `android/`、`ios/`、`ohos/`）。Console 可多选；一次复合 Run 可包含多个 Platform。
_Avoid_: 宿主 OS、Electron 平台

**Mode**:
构建模式：`debug` / `release`；Harmony 额外支持 `profile`。每个已选 Platform 各自有 Mode。Harmony：`debug`/`profile` → `.hap`（可上传蒲公英）；`release` → `.app`（应用市场包，蒲公英不支持）。iOS debug / release 均默认以 **Ad Hoc** 导出 IPA（可用 `IOS_EXPORT_METHOD` 或 `IOS_EXPORT_OPTIONS_PLIST` 覆盖；development 仅显式指定时使用）。
_Avoid_: 把 Harmony profile 当成 Flutter 通用 `--profile` 编译模式；Android/iOS 不提供 profile 选项；把 Harmony release `.app` 当成可上传蒲公英的包

**Target**:
一个 Platform × Mode 组合（如 `android/debug`）。勾选的平台行构成本次 Run 的 Target 列表。
_Avoid_: 把 Target 说成「任务」或与 Run 混用

**Branch**:
App Root 的本地 git 分支。Console 选择后立刻 `git checkout`；工作区不干净则拒绝；构建 Run 进行中禁止切换；不自动 `fetch`。
_Avoid_: 远程跟踪分支（除非已有本地同名分支）

**Install Note**:
Console「安装说明」输入框内容，对应蒲公英「更新说明」（`buildUpdateDescription`）。非必填；有内容时写入上传，并在二维码弹窗中展示；留空则弹窗不占位，上传仍可用默认文案。
_Avoid_: 更新日志、changelog（口语可以，正式用语用 Install Note）

**Merged Install Page**:
蒲公英后台「应用合并」得到的统一安装页（一个链接/二维码，按设备类型展示对应平台包）。URL 仅配在 `.env` 的 `PGYER_MERGED_INSTALL_URL`。配置存在且本次有成功上传时，优先弹该页；否则弹同窗多卡（每平台一张码）。
_Avoid_: 短链接、合并码（口语可以，正式用语 Merged Install Page）

**Auto Pack**:
独立于 App Root 的打包流水线项目（目录名 `auto_pack`，由原 Electro 就地改名而来）；以 Fastlane 驱动构建，并可上传蒲公英。Fastlane 文件住在 Auto Pack 内，构建时切入 App Root。Flutter SDK 优先跟随 App Root 的 FVM / `.fvmrc`。单 Target 仍可用 `PACK_PLATFORM` / `PACK_MODE`；Console 多选时由壳顺序驱动多个 Target。蒲公英凭据用 `PGYER_API_KEY`（`auto_pack/.env`）。可选用 Console 操作，不替代 Fastlane 引擎。
_Avoid_: Electro、electro（历史名）、CI 仓库、pipeline 根目录（`pipeline/` 是容器目录）、Electron（壳框架名，不是产品名）

**Console**:
Auto Pack 的桌面壳界面：展示 Readiness 与 Run 状态；平台为可勾选行（每行自带 Mode）；填写可选 Install Note；触发构建 / 上传 / 构建并上传。
_Avoid_: Dashboard、GUI 工具、Electron 应用（除非特指技术实现）

**Readiness**:
按当前勾选的 Target 评估：App Root、对应 Platform 目录、FVM Flutter、artifacts、Fastlane → canBuild；上传另需蒲公英 Key，且该 Target 须支持蒲公英（Harmony release 除外）。多选时：只要有一个可构建即可点构建；构建并上传时不可上传的 Target（如 Harmony release）只构建、跳过上传并提示。
_Avoid_: Health check、环境检测（口语可以，正式用语用 Readiness）

**Run**:
Console 里一次操作：可含多个 Target。多 Target 的构建/构建并上传：先共享 `prep_deps`（一次 `flutter pub get`），再 **Android+iOS 并行构建**、**Harmony 单独串行**（`PACK_SKIP_PUB_GET`；避免 ohpm/hvigor 与其它端抢 App Root）；某端构建失败**不取消**其它端，上传只对构建成功的 Target。再并行上传蒲公英（每端写 `last-upload-{platform}-{mode}.json`，结束后 Node 汇总 `last-upload.json`；部分失败仍保留成功端）。多 Target 仅上传同样并行。单 Target 仍走原串行 lane。同一日志流（带平台前缀；共享准备为 `[shared]`），一个取消打断整批。同一时刻最多一个会改 App Root 的构建类 Run；上传类可与构建并行。上传成功后：有 Merged Install Page 则优先打开；否则同窗多卡展示各平台二维码，并显示本次 Install Note（若有）。
_Avoid_: Job、Task、Build（Build 仅指构建动作本身，不是一次 Console 调用）
