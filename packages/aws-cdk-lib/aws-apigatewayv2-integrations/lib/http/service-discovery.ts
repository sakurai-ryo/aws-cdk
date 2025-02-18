import { HttpPrivateIntegrationOptions } from './base-types';
import { HttpPrivateIntegration } from './private/integration';
import { HttpRouteIntegrationBindOptions, HttpRouteIntegrationConfig } from '../../../aws-apigatewayv2';
import * as servicediscovery from '../../../aws-servicediscovery';
import { ValidationError } from '../../../core/lib/errors';

/**
 * Properties to initialize `HttpServiceDiscoveryIntegration`.
 */
export interface HttpServiceDiscoveryIntegrationProps extends HttpPrivateIntegrationOptions {
}

/**
 * The Service Discovery integration resource for HTTP API
 */
export class HttpServiceDiscoveryIntegration extends HttpPrivateIntegration {
  /**
   * @param id id of the underlying integration construct
   * @param service the service discovery resource to integrate with
   * @param props properties to configure the integration
   */
  constructor(
    id: string,
    private readonly service: servicediscovery.IService,
    private readonly props: HttpServiceDiscoveryIntegrationProps = {}) {
    super(id);
  }

  public bind(options: HttpRouteIntegrationBindOptions): HttpRouteIntegrationConfig {
    if (!this.props.vpcLink) {
      throw new ValidationError('The vpcLink property is mandatory', options.scope);
    }

    return {
      method: this.props.method ?? this.httpMethod,
      payloadFormatVersion: this.payloadFormatVersion,
      type: this.integrationType,
      connectionType: this.connectionType,
      connectionId: this.props.vpcLink.vpcLinkId,
      uri: this.service.serviceArn,
      secureServerName: this.props.secureServerName,
      parameterMapping: this.props.parameterMapping,
    };
  }
}
