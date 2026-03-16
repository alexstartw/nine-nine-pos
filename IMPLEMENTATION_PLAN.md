# IMPLEMENTATION_PLAN

## 1. 架構影響分析
- Presentation (FastAPI / Next.js): 新增 `app/routers/analytics.py` 供 `/api/analytics/sales` 週報/日報查詢，新增 Pydantic schemas；前端新增 `/analytics/sales` 頁面與圖表/表格元件，提供週為預設區間、SKU 粒度的指標展示。
- Business Logic: 新增 `app/services/analytics_service.py` 負責計算營收/折扣/成本/毛利、付款方式分布與排名，統一採 UTC+8 並預設 weekly grouping；複用 POS 折扣邏輯確保數據一致性。
- Data Access: 新增 `app/repositories/analytics_repository.py`，使用 SQLModel 聚合 `orders`、`order_items`（排除 `is_cancelled`）並支援依日期區間與 SKU 粒度彙總；注意日期邊界與時區的查詢條件。
- Shared / Utilities: 可能擴充 `utils/time_utils.py` 以提供週區間計算與 UTC+8 專用的開始/結束時間 helper。
- Docs: 更新 `README.md` 與 `.env.example` 說明分析端點與任何新增環境設定。

## 2. 環境變數清單
- 目前無新增必填環境變數；若後續需要快取或時區覆寫，預留（但本迭代固定使用 UTC+8）：  
  - `ANALYTICS_CACHE_TTL`（可選，秒）：彙總結果快取時間。  
  - `ANALYTICS_TIMEZONE`（可選）：覆寫預設 UTC+8；本迭代不啟用。

## 3. 測試策略
- Repository 層：以 pytest + mock session 驗證日期邊界（含跨週）、取消訂單排除、SKU 粒度與付款方式分布聚合正確性。
- Service 層：測試預設 weekly 行為、UTC+8 時區處理、無資料時回傳空集合但不拋錯、折扣計算與 POS 邏輯一致。
- API 整合：使用 FastAPI TestClient 覆蓋 `/api/analytics/sales` 參數驗證（預設/自訂區間、grouping=week/day、SKU 篩選），檢查 JSON schema 與分頁/排序。
- 前端：若有對應 UI，撰寫 component/hook 測試（Vitest）檢查資料格式化、週期切換、錯誤/載入狀態與圖表 props。

## 4. 確認點
- 計畫已備妥，是否按照此計畫執行？(y/n)
