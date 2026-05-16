.PHONY: help prepare-infra prepare-server build-docker publish-docker build-authorizer preview-infra up-infra

.DEFAULT_GOAL := help
help: ## Show this help message
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

WORK_DIR := /home/ubuntu/workspace
PULUMI_DIR := $(WORK_DIR)/pulumi
SERVER_DIR := $(WORK_DIR)/server
AUTHORIZER_DIR := $(WORK_DIR)/authorizer
PULUMI_STACK ?= organization/local-cast/prod
AWS_REGION ?= ap-southeast-2
AWS_ACCOUNT_ID ?= 601374407704
ECR_REPO := local-cast-backend
IMAGE_TAG ?= latest
ECR_URI := $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/$(ECR_REPO)
export PULUMI_CONFIG_PASSPHRASE :=

prepare-infra: ## Sync Pulumi code and install deps (called by up-infra/preview-infra)
	mkdir -p $(PULUMI_DIR)
	rsync -a --delete --exclude=node_modules pulumi/ $(PULUMI_DIR)/
	cd $(PULUMI_DIR) && npm install

prepare-server: ## Sync server code and install deps (called by build-docker)
	mkdir -p $(SERVER_DIR)
	rsync -a --delete --exclude=node_modules app/server/ $(SERVER_DIR)/
	cp app/Dockerfile $(SERVER_DIR)/
	cd $(SERVER_DIR) && npm install

build-docker: prepare-server ## Build backend Docker image (arm64)
	cd $(SERVER_DIR) && docker build --platform linux/arm64 -t $(ECR_REPO):$(IMAGE_TAG) .

publish-docker: build-docker ## Build and push Docker image to ECR
	mkdir -p ~/.docker && echo '{}' > ~/.docker/config.json
	aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(ECR_URI)
	docker tag $(ECR_REPO):$(IMAGE_TAG) $(ECR_URI):$(IMAGE_TAG)
	docker push $(ECR_URI):$(IMAGE_TAG)

build-authorizer: ## Bundle the API Gateway authorizer Lambda
	mkdir -p $(AUTHORIZER_DIR)
	rsync -a --delete --exclude=node_modules --exclude=dist app/authorizer/ $(AUTHORIZER_DIR)/
	cd $(AUTHORIZER_DIR) && npm install
	cd $(AUTHORIZER_DIR) && npm run build

up-infra: prepare-infra build-authorizer ## Deploy infrastructure with Pulumi
	mkdir -p $(PULUMI_DIR)/authorizer-bundle
	cp $(AUTHORIZER_DIR)/dist/index.js $(PULUMI_DIR)/authorizer-bundle/index.js
	cd $(PULUMI_DIR) && pulumi stack select $(PULUMI_STACK) --create 2>/dev/null; \
	pulumi up --yes --cwd $(PULUMI_DIR)

preview-infra: prepare-infra build-authorizer ## Preview infrastructure changes
	mkdir -p $(PULUMI_DIR)/authorizer-bundle
	cp $(AUTHORIZER_DIR)/dist/index.js $(PULUMI_DIR)/authorizer-bundle/index.js
	cd $(PULUMI_DIR) && pulumi stack select $(PULUMI_STACK) --create 2>/dev/null; \
	pulumi preview --cwd $(PULUMI_DIR)