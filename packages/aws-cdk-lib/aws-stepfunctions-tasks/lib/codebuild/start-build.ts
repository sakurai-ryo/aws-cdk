import { Construct } from 'constructs';
import * as codebuild from '../../../aws-codebuild';
import * as iam from '../../../aws-iam';
import * as sfn from '../../../aws-stepfunctions';
import * as cdk from '../../../core';
import { integrationResourceArn, validatePatternSupported } from '../private/task-utils';

interface CodeBuildStartBuildOptions {
  /**
   * CodeBuild project to start
   */
  readonly project: codebuild.IProject;
  /**
   * A set of environment variables to be used for this build only.
   *
   * @default - the latest environment variables already defined in the build project.
   */
  readonly environmentVariablesOverride?: { [name: string]: codebuild.BuildEnvironmentVariable };
}

/**
 * Properties for CodeBuildStartBuild using JSONPath
 */
export interface CodeBuildStartBuildJsonPathProps extends sfn.TaskStateJsonPathBaseProps, CodeBuildStartBuildOptions {}

/**
 * Properties for CodeBuildStartBuild using JSONata
 */
export interface CodeBuildStartBuildJsonataProps extends sfn.TaskStateJsonataBaseProps, CodeBuildStartBuildOptions {}

/**
 * Properties for CodeBuildStartBuild
 */
export interface CodeBuildStartBuildProps extends sfn.TaskStateBaseProps, CodeBuildStartBuildOptions {}

/**
 * Start a CodeBuild Build as a task
 *
 * @see https://docs.aws.amazon.com/step-functions/latest/dg/connect-codebuild.html
 */
export class CodeBuildStartBuild extends sfn.TaskStateBase {
  /**
   * Start a CodeBuild Build as a task using JSONPath
   */
  public static jsonPath(scope: Construct, id: string, props: CodeBuildStartBuildJsonPathProps) {
    return new CodeBuildStartBuild(scope, id, props);
  }

  /**
   * Start a CodeBuild Build as a task using JSONata
   */
  public static jsonata(scope: Construct, id: string, props: CodeBuildStartBuildJsonataProps) {
    return new CodeBuildStartBuild(scope, id, { ...props, queryLanguage: sfn.QueryLanguage.JSONATA });
  }

  private static readonly SUPPORTED_INTEGRATION_PATTERNS: sfn.IntegrationPattern[] = [
    sfn.IntegrationPattern.REQUEST_RESPONSE,
    sfn.IntegrationPattern.RUN_JOB,
  ];

  protected readonly taskMetrics?: sfn.TaskMetricsConfig;
  protected readonly taskPolicies?: iam.PolicyStatement[];

  private readonly integrationPattern: sfn.IntegrationPattern;

  constructor(scope: Construct, id: string, private readonly props: CodeBuildStartBuildProps) {
    super(scope, id, props);
    this.integrationPattern = props.integrationPattern ?? sfn.IntegrationPattern.REQUEST_RESPONSE;

    validatePatternSupported(this.integrationPattern, CodeBuildStartBuild.SUPPORTED_INTEGRATION_PATTERNS);

    this.taskMetrics = {
      metricPrefixSingular: 'CodeBuildProject',
      metricPrefixPlural: 'CodeBuildProjects',
      metricDimensions: {
        ProjectArn: this.props.project.projectArn,
      },
    };

    this.taskPolicies = this.configurePolicyStatements();
  }

  private configurePolicyStatements(): iam.PolicyStatement[] {
    let policyStatements = [
      new iam.PolicyStatement({
        resources: [this.props.project.projectArn],
        actions: [
          'codebuild:StartBuild',
          'codebuild:StopBuild',
          'codebuild:BatchGetBuilds',
          'codebuild:BatchGetReports',
        ],
      }),
    ];

    if (this.integrationPattern === sfn.IntegrationPattern.RUN_JOB) {
      policyStatements.push(
        new iam.PolicyStatement({
          actions: ['events:PutTargets', 'events:PutRule', 'events:DescribeRule'],
          resources: [
            cdk.Stack.of(this).formatArn({
              service: 'events',
              resource: 'rule/StepFunctionsGetEventForCodeBuildStartBuildRule',
            }),
          ],
        }),
      );
    }

    return policyStatements;
  }

  /**
   * Provides the CodeBuild StartBuild service integration task configuration
   */
  /**
   * @internal
   */
  protected _renderTask(topLevelQueryLanguage?: sfn.QueryLanguage): any {
    const queryLanguage = sfn._getActualQueryLanguage(topLevelQueryLanguage, this.props.queryLanguage);
    return {
      Resource: integrationResourceArn('codebuild', 'startBuild', this.integrationPattern),
      ...this._renderParametersOrArguments({
        ProjectName: this.props.project.projectName,
        EnvironmentVariablesOverride: this.props.environmentVariablesOverride
          ? this.serializeEnvVariables(this.props.environmentVariablesOverride)
          : undefined,
      }, queryLanguage),
    };
  }

  private serializeEnvVariables(environmentVariables: { [name: string]: codebuild.BuildEnvironmentVariable }) {
    return Object.keys(environmentVariables).map(name => ({
      Name: name,
      Type: environmentVariables[name].type || codebuild.BuildEnvironmentVariableType.PLAINTEXT,
      Value: environmentVariables[name].value,
    }));
  }
}
