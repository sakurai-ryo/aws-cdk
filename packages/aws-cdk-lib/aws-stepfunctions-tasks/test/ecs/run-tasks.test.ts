import { Template } from '../../../assertions';
import * as autoscaling from '../../../aws-autoscaling';
import * as ec2 from '../../../aws-ec2';
import * as ecs from '../../../aws-ecs';
import * as sfn from '../../../aws-stepfunctions';
import { Stack } from '../../../core';
import * as tasks from '../../lib';

let stack: Stack;
let vpc: ec2.Vpc;
let cluster: ecs.Cluster;

/* eslint-disable quote-props */

beforeEach(() => {
  // GIVEN
  stack = new Stack();
  vpc = new ec2.Vpc(stack, 'Vpc');
  cluster = new ecs.Cluster(stack, 'Cluster', { vpc });
  cluster.addAsgCapacityProvider(new ecs.AsgCapacityProvider(stack, 'Capacity', {
    autoScalingGroup: new autoscaling.AutoScalingGroup(stack, 'ASG', {
      vpc,
      instanceType: new ec2.InstanceType('t3.medium'),
      machineImage: ec2.MachineImage.latestAmazonLinux(),
    }),
  }));
});

test('Cannot create a Fargate task with a fargate-incompatible task definition', () => {
  const taskDefinition = new ecs.TaskDefinition(stack, 'TD', {
    memoryMiB: '512',
    cpu: '256',
    compatibility: ecs.Compatibility.EC2,
  });
  taskDefinition.addContainer('TheContainer', {
    image: ecs.ContainerImage.fromRegistry('foo/bar'),
    memoryLimitMiB: 256,
  });

  expect(() =>
    new tasks.EcsRunTask(stack, 'task', { cluster, taskDefinition, launchTarget: new tasks.EcsFargateLaunchTarget() }).toStateJson(),
  ).toThrow(/Supplied TaskDefinition is not compatible with Fargate/);
});

test('Cannot create a Fargate task without a default container', () => {
  const taskDefinition = new ecs.TaskDefinition(stack, 'TD', {
    memoryMiB: '512',
    cpu: '256',
    compatibility: ecs.Compatibility.FARGATE,
  });
  expect(() =>
    new tasks.EcsRunTask(stack, 'task', { cluster, taskDefinition, launchTarget: new tasks.EcsFargateLaunchTarget() }).toStateJson(),
  ).toThrow(/must have at least one essential container/);
});

test('Cannot override container definitions when container is not in task definition', () => {
  const taskDefinitionA = new ecs.TaskDefinition(stack, 'TaskDefinitionA', {
    memoryMiB: '512',
    cpu: '256',
    compatibility: ecs.Compatibility.FARGATE,
  });
  taskDefinitionA.addContainer('TheContainerA', {
    image: ecs.ContainerImage.fromRegistry('foo/bar'),
    memoryLimitMiB: 256,
  });

  const taskDefinitionB = new ecs.TaskDefinition(stack, 'TaskDefinitionB', {
    memoryMiB: '512',
    cpu: '256',
    compatibility: ecs.Compatibility.FARGATE,
  });
  const containerDefinitionB = taskDefinitionB.addContainer('TheContainerB', {
    image: ecs.ContainerImage.fromRegistry('foo/bar'),
    memoryLimitMiB: 256,
  });

  expect(() =>
    new tasks.EcsRunTask(stack, 'task', {
      cluster,
      taskDefinition: taskDefinitionA,
      containerOverrides: [
        {
          containerDefinition: containerDefinitionB,
          environment: [{ name: 'SOME_KEY', value: sfn.JsonPath.stringAt('$.SomeKey') }],
        },
      ],
      launchTarget: new tasks.EcsFargateLaunchTarget(),
    }).toStateJson(),
  ).toThrow(/no such container in task definition/);
});

