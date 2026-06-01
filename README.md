# STT

把 `upload/<meeting-id>/audio/*` 與 `upload/<meeting-id>/photos/*` 轉成會議摘要頁面的 pipeline 專案。

## 常用命令

```bash
npm run dev
npm run status -- <meeting-id>
npm run transcribe -- <meeting-id>
npm run import-youtube-subs -- <meeting-id> <youtube-url>
npm run optimize-photos -- <meeting-id>
npm run archive -- <meeting-id>
```

## YouTube 字幕匯入

如果影片本身已有字幕，可用本機安裝的 `yt-dlp` 直接把字幕轉成 `artifacts/<meeting-id>/transcript.json`，跳過 Groq 音訊轉錄。

```bash
npm run import-youtube-subs -- computex-keynote 'https://www.youtube.com/watch?v=DmoyA3HCPHc'
```

也可以省略 `meeting-id`，直接用 YouTube `videoId` 當 meeting id：

```bash
npm run import-youtube-subs -- 'https://www.youtube.com/watch?v=DmoyA3HCPHc'
```

可選參數：

```bash
npm run import-youtube-subs -- computex-keynote 'https://www.youtube.com/watch?v=DmoyA3HCPHc' --lang zh-TW,zh-Hant,zh,en
```

- 預設語言優先序：`zh-TW, zh-Hant, zh-Hans, zh, en`
- 只會抓影片現成字幕／自動字幕，不會自動回退成音訊下載或 Groq 轉錄
- 會把原始字幕快取到 `artifacts/<meeting-id>/captions/`

接著就能沿用既有流程：

```bash
npm run status -- <meeting-id>
```

若狀態顯示需要摘要，直接執行 summary 階段即可。
