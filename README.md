# about-nine² POS & Inventory Platform

Modular POS + 庫存管理系統，採用 Next.js 14 (App Router + Tailwind)、FastAPI、SQLite 並搭配 Docker 單一映像部署。

## 版本號規則

採 `MAJOR.MINOR` 格式，定義如下：

| 等級 | 觸發條件 | 範例 |
| --- | --- | --- |
| **MAJOR** | 破壞性變更：需要更新 `.env`、DB migration、刪除舊 image | `1.x → 2.0` |
| **MINOR** | 新功能、UI 改版、新 API endpoint，不需動 `.env` 與 DB | `2.0 → 2.1` |

**目前版本：`2.0`**

### 版本更新流程（開發者）

```bash
# 1. 更新 Makefile 最上方的 VERSION
# 2. 建置並打包
make build
make export
# 3. 交付 nine-nine-pos-<VERSION>.tar、Makefile、.env.example 給客戶
```

### 版本更新流程（客戶端）

```bash
# 以新的 nine-nine-pos-<VERSION>.tar 覆蓋，然後：
make up
```

Makefile 自動載入新版 image、停止舊容器、重新啟動。`data/app.db` 完整保留。

> **MAJOR 升版前請閱讀升版說明**，確認是否需要手動更新 `.env` 或執行資料庫遷移腳本。

---

## 目錄結構

```
.
├── backend
│   ├── app
│   │   ├── auth.py               # JWT 驗證工具（create_token / require_admin）
│   │   ├── config.py
│   │   ├── database.py
│   │   ├── main.py
│   │   ├── models.py
│   │   ├── schemas.py
│   │   ├── repositories/         # DB 查詢層（analytics）
│   │   ├── routers/              # HTTP 路由（薄包裝）
│   │   │   ├── auth.py           # POST /api/auth/login
│   │   │   ├── analytics.py      # 需管理員 token
│   │   │   ├── members.py
│   │   │   ├── orders.py         # 需管理員 token
│   │   │   ├── pos.py
│   │   │   ├── products.py
│   │   │   ├── reservations.py   # 需管理員 token
│   │   │   ├── stock_entries.py  # 需管理員 token
│   │   │   └── vendors.py        # 需管理員 token
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
│   │   ├── (routes)              # Header + footer layout 在此層
│   │   │   ├── layout.tsx
│   │   │   ├── analytics/sales
│   │   │   ├── barcodes
│   │   │   ├── members
│   │   │   ├── orders
│   │   │   ├── pos               # 多分頁訂單（最多 8 張）
│   │   │   ├── products
│   │   │   ├── reservations
│   │   │   ├── stock
│   │   │   └── vendors
│   │   ├── login/                # 管理員登入（獨立全螢幕，無 Header）
│   │   ├── globals.css
│   │   ├── layout.tsx            # 只含 html/body/AuthProvider
│   │   └── page.tsx
│   ├── components/
│   │   ├── DatePickerField.tsx
│   │   ├── Header.tsx            # 依角色顯示不同選單
│   │   └── PaginationControls.tsx
│   ├── contexts/
│   │   └── AuthContext.tsx       # JWT 儲存於 localStorage
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

| 變數 | 必填 | 用途 |
| --- | --- | --- |
| `JWT_SECRET` | ✅ | JWT 簽名金鑰，請使用隨機長字串（`openssl rand -hex 32`） |
| `ADMIN_USERNAME` | ✅ | 管理員帳號 |
| `ADMIN_PASSWORD` | ✅ | 管理員密碼 |
| `NEXT_PUBLIC_API_BASE_URL` | — | 前端呼叫 FastAPI 的公開 URL。填完整 `http(s)://` 才生效；Docker 同網域部署可留空使用 `/api` |
| `APP_NAME` | — | FastAPI 顯示的名稱 |
| `API_PREFIX` | — | API 路徑前綴（預設 `/api`） |
| `DATABASE_URL` | — | 覆寫 SQLite 位置（預設 `./data/app.db`） |
| `CORS_ORIGINS` | — | 以逗號分隔的允許來源 |
| `CORS_ORIGIN_REGEX` | — | 允許以正規表達式描述的來源 |
| `APP_PORT` | — | Docker 對外 port（預設 `8080`） |

> **v2.0 升版注意**：新增 `JWT_SECRET`、`ADMIN_USERNAME`、`ADMIN_PASSWORD` 三個必填欄位，`.env` 未設定時服務無法啟動。

## 角色權限

| 功能 | 工讀生（無需登入） | 管理員（需登入） |
| --- | :---: | :---: |
| POS 結帳 | ✅ | ✅ |
| 會員管理 | ✅ | ✅ |
| 商品列表（不含成本/毛利） | ✅ | ✅ |
| 商品成本 / 毛利 / 庫存金額 | — | ✅ |
| 商品新增 / 編輯 / 刪除 | — | ✅ |
| POS 結帳單成本 / 毛利 | — | ✅ |
| 今日概況成本 / 毛利 | — | ✅ |
| 銷售分析 | — | ✅ |
| 訂單管理 | — | ✅ |
| 廠商 / 入庫 / 預定留貨 | — | ✅ |

