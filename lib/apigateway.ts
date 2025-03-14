import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';

export class ApiGateway extends Construct {
  constructor(scope: Construct, id: string, rdsProxyLambda: lambda.Function) {
    super(scope, id);

    const api = new apigateway.RestApi(this, 'ApiGateway');

    const rdsProxyResource = api.root.addResource('rds-proxy');
    rdsProxyResource.addMethod('GET', new apigateway.LambdaIntegration(rdsProxyLambda));

  }
}
