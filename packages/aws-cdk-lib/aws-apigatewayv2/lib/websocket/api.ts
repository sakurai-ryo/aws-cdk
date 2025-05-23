import { Construct } from 'constructs';
import { WebSocketRoute, WebSocketRouteOptions } from './route';
import { CfnApi } from '.././index';
import { Grant, IGrantable } from '../../../aws-iam';
import { ArnFormat, Stack, Token } from '../../../core';
import { UnscopedValidationError, ValidationError } from '../../../core/lib/errors';
import { addConstructMetadata, MethodMetadata } from '../../../core/lib/metadata-resource';
import { IApi, IpAddressType } from '../common/api';
import { ApiBase } from '../common/base';

/**
 * Represents a WebSocket API
 */
export interface IWebSocketApi extends IApi {
}

/**
 * Represents the currently available API Key Selection Expressions
 */
export class WebSocketApiKeySelectionExpression {
  /**
   * The API will extract the key value from the `x-api-key` header in the user request.
   */
  public static readonly HEADER_X_API_KEY = new WebSocketApiKeySelectionExpression('$request.header.x-api-key');

  /**
   * The API will extract the key value from the `usageIdentifierKey` attribute in the `context` map,
   * returned by the Lambda Authorizer.
   * See https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-lambda-authorizer-output.html
   */
  public static readonly AUTHORIZER_USAGE_IDENTIFIER_KEY = new WebSocketApiKeySelectionExpression('$context.authorizer.usageIdentifierKey');

  /**
   * @param customApiKeySelector The expression used by API Gateway
   */
  public constructor(public readonly customApiKeySelector: string) {}
}

/**
 * Props for WebSocket API
 */
export interface WebSocketApiProps {
  /**
   * Name for the WebSocket API resource
   * @default - id of the WebSocketApi construct.
   */
  readonly apiName?: string;

  /**
   * An API key selection expression. Providing this option will require an API Key be provided to access the API.
   * @default - Key is not required to access these APIs
   */
  readonly apiKeySelectionExpression?: WebSocketApiKeySelectionExpression;

  /**
   * The description of the API.
   * @default - none
   */
  readonly description?: string;

  /**
   * The route selection expression for the API
   * @default '$request.body.action'
   */
  readonly routeSelectionExpression?: string;

  /**
   * Options to configure a '$connect' route
   *
   * @default - no '$connect' route configured
   */
  readonly connectRouteOptions?: WebSocketRouteOptions;

  /**
   * Options to configure a '$disconnect' route
   *
   * @default - no '$disconnect' route configured
   */
  readonly disconnectRouteOptions?: WebSocketRouteOptions;

  /**
   * Options to configure a '$default' route
   *
   * @default - no '$default' route configured
   */
  readonly defaultRouteOptions?: WebSocketRouteOptions;

  /**
   * The IP address types that can invoke the API.
   *
   * @see https://docs.aws.amazon.com/apigateway/latest/developerguide/http-api-ip-address-type.html
   *
   * @default undefined - AWS default is IPV4
   */
  readonly ipAddressType?: IpAddressType;
}

/**
 * Attributes for importing a WebSocketApi into the CDK
 */
export interface WebSocketApiAttributes {
  /**
   * The identifier of the WebSocketApi
   */
  readonly webSocketId: string;

  /**
   * The endpoint URL of the WebSocketApi
   * @default - throw san error if apiEndpoint is accessed.
   */
  readonly apiEndpoint?: string;
}

/**
 * Create a new API Gateway WebSocket API endpoint.
 * @resource AWS::ApiGatewayV2::Api
 */
export class WebSocketApi extends ApiBase implements IWebSocketApi {
  /**
   * Import an existing WebSocket API into this CDK app.
   */
  public static fromWebSocketApiAttributes(scope: Construct, id: string, attrs: WebSocketApiAttributes): IWebSocketApi {
    class Import extends ApiBase {
      public readonly apiId = attrs.webSocketId;
      public readonly websocketApiId = attrs.webSocketId;
      private readonly _apiEndpoint = attrs.apiEndpoint;

      public get apiEndpoint(): string {
        if (!this._apiEndpoint) {
          throw new ValidationError('apiEndpoint is not configured on the imported WebSocketApi.', scope);
        }
        return this._apiEndpoint;
      }
    }
    return new Import(scope, id);
  }