test('Running a task with container override and container has explicitly set a container name', () => {
  const taskDefinition = new ecs.TaskDefinition(stack, 'TD', {
    memoryMiB: '512',
    cpu: '256',
    compatibility: ecs.Compatibility.FARGATE,
  });
  const containerDefinition = taskDefinition.addContainer('TheContainer', {
    containerName: 'ExplicitContainerName',
    image: ecs.ContainerImage.fromRegistry('foo/bar'),
    memoryLimitMiB: 256,
  });

  expect(stack.resolve(
    new tasks.EcsRunTask(stack, 'task', {
      cluster,
      taskDefinition,
      containerOverrides: [
        {
          containerDefinition,
          environment: [{ name: 'SOME_KEY', value: sfn.JsonPath.stringAt('$.SomeKey') }],
        },
      ],
      launchTarget: new tasks.EcsFargateLaunchTarget(),
    }).toStateJson()))
    .toHaveProperty('Parameters.Overrides',
      {
        ContainerOverrides: [
          {
            Environment: [
              {
                Name: 'SOME_KEY',
                'Value.$': '$.SomeKey',
              },
            ],
            Name: 'ExplicitContainerName',
          },
        ],
      });
});

test('Running a task without propagated tag source', () => {
  const taskDefinition = new ecs.TaskDefinition(stack, 'TD', {
    memoryMiB: '512',
    cpu: '256',
    compatibility: ecs.Compatibility.FARGATE,
  });
  const containerDefinition = taskDefinition.addContainer('TheContainer', {
    containerName: 'ExplicitContainerName',
    image: ecs.ContainerImage.fromRegistry('foo/bar'),
    memoryLimitMiB: 256,
  });

  expect(stack.resolve(
    new tasks.EcsRunTask(stack, 'task', {
      cluster,
      taskDefinition,
      containerOverrides: [
        {
          containerDefinition,
          environment: [{ name: 'SOME_KEY', value: sfn.JsonPath.stringAt('$.SomeKey') }],
        },
      ],
      launchTarget: new tasks.EcsFargateLaunchTarget(),
    }).toStateJson())).not.toContain('Parameters.PropagateTags');
});

test('Running a task with TASK_DEFINITION as propagated tag source', () => {
  const taskDefinition = new ecs.TaskDefinition(stack, 'TD', {
    memoryMiB: '512',
    cpu: '256',
    compatibility: ecs.Compatibility.FARGATE,
  });
  const containerDefinition = taskDefinition.addContainer('TheContainer', {
    containerName: 'ExplicitContainerName',
    image: ecs.ContainerImage.fromRegistry('foo/bar'),
    memoryLimitMiB: 256,
  });

  expect(stack.resolve(
    new tasks.EcsRunTask(stack, 'task', {
      cluster,
      taskDefinition,
      containerOverrides: [
        {
          containerDefinition,
          environment: [{ name: 'SOME_KEY', value: sfn.JsonPath.stringAt('$.SomeKey') }],
        },
      ],
      launchTarget: new tasks.EcsFargateLaunchTarget(),
      propagatedTagSource: ecs.PropagatedTagSource.TASK_DEFINITION,
    }).toStateJson())).toHaveProperty('Parameters.PropagateTags', 'TASK_DEFINITION');
});

test('Running a task with NONE as propagated tag source', () => {
  const taskDefinition = new ecs.TaskDefinition(stack, 'TD', {
    memoryMiB: '512',
    cpu: '256',
    compatibility: ecs.Compatibility.FARGATE,
  });
  const containerDefinition = taskDefinition.addContainer('TheContainer', {
    containerName: 'ExplicitContainerName',
    image: ecs.ContainerImage.fromRegistry('foo/bar'),
    memoryLimitMiB: 256,
  });

  expect(stack.resolve(
    new tasks.EcsRunTask(stack, 'task', {
      cluster,
      taskDefinition,
      containerOverrides: [
        {
          containerDefinition,
          environment: [{ name: 'SOME_KEY', value: sfn.JsonPath.stringAt('$.SomeKey') }],
        },
      ],
      launchTarget: new tasks.EcsFargateLaunchTarget(),
      propagatedTagSource: ecs.PropagatedTagSource.NONE,
    }).toStateJson())).toHaveProperty('Parameters.PropagateTags', 'NONE');
});

