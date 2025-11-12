# about-nine² POS & Inventory Platform

Modular POS + 庫存管理系統，採用 Next.js 14 (App Router + Tailwind)、FastAPI、SQLite 並搭配 Docker Compose。第一階段聚焦讓站台可運作並完成「廠商管理」完整 CRUD，再預留商品、會員與 POS 模組的擴充點。

## 目錄結構

```
.
├── backend
│   ├── app
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── routers
│   │   │   ├── members.py
│   │   │   ├── pos.py
│   │   │   ├── products.py
│   │   │   └── vendors.py
│   │   └── schemas.py
│   └── requirements.txt
├── frontend
│   ├── app
│   │   ├── (routes)
│   │   │   ├── members
│   │   │   ├── pos
│   │   │   ├── products
│   │   │   └── vendors
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components
│   │   └── Header.tsx
│   ├── lib
│   │   └── api.ts
│   ├── Dockerfile
│   ├── package.json
│   └── tailwind.config.ts
├── data/ (SQLite 永續化)
├── docker-compose.yml
├── .env.example
└── README.md
```

## 環境變數

1. 複製 `.env.example` 成 `.env`。
2. 依需求調整以下欄位：

| 變數 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | 前端呼叫 FastAPI 的公開 URL (預設 `http://localhost:8000`) |
| `APP_NAME` | FastAPI 顯示的名稱 |
| `API_PREFIX` | API 路徑前綴 (預設 `/api`) |
| `DATABASE_URL` | 覆寫 SQLite 位置 (預設自動落在 `./data/app.db`) |
| `CORS_ORIGINS` | 以逗號分隔的允許來源，預設同時允許 `http://localhost:3000` 與 `http://127.0.0.1:3000` |
| `CORS_ORIGIN_REGEX` | 允許以正規表達式描述的來源 (預設為 `http(s)://localhost:PORT` 及 `127.0.0.1`) |

## 本機開發流程

### 1. 使用啟動腳本（推薦）

後端：

```bash
./scripts/dev-backend.sh
```

> 預設腳本會啟用名為 `about-nine-pos` 的 Conda 環境。若你的環境名稱不同，先 `export CONDA_ENV_NAME=你的環境名` 再執行腳本。若未安裝 Conda，腳本會自動建立/使用 `.venv` 作為備援。

前端：

```bash
./scripts/dev-frontend.sh              # 預設 127.0.0.1:3000
# 或自訂： DEV_HOST=0.0.0.0 DEV_PORT=3100 ./scripts/dev-frontend.sh
```

兩支腳本會自動安裝相依性（`pip install` / `npm install`），然後以 `uvicorn --reload` 與 `next dev` 模式啟動，方便在 Terminal 直接開發與除錯。

### 2. 手動啟動（備用）

後端：

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

前端：

```bash
cd frontend
npm install
npm run dev -- --port 3000
```

SQLite 會自動在 `data/app.db` 建立並持久化，API 文件可於 `http://localhost:8000/docs` 取得；瀏覽 `http://localhost:3000` 即可看到 about-nine² 介面、導覽列、大地色系主題、商品/廠商頁面。

## Docker Compose 一鍵啟動

```bash
# 需先建立 .env
docker compose up --build
```

- FastAPI：`http://localhost:8000`
- Next.js：`http://localhost:3000`
- SQLite：掛載於 `./data/app.db`

## API 概覽

| 路徑 | 說明 |
| --- | --- |
| `GET /api/vendors` | 廠商分頁列表 (含商品數) |
| `POST /api/vendors` | 新增廠商 |
| `PUT /api/vendors/{id}` | 更新廠商 |
| `DELETE /api/vendors/{id}` | 刪除廠商 |
| `GET /api/products` | 商品列表，回傳條碼、毛利、第一次入庫/更新時間並支援 `q`、`vendor_id`、`first_stocked_from`、`first_stocked_to` 篩選 |
| `POST /api/products` | 新增商品並依「廠商ID+貨號+成本+顏色+尺寸」生成條碼 |
| `POST /api/products/import` | 透過 Excel 匯入/入庫，偵測條碼自動決定新品或補貨 |
| `GET /api/stock-entries` | 商品入庫紀錄（單筆/批次來源、數量、時間），支援 `q`、`method`、`created_from`、`created_to` 篩選 |
| `GET /api/members` | 會員 CRUD (預留 UI) |
| `POST /api/pos/checkout` | POS 結帳，扣庫存、產生訂單與明細 |

所有列表端點支援 `?page=&size=` 分頁查詢（`size` 預設 20、上限 500）。

## SQLite Schema 摘要

對應 `app/models.py`：

- `vendors`：名稱、聯絡人、聯繫資訊、關聯多個 `products`。
- `products`：SKU、條碼、顏色、尺寸、成本/售價、庫存、敘述、圖片 URL、`vendor_id`，並追蹤第一次入庫時間與後續資料更新時間。
- `stock_entries`：記錄每次入庫的商品、SKU、條碼、廠商、數量與來源（單筆建立或批次匯入）。
- `members`：姓名、電話、Email、點數。
- `orders` & `order_items`：POS 結帳紀錄與明細，並於結帳時自動更新 `products.stock`。

## 前端模組重點

- `app/layout.tsx`：全域 Inter 字體、響應式 Header，顯示店舖名稱 **about-nine²**。
- `/vendors`：Phase 1 核心，含分頁列表、即時新增與刪除的 CRUD 表單。
- `/products`：展示商品列表、第一次入庫時間與搜尋/篩選（關鍵字、廠商、入庫日期區間），並提供單筆建立/Excel 匯入（欄位：廠商、廠商貨號、品名、顏色、尺寸、進貨數量、成本、售價），系統會依條碼自動判斷新品或入庫。
- `/barcodes`：條碼列印中心，可搜尋/勾選商品，預覽條碼卡片並批次下載 PNG（包含條碼圖示、碼值與新台幣售價）。
- `/stock`：商品入庫紀錄，顯示每筆入庫的來源（單筆或批次）、數量與時間，批次匯入會以可展開的群組呈現，並支援關鍵字、來源與日期篩選。
- `/members`、`/pos`：提供佈局與 Roadmap 說明，待後續串接 API。

## 後續開發建議 Roadmap

1. **完成廠商模組測試**：補上 e2e / API 測試與輸入驗證，確保資料可靠。
2. **拓展商品庫存功能**：加入出貨/進貨紀錄、庫存異動 log、低庫存通知欄位。
3. **會員/ POS 串接**：替 `/members`、`/pos` 頁面導入 API，並新增報表 (daily/weekly/monthly)。
4. **權限與審計**：導入認證與操作日誌，確保多店員操作安全。

歡迎依此模組化規劃逐步擴充，確保每個子系統穩定後再推進下一階段。
