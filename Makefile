.PHONY: install init dev worker test test-e2e

install:
	npm install

init:
	npm run db:init

dev:
	npm run dev

worker:
	npm run worker

test:
	npm test

test-e2e:
	npm run test:e2e
