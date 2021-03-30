import { App, Stack, StackProps, Duration } from "@aws-cdk/core";

import { Vpc } from  "@aws-cdk/aws-ec2";
import { Repository } from  "@aws-cdk/aws-ecr";
import { EcrImage } from  "@aws-cdk/aws-ecs";
import { ComputeEnvironment, JobQueue, JobDefinition, ComputeResourceType } from "@aws-cdk/aws-batch";


class BatchStack extends Stack {
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props)

    // The ECR container image registry to run
    // the batch job containers from at scale
    const repo = new Repository(this, "Repo", {
      repositoryName: "robofarm/aws-batch-starter",
      lifecycleRules: [ { maxImageCount: 5 } ],
    });

    // The job definition for the container
    // which gets run from the image at scale
    const jobDef = new JobDefinition(this, "JobDefinition", {
      container: {
        image: new EcrImage(repo, "latest"),
        memoryLimitMiB: 512,
        readOnly: true,
        vcpus: 1,
        command: ["Ref::MyParam"],
      },
      parameters: {
        "MyParam": "",
      },
      timeout: Duration.minutes(10),
    });

    // The VPC to run the batch jobs in,
    // and all the infrastructure below
    const vpc = new Vpc(this, "VPC");

    // Compute environments with different
    // - price points
    // - max cluster size
    // The idea is to scale out wider when
    // it is cheap on the spot market to do

    const computeEnvHigh = new ComputeEnvironment(this, "ComputeEnvironmentHigh", {
      enabled: true,
      computeResources: {
        type: ComputeResourceType.SPOT,
        bidPercentage: 75,
        minvCpus: 0, // make sure to shut down the cluster on idle
        maxvCpus: 8,
        vpc,
      },
    });

    const computeEnvDefault = new ComputeEnvironment(this, "ComputeEnvironmentDefault", {
      enabled: true,
      computeResources: {
        type: ComputeResourceType.SPOT,
        bidPercentage: 100,
        minvCpus: 0, // make sure to shut down the cluster on idle
        maxvCpus: 1,
        vpc,
      },
    });

    // The batch queue, distributing jobs
    // onto different compute environments
    // based on their capacity and order
    const jobQueue = new JobQueue(this, "JobQueue", {
      enabled: true,
      computeEnvironments: [
        {
          computeEnvironment: computeEnvHigh,
          order: 1,
        },
        {
          computeEnvironment: computeEnvDefault,
          order: 2,
        },
      ],
    });

  }
}

const env = { account: "884515231596", region: "eu-central-1" };
const app = new App();

new BatchStack(app, "BatchStarterStack", { env: env });

app.synth();
