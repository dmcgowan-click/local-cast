.PHONY: prepare prepare-server build-docker publish-docker

WORK_DIR := /home/ubuntu/workspace
PULUMI_DIR := $(WORK_DIR)/pulumi
SERVER_DIR := $(WORK_DIR)/server
PULUMI_STACK ?= organization/local-cast/prod
AWS_REGION ?= ap-southeast-2
AWS_ACCOUNT_ID ?= 601374407704
ECR_REPO := local-cast-backend
IMAGE_TAG ?= latest
ECR_URI := $(AWS_ACCOUNT_ID).dkr.ecr.$(AWS_REGION).amazonaws.com/$(ECR_REPO)
export PULUMI_CONFIG_PASSPHRASE :=

prepare-infra:
	mkdir -p $(PULUMI_DIR)
	rsync -a --delete --exclude=node_modules pulumi/ $(PULUMI_DIR)/
	cd $(PULUMI_DIR) && npm install

prepare-server:
	mkdir -p $(SERVER_DIR)
	rsync -a --delete --exclude=node_modules app/server/ $(SERVER_DIR)/
	cp app/Dockerfile $(SERVER_DIR)/
	cd $(SERVER_DIR) && npm install

build-docker: prepare-server
	cd $(SERVER_DIR) && docker build --platform linux/arm64 -t $(ECR_REPO):$(IMAGE_TAG) .

publish-docker: build-docker
	aws ecr get-login-password --region $(AWS_REGION) | docker login --username AWS --password-stdin $(ECR_URI)
	docker tag $(ECR_REPO):$(IMAGE_TAG) $(ECR_URI):$(IMAGE_TAG)
	docker push $(ECR_URI):$(IMAGE_TAG)