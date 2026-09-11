# Auto Pack

本地 Flutter 打包与蒲公英分发。**Fastlane** 是引擎；**Console**（Electron）与 **CLI**（`bin/*`）是同等入口。

支持 **本地分支切换**、平台 **多选**（android / ios / harmony，每平台各自 mode）、可选 **安装说明**（蒲公英更新说明，并展示在二维码页）。Harmony **release** 产出 `.app`，蒲公英只收 `.hap`，故该 Target 仅本地构建。上传成功后：若 `.env` 配置了 `PGYER_MERGED_INSTALL_URL` 则打开合并安装页，否则同窗多卡展示各平台二维码。

## Console

```sh
npm install
npm start
```

## CLI

```sh
bin/build --platform android --mode debug
bin/build --platform ios --mode release
bin/build --platform harmony --mode debug
bin/build --platform harmony --mode release   # → harmony-release.app
bin/build --platform harmony --mode profile

bin/upload --platform android --mode debug
bin/upload --platform harmony --mode debug    # .hap only
bin/distribute --platform ios --mode release
bin/distribute --platform harmony --mode profile

bin/debug                  # 兼容别名 → android/debug build
```

环境变量等价：`PACK_PLATFORM`、`PACK_MODE`（CLI 仍为单 Target；多选是 Console 能力）。

产物落在 `artifacts/`，例如 `android-debug.apk`、`ios-release.ipa`、`harmony-debug.hap`、`harmony-release.app`、`harmony-profile.hap`（旧名 `app-debug.apk` 已废弃）。

iOS：**debug / release 均默认 Ad Hoc**（`--export-method ad-hoc`）。可用 `.env` 覆盖：

```env
IOS_EXPORT_METHOD=ad-hoc          # 或 app-store / development / enterprise
# IOS_EXPORT_OPTIONS_PLIST=/path/to/ExportOptions.plist
```

上传成功后会写入 `artifacts/last-upload.json`，删除本次上传的安装包，并自动打开标注了**平台**（Android / iOS / Harmony）与**模式**（debug / release / profile 等）的二维码页。CLI 也可手动执行 `bin/open-qr`。

## 配置

复制 `.env.example` → `.env`。`APP_ROOT` 也可在 Console 里选择并写回；`PGYER_API_KEY` 仅手改 `.env`。

## 测试

```sh
npm test
```

领域语言见 `CONTEXT.md`；决策见 `docs/adr/`。
