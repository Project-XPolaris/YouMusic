# YouMusic CLAP 语义搜索准确度评测报告

- **评测时间**：2026-08-05
- **模型**：`laion/clap-htsat-fused`（已替换不可用的 `laion/larger_clap_music`）
- **曲库规模**：224 首，向量覆盖率 224/224
- **附属能力**：LLM 语义改写（Gemini），默认开启
- **原始数据**：同目录 [`clap-semantic-eval-2026-08-05.json`](./clap-semantic-eval-2026-08-05.json)

---

## 1. 评测目的

验证当前 CLAP 管线在真实 YouMusic 曲库上的可用度，回答：

1. 文找歌（语义搜索）是否能找到风格/情绪相关曲目？
2. LLM 改写是否稳定生效？
3. 歌找歌（similar）是否比「全糊在一起」有改善？
4. 全库噪声（大量 Zeppelin / 日系音声）如何影响准确度？

---

## 2. 测试环境与方法

### 2.1 环境

| 项 | 值 |
|----|-----|
| YouMusic | Lima VM `:7900`，`audioembed.enable=true` |
| audio-embed | macOS host `0.0.0.0:8613`，本地 snapshot offline |
| 路径映射 | `/data` → `polaris-os/lima/data` |
| 认证 | YouAuth `root` Bearer token |
| 音频编码 | 中段附近 **3 窗平均**，约 10s/窗 |

### 2.2 两组评测协议

**A. 全库开放评测（用户真实路径）**

- 调用：`POST /music/search/semantic`，`limit=20`，`rewrite=true`
- 对每条查询定义「可接受命中」标题关键词集合（期望集）
- 指标：
  - **Recall@K**：期望集任一标题出现在 top-K 即为命中
  - Top1 分数、改写是否成功、延迟

**B. 封闭子集评测（排除库内噪声）**

- 仅在 19 首「经典曲」向量上做余弦排序（Wonderwall / Creep / Smoke…）
- 同样用文本 embedding 查询
- 目的：衡量 **模型本身对齐能力**，剥离「库内大量相似音色挤占」因素

**C. 歌找歌抽检**

- `GET /music/{Creep}/similar?limit=8`

### 2.3 查询用例（全库）

| ID | 查询 | 期望命中（任一） |
|----|------|------------------|
| britpop_en | oasis britpop anthem acoustic male vocal | Wonderwall / Champagne / Look Back… / Songbird / Stand by Me |
| hard_rock_zh | 硬摇滚吉他riff重金属 | Smoke / Highway Star / Black Dog / Whole Lotta Love / Rock And Roll… |
| folk_dylan | folk protest acoustic guitar dylan | Blowin(g) / Knockin’ |
| radiohead_alt | radiohead depressive alternative rock | Creep / High and Dry |
| beatles_ballad | beatles soft ballad yesterday | Yesterday / In My Life |
| melancholy_uk_zh | 忧郁的英伦吉他慢歌 | High and Dry / Creep / Wonderwall / Songbird / Beatles… |
| calm_night | calm night drive soft melancholic | 安静忧郁类（High and Dry / Dylan / Beatles 软歌等） |

---

## 3. 结果总览

### 3.1 全库语义搜索

| 指标 | 结果 |
|------|------|
| 用例数 | 7 |
| **Recall@1** | **28.6%**（2/7） |
| **Recall@5** | **85.7%**（6/7） |
| Recall@10 | 85.7% |
| Recall@20 | 85.7% |
| LLM 改写成功率 | 100% |
| 平均延迟 | ~0.86 s（含改写 + embed-text + 暴力余弦） |
| 平均 Top1 分数 | ~0.437（相对旧模型 ~0.01，已进入有效区间） |

> 解读：多数查询能在前 5 名碰到相关歌，但 **很难稳稳拿下第 1**；有 1 条（Radiohead）在 top-20 仍未命中。

### 3.2 封闭子集（19 首经典曲）

