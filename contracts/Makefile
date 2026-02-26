.PHONY: build test test-deep test-gas clean

FORGE := $(HOME)/.foundry/bin/forge

build:
	$(FORGE) build

test:
	$(FORGE) test -v

test-deep:
	FOUNDRY_PROFILE=ci $(FORGE) test --fuzz-runs 1000 -v

test-gas:
	$(FORGE) test --match-contract TBFFGas -vv

clean:
	$(FORGE) clean
