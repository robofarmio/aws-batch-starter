install:
	@docker-compose build

i: install


update:
	@docker-compose build --pull --no-cache

u: update


run:
	@docker-compose run --rm dev bash

r: run


publish: install
	@aws ecr get-login-password --region ${region} | docker login --username AWS --password-stdin ${account}.dkr.ecr.${region}.amazonaws.com
	@docker image tag robofarm/aws-batch-starter ${account}.dkr.ecr.${region}.amazonaws.com/robofarm/aws-batch-starter
	@docker image push ${account}.dkr.ecr.${region}.amazonaws.com/robofarm/aws-batch-starter
	@docker logout ${account}.dkr.ecr.${region}.amazonaws.com

p: publish


.PHONY: install i run r update u publish p
