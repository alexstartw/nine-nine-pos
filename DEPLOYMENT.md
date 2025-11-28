## about-nine 部署指令

### 1. 建置 Docker Image

```bash
docker build --no-cache -t nine-nine-pos:1.1 .
```

### 2. 將 Image 導出成 tar (給客戶 / 備份)

```bash
docker save nine-nine-pos -o nine-nine-pos.tar
```

> 客戶端可用 `docker load -i nine-nine-pos.tar` 匯入。

### 3. 啟動 Container（名稱為 about-nine）

```bash
docker run -d \
  --name about-nine \
  --env-file .env \
  -p 8080:80 \
  -v /host/path/to/data:/app/data \
  nine-nine-pos
```

- `-v /host/path/to/data:/app/data`：掛載 SQLite 資料夾以保留資料。更新 image 時只需保留這個資料夾。
- `--env-file .env`：載入 API、DB 連線設定。

### 4. 更新流程

1. 拉最新程式碼與 image（或載入新 tar）。
2. 停止舊 container：`docker stop about-nine && docker rm about-nine`
3. 重新執行第 3 步指令（沿用同一個資料夾 `/host/path/to/data`），資料即會保留。
