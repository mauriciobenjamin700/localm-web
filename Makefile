# Makefile — automação de release para localm-web (npm)
#
# Uso rápido:
#   make help                       # lista todos os alvos
#   make releases                   # mostra histórico (a partir das git tags)
#   make validate                   # roda lint + typecheck + build + pack dry-run
#   make release TAG=0.1.0          # bump + validate + commit + tag + push + PR
#   make release TAG=0.1.0 DRY_RUN=1
#
# Variáveis aceitas:
#   TAG              número de versão sem prefixo (ex.: 0.1.0)
#   DRY_RUN=1        executa todo o pipeline mas NÃO faz push (cria branch + commit + tag locais)
#   SKIP_VALIDATE=1  pula passo de validação (lint/typecheck/build)
#   BASE_BRANCH=...  branch alvo do PR (default: main; útil para PRs empilhados)

SHELL        := /bin/bash
.SHELLFLAGS  := -eu -o pipefail -c
.DEFAULT_GOAL := help

TAG           ?=
DRY_RUN       ?= 0
SKIP_VALIDATE ?= 0
BASE_BRANCH   ?= main

RELEASES_FILE  := RELEASES.md
VERSION_FILES  := package.json package-lock.json src/index.ts

# ---------------------------------------------------------------------------
# Help
# ---------------------------------------------------------------------------

.PHONY: help
help: ## Mostra esta ajuda
	@printf "Uso: make <alvo> [TAG=0.1.0] [DRY_RUN=1] [SKIP_VALIDATE=1] [BASE_BRANCH=main]\n\n"
	@printf "Alvos:\n"
	@awk 'BEGIN{FS=":.*?## "} /^[a-zA-Z_-]+:.*## / {printf "  \033[36m%-22s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ---------------------------------------------------------------------------
# Histórico de releases (lê das git tags — fonte da verdade)
# ---------------------------------------------------------------------------

.PHONY: releases last-release releases-md

releases: ## Lista todas as tags de release (mais recentes primeiro)
	@printf "\n=== localm-web (npm) ===\n"
	@git tag -l "v*.*.*" --sort=-v:refname | sed 's/^/  /' | grep . || echo "  (nenhuma tag ainda)"
	@printf "\n"

last-release: ## Mostra última tag publicada
	@git tag -l "v*.*.*" --sort=-v:refname | head -n 1 | grep . || echo "(nenhuma)"

releases-md: ## (Re)gera RELEASES.md a partir das git tags
	@{ \
	  printf "# Histórico de releases\n\n"; \
	  printf "_Gerado automaticamente por \`make releases-md\` a partir das git tags._\n\n"; \
	  printf "## localm-web (npm)\n\n"; \
	  rows=$$(git for-each-ref --sort=-v:refname --format='| %(refname:short) | %(creatordate:short) | %(objectname:short) |' 'refs/tags/v*.*.*' 2>/dev/null || true); \
	  if [ -n "$$rows" ]; then \
	    printf "| Tag | Data | Commit |\n| --- | ---- | ------ |\n%s\n" "$$rows"; \
	  else \
	    printf "_Nenhuma release publicada ainda._\n"; \
	  fi; \
	} > $(RELEASES_FILE)
	@echo "✓ $(RELEASES_FILE) atualizado"

# ---------------------------------------------------------------------------
# Bump de versão nos arquivos-fonte
# ---------------------------------------------------------------------------

.PHONY: bump

bump: _require-tag ## Atualiza versão em package.json, package-lock.json e src/index.ts (use TAG=0.1.0)
	@npm version $(TAG) --no-git-tag-version --allow-same-version >/dev/null
	@sed -i.bak -E 's/^export const VERSION: string = "[^"]*";$$/export const VERSION: string = "$(TAG)";/' src/index.ts
	@rm -f src/index.ts.bak
	@echo "✓ localm-web bumped → $(TAG)"

# ---------------------------------------------------------------------------
# Validação local (mesmos checks que o CI roda)
# ---------------------------------------------------------------------------

.PHONY: validate install clean

install: ## npm ci (instala deps do lockfile)
	npm ci

clean: ## Remove dist/ e node_modules/.cache
	rm -rf dist node_modules/.cache

validate: ## Lint + format-check + typecheck + test + build + pack dry-run
	npm ci
	npm run lint
	npm run format:check
	npm run typecheck
	npm run test
	npm run build
	npm pack --dry-run

# ---------------------------------------------------------------------------
# Release pipeline
# ---------------------------------------------------------------------------

.PHONY: release

release: _require-tag ## Pipeline completo: make release TAG=0.1.0
	@DRY_RUN=$(DRY_RUN) SKIP_VALIDATE=$(SKIP_VALIDATE) BASE_BRANCH=$(BASE_BRANCH) \
	  ./scripts/release.sh "$(TAG)"

# ---------------------------------------------------------------------------
# Publish manual (sem CI) — fallback caso o workflow do GitHub Actions falhe
# ---------------------------------------------------------------------------

.PHONY: publish publish-dry

publish-dry: ## Roda npm publish --dry-run (não publica de verdade)
	npm publish --dry-run --access public

publish: ## npm publish manual (requer NPM_TOKEN exportado ou npm login prévio)
	@test -d dist || { echo "ERROR: dist/ não existe — rode 'make validate' antes"; exit 1; }
	npm publish --access public

# ---------------------------------------------------------------------------
# Guards (uso interno)
# ---------------------------------------------------------------------------

.PHONY: _require-tag

_require-tag:
	@test -n "$(TAG)" || { echo "ERROR: TAG é obrigatório (ex.: TAG=0.1.0)"; exit 1; }
	@echo "$(TAG)" | grep -qE '^[0-9]+\.[0-9]+\.[0-9]+([.-][a-zA-Z0-9]+)*$$' || \
	  { echo "ERROR: TAG inválido '$(TAG)' — esperado formato semver (ex.: 0.1.0, 1.0.0-rc1)"; exit 1; }
