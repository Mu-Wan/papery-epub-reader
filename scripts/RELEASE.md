# Papery Gitee 发布

代码与标签通过已有的 `gitee` SSH 远程同步。发行版与附件通过 Gitee OpenAPI v5 上传。

在 Gitee 私人令牌页面创建仅具有 `projects` 权限的令牌，然后运行：

```powershell
powershell -NoProfile -File "D:\code_q\Papery-reader-source-v18\scripts\set-gitee-token.ps1"
```

令牌使用 Windows DPAPI 加密保存在当前账户的 `%LOCALAPPDATA%/Papery/release/gitee-token.dpapi`，不写入仓库。自动化环境也可提供 `GITEE_TOKEN` 环境变量。不要将令牌作为命令参数、写入发行版或提交到 Git。

在项目根目录检查 API 连接：

```powershell
node scripts/publish-gitee.mjs --check
```

完成安装包核验并推送主分支及对应标签后发布：

```powershell
node scripts/publish-gitee.mjs 0.1.53
```

发布脚本读取 `output/release-0.1.53/` 中的 Windows EXE、Android APK、`SHA256SUMS.txt` 和 `更新汇总.md`。它核验本地清单、确认远程标签已存在、创建发行版、上传附件，并通过公开下载重新检查文件大小和 SHA-256。重试时，已有同名附件通过校验后直接复用；校验不符时停止，不覆盖或删除现有附件。

接口参考：[Gitee OpenAPI v5](https://gitee.com/api/v5/swagger)。
