.PHONY: prepare

WORK_DIR := /home/ubuntu/workspace
PULUMI_DIR := $(WORK_DIR)/pulumi
PULUMI_STACK ?= organization/local-cast/prod
export PULUMI_CONFIG_PASSPHRASE :=

#We do this due to performance issues with the filesystem mount to the host device
prepare:
	mkdir -p $(PULUMI_DIR)
	rsync -a --delete --exclude=node_modules pulumi/ $(PULUMI_DIR)/
	cd $(PULUMI_DIR) && npm install