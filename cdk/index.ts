import { App, Stack, StackProps, Duration } from "@aws-cdk/core";

import { Vpc } from  "@aws-cdk/aws-ec2";
import { Repository } from  "@aws-cdk/aws-ecr";
import { EcrImage } from  "@aws-cdk/aws-ecs";
import { ComputeEnvironment, JobQueue, JobDefinition, ComputeResourceType } from "@aws-cdk/aws-batch";


class BatchStack extends Stack {
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props)

    const repo = new Repository(this, "Repo", {
      repositoryName: "robofarm/aws-batch-starter",
      lifecycleRules: [ { maxImageCount: 5 } ],
    });

    const vpc = new Vpc(this, "VPC");

    const spotEnv = new ComputeEnvironment(this, "ComputeEnvironment", {
      computeResources: {
        type: ComputeResourceType.SPOT,
        bidPercentage: 75,
        minvCpus: 0,
        maxvCpus: 8,
        vpc,
      },
    });

    const jobQueue = new JobQueue(this, "JobQueue", {
      computeEnvironments: [
        {
          computeEnvironment: spotEnv,
          order: 1,
        },
      ],
    });

    const jobDef = new JobDefinition(this, "JobDefinition", {
      container: {
        image: new EcrImage(repo, "latest"),
        memoryLimitMiB: 512,
        readOnly: true,
        vcpus: 1,
      },
      timeout: Duration.minutes(10),
    });

  }
}

const env = { account: "884515231596", region: "eu-central-1" };
const app = new App();

new BatchStack(app, "BatchStarterStack", { env: env });

app.synth();
