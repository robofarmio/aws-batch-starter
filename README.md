<h1 align='center'>AWS Batch Starter</h1>

<p align=center>
  <img src="assets/aws-batch-starter.png" />
</p>


## Overview

This repository is an example for using AWS Batch with the AWS CDK.

The goal is to schedule batch jobs running docker containers at scale.

AWS console quick links for the deployed starter project
- [Logs](https://eu-central-1.console.aws.amazon.com/cloudwatch/home?region=eu-central-1#logsV2:log-groups/log-group/$252Faws$252Fbatch$252Fjob)
- [Dashboard](https://eu-central-1.console.aws.amazon.com/batch/v2/home?region=eu-central-1)


## Explanations

Todo: explain
- ComputeEnvironment, JobDefinition, JobQueue
- Baseline vs scale out cluster
- Shutdown on idle: min cpus
- Secrets
- Volume


## Deployment of batch stack with cdk

You can find everything deployment related in the [cdk](./cdk) directory.

To set up the cdk deployment in a container run
    
    cd ./cdk

    docker-compose build

    docker-compose run dev bash

And in the container run once

    npm install


Inside the container, set up credentials to deploy

    export AWS_ACCESS_KEY_ID=
    export AWS_SECRET_ACCESS_KEY=
    export AWS_DEFAULT_REGION=eu-central-1

Build and deploy the cdk app

    npm run build

    npm run cdk ls
    npm run cdk diff BatchStarterStack
    npm run cdk deploy BatchStarterStack

For AWS CDK documentation, see
- https://docs.aws.amazon.com/cdk/latest/guide/core_concepts.html
- https://docs.aws.amazon.com/cdk/api/latest/docs/aws-construct-library.html


## publish container

To build and publish the starter container that is then us in test, in the root directory  run

   make install

to build a container after changes where made and then 

   make publish aws_account=YOUR_AWS_ACCOUNT_NUMBER


## Queue

To submit a job

    aws batch submit-job --job-name MyJob --job-queue <job-queue-arn> --job-definition <job-definition-arn> --parameters MyParam=MyValue

To get job queue ARNs

    aws batch describe-job-queues --query "jobQueues[].jobQueueArn" --output text

To get job definition ARNs

    aws batch describe-job-definitions --query "jobDefinitions[].jobDefinitionArn" --output text


For AWS CLI documentation, see
- https://docs.aws.amazon.com/cli/latest/reference/batch/
