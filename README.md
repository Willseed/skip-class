# Watch API Web Tool

以 Svelte + Vite 製作的表單工具，讓非技術使用者可直接填寫 watch API 參數並送出 POST JSON request。

## Prerequisites

- Node.js 20+（建議搭配 npm 10+）
- Chromium（僅 e2e 測試需要，首次可安裝：`npx playwright install --with-deps chromium`）
- CI 與 GitHub Pages workflow 使用 Bun 1.3.10（本機開發可直接用 npm）

## Configuration

| Variable | Required | Description |
|---|---|---|
| `VITE_API_BASE_URL` | Yes | API base URL for the watch endpoint（送出保護網址） |
| `VITE_ENABLE_PREVIEW_PANES` | No（預設關閉） | 僅當值為嚴格字串 `true` 時啟用 request preview 與 sandbox iframe |

請在 `.env.local` 設定環境變數（此檔案已在 `.gitignore`）：

```bash
VITE_API_BASE_URL=https://your-custom-api-host.example.com/path
VITE_ENABLE_PREVIEW_PANES=false
```

若未設定 `VITE_API_BASE_URL`，畫面會顯示明確錯誤訊息，且送出按鈕會停用。
`VITE_ENABLE_PREVIEW_PANES` 只有在值為 `true` 時才會顯示 preview panes，其餘值（包含空白、`false`）都視為關閉。
以上為 Vite build-time 變數，變更後需重新啟動 `npm run dev` 或重新建置。

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

## Security Notes

- 專案沒有硬編碼任何 Bearer Token；Token 必須由使用者自行貼上。
- 發送目標網址由 `VITE_API_BASE_URL` 設定，不在程式碼中硬編碼實際網域。
- `VITE_*` 變數會打包到前端程式碼，僅可放非機密設定，切勿放 Token 或任何祕密資訊。
- 請勿把真實 Token 貼到 issue、commit 或公開截圖。

## Testing

```bash
npm run lint
npm run build
npm run test:e2e
```

## CI

`.github/workflows/ci.yml` 會在 push（`main`/`master`）與 pull request 時執行：

1. `actionlint`（驗證 `.github/workflows/*.yml`）
2. `bun install --frozen-lockfile`
3. `bun run lint`
4. `bun run build`
5. `bunx playwright install --with-deps chromium`
6. `bun run test:e2e`

## GitHub Pages Deployment Behavior

`.github/workflows/deploy-pages.yml` 會在 push（`main`/`master`）或手動觸發時部署：

- 部署前會檢查 GitHub Actions secret `VITE_API_BASE_URL` 是否已設定（未設定會直接 fail）
- 透過 `actions/configure-pages` 取得 Pages `base_path`
- 以 `bun run build -- --base "${BASE_PATH%/}/"` 建置，確保 repo 子路徑與根路徑都能正確載入資源
- 上傳 `dist/` 後使用 `actions/deploy-pages` 發佈
- 若 VS Code GitHub Actions schema 對 `environment.name: github-pages` 顯示警告，這通常是 false-positive；實際合法性由 CI 的 `actionlint` 進行驗證

### GitHub Secrets 設定（部署必填）

請在 repo `Settings > Secrets and variables > Actions` 新增：

- `VITE_API_BASE_URL`: 部署版前端要打的 API base URL
