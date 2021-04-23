import { CfnJobDefinition, ComputeEnvironment, ComputeResourceType, JobDefinition, JobQueue } from "@aws-cdk/aws-batch";
import { EbsDeviceVolumeType, LaunchTemplate, SecurityGroup, SubnetType, Vpc } from "@aws-cdk/aws-ec2";
import { Repository } from "@aws-cdk/aws-ecr";
import { EcrImage } from "@aws-cdk/aws-ecs";
import { CfnRole, Effect, PolicyStatement, Role, ServicePrincipal } from "@aws-cdk/aws-iam";
import { Secret } from "@aws-cdk/aws-secretsmanager";
import { App, Duration, RemovalPolicy, Stack, StackProps } from "@aws-cdk/core";


class BatchStack extends Stack {
  constructor(scope: App, id: string, props?: StackProps) {
    super(scope, id, props)

    // The ECR container image registry to run
    // the batch job containers from at scale

    const repo = new Repository(this, "Repo", {
      repositoryName: "robofarm/aws-batch-starter",
      lifecycleRules: [{ maxImageCount: 5 }],
      removalPolicy: RemovalPolicy.DESTROY,
    });

    // Role for the task, with permissions to
    //  - write cloudwatch logs
    //  - pull the docker image from ECR
    //  - access the secret manager's secret for this task

    const taskExecutionRole = new Role(this, "taskExecutionRole", {
      assumedBy: new ServicePrincipal("ecs-tasks.amazonaws.com"),
    })

    taskExecutionRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      resources: ["*"],
      actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
    }));

    repo.grantPull(taskExecutionRole)

    // Secretmanager to store secrets for the task
    // which the container gets injected as env vars

    const secret = new Secret(this, 'MySecrets', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: "MY_SECRET",
      },
    });

    secret.grantRead(taskExecutionRole);

    // The job definition for the container
    // which runs the docker container at scale

    const jobDef = new JobDefinition(this, "JobDefinition", {
      jobDefinitionName: "MyTask",
      container: {
        image: new EcrImage(repo, "latest"),  // you might want to version this
        memoryLimitMiB: 512,  // reserved memory per task
        vcpus: 1,  // reserved vcpus per task
        readOnly: false,
        command: ["/usr/src/app/main.sh", "Ref::MyParam"],  // the command to run in the container
      },
      parameters: {
        "MyParam": "",
      },
      timeout: Duration.minutes(10), // timeout per task
    });

    // Secrets are not yet supported in the high-level JobDefinition
    //  - https://github.com/aws/aws-cdk/issues/10976
    //  - https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-batch.CfnJobDefinition.ContainerPropertiesProperty.html#secrets

    const cfnJobDef = jobDef.node.defaultChild as CfnJobDefinition;
    const cfnContainerProps = cfnJobDef.containerProperties as CfnJobDefinition.ContainerPropertiesProperty;
    (cfnContainerProps as any).secrets = [
      { name: "MY_SECRET", valueFrom: secret.secretArn.concat(":MY_SECRET::") },
    ];

    const cfnTaskExecutionRole = taskExecutionRole.node.defaultChild as CfnRole
    (cfnContainerProps as any).executionRoleArn = cfnTaskExecutionRole.attrArn;

    // The default VPC or a new VPC to run the instances in

    const vpc = Vpc.fromLookup(this, "VPC", {
      isDefault: true,
    });

    // By default: allow no inbound, all outbound

    const securityGroup = new SecurityGroup(this, "BatchStackStarterSecurityGroup", {
      vpc: vpc,
      securityGroupName: "BatchStackStarterSecurityGroup",
    });

    // Use a custom launch template to attach more
    // disk space to instances; in case the tasks
    // need more scratch space on the instances.

    const LAUNCH_TEMPLATE_NAME = "increase-volume-size";

    const launchTemplate = new LaunchTemplate(this, "LaunchTemplate", {
      launchTemplateName: LAUNCH_TEMPLATE_NAME,
      blockDevices: [
        {
          deviceName: "/dev/xvda", // for Amazon Linux 2 (default)
          volume: {
            ebsDevice: {
              volumeType: EbsDeviceVolumeType.GP2,
              volumeSize: 100,  // 100 GiB scratch space per instances
            },
          },
        },
      ],
    });

    // Compute environments with different
    // - price points
    // - max cluster size
    // The idea is to scale out wider when spot market is
    // cheap while still having a baseline always running.

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
        maxvCpus: 8, // custer size for the scale out environment
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
        maxvCpus: 1, // cluster size for the baseline environment
        vpc: vpc,
        securityGroups: [securityGroup],
        launchTemplate: {
          launchTemplateName: LAUNCH_TEMPLATE_NAME,
        },
      },
    });

    // The batch queue, distributing jobs
    // onto different compute environments
    // based on their capacity and order.

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

// TODO: set your account number here before deployment
const env = { account: undefined, region: "eu-central-1" };
const app = new App();

new BatchStack(app, "BatchStarterStack", { env: env });

app.synth();