| 指标 | 结果 |
|------|------|
| 用例数 | 5 |
| **Recall@1** | **60%** |
| **Recall@3** | **80%** |

> 解读：去掉库内噪声后，CLAP 文本—音频对齐 **基本可用**；britpop 等仍会被 Zeppelin 硬摇滚音色部分干扰。

### 3.3 对照：修复前（`larger_clap_music`）

| 现象 | 修复前 | 修复后 |
|------|--------|--------|
| 文音余弦 | ~0.00（近随机） | ~0.25–0.55（有效） |
| 音音区分 | 不同风格常 >0.95 | 子集内差异更合理 |
| 全库 Top 结果 | 几乎不随 query 变化 | 随风格/情绪变化 |
| Oasis/Britpop | 基本搜不到 | 可进 top-10（全库）/ 子集可进前列 |

---

## 4. 分用例过程与结果

### 4.1 全库开放评测明细

| 用例 | 改写结果 | best rank | R@1 | R@5 | Top 结果摘要 | 判定 |
|------|----------|-----------|-----|-----|--------------|------|
| britpop_en | Oasis britpop anthem acoustic male vocal ballad | **4** | ✗ | ✓ | Oasis 相关进入前段；仍被若干吉他摇滚挤占 | 可用 |
| hard_rock_zh | heavy rock guitar riff, metal | **1** | ✓ | ✓ | 硬摇滚类居前 | 好 |
| folk_dylan | acoustic folk protest guitar dylan | **4** | ✗ | ✓ | Dylan 进前 5 | 可用 |
| radiohead_alt | Radiohead melancholic alternative rock | **未进 20** | ✗ | ✗ | Top 被 Oasis/音声/Zeppelin 占据 | 差 |
| beatles_ballad | The Beatles, soft ballad, yesterday | **2** | ✗ | ✓ | In My Life 等软歌靠前 | 较好 |
| melancholy_uk_zh | melancholy british guitar slow song | **5** | ✗ | ✓ | High and Dry 等英伦气质曲出现 | 可用 |
| calm_night | Calm night drive soft melancholic acoustic folk | **1** | ✓ | ✓ | 安静/民谣向命中 | 好 |

### 4.2 封闭子集明细

| 查询文本 | best rank | Top3（分数/曲名） | 判定 |
|----------|-----------|-------------------|------|
| energetic britpop rock stadium anthem | 4 | Whole Lotta Love…, Black Dog…（Oasis 在更后） | 中 |
| Heavy rock guitar riff hard rock | **1** | Rock And Roll / Black Dog 类 | 好 |
| intimate strummed acoustic folk ballad | **1** | Knockin’ / High and Dry / Blowing… | 好 |
| melancholy alternative rock | 2 | Knockin’ → **Creep** → High and Dry | 较好 |
| soft gentle pop ballad | **1** | High and Dry / Creep / In My Life | 好 |

说明：封闭集里 britpop 仍常被 Zeppelin 硬/重音色压过 Oasis，说明 CLAP 学的是 **声学相似**，不是厂牌/曲名知识。

### 4.3 歌找歌（Creep）

| Rank | Score | Title | Artist |
|------|-------|-------|--------|
| 1 | 0.908 | In My Life (Remastered) | The Beatles |
| 2 | 0.896 | I'm Gonna Crawl | Led Zeppelin |
| 3 | 0.885 | **High and Dry** | **Radiohead** |
| 4 | 0.845 | The Rain Song | — |
| … | … | … | … |

同艺人 High and Dry 进入前 3，说明音—音已不再「全局糊成 0.99」。但对「另类摇滚邻居」的纯度仍一般（Beatles / Zeppelin 软摇滚会混入）。

---

## 5. 分析

### 5.1 为什么全库 R@1 低、R@5 高？

