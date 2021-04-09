import { App, Stack, StackProps, Duration } from "@aws-cdk/core";


import { Vpc, SubnetType, LaunchTemplate, EbsDeviceVolumeType, SecurityGroup, Peer, Port } from  "@aws-cdk/aws-ec2";

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


    // The VPC to run the batch jobs in; we use a new VPC
    // with public subnets, because our image needs to be
    // able to make calls to the internet; at the same time
    // we do not want a private subnet, because it would
    // eat up ElasticIPs for the NAT gateways. We use
    // security groups below instead to restrict inbound.

    const vpc = new Vpc(this, "VPC", {
      cidr: "10.0.0.0/16",
      maxAzs: 4,
      subnetConfiguration: [
        {
          name: "public",
          subnetType: SubnetType.PUBLIC,
        },
      ],
    });



    const securityGroup = new SecurityGroup(this, "BatchStackStarterSecurityGroup", {
      vpc: vpc,
      securityGroupName: "BatchStackStarterSecurityGroup",

    })
    securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(22), 'SSH from anywhere');


    


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
        securityGroups: [securityGroup],
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
        securityGroups: [securityGroup],
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