test('Running a task with cpu parameter', () => {
  const taskDefinition = new ecs.TaskDefinition(stack, 'TD', {
    memoryMiB: '1024',
    cpu: '512',
    compatibility: ecs.Compatibility.FARGATE,
  });
  const containerDefinition = taskDefinition.addContainer('TheContainer', {
    containerName: 'ExplicitContainerName',
    image: ecs.ContainerImage.fromRegistry('foo/bar'),
    memoryLimitMiB: 256,
  });

  expect(stack.resolve(
    new tasks.EcsRunTask(stack, 'task', {
      cluster,
      taskDefinition,
      cpu: '1024',
      containerOverrides: [
        {
          containerDefinition,
          environment: [{ name: 'SOME_KEY', value: sfn.JsonPath.stringAt('$.SomeKey') }],
        },
      ],
      launchTarget: new tasks.EcsFargateLaunchTarget(),
    }).toStateJson())).toHaveProperty('Parameters.Overrides.Cpu', '1024');
});

test('Running a task with memory parameter', () => {
  const taskDefinition = new ecs.TaskDefinition(stack, 'TD', {
    memoryMiB: '1024',
    cpu: '512',
    compatibility: ecs.Compatibility.FARGATE,
  });
  const containerDefinition = taskDefinition.addContainer('TheContainer', {
    containerName: 'ExplicitContainerName',
    image: ecs.ContainerImage.fromRegistry('foo/bar'),
    memoryLimitMiB: 256,
  });

  expect(stack.resolve(
    new tasks.EcsRunTask(stack, 'task', {
      cluster,
      taskDefinition,
      memoryMiB: '2048',
      containerOverrides: [
        {
          containerDefinition,
          environment: [{ name: 'SOME_KEY', value: sfn.JsonPath.stringAt('$.SomeKey') }],
        },
      ],
      launchTarget: new tasks.EcsFargateLaunchTarget(),
    }).toStateJson())).toHaveProperty('Parameters.Overrides.Memory', '2048');
});

test('Running a Fargate Task', () => {
  const taskDefinition = new ecs.TaskDefinition(stack, 'TD', {
    memoryMiB: '512',
    cpu: '256',
    compatibility: ecs.Compatibility.FARGATE,
  });
  const containerDefinition = taskDefinition.addContainer('TheContainer', {
    image: ecs.ContainerImage.fromRegistry('foo/bar'),
    memoryLimitMiB: 256,
  });

  // WHEN
  const runTask = new tasks.EcsRunTask(stack, 'RunFargate', {
    integrationPattern: sfn.IntegrationPattern.RUN_JOB,
    cluster,
    taskDefinition,
    containerOverrides: [
      {
        containerDefinition,
        environment: [{ name: 'SOME_KEY', value: sfn.JsonPath.stringAt('$.SomeKey') }],
      },
    ],
    launchTarget: new tasks.EcsFargateLaunchTarget({
      platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
    }),
  });

  new sfn.StateMachine(stack, 'SM', {
    definitionBody: sfn.DefinitionBody.fromChainable(runTask),
  });

  // THEN
  expect(stack.resolve(runTask.toStateJson())).toEqual({
    End: true,
    Parameters: {
      Cluster: { 'Fn::GetAtt': ['ClusterEB0386A7', 'Arn'] },
      LaunchType: 'FARGATE',
      NetworkConfiguration: {
        AwsvpcConfiguration: {
          SecurityGroups: [{ 'Fn::GetAtt': ['RunFargateSecurityGroup709740F2', 'GroupId'] }],
          Subnets: [{ Ref: 'VpcPrivateSubnet1Subnet536B997A' }, { Ref: 'VpcPrivateSubnet2Subnet3788AAA1' }],
        },
      },
      PlatformVersion: '1.4.0',
      TaskDefinition: 'TD',
      Overrides: {
        ContainerOverrides: [
          {
            Environment: [
              {
                Name: 'SOME_KEY',
                'Value.$': '$.SomeKey',
              },
            ],
            Name: 'TheContainer',
          },
        ],
      },
    },
    Resource: {
      'Fn::Join': [
        '',
        [
          'arn:',
          {
            Ref: 'AWS::Partition',
          },
          ':states:::ecs:runTask.sync',
        ],
      ],
    },
    Type: 'Task',
  });

  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {
          Action: 'ecs:RunTask',
          Effect: 'Allow',
          Resource: {
            'Fn::Join': [
              '',
              [
                'arn:',
                { 'Fn::Select': [1, { 'Fn::Split': [':', { 'Ref': 'TD49C78F36' }] }] },
                ':',
                { 'Fn::Select': [2, { 'Fn::Split': [':', { 'Ref': 'TD49C78F36' }] }] },
                ':',
                { 'Fn::Select': [3, { 'Fn::Split': [':', { 'Ref': 'TD49C78F36' }] }] },
                ':',
                { 'Fn::Select': [4, { 'Fn::Split': [':', { 'Ref': 'TD49C78F36' }] }] },
                ':',
                { 'Fn::Select': [0, { 'Fn::Split': ['/', { 'Fn::Select': [5, { 'Fn::Split': [':', { 'Ref': 'TD49C78F36' }] }] }] }] },
                '/',
                { 'Fn::Select': [1, { 'Fn::Split': ['/', { 'Fn::Select': [5, { 'Fn::Split': [':', { 'Ref': 'TD49C78F36' }] }] }] }] },
                ':*',
              ],
            ],
          },
        },
        {
          Action: ['ecs:StopTask', 'ecs:DescribeTasks'],
          Effect: 'Allow',
          Resource: '*',
        },
        {
          Action: 'iam:PassRole',
          Effect: 'Allow',
          Resource: { 'Fn::GetAtt': ['TDTaskRoleC497AFFC', 'Arn'] },
        },
        {
          Action: ['events:PutTargets', 'events:PutRule', 'events:DescribeRule'],
          Effect: 'Allow',
          Resource: {
            'Fn::Join': [
              '',
              [
                'arn:',
                { Ref: 'AWS::Partition' },
                ':events:',
                { Ref: 'AWS::Region' },
                ':',
                { Ref: 'AWS::AccountId' },
                ':rule/StepFunctionsGetEventsForECSTaskRule',
              ],
            ],
          },
        },
      ],
    },
  });
});

