# Watch API Web Tool

以 Svelte + Vite 製作的表單工具，讓非技術使用者可直接填寫 watch API 參數並送出 POST JSON request。

## Prerequisites

- Node.js 20+（建議搭配 npm 10+）
- Chromium（僅 e2e 測試需要，首次可安裝：`npx playwright install --with-deps chromium`）
- CI 與 GitHub Pages workflow 使用 Bun 1.3.10（本機開發可直接用 npm）

## Configuration

| Variable | Default | Description |
|---|---|---|
| `VITE_API_BASE_URL` | `https://redacted.invalid/learning-center` | API base URL for the watch endpoint |

建立 `.env.local` 覆蓋預設值（此檔案已在 `.gitignore`）：

```bash
VITE_API_BASE_URL=https://your-custom-api-host.example.com/path
```

## Install & Run

```bash
npm install
npm run dev
```

啟動後開啟終端機顯示的本機網址（預設通常是 `http://localhost:5173`）。

## 給非技術使用者的操作方式

1. 在 **API 路徑** 填入課程 ID（`class`）與活動 ID（`learning-activity`）。
2. 在 **授權** 貼上你自己的 Bearer Token（系統不會預填）。
3. 在 **Payload** 填入 `last_view_time`、`played` 起訖、`learning_time`（皆為 0 以上整數）。
4. 按 **送出 watch request**，查看成功/錯誤訊息與伺服器回應。
5. 送出前可先看 **Request 預覽** 確認內容。

## Security Notes

- 專案沒有硬編碼任何 Bearer Token；Token 必須由使用者自行貼上。
- Token 欄位為密碼輸入，預覽區僅顯示遮罩後的 Token 片段。
- Request 預覽在 `sandbox=""` iframe 內顯示，且內容先做 HTML escaping，以降低 XSS 風險。
- 請勿把真實 Token 貼到 issue、commit 或公開截圖。

## Testing

```bash
npm run lint
npm run build
npm run test:e2e
```

## CI

`.github/workflows/ci.yml` 會在 push（`main`/`master`）與 pull request 時執行：

1. `bun install --frozen-lockfile`
2. `bun run lint`
3. `bun run build`
4. `bunx playwright install --with-deps chromium`
5. `bun run test:e2e`

## GitHub Pages Deployment Behavior

`.github/workflows/deploy-pages.yml` 會在 push（`main`/`master`）或手動觸發時部署：

- 透過 `actions/configure-pages` 取得 Pages `base_path`
- 以 `bun run build -- --base "${BASE_PATH%/}/"` 建置，確保 repo 子路徑與根路徑都能正確載入資源
- 上傳 `dist/` 後使用 `actions/deploy-pages` 發佈
