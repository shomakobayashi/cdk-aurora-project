import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Vpc } from './vpc';
import { Aurora } from './aurora';
import { Lambda } from './lambda';
import { ApiGateway } from './apigateway';
import * as ec2 from 'aws-cdk-lib/aws-ec2';

export class MainStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // VPC の作成
    const vpc = new Vpc(this, 'MyVpc');

    // Aurora クラスターとRDSプロキシの作成
    const aurora = new Aurora(this, 'MyAurora', vpc.vpc);

    // Lambda関数の作成
    const lambdaConstruct = new Lambda(
      this, 'MyLambda',
      vpc.vpc,
      aurora.rdsProxy.endpoint,
      aurora.dbSecret,
      aurora.clusterArn
    );
    
    // API Gateway の作成
    const apiGateway = new ApiGateway(
      this,
      'MyApiGateway',
      lambdaConstruct.rdsProxyLambda,
      lambdaConstruct.dataApiLambda
    );

    // Aurora クラスから公開されたセキュリティグループを使用
    const rdsProxySecurityGroup = aurora.proxySg;
    
    // Lambda 関数のセキュリティグループを取得
    const lambdaSecurityGroup = lambdaConstruct.rdsProxyLambda.connections.securityGroups[0];

    // RDS プロキシのセキュリティグループに Lambda からの接続を許可
    rdsProxySecurityGroup.addIngressRule(
      lambdaSecurityGroup,
      ec2.Port.tcp(5432),
      'Allow Lambda to connect to RDS Proxy'
    );
  }
}