test('Running a Fargate Task - using JSONata', () => {
  const taskDefinition = new ecs.TaskDefinition(stack, 'TD', {
    memoryMiB: '512',
    cpu: '256',
    compatibility: ecs.Compatibility.FARGATE,
  });
  const containerDefinition = taskDefinition.addContainer('TheContainer', {
    image: ecs.ContainerImage.fromRegistry('foo/bar'),
    memoryLimitMiB: 256,
  });

  // WHEN
  const runTask = tasks.EcsRunTask.jsonata(stack, 'RunFargate', {
    integrationPattern: sfn.IntegrationPattern.RUN_JOB,
    cluster,
    taskDefinition,
    containerOverrides: [
      {
        containerDefinition,
        environment: [{ name: 'SOME_KEY', value: '{% $SomeKey %}' }],
      },
    ],
    launchTarget: new tasks.EcsFargateLaunchTarget({
      platformVersion: ecs.FargatePlatformVersion.VERSION1_4,
    }),
  });

  new sfn.StateMachine(stack, 'SM', {
    definitionBody: sfn.DefinitionBody.fromChainable(runTask),
  });

  // THEN
  expect(stack.resolve(runTask.toStateJson())).toEqual({
    End: true,
    QueryLanguage: 'JSONata',
    Arguments: {
      Cluster: { 'Fn::GetAtt': ['ClusterEB0386A7', 'Arn'] },
      LaunchType: 'FARGATE',
      NetworkConfiguration: {
        AwsvpcConfiguration: {
          SecurityGroups: [{ 'Fn::GetAtt': ['RunFargateSecurityGroup709740F2', 'GroupId'] }],
          Subnets: [{ Ref: 'VpcPrivateSubnet1Subnet536B997A' }, { Ref: 'VpcPrivateSubnet2Subnet3788AAA1' }],
        },
      },
      PlatformVersion: '1.4.0',
      TaskDefinition: 'TD',
      Overrides: {
        ContainerOverrides: [
          {
            Environment: [
              {
                Name: 'SOME_KEY',
                'Value': '{% $SomeKey %}',
              },
            ],
            Name: 'TheContainer',
          },
        ],
      },
    },
    Resource: {
      'Fn::Join': [
        '',
        [
          'arn:',
          {
            Ref: 'AWS::Partition',
          },
          ':states:::ecs:runTask.sync',
        ],
      ],
    },
    Type: 'Task',
  });
});

