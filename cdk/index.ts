import { CfnJobDefinition, ComputeEnvironment, ComputeResourceType, JobDefinition, JobQueue } from "@aws-cdk/aws-batch";
import { EbsDeviceVolumeType, LaunchTemplate, Peer, Port, SecurityGroup, SubnetType, Vpc } from "@aws-cdk/aws-ec2";
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

    // Role to grant access to the secret manager which we create below
    // This role is used to start the container and inject
    // all secrets. Per defat a role is created that has access to pul the 
    // container etc but because we also want to inject secrets as env 
    // variables we create this role ourselves. 
    const taskExecutionRole = new Role(this, "taskExecutionRole", {
      assumedBy: new ServicePrincipal('ecs-tasks.amazonaws.com'),
    })

    // Needs access to cloudwatch logs, otherwise we cannot see the logs of this task
    taskExecutionRole.addToPolicy(new PolicyStatement({
      effect: Effect.ALLOW,
      resources: ['*'],
      actions: ['logs:CreateLogStream', 'logs:PutLogEvents'],
    }));

    // Access to pull the docker image
    repo.grantPull(taskExecutionRole)

    // Secret manager that can store secets later whcih we access in the job via environment variables
    const secret = new Secret(this, 'MySecrets', {
      generateSecretString: {
        secretStringTemplate: JSON.stringify({}),
        generateStringKey: 'MY_SECRET'
      },
    });

    // and grant access to this secret manager.
    secret.grantRead(taskExecutionRole);

    // The job definition for the container
    // which gets run from the image at scale
    const jobDef = new JobDefinition(this, "JobDefinition", {
      jobDefinitionName: "MyTask",
      container: {
        image: new EcrImage(repo, "latest"),
        memoryLimitMiB: 512,
        readOnly: true,
        vcpus: 1,
        command: ["/usr/src/app/main.sh", "Ref::MyParam"],
      },
      parameters: {
        "MyParam": "",
      },
      timeout: Duration.minutes(10),
    });

    // Secrets are not yet supported in the high-level JobDefinition
    //  - https://github.com/aws/aws-cdk/issues/10976
    //  - https://docs.aws.amazon.com/cdk/api/latest/docs/@aws-cdk_aws-batch.CfnJobDefinition.ContainerPropertiesProperty.html#secrets
    // So we hack it:
    const cfnJobDef = jobDef.node.defaultChild as CfnJobDefinition;
    const cfnContainerProps = cfnJobDef.containerProperties as CfnJobDefinition.ContainerPropertiesProperty;
    (cfnContainerProps as any).secrets = [
      { name: "MY_SECRET", valueFrom: secret.secretArn.concat(':MY_SECRET::') },
    ];

    // Setting the execution role which the job needs for secrets manager access etc is not supported either but we can apply the same hack.
    const cfnTaskExecutionRole = taskExecutionRole.node.defaultChild as CfnRole
    (cfnContainerProps as any).executionRoleArn = cfnTaskExecutionRole.attrArn;

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

    // By default: allow no inbound, all outbound
    const securityGroup = new SecurityGroup(this, "BatchStackStarterSecurityGroup", {
      vpc: vpc,
      securityGroupName: "BatchStackStarterSecurityGroup",
    });

    // we only neeed to define inbound rules, outbound is allowed per default
    securityGroup.addIngressRule(Peer.anyIpv4(), Port.tcp(22), 'SSH frm anywhere');

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
