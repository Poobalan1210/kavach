AWS_REGION ?= us-east-1
export AWS_REGION
UV_PY := uv run -q --no-project --with boto3 --with pytest --with pyyaml --with "moto[dynamodb,sns]" python

.PHONY: install test build synth deploy policy seed users chat smoke verify3 verify4 bench bench-smoke web web-dev

install:
	cd infra && npm ci

test:
	$(UV_PY) -m pytest -q tests

build:
	$(UV_PY) scripts/build_rules.py

synth: build
	cd infra && npx cdk synth -q

deploy: build
	cd infra && npx cdk deploy Kavach --require-approval never
	$(MAKE) policy

policy:
	$(UV_PY) policy/gen_cedar.py --live --apply

seed:
	$(UV_PY) scripts/seed.py --reset-today

reset-demo:  # clear leftovers from tests and visitors, re-seed, re-sync Cedar
	$(UV_PY) scripts/reset_demo.py --apply

users:
	$(UV_PY) scripts/demo_users.py

chat:
	$(UV_PY) scripts/chat.py $(ARGS)

smoke:
	$(UV_PY) scripts/smoke_phase2.py

verify3:
	$(UV_PY) scripts/verify_phase3.py

verify4:
	$(UV_PY) scripts/verify_phase4.py $(ARGS)

bench:
	$(UV_PY) bench/run.py --budget 20 $(ARGS)

bench-smoke:
	$(UV_PY) bench/run.py --smoke --budget 2 $(ARGS)

web:
	$(UV_PY) scripts/build_web.py

web-dev:
	cd web && npm run dev
