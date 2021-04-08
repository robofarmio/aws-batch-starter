import { App, Stack, StackProps, Duration } from "@aws-cdk/core";

import { Vpc, LaunchTemplate, EbsDeviceVolumeType } from  "@aws-cdk/aws-ec2";
import { Repository } from  "@aws-cdk/aws-ecr";
import { EcrImage } from  "@aws-cdk/aws-ecs";
import { ComputeEnvironment, JobQueue, JobDefinition, ComputeResourceType, CfnJobDefinition } from "@aws-cdk/aws-batch";
import { Secret } from "@aws-cdk/aws-secretsmanager";


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
      jobDefinitionName: "MyTask",
      container: {
        image: new EcrImage(repo, "latest"),
        memoryLimitMiB: 512,
        readOnly: true,
        vcpus: 1,
        command: ["Ref::MyParam"],
        // environment: { }, //
        // secrets: { }, // https://github.com/aws/aws-cdk/issues/10976
      },
      parameters: {
        "MyParam": "",
      },
      timeout: Duration.minutes(10),
    });

    // Secrets are not yet supported in the high-level JobDefinition
    //  - https://github.com/aws/aws-cdk/issues/10976
    //  - https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-batch.CfnJobDefinition.ContainerPropertiesProperty.html#secrets
    //const cfnJobDef = jobDef.node.defaultChild as CfnJobDefinition;
    //const cfnContainerProps = cfnJobDef.containerProperties as CfnJobDefinition.ContainerPropertiesProperty;
    //
    //(cfnContainerProps as any).secrets = [
    //  { name: "MySecret", valueFrom: "MySecretArn" },
    //];

    // The VPC to run the batch jobs in,
    // and all the infrastructure below
    const vpc = new Vpc(this, "VPC");

    // Use a custom launch template to
    // attach more disk space to instances
    const LAUNCH_TEMPLATE_NAME = "increase-volume-size";

    const launchTemplate = new LaunchTemplate(this, "LaunchTemplate", {
      launchTemplateName: LAUNCH_TEMPLATE_NAME,
      blockDevices: [
        {
          deviceName: "/dev/xvda", // for Amazon Linux 2 (default)
          volume: {
            ebsDevice: {
              volumeType: EbsDeviceVolumeType.GP2,
              volumeSize: 100,  // 100 GiB
            },
          },
        },
      ],
    });

    // Compute environments with different
    // - price points
    // - max cluster size
    // The idea is to scale out wider when
    // it is cheap on the spot market to do

    // By not setting an instance type, we get
    // "optimal" meaning C4, M4, and R4, or if
    // not available, C5, M5, and R5 families

    const computeEnvHigh = new ComputeEnvironment(this, "ComputeEnvironmentHigh", {
      enabled: true,
      computeEnvironmentName: "HighCapacity",
      computeResources: {
        type: ComputeResourceType.SPOT,
        bidPercentage: 75,
        minvCpus: 0, // make sure to shut down the cluster on idle
        maxvCpus: 8,
        vpc: vpc,
        launchTemplate: {
          launchTemplateName: LAUNCH_TEMPLATE_NAME,
        },
      },
    });

    const computeEnvDefault = new ComputeEnvironment(this, "ComputeEnvironmentDefault", {
      enabled: true,
      computeEnvironmentName: "DefaultCapacity",
      computeResources: {
        type: ComputeResourceType.SPOT,
        bidPercentage: 100,
        minvCpus: 0, // make sure to shut down the cluster on idle
        maxvCpus: 1,
        vpc: vpc,
        launchTemplate: {
          launchTemplateName: LAUNCH_TEMPLATE_NAME,
        },
      },
    });

    // The batch queue, distributing jobs
    // onto different compute environments
    // based on their capacity and order
    const jobQueue = new JobQueue(this, "JobQueue", {
      enabled: true,
      jobQueueName: "MyQueue",
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
