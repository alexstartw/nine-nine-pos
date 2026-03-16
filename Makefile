IMAGE_NAME  := nine-nine-pos
IMAGE_FILE  := nine-nine-pos.tar
CONTAINER   := about-nine
DATA_DIR    := $(shell pwd)/data
PORT        ?= 8080

.PHONY: up down restart logs shell help

## 第一次部署 / 更新版本：make up
up: .env data
	@if ! docker image inspect $(IMAGE_NAME) > /dev/null 2>&1; then \
	  echo "[make] 載入 image $(IMAGE_FILE) ..."; \
	  docker load -i $(IMAGE_FILE); \
	fi
	@if docker ps -q -f name=^$(CONTAINER)$$ | grep -q .; then \
	  echo "[make] 停止舊容器 ..."; \
	  docker stop $(CONTAINER) && docker rm $(CONTAINER); \
	fi
	@echo "[make] 啟動 $(CONTAINER) on port $(PORT) ..."
	docker run -d \
	  --name $(CONTAINER) \
	  --restart unless-stopped \
	  --env-file .env \
	  -p $(PORT):80 \
	  -v $(DATA_DIR):/app/data \
	  $(IMAGE_NAME)
	@echo "[make] 完成！開啟 http://localhost:$(PORT)"

## 停止並移除容器
down:
	@docker stop $(CONTAINER) 2>/dev/null || true
	@docker rm   $(CONTAINER) 2>/dev/null || true
	@echo "[make] 已停止"

## 重啟（不重新載入 image）
restart: down
	docker run -d \
	  --name $(CONTAINER) \
	  --restart unless-stopped \
	  --env-file .env \
	  -p $(PORT):80 \
	  -v $(DATA_DIR):/app/data \
	  $(IMAGE_NAME)

## 查看即時 log
logs:
	docker logs -f $(CONTAINER)

## 進入容器 shell（除錯用）
shell:
	docker exec -it $(CONTAINER) bash

## 建立 .env（若不存在則從範本複製）
.env:
	@echo "[make] 建立 .env 從 .env.example ..."
	cp .env.example .env
	@echo "[make] 請編輯 .env 確認設定後再執行 make up"
	@exit 1

## 建立資料目錄
data:
	@mkdir -p $(DATA_DIR)

help:
	@echo ""
	@echo "  make up       第一次部署或更新版本"
	@echo "  make down     停止服務"
	@echo "  make restart  重啟服務"
	@echo "  make logs     查看即時 log"
	@echo "  make shell    進入容器（除錯）"
	@echo ""
