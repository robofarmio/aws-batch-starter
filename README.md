## Overview

This repository is an example for using AWS Batch with the AWS CDK.

The goal is to schedule batch jobs running docker containers at scale.

AWS console quick links for the deployed starter project
- [Logs](https://eu-central-1.console.aws.amazon.com/cloudwatch/home?region=eu-central-1#logsV2:log-groups/log-group/$252Faws$252Fbatch$252Fjob)
- [Dashboard](https://eu-central-1.console.aws.amazon.com/batch/v2/home?region=eu-central-1)


## Queue

To submit a job

    aws batch submit-job --job-name MyJob --job-queue <job-queue-arn> --job-definition <job-definition-arn>

To get job queue ARNs

    aws batch describe-job-queues --query "jobQueues[].jobQueueArn" --output text

To get job definition ARNs

    aws batch describe-job-definitions --query "jobDefinitions[].jobDefinitionArn" --output text


For AWS CLI documentation, see
- https://docs.aws.amazon.com/cli/latest/reference/batch/


## Deployment

You can find everything deployment related in the [cdk](./cdk) directory.

Inside the container in the cdk directory, set up credentials to deploy

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
