.PHONY: build test test-unit test-fork test-deep test-gas clean deploy-anvil deploy-sepolia

FORGE := $(HOME)/.foundry/bin/forge

build:
	$(FORGE) build

test:
	$(FORGE) test -v

test-deep:
	FOUNDRY_PROFILE=ci $(FORGE) test --fuzz-runs 1000 -v

test-gas:
	$(FORGE) test --match-contract TBFFGas -vv

test-unit:
	$(FORGE) test --match-path "test/unit/*" -v

test-fork:
	FOUNDRY_PROFILE=fork $(FORGE) test --match-path "test/integration/*" -v

deploy-anvil:
	$(FORGE) script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast

deploy-sepolia:
	$(FORGE) script script/Deploy.s.sol --rpc-url $(BASE_SEPOLIA_RPC_URL) --broadcast --verify

clean:
	$(FORGE) clean