test('Running an EC2 Task with bridge network', () => {
  const taskDefinition = new ecs.TaskDefinition(stack, 'TD', {
    compatibility: ecs.Compatibility.EC2,
  });
  const containerDefinition = taskDefinition.addContainer('TheContainer', {
    image: ecs.ContainerImage.fromRegistry('foo/bar'),
    memoryLimitMiB: 256,
  });

  // WHEN
  const runTask = new tasks.EcsRunTask(stack, 'Run', {
    integrationPattern: sfn.IntegrationPattern.RUN_JOB,
    cluster,
    taskDefinition,
    containerOverrides: [
      {
        containerDefinition,
        environment: [{ name: 'SOME_KEY', value: sfn.JsonPath.stringAt('$.SomeKey') }],
      },
    ],
    launchTarget: new tasks.EcsEc2LaunchTarget(),
  });

  new sfn.StateMachine(stack, 'SM', {
    definitionBody: sfn.DefinitionBody.fromChainable(runTask),
  });

  // THEN
  expect(stack.resolve(runTask.toStateJson())).toEqual({
    End: true,
    Parameters: {
      Cluster: { 'Fn::GetAtt': ['ClusterEB0386A7', 'Arn'] },
      LaunchType: 'EC2',
      TaskDefinition: 'TD',
      Overrides: {
        ContainerOverrides: [
          {
            Environment: [
              {
                Name: 'SOME_KEY',
                'Value.$': '$.SomeKey',
              },
            ],
            Name: 'TheContainer',
          },
        ],
      },
    },
    Resource: {
      'Fn::Join': [
        '',
        [
          'arn:',
          {
            Ref: 'AWS::Partition',
          },
          ':states:::ecs:runTask.sync',
        ],
      ],
    },
    Type: 'Task',
  });

  Template.fromStack(stack).hasResourceProperties('AWS::IAM::Policy', {
    PolicyDocument: {
      Statement: [
        {
          Action: 'ecs:RunTask',
          Effect: 'Allow',
          Resource: {
            'Fn::Join': [
              '',
              [
                'arn:',
                { 'Fn::Select': [1, { 'Fn::Split': [':', { 'Ref': 'TD49C78F36' }] }] },
                ':',
                { 'Fn::Select': [2, { 'Fn::Split': [':', { 'Ref': 'TD49C78F36' }] }] },
                ':',
                { 'Fn::Select': [3, { 'Fn::Split': [':', { 'Ref': 'TD49C78F36' }] }] },
                ':',
                { 'Fn::Select': [4, { 'Fn::Split': [':', { 'Ref': 'TD49C78F36' }] }] },
                ':',
                { 'Fn::Select': [0, { 'Fn::Split': ['/', { 'Fn::Select': [5, { 'Fn::Split': [':', { 'Ref': 'TD49C78F36' }] }] }] }] },
                '/',
                { 'Fn::Select': [1, { 'Fn::Split': ['/', { 'Fn::Select': [5, { 'Fn::Split': [':', { 'Ref': 'TD49C78F36' }] }] }] }] },
                ':*',
              ],
            ],
          },
        },
        {
          Action: ['ecs:StopTask', 'ecs:DescribeTasks'],
          Effect: 'Allow',
          Resource: '*',
        },
        {
          Action: 'iam:PassRole',
          Effect: 'Allow',
          Resource: { 'Fn::GetAtt': ['TDTaskRoleC497AFFC', 'Arn'] },
        },
        {
          Action: ['events:PutTargets', 'events:PutRule', 'events:DescribeRule'],
          Effect: 'Allow',
          Resource: {
            'Fn::Join': [
              '',
              [
                'arn:',
                { Ref: 'AWS::Partition' },
                ':events:',
                { Ref: 'AWS::Region' },
                ':',
                { Ref: 'AWS::AccountId' },
                ':rule/StepFunctionsGetEventsForECSTaskRule',
              ],
            ],
          },
        },
      ],
    },
  });
});

