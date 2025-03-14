import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as lambdaBase from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

export class Lambda extends Construct {
  public readonly rdsProxyLambda: lambda.NodejsFunction;
  public readonly lambdaSg: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, vpc: ec2.Vpc, rdsProxyEndpoint: string, dbSecret: secretsmanager.ISecret) {
    super(scope, id);

    // Lambda用セキュリティグループ
    this.lambdaSg = new ec2.SecurityGroup(this, 'LambdaSG', {
      vpc,
      description: 'Security group for Lambda function',
    });

    this.rdsProxyLambda = new lambda.NodejsFunction(this, 'RdsProxyLambda', {
      entry: path.resolve(__dirname, '../lambda/rds-proxy-lambda.ts'),
      handler: 'handler',
      runtime: lambdaBase.Runtime.NODEJS_20_X,
      vpc,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_ISOLATED },
      securityGroups: [this.lambdaSg],
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        RDS_PROXY_ENDPOINT: rdsProxyEndpoint,
        DB_SECRET_ARN: dbSecret.secretArn,
        NODE_OPTIONS: '--max-old-space-size=400',
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
