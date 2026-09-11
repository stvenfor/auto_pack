# Fastlane lives in Electro, not App Root

App Root（由 `APP_ROOT` / `.env` 配置）保持无 Fastlane；流水线与业务工程解耦，便于换 App Root 或覆盖路径。代价是 lane 必须显式切入 App Root 再调用 Flutter/Gradle，路径与工作目录约定比「放在 android/fastlane」更绕。