test('Running an EC2 Task with placement strategies', () => {
  const taskDefinition = new ecs.TaskDefinition(stack, 'TD', {
    compatibility: ecs.Compatibility.EC2,
  });
  taskDefinition.addContainer('TheContainer', {
    image: ecs.ContainerImage.fromRegistry('foo/bar'),
    memoryLimitMiB: 256,
  });

  // WHEN
  const runTask = new tasks.EcsRunTask(stack, 'Run', {
    integrationPattern: sfn.IntegrationPattern.RUN_JOB,
    cluster,
    taskDefinition,
    launchTarget: new tasks.EcsEc2LaunchTarget({
      placementStrategies: [ecs.PlacementStrategy.spreadAcrossInstances(), ecs.PlacementStrategy.packedByCpu(), ecs.PlacementStrategy.randomly()],
      placementConstraints: [ecs.PlacementConstraint.memberOf('blieptuut')],
    }),
  });

  new sfn.StateMachine(stack, 'SM', {
    definitionBody: sfn.DefinitionBody.fromChainable(runTask),
  });

  // THEN
  expect(stack.resolve(runTask.toStateJson())).toEqual({
    End: true,
    Parameters: {
      Cluster: { 'Fn::GetAtt': ['ClusterEB0386A7', 'Arn'] },
      LaunchType: 'EC2',
      TaskDefinition: 'TD',
      PlacementConstraints: [{ Type: 'memberOf', Expression: 'blieptuut' }],
      PlacementStrategy: [{ Field: 'instanceId', Type: 'spread' }, { Field: 'CPU', Type: 'binpack' }, { Type: 'random' }],
    },
    Resource: {
      'Fn::Join': [
        '',
        [
          'arn:',
          {
            Ref: 'AWS::Partition',
          },
          ':states:::ecs:runTask.sync',
        ],
      ],
    },
    Type: 'Task',
  });
});

test('Running an EC2 Task with overridden number values', () => {
  const taskDefinition = new ecs.TaskDefinition(stack, 'TD', {
    compatibility: ecs.Compatibility.EC2,
  });
  const containerDefinition = taskDefinition.addContainer('TheContainer', {
    image: ecs.ContainerImage.fromRegistry('foo/bar'),
    memoryLimitMiB: 256,
  });

  // WHEN
  const runTask = new tasks.EcsRunTask(stack, 'Run', {
    integrationPattern: sfn.IntegrationPattern.RUN_JOB,
    cluster,
    taskDefinition,
    containerOverrides: [
      {
        containerDefinition,
        command: sfn.JsonPath.listAt('$.TheCommand'),
        cpu: 5,
        memoryLimit: sfn.JsonPath.numberAt('$.MemoryLimit'),
      },
    ],
    launchTarget: new tasks.EcsEc2LaunchTarget(),
  });

  // THEN
  expect(stack.resolve(runTask.toStateJson())).toEqual({
    End: true,
    Parameters: {
      Cluster: { 'Fn::GetAtt': ['ClusterEB0386A7', 'Arn'] },
      LaunchType: 'EC2',
      TaskDefinition: 'TD',
      Overrides: {
        ContainerOverrides: [
          {
            'Command.$': '$.TheCommand',
            Cpu: 5,
            'Memory.$': '$.MemoryLimit',
            Name: 'TheContainer',
          },
        ],
      },
    },
    Resource: {
      'Fn::Join': [
        '',
        [
          'arn:',
          {
            Ref: 'AWS::Partition',
          },
          ':states:::ecs:runTask.sync',
        ],
      ],
    },
    Type: 'Task',
  });
});

test('Cannot create a task with WAIT_FOR_TASK_TOKEN if no TaskToken provided', () => {
  const taskDefinition = new ecs.TaskDefinition(stack, 'TaskDefinition', {
    compatibility: ecs.Compatibility.EC2,
  });

  const containerDefinition = taskDefinition.addContainer('ContainerDefinition', {
    image: ecs.ContainerImage.fromRegistry('foo/bar'),
  });

  expect(() =>
    new tasks.EcsRunTask(stack, 'RunTask', {
      cluster,
      containerOverrides: [
        {
          containerDefinition,
          environment: [
            {
              name: 'Foo',
              value: 'Bar',
            },
          ],
        },
      ],
      integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
      launchTarget: new tasks.EcsEc2LaunchTarget(),
      taskDefinition,
    }),
  ).toThrow(/Task Token is required in at least one `containerOverrides.environment`/);
});

