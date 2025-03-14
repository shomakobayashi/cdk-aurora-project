import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as lambdaBase from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';



export class Lambda extends Construct {
  public readonly rdsProxyLambda: lambda.NodejsFunction;

  constructor(scope: Construct, id: string, vpc: ec2.Vpc, rdsProxyEndpoint: string, dbSecret: secretsmanager.ISecret) {
    super(scope, id);

    this.rdsProxyLambda = new lambda.NodejsFunction(this, 'RdsProxyLambda', {
      entry: path.resolve(__dirname, '../lambda/rds-proxy-lambda.ts'),
      handler: 'handler',
      runtime: lambdaBase.Runtime.NODEJS_20_X,
      vpc,
      timeout: cdk.Duration.seconds(60),
      memorySize: 1024,
      environment: {
        RDS_PROXY_ENDPOINT: rdsProxyEndpoint,
        DB_SECRET_ARN: dbSecret.secretArn,
        NODE_OPTIONS: '--max-old-space-size=800',
      },
      bundling: {
        forceDockerBundling: false,
        minify: true,
        nodeModules: ['pg', 'aws-sdk'],
      }
    });

    dbSecret.grantRead(this.rdsProxyLambda);
  }
}
