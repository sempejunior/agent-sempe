.PHONY: setup up down dev build rebuild logs shell open kiro-status

FRONTEND_URL := http://localhost:5173
VNC_URL      := http://localhost:7080/vnc.html?autoconnect=1&resize=scale

OPENER := $(shell command -v xdg-open 2>/dev/null || command -v open 2>/dev/null || echo true)

define open_browsers
	@echo ""
	@echo "  Waiting for services..."
	@for i in $$(seq 1 40); do \
		curl -sf -o /dev/null $(FRONTEND_URL) && curl -sf -o /dev/null "http://localhost:7080/vnc.html" && break; \
		sleep 1; \
	done
	@echo "  Opening browser tabs..."
	@$(OPENER) "$(FRONTEND_URL)" >/dev/null 2>&1 &
	@sleep 1
	@$(OPENER) "$(VNC_URL)" >/dev/null 2>&1 &
endef

setup:
	@./setup.sh

up:
	@mkdir -p $$HOME/.nanobot
	docker compose up -d
	$(call open_browsers)

down:
	docker compose down

build:
	docker compose build

rebuild:
	docker compose up -d --build
	$(call open_browsers)

DEV_COMPOSE := docker compose -f docker-compose.yml -f docker-compose.dev.yml

dev:
	@mkdir -p $$HOME/.nanobot
	$(DEV_COMPOSE) down
	@echo ""
	@echo "  Building (first run downloads the Kiro CLI, ~856 MB — cached after)..."
	$(DEV_COMPOSE) build
	$(DEV_COMPOSE) up -d
	@echo ""
	@echo "  Dev mode ready!"
	@echo ""
	@echo "  Frontend:  $(FRONTEND_URL)"
	@echo "  API:       http://localhost:18790"
	@echo "  noVNC:     $(VNC_URL)"
	@echo ""
	@$(MAKE) --no-print-directory kiro-status
	@echo ""
	@echo "  Frontend has hot-reload via Vite."
	@echo "  Python code has hot-reload via watchmedo."
	$(call open_browsers)
	@echo ""
	docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f

# Report whether the code agent CLI is usable, and what is still missing.
kiro-status:
	@if docker exec nanobot-gateway sh -c 'command -v kiro-cli >/dev/null 2>&1 || test -x /root/.local/bin/kiro-cli' 2>/dev/null; then \
		echo "  Kiro CLI:  installed"; \
		echo "             paste your API key in Integrations > Kiro to enable delegation."; \
	else \
		echo "  Kiro CLI:  NOT installed — run 'make dev' to build the image with it,"; \
		echo "             or install it from Integrations > Kiro in the UI."; \
	fi

open:
	$(call open_browsers)

# Follow the container logs
logs:
	docker compose logs -f nanobot-gateway

# Access the container shell
shell:
	docker exec -it nanobot-gateway /bin/bash