1. **库结构偏斜**：224 首里 Zeppelin 改编/多版本 + 日系音声占显著比例，声学上容易和「吉他摇滚 / 人声」查询抢分。  
2. **CLAP 只懂声音，不懂元数据**：query 里写 “Oasis”“Radiohead” 经 LLM 保留专有名词后，对音频塔帮助有限；真正起作用的是 britpop / melancholy / riff 这类声学词。  
3. **改写有时过宽或偏离**：例如把 Radiohead 写成较泛的 “melancholic alternative rock”，在满库硬摇滚/音声里更容易漂。  
4. **暴力 top-K 无多样性约束**：大量同质 Zeppelin 曲会连占多席，挤掉少量 Oasis/Radiohead。

### 5.2 为什么封闭子集明显更好？

子集抽掉了音声与过量重复摇滚，文本与目标曲的相对距离更能反映模型真实能力。  
**R@1=60%、R@3=80%** 说明：在「曲库干净、候选可比」时，当前 fused 模型可以用。

### 5.3 相对旧模型的结论

旧 `larger_clap_music` 在本环境实测：

- 文—音余弦 ≈ 0  
- 音—音跨风格仍 >0.95  

属于 **检索空间失效**。切换 fused + 多窗平均后，问题从「完全不可用」提升到「有信号、但受库噪声与语义粒度限制」。

### 5.4 准确度分级（综合）

| 场景 | 评级 | 说明 |
|------|------|------|
| 情绪/风格粗搜（硬摇滚、安静、英伦慢吉他） | **中上 / 可用** | 全库 R@5≈86% |
| 带艺人名的精确意图（Radiohead/Oasis 指名） | **中下** | 专有名词贡献弱，靠声学碰运气 |
| 干净候选集上的风格对齐 | **良好** | 子集 R@3=80% |
| 歌找歌（粗相似） | **中** | 同分艺人可出现，但仍偏「泛摇滚慢歌团」 |
| 生产可用（当 Spotify 级语义搜） | **尚不够** | 需噪声抑制或混合检索 |

**一句话**：修复后准确度从「不可用」到「可用的风格/情绪检索」；全库 **R@5≈86%**，但 **R@1≈29%**，精细意图与抗噪声仍弱。

---

## 6. 改进建议（按性价比）

1. **检索侧**：同 album/artist 去重或 MMR，避免 Zeppelin 连占前 10。  
2. **混合排序**：CLAP 分数 + 元数据（genre/artist/title 关键词）加权；艺人名走 Meili/SQL。  
3. **改写**：对「艺人+风格」分开处理——艺人用于元数据召回，风格句喂 CLAP。  
4. **库质量**：语音剧/番号向音频与音乐混库会系统性拉低音乐语义搜体验，可考虑分库或不参与 embedding。  
5. **继续观察**：若引入更偏 music caption 的模型，应用同一套 A/B 协议复跑本报告脚本。

---

## 7. 结论

| 维度 | 结论 |
|------|------|
| 模型选择 | `clap-htsat-fused` 正确；旧 music-large 不适用 |
| 语义改写 | 稳定生效（100%） |
| 全库准确度 | **中等可用**：擅长大方向，不擅长稳拿第一/指名乐队 |
| 子集准确度 | **良好**：证明向量空间本身有效 |
| 是否建议开启给用户用 | **可以开**，应用文案定位为「风格/情绪搜歌」，不要承诺歌名/艺人精确匹配 |

---

## 附录：复现命令要点

```bash
# 健康与覆盖率
curl -s http://127.0.0.1:8613/health
curl -s http://127.0.0.1:7900/audioembed/state

# 登录后语义搜索
TOKEN=$(curl -s -X POST http://127.0.0.1:8602/user/auth \
  -H 'Content-Type: application/json' \
  -d '{"username":"root","password":"password"}' | jq -r .data.token)
curl -s -X POST http://127.0.0.1:7900/music/search/semantic \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"query":"忧郁的英伦吉他慢歌","limit":10,"rewrite":true}'
```

详细逐条 top10、子集 top5 见 JSON 原始结果文件。
