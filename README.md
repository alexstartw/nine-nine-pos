# about-nine² POS & Inventory Platform

Modular POS + 庫存管理系統，採用 Next.js 14 (App Router + Tailwind)、FastAPI、SQLite 並搭配 Docker 單一映像部署。

## 目錄結構

```
.
├── backend
│   ├── app
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── repositories/         # DB 查詢層（analytics）
│   │   ├── routers/              # HTTP 路由（薄包裝）
│   │   │   ├── analytics.py
│   │   │   ├── members.py
│   │   │   ├── orders.py
│   │   │   ├── pos.py
│   │   │   ├── products.py
│   │   │   ├── reservations.py
│   │   │   ├── stock_entries.py
│   │   │   └── vendors.py
│   │   ├── services/             # 業務邏輯層
│   │   │   ├── analytics_service.py
│   │   │   ├── member_service.py
│   │   │   ├── order_service.py
│   │   │   ├── pos_service.py
│   │   │   ├── product_service.py
│   │   │   ├── reservation_service.py
│   │   │   ├── stock_entry_service.py
│   │   │   └── vendor_service.py
│   │   └── utils/
│   │       ├── pos_logic.py
│   │       └── time_utils.py
│   ├── tests/
│   └── requirements.txt
├── frontend
│   ├── app
│   │   ├── (routes)
│   │   │   ├── analytics/sales
│   │   │   ├── barcodes
│   │   │   ├── members
│   │   │   ├── orders
│   │   │   ├── pos
│   │   │   ├── products
│   │   │   ├── reservations
│   │   │   ├── stock
│   │   │   └── vendors
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── DatePickerField.tsx
│   │   ├── Header.tsx
│   │   └── PaginationControls.tsx
│   ├── lib/
│   │   └── api.ts
│   └── package.json
├── docker/
│   ├── nginx.conf
│   └── start.sh
├── scripts/
│   ├── dev.sh                    # 同時啟動前後端（推薦）
│   ├── dev-backend.sh
│   ├── dev-frontend.sh
│   └── reset_database.py
├── data/                         # SQLite 永續化
├── Makefile                      # 客戶端部署介面
├── Dockerfile
├── docker-compose.yml
├── .env.example
└── README.md
```

## 環境變數

複製 `.env.example` 成 `.env` 並依需求調整：

| 變數 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_API_BASE_URL` | 前端呼叫 FastAPI 的公開 URL。**只有在填寫完整 `http(s)://` 開頭的絕對路徑時才會生效**；本機開發預設 `http://localhost:8000`，Docker 部署若走同網域可留空並使用 `/api` relative 路徑。 |
| `APP_NAME` | FastAPI 顯示的名稱 |
| `API_PREFIX` | API 路徑前綴（預設 `/api`） |
| `DATABASE_URL` | 覆寫 SQLite 位置（預設自動落在 `./data/app.db`） |
| `CORS_ORIGINS` | 以逗號分隔的允許來源 |
| `CORS_ORIGIN_REGEX` | 允許以正規表達式描述的來源 |
| `APP_PORT` | Docker 對外 port（預設 `8080`） |

## 本機開發流程

### 一鍵啟動（推薦）

```bash
./scripts/dev.sh
```

同時啟動前後端，Ctrl+C 一次停止兩個服務。

| 服務 | URL |
| --- | --- |
| 前端 | http://127.0.0.1:3100 |
| 後端 API | http://localhost:8000 |
| Swagger 文件 | http://localhost:8000/docs |

### 分開啟動

```bash
./scripts/dev-backend.sh   # 後端（uvicorn --reload）
./scripts/dev-frontend.sh  # 前端（next dev，預設 127.0.0.1:3100）
```

> 後端腳本預設啟用名為 `about-nine` 的 Conda 環境。若環境名稱不同，先 `export CONDA_ENV_NAME=你的環境名`。未安裝 Conda 時自動建立 `.venv`。
>
> 可用 `DEV_HOST` / `DEV_PORT` 覆寫前端監聽位置，例如：`DEV_HOST=0.0.0.0 DEV_PORT=3000 ./scripts/dev-frontend.sh`