  public readonly apiId: string;
  public readonly apiEndpoint: string;

  /**
   * A human friendly name for this WebSocket API. Note that this is different from `webSocketApiId`.
   */
  public readonly webSocketApiName?: string;

  constructor(scope: Construct, id: string, props?: WebSocketApiProps) {
    super(scope, id);
    // Enhanced CDK Analytics Telemetry
    addConstructMetadata(this, props);

    this.webSocketApiName = props?.apiName ?? id;

    const resource = new CfnApi(this, 'Resource', {
      name: this.webSocketApiName,
      apiKeySelectionExpression: props?.apiKeySelectionExpression?.customApiKeySelector,
      protocolType: 'WEBSOCKET',
      description: props?.description,
      routeSelectionExpression: props?.routeSelectionExpression ?? '$request.body.action',
      ipAddressType: props?.ipAddressType,
    });
    this.apiId = resource.ref;
    this.apiEndpoint = resource.attrApiEndpoint;

    if (props?.connectRouteOptions) {
      this.addRoute('$connect', props.connectRouteOptions);
    }
    if (props?.disconnectRouteOptions) {
      this.addRoute('$disconnect', props.disconnectRouteOptions);
    }
    if (props?.defaultRouteOptions) {
      this.addRoute('$default', props.defaultRouteOptions);
    }
  }

  /**
   * Add a new route
   */
  @MethodMetadata()
  public addRoute(routeKey: string, options: WebSocketRouteOptions) {
    return new WebSocketRoute(this, `${routeKey}-Route`, {
      webSocketApi: this,
      routeKey,
      ...options,
    });
  }

  /**
   * Grant access to the API Gateway management API for this WebSocket API to an IAM
   * principal (Role/Group/User).
   *
   * @param identity The principal
   */
  @MethodMetadata()
  public grantManageConnections(identity: IGrantable): Grant {
    const arn = Stack.of(this).formatArn({
      service: 'execute-api',
      resource: this.apiId,
    });

    return Grant.addToPrincipal({
      grantee: identity,
      actions: ['execute-api:ManageConnections'],
      resourceArns: [`${arn}/*/*/@connections/*`],
    });
  }

  /**
   * Get the "execute-api" ARN.
   *
   * @deprecated Use `arnForExecuteApiV2()` instead.
   */
  @MethodMetadata()
  public arnForExecuteApi(method?: string, path?: string, stage?: string): string {
    if (path && !Token.isUnresolved(path) && !path.startsWith('/')) {
      throw new UnscopedValidationError(`Path must start with '/': ${path}`);
    }

    if (method && method.toUpperCase() === 'ANY') {
      method = '*';
    }

    return Stack.of(this).formatArn({
      service: 'execute-api',
      resource: this.apiId,
      arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
      resourceName: `${stage ?? '*'}/${method ?? '*'}${path ?? '/*'}`,
    });
  }

  /**
   * Get the "execute-api" ARN.
   *
   * @default - The default behavior applies when no specific route, or stage is provided.
   * In this case, the ARN will cover all routes, and all stages of this API.
   * Specifically, if 'route' is not specified, it defaults to '*', representing all routes.
   * If 'stage' is not specified, it also defaults to '*', representing all stages.
   */
  @MethodMetadata()
  public arnForExecuteApiV2(route?: string, stage?: string): string {
    return Stack.of(this).formatArn({
      service: 'execute-api',
      resource: this.apiId,
      arnFormat: ArnFormat.SLASH_RESOURCE_NAME,
      resourceName: `${stage ?? '*'}/${route ?? '*'}`,
    });
  }
}
