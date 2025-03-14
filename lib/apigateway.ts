// apigateway.ts
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

export class ApiGateway extends Construct {
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, rdsProxyLambda: lambda.Function) {
    super(scope, id);

    // API Gateway
    this.api = new apigateway.RestApi(this, 'ApiGateway', {
      restApiName: 'Aurora RDS Proxy API',
      description: 'API for accessing Aurora via RDS Proxy',
      deployOptions: {
        stageName: 'prod',
        loggingLevel: apigateway.MethodLoggingLevel.OFF,
        metricsEnabled: true,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
        maxAge: cdk.Duration.days(1)
      }
    });

    // リソース
    const rdsProxyResource = this.api.root.addResource('rds-proxy');
    
    // GETメソッド
    rdsProxyResource.addMethod('GET', new apigateway.LambdaIntegration(rdsProxyLambda, {
      proxy: true,
      timeout: cdk.Duration.seconds(29)
    }), {
      apiKeyRequired: false,
      methodResponses: [
        {
          statusCode: '200',
          responseModels: {
            'application/json': apigateway.Model.EMPTY_MODEL
          }
        },
        {
          statusCode: '500',
          responseModels: {
            'application/json': apigateway.Model.ERROR_MODEL
          }
        }
      ]
    });

    // API エンドポイントを出力
    new cdk.CfnOutput(this, 'ApiEndpoint', {
      value: this.api.url,
      description: 'API Gateway Endpoint URL',
    });
  }
}