### 手動啟動（備用）

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
pnpm install
pnpm dev --port 3100
```

### 清除資料但保留 Schema

```bash
python scripts/reset_database.py        # 會詢問確認
python scripts/reset_database.py --yes  # 直接清空
```

## Docker 部署

### 架構

單一 Docker image，Nginx 對外只開一個 port：

```
Client → Nginx :80
           ├─ /api/*  → FastAPI (Uvicorn :8000)
           └─ /*      → Next.js (Node :3000)
```

### 開發者：建置與打包

```bash
# 建置 image
docker build --no-cache -t nine-nine-pos .

# 導出成 tar 交付客戶
docker save nine-nine-pos -o nine-nine-pos.tar
```

交付給客戶的三個檔案：`nine-nine-pos.tar`、`Makefile`、`.env.example`

### 客戶端：首次部署

前置條件：已安裝 Docker Desktop。

```bash
# 1. 編輯設定（主要確認 APP_PORT）
cp .env.example .env

# 2. 一鍵啟動
make up
```

`make up` 會自動載入 image、建立 `data/` 目錄、啟動容器。完成後開啟 `http://localhost:8080`。

### 日常操作

```bash
make up       # 啟動 / 更新版本
make down     # 停止服務
make restart  # 重啟容器
make logs     # 查看即時 log
make shell    # 進入容器（除錯）
make help     # 顯示說明
```

### 更新版本

1. 以新的 `nine-nine-pos.tar` 覆蓋舊檔
2. 執行 `make up`

Makefile 自動停止舊容器、載入新 image、重新啟動。`data/app.db` 完整保留。

### 資料備份

```bash
cp data/app.db data/app.db.bak   # 備份
```

還原：停止服務 → 替換檔案 → `make up`。

## API 概覽

所有列表端點支援 `?page=&size=` 分頁查詢（`size` 預設 20、上限 500）。

### 廠商

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/api/vendors` | 分頁列表，支援 `q`（關鍵字）、`sort`、`sort_dir` |
| `POST` | `/api/vendors` | 新增廠商 |
| `GET` | `/api/vendors/{id}` | 取得單筆 |
| `PUT` | `/api/vendors/{id}` | 更新廠商 |
| `DELETE` | `/api/vendors/{id}` | 刪除廠商 |

### 商品

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/api/products` | 分頁列表，支援 `q`、`vendor_id`、`first_stocked_from`、`first_stocked_to` |
| `GET` | `/api/products/summary` | 庫存總數與庫存金額 |
| `POST` | `/api/products` | 新增商品（依廠商+貨號+成本+顏色+尺寸自動生成條碼） |
| `GET` | `/api/products/{id}` | 取得單筆 |
| `PUT` | `/api/products/{id}` | 更新商品 |
| `DELETE` | `/api/products/{id}` | 刪除商品 |
| `POST` | `/api/products/import` | Excel 批次匯入/補貨（自動判斷新品或入庫） |
| `POST` | `/api/products/import-legacy` | 舊格式 Excel 匯入（含條碼欄位） |

### 入庫紀錄

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/api/stock-entries` | 分頁列表，支援 `q`、`method`、`created_from`、`created_to` |

### 會員

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/api/members` | 分頁列表，支援 `q`、`sort`、`sort_dir` |
| `POST` | `/api/members` | 新增會員（會員 ID 自動產生） |
| `GET` | `/api/members/{id}` | 取得單筆 |
| `PUT` | `/api/members/{id}` | 更新會員 |
| `DELETE` | `/api/members/{id}` | 刪除會員 |

### POS

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/api/pos/products/{barcode}` | 條碼查詢商品 |
| `GET` | `/api/pos/members/by-phone` | 電話查詢會員與折扣資格 |
| `GET` | `/api/pos/members/search` | 電話後三碼搜尋會員 |
| `GET` | `/api/pos/summary/daily` | 當日（或指定日期）營收、折扣、成本、毛利與付款分布 |
| `POST` | `/api/pos/checkout` | 結帳（會員 95 折 / 生日月 88 折、自訂折扣、無條碼定價） |

### 訂單

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/api/orders` | 依日期分頁列表（預設今日），含商品明細與會員資訊 |
| `PUT` | `/api/orders/{id}` | 更新付款方式 / 備註 / 會員 / 商品明細（自動同步庫存與折扣） |
| `POST` | `/api/orders/{id}/cancel` | 取消訂單（自動回補庫存） |

### 預定 / 留貨

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/api/reservations` | 分頁列表，支援 `reservation_type`、`status`、`payment_status`、`q` |
| `GET` | `/api/reservations/member-suggestions` | 會員模糊搜尋（姓名 / 電話 / 會員代碼） |
| `POST` | `/api/reservations` | 建立預定或留貨（留貨自動扣減庫存） |
| `PUT` | `/api/reservations/{id}` | 更新；狀態改為「完成」時自動建立訂單 |

### 銷售分析

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/api/analytics/sales` | 區間彙總、付款分布與 Top SKU；支援 `start_date`、`end_date`、`group_by`（`day`\|`week`）、`top_limit` |

## SQLite Schema 摘要

對應 `backend/app/models.py`：

- `vendors`：名稱、聯絡人、聯繫資訊。
- `products`：SKU、條碼、顏色、尺寸、成本/售價、庫存、`vendor_id`，追蹤首次/最近入庫時間。
- `stock_entries`：每次入庫的商品、數量與來源（單筆 / 批次匯入）。
- `members`：自動產生的會員 ID、姓名、生日、入會日期、電話、備註。
- `orders` & `order_items`：結帳紀錄與明細（付款方式、折扣、備註、成本與毛利），結帳時自動更新 `products.stock`。
- `reservations` & `reservation_items`：預定/留貨紀錄，支援多商品，留貨自動扣減庫存；完成時自動建立對應訂單。
- 所有時間欄位以 UTC+8（Asia/Taipei）儲存。

## 前端模組

- `/analytics/sales`：銷售分析儀表板，含週/日走勢、付款方式分布與 Top SKU 排行。
- `/vendors`：廠商 CRUD，含分頁、搜尋與排序。
- `/products`：商品列表，支援搜尋/廠商/日期篩選，可單筆建立或 Excel 批次匯入。
- `/barcodes`：條碼列印中心，可勾選商品批次下載條碼 PNG。
- `/stock`：入庫紀錄，批次匯入以可展開群組呈現。
- `/members`：會員 CRUD，欄位含自動產生的會員 ID、生日、電話。
- `/pos`：收銀台，條碼掃描、電話載入會員折扣、多種付款方式、當日營運摘要。
- `/orders`：訂單管理，可編輯商品/數量（自動回寫庫存）、付款方式與會員。
- `/reservations`：預定/留貨管理，支援多商品、狀態追蹤與付款紀錄。