test('Running a task with WAIT_FOR_TASK_TOKEN and task token in environment', () => {
  const taskDefinition = new ecs.TaskDefinition(stack, 'TaskDefinition', {
    compatibility: ecs.Compatibility.EC2,
  });

  const primaryContainerDef = taskDefinition.addContainer('PrimaryContainerDef', {
    image: ecs.ContainerImage.fromRegistry('foo/primary'),
    essential: true,
  });

  const sidecarContainerDef = taskDefinition.addContainer('SideCarContainerDef', {
    image: ecs.ContainerImage.fromRegistry('foo/sidecar'),
    essential: false,
  });

  expect(() => new tasks.EcsRunTask(stack, 'RunTask', {
    cluster,
    containerOverrides: [
      {
        containerDefinition: primaryContainerDef,
        environment: [
          {
            name: 'Foo',
            value: 'Bar',
          },
        ],
      },
      {
        containerDefinition: sidecarContainerDef,
        environment: [
          {
            name: 'TaskToken.$',
            value: sfn.JsonPath.taskToken,
          },
        ],
      },
    ],
    integrationPattern: sfn.IntegrationPattern.WAIT_FOR_TASK_TOKEN,
    launchTarget: new tasks.EcsEc2LaunchTarget(),
    taskDefinition,
  })).not.toThrow();
});

test('Set revision number of ECS task definition family', () => {
  // When
  const taskDefinition = new ecs.TaskDefinition(stack, 'TD', {
    memoryMiB: '512',
    cpu: '256',
    compatibility: ecs.Compatibility.FARGATE,
  });
  taskDefinition.addContainer('TheContainer', {
    image: ecs.ContainerImage.fromRegistry('foo/bar'),
    memoryLimitMiB: 256,
  });
  const runTask = new tasks.EcsRunTask(stack, 'task', {
    cluster,
    taskDefinition: taskDefinition,
    revisionNumber: 1,
    launchTarget: new tasks.EcsFargateLaunchTarget(),
  });

  // Then
  expect(stack.resolve(runTask.toStateJson())).toEqual(
    {
      End: true,
      Parameters: {
        Cluster: {
          'Fn::GetAtt': [
            'ClusterEB0386A7',
            'Arn',
          ],
        },
        LaunchType: 'FARGATE',
        NetworkConfiguration: {
          AwsvpcConfiguration: {
            SecurityGroups: [
              {
                'Fn::GetAtt': [
                  'taskSecurityGroup28F0D539',
                  'GroupId',
                ],
              },
            ],
            Subnets: [
              {
                Ref: 'VpcPrivateSubnet1Subnet536B997A',
              },
              {
                Ref: 'VpcPrivateSubnet2Subnet3788AAA1',
              },
            ],
          },
        },
        TaskDefinition: 'TD:1',
      },
      Resource: {
        'Fn::Join': [
          '',
          [
            'arn:',
            {
              'Ref': 'AWS::Partition',
            },
            ':states:::ecs:runTask',
          ],
        ],
      },
      Type: 'Task',
    },
  );
});

test('set enableExecuteCommand', () => {
  const taskDefinition = new ecs.TaskDefinition(stack, 'TD', {
    compatibility: ecs.Compatibility.EC2,
  });
  taskDefinition.addContainer('TheContainer', {
    image: ecs.ContainerImage.fromRegistry('foo/bar'),
    memoryLimitMiB: 256,
  });

  // WHEN
  const runTask = new tasks.EcsRunTask(stack, 'Run', {
    integrationPattern: sfn.IntegrationPattern.RUN_JOB,
    launchTarget: new tasks.EcsEc2LaunchTarget(),
    cluster,
    taskDefinition,
    enableExecuteCommand: true,
  });

  new sfn.StateMachine(stack, 'SM', {
    definitionBody: sfn.DefinitionBody.fromChainable(runTask),
  });

  // THEN
  expect(stack.resolve(runTask.toStateJson())).toEqual({
    End: true,
    Parameters: {
      Cluster: { 'Fn::GetAtt': ['ClusterEB0386A7', 'Arn'] },
      LaunchType: 'EC2',
      TaskDefinition: 'TD',
      EnableExecuteCommand: true,
    },
    Resource: {
      'Fn::Join': [
        '',
        [
          'arn:',
          {
            Ref: 'AWS::Partition',
          },
          ':states:::ecs:runTask.sync',
        ],
      ],
    },
    Type: 'Task',
  });
});