管理員點擊 Header 右上角「管理員登入」，登入後可存取全部功能。登出後自動回到工讀生模式。

## 本機開發流程

### 環境設定

```bash
cp .env.example .env
# 編輯 .env，填入 JWT_SECRET、ADMIN_USERNAME、ADMIN_PASSWORD
```

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
# 確認 Makefile 最上方 VERSION 已更新，然後：
make build    # 建置 image（含版本標籤）
make export   # 導出成 nine-nine-pos-<VERSION>.tar
```

交付給客戶的三個檔案：`nine-nine-pos-<VERSION>.tar`、`Makefile`、`.env.example`

### 客戶端：首次部署

前置條件：已安裝 Docker Desktop。

```bash
# 1. 設定環境變數（必填：JWT_SECRET、ADMIN_USERNAME、ADMIN_PASSWORD）
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

### 資料備份

```bash
cp data/app.db data/app.db.bak   # 備份
```

還原：停止服務 → 替換檔案 → `make up`。

## API 概覽

所有列表端點支援 `?page=&size=` 分頁查詢（`size` 預設 20、上限 500）。

> **權限標示**：🔒 需要管理員 Bearer token；無標示表示不需 token（工讀生可直接存取）。

### 驗證

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `POST` | `/api/auth/login` | 管理員登入，回傳 `access_token`（JWT，12h）與 `role` |

### 廠商 🔒

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

### 入庫紀錄 🔒

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
| `GET` | `/api/members/{id}/items` | 歷史購買明細（依品名 / 條碼模糊搜尋，含已取消標示） |

### POS

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/api/pos/products/{barcode}` | 條碼查詢商品 |
| `GET` | `/api/pos/members/by-phone` | 電話查詢會員與折扣資格 |
| `GET` | `/api/pos/members/search` | 電話後三碼搜尋會員 |
| `GET` | `/api/pos/summary/daily` | 當日（或指定日期）營收、折扣、成本、毛利與付款分布 |
| `POST` | `/api/pos/checkout` | 結帳（會員 95 折 / 生日月 88 折、自訂折扣、無條碼定價） |

### 訂單 🔒

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/api/orders` | 依日期分頁列表（預設今日），含商品明細與會員資訊 |
| `PUT` | `/api/orders/{id}` | 更新付款方式 / 備註 / 會員 / 商品明細（自動同步庫存與折扣） |
| `POST` | `/api/orders/{id}/cancel` | 取消訂單（自動回補庫存） |

### 預定 / 留貨 🔒

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/api/reservations` | 分頁列表，支援 `reservation_type`、`status`、`payment_status`、`q` |
| `GET` | `/api/reservations/member-suggestions` | 會員模糊搜尋（姓名 / 電話 / 會員代碼） |
| `POST` | `/api/reservations` | 建立預定或留貨（留貨自動扣減庫存） |
| `PUT` | `/api/reservations/{id}` | 更新；狀態改為「完成」時自動建立訂單 |

### 銷售分析 🔒

| 方法 | 路徑 | 說明 |
| --- | --- | --- |
| `GET` | `/api/analytics/sales` | 區間彙總、付款分布與 Top SKU；支援 `start_date`、`end_date`、`group_by`（`day`\|`week`）、`top_limit` |
| `GET` | `/api/analytics/products` | 單品銷量統計（依商品 × 顏色 × 尺寸）；不填日期時回傳全部歷史；支援關鍵字搜尋與分頁 |

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

- `/login`：管理員登入頁（工讀生不需登入，直接使用 POS 等頁面）。
- `/analytics/sales`：銷售分析儀表板，含週/日走勢、付款方式分布、Top SKU 排行，以及單品銷量統計分頁。🔒
- `/vendors`：廠商 CRUD，含分頁、搜尋與排序。🔒
- `/products`：商品列表，支援搜尋/廠商/日期篩選，可單筆建立或 Excel 批次匯入（工讀生僅供查閱）。
- `/barcodes`：條碼列印中心，可勾選商品批次下載條碼 PNG。🔒
- `/stock`：入庫紀錄，批次匯入以可展開群組呈現。🔒
- `/members`：會員 CRUD，含購買明細歷史與品名 / 條碼模糊搜尋。
- `/pos`：收銀台，支援多分頁同時處理多筆訂單（最多 8 張）、條碼掃描、電話載入會員折扣、多種付款方式、分頁狀態跨頁導覽保留。
- `/orders`：訂單管理，可編輯商品/數量（自動回寫庫存）、付款方式與會員。🔒
- `/reservations`：預定/留貨管理，支援多商品、狀態追蹤與付款紀錄。🔒
