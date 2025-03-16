import * as lambda from 'aws-cdk-lib/aws-lambda-nodejs';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';
import * as path from 'path';
import * as cdk from 'aws-cdk-lib';
import * as lambdaBase from 'aws-cdk-lib/aws-lambda';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as iam from 'aws-cdk-lib/aws-iam';

export class Lambda extends Construct {
  public readonly rdsProxyLambda: lambda.NodejsFunction;
  public readonly dataApiLambda: lambda.NodejsFunction;
  public readonly lambdaSg: ec2.SecurityGroup;
  
  constructor(scope: Construct, id: string, vpc: ec2.Vpc, rdsProxyEndpoint: string, dbSecret: secretsmanager.ISecret, clusterArn: string) {
    super(scope, id);

    // Lambda用セキュリティグループ
    this.lambdaSg = new ec2.SecurityGroup(this, 'LambdaSG', {
      vpc,
      description: 'Security group for Lambda function',
    });

    // RDS Proxy を使用する Lambda
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
      },

    });

    // Data API を使用する Lambda
    this.dataApiLambda = new lambda.NodejsFunction(this, 'DataApiLambda', {
      entry: path.resolve(__dirname, '../lambda/data-api-lambda.ts'),
      handler: 'handler',
      runtime: lambdaBase.Runtime.NODEJS_20_X,
      timeout: cdk.Duration.seconds(30),
      memorySize: 512,
      environment: {
        CLUSTER_ARN: clusterArn,
        DB_SECRET_ARN: dbSecret.secretArn,
        DATABASE_NAME: 'testdb',
        NODE_OPTIONS: '--max-old-space-size=400',
      },
      bundling: {
        forceDockerBundling: false,
        minify: true,
        nodeModules: ['aws-sdk', 'aws-xray-sdk-core'],
      },
      tracing: lambdaBase.Tracing.ACTIVE,
    });

    // 権限の設定
    dbSecret.grantRead(this.rdsProxyLambda);
    dbSecret.grantRead(this.dataApiLambda);
    
    // Data API の実行権限を付与
    this.dataApiLambda.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          'rds-data:ExecuteStatement',
          'rds-data:BatchExecuteStatement',
          'rds-data:BeginTransaction',
          'rds-data:CommitTransaction',
          'rds-data:RollbackTransaction'
        ],
        resources: [clusterArn],
      })
    );
  }
}
