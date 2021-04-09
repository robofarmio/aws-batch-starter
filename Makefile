aws_account = 884515231596

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
	@aws ecr get-login-password --region eu-central-1 | docker login --username AWS --password-stdin ${aws_account}.dkr.ecr.eu-central-1.amazonaws.com
	@docker image tag robofarm/aws-batch-starter ${aws_account}.dkr.ecr.eu-central-1.amazonaws.com/robofarm/aws-batch-starter
	@docker image push ${aws_account}.dkr.ecr.eu-central-1.amazonaws.com/robofarm/aws-batch-starter
	@docker logout ${aws_account}.dkr.ecr.eu-central-1.amazonaws.com

p: publish


.PHONY: install i run r update u publish p
