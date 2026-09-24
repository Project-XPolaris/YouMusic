# youmusic（已废弃 / DEPRECATED）

> **本仓库已废弃，不再维护、不再部署。** 仅保留作为历史代码参考。

## 为什么废弃

`backend/YouMusic` 是 YouMusic 的 **旧版 NestJS / Node 实现**，已被 Go 版 **`backend/YouMusic-Server`** 完全取代。

NAS 生产环境现在运行的是 Go 版：

- systemd 单元：`polaris-os/systemd/polaris-youmusic.service`
  `ExecStart=/opt/polaris/bin/youmusic run`
- 配置：`/etc/polaris/youmusic.yml`（对应 `backend/YouMusic-Server`，含 `llm` / `meilisearch` / `audioembed` 等 Go 服务特性）
- 端口：`7900`（对外走 Gateway）

## 结论

- ❌ 不要再用本仓库部署或继续开发。
- ✅ 所有新功能和修复都进 `backend/YouMusic-Server`（Go）。
- 📎 本目录保留仅为追溯旧逻辑 / 迁移参考。

## 相关仓库

| Repo | Role |
|------|------|
| `youmusic-server`（`backend/YouMusic-Server`） | **现行** Go 音乐 API（替代本仓库） |
| `polaris-music` | Flutter 客户端 |
| `audio-embed-service` | 相似度音频 embedding |

## 历史快速启动（仅供参考）

```bash
pnpm install
pnpm start
```
